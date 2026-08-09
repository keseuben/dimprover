export class DriveCoreRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "DRIVE_CORE_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "DriveCoreRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeDriveCoreError(error: unknown) {
  if (error instanceof DriveCoreRepositoryError) {
    return {
      status: error.status,
      body: { ok: false as const, error: error.message, code: error.code },
    };
  }
  return {
    status: 500,
    body: {
      ok: false as const,
      error: "A DRIVE Core művelet váratlan hibával leállt.",
      code: "DRIVE_CORE_UNEXPECTED_ERROR",
    },
  };
}
