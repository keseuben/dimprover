export class DecideCoreRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status = 500, details?: unknown) {
    super(message);
    this.name = "DecideCoreRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
