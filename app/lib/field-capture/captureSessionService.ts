"use client";

import { DEFAULT_PRE_CAPTURE_OPTIONS, type FieldCaptureLocalSession, type PreCaptureOptions } from "./types";

const ACTIVE_SESSION_KEY = "dimpro.fieldCapture.activeSession.v1";
const DEFAULTS_KEY = "dimpro.fieldCapture.preCaptureDefaults.v1";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function persistSession(session: FieldCaptureLocalSession) {
  window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  return session;
}

function normalizeSession(value: Partial<FieldCaptureLocalSession> | null): FieldCaptureLocalSession | null {
  if (!value?.id || !value.createdAt || !["ACTIVE", "CLOSED"].includes(String(value.status))) return null;
  return {
    id: String(value.id),
    createdAt: String(value.createdAt),
    projectId: typeof value.projectId === "string" && value.projectId ? value.projectId : null,
    projectName: typeof value.projectName === "string" && value.projectName ? value.projectName : null,
    status: value.status === "CLOSED" ? "CLOSED" : "ACTIVE",
    closedAt: typeof value.closedAt === "string" && value.closedAt ? value.closedAt : null,
    serverSessionId: typeof value.serverSessionId === "string" && value.serverSessionId ? value.serverSessionId : null,
  };
}

export function createFieldCaptureLocalSession(): FieldCaptureLocalSession {
  return persistSession({
    id: randomId(),
    createdAt: new Date().toISOString(),
    projectId: null,
    projectName: null,
    status: "ACTIVE",
    closedAt: null,
    serverSessionId: null,
  });
}

export function loadOrCreateFieldCaptureLocalSession() {
  try {
    const parsed = normalizeSession(JSON.parse(window.localStorage.getItem(ACTIVE_SESSION_KEY) || "null") as Partial<FieldCaptureLocalSession> | null);
    if (parsed) return persistSession(parsed);
  } catch {}
  return createFieldCaptureLocalSession();
}

export function bindFieldCaptureServerSession(session: FieldCaptureLocalSession, serverSessionId: string) {
  const normalized = serverSessionId.trim();
  if (!normalized) return persistSession(session);
  return persistSession({ ...session, serverSessionId: normalized });
}

export function closeFieldCaptureLocalSession(session: FieldCaptureLocalSession, serverSessionId: string, closedAt?: string | null) {
  if (session.status === "CLOSED") return persistSession(session);
  return persistSession({
    ...session,
    status: "CLOSED",
    closedAt: closedAt || new Date().toISOString(),
    serverSessionId,
  });
}

export function closeAndCreateFieldCaptureLocalSession() {
  return createFieldCaptureLocalSession();
}

export function loadFieldCaptureDefaults(): PreCaptureOptions {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DEFAULTS_KEY) || "null") as Partial<PreCaptureOptions> | null;
    if (!raw) return { ...DEFAULT_PRE_CAPTURE_OPTIONS };
    return {
      ...DEFAULT_PRE_CAPTURE_OPTIONS,
      ...raw,
      gpsEnabled: Boolean(raw.gpsEnabled),
      orientationEnabled: Boolean(raw.orientationEnabled),
      voiceNoteEnabled: Boolean(raw.voiceNoteEnabled),
      saveToDevice: Boolean(raw.saveToDevice),
      saveToUserDrive: Boolean(raw.saveToUserDrive),
      saveToProjectDrive: Boolean(raw.saveToProjectDrive),
      rememberForSession: Boolean(raw.rememberForSession),
      transcriptMode: raw.transcriptMode === "raw" ? "raw" : "cleaned",
    };
  } catch {
    return { ...DEFAULT_PRE_CAPTURE_OPTIONS };
  }
}

export function saveFieldCaptureDefaults(value: PreCaptureOptions) {
  window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(value));
}

export function resetFieldCaptureDefaults() {
  window.localStorage.removeItem(DEFAULTS_KEY);
}
