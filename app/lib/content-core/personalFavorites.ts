import "server-only";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { getUserContentItemByRefId } from "./repository";

type FavoriteRow = {
  owner_user_id: string;
  content_ref_id: string;
  created_at: string;
};

function favoriteError(message: string, error: { code?: string; message?: string } | null | undefined): never {
  const missing = error?.code === "42P01" || error?.code === "PGRST205";
  throw new DimproIdentityError(
    missing ? "A Saját Drive Kedvencek adatmotor még nincs aktiválva." : message,
    missing ? "PERSONAL_DRIVE_FAVORITES_NOT_READY" : error?.code || "PERSONAL_DRIVE_FAVORITES_DATABASE_ERROR",
    missing ? 503 : error?.code === "42501" ? 403 : 500,
  );
}

export async function listPersonalDriveFavoriteRefIds(userId: string) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_personal_drive_favorites")
    .select("owner_user_id,content_ref_id,created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  if (result.error) favoriteError("A Saját Drive kedvencei nem tölthetők be.", result.error);
  return ((result.data || []) as FavoriteRow[]).map((row) => row.content_ref_id);
}

export async function setPersonalDriveFavorite(input: { userId: string; refId: string; favorite: boolean }) {
  const item = await getUserContentItemByRefId({ userId: input.userId, refId: input.refId });
  if (!item) throw new DimproIdentityError("A Saját Drive fájl nem található.", "PERSONAL_DRIVE_FAVORITE_REF_NOT_FOUND", 404);
  const db = getDimproIdentitySupabaseClient();
  if (input.favorite) {
    const result = await db.from("dimpro_personal_drive_favorites").upsert({
      owner_user_id: input.userId,
      content_ref_id: input.refId,
      created_at: new Date().toISOString(),
    }, { onConflict: "owner_user_id,content_ref_id" });
    if (result.error) favoriteError("A Saját Drive kedvenc nem menthető.", result.error);
  } else {
    const result = await db.from("dimpro_personal_drive_favorites")
      .delete()
      .eq("owner_user_id", input.userId)
      .eq("content_ref_id", input.refId);
    if (result.error) favoriteError("A Saját Drive kedvenc nem törölhető.", result.error);
  }
  return listPersonalDriveFavoriteRefIds(input.userId);
}
