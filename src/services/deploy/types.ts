export interface DeployRunParams {
  appKey: string;
  artifactId: string;
  serverGroupId: string;
  scenarioIds: string;
  /** 대상 호스트 CSV. 비어있으면 서버그룹 전체 배포 */
  targetHosts?: string;
  /** 병렬 배포 수 (기본 1) */
  concurrentNum?: number;
  /** 시나리오 실패 시에도 다음 진행 여부 (기본 false) */
  nextWhenFail?: boolean;
  /** 배포 메모 */
  deployNote?: string;
  /** true = 즉시 반환, false = 완료 대기 (기본 false) */
  async?: boolean;
}
