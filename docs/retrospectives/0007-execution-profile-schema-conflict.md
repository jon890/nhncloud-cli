---
id: RETRO-0007
plan: 066-fix-logncrash-complete-export-preservation
date: 2026-08-31
phase: critic
status: 해결
category: 프로세스
promotion: 승격 안 함
---

# 실행 등급 필드를 두 스키마로 중복 작성했다

## 관찰

task의 `index.json`은 legacy `model` 필드를 사용했지만 phase 문서는 `Execution profile`을 사용했다.
critic이 두 필드를 함께 해석할 수 없는 스키마 충돌로 판정해 구현 착수를 막았다.

## 원인

planning에서 최근 `execution_profile` task보다 legacy `model`을 쓰는 예시를 따라갔다.
task 파일과 phase 문서가 같은 실행 등급 스키마를 쓰는지 교차 검사하지 않았다.

## 영향

executor 라우팅이 실행 등급을 추측해야 하는 상태가 됐다.
추측해서 진행하면 계획한 `deep` 실행을 더 낮은 등급으로 처리할 수 있었다.

## 대응

phase 객체의 `model`을 제거하고 phase 문서와 같은 `execution_profile` 값으로 교체했다.
phase 1은 `deep`, phase 2는 `standard`로 고정했다.

## 검증

critic 재평가와 `executor_routing_gate.py`를 다시 실행해 스키마 충돌이 사라졌는지 확인한다.

## 배운 점

task 생성 검증은 phase 개수와 파일 존재뿐 아니라 실행 등급 필드가 한 스키마로 통일됐는지도 검사해야 한다.

## 후속

`executor_routing_gate.py`가 같은 스키마 충돌을 이미 결정적으로 차단하므로 새 반복 함정으로 승격하지 않는다.
