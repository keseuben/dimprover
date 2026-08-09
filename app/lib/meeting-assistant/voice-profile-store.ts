import { randomUUID } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function resolveProjectRoot() {
  const cwd = process.cwd();
  const marker = `${path.sep}.next${path.sep}standalone`;
  const index = cwd.lastIndexOf(marker);
  return index >= 0 ? cwd.slice(0, index) : cwd;
}

const PROJECT_ROOT = process.env.DIMPRO_PROJECT_ROOT?.trim() || resolveProjectRoot();

export const MEETING_VOICE_PROFILE_ROOT = path.join(PROJECT_ROOT, ".dimprover", "data", "meeting-assistant", "voice-profiles");
export const MEETING_VOICE_PROFILE_AUDIT_FILE = path.join(MEETING_VOICE_PROFILE_ROOT, "audit.jsonl");

export type MeetingVoiceProfile = {
  id: string;
  name: string;
  email: string;
  organization: string;
  active: boolean;
  referenceFileName: string;
  referenceMimeType: string;
  referenceDurationSeconds: number;
  consentConfirmed: boolean;
  consentText: string;
  consentAt: string;
  consentBy: string;
  sourceMeetingId: string;
  sourceJobId: string;
  sourceSpeakerId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  useCount: number;
};

function safeId(value: string, fallback = "profile") {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || fallback;
}

function profileDir(profileId: string) {
  return path.join(MEETING_VOICE_PROFILE_ROOT, safeId(profileId));
}

function profileFile(profileId: string) {
  return path.join(profileDir(profileId), "profile.json");
}

export function voiceProfileReferencePath(profile: MeetingVoiceProfile) {
  return path.join(profileDir(profile.id), profile.referenceFileName);
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, filePath);
}

async function appendVoiceProfileAudit(event: {
  type: "voice_profile_created" | "voice_profile_updated" | "voice_profile_status_changed" | "voice_profile_deleted";
  profile: MeetingVoiceProfile;
  actorName: string;
  meetingId?: string;
  details?: Record<string, unknown>;
}) {
  await mkdir(MEETING_VOICE_PROFILE_ROOT, { recursive: true });
  const record = {
    at: new Date().toISOString(),
    type: event.type,
    profileId: event.profile.id,
    profileName: event.profile.name,
    profileEmail: event.profile.email,
    organization: event.profile.organization,
    actorName: String(event.actorName || "Rendszer").slice(0, 160),
    meetingId: String(event.meetingId || event.profile.sourceMeetingId || "").slice(0, 180),
    sourceMeetingId: event.profile.sourceMeetingId,
    consentAt: event.profile.consentAt,
    consentBy: event.profile.consentBy,
    active: event.profile.active,
    details: event.details || {},
  };
  await appendFile(MEETING_VOICE_PROFILE_AUDIT_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

function normalizeProfile(raw: Partial<MeetingVoiceProfile>, fallbackId: string): MeetingVoiceProfile {
  const now = new Date().toISOString();
  return {
    id: safeId(raw.id || fallbackId),
    name: String(raw.name || "Ismeretlen beszélő").trim().slice(0, 160),
    email: String(raw.email || "").trim().toLowerCase().slice(0, 240),
    organization: String(raw.organization || "").trim().slice(0, 200),
    active: raw.active !== false,
    referenceFileName: safeId(raw.referenceFileName || "reference.wav", "reference.wav"),
    referenceMimeType: String(raw.referenceMimeType || "audio/wav").slice(0, 120),
    referenceDurationSeconds: Math.min(10, Math.max(2, Number(raw.referenceDurationSeconds || 5))),
    consentConfirmed: Boolean(raw.consentConfirmed),
    consentText: String(raw.consentText || "").slice(0, 2000),
    consentAt: String(raw.consentAt || ""),
    consentBy: String(raw.consentBy || "").slice(0, 160),
    sourceMeetingId: String(raw.sourceMeetingId || "").slice(0, 180),
    sourceJobId: String(raw.sourceJobId || "").slice(0, 180),
    sourceSpeakerId: String(raw.sourceSpeakerId || "").slice(0, 80),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
    lastUsedAt: String(raw.lastUsedAt || ""),
    useCount: Math.max(0, Number(raw.useCount || 0)),
  };
}

export async function listMeetingVoiceProfiles() {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(MEETING_VOICE_PROFILE_ROOT, { withFileTypes: true });
  } catch {
    return [] as MeetingVoiceProfile[];
  }
  const rows: MeetingVoiceProfile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const parsed = JSON.parse(await readFile(profileFile(entry.name), "utf8")) as Partial<MeetingVoiceProfile>;
      rows.push(normalizeProfile(parsed, entry.name));
    } catch {
      // Hibás rekordot nem adunk vissza.
    }
  }
  return rows.sort((a, b) => (b.lastUsedAt || b.updatedAt).localeCompare(a.lastUsedAt || a.updatedAt));
}

export async function readMeetingVoiceProfile(profileId: string) {
  const parsed = JSON.parse(await readFile(profileFile(profileId), "utf8")) as Partial<MeetingVoiceProfile>;
  return normalizeProfile(parsed, profileId);
}

export async function createMeetingVoiceProfile(input: {
  name: string;
  email?: string;
  organization?: string;
  referenceSourcePath: string;
  referenceDurationSeconds: number;
  consentConfirmed: boolean;
  consentText: string;
  consentBy: string;
  sourceMeetingId: string;
  sourceJobId: string;
  sourceSpeakerId: string;
}) {
  if (!input.consentConfirmed) throw new Error("A hangprofil csak az érintett személy hozzájárulásával menthető.");
  const now = new Date().toISOString();
  const profileId = `voice-${randomUUID()}`;
  const referenceFileName = "reference.wav";
  const profile = normalizeProfile({
    id: profileId,
    name: input.name,
    email: input.email,
    organization: input.organization,
    active: true,
    referenceFileName,
    referenceMimeType: "audio/wav",
    referenceDurationSeconds: input.referenceDurationSeconds,
    consentConfirmed: true,
    consentText: input.consentText,
    consentAt: now,
    consentBy: input.consentBy,
    sourceMeetingId: input.sourceMeetingId,
    sourceJobId: input.sourceJobId,
    sourceSpeakerId: input.sourceSpeakerId,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: "",
    useCount: 0,
  }, profileId);
  await mkdir(profileDir(profileId), { recursive: true });
  await copyFile(input.referenceSourcePath, path.join(profileDir(profileId), referenceFileName));
  await atomicWrite(profileFile(profileId), profile);
  await appendVoiceProfileAudit({
    type: "voice_profile_created",
    profile,
    actorName: input.consentBy,
    meetingId: input.sourceMeetingId,
    details: { consentConfirmed: true, referenceDurationSeconds: profile.referenceDurationSeconds },
  });
  return profile;
}

export async function updateMeetingVoiceProfile(
  profileId: string,
  patch: Partial<Pick<MeetingVoiceProfile, "name" | "email" | "organization" | "active">>,
  actorName = "Szervező",
  meetingId = "",
) {
  const current = await readMeetingVoiceProfile(profileId);
  const updated = normalizeProfile({ ...current, ...patch, updatedAt: new Date().toISOString() }, current.id);
  await atomicWrite(profileFile(profileId), updated);
  await appendVoiceProfileAudit({
    type: typeof patch.active === "boolean" && patch.active !== current.active ? "voice_profile_status_changed" : "voice_profile_updated",
    profile: updated,
    actorName,
    meetingId,
    details: { previousActive: current.active, changedFields: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined) },
  });
  return updated;
}

export async function markMeetingVoiceProfilesUsed(profileIds: string[]) {
  const now = new Date().toISOString();
  for (const profileId of [...new Set(profileIds.map((item) => safeId(item)).filter(Boolean))]) {
    try {
      const current = await readMeetingVoiceProfile(profileId);
      const updated = { ...current, lastUsedAt: now, updatedAt: now, useCount: current.useCount + 1 };
      await atomicWrite(profileFile(profileId), updated);
    } catch {
      // Hiányzó profilt kihagyunk.
    }
  }
}

export async function deleteMeetingVoiceProfile(profileId: string, actorName = "Szervező", meetingId = "") {
  const current = await readMeetingVoiceProfile(profileId);
  await rm(profileDir(current.id), { recursive: true, force: true });
  await appendVoiceProfileAudit({
    type: "voice_profile_deleted",
    profile: { ...current, active: false, updatedAt: new Date().toISOString() },
    actorName,
    meetingId,
    details: { permanentDeletion: true },
  });
  return current;
}
