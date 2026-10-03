export type DimproAuthConfig = {
  environment: "DEV" | "PROD";
  databaseUrl: string;
  otpPepper: string;
  sessionPepper: string;
  auditPepper: string;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpEmailWindowMinutes: number;
  otpEmailWindowMaxRequests: number;
  otpIpWindowMinutes: number;
  otpIpWindowMaxRequests: number;
  ssoWindowMinutes: number;
  ssoAuthorizeIpMaxRequests: number;
  ssoTokenIpMaxRequests: number;
  sessionAbsoluteSeconds: number;
  sessionInactivitySeconds: number;
  sessionTouchIntervalSeconds: number;
  dbSslMode: "verify-full";
};

function requiredSecret(name: string, minimumLength = 32) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength || value.includes("<") || value.includes(">")) {
    throw new Error(`${name} nincs biztonságosan beállítva.`);
  }
  return value;
}

function boundedInteger(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function getDimproAuthConfig(): DimproAuthConfig {
  const rawEnvironment = process.env.DIMPRO_AUTH_ENVIRONMENT?.trim().toUpperCase();
  if (rawEnvironment !== "DEV" && rawEnvironment !== "PROD") {
    throw new Error("DIMPRO_AUTH_ENVIRONMENT kötelező és csak DEV vagy PROD lehet.");
  }
  const environment = rawEnvironment as "DEV" | "PROD";
  const databaseUrl = process.env.DIMPRO_AUTH_DATABASE_URL?.trim();
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("DIMPRO_AUTH_DATABASE_URL nincs beállítva.");
  }
  let parsedDatabaseUrl: URL;
  try { parsedDatabaseUrl = new URL(databaseUrl); }
  catch { throw new Error("DIMPRO_AUTH_DATABASE_URL nem érvényes PostgreSQL URL."); }
  const expectedDatabase = environment === "DEV" ? "dimpro_auth_dev" : "dimpro_auth_prod";
  const expectedUser = environment === "DEV" ? "dimpro_auth_app_dev" : "dimpro_auth_app_prod";
  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
  const databaseUser = decodeURIComponent(parsedDatabaseUrl.username);
  if (parsedDatabaseUrl.hostname !== "db.dimpro.hu" || databaseName !== expectedDatabase || databaseUser !== expectedUser) {
    throw new Error(`DIMPRO AUTH ${environment} adatbázis-kapcsolat eltér a kötelező host/database/runtime-role kötéstől.`);
  }
  const sslMode = (process.env.DIMPRO_AUTH_DB_SSL_MODE || "verify-full").trim().toLowerCase();
  if (sslMode !== "verify-full") {
    throw new Error("DIMPRO_AUTH_DB_SSL_MODE=verify-full kötelező a DIMPRO AUTH runtime-hoz.");
  }
  return {
    environment,
    databaseUrl,
    otpPepper: requiredSecret("DIMPRO_AUTH_OTP_PEPPER"),
    sessionPepper: requiredSecret("DIMPRO_AUTH_SESSION_PEPPER"),
    auditPepper: requiredSecret("DIMPRO_AUTH_AUDIT_PEPPER"),
    otpTtlSeconds: boundedInteger("DIMPRO_AUTH_OTP_TTL_SECONDS", 5 * 60, 60, 15 * 60),
    otpMaxAttempts: boundedInteger("DIMPRO_AUTH_OTP_MAX_ATTEMPTS", 5, 1, 10),
    otpResendCooldownSeconds: boundedInteger("DIMPRO_AUTH_OTP_RESEND_COOLDOWN_SECONDS", 30, 5, 300),
    otpEmailWindowMinutes: boundedInteger("DIMPRO_AUTH_OTP_EMAIL_WINDOW_MINUTES", 15, 1, 120),
    otpEmailWindowMaxRequests: boundedInteger("DIMPRO_AUTH_OTP_EMAIL_WINDOW_MAX_REQUESTS", 5, 1, 50),
    otpIpWindowMinutes: boundedInteger("DIMPRO_AUTH_OTP_IP_WINDOW_MINUTES", 15, 1, 120),
    otpIpWindowMaxRequests: boundedInteger("DIMPRO_AUTH_OTP_IP_WINDOW_MAX_REQUESTS", 20, 1, 200),
    ssoWindowMinutes: boundedInteger("DIMPRO_AUTH_SSO_WINDOW_MINUTES", 10, 1, 60),
    ssoAuthorizeIpMaxRequests: boundedInteger("DIMPRO_AUTH_SSO_AUTHORIZE_IP_MAX_REQUESTS", 60, 5, 500),
    ssoTokenIpMaxRequests: boundedInteger("DIMPRO_AUTH_SSO_TOKEN_IP_MAX_REQUESTS", 120, 5, 1000),
    sessionAbsoluteSeconds: boundedInteger("DIMPRO_AUTH_SESSION_ABSOLUTE_SECONDS", 14 * 86400, 300, 30 * 86400),
    sessionInactivitySeconds: boundedInteger("DIMPRO_AUTH_SESSION_INACTIVITY_SECONDS", 24 * 3600, 300, 14 * 86400),
    sessionTouchIntervalSeconds: boundedInteger("DIMPRO_AUTH_SESSION_TOUCH_INTERVAL_SECONDS", 5 * 60, 30, 3600),
    dbSslMode: "verify-full",
  };
}
