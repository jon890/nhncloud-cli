export interface UserAccessKey {
  id: string;
  secret: string;
}

export interface ServiceCredential {
  appkey?: string;
  secret?: string;
}

export interface IaasCredential {
  tenantId: string;
  username: string;
  password: string;
  region: string;
}

export interface ProfileCredentials {
  userAccessKey?: UserAccessKey;
  [service: string]: UserAccessKey | ServiceCredential | IaasCredential | undefined;
}

export interface Credentials {
  version: 1;
  profiles: Record<string, ProfileCredentials>;
}

export interface DeployTarget {
  appKey: string;
  artifactId: string;
  serverGroupId: string;
  scenarioIds: string;
}

export interface Config {
  version: 1;
  defaultProfile?: string;
  deploy?: {
    targets?: Record<string, DeployTarget>;
  };
}
