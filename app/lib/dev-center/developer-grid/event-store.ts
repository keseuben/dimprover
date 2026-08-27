import { randomUUID } from "node:crypto";
import type { DeveloperGridAgentCode, DeveloperGridEvent, DeveloperGridEventKind } from "./types";

const MAX_EVENTS = 1000;
const events: DeveloperGridEvent[] = [];
let sequence = 0;

export function appendDeveloperGridEvent(input: {
  taskId: string;
  workerCode: DeveloperGridAgentCode;
  kind: DeveloperGridEventKind;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}) {
  const event: DeveloperGridEvent = {
    sequence: ++sequence,
    id: `devgrid-event-${randomUUID().slice(0, 12)}`,
    taskId: input.taskId.trim(),
    workerCode: input.workerCode,
    kind: input.kind,
    summary: input.summary.trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    metadata: input.metadata || {},
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return event;
}

export function getDeveloperGridDelta(input: { afterSequence?: number; taskId?: string; limit?: number } = {}) {
  const after = Math.max(0, Math.floor(Number(input.afterSequence) || 0));
  const limit = Math.max(1, Math.min(200, Math.floor(Number(input.limit) || 100)));
  const taskId = input.taskId?.trim() || "";
  const items = events.filter((event) => event.sequence > after && (!taskId || event.taskId === taskId)).slice(0, limit);
  return {
    items,
    cursor: items.at(-1)?.sequence ?? after,
    hasMore: events.some((event) => event.sequence > (items.at(-1)?.sequence ?? after) && (!taskId || event.taskId === taskId)),
  };
}

export function resetDeveloperGridEventStoreForTests() {
  events.splice(0, events.length);
  sequence = 0;
}
