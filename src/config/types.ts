export interface ServiceCredential {
  appkey?: string;
  secret?: string;
  token?: string;
  uakId?: string;
  uakSecret?: string;
}

export interface Credentials {
  version: 1;
  profiles: Record<string, Record<string, ServiceCredential>>;
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
