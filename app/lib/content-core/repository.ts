import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { PERSONAL_MULTIPART_SERVER_RELEASED } from "./personalMultipartPolicy";
import { parsePersonalQuotaSummary } from "./personalQuotaSummary";
import { collectPersonalQuotaUsedBytes } from "./personalQuotaPaging";

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

export const PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES = 50 * 1024 ** 3;

export type PersonalDriveStorageQuota = {
  projectId: "personal";
  quotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  occupiedBytes: number;
  remainingBytes: number;
  usagePercent: number;
  warningPercent: 80;
  criticalPercent: 95;
  hardLimit: boolean;
  source: "PERSONAL_DEFAULT" | "PLAN" | "OVERRIDE";
};

type ContentObjectRow = {
  id: string;
  sha256: string;
  size_bytes: number;
  mime_type: string;
  original_name: string | null;
  display_name: string;
  storage_provider: string;
  storage_bucket: string;
  storage_key: string;
  security_status: string;
  virus_scan_status: string;
  source_system: string;
  source_object_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ContentRefRow = {
  id: string;
  content_object_id: string;
  owner_type: "USER" | "PROJECT";
  owner_user_id: string | null;
  owner_project_id: string | null;
  folder_id: string | null;
  source_system: string;
  source_ref: string;
  display_name: string;
  retained_independently: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PersonalContentFolderRow = {
  id: string;
  owner_user_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  status: "ACTIVE" | "TRASHED";
  created_by_user_id: string | null;
  trashed_by_user_id: string | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
};

const PERSONAL_FOLDER_SELECT = "id,owner_user_id,parent_id,name,sort_order,status,created_by_user_id,trashed_by_user_id,trashed_at,created_at,updated_at";

function personalFolderError(message: string, error: DbError): never {
  const status = error?.code === "23505" ? 409 : error?.code === "42501" ? 403 : 500;
  throw new DimproIdentityError(message, error?.code || "CONTENT_PERSONAL_FOLDER_DATABASE_ERROR", status);
}

export function normalizePersonalFolderName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 180 || name === "." || name === ".." || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw new DimproIdentityError("Érvénytelen mappanév.", "CONTENT_PERSONAL_FOLDER_NAME_INVALID", 400);
  }
  return name;
}

export async function getPersonalFolderCoreReadiness() {
  const db = getDimproIdentitySupabaseClient();
  const [marker, folders] = await Promise.all([
    db.from("dimpro_content_personal_folder_schema_meta").select("component,schema_version,migration_count,bootstrap_id").eq("component", "content-personal-folders").maybeSingle(),
    db.from("dimpro_content_personal_folders").select("id", { head: true, count: "exact" }).limit(0),
  ]);
  const markerReady = !marker.error
    && marker.data?.schema_version === "0.1.0"
    && Number(marker.data?.migration_count) === 1
    && marker.data?.bootstrap_id === "content-personal-folders-v010-20261006";
  return {
    ready: markerReady && !folders.error,
    markerReady,
    foldersReady: !folders.error,
  };
}

export async function listUserContentFolders(input: { userId: string }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_personal_folders")
    .select(PERSONAL_FOLDER_SELECT)
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (result.error) personalFolderError("A Saját Drive mappái nem olvashatók.", result.error);
  return (result.data || []) as PersonalContentFolderRow[];
}

export async function getUserContentFolder(input: { userId: string; folderId: string }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_personal_folders")
    .select(PERSONAL_FOLDER_SELECT)
    .eq("id", input.folderId)
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (result.error) personalFolderError("A Saját Drive mappa nem olvasható.", result.error);
  return (result.data || null) as PersonalContentFolderRow | null;
}

export async function createUserContentFolder(input: { userId: string; parentId?: string | null; name: unknown; actorUserId: string }) {
  const name = normalizePersonalFolderName(input.name);
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await getUserContentFolder({ userId: input.userId, folderId: parentId });
    if (!parent) throw new DimproIdentityError("A szülőmappa nem található a Saját Drive-ban.", "CONTENT_PERSONAL_FOLDER_PARENT_NOT_FOUND", 404);
  }
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_personal_folders")
    .insert({
      owner_user_id: input.userId,
      parent_id: parentId,
      name,
      sort_order: 0,
      status: "ACTIVE",
      created_by_user_id: input.actorUserId,
      trashed_by_user_id: null,
      trashed_at: null,
      updated_at: new Date().toISOString(),
    })
    .select(PERSONAL_FOLDER_SELECT)
    .single();
  if (result.error) personalFolderError(result.error.code === "23505" ? "Már létezik ilyen nevű mappa ezen a helyen." : "A Saját Drive mappa nem hozható létre.", result.error);
  return result.data as PersonalContentFolderRow;
}

export async function renameUserContentFolder(input: { userId: string; folderId: string; name: unknown }) {
  const name = normalizePersonalFolderName(input.name);
  const existing = await getUserContentFolder({ userId: input.userId, folderId: input.folderId });
  if (!existing) throw new DimproIdentityError("A Saját Drive mappa nem található.", "CONTENT_PERSONAL_FOLDER_NOT_FOUND", 404);
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_personal_folders")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", input.folderId)
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .select(PERSONAL_FOLDER_SELECT)
    .single();
  if (result.error) personalFolderError(result.error.code === "23505" ? "Már létezik ilyen nevű mappa ezen a helyen." : "A Saját Drive mappa nem nevezhető át.", result.error);
  return result.data as PersonalContentFolderRow;
}

export async function moveUserContentFolder(input: { userId: string; folderId: string; parentId?: string | null }) {
  const existing = await getUserContentFolder({ userId: input.userId, folderId: input.folderId });
  if (!existing) throw new DimproIdentityError("A Saját Drive mappa nem található.", "CONTENT_PERSONAL_FOLDER_NOT_FOUND", 404);
  const parentId = input.parentId || null;
  if (parentId === input.folderId) throw new DimproIdentityError("A mappa nem helyezhető saját magába.", "CONTENT_PERSONAL_FOLDER_MOVE_SELF_BLOCKED", 409);
  if (existing.parent_id === parentId) return existing;

  if (parentId) {
    let current = await getUserContentFolder({ userId: input.userId, folderId: parentId });
    if (!current) throw new DimproIdentityError("A célmappa nem található a Saját Drive-ban.", "CONTENT_PERSONAL_FOLDER_TARGET_NOT_FOUND", 404);
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.id === input.folderId) throw new DimproIdentityError("A mappa nem helyezhető a saját almappájába.", "CONTENT_PERSONAL_FOLDER_MOVE_DESCENDANT_BLOCKED", 409);
      visited.add(current.id);
      current = current.parent_id ? await getUserContentFolder({ userId: input.userId, folderId: current.parent_id }) : null;
    }
  }

  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_personal_folders")
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq("id", input.folderId)
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .select(PERSONAL_FOLDER_SELECT)
    .single();
  if (result.error) personalFolderError(result.error.code === "23505" ? "A célmappában már létezik ilyen nevű mappa." : "A Saját Drive mappa nem helyezhető át.", result.error);
  return result.data as PersonalContentFolderRow;
}

export async function moveUserContentRef(input: { userId: string; refId: string; folderId?: string | null }) {
  const folderId = input.folderId || null;
  if (folderId) {
    const folder = await getUserContentFolder({ userId: input.userId, folderId });
    if (!folder) throw new DimproIdentityError("A célmappa nem található a Saját Drive-ban.", "CONTENT_PERSONAL_FOLDER_TARGET_NOT_FOUND", 404);
  }
  const existing = await getUserContentItemByRefId({ userId: input.userId, refId: input.refId });
  if (!existing) throw new DimproIdentityError("A Saját Drive fájl nem található.", "CONTENT_PERSONAL_FILE_NOT_FOUND", 404);
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", input.refId)
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .single();
  if (result.error) dbError("A Saját Drive fájl nem helyezhető át.", result.error);
  return result.data as ContentRefRow;
}

function dbError(message: string, error: DbError): never {
  throw new DimproIdentityError(message, error?.code || "CONTENT_CORE_DATABASE_ERROR", error?.code === "42501" ? 403 : 500);
}

export async function getPersonalDriveStorageQuota(input: { userId: string }): Promise<PersonalDriveStorageQuota> {
  const db = getDimproIdentitySupabaseClient();
  // Never silently display a legacy "0 reserved" quota while multipart upload
  // sessions could actually exist. Once released, this RPC is mandatory.
  // Until audited release the currently active personal Drive behavior is unchanged.
  if (PERSONAL_MULTIPART_SERVER_RELEASED) {
    const result = await db.rpc("dimpro_personal_drive_quota_summary_v011", {
      p_owner_user_id: input.userId,
      p_default_quota_bytes: PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES,
    });
    if (result.error || !result.data) {
      throw new DimproIdentityError(
        "A Saját Drive tárhelyfoglalása nem ellenőrizhető.",
        "PERSONAL_QUOTA_RESERVATIONS_UNAVAILABLE", 503,
      );
    }
    let summary: ReturnType<typeof parsePersonalQuotaSummary>;
    try {
      summary = parsePersonalQuotaSummary(result.data);
    } catch {
      throw new DimproIdentityError(
        "A Saját Drive tárhelyadatainak egyezősége nem igazolható.",
        "PERSONAL_QUOTA_SUMMARY_INVALID", 503,
      );
    }
    return {
      projectId: "personal", ...summary, warningPercent: 80, criticalPercent: 95,
    };
  }
  const limitResult = await db.from("dimpro_personal_drive_storage_limits")
    .select("quota_bytes,hard_limit,source")
    .eq("owner_user_id", input.userId)
    .maybeSingle();
  if (limitResult.error && limitResult.error.code !== "42P01") {
    dbError("A Saját Drive tárhelykerete nem olvasható.", limitResult.error);
  }

  let usedBytes: number;
  try {
    const complete = await collectPersonalQuotaUsedBytes({
      readRefPage: async (beforeId, limit) => {
        let query = db.from("dimpro_content_refs")
          .select("id,content_object_id")
          .eq("owner_type", "USER")
          .eq("owner_user_id", input.userId)
          .in("status", ["ACTIVE", "REMOVED"])
          .order("id", { ascending: false })
          .limit(limit);
        if (beforeId) query = query.lt("id", beforeId);
        const result = await query;
        if (result.error) dbError("A Saját Drive tárhelyhivatkozásai nem olvashatók.", result.error);
        return (result.data || []) as Array<{ id: string; content_object_id: string }>;
      },
      readObjectBatch: async ids => {
        const result = await db.from("dimpro_content_objects")
          .select("id,size_bytes")
          .in("id", ids)
          .eq("status", "ACTIVE");
        if (result.error) dbError("A Saját Drive tárhelyobjektumai nem olvashatók.", result.error);
        return (result.data || []) as Array<{ id: string; size_bytes: number }>;
      },
    });
    usedBytes = complete.usedBytes;
  } catch (error) {
    if (error instanceof DimproIdentityError) throw error;
    throw new DimproIdentityError(
      "A Saját Drive teljes tárhelyhasználata nem ellenőrizhető.",
      "PERSONAL_QUOTA_PAGED_SUMMARY_INVALID", 503,
    );
  }
  const row = limitResult.data as { quota_bytes?: number; hard_limit?: boolean; source?: string } | null;
  const quotaBytes = Math.max(1, Number(row?.quota_bytes || PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES));
  const occupiedBytes = usedBytes;
  const source = row?.source === "PLAN" ? "PLAN" as const : row?.source === "OVERRIDE" ? "OVERRIDE" as const : "PERSONAL_DEFAULT" as const;
  return {
    projectId: "personal", quotaBytes, usedBytes, reservedBytes: 0, occupiedBytes,
    remainingBytes: Math.max(0, quotaBytes - occupiedBytes),
    usagePercent: quotaBytes > 0 ? Math.min(100, occupiedBytes / quotaBytes * 100) : 0,
    warningPercent: 80, criticalPercent: 95, hardLimit: row?.hard_limit !== false, source,
  };
}

export async function listUserRemovedContentItems(input: { userId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit || 200)));
  const refsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "REMOVED")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (refsResult.error) dbError("A Saját Drive Lomtár nem olvasható.", refsResult.error);
  const refs = (refsResult.data || []) as ContentRefRow[];
  if (!refs.length) return [];
  const objectIds = [...new Set(refs.map((ref) => ref.content_object_id))];
  const objectsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .in("id", objectIds)
    .eq("status", "ACTIVE");
  if (objectsResult.error) dbError("A Saját Drive Lomtár objektumai nem olvashatók.", objectsResult.error);
  const objects = new Map(((objectsResult.data || []) as ContentObjectRow[]).map((object) => [object.id, object]));
  return refs.flatMap((ref) => { const object = objects.get(ref.content_object_id); return object ? [{ ref, object }] : []; });
}

export async function restoreUserContentRefs(input: { userId: string; refIds: string[] }) {
  const refIds = [...new Set(input.refIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!refIds.length) throw new DimproIdentityError("Legalább egy Lomtár-fájlt ki kell választani.", "PERSONAL_DRIVE_RESTORE_SELECTION_REQUIRED", 400);
  if (refIds.length > 500) throw new DimproIdentityError("Egyszerre legfeljebb 500 Lomtár-fájl állítható vissza.", "PERSONAL_DRIVE_RESTORE_LIMIT", 400);
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_restore_refs_atomic", {
    p_owner_user_id: input.userId,
    p_ref_ids: refIds,
  });
  if (result.error) {
    const marker = [result.error.code, result.error.message, result.error.details, result.error.hint].filter(Boolean).join(" ");
    if (marker.includes("PERSONAL_DRIVE_RESTORE_SCOPE_MISMATCH")) throw new DimproIdentityError("A kijelölt Lomtár-fájlok egy része már nem állítható vissza.", "PERSONAL_DRIVE_RESTORE_SCOPE_MISMATCH", 409);
    if (marker.includes("PERSONAL_DRIVE_RESTORE_SELECTION_INVALID")) throw new DimproIdentityError("Egyszerre 1–500 Lomtár-fájl állítható vissza.", "PERSONAL_DRIVE_RESTORE_SELECTION_INVALID", 400);
    dbError("A Saját Drive fájl nem állítható vissza.", result.error);
  }
  return result.data as { ok: true; restoredIds: string[]; restoredCount: number };
}


export async function getContentCoreReadiness() {
  const db = getDimproIdentitySupabaseClient();
  const [marker, objects, refs] = await Promise.all([
    db.from("dimpro_content_schema_meta").select("component,schema_version,migration_count,bootstrap_id").eq("component", "content-core").maybeSingle(),
    db.from("dimpro_content_objects").select("id", { head: true, count: "exact" }).limit(0),
    db.from("dimpro_content_refs").select("id", { head: true, count: "exact" }).limit(0),
  ]);
  const markerReady = !marker.error
    && marker.data?.schema_version === "0.1.0"
    && Number(marker.data?.migration_count) === 1
    && marker.data?.bootstrap_id === "content-core-user-drive-v010-20260818";
  return {
    ready: markerReady && !objects.error && !refs.error,
    markerReady,
    objectsReady: !objects.error,
    refsReady: !refs.error,
  };
}


export type PersonalContentDeleteDependency = {
  refId: string;
  displayName: string;
  kind: "BOX";
  reference: string;
  title: string;
  status: string;
};

export async function listUserContentDeleteDependencies(input: { userId: string; refIds: string[] }) {
  const refIds = [...new Set(input.refIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!refIds.length) return [] as PersonalContentDeleteDependency[];
  const db = getDimproIdentitySupabaseClient();
  const refsResult = await db.from("dimpro_content_refs")
    .select("id,display_name")
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .in("id", refIds);
  if (refsResult.error) dbError("A Saját Drive törlési előellenőrzése sikertelen.", refsResult.error);
  const refName = new Map(((refsResult.data || []) as Array<{ id: string; display_name: string }>).map((row) => [row.id, row.display_name]));
  if (!refName.size) return [] as PersonalContentDeleteDependency[];

  const itemResult = await db.from("dimpro_personal_drive_box_items")
    .select("id,box_id,content_ref_id")
    .eq("owner_user_id", input.userId)
    .in("content_ref_id", [...refName.keys()]);
  if (itemResult.error) dbError("A Saját Drive CsomagBOX-kapcsolatai nem ellenőrizhetők.", itemResult.error);
  const items = (itemResult.data || []) as Array<{ id: string; box_id: string; content_ref_id: string }>;
  if (!items.length) return [] as PersonalContentDeleteDependency[];

  const boxIds = [...new Set(items.map((item) => item.box_id))];
  const boxResult = await db.from("dimpro_personal_drive_boxes")
    .select("id,name,lifecycle_status,status")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .in("id", boxIds);
  if (boxResult.error) dbError("A Saját Drive CsomagBOX állapota nem ellenőrizhető.", boxResult.error);
  const boxes = new Map(((boxResult.data || []) as Array<{ id: string; name: string; lifecycle_status: string; status: string }>).map((row) => [row.id, row]));

  return items.flatMap((item): PersonalContentDeleteDependency[] => {
    const box = boxes.get(item.box_id);
    if (!box) return [];
    return [{
      refId: item.content_ref_id,
      displayName: refName.get(item.content_ref_id) || "Fájl",
      kind: "BOX",
      reference: box.name || box.id,
      title: "Saját Drive CsomagBOX",
      status: box.lifecycle_status || box.status || "ACTIVE",
    }];
  });
}

export async function softRemoveUserContentRefs(input: { userId: string; refIds: string[] }) {
  const refIds = [...new Set(input.refIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!refIds.length) throw new DimproIdentityError("Legalább egy Saját Drive fájl kijelölése kötelező.", "PERSONAL_DRIVE_DELETE_SELECTION_REQUIRED", 400);
  if (refIds.length > 500) throw new DimproIdentityError("Egyszerre legfeljebb 500 Saját Drive fájl törölhető.", "PERSONAL_DRIVE_DELETE_LIMIT", 400);
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_soft_remove_refs_atomic", {
    p_owner_user_id: input.userId,
    p_ref_ids: refIds,
  });
  if (result.error) {
    const marker = [result.error.code, result.error.message, result.error.details, result.error.hint].filter(Boolean).join(" ");
    if (marker.includes("PERSONAL_DRIVE_DELETE_DEPENDENCY_BLOCKED")) {
      throw new DimproIdentityError("A fájl nem törölhető, mert aktív CsomagBOX-kapcsolata van.", "PERSONAL_DRIVE_DELETE_DEPENDENCY_BLOCKED", 409);
    }
    if (marker.includes("PERSONAL_DRIVE_DELETE_SCOPE_MISMATCH")) {
      throw new DimproIdentityError("A kijelölt Saját Drive fájlok egy része nem található vagy nem a saját tárhelyedhez tartozik.", "PERSONAL_DRIVE_DELETE_SCOPE_MISMATCH", 403);
    }
    if (marker.includes("PERSONAL_DRIVE_DELETE_SELECTION_INVALID")) {
      throw new DimproIdentityError("Egyszerre 1–500 Saját Drive fájl törölhető.", "PERSONAL_DRIVE_DELETE_SELECTION_INVALID", 400);
    }
    dbError("A Saját Drive fájlok nem távolíthatók el.", result.error);
  }
  return result.data as { ok: true; removedIds: string[]; removedCount: number; physicalObjectDeleted: false };
}

export async function findContentObjectByHash(input: { sha256: string; sizeBytes: number }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .eq("sha256", input.sha256)
    .eq("size_bytes", input.sizeBytes)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (result.error) dbError("A Content Core objektum nem olvasható.", result.error);
  return (result.data || null) as ContentObjectRow | null;
}

export async function upsertContentObject(input: {
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string | null;
  displayName: string;
  storageBucket: string;
  storageKey: string;
  sourceSystem: "FIELD_CAPTURE" | "DROP" | "DRIVE" | "IMPORT";
  sourceObjectId: string;
}) {
  const now = new Date().toISOString();
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .upsert({
      sha256: input.sha256,
      size_bytes: input.sizeBytes,
      mime_type: input.mimeType,
      original_name: input.originalName,
      display_name: input.displayName,
      storage_provider: "S3",
      storage_bucket: input.storageBucket,
      storage_key: input.storageKey,
      security_status: "clean",
      virus_scan_status: "clean",
      source_system: input.sourceSystem,
      source_object_id: input.sourceObjectId,
      status: "ACTIVE",
      updated_at: now,
    }, { onConflict: "sha256,size_bytes" })
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .single();
  if (result.error) dbError("A Content Core objektum nem menthető.", result.error);
  return result.data as ContentObjectRow;
}

/**
 * Personal uploads never UPSERT an existing content hash: doing so could
 * overwrite another owner's storage pointer and falsely reset scan status.
 * A uniqueness race reuses only a previously CLEAN object in the same bucket.
 */
export async function registerVerifiedPersonalContentObject(input: {
  sha256: string; sizeBytes: number; mimeType: string; fileName: string;
  storageBucket: string; storageKey: string; uploadId: string;
}) {
  const db = getDimproIdentitySupabaseClient();
  const existing = await findContentObjectByHash({ sha256: input.sha256, sizeBytes: input.sizeBytes });
  if (existing) return { object: ensureReusablePersonalContentObject(existing, input.storageBucket), inserted: false };
  const now = new Date().toISOString();
  const result = await db.from("dimpro_content_objects").insert({
    sha256: input.sha256, size_bytes: input.sizeBytes,
    mime_type: input.mimeType, original_name: input.fileName, display_name: input.fileName,
    storage_provider: "S3", storage_bucket: input.storageBucket,
    storage_key: input.storageKey, security_status: "clean", virus_scan_status: "clean",
    source_system: "DRIVE", source_object_id: input.uploadId, status: "ACTIVE", updated_at: now,
  }).select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at").single();
  if (!result.error && result.data) return { object: result.data as ContentObjectRow, inserted: true };
  if (result.error?.code === "23505") {
    const winner = await findContentObjectByHash({ sha256: input.sha256, sizeBytes: input.sizeBytes });
    if (winner) return { object: ensureReusablePersonalContentObject(winner, input.storageBucket), inserted: false };
  }
  dbError("A Saját Drive ellenőrzött fájlja nem regisztrálható.", result.error);
}

export function ensureReusablePersonalContentObject<T extends { security_status: string; virus_scan_status: string; storage_bucket: string; storage_provider: string; storage_key: string; status: string }>(
  object: T, expectedBucket: string,
): T {
  if (object.security_status !== "clean" || object.virus_scan_status !== "clean"
    || object.storage_provider !== "S3" || object.storage_bucket !== expectedBucket
    || object.status !== "ACTIVE" || !object.storage_key) {
    throw new DimproIdentityError("A meglévő fájl nem használható biztonságosan.",
      "PERSONAL_DRIVE_DEDUP_UNSAFE", 409);
  }
  return object;
}

/**
 * Offset-paged personal Drive references. Page boundaries are based on
 * reference rows, not joined object rows (which can legitimately be missing).
 * Stable tie-breaker avoids reordering items with identical updated_at values.
 */
export async function listUserContentItems(input: { userId: string; limit?: number; offset?: number }) {
  const limit = Math.max(1, Math.min(250, Math.trunc(input.limit || 200)));
  const offset = Math.max(0, Math.min(100_000, Math.trunc(input.offset || 0)));
  const refsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (refsResult.error) dbError("A Saját Drive tartalomjegyzéke nem olvasható.", refsResult.error);
  const fetchedRefs = (refsResult.data || []) as ContentRefRow[];
  const hasMore = fetchedRefs.length > limit;
  const refs = fetchedRefs.slice(0, limit);
  if (refs.length === 0) return { items: [] as Array<{ref: ContentRefRow; object: ContentObjectRow}>, nextOffset: null };

  const objectIds = [...new Set(refs.map((ref) => ref.content_object_id))];
  const objectsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .in("id", objectIds)
    .eq("status", "ACTIVE");
  if (objectsResult.error) dbError("A Saját Drive tartalomobjektumai nem olvashatók.", objectsResult.error);
  const objects = new Map(((objectsResult.data || []) as ContentObjectRow[]).map((object) => [object.id, object]));
  const items = refs.flatMap((ref) => {
    const object = objects.get(ref.content_object_id);
    return object ? [{ ref, object }] : [];
  });
  return { items, nextOffset: hasMore ? offset + refs.length : null };
}

export async function getUserContentItemByRefId(input: { userId: string; refId: string }) {
  const refResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("id", input.refId)
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (refResult.error) dbError("A Saját Drive fájlhivatkozása nem olvasható.", refResult.error);
  const ref = (refResult.data || null) as ContentRefRow | null;
  if (!ref) return null;
  const objectResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .eq("id", ref.content_object_id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (objectResult.error) dbError("A Saját Drive tartalomobjektuma nem olvasható.", objectResult.error);
  const object = (objectResult.data || null) as ContentObjectRow | null;
  return object ? { ref, object } : null;
}

export async function findUserContentRef(input: { userId: string; sourceSystem: string; sourceRef: string }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("source_system", input.sourceSystem)
    .eq("source_ref", input.sourceRef)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (result.error) dbError("A Saját Drive referencia nem olvasható.", result.error);
  return (result.data || null) as ContentRefRow | null;
}

export async function ensureUserContentRef(input: {
  contentObjectId: string;
  userId: string;
  sourceSystem: "FIELD_CAPTURE" | "DROP" | "DRIVE" | "IMPORT";
  sourceRef: string;
  displayName: string;
}) {
  const result = await getDimproIdentitySupabaseClient().rpc("dimpro_personal_drive_ensure_ref_atomic", {
    p_content_object_id: input.contentObjectId,
    p_owner_user_id: input.userId,
    p_source_system: input.sourceSystem,
    p_source_ref: input.sourceRef,
    p_display_name: input.displayName,
    p_default_quota_bytes: PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES,
  });
  if (result.error) {
    const marker = [result.error.code, result.error.message, result.error.details, result.error.hint].filter(Boolean).join(" ");
    if (marker.includes("PERSONAL_DRIVE_QUOTA_EXCEEDED")) {
      throw new DimproIdentityError("A Saját Drive 50 GB-os tárhelykerete megtelt vagy ezzel a fájllal túllépésre kerülne.", "PERSONAL_DRIVE_QUOTA_EXCEEDED", 507);
    }
    if (marker.includes("CONTENT_CORE_USER_REF_OBJECT_MISMATCH")) {
      throw new DimproIdentityError("A Saját Drive forráshivatkozás másik tartalomobjektumhoz tartozik.", "CONTENT_CORE_USER_REF_OBJECT_MISMATCH", 409);
    }
    if (marker.includes("PERSONAL_DRIVE_CONTENT_OBJECT_NOT_FOUND")) {
      throw new DimproIdentityError("A Saját Drive tartalomobjektum nem található.", "PERSONAL_DRIVE_CONTENT_OBJECT_NOT_FOUND", 404);
    }
    dbError("A Saját Drive referencia nem menthető.", result.error);
  }
  return result.data as ContentRefRow;
}

export async function findProjectContentRef(input: { projectId: string; sourceSystem: string; sourceRef: string }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("owner_type", "PROJECT")
    .eq("owner_project_id", input.projectId)
    .eq("source_system", input.sourceSystem)
    .eq("source_ref", input.sourceRef)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (result.error) dbError("A Projektkapu Drive referencia nem olvasható.", result.error);
  return (result.data || null) as ContentRefRow | null;
}

export async function ensureProjectContentRef(input: {
  contentObjectId: string;
  projectId: string;
  folderId?: string | null;
  actorUserId: string;
  sourceSystem: "FIELD_CAPTURE" | "DROP" | "DRIVE" | "IMPORT";
  sourceRef: string;
  displayName: string;
}) {
  const existing = await findProjectContentRef({ projectId: input.projectId, sourceSystem: input.sourceSystem, sourceRef: input.sourceRef });
  if (existing) {
    if (existing.content_object_id !== input.contentObjectId) {
      throw new DimproIdentityError("A Projektkapu Drive forráshivatkozás másik tartalomobjektumhoz tartozik.", "CONTENT_CORE_PROJECT_REF_OBJECT_MISMATCH", 409);
    }
    return existing;
  }
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .insert({
      content_object_id: input.contentObjectId,
      owner_type: "PROJECT",
      owner_user_id: null,
      owner_project_id: input.projectId,
      folder_id: input.folderId || null,
      source_system: input.sourceSystem,
      source_ref: input.sourceRef,
      display_name: input.displayName,
      retained_independently: true,
      status: "ACTIVE",
      created_by_user_id: input.actorUserId,
      updated_at: new Date().toISOString(),
    })
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .single();
  if (!result.error) return result.data as ContentRefRow;
  if (result.error.code === "23505") {
    const raced = await findProjectContentRef({ projectId: input.projectId, sourceSystem: input.sourceSystem, sourceRef: input.sourceRef });
    if (raced && raced.content_object_id === input.contentObjectId) return raced;
  }
  dbError("A Projektkapu Drive referencia nem menthető.", result.error);
}
