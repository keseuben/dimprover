export function shouldFallbackToCalendarFileStore(error?: unknown) {
  void error;
  return true;
}

function formatCalendarDbError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const source = error as Record<string, unknown>;
    const code = typeof source.code === "string" ? source.code : "no-code";
    const message =
      typeof source.message === "string"
        ? source.message
        : "Ismeretlen Supabase adatbázis hiba";
    return `${code}: ${message}`;
  }
  return String(error ?? "Ismeretlen Supabase adatbázis hiba");
}

export function logCalendarDbFallback(action: string, error: unknown) {
  console.warn(
    `[DIMPROVER calendar] ${action} Supabase fallback: ${formatCalendarDbError(error)}`,
  );
}
