import "server-only";

import crypto from "node:crypto";

import { createClient } from "@/app/lib/supabase/server";
import {
  DEFAULT_GOOGLE_REDIRECT_URI,
  GOOGLE_REQUIRED_SCOPES,
} from "@/app/lib/calendar/integrations";

const GOOGLE_SYSTEM_ACCOUNT = "__dimprover_google_oauth_config__";

type SecretBox = {
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  value: string;
};

type StoredGoogleConfig = {
  clientId?: string;
  clientSecret?: string | SecretBox;
  redirectUri?: string;
};

function key() {
  const source =
    process.env.DIMPROVER_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "dimprover-local-key";
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptCalendarSecret(value: string): SecretBox {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    value: enc.toString("base64"),
  };
}

export function decryptCalendarSecret(value: string | SecretBox | undefined) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function mask(value: string) {
  if (!value) return "";
  return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : "••••••";
}

async function readStoredConfig(): Promise<StoredGoogleConfig | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("calendar_integrations")
      .select("encrypted_payload")
      .eq("provider", "google")
      .eq("account_email", GOOGLE_SYSTEM_ACCOUNT)
      .maybeSingle();

    if (error || !data?.encrypted_payload) return null;
    return data.encrypted_payload as StoredGoogleConfig;
  } catch {
    return null;
  }
}

export async function getResolvedGoogleOAuthConfig() {
  const stored = await readStoredConfig();
  const storedClientId = stored?.clientId?.trim() ?? "";
  const storedClientSecret = decryptCalendarSecret(stored?.clientSecret).trim();
  const storedRedirectUri = stored?.redirectUri?.trim() ?? "";
  const envClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const envRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() ?? "";

  return {
    clientId: storedClientId || envClientId,
    clientSecret: storedClientSecret || envClientSecret,
    redirectUri: storedRedirectUri || envRedirectUri || DEFAULT_GOOGLE_REDIRECT_URI,
    source:
      storedClientId || storedClientSecret || storedRedirectUri
        ? "database"
        : envClientId || envClientSecret || envRedirectUri
          ? "environment"
          : "default",
  };
}

export async function getGoogleOAuthConfigStatusFromStorage() {
  const config = await getResolvedGoogleOAuthConfig();
  const missing: string[] = [];
  if (!config.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("GOOGLE_REDIRECT_URI");

  return {
    ready: missing.length === 0,
    missing,
    redirectUri: config.redirectUri,
    requiredScopes: [...GOOGLE_REQUIRED_SCOPES],
    source: config.source,
    clientIdMasked: mask(config.clientId),
    clientSecretSet: Boolean(config.clientSecret),
  };
}

export async function saveGoogleOAuthConfig(input: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}) {
  const current = await readStoredConfig();
  const payload: StoredGoogleConfig = {
    clientId: input.clientId.trim(),
    redirectUri: input.redirectUri.trim() || DEFAULT_GOOGLE_REDIRECT_URI,
    clientSecret: input.clientSecret?.trim()
      ? encryptCalendarSecret(input.clientSecret.trim())
      : current?.clientSecret,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_integrations").upsert(
    {
      provider: "google",
      display_name: "DIMPROVER Google OAuth konfiguráció",
      account_email: GOOGLE_SYSTEM_ACCOUNT,
      tenant_id: null,
      external_user_id: null,
      credential_ref: "system:google-oauth-config",
      encrypted_payload: payload,
      credential_expires_at: null,
      scopes: [...GOOGLE_REQUIRED_SCOPES],
      sync_direction: "read_only",
      sync_enabled: false,
      last_sync_status: "not_started",
      last_sync_error: null,
    },
    { onConflict: "provider,account_email" },
  );

  if (error) throw new Error(error.message);
  return getGoogleOAuthConfigStatusFromStorage();
}

function assertGoogleConfig(config: Awaited<ReturnType<typeof getResolvedGoogleOAuthConfig>>) {
  const missing: string[] = [];
  if (!config.clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("GOOGLE_REDIRECT_URI");
  if (missing.length > 0) {
    throw new Error(`Google OAuth konfiguráció hiányos: ${missing.join(", ")}`);
  }
}

export async function buildStoredGoogleAuthorizationUrl(state: string) {
  const config = await getResolvedGoogleOAuthConfig();
  assertGoogleConfig(config);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", GOOGLE_REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export async function exchangeStoredGoogleAuthorizationCode(code: string) {
  const config = await getResolvedGoogleOAuthConfig();
  assertGoogleConfig(config);

  const body = new URLSearchParams();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", config.redirectUri);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || "Google token csere sikertelen",
    );
  }

  return payload as {
    token_type?: string;
    scope?: string;
    expires_in?: number;
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
}

export async function refreshStoredGoogleAccessToken(refreshToken: string) {
  const config = await getResolvedGoogleOAuthConfig();
  assertGoogleConfig(config);

  const body = new URLSearchParams();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || "Google refresh token csere sikertelen",
    );
  }

  return payload as {
    token_type?: string;
    scope?: string;
    expires_in?: number;
    access_token?: string;
  };
}
