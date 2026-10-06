import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { normalizeUuid } from "@/app/lib/identity-core/security";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

type CanonicalUserRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  email_normalized: string;
  email_verified_at: string | null;
  status: string;
};

function normalizedEmail(value: string | null | undefined) {
  const email = (value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeDisplayName(value: string | null | undefined, email: string) {
  const display = (value || "").trim().slice(0, 160);
  if (display && display.toLowerCase() !== email) return display;
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local || "DIMPRO felhasználó";
}

function identityDbError(message: string, error: { code?: string | null; message?: string | null; details?: string | null } | null): never {
  throw new DimproIdentityError(message, error?.code || "PERSONAL_DRIVE_IDENTITY_DATABASE_ERROR", 500);
}

function assertUsableStatus(row: CanonicalUserRow) {
  if (["suspended", "disabled", "deleted"].includes(row.status)) {
    throw new DimproIdentityError(
      "A központi DIMPRO felhasználói profil nem aktív.",
      "PERSONAL_DRIVE_IDENTITY_INACTIVE",
      403,
    );
  }
}

async function loadByAuthUserId(authUserId: string) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_users")
    .select("id,auth_user_id,full_name,email,email_normalized,email_verified_at,status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (result.error) identityDbError("A canonical DIMPRO felhasználó nem oldható fel AUTH azonosító alapján.", result.error);
  return (result.data || null) as CanonicalUserRow | null;
}

async function loadByEmail(email: string) {
  const result = await getDimproIdentitySupabaseClient()
    .from("dimpro_users")
    .select("id,auth_user_id,full_name,email,email_normalized,email_verified_at,status")
    .eq("email_normalized", email)
    .maybeSingle();
  if (result.error) identityDbError("A canonical DIMPRO felhasználó nem oldható fel e-mail alapján.", result.error);
  return (result.data || null) as CanonicalUserRow | null;
}

async function finalizeCanonicalUser(row: CanonicalUserRow, input: { authUserId: string; email: string; displayName: string }) {
  assertUsableStatus(row);
  if (row.auth_user_id && row.auth_user_id !== input.authUserId) {
    throw new DimproIdentityError(
      "A DIMPRO felhasználói profil már másik AUTH azonosítóhoz tartozik.",
      "PERSONAL_DRIVE_IDENTITY_AUTH_CONFLICT",
      409,
    );
  }
  if (row.email_normalized && row.email_normalized !== input.email) {
    throw new DimproIdentityError(
      "A DIMPRO felhasználói profil e-mail-címe eltér a központi AUTH e-mailtől.",
      "PERSONAL_DRIVE_IDENTITY_EMAIL_CONFLICT",
      409,
    );
  }
  const needsUpdate = row.auth_user_id !== input.authUserId || row.status === "pending" || !row.email_verified_at;
  if (!needsUpdate) return row;
  const update = await getDimproIdentitySupabaseClient()
    .from("dimpro_users")
    .update({
      auth_user_id: input.authUserId,
      status: row.status === "pending" ? "active" : row.status,
      email_verified_at: row.email_verified_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("id,auth_user_id,full_name,email,email_normalized,email_verified_at,status")
    .single();
  if (update.error) identityDbError("A canonical DIMPRO felhasználói profil nem kapcsolható az AUTH fiókhoz.", update.error);
  return update.data as CanonicalUserRow;
}

export async function ensurePersonalDriveCanonicalUser(input: { authUserId: string; email?: string | null; displayName?: string | null }) {
  const authUserId = normalizeUuid(input.authUserId);
  if (!authUserId) {
    throw new DimproIdentityError("A központi AUTH felhasználói azonosító érvénytelen.", "PERSONAL_DRIVE_AUTH_USER_INVALID", 401);
  }
  const email = normalizedEmail(input.email);
  if (!email) {
    throw new DimproIdentityError("A Saját Drive canonical profiljához hitelesített e-mail szükséges.", "PERSONAL_DRIVE_AUTH_EMAIL_REQUIRED", 409);
  }
  const displayName = safeDisplayName(input.displayName, email);

  const byAuth = await loadByAuthUserId(authUserId);
  if (byAuth) return finalizeCanonicalUser(byAuth, { authUserId, email, displayName });

  const byEmail = await loadByEmail(email);
  if (byEmail) return finalizeCanonicalUser(byEmail, { authUserId, email, displayName });

  const created = await getDimproIdentitySupabaseClient().rpc("dimpro_create_user", {
    p_full_name: displayName,
    p_email: email,
    p_auth_user_id: authUserId,
    p_phone: null,
    p_created_by: null,
  });
  if (created.error) {
    if (created.error.code === "23505") {
      const raced = await loadByAuthUserId(authUserId) || await loadByEmail(email);
      if (raced) return finalizeCanonicalUser(raced, { authUserId, email, displayName });
    }
    identityDbError("A Saját Drive canonical DIMPRO felhasználója nem hozható létre.", created.error);
  }
  const row = created.data as CanonicalUserRow | null;
  if (!row?.id) {
    throw new DimproIdentityError("A canonical DIMPRO felhasználó létrehozása nem adott azonosítót.", "PERSONAL_DRIVE_IDENTITY_CREATE_INVALID", 500);
  }
  return finalizeCanonicalUser(row, { authUserId, email, displayName });
}
