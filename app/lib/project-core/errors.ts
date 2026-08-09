export class ProjectCoreRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "PROJECT_CORE_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "ProjectCoreRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeProjectCoreError(error: unknown) {
  if (error instanceof ProjectCoreRepositoryError) {
    return {
      status: error.status,
      body: { ok: false as const, error: error.message, code: error.code },
    };
  }
  return {
    status: 500,
    body: { ok: false as const, error: "A Project Core művelet váratlan hibával leállt.", code: "PROJECT_CORE_UNEXPECTED_ERROR" },
  };
}
