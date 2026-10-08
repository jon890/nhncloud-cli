declare const __NHNCLOUD_CLI_VERSION__: string | undefined;

/** 빌드 때 package.json 에서 주입한 CLI 버전. 주입되지 않은 테스트와 개발 실행에서는 0.0.0-dev 다. */
export const CLI_VERSION: string =
  typeof __NHNCLOUD_CLI_VERSION__ === "string" ? __NHNCLOUD_CLI_VERSION__ : "0.0.0-dev";
