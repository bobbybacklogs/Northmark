export class NorthmarkError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'NorthmarkError';
    this.exitCode = exitCode;
  }
}
