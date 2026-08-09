export type PropertySurveyWorkTimerStatus = "idle" | "running" | "paused";
export type PropertySurveyWorkSessionStatus = "running" | "paused" | "completed";

export type PropertySurveyWorkSegment = {
  id: string;
  stepId: string;
  startedAt: string;
  endedAt?: string;
};

export type PropertySurveyWorkSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: PropertySurveyWorkSessionStatus;
  note: string;
  operatorName: string;
  deviceLabel: string;
  manualAdjustmentSeconds: number;
  segments: PropertySurveyWorkSegment[];
  updatedAt: string;
};

export type PropertySurveyWorkTimerWorkspace = {
  schemaVersion: 1;
  status: PropertySurveyWorkTimerStatus;
  activeSessionId?: string;
  sessions: PropertySurveyWorkSession[];
  updatedAt: string;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asIso(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function createDefaultPropertySurveyWorkTimerWorkspace(now = new Date().toISOString()): PropertySurveyWorkTimerWorkspace {
  return {
    schemaVersion: 1,
    status: "idle",
    sessions: [],
    updatedAt: now,
  };
}

export function normalizePropertySurveyWorkTimerWorkspace(input: unknown): PropertySurveyWorkTimerWorkspace {
  const now = new Date().toISOString();
  if (!input || typeof input !== "object") return createDefaultPropertySurveyWorkTimerWorkspace(now);
  const source = input as Partial<PropertySurveyWorkTimerWorkspace>;
  const sessions = Array.isArray(source.sessions)
    ? source.sessions.map((raw, sessionIndex) => {
        const session = raw as Partial<PropertySurveyWorkSession>;
        const startedAt = asIso(session.startedAt, now);
        const status: PropertySurveyWorkSessionStatus = session.status === "running" || session.status === "paused" || session.status === "completed" ? session.status : "completed";
        const segments = Array.isArray(session.segments)
          ? session.segments.map((rawSegment, segmentIndex) => {
              const segment = rawSegment as Partial<PropertySurveyWorkSegment>;
              return {
                id: typeof segment.id === "string" && segment.id ? segment.id : `timer-segment-${sessionIndex}-${segmentIndex}`,
                stepId: typeof segment.stepId === "string" && segment.stepId ? segment.stepId : "unknown",
                startedAt: asIso(segment.startedAt, startedAt),
                ...(segment.endedAt ? { endedAt: asIso(segment.endedAt, startedAt) } : {}),
              };
            })
          : [];
        return {
          id: typeof session.id === "string" && session.id ? session.id : `timer-session-${sessionIndex}`,
          startedAt,
          ...(session.endedAt ? { endedAt: asIso(session.endedAt, startedAt) } : {}),
          status,
          note: typeof session.note === "string" ? session.note : "",
          operatorName: typeof session.operatorName === "string" ? session.operatorName : "",
          deviceLabel: typeof session.deviceLabel === "string" ? session.deviceLabel : "",
          manualAdjustmentSeconds: nonNegativeNumber(session.manualAdjustmentSeconds),
          segments,
          updatedAt: asIso(session.updatedAt, startedAt),
        };
      })
    : [];

  const activeSessionId = typeof source.activeSessionId === "string" && sessions.some((session) => session.id === source.activeSessionId && session.status !== "completed")
    ? source.activeSessionId
    : undefined;
  const activeSession = activeSessionId ? sessions.find((session) => session.id === activeSessionId) : undefined;
  const status: PropertySurveyWorkTimerStatus = activeSession?.status === "running" ? "running" : activeSession?.status === "paused" ? "paused" : "idle";

  return {
    schemaVersion: 1,
    status,
    ...(activeSessionId ? { activeSessionId } : {}),
    sessions,
    updatedAt: asIso(source.updatedAt, now),
  };
}

export function startPropertySurveyWorkSession(
  workspace: PropertySurveyWorkTimerWorkspace,
  stepId: string,
  options: { operatorName?: string; deviceLabel?: string; now?: string } = {},
): PropertySurveyWorkTimerWorkspace {
  const now = options.now || new Date().toISOString();
  const current = normalizePropertySurveyWorkTimerWorkspace(workspace);
  if (current.activeSessionId) return current;
  const sessionId = createId("survey-work");
  const session: PropertySurveyWorkSession = {
    id: sessionId,
    startedAt: now,
    status: "running",
    note: "",
    operatorName: options.operatorName || "",
    deviceLabel: options.deviceLabel || "",
    manualAdjustmentSeconds: 0,
    segments: [{ id: createId("survey-work-segment"), stepId, startedAt: now }],
    updatedAt: now,
  };
  return {
    ...current,
    status: "running",
    activeSessionId: sessionId,
    sessions: [...current.sessions, session],
    updatedAt: now,
  };
}

function updateActiveSession(
  workspace: PropertySurveyWorkTimerWorkspace,
  updater: (session: PropertySurveyWorkSession, now: string) => PropertySurveyWorkSession,
  now = new Date().toISOString(),
) {
  const current = normalizePropertySurveyWorkTimerWorkspace(workspace);
  if (!current.activeSessionId) return current;
  return {
    ...current,
    sessions: current.sessions.map((session) => session.id === current.activeSessionId ? updater(session, now) : session),
    updatedAt: now,
  };
}

export function pausePropertySurveyWorkSession(workspace: PropertySurveyWorkTimerWorkspace, now = new Date().toISOString()) {
  const current = updateActiveSession(workspace, (session) => ({
    ...session,
    status: "paused",
    segments: session.segments.map((segment, index) => index === session.segments.length - 1 && !segment.endedAt ? { ...segment, endedAt: now } : segment),
    updatedAt: now,
  }), now);
  return current.activeSessionId ? { ...current, status: "paused" as const } : current;
}

export function resumePropertySurveyWorkSession(workspace: PropertySurveyWorkTimerWorkspace, stepId: string, now = new Date().toISOString()) {
  const current = updateActiveSession(workspace, (session) => ({
    ...session,
    status: "running",
    segments: [...session.segments, { id: createId("survey-work-segment"), stepId, startedAt: now }],
    updatedAt: now,
  }), now);
  return current.activeSessionId ? { ...current, status: "running" as const } : current;
}

export function finishPropertySurveyWorkSession(workspace: PropertySurveyWorkTimerWorkspace, now = new Date().toISOString()) {
  const current = updateActiveSession(workspace, (session) => ({
    ...session,
    status: "completed",
    endedAt: now,
    segments: session.segments.map((segment, index) => index === session.segments.length - 1 && !segment.endedAt ? { ...segment, endedAt: now } : segment),
    updatedAt: now,
  }), now);
  return {
    ...current,
    status: "idle" as const,
    activeSessionId: undefined,
    updatedAt: now,
  };
}

export function switchPropertySurveyWorkStep(workspace: PropertySurveyWorkTimerWorkspace, stepId: string, now = new Date().toISOString()) {
  const current = normalizePropertySurveyWorkTimerWorkspace(workspace);
  if (current.status !== "running" || !current.activeSessionId) return current;
  const active = current.sessions.find((session) => session.id === current.activeSessionId);
  const last = active?.segments[active.segments.length - 1];
  if (last?.stepId === stepId && !last.endedAt) return current;
  return updateActiveSession(current, (session) => ({
    ...session,
    segments: [
      ...session.segments.map((segment, index) => index === session.segments.length - 1 && !segment.endedAt ? { ...segment, endedAt: now } : segment),
      { id: createId("survey-work-segment"), stepId, startedAt: now },
    ],
    updatedAt: now,
  }), now);
}

export function patchPropertySurveyWorkSession(
  workspace: PropertySurveyWorkTimerWorkspace,
  sessionId: string,
  patch: Partial<Pick<PropertySurveyWorkSession, "note" | "operatorName" | "deviceLabel" | "manualAdjustmentSeconds">>,
  now = new Date().toISOString(),
) {
  const current = normalizePropertySurveyWorkTimerWorkspace(workspace);
  return {
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? {
      ...session,
      ...patch,
      manualAdjustmentSeconds: patch.manualAdjustmentSeconds === undefined ? session.manualAdjustmentSeconds : nonNegativeNumber(patch.manualAdjustmentSeconds),
      updatedAt: now,
    } : session),
    updatedAt: now,
  };
}

function differenceSeconds(start: string, end: string) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function getPropertySurveyWorkSessionSeconds(session: PropertySurveyWorkSession, now = new Date().toISOString()) {
  const segmentSeconds = session.segments.reduce((sum, segment) => sum + differenceSeconds(segment.startedAt, segment.endedAt || (session.status === "running" ? now : session.updatedAt)), 0);
  return Math.max(0, segmentSeconds + nonNegativeNumber(session.manualAdjustmentSeconds));
}

export function getPropertySurveyWorkTimerSummary(workspace: PropertySurveyWorkTimerWorkspace, now = new Date().toISOString()) {
  const current = normalizePropertySurveyWorkTimerWorkspace(workspace);
  const activeSession = current.activeSessionId ? current.sessions.find((session) => session.id === current.activeSessionId) : undefined;
  const dayKey = now.slice(0, 10);
  const todaySeconds = current.sessions
    .filter((session) => session.startedAt.slice(0, 10) === dayKey)
    .reduce((sum, session) => sum + getPropertySurveyWorkSessionSeconds(session, now), 0);
  const totalSeconds = current.sessions.reduce((sum, session) => sum + getPropertySurveyWorkSessionSeconds(session, now), 0);
  const stepSeconds = current.sessions.flatMap((session) => session.segments.map((segment) => ({ session, segment }))).reduce<Record<string, number>>((acc, item) => {
    const seconds = differenceSeconds(item.segment.startedAt, item.segment.endedAt || (item.session.status === "running" ? now : item.session.updatedAt));
    acc[item.segment.stepId] = (acc[item.segment.stepId] || 0) + seconds;
    return acc;
  }, {});
  return {
    status: current.status,
    activeSession,
    currentSeconds: activeSession ? getPropertySurveyWorkSessionSeconds(activeSession, now) : 0,
    todaySeconds,
    totalSeconds,
    stepSeconds,
    sessionCount: current.sessions.length,
  };
}

export function formatPropertySurveyWorkDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
