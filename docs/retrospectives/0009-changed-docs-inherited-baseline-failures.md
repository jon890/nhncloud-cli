---
id: RETRO-0009
plan: 066-fix-logncrash-complete-export-preservation
date: 2026-08-31
phase: docs-verifier
status: 해결
category: 프로세스
promotion: 승격 안 함
---

# 변경 문서가 기존 검사 실패를 그대로 물려받았다

## 관찰

이번 계획에서 편집한 `AGENTS.md`, `docs/adr/INDEX.md`, `docs/code-architecture.md`, `docs/flow.md`, `docs/prd.md`가 기존 엠대시 때문에 파일 단위 가독성 검사를 통과하지 못했다.
또한 기존 ADR-025 제목이 다른 ADR과 다른 레벨이라 ADR Index 동기화 검사에서 누락됐다.

## 원인

planning 검증이 새 문장과 task 구조에 집중했고, 편집한 파일 전체가 저장소 문서 검사기를 통과하는지 확인하지 않았다.

## 영향

새 문서 자체는 정확해도 저장소가 요구하는 파일 단위 검증을 완료했다고 말할 수 없었다.

## 대응

검출된 엠대시를 쉬운 문장으로 바꾸고 ADR-025 제목 레벨을 다른 ADR과 맞춘다.

## 검증

변경한 전체 Markdown 문서가 한국어 검사기와 가독성 검사기를 통과했다.
ADR 파일, H1 제목과 Index 항목도 각각 34건으로 일치했고 docs-verifier가 재검증에서 `PASS`로 판정했다.

## 배운 점

문서 변경 검증은 추가한 줄만 보지 않고 편집한 파일 전체의 기준선까지 확인해야 한다.

## 후속

문서 파일 전체를 검사하라는 규칙이 이미 `AGENTS.md`에 있어 별도 planning 영향 표로 승격하지 않는다.
