import { resolveIaasTokenContext } from "../iaas.js";
import { BlockStorageClient } from "../../services/blockstorage/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → BlockStorageClient 생성.
 * Keystone 토큰·endpoint 해석은 instance/network 와 공유한다 (새 토큰 발급 없음).
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveVolumeClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: BlockStorageClient; profileName: string }> {
  const { profileName, tokenId, blockStorageEndpoint } = await resolveIaasTokenContext(opts);
  return { client: new BlockStorageClient(tokenId, blockStorageEndpoint), profileName };
}
