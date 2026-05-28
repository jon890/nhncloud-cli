export class NhnCloudCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "NhnCloudCliError";
  }
}
