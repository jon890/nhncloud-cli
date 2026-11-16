import { Command } from "commander";
import { output } from "../../formatters/table.js";
import {
  formatCell,
  type RdsMysqlCommandOptions,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

/** 생성·수정 명령에 넣을 ID 와 값을 찾는 조회 명령이다. 모두 읽기 전용이다. */

const flavorListCommand = withRdsMysqlOptions(
  new Command("list").description("DB 인스턴스 사양(vCPU, 메모리) 목록을 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const flavors = await withRdsMysqlSpinner("DB 인스턴스 사양 조회 중...", () => client.listDbFlavors());
  output(opts, {
    headers: ["dbFlavorId", "dbFlavorName", "vcpus", "ramMB"],
    rows: flavors.map((f) => [formatCell(f.dbFlavorId), formatCell(f.dbFlavorName), formatCell(f.vcpus), formatCell(f.ram)]),
    raw: flavors,
    ids: flavors.map((f) => f.dbFlavorId),
  });
});

export const flavorCommand = new Command("flavor").description("DB 인스턴스 사양 조회 명령").addCommand(flavorListCommand);

const dbVersionListCommand = withRdsMysqlOptions(
  new Command("list").description("DB 엔진 버전 목록을 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const versions = await withRdsMysqlSpinner("DB 엔진 버전 조회 중...", () => client.listDbVersions());
  output(opts, {
    headers: ["dbVersion", "dbVersionName", "restorableFromObs"],
    rows: versions.map((v) => [formatCell(v.dbVersion), formatCell(v.dbVersionName), formatCell(v.restorableFromObs)]),
    raw: versions,
    ids: versions.map((v) => v.dbVersion),
  });
});

export const dbVersionCommand = new Command("db-version").description("DB 엔진 버전 조회 명령").addCommand(dbVersionListCommand);

/** storage 명령군에 붙는다. */
export const storageTypesCommand = withRdsMysqlOptions(
  new Command("types").description("데이터 스토리지 유형 목록을 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const types = await withRdsMysqlSpinner("스토리지 유형 조회 중...", () => client.listStorageTypes());
  output(opts, {
    headers: ["storageType"],
    rows: types.map((t) => [formatCell(t)]),
    raw: types,
    ids: types,
  });
});

const subnetListCommand = withRdsMysqlOptions(
  new Command("list").description("DB 인스턴스를 만들 수 있는 서브넷 목록을 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const subnets = await withRdsMysqlSpinner("서브넷 조회 중...", () => client.listSubnets());
  output(opts, {
    headers: ["subnetId", "subnetName", "subnetCidr", "usingGateway", "availableIpCount"],
    rows: subnets.map((s) => [
      formatCell(s.subnetId), formatCell(s.subnetName), formatCell(s.subnetCidr),
      formatCell(s.usingGateway), formatCell(s.availableIpCount),
    ]),
    raw: subnets,
    ids: subnets.map((s) => s.subnetId),
  });
});

export const subnetCommand = new Command("subnet").description("서브넷 조회 명령").addCommand(subnetListCommand);

const zoneListCommand = withRdsMysqlOptions(
  new Command("list").description("가용성 영역 목록을 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const zones = await withRdsMysqlSpinner("가용성 영역 조회 중...", () => client.listAvailabilityZones());
  output(opts, {
    headers: ["availabilityZoneName", "available"],
    rows: zones.map((z) => [formatCell(z.availabilityZoneName), formatCell(z.zoneState?.available)]),
    raw: zones,
    ids: zones.map((z) => z.availabilityZoneName),
  });
});

export const availabilityZoneCommand = new Command("availability-zone")
  .description("가용성 영역 조회 명령")
  .addCommand(zoneListCommand);

const regionsCommand = withRdsMysqlOptions(
  new Command("regions").description("RDS for MySQL 리전 목록과 활성화 여부를 조회한다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const regions = await withRdsMysqlSpinner("리전 조회 중...", () => client.listRegions());
  output(opts, {
    headers: ["regionCode", "isEnabled"],
    rows: regions.map((r) => [formatCell(r.regionCode), formatCell(r.isEnabled)]),
    raw: regions,
    ids: regions.map((r) => r.regionCode),
  });
});

const membersCommand = withRdsMysqlOptions(
  new Command("members").description("프로젝트 멤버 목록을 조회한다. 이메일 주소와 전화번호가 포함될 수 있다"),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const { client } = await resolveRdsMysqlClient(opts);
  const members = await withRdsMysqlSpinner("프로젝트 멤버 조회 중...", () => client.listProjectMembers());
  output(opts, {
    headers: ["memberId", "memberName", "emailAddress"],
    rows: members.map((m) => [formatCell(m.memberId), formatCell(m.memberName), formatCell(m.emailAddress)]),
    raw: members,
    ids: members.map((m) => m.memberId),
  });
});

export const projectCommand = new Command("project")
  .description("프로젝트 리전·멤버 조회 명령")
  .addCommand(regionsCommand)
  .addCommand(membersCommand);
