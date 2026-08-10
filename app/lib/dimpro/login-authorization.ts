export type DimproLoginAuthorization = {
  allowed: boolean;
  source: "legacy_allowlist" | "identity_user_license" | "identity_organization_license" | "none";
  email: string;
  userId: string | null;
  organizationId: string | null;
  licenseId: string | null;
  reason: string;
};

type Row = Record<string, unknown>;

export function normalizeDimproLoginEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function configuredLegacyEmails() {
  const configured = process.env.DIMPRO_APP_ALLOWED_EMAILS?.trim();
  const values = configured ? configured.split(",") : ["keseruben90@gmail.com"];
  return values.map(normalizeDimproLoginEmail).filter(Boolean);
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.includes("<") || key.includes(">")) return null;
  return { url, key };
}

async function restRows(path: string): Promise<Row[]> {
  const config = supabaseConfig();
  if (!config) return [];
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data as Row[] : [];
}

function dateActive(value: unknown, direction: "from" | "until") {
  if (!value) return true;
  const time = Date.parse(String(value));
  if (!Number.isFinite(time)) return false;
  return direction === "from" ? time <= Date.now() : time >= Date.now();
}

function licenseActive(row: Row) {
  const status = String(row.status || "").toLowerCase();
  return ["active", "trial"].includes(status)
    && dateActive(row.activated_at, "from")
    && dateActive(row.expires_at, "until");
}

export async function resolveDimproLoginAuthorization(value: unknown): Promise<DimproLoginAuthorization> {
  const email = normalizeDimproLoginEmail(value);
  const denied = (reason: string): DimproLoginAuthorization => ({
    allowed: false,
    source: "none",
    email,
    userId: null,
    organizationId: null,
    licenseId: null,
    reason,
  });
  if (!email) return denied("missing_email");

  if (configuredLegacyEmails().includes(email)) {
    return {
      allowed: true,
      source: "legacy_allowlist",
      email,
      userId: null,
      organizationId: null,
      licenseId: null,
      reason: "legacy_owner_allowlist",
    };
  }

  const users = await restRows(
    `dimpro_users?select=id,status,email_verified_at&email_normalized=eq.${encodeURIComponent(email)}&limit=1`,
  );
  const user = users[0];
  const userId = typeof user?.id === "string" ? user.id : "";
  if (!userId || String(user.status || "") !== "active" || !user.email_verified_at) {
    return denied("identity_user_not_active");
  }

  const directLicenses = await restRows(
    `dimpro_licenses?select=id,status,activated_at,expires_at&owner_type=eq.user&owner_user_id=eq.${encodeURIComponent(userId)}&status=in.(active,trial)&limit=20`,
  );
  const direct = directLicenses.find(licenseActive);
  if (direct && typeof direct.id === "string") {
    return {
      allowed: true,
      source: "identity_user_license",
      email,
      userId,
      organizationId: null,
      licenseId: direct.id,
      reason: "active_user_license",
    };
  }

  const memberships = await restRows(
    `dimpro_organization_memberships?select=id,organization_id,status,access_ends_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=100`,
  );
  for (const membership of memberships) {
    if (!dateActive(membership.access_ends_at, "until")) continue;
    const organizationId = typeof membership.organization_id === "string" ? membership.organization_id : "";
    if (!organizationId) continue;
    const licenses = await restRows(
      `dimpro_licenses?select=id,status,activated_at,expires_at&owner_type=eq.organization&owner_organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(active,trial)&limit=20`,
    );
    const license = licenses.find(licenseActive);
    if (license && typeof license.id === "string") {
      return {
        allowed: true,
        source: "identity_organization_license",
        email,
        userId,
        organizationId,
        licenseId: license.id,
        reason: "active_organization_license",
      };
    }
  }
  return denied("no_active_license");
}

export async function linkDimproAuthUser(emailValue: unknown, authUserId: unknown) {
  const email = normalizeDimproLoginEmail(emailValue);
  const authId = typeof authUserId === "string" ? authUserId.trim() : "";
  const config = supabaseConfig();
  if (!config || !email || !/^[0-9a-f-]{36}$/i.test(authId)) return false;

  const response = await fetch(
    `${config.url}/rest/v1/dimpro_users?email_normalized=eq.${encodeURIComponent(email)}&auth_user_id=is.null`,
    {
      method: "PATCH",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ auth_user_id: authId, updated_at: new Date().toISOString() }),
      cache: "no-store",
    },
  );
  return response.ok;
}
