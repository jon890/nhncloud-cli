---
id: empty-result-stderr-wrong
category: code-review
title: "정상 빈 결과" 를 stderr 로 출력하거나 조기 반환에서 출력 모드 분기를 빠뜨림
triggers: [빈 결과, stderr, stdout, early return, quiet mode]
tool_catchable: false
source: [PR40]
related: []
---

**증상**: 목록이 0 개인 **정상 빈 상태** 메시지를 `process.stderr.write` 로 보냄. AGENTS.md 컨벤션은 `데이터=stdout / 에러·진행로그=stderr`. 빈 결과는 에러가 아니므로 stderr 위반 + 자동화 파이프 처리 어색함.
빈 결과를 조기 반환(early return)으로 처리하면서 `--json` 분기만 추가하고 `--quiet` 분기를 빠뜨리는 변형도 있다. `--quiet` 인데 "없습니다." plain text 가 stdout 에 나와 자동화 스크립트 parse 가 깨진다.

**Good**: 빈 결과도 `src/formatters/table.ts` 의 `output()` 을 거치게 한다. 빈 `rows` 는 `printTable` 이 stdout 에 `결과 없음` 으로 출력하고, `--json` 은 raw 데이터, `--quiet` 은 `ids` 가 비면 무출력이다.
조기 반환이 꼭 필요하면 `--json` 과 `--quiet` 분기를 둘 다 둔다.

**검출**:

```bash
grep -rnE 'stderr\.write.*없음|stderr\.write.*empty' src/commands/
# 조기 반환 블록에 json 분기만 있고 quiet 분기가 없는 곳
grep -B2 -A5 "return;" src/commands/**/*.ts | grep -A5 "globalOpts.json" | grep -v "globalOpts.quiet"
```

**Self-check**: 빈 결과 경로가 `--json`·`--quiet`·기본 출력 세 모드에서 각각 stdout 계약을 지키는가? 조기 반환 블록에 `globalOpts.json` 이 있으면 `globalOpts.quiet` 도 있는가?

**Why**: 빈 결과 경로는 테스트에서 자주 빠져, 컨벤션 위반이 리뷰에서야 드러난다. 조기 반환은 모드 분기를 한 곳에서 처리하던 `output()` 을 우회하므로 분기가 누락되기 쉽다.
