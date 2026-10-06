import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

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

export async function listUserContentItems(input: { userId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit || 200)));
  const refsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .eq("owner_type", "USER")
    .eq("owner_user_id", input.userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (refsResult.error) dbError("A Saját Drive tartalomjegyzéke nem olvasható.", refsResult.error);
  const refs = (refsResult.data || []) as ContentRefRow[];
  if (refs.length === 0) return [];

  const objectIds = [...new Set(refs.map((ref) => ref.content_object_id))];
  const objectsResult = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_objects")
    .select("id,sha256,size_bytes,mime_type,original_name,display_name,storage_provider,storage_bucket,storage_key,security_status,virus_scan_status,source_system,source_object_id,status,created_at,updated_at")
    .in("id", objectIds)
    .eq("status", "ACTIVE");
  if (objectsResult.error) dbError("A Saját Drive tartalomobjektumai nem olvashatók.", objectsResult.error);
  const objects = new Map(((objectsResult.data || []) as ContentObjectRow[]).map((object) => [object.id, object]));
  return refs.flatMap((ref) => {
    const object = objects.get(ref.content_object_id);
    return object ? [{ ref, object }] : [];
  });
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
  const existing = await findUserContentRef({ userId: input.userId, sourceSystem: input.sourceSystem, sourceRef: input.sourceRef });
  if (existing) {
    if (existing.content_object_id !== input.contentObjectId) {
      throw new DimproIdentityError("A Saját Drive forráshivatkozás másik tartalomobjektumhoz tartozik.", "CONTENT_CORE_USER_REF_OBJECT_MISMATCH", 409);
    }
    return existing;
  }
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_content_refs")
    .insert({
      content_object_id: input.contentObjectId,
      owner_type: "USER",
      owner_user_id: input.userId,
      owner_project_id: null,
      folder_id: null,
      source_system: input.sourceSystem,
      source_ref: input.sourceRef,
      display_name: input.displayName,
      retained_independently: true,
      status: "ACTIVE",
      created_by_user_id: input.userId,
      updated_at: new Date().toISOString(),
    })
    .select("id,content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,source_system,source_ref,display_name,retained_independently,status,created_at,updated_at")
    .single();
  if (!result.error) return result.data as ContentRefRow;
  if (result.error.code === "23505") {
    const raced = await findUserContentRef({ userId: input.userId, sourceSystem: input.sourceSystem, sourceRef: input.sourceRef });
    if (raced && raced.content_object_id === input.contentObjectId) return raced;
  }
  dbError("A Saját Drive referencia nem menthető.", result.error);
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
