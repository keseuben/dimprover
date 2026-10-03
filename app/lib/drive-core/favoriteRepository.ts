import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DriveCoreRepositoryError } from "./errors";
import { getDatabaseClient } from "./databaseRepository";

export type DriveFavoriteEntityType = "DOCUMENT" | "FOLDER";

type DbFavorite = {
  project_id: string;
  user_id: string;
  entity_type: DriveFavoriteEntityType;
  entity_id: string;
  created_at: string;
};

function favoriteClient(): SupabaseClient {
  return getDatabaseClient();
}

function favoriteError(message: string, error: unknown): never {
  const candidate = error as { code?: string; message?: string } | null;
  const missingSchema = candidate?.code === "PGRST205" || candidate?.code === "42P01";
  throw new DriveCoreRepositoryError(
    missingSchema ? "A DRIVE Core kedvencek sémája még nincs alkalmazva." : message,
    missingSchema ? "DRIVE_FAVORITES_SCHEMA_NOT_READY" : candidate?.code || "DRIVE_FAVORITES_DATABASE_ERROR",
    missingSchema ? 503 : 500,
  );
}

export async function listDriveUserFavoriteEntityIds(
  projectId: string,
  userId: string,
  entityType: DriveFavoriteEntityType,
) {
  const { data, error } = await favoriteClient()
    .from("drive_core_user_favorites")
    .select("project_id,user_id,entity_type,entity_id,created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .order("created_at", { ascending: false });
  if (error) favoriteError("A kedvencek nem tölthetők be.", error);
  return ((data || []) as DbFavorite[]).map((row) => row.entity_id);
}

export async function setDriveUserFavorite(input: {
  projectId: string;
  userId: string;
  entityType: DriveFavoriteEntityType;
  entityId: string;
  favorite: boolean;
}) {
  const client = favoriteClient();
  if (input.favorite) {
    const { error } = await client
      .from("drive_core_user_favorites")
      .upsert({
        project_id: input.projectId,
        user_id: input.userId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        created_at: new Date().toISOString(),
      }, { onConflict: "project_id,user_id,entity_type,entity_id" });
    if (error) favoriteError("A kedvenc nem menthető.", error);
  } else {
    const { error } = await client
      .from("drive_core_user_favorites")
      .delete()
      .eq("project_id", input.projectId)
      .eq("user_id", input.userId)
      .eq("entity_type", input.entityType)
      .eq("entity_id", input.entityId);
    if (error) favoriteError("A kedvenc nem törölhető.", error);
  }
  return { favorite: input.favorite };
}
