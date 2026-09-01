import { getOptionalServiceCredential } from "../config/credentials.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

export async function resolveServiceAppKey(
  service: string,
  profileName: string,
  missingMessage: string,
): Promise<string> {
  const credential = await getOptionalServiceCredential(service, profileName);
  if (!credential?.appkey) {
    throw new NhnCloudCliError(missingMessage, EXIT_CONFIG_ERROR);
  }

  return credential.appkey;
}
