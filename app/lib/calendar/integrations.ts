export type CalendarIntegrationProvider = "google" | "outlook";
export type CalendarIntegrationDirection = "read_only" | "two_way";
export type CalendarIntegrationStatus =
  | "not_started"
  | "running"
  | "success"
  | "failed";

export type CalendarIntegration = {
  id: string;
  provider: CalendarIntegrationProvider;
  displayName: string;
  accountEmail: string;
  tenantId: string | null;
  externalUserId: string | null;
  credentialRef: string | null;
  credentialExpiresAt: string | null;
  scopes: string[];
  syncDirection: CalendarIntegrationDirection;
  syncEnabled: boolean;
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStatus: CalendarIntegrationStatus;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarIntegrationRow = {
  id: string;
  provider: CalendarIntegrationProvider;
  display_name: string;
  account_email: string;
  tenant_id: string | null;
  external_user_id: string | null;
  credential_ref: string | null;
  credential_expires_at: string | null;
  scopes: string[] | null;
  sync_direction: CalendarIntegrationDirection;
  sync_enabled: boolean;
  last_sync_started_at: string | null;
  last_sync_finished_at: string | null;
  last_sync_status: CalendarIntegrationStatus;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type MicrosoftOAuthTokenResponse = {
  token_type: string;
  scope?: string;
  expires_in?: number;
  ext_expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type MicrosoftGraphUser = {
  id?: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
};

export type GoogleOAuthTokenResponse = {
  token_type?: string;
  scope?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleUserInfo = {
  sub?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
};

export const OUTLOOK_OAUTH_STATE_COOKIE = "dimprover_outlook_oauth_state";
export const GOOGLE_OAUTH_STATE_COOKIE = "dimprover_google_oauth_state";

export const MICROSOFT_REQUIRED_SCOPES = [
  "offline_access",
  "User.Read",
  "Calendars.Read",
] as const;

export const GOOGLE_REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export const DEFAULT_MICROSOFT_REDIRECT_URI =
  "https://dimprover.hu/api/calendar/integrations/outlook/callback";
export const DEFAULT_GOOGLE_REDIRECT_URI =
  "https://dimprover.hu/api/calendar/integrations/google/callback";

export function mapCalendarIntegrationRow(
  row: CalendarIntegrationRow,
): CalendarIntegration {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    accountEmail: row.account_email,
    tenantId: row.tenant_id,
    externalUserId: row.external_user_id,
    credentialRef: row.credential_ref,
    credentialExpiresAt: row.credential_expires_at,
    scopes: row.scopes ?? [],
    syncDirection: row.sync_direction,
    syncEnabled: row.sync_enabled,
    lastSyncStartedAt: row.last_sync_started_at,
    lastSyncFinishedAt: row.last_sync_finished_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMicrosoftRedirectUri() {
  return process.env.MICROSOFT_REDIRECT_URI?.trim() || DEFAULT_MICROSOFT_REDIRECT_URI;
}

export function getGoogleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || DEFAULT_GOOGLE_REDIRECT_URI;
}

export function getMicrosoftOAuthConfigStatus() {
  const requiredKeys = [
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_TENANT_ID",
    "MICROSOFT_REDIRECT_URI",
  ] as const;

  const missing = requiredKeys.filter((key) => !process.env[key]?.trim());

  return {
    ready: missing.length === 0,
    missing: [...missing],
    redirectUri: getMicrosoftRedirectUri(),
    requiredScopes: [...MICROSOFT_REQUIRED_SCOPES],
  };
}

export function getGoogleOAuthConfigStatus() {
  const requiredKeys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
  ] as const;

  const missing = requiredKeys.filter((key) => !process.env[key]?.trim());

  return {
    ready: missing.length === 0,
    missing: [...missing],
    redirectUri: getGoogleRedirectUri(),
    requiredScopes: [...GOOGLE_REQUIRED_SCOPES],
  };
}

export function createMicrosoftOAuthState() {
  return crypto.randomUUID();
}

export function createGoogleOAuthState() {
  return crypto.randomUUID();
}

export function buildMicrosoftAuthorizationUrl(state: string) {
  const status = getMicrosoftOAuthConfigStatus();
  if (!status.ready) {
    throw new Error(
      `Microsoft OAuth konfiguráció hiányos: ${status.missing.join(", ")}`,
    );
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "common";
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const redirectUri = getMicrosoftRedirectUri();
  const url = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  );

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

export function buildGoogleAuthorizationUrl(state: string) {
  const status = getGoogleOAuthConfigStatus();
  if (!status.ready) {
    throw new Error(
      `Google OAuth konfiguráció hiányos: ${status.missing.join(", ")}`,
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const redirectUri = getGoogleRedirectUri();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GOOGLE_REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");

  return url.toString();
}

export async function exchangeMicrosoftAuthorizationCode(
  code: string,
): Promise<MicrosoftOAuthTokenResponse> {
  const status = getMicrosoftOAuthConfigStatus();
  if (!status.ready) {
    throw new Error(
      `Microsoft OAuth konfiguráció hiányos: ${status.missing.join(", ")}`,
    );
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "common";
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams();

  body.set("client_id", process.env.MICROSOFT_CLIENT_ID?.trim() ?? "");
  body.set("client_secret", process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "");
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", getMicrosoftRedirectUri());
  body.set("scope", MICROSOFT_REQUIRED_SCOPES.join(" "));

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as MicrosoftOAuthTokenResponse;

  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || "Microsoft token csere sikertelen",
    );
  }

  return payload;
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
): Promise<GoogleOAuthTokenResponse> {
  const status = getGoogleOAuthConfigStatus();
  if (!status.ready) {
    throw new Error(
      `Google OAuth konfiguráció hiányos: ${status.missing.join(", ")}`,
    );
  }

  const body = new URLSearchParams();

  body.set("client_id", process.env.GOOGLE_CLIENT_ID?.trim() ?? "");
  body.set("client_secret", process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "");
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", getGoogleRedirectUri());

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json()) as GoogleOAuthTokenResponse;

  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || "Google token csere sikertelen",
    );
  }

  return payload;
}

export async function fetchMicrosoftGraphUser(
  accessToken: string,
): Promise<MicrosoftGraphUser> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Microsoft Graph /me lekérdezés sikertelen");
  }

  return (await response.json()) as MicrosoftGraphUser;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Google userinfo lekérdezés sikertelen");
  }

  return (await response.json()) as GoogleUserInfo;
}

export function createMicrosoftCredentialRef(externalUserId: string | null) {
  const suffix = externalUserId || crypto.randomUUID();
  return `microsoft-outlook:${suffix}`;
}

export function createGoogleCredentialRef(externalUserId: string | null) {
  const suffix = externalUserId || crypto.randomUUID();
  return `google-calendar:${suffix}`;
}

export function getTokenExpiryIso(expiresInSeconds?: number) {
  if (!expiresInSeconds) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}
