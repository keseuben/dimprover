import { createHash } from "node:crypto";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export type PersonalDriveProjectLink = {
  id: string;
  projectId: string;
  createdAt: string;
  createdBy: string;
};

const SOURCE_TYPE = "personal_drive";
const TARGET_TYPE = "project";
const RELATION_TYPE = "RELATES_TO";

function dbError(message: string, error: { code?: string | null; message?: string | null; details?: string | null } | null): never {
  throw new DimproIdentityError(message, error?.code || "PERSONAL_PROJECT_LINK_DATABASE_ERROR", 500);
}

function linkId(userId: string, projectId: string) {
  const digest = createHash("sha256").update(`${SOURCE_TYPE}:${userId}:${projectId}`).digest("hex").slice(0, 32);
  return `personal-drive-link-${digest}`;
}

export async function listPersonalDriveProjectLinks(userId: string): Promise<PersonalDriveProjectLink[]> {
  const result = await getDimproIdentitySupabaseClient()
    .from("project_core_entity_links")
    .select("id,project_id,target_id,created_at,created_by")
    .eq("source_type", SOURCE_TYPE)
    .eq("source_id", userId)
    .eq("target_type", TARGET_TYPE)
    .eq("relation_type", RELATION_TYPE)
    .order("created_at", { ascending: true });
  if (result.error) dbError("A Saját Drive projektkapcsolatai nem tölthetők be.", result.error);
  return (result.data || []).flatMap((row) => {
    const projectId = String(row.target_id || row.project_id || "").trim();
    if (!projectId) return [];
    return [{ id: String(row.id), projectId, createdAt: String(row.created_at || ""), createdBy: String(row.created_by || "") }];
  });
}

export async function linkPersonalDriveProject(input: { userId: string; projectId: string; actorUserId: string }) {
  const id = linkId(input.userId, input.projectId);
  const existing = await getDimproIdentitySupabaseClient()
    .from("project_core_entity_links")
    .select("id,project_id,target_id,created_at,created_by")
    .eq("id", id)
    .maybeSingle();
  if (existing.error) dbError("A meglévő Saját Drive projektkapcsolat nem ellenőrizhető.", existing.error);
  if (existing.data) {
    if (String(existing.data.target_id) !== input.projectId) {
      throw new DimproIdentityError("A személyes projektkapcsolat azonosítója ütközik.", "PERSONAL_PROJECT_LINK_ID_CONFLICT", 409);
    }
    return { created: false, id };
  }
  const result = await getDimproIdentitySupabaseClient()
    .from("project_core_entity_links")
    .insert({
      id,
      project_id: input.projectId,
      source_type: SOURCE_TYPE,
      source_id: input.userId,
      target_type: TARGET_TYPE,
      target_id: input.projectId,
      relation_type: RELATION_TYPE,
      created_by: input.actorUserId,
    })
    .select("id")
    .single();
  if (result.error) {
    if (result.error.code === "23505") return { created: false, id };
    dbError("A projekt nem csatolható a Saját Drive-hoz.", result.error);
  }
  return { created: true, id: String(result.data.id) };
}

export async function unlinkPersonalDriveProject(input: { userId: string; projectId: string }) {
  const result = await getDimproIdentitySupabaseClient()
    .from("project_core_entity_links")
    .delete()
    .eq("source_type", SOURCE_TYPE)
    .eq("source_id", input.userId)
    .eq("target_type", TARGET_TYPE)
    .eq("target_id", input.projectId)
    .eq("relation_type", RELATION_TYPE)
    .select("id");
  if (result.error) dbError("A projekt nem választható le a Saját Drive-ról.", result.error);
  return { removed: (result.data || []).length > 0 };
}
