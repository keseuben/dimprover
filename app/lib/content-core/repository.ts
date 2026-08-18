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
