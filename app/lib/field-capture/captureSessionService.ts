"use client";

import { DEFAULT_PRE_CAPTURE_OPTIONS, type FieldCaptureLocalSession, type PreCaptureOptions } from "./types";

const ACTIVE_SESSION_KEY = "dimpro.fieldCapture.activeSession.v1";
const DEFAULTS_KEY = "dimpro.fieldCapture.preCaptureDefaults.v1";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFieldCaptureLocalSession(): FieldCaptureLocalSession {
  const session: FieldCaptureLocalSession = {
    id: randomId(),
    createdAt: new Date().toISOString(),
    projectId: null,
    projectName: null,
    status: "ACTIVE",
  };
  window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function loadOrCreateFieldCaptureLocalSession() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVE_SESSION_KEY) || "null") as FieldCaptureLocalSession | null;
    if (parsed?.id && parsed.status === "ACTIVE") return parsed;
  } catch {}
  return createFieldCaptureLocalSession();
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
