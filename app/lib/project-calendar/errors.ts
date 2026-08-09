export class ProjectCalendarRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "PROJECT_CALENDAR_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "ProjectCalendarRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeProjectCalendarError(error: unknown) {
  if (error instanceof ProjectCalendarRepositoryError) {
    return {
      status: error.status,
      body: { ok: false as const, error: error.message, code: error.code },
    };
  }
  return {
    status: 500,
    body: {
      ok: false as const,
      error: "A projekt-naptár művelet váratlan hibával leállt.",
      code: "PROJECT_CALENDAR_UNEXPECTED_ERROR",
    },
  };
}
