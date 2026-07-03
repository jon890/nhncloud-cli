# Phase 01 — volume create availability zone 옵션

## 목표

Issue #34를 처리한다.
`nhncloud volume create`에 `--availability-zone <az>` 선택 옵션을 추가한다.

인스턴스와 같은 가용성 영역에 볼륨을 만들 수 있게 해,
AZ 불일치로 `instance volume attach`가 400을 반환하는 상황을 피한다.

## 구현 가능성

- 외부 의존성 추가는 필요 없다.
- 인증, endpoint, token cache 구조는 바꾸지 않는다.
- Block Storage는 이미 Cinder `POST /volumes`를 호출한다.
- Issue #34에서 `availability_zone` 필드를 직접 Cinder API로 실측해 attach까지 확인했다.

공식 문서 또는 실측 근거 확인을 구현 전에 한 번 더 수행한다.
공개 docs가 봇 차단이면 Issue #34의 직접 호출 검증을 근거로 삼고,
자동 live 쓰기 호출은 하지 않는다.

## 사용자 흐름

기존 흐름:

```bash
nhncloud instance availability-zones
nhncloud volume create --size 500 --volume-type "General SSD"
nhncloud instance volume attach <instance-id> --volume <volume-id>
```

변경 후 흐름:

```bash
nhncloud instance availability-zones
nhncloud volume create --size 500 --volume-type "General SSD" --availability-zone kr-pub-a
nhncloud instance volume attach <instance-id> --volume <volume-id>
```

`--availability-zone`은 선택 옵션이다.
미지정 시 기존처럼 서버 기본 AZ에 생성한다.

## 인터페이스 설계

### CLI

- 명령: `nhncloud volume create --size <gb> [options]`
- 새 옵션: `--availability-zone <az>`
- help 문구: `가용성 영역(AZ). instance availability-zones 로 조회한 zoneName 지정`

### 서비스 요청

`CreateVolumeParams`에 선택 필드를 추가한다.

- TypeScript 필드: `availability_zone?: string`
- Cinder payload 필드: `volume.availability_zone`

`availability_zone`은 문자열 검증을 과도하게 하지 않는다.
AZ 이름은 `kr-pub-a`처럼 region별로 달라질 수 있으므로,
빈 문자열/공백만 `EXIT_PARAM_ERROR`로 거부하고 실제 존재 여부는 API가 판단하게 둔다.

## 구현 항목

### 1. types/client

- `src/services/blockstorage/types.ts`
  - `Volume`에 `availability_zone?: string` 추가.
  - 현재 command가 이미 사용하는 `volume_type?: string | null`도 `Volume` 타입에 명시해 타입체크와 출력 타입을 맞춘다.
  - `CreateVolumeParams`에 `availability_zone?: string` 추가.
- `src/services/blockstorage/client.ts`
  - `params.availability_zone`이 있으면 `volumeBody["availability_zone"]`에 넣는다.
  - `isVolume`은 `availability_zone`을 필수로 요구하지 않는다.
  - 응답에 있으면 raw JSON과 table 출력에서 사용할 수 있게 타입만 열어둔다.

### 2. command

- `src/commands/volume/create.ts`
  - `CreateGlobalOpts`에 `availabilityZone?: string` 추가.
  - `.option("--availability-zone <az>", "...")` 추가.
  - 값이 `""` 또는 trim 후 빈 문자열이면 `EXIT_PARAM_ERROR`.
  - `client.create({ availability_zone: opts.availabilityZone, ... })`로 전달.
  - table rows에 `availability_zone` 행을 추가하되 없으면 `""`로 출력한다.

### 3. tests

- `src/services/blockstorage/client.test.ts` 신규 추가.
- `ky.post` mock으로 create payload를 검증한다.
- 케이스:
  - `availability_zone` 지정 시 JSON body에 포함된다.
  - 미지정 시 JSON body에 포함되지 않는다.
  - 응답 형식 오류는 기존처럼 `EXIT_API_ERROR`.

Command test infra는 현재 없다.
대신 help smoke와 실제 command 실행 smoke로 CLI surface를 검증한다.

추가 smoke:

```bash
node dist/index.js volume create --size 10 --availability-zone "   "
```

기대값:

- exit code는 `EXIT_PARAM_ERROR`.
- 자격증명 해석이나 API 호출 전에 `--availability-zone` 공백 오류를 반환한다.

### 4. docs

사용자-facing 옵션 추가이므로 docs를 함께 갱신한다.

- `AGENTS.md`
  - `volume create` 지원 명령 설명에 `--availability-zone` 추가.
- `docs/flow.md`
  - volume 흐름 예시에 `--availability-zone` 선택 옵션과 attach 실패 회피 설명 추가.
- `README.md`
  - Block Storage 예시에 AZ 지정 생성 예시 추가.
- `skills/nhncloud-cli/SKILL.md`
  - volume create 옵션 표에 `--availability-zone` 추가.
  - 의도 → 커맨드 매핑에 AZ 지정 생성 예시 추가.
  - 프론트매터 description 변경은 필요하지 않다.

`docs/adr/` 신규 작성은 하지 않는다.
기존 Cinder 요청 필드 노출이며 새 인증/endpoint/캐시 결정이 아니다.

### 5. task 상태

- `tasks/032-feat-volume-availability-zone/index.json`
  - Phase 1 완료 시 `status: completed`
  - phase status를 `completed`로 갱신

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/plan/write-command-executor-live-call.md`
- `.agents/skills/_shared/pitfalls/plan/manual-verification-criterion.md`
- `.agents/skills/_shared/pitfalls/plan/new-command-docs-required-skip.md`
- `.agents/skills/_shared/pitfalls/code-review/positive-int-number-only.md`

쓰기 명령이므로 executor는 실제 볼륨 생성/attach를 자동 실행하지 않는다.
수동 QA는 사용자가 별도 세션에서 자격증명과 리소스 비용을 인지한 상태로 수행한다.

## 검증

자동 검증:

```bash
pnpm build
pnpm tsc --noEmit
pnpm test
node dist/index.js volume create --help
node dist/index.js volume create --size 10 --availability-zone "   "
grep -rn "availability_zone" src/services/blockstorage src/commands/volume
grep -rn -- "--availability-zone" README.md skills/nhncloud-cli/SKILL.md docs/flow.md AGENTS.md src/commands/volume/create.ts
```

기대값:

- build/test 모두 exit 0.
- `pnpm tsc --noEmit` exit 0.
- help stdout에 `--availability-zone <az>`가 포함된다.
- 공백-only `--availability-zone` smoke는 `EXIT_PARAM_ERROR`로 실패하고 API 호출 전 종료한다.
- service client test에서 `volume.availability_zone` payload 포함/미포함 케이스가 모두 고정된다.
- docs grep은 위 5개 파일에서 모두 1건 이상 나온다.

수동 QA:

```bash
nhncloud instance availability-zones --region kr1
nhncloud volume create --size 10 --volume-type "General SSD" --availability-zone <same-az>
nhncloud instance volume attach <instance-id> --volume <volume-id>
```

수동 QA 결과가 Issue #34의 실측과 다르면 PR에서 review-fix로 명령 surface와 docs를 정정한다.

## 변경 파일

- `src/services/blockstorage/types.ts`
- `src/services/blockstorage/client.ts`
- `src/services/blockstorage/client.test.ts`
- `src/commands/volume/create.ts`
- `AGENTS.md`
- `docs/flow.md`
- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `tasks/032-feat-volume-availability-zone/index.json`

## 커밋

```bash
git commit -m "feat(volume): add availability zone option"
```
