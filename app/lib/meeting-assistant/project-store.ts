import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEETING_DATA_ROOT } from "./store";
import type { MeetingProjectMember, MeetingProjectProfile } from "./types";

const PROJECT_PROFILE_ROOT = path.join(MEETING_DATA_ROOT, "project-profiles");
const DELETED_PROJECTS_FILE = path.join(MEETING_DATA_ROOT, "deleted-projects.json");

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizeProjectId(value: unknown) {
  const normalized = text(value, 160)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `project-${randomUUID()}`;
}

function profileFile(projectId: string) {
  return path.join(PROJECT_PROFILE_ROOT, `${sanitizeProjectId(projectId)}.json`);
}

async function atomicWrite(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}


async function readDeletedProjectIds() {
  try {
    const parsed = JSON.parse(await readFile(DELETED_PROJECTS_FILE, "utf8")) as { projectIds?: string[] };
    return new Set((parsed.projectIds || []).map((item) => sanitizeProjectId(item)).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

async function writeDeletedProjectIds(projectIds: Set<string>) {
  await atomicWrite(DELETED_PROJECTS_FILE, { version: 1, projectIds: [...projectIds].sort(), updatedAt: new Date().toISOString() });
}

export async function listDeletedMeetingProjectIds() {
  return [...await readDeletedProjectIds()];
}

function normalizeMember(raw: Partial<MeetingProjectMember>, index = 0): MeetingProjectMember | null {
  const name = text(raw.name, 160);
  if (!name) return null;
  const now = new Date().toISOString();
  return {
    id: text(raw.id, 180) || `member-${index + 1}-${randomUUID()}`,
    name,
    organization: text(raw.organization, 180),
    functionTitle: text(raw.functionTitle, 180),
    email: text(raw.email, 240),
    phone: text(raw.phone, 80),
    external: Boolean(raw.external),
    active: typeof raw.active === "boolean" ? raw.active : true,
    defaultInvite: Boolean(raw.defaultInvite),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

function normalizeProfile(raw: Partial<MeetingProjectProfile>): MeetingProjectProfile {
  const now = new Date().toISOString();
  const projectId = sanitizeProjectId(raw.projectId || raw.code || raw.name);
  const members = Array.isArray(raw.members)
    ? raw.members.map((item, index) => normalizeMember(item, index)).filter((item): item is MeetingProjectMember => Boolean(item)).slice(0, 1000)
    : [];
  return {
    projectId,
    code: text(raw.code, 120),
    name: text(raw.name, 240) || "Névtelen projekt",
    location: text(raw.location, 240),
    clientName: text(raw.clientName, 240),
    projectManager: text(raw.projectManager, 180),
    startDate: text(raw.startDate, 30),
    endDate: text(raw.endDate, 30),
    status: raw.status === "archived" ? "archived" : "active",
    defaultMeetingType: text(raw.defaultMeetingType, 160) || "Általános egyeztetés",
    members,
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

export async function listMeetingProjectProfiles() {
  await mkdir(PROJECT_PROFILE_ROOT, { recursive: true });
  const entries = await readdir(PROJECT_PROFILE_ROOT, { withFileTypes: true });
  const profiles = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      try {
        const parsed = JSON.parse(await readFile(path.join(PROJECT_PROFILE_ROOT, entry.name), "utf8")) as Partial<MeetingProjectProfile>;
        return normalizeProfile(parsed);
      } catch {
        return null;
      }
    }));
  return profiles
    .filter((item): item is MeetingProjectProfile => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name, "hu"));
}

export async function readMeetingProjectProfile(projectId: string) {
  try {
    const parsed = JSON.parse(await readFile(profileFile(projectId), "utf8")) as Partial<MeetingProjectProfile>;
    return normalizeProfile(parsed);
  } catch {
    return null;
  }
}

export async function upsertMeetingProjectProfile(input: Partial<MeetingProjectProfile>) {
  const existing = input.projectId ? await readMeetingProjectProfile(input.projectId) : null;
  const profile = normalizeProfile({
    ...(existing || {}),
    ...input,
    projectId: existing?.projectId || input.projectId,
    members: input.members ?? existing?.members ?? [],
    createdAt: existing?.createdAt || input.createdAt,
    updatedAt: new Date().toISOString(),
  });
  await atomicWrite(profileFile(profile.projectId), profile);
  const deleted = await readDeletedProjectIds();
  if (deleted.delete(profile.projectId)) await writeDeletedProjectIds(deleted);
  return profile;
}

export async function upsertMeetingProjectMember(projectId: string, input: Partial<MeetingProjectMember>) {
  const profile = await readMeetingProjectProfile(projectId);
  if (!profile) throw new Error("A projektadatlap nem található.");
  const member = normalizeMember({ ...input, updatedAt: new Date().toISOString() });
  if (!member) throw new Error("A projekttag neve kötelező.");
  const existing = profile.members.find((item) => item.id === member.id);
  const members = existing
    ? profile.members.map((item) => item.id === member.id ? { ...member, createdAt: item.createdAt } : item)
    : [...profile.members, member];
  return upsertMeetingProjectProfile({ ...profile, members });
}

export async function removeMeetingProjectMember(projectId: string, memberId: string) {
  const profile = await readMeetingProjectProfile(projectId);
  if (!profile) throw new Error("A projektadatlap nem található.");
  return upsertMeetingProjectProfile({
    ...profile,
    members: profile.members.filter((item) => item.id !== memberId),
  });
}


export async function deleteMeetingProjectProfile(projectId: string) {
  const safeId = sanitizeProjectId(projectId);
  const deleted = await readDeletedProjectIds();
  deleted.add(safeId);
  await writeDeletedProjectIds(deleted);
  await rm(profileFile(safeId), { force: true });
  return { projectId: safeId };
}
