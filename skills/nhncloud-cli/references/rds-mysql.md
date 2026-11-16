# RDS for MySQL 명령 안내

`rds-mysql` 명령군은 RDS for MySQL의 DB 인스턴스(생성, 수정, 재시작, 삭제 등 수명주기), DB 스키마, DB 사용자, 파라미터 그룹, 바이너리 로그, 스토리지, 백업(생성·삭제·내보내기·설정 변경), 복원, 인증서, 로그 파일, 고가용성을 다룬다.
쓰기는 모두 `--yes`가 없으면 미리보기다. 대부분 비동기 작업이라 `--wait`로 완료까지 기다릴 수 있다.

## 인증과 설정

공통 UAK와 RDS for MySQL `appKey`가 필요하다. 프로젝트 통합 appkey도 쓸 수 있다.
`nhncloud configure --rds-mysql-appkey <appkey>`로 profile의 `rds-mysql.appkey`를 설정한다.

- UAK로 OAuth 토큰을 받아 `X-NHN-AUTHORIZATION`으로 보낸다. 토큰은 다른 OAuth 서비스와 같은 캐시를 쓴다. API는 v4.0이다.
- 일반망의 `--region`은 `kr1`(기본), `kr2`, `jp1`이다.
- 공공망은 profile의 `"environment": "gov"`로 고르고 `kr1`만 받는다. 다른 region은 API를 호출하기 전에 종료 코드 3이다.
- 프로젝트 권한 `RDS for MySQL VIEWER`는 조회 명령만 쓸 수 있다.
- 모든 명령이 `RDS for MySQL API 오류 (500)`으로 끝나면 먼저 appkey를 확인한다. RDS for MySQL이 인식하지 못하는 appkey여도 서버는 이 오류를 돌려준다.

## 명령 탐색

정확한 명령 경로와 옵션은 `nhncloud commands --json`에서 확인한다.
ID 인자는 이름이 아니라 UUID만 받는다. 목록에서 ID를 찾아 다음 명령에 넘긴다.

```bash
nhncloud rds-mysql instance list
nhncloud rds-mysql schema list <db-instance-id>
nhncloud rds-mysql user list <db-instance-id>
nhncloud rds-mysql user update <db-instance-id> <db-user-id> --authority crud          # 미리보기
nhncloud rds-mysql user delete <db-instance-id> <db-user-id>                           # 미리보기
nhncloud rds-mysql job get <job-id>
nhncloud rds-mysql parameter-group list [--name <text>] [--db-version <version>] [--page <n>] [--size <n>]
nhncloud rds-mysql parameter-group get <parameter-group-id> [--parameter <text>]
nhncloud rds-mysql binlog list <db-instance-id> [--deletable]
nhncloud rds-mysql storage get <db-instance-id>
nhncloud rds-mysql backup-info get <db-instance-id>
nhncloud rds-mysql backup list [--instance <db-instance-id>] [--type auto|manual] [--db-version <version>] [--page <n>] [--size <n>]
nhncloud rds-mysql backup get <backup-id>
nhncloud rds-mysql restore info <db-instance-id>
nhncloud rds-mysql certificate list <db-instance-id>
nhncloud rds-mysql log-file list <db-instance-id> [--type error|binlog|general|slow-query|audit|backup]
nhncloud rds-mysql log-file get <db-instance-id> <log-file-name> --type error [--output-file <path>]
nhncloud rds-mysql ha get <db-instance-id>
nhncloud rds-mysql instance network <db-instance-id>
nhncloud rds-mysql instance maintenances <db-instance-id> [--type <type>] [--status <statuses>] [--category <category>]
nhncloud rds-mysql flavor list
nhncloud rds-mysql db-version list
nhncloud rds-mysql storage types
nhncloud rds-mysql subnet list
nhncloud rds-mysql availability-zone list
nhncloud rds-mysql project regions
nhncloud rds-mysql project members
```

인스턴스·스키마·사용자 목록 API에는 페이지가 없어 한 번의 응답을 그대로 출력한다. `parameter-group list`와 `backup list`는 `--page`, `--size`(1~100, 기본 20)를 받고, 전체 개수가 더 많으면 stderr에 안내한다. 빈 목록도 성공이다.

`--quiet`가 출력하는 값은 다음과 같다.

- `instance list`·`instance get`: `dbInstanceId`
- `schema list`: `dbSchemaName`
- `user list`: `dbUserId`
- `job get`: `jobStatus`
- `parameter-group list`: `parameterGroupId`, `parameter-group get`: `parameterName`
- `binlog list`: `binLogFileName`, `backup list`: `backupId`, `ha get`: `haStatus`, `backup-info get`: `backupPeriod`, `storage get`: `storageSize`, `backup get`: `backupId`, `restore info`: 복원 가능한 `backupId`, `certificate list`·`log-file list`: 파일 이름
- `flavor list`: `dbFlavorId`, `db-version list`: `dbVersion`, `storage types`: 유형 이름, `subnet list`: `subnetId`, `availability-zone list`: 이름, `project regions`: `regionCode`, `project members`: `memberId`, `instance maintenances`: `maintenanceId`, `instance network`: 접속 도메인
- `parameter-group copy`: 요청했을 때만 새 `parameterGroupId`
- 작업을 요청하는 쓰기(`schema create`, `user create`·`update`·`delete`, `instance set-parameter-group`, `instance rebuild`, `instance create`·`replicate`·`modify`·`start`·`stop`·`restart`·`promote`·`delete`·`enable-public-access`·`disable-public-access`, `storage expand`, `ha pause`·`resume`·`repair`·`split`, `backup create`·`delete`·`export`·`restore`, `backup-info update`, `restore point-in-time`·`from-object-storage`, `certificate export`, `log-file export`): 요청했을 때만 `jobId`. 미리보기와 변경 없음은 아무것도 출력하지 않는다.

## 쓰기 명령

`schema create`, `user create`, `user update`, `user delete`는 같은 규칙을 따른다.

```bash
nhncloud rds-mysql schema create <db-instance-id> --name <schema>                        # 미리보기
nhncloud rds-mysql schema create <db-instance-id> --name <schema> --yes --wait           # 반영하고 완료까지 대기
nhncloud rds-mysql user create <db-instance-id> --name <user> --host '10.0.0.%' --authority crud --password-file ./pw.txt
printf '%s' "$DB_PASSWORD" | nhncloud rds-mysql user create <db-instance-id> --name <user> --host '10.0.0.%' --authority crud --yes --wait --timeout 600
```

- `--yes`가 없으면 미리보기다. 보낼 내용을 출력하고 종료 코드 0으로 끝나며 쓰기 요청은 보내지 않는다.
- 미리보기도 사전 검사를 한다. 같은 이름의 스키마나 같은 `이름@host` 사용자(host는 대소문자 무시, 이름은 정확히 일치)가 이미 있거나, 바꾸거나 지울 `dbUserId`가 목록에 없거나, 인스턴스가 지원하지 않는 인증 플러그인을 지정하면 종료 코드 3이다.
- 사전 검사는 사용자 상태(`dbUserStatus`)도 본다. `user create`는 `DELETED` 사용자를 중복으로 보지 않고, 같은 사용자를 지우는 중(`DELETING`)이면 종료 코드 3이다. `user update`와 `user delete`는 대상이 `STABLE`이 아니면 종료 코드 3이다. `user list`로 `STABLE`이 된 것을 확인하고 다시 실행한다.
- 권한이 이미 같으면 `--yes`를 줘도 요청하지 않고 변경 없음으로 끝난다.
- 쓰기 응답은 `jobId`뿐이다. `--wait`를 주면 작업 상태를 3초 간격으로 조회하고, 대기 상한은 기본 300초다. `--timeout <sec>`(1~3600)은 `--wait`와 함께만 쓴다.
- `--wait` 없이 요청한 작업은 `rds-mysql job get <job-id>`로 확인한다.
- 비밀번호는 `--password-file`이나 표준 입력으로만 받는다. `--password` 인수는 없다. 끝 줄바꿈(`\n` 또는 `\r\n`) 하나를 지우고 4자 이상 256자 이하인지 본다. 파일이나 표준 입력 앞에 BOM이 있으면 종료 코드 3이므로 BOM 없는 UTF-8로 넘긴다. 터미널에서 입력 없이 실행하면 묻지 않고 종료 코드 3이다. 비밀번호는 어떤 출력에도 나오지 않는다.
- `user create`는 `--yes` 없는 미리보기에서도 비밀번호를 받아 검사한다. 미리보기와 반영이 같은 검사를 하게 하려는 것이므로, 미리보기만 볼 때도 `--password-file`이나 표준 입력을 넘긴다.
- 셸 이력에 남지 않도록 `echo` 대신 `printf '%s' "$DB_PASSWORD" |`나 파일을 쓴다.
- `--auth-plugin`(`native`, `caching-sha2`, `sha256`)과 `--tls`(`none`, `ssl`, `x509`)는 `user create`에서만 받는다. 인스턴스가 지원하지 않으면(MySQL 5.7.33 미만) 종료 코드 3이다.
- `user update`는 권한만 바꾼다. 현재 TLS 옵션을 읽어 함께 보내고, 인증 플러그인과 비밀번호는 보내지 않는다. 인스턴스가 인증 플러그인을 지원하지 않으면 TLS 옵션도 보내지 않는다. 결과의 `authenticationPlugin`과 `tlsOption`은 보낸 값이라, `authenticationPlugin`은 늘 `null`이다. 현재 값은 `user list`로 본다.
- 인증 플러그인은 비밀번호를 바꿀 때만 바뀐다(콘솔 가이드: 「사용자 인증에 적용할 플러그인을 변경하려면 반드시 Password를 변경해야 합니다」). 비밀번호 변경, 인증 플러그인 변경, 사용자 정의 권한은 콘솔에서 한다.
- 현재 권한이 `CUSTOM`인 사용자를 `user update`로 바꾸면 `CUSTOM`으로 되돌릴 수 없다. 실행 전에 stderr 경고를 확인한다.
- 권한은 `read`, `crud`, `ddl`, `all`만 받는다. `CUSTOM`은 받지 않는다.
- 이름과 host는 요청 전에 검사하고, 어기면 종료 코드 3이다.
  - 스키마 이름: 영문으로 시작하고 영문, 숫자, `_`로 된 64자 이하. `information_schema`, `performance_schema`, `db_helper`, `sys`, `mysql`, `rds_maintenance`(대소문자 무시)는 쓸 수 없다. MySQL 예약어(예: `select`, `order`)는 CLI가 검사하지 않고 서버가 거절한다. 미리보기는 통과한다. 서버가 쓰기 요청 단계에서 거절하면 종료 코드 1이고, 접수한 뒤 작업을 실패로 끝내면 `--wait`에서 종료 코드 1이다. 어느 쪽인지는 실호출로 확인하지 않았다.
  - 사용자 이름: 1자 이상 32자 이하이고 제어 문자가 없어야 한다. `mysql.session`, `mysql.sys`, `mysql.infoschema`, `sqlgw`, `admin`, `etladm`, `alertman`, `prom`, `rds_admin`, `rds_mha`, `rds_repl`은 쓸 수 없다.
  - host: 공백 없는 45자 이하. `%`로 범위를 지정한다(예: `10.0.0.%`).
- DB 인스턴스가 다른 작업을 진행 중이면(`progressStatus`가 `NONE`이 아니면) stderr에 경고하고 계속한다.

## 권한 범위

`read`, `crud`, `ddl`, `all`은 인스턴스의 모든 스키마(`*.*`)에 적용된다. 스키마 하나로 좁히는 API는 없다.
콘솔 가이드의 GRANT 문이 모두 `ON *.*`이라 `crud`도 `mysql` 같은 시스템 스키마까지 쓰기 권한을 준다.

스키마 하나로 좁히려면 `read`나 `crud`로 만든 뒤 DB에 접속해 `*.*` 권한을 `REVOKE`하고 `GRANT ... ON <schema>.*`를 직접 실행한다.

```sql
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '<user>'@'<host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON `<schema>`.* TO '<user>'@'<host>';
```

`GRANT`에는 필요한 권한만 나열한다. 예시는 `crud`에 해당하고, `read`라면 `SELECT`만 준다.
이렇게 바꾼 권한이 그 뒤 콘솔과 `user list`에 `CUSTOM`으로 보이는지, RDS가 권한을 다시 덮어쓰지 않는지는 실호출로 확인하지 않았다.
CLI가 DB에 접속해 권한을 관리하지는 않는다.

## 실패와 재실행

| 상황 | 종료 코드 | 할 일 |
|------|-----------|-------|
| 인수 형식 오류, 빈 비밀번호, 지원하지 않는 region, 사전 검사 실패(이미 있음, `dbUserId` 없음, 사용자가 `STABLE` 아님, 인증 플러그인 미지원) | 3 | 요청이 나가지 않았다. 입력을 고쳐 다시 실행한다. |
| UAK 인증 실패나 권한 없음(`resultCode` 401·403·80401·80403, HTTP 401·403) | 2 | UAK와 프로젝트 권한을 확인한다. |
| 서버가 쓰기 요청을 실패로 알림(HTTP 5xx 제외) | 1 | 서버 메시지의 원인을 고쳐 다시 실행한다. |
| 쓰기 요청의 HTTP 5xx, 시간 초과, 연결 오류, 응답 형식 오류 | 1 | 접수 여부를 알 수 없다. 다시 실행하기 전에 `schema list`나 `user list`로 반영 여부를 확인한다. |
| `--wait` 중 작업이 `FAILED` 등 실패 상태로 끝남 | 1 | 작업이 실패했다. 원인을 확인해 고친 뒤 다시 실행한다. |
| `--wait`의 결과 불확정(`COMPLETED_WITH_ERROR`, `DELETED`), 대기 상한 초과, 상태 조회 실패 | 1 | 다시 실행하지 않는다. `job get <job-id>`와 목록으로 확인한다. 작업은 계속 진행 중일 수 있다. |

위 표의 종료 코드 1은 모두 같은 값이다. 자동화에서는 다음 순서로 가른다.

- stdout이 비어 있으면 쓰기 요청 단계에서 끝났다. stderr에 `주의: 요청이 접수됐는지 알 수 없습니다`가 있으면 접수 여부 불명이고, 없으면 서버가 알린 실패다.
- `--json` 결과의 `applied`가 `true`면 요청은 접수됐다. `jobStatus`가 ADR-047의 실패 상태(`FAILED` 등)면 원인을 고쳐 다시 실행한다.
- 그 밖의 `jobStatus`(`COMPLETED_WITH_ERROR`, `DELETED`, 대기 상한을 넘겼을 때의 마지막 진행 상태)나 `null`(상태 조회 실패)이면 결과가 불확정이다. 다시 실행하지 않고 `job get`으로 확인한다.

결과를 모르는 실패 뒤에 같은 생성 명령을 다시 실행하면 사전 검사가 이미 있는 대상을 종료 코드 3으로 막아 중복 생성을 피한다.
`--wait`가 실패해도 `jobId`가 담긴 결과는 먼저 출력한다.
작업 상태 값의 해석은 공식 문서가 불완전하다. 성공은 `COMPLETED` 하나뿐이고, 모르는 상태는 진행 중으로 보고 상한까지 기다린다.

## 파라미터 그룹, 바이너리 로그, 스토리지, 고가용성

콘솔에서만 하던 용량 정리와 파라미터 변경을 같은 쓰기 규칙으로 한다. 쓰기는 모두 `--yes`가 없으면 미리보기다.

```bash
nhncloud rds-mysql binlog list <db-instance-id>                                     # 번호순 목록과 합계
nhncloud rds-mysql binlog purge <db-instance-id> --before mysql-bin.000010          # 미리보기: 지울 파일 수·크기 합
nhncloud rds-mysql binlog purge <db-instance-id> --before mysql-bin.000010 --yes
nhncloud rds-mysql parameter-group copy <parameter-group-id> --name <new-name> --yes
nhncloud rds-mysql parameter-group set-parameters <parameter-group-id> --set binlog_expire_logs_seconds=86400 --yes
nhncloud rds-mysql instance set-parameter-group <db-instance-id> --parameter-group-id <id> --yes --wait
nhncloud rds-mysql storage expand <db-instance-id> --size 300 --yes --wait
nhncloud rds-mysql ha repair <db-instance-id> --yes --wait
nhncloud rds-mysql instance rebuild <db-instance-id> --yes --wait
```

- `parameter-group copy`, `set-parameters`, `reset`과 `binlog purge`는 응답에 작업이 없어 `--wait`가 없다. 요청이 접수되면 반영된 것으로 보고 `parameter-group get`이나 `binlog list`로 확인한다.
- `set-parameters`는 파라미터 그룹의 값만 바꾼다. 연결된 DB 인스턴스에는 자동으로 적용되지 않고 그룹이 `NEED_TO_APPLY`가 된다. 콘솔의 「파라미터 그룹 변경 사항 적용」(유지 관리)으로 적용하며, 재시작이 필요한 파라미터는 적용할 때 DB 인스턴스가 재시작된다. 미리보기는 바뀌는 항목만 전후 값과 적용 유형을 보인다. `applyType`의 `FILE`은 재시작 필요, `BOTH`는 동적, `SESSION`은 세션 단위로 풀어 쓰며 API가 뜻을 밝히지 않아 「추정」이라고 표시한다.
- `set-parameters --set`은 `이름=값`이고 여러 번 쓸 수 있다. 없는 파라미터, 수정할 수 없는 파라미터(`updateType` `CONSTANT`), 형식 오류는 종료 코드 3이다. 값이 이미 같으면 요청하지 않는다.
- `parameter-group reset`은 기본값과 다른 항목만 되돌린다. 이전 값을 복구하는 API가 없으므로 필요하면 먼저 `copy`로 복사본을 만든다.
- `instance set-parameter-group`은 파라미터 그룹만 바꾸며 재시작이 따를 수 있다. 엔진 버전이 다르면 종료 코드 3이다.
- `binlog purge --before <파일>`은 그 파일을 남기고 직전까지 지운다. 지운 파일은 되돌릴 수 없고 특정 시점 복원이 안 될 수 있으며, 복제본이 읽지 않은 파일을 지우면 복제가 중단될 수 있다. 파일이 없으면 종료 코드 3이다.
- `storage expand --size <GB>`는 늘리기만 한다. 현재보다 작으면 종료 코드 3이고 2048GB를 넘기면 요청 전에 막는다. 스토리지 자동 확장을 쓰고 있으면 현재 설정을 함께 보낸다.
- `ha pause`는 자동 장애 조치를 멈추므로 끝나면 `ha resume`으로 되돌린다. `ha repair`는 장애 조치된 Primary를 복구하고, 실패하면 `instance rebuild`로 재구축한다. `ha split`은 되돌리기 어렵다.
- `instance rebuild`는 `FAILED_MASTER`, `CANDIDATE_MASTER`, `READ_ONLY_SLAVE`에만 한다. 대상의 모든 데이터베이스를 지우고 Primary에서 다시 만든다. 정상 Primary는 종료 코드 3이다.
- 목록과 상세 조회로 바뀐 값을 확인한다. 다른 작업이 진행 중이면(`progressStatus`가 `NONE`이 아니면) stderr에 경고한다.

## DB 인스턴스 수명주기

모두 `--yes`가 없으면 미리보기이고, 작업을 받는 명령은 `--wait`로 기다린다. 미리보기도 DB 인스턴스 상태를 읽어 사전 검사를 한다.

```bash
nhncloud rds-mysql flavor list                      # --flavor-id 에 넣을 사양
nhncloud rds-mysql subnet list                      # --subnet-id
nhncloud rds-mysql availability-zone list           # --availability-zone
nhncloud rds-mysql storage types                    # --storage-type
nhncloud rds-mysql instance create --name <name> --flavor-id <id> --db-version MYSQL_V8411 --port 3306 \
  --user-name <db-admin> --password-file ./pw.txt --parameter-group-id <id> --subnet-id <id> --availability-zone kr-pub-a \
  --storage-type "General SSD" --storage-size 20 --backup-period 7 --backup-schedule 02:00@1h        # 미리보기
nhncloud rds-mysql instance replicate <primary-id> --name <replica> --availability-zone kr-pub-b --yes --wait
nhncloud rds-mysql instance modify <db-instance-id> --description <text> --slow-query-analysis --yes
nhncloud rds-mysql instance restart <db-instance-id> --online-failover --backup --yes --wait
nhncloud rds-mysql instance disable-deletion-protection <db-instance-id> --yes
nhncloud rds-mysql instance delete <db-instance-id> --yes --wait
```

- 명령: `create`, `replicate`, `modify`, `start`, `stop`, `restart`, `promote`, `delete`, `enable-deletion-protection`, `disable-deletion-protection`, `enable-public-access`, `disable-public-access`. 조회는 `network`, `maintenances`다.
- `create`: 필수는 `--name`, `--flavor-id`, `--db-version`, `--port`, `--user-name`, `--parameter-group-id`, `--subnet-id`, `--availability-zone`, `--storage-type`, `--storage-size`, `--backup-period`, `--backup-schedule`(하나 이상)이다. DB 사용자 비밀번호는 `user create`처럼 `--password-file`이나 표준 입력으로만 받고 어디에도 출력하지 않는다. 고가용성은 `--high-availability`와 `--candidate-name`(필수), `--ping-interval`이다. 스토리지 자동 확장은 `--autoscale`에 `--autoscale-threshold`(50~95), `--autoscale-max-size`(4096 이하), `--autoscale-cooldown`(10~1440)을 모두 준다. 백업 스케줄은 `HH:MM[:SS]@window`(window: `30m`, `1h`, `1h30m`, `2h`, `2h30m`, `3h`)다. 사양, 서브넷, 엔진 버전, 스토리지 유형이 목록에 없거나 파라미터 그룹의 엔진 버전이 다르면 종료 코드 3이다.
- `replicate`: Primary(`MASTER`)에서만 한다. `--name`과 `--availability-zone`만 필수이고 나머지는 서버 기본값을 따른다. 스토리지·백업 옵션은 `create`와 같다.
- `modify`: 이름(`--name`), Standby 이름(`--candidate-name`), `--description`, `--port`, `--flavor-id`, `--slow-query-analysis`·`--no-slow-query-analysis`, `--security-group-id`(여러 번, 현재 목록을 대체)만 받는다. 파라미터 그룹은 `instance set-parameter-group`으로 바꾼다. 현재 값과 같은 항목은 보내지 않고 모두 같으면 요청하지 않는다. 포트와 사양을 바꾸면 재시작이 따를 수 있다. `--backup`, `--online-failover`, `--wait-replication-delay`, `--read-only`는 재시작이 따를 때의 동작이다.
- `restart`: `--online-failover`(고가용성만), `--backup`, `--wait-replication-delay`, `--read-only`, `--os-restart`를 받는다. `--force`는 MySQL이 정상 동작하지 않을 때 쓰는 강제 재시작이다. 10분 안에 종료하지 않으면 가상 머신을 강제로 재부팅해 일부 트랜잭션이 유실되고 데이터 볼륨이 손상될 수 있다. 고가용성 DB 인스턴스는 `--force`를 쓸 수 없고(종료 코드 3), 다른 재시작 옵션과 `--wait`를 함께 쓸 수 없다. 응답에 작업이 없어 `instance get`으로 상태를 본다.
- `start`는 중지된 DB 인스턴스를, `stop`은 사용 가능한 DB 인스턴스를 대상으로 한다. 이미 원하는 상태면 요청하지 않는다. 정지하면 접속할 수 없고 고가용성은 일시 중지된다.
- `promote`: 읽기 복제본(`READ_ONLY_SLAVE`)만 한다. Primary 와의 복제가 끊기고 되돌릴 수 없다. 복제 지연이 있으면 해소될 때까지 승격되지 않을 수 있다.
- `delete`: 복구할 수 없다. 삭제 보호가 켜져 있으면 요청 전에 종료 코드 3이고 `disable-deletion-protection`을 안내한다. Primary 를 지우면 Standby 와 읽기 복제본도 함께 지워진다. 자동 백업은 기본으로 남기고 `--delete-auto-backup`이면 함께 지운다.
- `enable-deletion-protection`·`disable-deletion-protection`: 같은 값이면 요청하지 않는다. 응답에 작업이 없어 `--wait`가 없다. 서버 오류로 끝나면 다시 읽어 반영됐는지 확인하고, 반영됐으면 종료 코드 0과 경고로 알린다(`--json`의 `verifiedAfterError`).
- `enable-public-access`·`disable-public-access`: 외부 접속 허용 여부를 응답에서 읽을 수 없어 현재 값과 비교하지 않고 서버에 맡긴다. `instance network`로 접속 정보를 본다.
- `maintenances`는 목록 조회만 한다. 유지 관리 실행과 예약, 파라미터 그룹 변경 적용은 콘솔에서 한다.
- 공공망(`environment: gov`)에서 빠진 명령은 없다. v4.0 경로가 일반망과 같다.

## 백업, 복원, 인증서, 로그 파일

모두 `--yes`가 없으면 미리보기이고 작업을 받는 명령은 `--wait`로 기다린다. 실호출로 확인하지 않은 쓰기 본문은 공식 문서 기준이다.

```bash
nhncloud rds-mysql backup create --name nightly --method full --instance <db-instance-id> --yes --wait
nhncloud rds-mysql backup create --name inc1 --method incremental --base-backup <backup-id> --yes
nhncloud rds-mysql backup delete <backup-id> --yes
nhncloud rds-mysql backup export <backup-id> --tenant-id <32자리> --username <계정> --container <컨테이너> --object-path <경로> --password-file ./obs-pw.txt --yes
nhncloud rds-mysql backup-info update <db-instance-id> --backup-period 14 --backup-schedule 02:00@1h --yes
nhncloud rds-mysql backup restore <backup-id> --name restored --yes --wait
nhncloud rds-mysql restore info <db-instance-id>                                    # 복원 가능한 시간 범위와 백업
nhncloud rds-mysql restore point-in-time <db-instance-id> --name restored --time 2026-01-31T09:00:00+09:00 --yes --wait
nhncloud rds-mysql restore from-object-storage --name restored --db-version MYSQL_V8411 --flavor-id <id> --port 3306 \
  --parameter-group-id <id> --subnet-id <id> --availability-zone kr-pub-a --storage-type "General SSD" --storage-size 20 \
  --backup-period 7 --backup-schedule 02:00@1h --tenant-id <32자리> --username <계정> --container <컨테이너> --object-path <경로> --password-file ./obs-pw.txt
nhncloud rds-mysql certificate export <db-instance-id> --type ca --tenant-id <32자리> --username <계정> --container <컨테이너> --object-path <경로> --password-file ./obs-pw.txt
nhncloud rds-mysql log-file export <db-instance-id> --file <log-file-name> --tenant-id <32자리> --username <계정> --container <컨테이너> --object-path <경로> --password-file ./obs-pw.txt
```

- `backup create --method`는 `full`, `snapshot`(`--instance`), `incremental`(`--base-backup`)이다. 맞지 않는 조합은 종료 코드 3이다. 수동 백업은 직접 지울 때까지 남아 비용이 든다.
- `backup delete`는 복구할 수 없고, 이 백업을 기준으로 한 시점 복원이나 증분 백업이 안 될 수 있다.
- `backup-info update`는 `--backup-period`(0~730), `--backup-retry-count`(0~10), `--ftwrl-wait-timeout`(0~21600), `--backup-region`, `--backup-lock`·`--no-backup-lock`, `--backup-schedule`(여러 번)만 받고 지정한 항목 중 현재 값과 다른 것만 보낸다. 모두 같으면 요청하지 않는다. 보관 기간을 줄이면 경고한다.
- 복원 명령 세 가지(`backup restore`, `restore point-in-time`, `restore from-object-storage`)는 원본을 바꾸지 않고 새 DB 인스턴스를 만든다. `--name`만 필수이고 사양(`--flavor-id`), 포트, 파라미터 그룹, 서브넷, 가용성 영역, 스토리지, 백업 설정, 고가용성, 보안 그룹은 지정한 것만 보내며 나머지는 원본 값을 따른다. 오브젝트 스토리지에서 복원은 원본이 없어 이 값들을 모두 지정한다. 스토리지·백업·고가용성 옵션은 `instance create`와 같다.
- `restore point-in-time --time`은 시간대가 있는 ISO 8601(`2026-01-31T09:00:00+09:00`, `...Z`)이다. `restore info`의 범위 밖이면 종료 코드 3이다. `--time`을 생략하면 복원 가능한 가장 최근 시점이다. 바이너리 로그 복원은 `--backup-id`, `--binlog-file`, `--binlog-position`을 모두 준다.
- 오브젝트 스토리지 API 비밀번호는 `--password-file`이나 표준 입력으로만 받고 어디에도 출력하지 않는다. `--tenant-id`는 32자리 16진수여야 한다. 같은 경로의 기존 파일을 덮어쓸 수 있으니 `--object-path`를 확인한다.
- `certificate list`는 CA·인증서·키 파일 목록이다. `certificate export --type`은 `ca`, `cert`, `key`(여러 번)이며 `key`는 경고한다.
- `log-file get`은 한 번에 65533바이트까지만 받는다. 기본은 표준 출력(제어 문자 치환)이고 `--output-file`은 새 파일에 `0600`으로 쓰며 이미 있으면 종료 코드 3이다. `--json`은 `content`와 `truncated`를 담는다. 한도에 닿으면 `log-file export`를 쓴다.
- 공공망(`environment: gov`)에서 빠진 명령은 없다. v4.0 경로가 일반망과 같다.
