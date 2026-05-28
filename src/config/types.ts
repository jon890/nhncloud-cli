export interface ServiceCredential {
  appkey: string;
  secret?: string;
  token?: string;
}

export interface Credentials {
  version: 1;
  profiles: Record<string, Record<string, ServiceCredential>>;
}

export interface Config {
  version: 1;
  defaultProfile?: string;
}
