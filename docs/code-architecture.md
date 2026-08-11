# Code Architecture — nhncloud-cli

## 기술 스택

- 언어: TypeScript (Node ≥ 20)
- CLI 프레임워크: Commander.js
- HTTP: ky ([[adr-002]])
- 빌드: tsup (CJS 단일 번들, shebang 포함)
- 테스트: vitest
- 출력: chalk / cli-table3 / ora

## 디렉터리 구조

```
src/
  index.ts                  # CLI entrypoint (Commander 등록 + 전역 옵션)
  config/
    credentials.ts          # ~/.nhncloud/ 로드 + 머지 쓰기, profile 해석
    types.ts                # Credentials(profile.userAccessKey + 서비스 블록) / Config 타입
  api/
    endpoints.ts            # 서비스별 엔드포인트 맵 + image·network·blockstorage·nks·ncr·ncs host 맵 + logncrash-collector 키 (adr-005, adr-013, adr-014, adr-016, adr-019, adr-020)
    envelope.ts             # NHN 공통 봉투 unwrap + 에러 매핑 (adr-006)
    httpError.ts            # ky HTTPError → NhnCloudCliError (status별 exit code), TimeoutError 안내 (adr-026)
    timeout.ts              # 요청 타임아웃 기본값 + 전역 --request-timeout 주입 (adr-026)
    oauth.ts                # UAK → access_token 교환 + deploy·ncs·logncrash 공용 캐시 (adr-007, adr-024)
    keystone.ts             # IaaS tenantId·username·password → tokenId + compute·image·network·blockstorage·nks endpoint 동시 반환 (adr-005, adr-010, adr-013, adr-019)
  cache/
    token-store.ts          # ~/.nhncloud/cache/ token + endpoint 읽기·쓰기 (mode 0600)
  skill/
    context.ts              # package root·version·XDG data root·Claude Code 설치 경로 해석
    manifest.ts             # 공개 스킬 콘텐츠 해시와 .nhncloud-skill.json 타입 가드
    manager.ts              # 상태 판정·관리 저장소 준비·원자적 링크 전환·제거
  services/
    logncrash/
      client.ts             # LogncrashClient — 커서 검색 / v3 scroll / collector send (adr-014, adr-024)
      types.ts              # CursorSearchParams/Result / LogSendParams / LogLevel / ScrollStartParams / ScrollResult
    deploy/
      client.ts             # DeployClient — run / artifacts / serverGroups / histories / binaryGroups / binaries / uploadBinary(multipart) / downloadBinary(봉투 우회, adr-015)
      types.ts              # DeployRunParams / BinaryGroup / Binary / BinaryListParams
    instance/
      client.ts             # InstanceClient — list / get / create / delete / listFlavors / listAvailabilityZones / start / stop / reboot / resize / confirmResize / revertResize / listKeypairs / getKeypair / createKeypair / deleteKeypair / listImages / listVolumeAttachments / attachVolume / detachVolume + waitForActive (전원 제어·resize 는 공용 serverAction 경유)
      types.ts              # Server / CreateServerParams / Flavor / FlavorDetail / AvailabilityZone / Keypair / KeypairDetail / CreateKeypair* / Image (NHN 확장 필드 포함)
    network/
      client.ts             # NetworkClient — listVpcs / listSubnets / listFloatingIps / createFloatingIp / deleteFloatingIp / findExternalNetworkId (instance 와 Keystone 토큰 공유, [[adr-013]])
      types.ts              # Vpc / VpcSubnet / FloatingIp / CreateFloatingIpParams ("router:external" 콜론 키)
    loadbalancer/
      client.ts             # LoadBalancerClient — LB·IP ACL 그룹·대상 조회/변경 + bindIpAclGroups (network endpoint 재사용, [[adr-022]])
      types.ts              # LoadBalancer / IpAclGroup / IpAclTarget / binding 요청·응답
    blockstorage/
      client.ts             # BlockStorageClient — list / get / create (volume, Cinder volumev2, [[adr-013]])
      types.ts              # Volume (name·volume_type nullable) / VolumeAttachment / CreateVolumeParams
    nks/
      client.ts             # NksClient — supports / cluster / nodegroup / addon 조회·쓰기 (Keystone token + container-infra API, [[adr-019]])
      types.ts              # Cluster / NodeGroup / Addon / IP ACL / Autoscale 응답 가드
    ncr/
      client.ts             # NcrClient — listRegistries / getRegistry (Management API, 공통 UAK 정적 헤더 X-TC-AUTHENTICATION-*, region 별 host, [[adr-016]])
      harbor-client.ts      # HarborClient — listRepositories / listArtifacts (데이터플레인 Harbor REST /api/v2.0, UAK Basic Auth, 봉투 미적용, [[adr-017]])
      types.ts              # Registry / Repository / Artifact (Harbor 파생 snake_case) / RegistryListParams
    ncs/
      client.ts             # NcsClient — template / workload / malware 조회·쓰기 (Deploy OAuth Bearer 토큰 재사용 + appkey 경로 + 숫자 봉투, waitForRunning, [[adr-020]])
      types.ts              # Template / TemplateVersion / Workload / WorkloadTask / WorkloadHistory / MalwareConfig 응답 가드
    apigateway/
      client.ts             # ApiGatewayClient — service / resource / stage / deploy 조회 (UAK OAuth 토큰 재사용, X-NHN-Authorization, appkey 경로, [[adr-027]])
      types.ts              # ApiGatewayService / Resource / Stage / StageResource / DeployHistory / ResourceParameters / ResourceResponses 응답 가드 (nullable 필드 다수)
  utils/
    errors.ts               # NhnCloudCliError(message, exitCode)
    exit-codes.ts           # EXIT_* 상수
    spinner.ts              # ora 래퍼 (quiet 모드 no-op)
    time.ts                 # 상대시간 → ISO8601 변환
  formatters/
    table.ts                # 테이블 / json / quiet 출력
  commands/
    iaas.ts                 # IaaS command helper 공통 profile/region/token context 해석
    configure.ts            # nhncloud configure (대화형 + flag, 연결 테스트, adr-009)
    commands.ts             # nhncloud commands (Commander tree 기반 command path·argument·option metadata catalog, 외부 API 호출 없음)
    skills.ts               # nhncloud skills status/install/update/uninstall + 출력 모드 (skill/manager 경유)
    doctor.ts               # nhncloud doctor (자격증명·스킬 설치 상태 오프라인 진단)
    logncrash/
      helpers.ts            # profile appkey + 공통 UAK OAuth 토큰으로 v3 client 구성
      search.ts             # nhncloud logncrash search (커서 기반 페이지 이동)
      export.ts             # nhncloud logncrash export (v3 scroll 대량 추출 → 파일)
      send.ts               # nhncloud logncrash send (--body/--file/stdin, 8MB 한도, adr-014)
    deploy/
      run.ts                # nhncloud deploy run <target>
      artifacts.ts          # nhncloud deploy artifacts
      server-groups.ts      # nhncloud deploy server-groups <target>
      histories.ts          # nhncloud deploy histories <target>
      binary-groups.ts      # nhncloud deploy binary-groups <target>
      binaries.ts           # nhncloud deploy binaries <target> --binary-group <key>
      upload.ts             # nhncloud deploy upload (multipart 파일 업로드 + 파일 가드, adr-015)
      download.ts           # nhncloud deploy download (봉투 우회 파일 저장 + 덮어쓰기 정책, adr-015)
    instance/
      list.ts               # nhncloud instance list
      flavors.ts            # nhncloud instance flavors (--detail / --min-disk / --min-ram)
      availability-zones.ts # nhncloud instance availability-zones (zoneName·available)
      get.ts                # nhncloud instance get <id>
      create.ts             # nhncloud instance create (--wait, --user-data 지원 / [[adr-011]] [[adr-012]])
      delete.ts             # nhncloud instance delete <id> (--yes 지원)
      power.ts              # nhncloud instance start/stop/reboot <id> (전원 제어, serverAction 재사용)
      resize.ts             # nhncloud instance resize/resize-confirm/resize-revert <id> (타입 변경 2단계, serverAction 재사용)
      keypairs.ts           # nhncloud instance keypairs (목록)
      keypair.ts            # nhncloud instance keypair get/create/delete (--public-key / --output, private_key 0600 저장)
      images.ts             # nhncloud instance images (--visibility/--limit/--marker 등, [[adr-013]])
      volume.ts             # nhncloud instance volume attach/detach (os-volume_attachments, 쓰기)
      volumes.ts            # nhncloud instance volumes (연결 목록)
    network/
      list.ts               # nhncloud network list (VPC, create --network 소스 = VPC id)
      subnet.ts             # nhncloud network subnet list
      helpers.ts            # resolveNetworkClient (Keystone 토큰 공유, [[adr-013]])
    floatingip/
      list.ts               # nhncloud floatingip list (공인 IP 목록)
      create.ts             # nhncloud floatingip create (쓰기, 외부 VPC 자동 조회, network endpoint 재사용 [[adr-013]])
      delete.ts             # nhncloud floatingip delete <id> (쓰기, confirm·--yes)
    loadbalancer/
      list.ts               # nhncloud loadbalancer list
      get.ts                # nhncloud loadbalancer get <lb>
      ipacl.ts              # nhncloud loadbalancer ipacl list/get/create/delete
      target.ts             # nhncloud loadbalancer ipacl target list/add/remove
      binding.ts            # nhncloud loadbalancer set-ipacl/clear-ipacl
      rebind.ts             # 대상 변경 전 binding snapshot + 전체 재바인딩 + 부분 실패 결과 타입
      helpers.ts            # LoadBalancerClient 생성 + 이름/UUID resolver
    volume/
      list.ts               # nhncloud volume list (Block Storage)
      get.ts                # nhncloud volume get <id>
      create.ts             # nhncloud volume create --size <GB> (쓰기)
      helpers.ts            # resolveVolumeClient (Keystone 토큰 공유, [[adr-013]])
    nks/
      supports.ts           # nhncloud nks supports
      cluster.ts            # nhncloud nks cluster ... + cluster addon ...
      nodegroup.ts          # nhncloud nks nodegroup ...
      addon.ts              # nhncloud nks addon-type / addon ...
      helpers.ts            # resolveNksClient (Keystone 토큰 공유, [[adr-019]])
    ncr/
      list.ts               # nhncloud ncr list (레지스트리 목록, --region/--app-key)
      get.ts                # nhncloud ncr get <registry> (단일 레지스트리 조회)
      images.ts             # nhncloud ncr images <registry> (이미지/repository 목록, Harbor REST, [[adr-017]])
      tags.ts               # nhncloud ncr tags <registry> <repository> (태그 목록, artifact tags flatten, [[adr-017]])
      helpers.ts            # createNcrClient (공통 UAK 정적 헤더 + appKey/region 해석, [[adr-016]])
    ncs/
      template.ts           # nhncloud ncs template list|get|create|delete + version list|get|create|delete
      workload.ts           # nhncloud ncs workload list|get|logs|events|history|create|update|patch|pause|resume|restart|delete
      malware.ts            # nhncloud ncs malware config get|set / result
      helpers.ts            # resolveNcsClient + logs/events 시간 입력의 UTC Z 정규화 ([[adr-020]], [[adr-023]])
```

공개 skill은 `skills/nhncloud-cli/SKILL.md` router와 `skills/nhncloud-cli/references/` 서비스별 reference로 구성한다.
`SKILL.md`는 routing과 공통 우선 규칙만 담고, 세부 명령 예시는 reference가 가진다.

내부 개발 지식과 실행 절차는 다음 경계로 분리한다.

```text
docs/pitfalls/
  INDEX.md                  # 변경 유형별 회피 패턴 라우터
  plan/                     # 계획 검토에서 반복된 회피 패턴
  team/                     # 팀 실행에서 반복된 회피 패턴
  code-review/              # 코드 검토에서 반복된 회피 패턴
.agents/skills/_shared/
  retros/                   # 역할별 회고 수집·반영 절차
```

회피 패턴은 특정 에이전트 구현에 종속되지 않는 저장소 지식이므로 `docs/pitfalls/`가 단일 원본이다.
스킬과 에이전트는 `INDEX.md`에서 현재 변경에 필요한 항목만 선택해 읽는다([[adr-018]]).
`retros/`는 패턴 내용이 아니라 반복 지적을 분류하고 단일 원본에 반영하는 절차만 소유한다.

## 공개 스킬 관리

공개 스킬 설치는 패키지 디렉터리 직접 링크 대신 버전·콘텐츠 해시별 관리 저장소를 사용한다([[adr-025]]).
`skill/manifest.ts`가 외부 매니페스트와 실제 파일 해시를 검증하고, `skill/manager.ts`가 상태 판정과 원자적 링크 전환을 소유한다.
`commands/skills.ts`와 `commands/doctor.ts`가 독자적인 상태 판정을 만들지 않고 같은 관리 모듈을 호출한다.

## 단위 테스트 (vitest)

순수 함수·타입 가드·client 봉투 처리를 ky mock 으로 검증한다(`pnpm test`).

- 위치: 대상 파일 옆 `*.test.ts`(예: `src/api/envelope.test.ts`, `src/services/ncr/client.test.ts`).
- ky mock: `vi.mock("ky")` 후 `.json()` 반환값을 봉투/배열로 주입. reject value 는 production 의 `toNhnCloudCliError` 매핑(`EXIT_API_ERROR` 404 / `EXIT_AUTH_ERROR` 401·403)을 그대로 흉내낸다.
- 우선 대상: `api/envelope`(unwrap/unwrapHeader), `api/httpError`(status→exit code), 신규 service client 의 봉투·가드·region host 해석.

## 레이어 의존 방향

```
commands → services/<svc>/client → api/envelope + api/endpoints + config/credentials
                                  ↘ utils, formatters
```

역류 금지 — `services` 가 `commands` 를 import 하지 않는다.

## 인증·엔드포인트 추상화 (dooray 대비 신규 계층)

dooray-cli 는 단일 `config` 와 `client` 로 충분했지만, NHN Cloud 는 서비스마다 인증·엔드포인트가 달라 계층을 하나 더 둔다.

- `config/credentials.ts` — profile 해석 후 서비스 자격증명 블록 반환 ([[adr-004]])
- `api/endpoints.ts` — 서비스명 → 엔드포인트 (gov 분기는 후속, [[adr-005]])
- `api/envelope.ts` — `{ header, body }` 봉투 검사, `resultCode` 타입 혼재 흡수 ([[adr-006]])
- `api/oauth.ts` 와 `cache/token-store.ts` — deploy·ncs·logncrash 검색 공용.
  UAK → access_token 교환 후 계정 단위 토큰을 profile 단기 캐시로 공유한다
  ([[adr-007]], [[adr-020]], [[adr-024]]).
  캐시에 자격 지문을 저장해 자격 변경 시 무효화한다 ([[adr-021]]).
- `api/keystone.ts` 와 `cache/token-store.ts` — instance·network·blockstorage·nks 등 IaaS 전용.
  Keystone token 과 region 별 compute·image·network·blockstorage·nks endpoint 를 캐시한다 ([[adr-010]], [[adr-013]], [[adr-019]]). 캐시에 자격 지문을 저장해 자격 변경 시 무효화 ([[adr-021]])
- 각 `services/<svc>/client.ts` — 위 조각을 조합해 서비스 고유 헤더 부착
  - logncrash 검색: `X-NHN-Authorization: Bearer <token>`, appkey 경로, 숫자 봉투 ([[adr-024]])
  - logncrash collector: 인증 헤더 없음과 body의 `projectName=appkey` ([[adr-014]])
  - deploy: `X-NHN-AUTHORIZATION: Bearer <token>` 과 config target 좌표 ([[adr-008]])
  - instance: `X-Auth-Token: <tokenId>` 과 region 별 compute endpoint
  - network: `X-Auth-Token: <tokenId>` 과 region 별 network endpoint (instance 와 토큰 공유, [[adr-013]])
  - loadbalancer: `X-Auth-Token: <tokenId>` 과 network endpoint의 `/lbaas` 경로 재사용. 그룹 변경 후 자동 재바인딩과 부분 실패 복구는 [[adr-022]]
  - nks: `X-Auth-Token: <tokenId>`, `OpenStack-API-Version: container-infra latest`, region 별 kubernetes infrastructure endpoint ([[adr-019]])
  - ncr: `X-TC-AUTHENTICATION-ID/SECRET` 공통 UAK 정적 헤더와 region 별 ncr host (토큰 교환 없음, [[adr-016]])
  - ncr 이미지/태그: 데이터플레인 host 에 UAK `Basic Auth` 와 Harbor REST `/api/v2.0` (봉투 미적용, [[adr-017]])
  - ncs: `x-nhn-authorization: Bearer <token>` (Deploy OAuth 토큰 재사용), appkey 경로, region 별 ncs host, 숫자 봉투 ([[adr-020]])
  - apigateway: `X-NHN-Authorization: Bearer <token>` (공통 UAK OAuth 토큰 재사용), appkey 경로, region 별 apigateway host ([[adr-027]]).
    표준 `Authorization` 헤더로 보내면 유효한 토큰이어도 403 이 된다. pagination 은 `paging` 을 반환하는 엔드포인트에만 있다.

## 커맨드 실행 흐름 (예: `nhncloud logncrash search`)

1. `index.ts` 가 전역 옵션 처리 (`--json`/`--quiet`/`--no-color`)
2. `search.ts` 가 `--from`/`--to` 를 `utils/time.ts` 로 ISO8601 정규화
3. `credentials.ts` 로 profile 의 `logncrash.appkey`와 공통 `userAccessKey`를 로드 (없으면 `EXIT_CONFIG_ERROR`)
4. `oauth.ts`가 profile 공통 토큰 캐시를 조회하거나 UAK로 새 토큰을 발급
5. `LogncrashClient.cursorSearch()` 호출 — v3 커서 경로와 `X-NHN-Authorization: Bearer <token>` 헤더
6. `api/envelope.ts` 가 봉투 unwrap, 실패 시 `NhnCloudCliError`
7. `formatters/table.ts` 가 모드별 출력 (데이터=stdout)

## 에러 처리 원칙

- 모든 에러는 `NhnCloudCliError(message, exitCode)` 로 통일.
- HTTP 에러는 `api/httpError.ts` 에서 status → exit code 매핑 (401/403 = AUTH, 그 외 = API).
- 데이터는 stdout, 스피너·에러는 stderr.
- Load Balancer 대상 재바인딩이 일부 실패하면 구조화된 부분 결과를 stdout에 남기고 실패 종료 코드를 설정한다. stderr에는 진단과 복구 요약만 쓴다([[adr-022]]).

## 빌드·배포

- `pnpm run build` — tsup 단일 번들 (`dist/index.js`)
- `pnpm tsc --noEmit` — 타입 체크 (tsup/vitest 는 type-check 스킵)
- bin: `nhncloud`
