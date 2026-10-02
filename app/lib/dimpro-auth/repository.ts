import type { PoolClient } from "pg";
import { authQuery, withAuthTransaction } from "./db";
import { getDimproAuthConfig } from "./config";
import {
  DIMPRO_AUTH_PURPOSE_LOGIN,
  createDimproAuthSessionToken,
  hashDimproAuthEmailForAudit,
  hashDimproAuthOtp,
  hashDimproAuthSessionToken,
  verifyDimproAuthOtpHash,
} from "./security";
import { DimproAuthError, type DimproAuthSession, type DimproAuthUser, type DimproAuthUserLevel } from "./types";

type UserRow = {
  id: string;
  email_original: string;
  email_normalized: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  security_level: DimproAuthUserLevel;
  login_enabled: boolean;
  email_verified_at: Date | string | null;
};

type ChallengeRow = {
  id: string;
  user_id: string | null;
  email_normalized: string;
  purpose: string;
  code_hash: Buffer;
  expires_at: Date | string;
  attempts: number;
  max_attempts: number;
  consumed_at: Date | string | null;
  invalidated_at: Date | string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  security_level: DimproAuthUserLevel;
  created_at: Date | string;
  last_seen_at: Date | string;
  absolute_expires_at: Date | string;
  inactivity_expires_at: Date | string;
  email_original: string;
  email_normalized: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  email_verified_at: Date | string | null;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function userFromRow(row: UserRow): DimproAuthUser {
  return {
    id: row.id,
    email: row.email_original || row.email_normalized,
    displayName: row.display_name,
    status: row.status,
    securityLevel: row.security_level,
    emailVerifiedAt: row.email_verified_at ? iso(row.email_verified_at) : null,
  };
}

async function appendAudit(client: PoolClient | null, input: {
  eventType: string;
  userId?: string | null;
  email?: string | null;
  method?: string | null;
  result: string;
  ip?: string | null;
  userAgent?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
}) {
  const query = client ? client.query.bind(client) : authQuery;
  await query(
    `INSERT INTO auth_audit_events(event_type,user_id,email_hash,method,result,ip_address,user_agent,correlation_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::inet,$7,$8,$9::jsonb)`,
    [
      input.eventType,
      input.userId || null,
      input.email ? hashDimproAuthEmailForAudit(input.email) : null,
      input.method || null,
      input.result,
      input.ip || null,
      input.userAgent || null,
      input.correlationId,
      JSON.stringify(input.metadata || {}),
    ],
  );
}

export async function getActiveAuthUserByEmail(email: string) {
  const result = await authQuery<UserRow>(
    `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,email_verified_at
       FROM auth_users WHERE email_normalized=$1 LIMIT 1`,
    [email],
  );
  const row = result.rows[0] || null;
  if (!row || row.status !== "ACTIVE" || !row.login_enabled) return null;
  return userFromRow(row);
}

export async function issueLoginOtp(input: {
  email: string;
  code: string;
  ip: string | null;
  userAgent: string;
  correlationId: string;
}) {
  const config = getDimproAuthConfig();
  return withAuthTransaction(async (client) => {
    const userResult = await client.query<UserRow>(
      `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,email_verified_at
         FROM auth_users WHERE email_normalized=$1 LIMIT 1 FOR SHARE`,
      [input.email],
    );
    const userRow = userResult.rows[0] || null;
    const user = userRow && userRow.status === "ACTIVE" && userRow.login_enabled ? userFromRow(userRow) : null;

    const latest = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM auth_email_challenges
       WHERE email_normalized=$1 AND purpose=$2
       ORDER BY created_at DESC LIMIT 1`,
      [input.email, DIMPRO_AUTH_PURPOSE_LOGIN],
    );
    if (latest.rows[0]) {
      const elapsedSeconds = (Date.now() - new Date(latest.rows[0].created_at).getTime()) / 1000;
      if (elapsedSeconds < config.otpResendCooldownSeconds) {
        await appendAudit(client, {
          eventType: "OTP_REQUEST", userId: user?.id, email: input.email, method: "EMAIL_OTP", result: "COOLDOWN",
          ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
        });
        throw new DimproAuthError("OTP resend cooldown active.", "AUTH_OTP_COOLDOWN", 429, "Várj röviden az új kód kérése előtt.");
      }
    }

    const emailCount = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_email_challenges
       WHERE email_normalized=$1 AND created_at >= now() - ($2::text || ' minutes')::interval`,
      [input.email, config.otpEmailWindowMinutes],
    );
    if (Number(emailCount.rows[0]?.count || 0) >= config.otpEmailWindowMaxRequests) {
      await appendAudit(client, {
        eventType: "OTP_REQUEST", userId: user?.id, email: input.email, method: "EMAIL_OTP", result: "RATE_LIMIT_EMAIL",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
      });
      throw new DimproAuthError("OTP email rate limit exceeded.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.");
    }

    if (input.ip) {
      const ipCount = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth_email_challenges
         WHERE requested_ip=$1::inet AND created_at >= now() - ($2::text || ' minutes')::interval`,
        [input.ip, config.otpIpWindowMinutes],
      );
      if (Number(ipCount.rows[0]?.count || 0) >= config.otpIpWindowMaxRequests) {
        await appendAudit(client, {
          eventType: "OTP_REQUEST", userId: user?.id, email: input.email, method: "EMAIL_OTP", result: "RATE_LIMIT_IP",
          ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
        });
        throw new DimproAuthError("OTP IP rate limit exceeded.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.");
      }
    }

    await client.query(
      `UPDATE auth_email_challenges SET invalidated_at=now()
       WHERE email_normalized=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [input.email, DIMPRO_AUTH_PURPOSE_LOGIN],
    );

    const expiresAt = new Date(Date.now() + config.otpTtlSeconds * 1000);
    const challenge = await client.query<{ id: string }>(
      `INSERT INTO auth_email_challenges(user_id,email_normalized,purpose,code_hash,expires_at,max_attempts,requested_ip,requested_user_agent,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9) RETURNING id`,
      [
        user?.id || null,
        input.email,
        DIMPRO_AUTH_PURPOSE_LOGIN,
        hashDimproAuthOtp(input.email, DIMPRO_AUTH_PURPOSE_LOGIN, input.code),
        expiresAt,
        config.otpMaxAttempts,
        input.ip,
        input.userAgent,
        input.correlationId,
      ],
    );
    await appendAudit(client, {
      eventType: "OTP_REQUEST", userId: user?.id, email: input.email, method: "EMAIL_OTP", result: "ACCEPTED",
      ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
      metadata: { challengeId: challenge.rows[0]?.id || null, deliverable: Boolean(user) },
    });
    return { user, expiresAt, challengeId: challenge.rows[0]!.id };
  });
}

export async function verifyLoginOtp(input: {
  email: string;
  code: string;
  ip: string | null;
  userAgent: string;
  correlationId: string;
}) {
  const config = getDimproAuthConfig();
  return withAuthTransaction(async (client) => {
    const challengeResult = await client.query<ChallengeRow>(
      `SELECT id,user_id,email_normalized,purpose,code_hash,expires_at,attempts,max_attempts,consumed_at,invalidated_at
       FROM auth_email_challenges
       WHERE email_normalized=$1 AND purpose=$2
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.email, DIMPRO_AUTH_PURPOSE_LOGIN],
    );
    const challenge = challengeResult.rows[0] || null;
    if (!challenge || challenge.consumed_at || challenge.invalidated_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      await appendAudit(client, {
        eventType: "OTP_VERIFY", userId: challenge?.user_id, email: input.email, method: "EMAIL_OTP", result: "INVALID_OR_EXPIRED",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
      });
      throw new DimproAuthError("OTP missing, expired or invalidated.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.");
    }
    if (challenge.attempts >= challenge.max_attempts) {
      throw new DimproAuthError("OTP attempt limit reached.", "AUTH_OTP_ATTEMPTS_EXCEEDED", 429, "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.");
    }

    const valid = verifyDimproAuthOtpHash(challenge.code_hash, input.email, challenge.purpose, input.code);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await client.query(`UPDATE auth_email_challenges SET attempts=$2 WHERE id=$1`, [challenge.id, attempts]);
      await appendAudit(client, {
        eventType: "OTP_VERIFY", userId: challenge.user_id, email: input.email, method: "EMAIL_OTP", result: "INVALID_CODE",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { attempts },
      });
      if (attempts >= challenge.max_attempts) {
        throw new DimproAuthError("OTP attempt limit reached.", "AUTH_OTP_ATTEMPTS_EXCEEDED", 429, "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.");
      }
      throw new DimproAuthError("OTP mismatch.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.");
    }

    if (!challenge.user_id) {
      await client.query(`UPDATE auth_email_challenges SET attempts=attempts+1 WHERE id=$1`, [challenge.id]);
      throw new DimproAuthError("Unknown user challenge cannot authenticate.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.");
    }

    const userResult = await client.query<UserRow>(
      `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,email_verified_at
       FROM auth_users WHERE id=$1 LIMIT 1 FOR SHARE`,
      [challenge.user_id],
    );
    const row = userResult.rows[0] || null;
    if (!row || row.status !== "ACTIVE" || !row.login_enabled) {
      throw new DimproAuthError("User is not active.", "AUTH_USER_NOT_ACTIVE", 403, "A fiók jelenleg nem használható belépésre.");
    }

    await client.query(`UPDATE auth_email_challenges SET consumed_at=now() WHERE id=$1`, [challenge.id]);
    if (!row.email_verified_at) {
      await client.query(`UPDATE auth_users SET email_verified_at=now(),updated_at=now() WHERE id=$1`, [row.id]);
      row.email_verified_at = new Date();
    }

    const token = createDimproAuthSessionToken();
    const absoluteExpiresAt = new Date(Date.now() + config.sessionAbsoluteSeconds * 1000);
    const inactivityExpiresAt = new Date(Date.now() + config.sessionInactivitySeconds * 1000);
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions(user_id,token_hash,security_level,absolute_expires_at,inactivity_expires_at,ip_created,user_agent,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6::inet,$7,$8) RETURNING id`,
      [row.id, hashDimproAuthSessionToken(token), row.security_level, absoluteExpiresAt, inactivityExpiresAt, input.ip, input.userAgent, input.correlationId],
    );
    await appendAudit(client, {
      eventType: "LOGIN_SUCCESS", userId: row.id, email: input.email, method: "EMAIL_OTP", result: "SUCCESS",
      ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { sessionId: session.rows[0]!.id },
    });
    return {
      token,
      user: userFromRow(row),
      absoluteExpiresAt,
      inactivityExpiresAt,
      sessionId: session.rows[0]!.id,
    };
  });
}

export async function getAuthSessionByToken(token: string, touch = true): Promise<DimproAuthSession | null> {
  if (!token || token.length < 32 || token.length > 200) return null;
  const config = getDimproAuthConfig();
  const result = await authQuery<SessionRow>(
    `SELECT s.id,s.user_id,s.security_level,s.created_at,s.last_seen_at,s.absolute_expires_at,s.inactivity_expires_at,
            u.email_original,u.email_normalized,u.display_name,u.status,u.email_verified_at
       FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL
        AND s.absolute_expires_at>now() AND s.inactivity_expires_at>now()
        AND u.status='ACTIVE' AND u.login_enabled=true
      LIMIT 1`,
    [hashDimproAuthSessionToken(token)],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  const now = Date.now();
  const lastSeen = new Date(row.last_seen_at).getTime();
  let inactivityExpiresAt = new Date(row.inactivity_expires_at);
  if (touch && now - lastSeen >= config.sessionTouchIntervalSeconds * 1000) {
    const proposed = new Date(now + config.sessionInactivitySeconds * 1000);
    const absolute = new Date(row.absolute_expires_at);
    inactivityExpiresAt = proposed.getTime() > absolute.getTime() ? absolute : proposed;
    await authQuery(
      `UPDATE auth_sessions SET last_seen_at=now(), inactivity_expires_at=$2 WHERE id=$1 AND revoked_at IS NULL`,
      [row.id, inactivityExpiresAt],
    );
  }
  return {
    id: row.id,
    user: userFromRow({ ...row, login_enabled: true }),
    createdAt: iso(row.created_at),
    lastSeenAt: touch ? new Date().toISOString() : iso(row.last_seen_at),
    absoluteExpiresAt: iso(row.absolute_expires_at),
    inactivityExpiresAt: inactivityExpiresAt.toISOString(),
  };
}

export async function revokeAuthSession(token: string, reason: string, correlationId: string) {
  if (!token) return false;
  const result = await withAuthTransaction(async (client) => {
    const current = await client.query<{ id: string; user_id: string }>(
      `SELECT id,user_id FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL LIMIT 1 FOR UPDATE`,
      [hashDimproAuthSessionToken(token)],
    );
    const row = current.rows[0];
    if (!row) return false;
    await client.query(`UPDATE auth_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1`, [row.id, reason.slice(0, 240)]);
    await appendAudit(client, {
      eventType: "SESSION_REVOKE", userId: row.user_id, method: "SESSION", result: "SUCCESS", correlationId,
      metadata: { sessionId: row.id, reason: reason.slice(0, 240) },
    });
    return true;
  });
  return result;
}

export async function getAuthDatabaseHealth() {
  const result = await authQuery<{ version: string }>("SELECT current_setting('server_version') AS version");
  const migration = await authQuery<{ count: string }>("SELECT count(*)::text AS count FROM auth_schema_migrations");
  return { database: true, serverVersion: result.rows[0]?.version || "unknown", migrationCount: Number(migration.rows[0]?.count || 0) };
}

export async function hasAuthPermission(input: { userId: string; permissionCode: string; productCode?: string | null }) {
  const productCode = input.productCode?.trim().toUpperCase() || null;
  const result = await authQuery<{ allowed: boolean }>(
    `SELECT EXISTS(
       SELECT 1
         FROM auth_access_grants g
         JOIN auth_role_permissions rp ON rp.role_id=g.role_id
         JOIN auth_permissions p ON p.id=rp.permission_id
         LEFT JOIN auth_products product ON product.id=g.product_id
        WHERE g.user_id=$1
          AND p.code=$2
          AND g.revoked_at IS NULL
          AND g.valid_from<=now()
          AND (g.valid_until IS NULL OR g.valid_until>=now())
          AND ($3::text IS NULL OR product.code=$3)
     ) AS allowed`,
    [input.userId, input.permissionCode, productCode],
  );
  return Boolean(result.rows[0]?.allowed);
}
