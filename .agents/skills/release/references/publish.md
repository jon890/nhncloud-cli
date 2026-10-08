# npm 게시 절차

6단계에서 읽는다.
근거는 `docs/adr/041-release-publish-local-ci-verify.md` 이다.

## 게시 경로 선택

```bash
gh variable list | grep NPM_TRUSTED_PUBLISHING
```

- 변수가 `true` 면 CI 가 게시한다. 로컬 게시를 안내하지 않고 「CI 게시」 절로 간다.
- 변수가 없거나 `false` 면 로컬 게시다. 「로컬 게시」 절로 간다.

## 로컬 게시

1. 에이전트가 저장소 루트에서 `npm publish --access public --dry-run` 을 실행해 파일 목록, 버전, 크기를 사용자에게 보인다. 의도하지 않은 파일이 섞였으면 멈춘다.
2. 사용자에게 아래 명령을 직접 실행해 달라고 요청한다. 추가 인자 없이 실행한다.

   ```bash
   cd <저장소 루트> && npm publish --access public
   ```

3. 계정의 2단계 인증이 쓰기에도 걸려 있으면 npm 이 브라우저 인증 URL 을 띄우고 ENTER 를 기다린다. 사용자가 브라우저에서 인증한 뒤 ENTER 를 누른다.

저장소 루트가 아닌 곳에서 실행하면 그곳의 `package.json` 을 게시한다.

## 반영 확인

접수되면 npm 이 `Your package is being processed and may take a few minutes to become available.` 를 낸다.
반영까지 몇 분 걸린다(v0.18.0 에서 4분).
`node .agents/skills/release/scripts/verify-release.mjs "$VERSION"` 이 대기를 맡는다.

사용자가 게시했다는데 이전 버전만 보이면 `~/.npm/_logs/` 의 가장 최근 publish 로그에서 `PUT 202` 를 찾는다.
있으면 접수된 것이니 `verify-release.mjs` 를 다시 실행한다.

## CI 게시

CI 게시는 기본으로 꺼져 있다.
`NPM_TRUSTED_PUBLISHING` 이 `true` 일 때만 태그 run 이 게시한다.
이때는 5단계의 태그 run 에서 게시 단계가 success 인지 확인하고, 이어서 `verify-release.mjs` 를 실행한다.
