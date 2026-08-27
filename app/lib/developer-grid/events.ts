import type { GridActivityEvent, GridEventPage } from "./types";

export const DEVELOPER_GRID_REALTIME_MODE = "DELTA_EVENT" as const;
export const FULL_SNAPSHOT_POLLING_ALLOWED = false as const;

export function encodeEventCursor(sequence: number) {
  return Buffer.from(String(Math.max(0, sequence)), "utf8").toString("base64url");
}

export function decodeEventCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const parsed = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function paginateEvents(events: GridActivityEvent[], cursor?: string | null, limit = 50): GridEventPage {
  const after = decodeEventCursor(cursor);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const ordered = events.filter((event) => event.sequence > after).sort((a, b) => a.sequence - b.sequence);
  const page = ordered.slice(0, safeLimit);
  const last = page.at(-1);
  return {
    events: page,
    nextCursor: last ? encodeEventCursor(last.sequence) : cursor || null,
    hasMore: ordered.length > page.length,
  };
}

export function isLiveEvent(event: GridActivityEvent) {
  return event.origin === "LIVE";
}
