---
id: import-identifier-collision
category: plan
title: 여러 서비스에 같은 명령 이름(images/list/get) → index.ts import 식별자 충돌
triggers: [import, 식별자 충돌]
tool_catchable: false
source: [PR28]
related: []
---

**증상**: `images`·`list`·`get`·`create` 처럼 흔한 서브명령을 새 서비스에 추가하면서 command 객체를 `imagesCommand` 같은 bare 이름으로 export·import 한다. 이미 다른 서비스(예: `instance/images.ts` 의 `imagesCommand`)가 같은 이름을 export 하고 index.ts 가 둘 다 import 하면 **duplicate identifier → tsc 실패**.

**Good**: index.ts에서 서비스별 서브명령을 import할 때 **서비스 prefix alias**를 쓴다. 예를 들어 `import { imagesCommand as ncrImagesCommand } from "./commands/ncr/images.js"`로 가져오고 `ncrCommand.addCommand(ncrImagesCommand)`로 등록한다. 기존 같은 서비스의 `listCommand as ncrListCommand` 컨벤션을 따른다. 새 서브명령 추가 phase면 `grep -nE "<명령>Command" src/index.ts`로 동명 import가 이미 있는지 확인한다.

**Self-check**: 새 서브명령 이름이 다른 서비스에 이미 있는가(`grep <명령>Command src/index.ts`)? 있으면 alias 로 import 했는가?

**Why**: PR #28 (plan022) critic MAJOR에서 `ncr images`를 bare `imagesCommand`로 등록하려 했으나 `src/index.ts`에 instance `imagesCommand`가 이미 존재해 duplicate identifier가 됐다. `ncrImagesCommand`와 `ncrTagsCommand` alias로 정정했다. images/list/get/create 등 공통 서브명령을 새 서비스에 추가할 때마다 재발 가능.
