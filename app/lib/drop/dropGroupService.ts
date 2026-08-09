import { randomUUID } from "node:crypto";
import { getDropSupabaseClient, writeDropEvent } from "./dropRepository";
import { assertDropSpacePackageUploadAccess, type DropResolvedSpaceSession } from "./storage/dropUploadService";

export type DropMobileGroup = {
  id: string;
  packageId: string;
  name: string;
  code: string;
  description: string | null;
  sortOrder: number;
  fileNamePrefix: string | null;
  sequenceStart: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

function serviceError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

function cleanText(value: unknown, max: number) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function groupCode(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return base || "KEPCSOPORT";
}

function mapGroup(row: Record<string, unknown>, fileCount = 0): DropMobileGroup {
  return {
    id: String(row.id),
    packageId: String(row.package_id),
    name: String(row.name),
    code: String(row.code),
    description: row.description ? String(row.description) : null,
    sortOrder: Number(row.sort_order || 0),
    fileNamePrefix: row.file_name_prefix ? String(row.file_name_prefix) : null,
    sequenceStart: Number(row.sequence_start || 1),
    fileCount,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listDropPackageGroups(packageId: string): Promise<DropMobileGroup[]> {
  const client = getDropSupabaseClient();
  const [{ data: groups, error: groupError }, { data: files, error: fileError }] = await Promise.all([
    client
      .from("drop_groups")
      .select("id,package_id,name,code,description,sort_order,file_name_prefix,sequence_start,created_at,updated_at")
      .eq("package_id", packageId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("drop_files")
      .select("group_id")
      .eq("package_id", packageId)
      .is("deleted_at", null),
  ]);
  if (groupError) throw serviceError("A Drop képcsoportok nem tölthetők be.", groupError.code || "DROP_GROUP_LIST_FAILED", 500);
  if (fileError) throw serviceError("A képcsoportok fájlszáma nem tölthető be.", fileError.code || "DROP_GROUP_FILE_COUNT_FAILED", 500);
  const counts = new Map<string, number>();
  for (const file of files || []) {
    if (!file.group_id) continue;
    const id = String(file.group_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return (groups || []).map((row) => mapGroup(row as Record<string, unknown>, counts.get(String(row.id)) || 0));
}

export async function getDropPackageGroupsForSession(session: DropResolvedSpaceSession, packageId: string) {
  await assertDropSpacePackageUploadAccess(session, packageId);
  return listDropPackageGroups(packageId);
}

export async function createDropPackageGroup(
  packageId: string,
  input: unknown,
  actor: { name: string; email?: string | null; source?: string },
) {
  const value = input as Record<string, unknown> | null;
  const name = cleanText(value?.name, 80);
  const description = cleanText(value?.description, 240) || null;
  if (name.length < 2) throw serviceError("A képcsoport neve legalább 2 karakter legyen.", "DROP_GROUP_NAME_REQUIRED", 400);

  const client = getDropSupabaseClient();
  const existing = await listDropPackageGroups(packageId);
  const duplicate = existing.find((group) => group.name.toLocaleLowerCase("hu-HU") === name.toLocaleLowerCase("hu-HU"));
  if (duplicate) return { group: duplicate, created: false };

  const baseCode = groupCode(name);
  const usedCodes = new Set(existing.map((group) => group.code));
  let code = baseCode;
  if (usedCodes.has(code)) code = `${baseCode.slice(0, 22)}_${randomUUID().slice(0, 5).toUpperCase()}`;
  const sortOrder = existing.length ? Math.max(...existing.map((group) => group.sortOrder)) + 10 : 10;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("drop_groups")
    .insert({
      package_id: packageId,
      name,
      code,
      description,
      sort_order: sortOrder,
      file_name_prefix: code,
      sequence_start: 1,
      created_at: now,
      updated_at: now,
    })
    .select("id,package_id,name,code,description,sort_order,file_name_prefix,sequence_start,created_at,updated_at")
    .single();
  if (error || !data) {
    throw serviceError("A képcsoport nem hozható létre.", error?.code || "DROP_GROUP_CREATE_FAILED", error?.code === "23505" ? 409 : 500);
  }
  const group = mapGroup(data as Record<string, unknown>);
  await writeDropEvent({
    packageId,
    eventType: "mobile.group_created",
    actorName: actor.name,
    actorEmail: actor.email || null,
    payload: { groupId: group.id, groupName: group.name, groupCode: group.code, source: actor.source || "drop-public-uploader" },
  });
  return { group, created: true };
}


export async function updateDropPackageGroup(
  packageId: string,
  input: unknown,
  actor: { name: string; email?: string | null; source?: string },
) {
  const value = input as Record<string, unknown> | null;
  const groupId = cleanText(value?.groupId, 80);
  const name = cleanText(value?.name, 80);
  const fileNamePrefix = cleanText(value?.fileNamePrefix, 80) || null;
  if (!groupId || name.length < 2) throw serviceError("A képcsoport azonosítója és legalább 2 karakteres neve kötelező.", "DROP_GROUP_UPDATE_INVALID", 400);
  const existing = await listDropPackageGroups(packageId);
  const target = existing.find((group) => group.id === groupId);
  if (!target) throw serviceError("A képcsoport nem található.", "DROP_GROUP_NOT_FOUND", 404);
  if (existing.some((group) => group.id !== groupId && group.name.toLocaleLowerCase("hu-HU") === name.toLocaleLowerCase("hu-HU"))) {
    throw serviceError("Már létezik ilyen nevű képcsoport.", "DROP_GROUP_NAME_DUPLICATE", 409);
  }
  const client = getDropSupabaseClient();
  const { data, error } = await client.from("drop_groups")
    .update({ name, file_name_prefix: fileNamePrefix || groupCode(name), updated_at: new Date().toISOString() })
    .eq("id", groupId).eq("package_id", packageId)
    .select("id,package_id,name,code,description,sort_order,file_name_prefix,sequence_start,created_at,updated_at").single();
  if (error || !data) throw serviceError("A képcsoport nem módosítható.", error?.code || "DROP_GROUP_UPDATE_FAILED", 500);
  const group = mapGroup(data as Record<string, unknown>, target.fileCount);
  await writeDropEvent({ packageId, eventType: "mobile.group_updated", actorName: actor.name, actorEmail: actor.email || null, payload: { groupId, previousName: target.name, groupName: group.name, source: actor.source || "drop-public-uploader" } });
  return { group };
}

export async function deleteDropPackageGroup(
  packageId: string,
  input: unknown,
  actor: { name: string; email?: string | null; source?: string },
) {
  const value = input as Record<string, unknown> | null;
  const groupId = cleanText(value?.groupId, 80);
  if (!groupId) throw serviceError("A képcsoport azonosítója kötelező.", "DROP_GROUP_DELETE_INVALID", 400);
  const existing = await listDropPackageGroups(packageId);
  const target = existing.find((group) => group.id === groupId);
  if (!target) throw serviceError("A képcsoport nem található.", "DROP_GROUP_NOT_FOUND", 404);
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_groups").delete().eq("id", groupId).eq("package_id", packageId);
  if (error) throw serviceError("A képcsoport nem törölhető.", error.code || "DROP_GROUP_DELETE_FAILED", 500);
  await writeDropEvent({ packageId, eventType: "mobile.group_deleted", actorName: actor.name, actorEmail: actor.email || null, payload: { groupId, groupName: target.name, fileCountMovedToUngrouped: target.fileCount, source: actor.source || "drop-public-uploader" } });
  return { id: groupId, name: target.name, fileCount: target.fileCount };
}


export async function moveDropPackageFileToGroup(
  packageId: string,
  input: unknown,
  actor: { name: string; email?: string | null; source?: string },
) {
  const value = input as Record<string, unknown> | null;
  const fileId = cleanText(value?.fileId, 80);
  const requestedGroupId = cleanText(value?.groupId, 80);
  const groupId = requestedGroupId || null;
  const rawDisplayName = cleanText(value?.displayName, 240);
  const displayName = rawDisplayName ? rawDisplayName.replace(/[\\/]+/g, "_").replace(/\s+/g, " ").trim() : null;
  if (!fileId) throw serviceError("A kép azonosítója kötelező.", "DROP_FILE_GROUP_UPDATE_INVALID", 400);

  const groups = await listDropPackageGroups(packageId);
  const targetGroup = groupId ? groups.find((group) => group.id === groupId) || null : null;
  if (groupId && !targetGroup) throw serviceError("A kiválasztott képcsoport nem található.", "DROP_GROUP_NOT_FOUND", 404);

  const client = getDropSupabaseClient();
  const { data: existing, error: findError } = await client.from("drop_files")
    .select("id,package_id,group_id,display_name,deleted_at")
    .eq("id", fileId).eq("package_id", packageId).is("deleted_at", null).maybeSingle();
  if (findError) throw serviceError("A kép csoportadata nem tölthető be.", findError.code || "DROP_FILE_GROUP_LOOKUP_FAILED", 500);
  if (!existing) throw serviceError("A kép nem található ebben a küldeményben.", "DROP_FILE_NOT_FOUND", 404);

  const patch: Record<string, unknown> = { group_id: groupId };
  if (displayName) patch.display_name = displayName;
  const { data, error } = await client.from("drop_files")
    .update(patch)
    .eq("id", fileId).eq("package_id", packageId).is("deleted_at", null)
    .select("id,group_id,display_name").single();
  if (error || !data) throw serviceError("A kép nem helyezhető át a kiválasztott csoportba.", error?.code || "DROP_FILE_GROUP_UPDATE_FAILED", 500);

  await writeDropEvent({
    packageId,
    eventType: "mobile.file_group_updated",
    actorName: actor.name,
    actorEmail: actor.email || null,
    payload: {
      fileId,
      previousGroupId: existing.group_id ? String(existing.group_id) : null,
      groupId,
      groupName: targetGroup?.name || null,
      previousDisplayName: String(existing.display_name || ""),
      displayName: String(data.display_name || ""),
      source: actor.source || "drop-public-uploader",
    },
  });
  return {
    file: {
      id: String(data.id),
      groupId: data.group_id ? String(data.group_id) : null,
      groupName: targetGroup?.name || null,
      displayName: String(data.display_name || ""),
    },
  };
}

export async function createDropPackageGroupForSession(
  session: DropResolvedSpaceSession,
  packageId: string,
  input: unknown,
) {
  await assertDropSpacePackageUploadAccess(session, packageId);
  return createDropPackageGroup(packageId, input, {
    name: session.membership.displayName,
    email: session.membership.email,
    source: "drop-mobile-pwa",
  });
}
