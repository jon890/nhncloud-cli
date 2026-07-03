# Phase 01 — 공개 skill reference 분리

## 목표

Issue #45의 첫 단계다.
842줄 단일 파일인 `skills/nhncloud-cli/SKILL.md`를 얇은 router로 줄이고, 서비스별 세부 지침은 reference 파일로 분리한다.

CLI 동작은 변경하지 않는다.
이 phase는 공개 skill 문서 구조만 바꾼다.

## 현재 근거

현재 공개 skill 파일은 하나뿐이다.

```text
skills/nhncloud-cli/SKILL.md
```

`skills/nhncloud-cli/SKILL.md`는 842줄이며, 다음 정보가 한 파일에 섞여 있다.

- 설치와 configure
- 출력 모드와 JSON shape
- logncrash
- deploy
- instance, network, volume, floatingip
- ncr
- nks
- 에러 코드와 자동화 시나리오

NKS, NCR, 이후 NCS 같은 서비스가 늘어나면 agent가 필요 없는 서비스 설명까지 함께 로드한다.

## 설계 결정

공개 skill은 하나만 유지한다.
여러 skill로 쪼개지 않고, 하나의 skill 내부에서 reference를 나눈다.

이유:

- skill catalog에는 `nhncloud-cli` 하나만 보여 discoverability가 단순하다.
- `SKILL.md`는 항상 로드되는 entrypoint이므로 짧아야 한다.
- 서비스별 문서는 사용자가 해당 서비스를 요청할 때만 추가로 읽게 할 수 있다.

권장 구조:

```text
skills/nhncloud-cli/
  SKILL.md
  references/
    common.md
    logncrash.md
    deploy.md
    iaas.md
    ncr.md
    nks.md
    troubleshooting.md
```

## 구현 항목

### 1. reference 디렉터리 추가

아래 파일을 새로 만든다.

- `skills/nhncloud-cli/references/common.md`
- `skills/nhncloud-cli/references/logncrash.md`
- `skills/nhncloud-cli/references/deploy.md`
- `skills/nhncloud-cli/references/iaas.md`
- `skills/nhncloud-cli/references/ncr.md`
- `skills/nhncloud-cli/references/nks.md`
- `skills/nhncloud-cli/references/troubleshooting.md`

각 파일은 한국어로 작성한다.
명령어, 옵션명, 환경변수, JSON field 이름은 번역하지 않는다.

### 2. `SKILL.md`를 router로 축소

`skills/nhncloud-cli/SKILL.md`는 다음 내용만 유지한다.

- frontmatter `name`
- frontmatter `description`
- 한 줄 목적
- 언제 어떤 reference를 읽을지 routing 표
- 공통 우선 규칙
  - 구조화 출력은 `--json` 우선
  - 스크립트 체이닝은 `--quiet` 가능 여부 확인
  - profile은 `--profile` 우선
  - IaaS 계열은 `--region` override 가능
  - 삭제/파괴적 명령은 `--yes` 없으면 대화형 confirm이 있을 수 있음

목표 길이:

- `SKILL.md`: 180줄 이하
- 각 reference: 250줄 이하

초과하면 파일을 더 나누지 말고 중복 설명을 제거한다.

### 3. 내용 이동 기준

`common.md`:

- 설치
- configure
- profile
- 출력 모드
- 에러 코드
- agent 기본 사용 규칙

`logncrash.md`:

- `logncrash search`
- `logncrash export`
- `logncrash send`
- 시간 범위와 Lucene query 예시

`deploy.md`:

- `deploy run`
- `deploy artifacts`
- `deploy server-groups`
- `deploy histories`
- `deploy binary-groups`
- `deploy binaries`
- `deploy upload`
- `deploy download`

`iaas.md`:

- `instance`
- `network`
- `volume`
- `floatingip`
- IaaS 공통 `--region`, `--profile`
- 생성/삭제/attach 전 discovery 순서

`ncr.md`:

- `ncr list`
- `ncr get`
- `ncr images`
- `ncr tags`
- `--app-key`, `--region`, Harbor REST 주의사항

`nks.md`:

- `nks supports`
- `nks cluster`
- `nks nodegroup`
- `nks addon-type`
- `nks addon`
- `kubeconfig`
- JSON payload file 사용 규칙

`troubleshooting.md`:

- 인증 실패
- profile 누락
- region mismatch
- `--json` shape 혼동
- 검색/scroll 제한

### 4. 기존 정보 보존

단순 삭제하지 않는다.
기존 `SKILL.md`의 명령 예시와 JSON shape 정보는 위 reference 중 하나로 이동한다.

중복되거나 낡은 설명만 줄인다.
불확실한 내용은 새로 추정하지 않는다.

## 문서 영향

이 phase는 공개 skill 구조 변경이다.
사용자-facing CLI 표면은 바뀌지 않는다.

수정 대상:

- `skills/nhncloud-cli/SKILL.md`
- `skills/nhncloud-cli/references/common.md`
- `skills/nhncloud-cli/references/logncrash.md`
- `skills/nhncloud-cli/references/deploy.md`
- `skills/nhncloud-cli/references/iaas.md`
- `skills/nhncloud-cli/references/ncr.md`
- `skills/nhncloud-cli/references/nks.md`
- `skills/nhncloud-cli/references/troubleshooting.md`

수정하지 않을 것:

- `README.md`
- `AGENTS.md`
- `docs/code-architecture.md`
- `docs/flow.md`
- `src/`

위 파일들은 Phase 02, Phase 03에서 help와 신규 command 여부가 확정된 뒤 동기화한다.

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/plan/path-migration-agents-missing.md`
- `.agents/skills/_shared/pitfalls/plan/file-scope-inaccurate.md`
- `.agents/skills/_shared/pitfalls/plan/success-criterion-no-enforcement.md`

특히 확인할 점:

- `skills/nhncloud-cli/SKILL.md`를 참조하는 검증 스크립트가 reference 구조를 따라갈 수 있는가?
- reference 파일 경로를 `.agents/skills`, `.claude/agents`, `.codex/agents`, `README.md`, `docs/`, `AGENTS.md`에서 grep했는가?
- `SKILL.md` frontmatter description이 NKS/NCR 등 주요 트리거를 계속 포함하는가?

## 검증

자동 검증:

```bash
python3 /Users/nhn/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/nhncloud-cli
wc -l skills/nhncloud-cli/SKILL.md skills/nhncloud-cli/references/*.md
rg -n "references/(common|logncrash|deploy|iaas|ncr|nks|troubleshooting)\\.md" skills/nhncloud-cli
rg -n "skills/nhncloud-cli/SKILL.md|skills/nhncloud-cli/references" AGENTS.md README.md docs .agents/skills .claude/agents .codex/agents
```

기대값:

- `quick_validate.py`가 exit 0.
- `SKILL.md`는 180줄 이하.
- 각 reference는 250줄 이하.
- `SKILL.md` routing 표에서 모든 reference 파일이 링크된다.
- 참조 grep 결과에서 낡은 단일 파일 전제 검증이 있으면 Phase 03 보완 대상으로 기록한다.

## 변경 파일

- `skills/nhncloud-cli/SKILL.md`
- `skills/nhncloud-cli/references/common.md`
- `skills/nhncloud-cli/references/logncrash.md`
- `skills/nhncloud-cli/references/deploy.md`
- `skills/nhncloud-cli/references/iaas.md`
- `skills/nhncloud-cli/references/ncr.md`
- `skills/nhncloud-cli/references/nks.md`
- `skills/nhncloud-cli/references/troubleshooting.md`

## 커밋

```bash
git commit -m "docs(skill): split nhncloud-cli references by service"
```
