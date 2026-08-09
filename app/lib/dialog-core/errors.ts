export class DialogCoreRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "DIALOG_CORE_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "DialogCoreRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeDialogCoreError(error: unknown) {
  if (error instanceof DialogCoreRepositoryError) {
    return {
      status: error.status,
      body: { ok: false as const, error: error.message, code: error.code },
    };
  }
  return {
    status: 500,
    body: {
      ok: false as const,
      error: "A DIALOG művelet váratlan hibával leállt.",
      code: "DIALOG_CORE_UNEXPECTED_ERROR",
    },
  };
}
