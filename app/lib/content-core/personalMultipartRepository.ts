/** DEV-source foundation: USER-owned multipart sessions, no API activation. */
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES } from "./repository";
import type { PersonalMultipartStatus, PersonalMultipartPart } from "./personalMultipartPolicy";

export type PersonalMultipartSessionRow = {
  id: string;
  owner_user_id: string;
  request_id: string;
  folder_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  expected_sha256: string;
  chunk_size_bytes: number;
  total_parts: number;
  storage_bucket: string;
  storage_key: string;
  storage_upload_id: string | null;
  part_manifest: PersonalMultipartPart[];
  status: PersonalMultipartStatus;
  state_version: number;
  expires_at: string;
  result_content_ref_id: string | null;
};

const COLS = "id,owner_user_id,request_id,folder_id,file_name,mime_type,size_bytes,expected_sha256,chunk_size_bytes,total_parts,storage_bucket,storage_key,storage_upload_id,part_manifest,status,state_version,expires_at,result_content_ref_id";

export async function getPersonalMultipartSchemaReadiness() {
  const db = getDimproIdentitySupabaseClient();
  const [meta, table] = await Promise.all([
    db.from("dimpro_personal_drive_multipart_schema_meta")
      .select("component,schema_version,bootstrap_id")
      .eq("component", "personal-drive-multipart").maybeSingle(),
    db.from("dimpro_personal_drive_multipart_sessions")
      .select("id", { head: true, count: "exact" }).limit(0),
  ]);
  return { ready: !meta.error && !table.error
    && meta.data?.schema_version === "0.1.1"
    && meta.data?.bootstrap_id === "personal-drive-multipart-v010-20261023",
    installed: !table.error, error: meta.error?.code || table.error?.code || null };
}

export async function getOwnedPersonalMultipartSession(input: {
  ownerUserId: string; sessionId: string;
}): Promise<PersonalMultipartSessionRow | null> {
  const { data, error } = await getDimproIdentitySupabaseClient()
    .from("dimpro_personal_drive_multipart_sessions").select(COLS)
    .eq("id", input.sessionId).eq("owner_user_id", input.ownerUserId).maybeSingle();
  if (error) throw new DimproIdentityError("A személyes multipart munkamenet nem kérdezhető le.",
    "PERSONAL_MULTIPART_DB_READ_FAILED", 503);
  return data as PersonalMultipartSessionRow | null;
}

export async function reservePersonalMultipartSession(input: {
  ownerUserId: string; requestId: string;
  session: Record<string, unknown>;
}) {
  const { data, error } = await getDimproIdentitySupabaseClient()
    .rpc("dimpro_personal_multipart_create_atomic", {
      p_owner_user_id: input.ownerUserId,
      p_request_id: input.requestId,
      p_session: input.session,
      p_default_quota_bytes: PERSONAL_DRIVE_DEFAULT_QUOTA_BYTES,
    });
  if (error || !data) {
    const marker = [error?.code, error?.message].filter(Boolean).join(" ");
    if (marker.includes("PERSONAL_DRIVE_QUOTA_EXCEEDED")) {
      throw new DimproIdentityError("A Saját Drive tárhelykvótája nem elegendő.",
        "PERSONAL_DRIVE_QUOTA_EXCEEDED", 507);
    }
    if (marker.includes("PERSONAL_MULTIPART_IDEMPOTENCY_CONFLICT")) {
      throw new DimproIdentityError("A munkamenet-azonosító már egy másik fájlhoz tartozik.",
        "PERSONAL_MULTIPART_IDEMPOTENCY_CONFLICT", 409);
    }
    throw new DimproIdentityError("Az új személyes multipart munkamenet még nem érhető el.",
      "PERSONAL_MULTIPART_RESERVATION_FAILED", 503);
  }
  const result = data as PersonalMultipartSessionRow;
  if (result.owner_user_id !== input.ownerUserId || result.request_id !== input.requestId) {
    throw new DimproIdentityError("A munkamenet tulajdonosi ellenőrzése sikertelen.",
      "PERSONAL_MULTIPART_OWNER_MISMATCH", 403);
  }
  return result;
}

/**
 * Optimistic CAS on exact USER, status, state_version; a racing operation
 * cannot replace an S3 upload-id or partially verified part manifest.
 */
export async function transitionPersonalMultipartSession(input: {
  ownerUserId: string; sessionId: string; expectedStatus: PersonalMultipartStatus;
  expectedVersion: number; nextStatus: PersonalMultipartStatus;
  updates?: { storage_upload_id?: string; part_manifest?: PersonalMultipartPart[] };
}) {
  if (input.expectedStatus === "CLEAN" || input.nextStatus === "CLEAN"
    || !(
      (input.expectedStatus === "INITIATED" && ["UPLOADING", "ABORTED", "ABORTING"].includes(input.nextStatus))
      || (input.expectedStatus === "UPLOADING" && ["COMPLETING", "ABORTING"].includes(input.nextStatus))
      || (input.expectedStatus === "ABORTING" && input.nextStatus === "ABORTED")
      || (input.expectedStatus === "COMPLETING" && input.nextStatus === "QUARANTINED")
      || (input.expectedStatus === "QUARANTINED" && input.nextStatus === "SCANNING")
      || (input.expectedStatus === "SCANNING" && input.nextStatus === "REJECTED")
      || (input.expectedStatus === "UPLOADING" && input.nextStatus === "UPLOADING")
    )) {
    throw new DimproIdentityError("Nem megengedett vagy még nem auditált munkamenet-állapotváltás.",
      "PERSONAL_MULTIPART_TRANSITION_BLOCKED", 409);
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new DimproIdentityError("Érvénytelen munkamenet-revízió.",
      "PERSONAL_MULTIPART_REVISION_INVALID", 400);
  }
  const { data, error } = await getDimproIdentitySupabaseClient()
    .from("dimpro_personal_drive_multipart_sessions")
    .update({
      status: input.nextStatus, state_version: input.expectedVersion + 1,
      updated_at: new Date().toISOString(),
      ...(input.updates || {}),
    })
    .eq("owner_user_id", input.ownerUserId)
    .eq("id", input.sessionId)
    .eq("status", input.expectedStatus)
    .eq("state_version", input.expectedVersion)
    .select(COLS).maybeSingle();
  if (error || !data) {
    throw new DimproIdentityError("A munkamenet állapota időközben megváltozott.",
      "PERSONAL_MULTIPART_CAS_CONFLICT", 409);
  }
  return data as PersonalMultipartSessionRow;
}
