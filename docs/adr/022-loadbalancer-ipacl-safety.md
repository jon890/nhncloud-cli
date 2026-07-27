# ADR-022: Load Balancer IP ACL 전체 교체·자동 재바인딩·부분 실패 복구

## 결정

- Load Balancer 적용은 기존 그룹을 입력 목록으로 전부 교체하며, `set-ipacl`과 빈 목록을 쓰는 `clear-ipacl`을 분리한다.
- IP ACL 대상 추가·삭제 뒤에는 관련 Load Balancer를 기본으로 재바인딩하고, `--no-rebind`로만 생략한다.
- 대상 변경 전에 각 Load Balancer의 전체 그룹 목록을 저장하고, 변경 뒤 모든 Load Balancer에 재적용한다.
  일부가 실패해도 나머지는 계속 시도한다.
- 부분 실패 시 대상 변경을 자동 원복하지 않는다.
  성공·실패 Load Balancer와 원래 그룹 목록, 재시도 명령을 구조화해 반환하고 실패 종료 코드를 사용한다.

## 맥락

공식 API의 `bind_ipacl_groups`는 기존 그룹을 입력 목록으로 전부 교체하며, 그룹들의 action도 모두 같아야 한다.
실제 운영에서는 IP ACL 대상을 추가하거나 삭제해도 이미 적용된 Load Balancer 규칙이 자동 갱신되지 않거나, 목록과 실제 접근 상태가 달라질 수 있었다.
같은 그룹 목록을 다시 적용하면 복구됐지만 반영 시점은 Load Balancer마다 달랐고, ALLOW 그룹에 VPC 사설 대역이 없으면 서비스 접근이 전부 차단될 수 있었다.
이 제약은 조회 응답만으로 확인할 수 없어 단순 CRUD 성공을 실제 접근 제어 성공으로 간주할 수 없다.

## 대안 기각

- 대상만 변경하고 경고만 출력: 자동화가 경고를 놓치면 규칙이 적용되지 않은 상태가 지속된다.
- 첫 재바인딩 실패에서 중단: 뒤의 Load Balancer까지 오래된 규칙으로 남겨 부분 실패 범위를 키운다.
- 대상 변경 자동 원복: 삭제한 대상을 다시 만들면 ID가 달라지고, 원복과 재바인딩도 다시 일부 실패할 수 있어 상태가 더 불명확해진다.
- 고정 대기 또는 조회 API 폴링: 조회 상태는 실제 데이터 경로 성공을 증명하지 못한다.
- 일반 Load Balancer 수정 API로 IP ACL 필드 갱신: 해당 필드는 응답 전용이며 전용 바인딩 API만 변경을 허용한다.

## 적용 범위

공식 계약은 [Load Balancer API 가이드](https://docs.nhncloud.com/ko/Network/Load%20Balancer/ko/public-api/#ip-acl_6), 실측 제약과 명령 계약은 `docs/flow.md`가 소유한다.
