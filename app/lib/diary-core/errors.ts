export class DiaryCoreRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status = 500, details?: unknown) {
    super(message);
    this.name = "DiaryCoreRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
