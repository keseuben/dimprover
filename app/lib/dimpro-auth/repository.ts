import type { PoolClient } from "pg";
import { authQuery, withAuthTransaction } from "./db";
import { getDimproAuthConfig } from "./config";
import { getDimproAuthSessionPolicy } from "./session-policy";
import {
  DIMPRO_AUTH_PURPOSE_LOGIN,
  createDimproAuthSessionToken,
  hashDimproAuthEmailForAudit,
  hashDimproAuthOtp,
  hashDimproAuthSessionToken,
  verifyDimproAuthOtpHash,
} from "./security";
import { DimproAuthError, type DimproAuthSession, type DimproAuthUser, type DimproAuthUserLevel } from "./types";
import {
  createAppSessionToken,
  createPkceChallenge,
  hashAppSessionToken,
  hashAuthorizationCode,
} from "./sso";

type UserRow = {
  id: string;
  email_original: string;
  email_normalized: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  security_level: DimproAuthUserLevel;
  login_enabled: boolean;
  session_version: number;
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
  session_version: number;
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

async function lockAuthRateKey(client: PoolClient, scope: string, value: string) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
    [`dimpro-auth:${scope}:${value}`],
  );
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

export async function recordAuthAuditEvent(input: {
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
  return appendAudit(null, input);
}

export async function getActiveAuthUserByEmail(email: string) {
  const result = await authQuery<UserRow>(
    `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,session_version,email_verified_at
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
    await lockAuthRateKey(client, "otp-email", input.email);
    if (input.ip) await lockAuthRateKey(client, "otp-ip", input.ip);
    const userResult = await client.query<UserRow>(
      `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,session_version,email_verified_at
         FROM auth_users WHERE email_normalized=$1 LIMIT 1 FOR SHARE`,
      [input.email],
    );
    const userRow = userResult.rows[0] || null;
    const user = userRow
      && userRow.status === "ACTIVE"
      && userRow.login_enabled
      && userRow.security_level === "SIMPLE"
      ? userFromRow(userRow)
      : null;

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
        throw new DimproAuthError("OTP resend cooldown active.", "AUTH_OTP_COOLDOWN", 429, "Várj röviden az új kód kérése előtt.", { commitTransaction: true });
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
      throw new DimproAuthError("OTP email rate limit exceeded.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.", { commitTransaction: true });
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
        throw new DimproAuthError("OTP IP rate limit exceeded.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.", { commitTransaction: true });
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
  return withAuthTransaction(async (client) => {
    const auditLoginFailure = async (result: string, userId?: string | null, metadata: Record<string, unknown> = {}) => {
      await appendAudit(client, {
        eventType: "LOGIN_FAILURE",
        userId: userId || null,
        email: input.email,
        method: "EMAIL_OTP",
        result,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata,
      });
    };
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
      await auditLoginFailure("INVALID_OR_EXPIRED", challenge?.user_id);
      throw new DimproAuthError("OTP missing, expired or invalidated.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.", { commitTransaction: true });
    }
    if (challenge.attempts >= challenge.max_attempts) {
      await auditLoginFailure("ATTEMPTS_EXCEEDED", challenge.user_id, { attempts: challenge.attempts });
      throw new DimproAuthError("OTP attempt limit reached.", "AUTH_OTP_ATTEMPTS_EXCEEDED", 429, "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.", { commitTransaction: true });
    }

    const valid = verifyDimproAuthOtpHash(challenge.code_hash, input.email, challenge.purpose, input.code);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await client.query(`UPDATE auth_email_challenges SET attempts=$2 WHERE id=$1`, [challenge.id, attempts]);
      await appendAudit(client, {
        eventType: "OTP_VERIFY", userId: challenge.user_id, email: input.email, method: "EMAIL_OTP", result: "INVALID_CODE",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { attempts },
      });
      await auditLoginFailure(attempts >= challenge.max_attempts ? "ATTEMPTS_EXCEEDED" : "INVALID_CODE", challenge.user_id, { attempts });
      if (attempts >= challenge.max_attempts) {
        throw new DimproAuthError("OTP attempt limit reached.", "AUTH_OTP_ATTEMPTS_EXCEEDED", 429, "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.", { commitTransaction: true });
      }
      throw new DimproAuthError("OTP mismatch.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.", { commitTransaction: true });
    }

    if (!challenge.user_id) {
      await client.query(`UPDATE auth_email_challenges SET attempts=attempts+1 WHERE id=$1`, [challenge.id]);
      await auditLoginFailure("UNKNOWN_USER_CHALLENGE");
      throw new DimproAuthError("Unknown user challenge cannot authenticate.", "AUTH_OTP_INVALID", 400, "A belépési kód hibás vagy lejárt.", { commitTransaction: true });
    }

    const userResult = await client.query<UserRow>(
      `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,session_version,email_verified_at
       FROM auth_users WHERE id=$1 LIMIT 1 FOR SHARE`,
      [challenge.user_id],
    );
    const row = userResult.rows[0] || null;
    if (!row || row.status !== "ACTIVE" || !row.login_enabled) {
      await auditLoginFailure("USER_NOT_ACTIVE", challenge.user_id);
      throw new DimproAuthError("User is not active.", "AUTH_USER_NOT_ACTIVE", 403, "A fiók jelenleg nem használható belépésre.", { commitTransaction: true });
    }
    if (row.security_level !== "SIMPLE") {
      await auditLoginFailure("STRONG_AUTH_REQUIRED", row.id, { securityLevel: row.security_level });
      throw new DimproAuthError(
        "Strong authentication is required for this security level.",
        "AUTH_STRONG_AUTH_REQUIRED",
        403,
        "Ehhez a fiókhoz erősebb hitelesítés szükséges; az e-mail-kódos belépés nem engedélyezett.",
        { commitTransaction: true },
      );
    }

    await client.query(`UPDATE auth_email_challenges SET consumed_at=now() WHERE id=$1`, [challenge.id]);
    if (!row.email_verified_at) {
      await client.query(`UPDATE auth_users SET email_verified_at=now(),updated_at=now() WHERE id=$1`, [row.id]);
      row.email_verified_at = new Date();
    }

    const token = createDimproAuthSessionToken();
    const sessionPolicy = getDimproAuthSessionPolicy(row.security_level);
    const sessionNow = Date.now();
    const absoluteExpiresAt = new Date(sessionNow + sessionPolicy.absoluteSeconds * 1000);
    const inactivityExpiresAt = new Date(Math.min(
      sessionNow + sessionPolicy.inactivitySeconds * 1000,
      absoluteExpiresAt.getTime(),
    ));
    const session = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions(user_id,token_hash,security_level,user_session_version,absolute_expires_at,inactivity_expires_at,ip_created,user_agent,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9) RETURNING id`,
      [row.id, hashDimproAuthSessionToken(token), row.security_level, row.session_version, absoluteExpiresAt, inactivityExpiresAt, input.ip, input.userAgent, input.correlationId],
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
            u.email_original,u.email_normalized,u.display_name,u.status,u.session_version,u.email_verified_at
       FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL
        AND s.absolute_expires_at>now() AND s.inactivity_expires_at>now()
        AND u.status='ACTIVE' AND u.login_enabled=true
        AND s.user_session_version=u.session_version
      LIMIT 1`,
    [hashDimproAuthSessionToken(token)],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  const now = Date.now();
  const lastSeen = new Date(row.last_seen_at).getTime();
  let inactivityExpiresAt = new Date(row.inactivity_expires_at);
  if (touch && now - lastSeen >= config.sessionTouchIntervalSeconds * 1000) {
    const sessionPolicy = getDimproAuthSessionPolicy(row.security_level);
    const proposed = new Date(now + sessionPolicy.inactivitySeconds * 1000);
    const absolute = new Date(row.absolute_expires_at);
    inactivityExpiresAt = proposed.getTime() > absolute.getTime() ? absolute : proposed;
    await authQuery(
      `UPDATE auth_sessions SET last_seen_at=now(), inactivity_expires_at=$2 WHERE id=$1 AND revoked_at IS NULL`,
      [row.id, inactivityExpiresAt],
    );
  }
  return {
    id: row.id,
    user: userFromRow({ ...row, id: row.user_id, login_enabled: true }),
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
          AND ($3::text IS NULL OR product.status='ACTIVE')
          AND g.revoked_at IS NULL
          AND g.valid_from<=now()
          AND (g.valid_until IS NULL OR g.valid_until>=now())
          AND ($3::text IS NULL OR product.code=$3)
     ) AS allowed`,
    [input.userId, input.permissionCode, productCode],
  );
  return Boolean(result.rows[0]?.allowed);
}

export async function hasProjectAuthPermission(input: {
  userId: string;
  projectId: string;
  permissionCode: string;
  productCode?: string | null;
}) {
  const productCode = input.productCode?.trim().toUpperCase() || null;
  const result = await authQuery<{ allowed: boolean }>(
    `SELECT EXISTS(
       SELECT 1
         FROM auth_access_grants g
         JOIN auth_role_permissions rp ON rp.role_id=g.role_id
         JOIN auth_permissions p ON p.id=rp.permission_id
         LEFT JOIN auth_products product ON product.id=g.product_id
         JOIN auth_projects project ON project.id=g.project_id AND project.status='ACTIVE'
        WHERE g.user_id=$1
          AND g.project_id=$2
          AND p.code=$3
          AND g.revoked_at IS NULL
          AND g.valid_from<=now()
          AND (g.valid_until IS NULL OR g.valid_until>=now())
          AND ($4::text IS NULL OR (product.status='ACTIVE' AND product.code=$4))
     ) AS allowed`,
    [input.userId, input.projectId, input.permissionCode, productCode],
  );
  return Boolean(result.rows[0]?.allowed);
}

export async function hasPersonalDriveAccess(userId: string) {
  const result = await authQuery<{ allowed: boolean }>(
    `SELECT EXISTS(
       SELECT 1
         FROM auth_access_grants g
         JOIN auth_role_permissions rp ON rp.role_id=g.role_id
         JOIN auth_permissions p ON p.id=rp.permission_id
         JOIN auth_products product ON product.id=g.product_id AND product.status='ACTIVE'
        WHERE g.user_id=$1
          AND product.code='DRIVE'
          AND p.code='drive.personal.access'
          AND g.project_id IS NULL
          AND g.revoked_at IS NULL
          AND g.valid_from<=now()
          AND (g.valid_until IS NULL OR g.valid_until>=now())
     ) AS allowed`,
    [userId],
  );
  return Boolean(result.rows[0]?.allowed);
}

export async function listAuthorizedProjectIds(userId: string, productCode = "DRIVE") {
  const normalizedProduct = productCode.trim().toUpperCase();
  const result = await authQuery<{ project_id: string }>(
    `SELECT DISTINCT g.project_id
       FROM auth_access_grants g
       JOIN auth_role_permissions rp ON rp.role_id=g.role_id
       JOIN auth_permissions p ON p.id=rp.permission_id
       JOIN auth_products product ON product.id=g.product_id AND product.status='ACTIVE'
       JOIN auth_projects project ON project.id=g.project_id AND project.status='ACTIVE'
      WHERE g.user_id=$1
        AND product.code=$2
        AND p.code='drive.project.access'
        AND g.project_id IS NOT NULL
        AND g.revoked_at IS NULL
        AND g.valid_from<=now()
        AND (g.valid_until IS NULL OR g.valid_until>=now())
      ORDER BY g.project_id`,
    [userId, normalizedProduct],
  );
  return result.rows.map((row) => row.project_id);
}

export async function getAuthProjectScopeByExternalId(externalProjectId: string) {
  const result = await authQuery<{ id: string; external_project_id: string; name: string; status: string }>(
    `SELECT id,external_project_id,name,status
       FROM auth_projects
      WHERE external_project_id=$1
      LIMIT 1`,
    [externalProjectId.trim()],
  );
  const row = result.rows[0];
  return row ? { id: row.id, externalProjectId: row.external_project_id, name: row.name, status: row.status } : null;
}

export async function listAuthorizedExternalProjectIds(userId: string, productCode = "DRIVE") {
  const normalizedProduct = productCode.trim().toUpperCase();
  const result = await authQuery<{ external_project_id: string }>(
    `SELECT DISTINCT project.external_project_id
       FROM auth_access_grants g
       JOIN auth_role_permissions rp ON rp.role_id=g.role_id
       JOIN auth_permissions p ON p.id=rp.permission_id
       JOIN auth_products product ON product.id=g.product_id AND product.status='ACTIVE'
       JOIN auth_projects project ON project.id=g.project_id AND project.status='ACTIVE'
      WHERE g.user_id=$1
        AND product.code=$2
        AND p.code='drive.project.access'
        AND project.external_project_id IS NOT NULL
        AND g.revoked_at IS NULL
        AND g.valid_from<=now()
        AND (g.valid_until IS NULL OR g.valid_until>=now())
      ORDER BY project.external_project_id`,
    [userId, normalizedProduct],
  );
  return result.rows.map((row) => row.external_project_id);
}

export async function registerAuthProjectScope(input: { actorUserId: string; externalProjectId: string; projectName: string }) {
  const result = await authQuery<{ project_id: string }>(
    `SELECT auth_register_project_scope($1,$2,$3) AS project_id`,
    [input.actorUserId, input.externalProjectId, input.projectName],
  );
  const projectId = result.rows[0]?.project_id;
  if (!projectId) throw new Error("AUTH_PROJECT_SCOPE_REGISTER_EMPTY_RESULT");
  return projectId;
}

type AuthClientRow = {
  id: string;
  client_id: string;
  product_code: string;
  required_permission_code: string;
  environment: "DEV" | "PROD";
  status: "ACTIVE" | "DISABLED";
};

type AuthorizationRequestRow = {
  id: string;
  client_db_id: string;
  client_id: string;
  product_code: string;
  required_permission_code: string;
  environment: "DEV" | "PROD";
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  expires_at: Date | string;
  consumed_at: Date | string | null;
};

type AuthorizationCodeRow = {
  id: string;
  client_db_id: string;
  client_id: string;
  product_code: string;
  required_permission_code: string;
  environment: "DEV" | "PROD";
  user_id: string;
  auth_session_id: string;
  auth_session_absolute_expires_at: Date | string;
  auth_session_inactivity_expires_at: Date | string;
  auth_session_valid: boolean;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  expires_at: Date | string;
  consumed_at: Date | string | null;
};

type AppSessionRow = SessionRow & {
  client_db_id: string;
  client_id: string;
  auth_session_id: string;
  parent_last_seen_at: Date | string;
  parent_absolute_expires_at: Date | string;
  parent_inactivity_expires_at: Date | string;
};

export async function getAuthClient(clientId: string, redirectUri?: string | null, environment?: "DEV" | "PROD" | null) {
  const result = await authQuery<AuthClientRow>(
    `SELECT c.id,c.client_id,c.product_code,c.required_permission_code,c.environment,c.status
       FROM auth_clients c
       JOIN auth_products client_product ON client_product.code=c.product_code AND client_product.status='ACTIVE'
      WHERE c.client_id=$1 AND c.status='ACTIVE'
        AND ($2::text IS NULL OR EXISTS(
          SELECT 1 FROM auth_client_redirect_uris r
           WHERE r.client_id=c.id AND r.redirect_uri=$2
        ))
        AND ($3::text IS NULL OR c.environment=$3)
      LIMIT 1`,
    [clientId, redirectUri || null, environment || null],
  );
  return result.rows[0] || null;
}

export async function createAuthorizationRequest(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  environment: "DEV" | "PROD";
  ip: string | null;
  userAgent: string;
  correlationId: string;
}) {
  const config = getDimproAuthConfig();
  return withAuthTransaction(async (client) => {
    if (input.ip) {
      await lockAuthRateKey(client, "sso-authorize-ip", input.ip);
      const recent = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth_audit_events
         WHERE event_type='SSO_AUTHORIZE_REQUEST' AND ip_address=$1::inet
           AND created_at >= now() - ($2::text || ' minutes')::interval`,
        [input.ip, config.ssoWindowMinutes],
      );
      if (Number(recent.rows[0]?.count || 0) >= config.ssoAuthorizeIpMaxRequests) {
        await appendAudit(client, {
          eventType: "SSO_AUTHORIZE_REQUEST", method: "AUTHORIZATION_CODE", result: "RATE_LIMIT_IP",
          ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { clientId: input.clientId },
        });
        throw new DimproAuthError("SSO authorize IP rate limit exceeded.", "AUTH_SSO_RATE_LIMIT", 429, "Túl sok belépési kérés történt. Próbáld újra később.", { commitTransaction: true });
      }
    }

    const clientResult = await client.query<AuthClientRow>(
      `SELECT c.id,c.client_id,c.product_code,c.required_permission_code,c.environment,c.status
         FROM auth_clients c
         JOIN auth_products client_product ON client_product.code=c.product_code AND client_product.status='ACTIVE'
        WHERE c.client_id=$1 AND c.status='ACTIVE' AND c.environment=$3
          AND EXISTS(SELECT 1 FROM auth_client_redirect_uris r WHERE r.client_id=c.id AND r.redirect_uri=$2)
        LIMIT 1`,
      [input.clientId, input.redirectUri, input.environment],
    );
    const authClient = clientResult.rows[0] || null;
    if (!authClient) {
      await appendAudit(client, {
        eventType: "SSO_AUTHORIZE_REQUEST", method: "AUTHORIZATION_CODE", result: "CLIENT_INVALID",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { clientId: input.clientId, environment: input.environment },
      });
      throw new DimproAuthError("Unknown client or redirect URI.", "AUTH_SSO_CLIENT_INVALID", 400, "Az alkalmazás visszatérési címe nem engedélyezett.", { commitTransaction: true });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const created = await client.query<{ id: string }>(
      `INSERT INTO auth_authorization_requests(client_id,redirect_uri,state,code_challenge,code_challenge_method,requested_ip,user_agent,expires_at)
       VALUES ($1,$2,$3,$4,'S256',$5::inet,$6,$7) RETURNING id`,
      [authClient.id, input.redirectUri, input.state, input.codeChallenge, input.ip, input.userAgent, expiresAt],
    );
    await appendAudit(client, {
      eventType: "SSO_AUTHORIZE_REQUEST", method: "AUTHORIZATION_CODE", result: "ACCEPTED",
      ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { clientId: input.clientId, requestId: created.rows[0]!.id, environment: input.environment },
    });
    return { requestId: created.rows[0]!.id, expiresAt };
  });
}

export async function issueAuthorizationCodeFromRequest(input: {
  requestId: string;
  authSession: DimproAuthSession;
  rawCode: string;
  correlationId: string;
}) {
  return withAuthTransaction(async (client) => {
    const request = await client.query<AuthorizationRequestRow>(
      `SELECT r.id,r.client_id AS client_db_id,c.client_id,c.product_code,c.required_permission_code,c.environment,r.redirect_uri,r.state,r.code_challenge,r.code_challenge_method,r.expires_at,r.consumed_at
         FROM auth_authorization_requests r
         JOIN auth_clients c ON c.id=r.client_id
        WHERE r.id=$1 LIMIT 1 FOR UPDATE`,
      [input.requestId],
    );
    const row = request.rows[0] || null;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new DimproAuthError("Authorization request is invalid or expired.", "AUTH_SSO_REQUEST_INVALID", 400, "A belépési kérés lejárt. Indítsd újra a belépést.");
    }
    const permission = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM auth_access_grants g
           JOIN auth_role_permissions rp ON rp.role_id=g.role_id
           JOIN auth_permissions p ON p.id=rp.permission_id
           JOIN auth_products product ON product.id=g.product_id
          WHERE g.user_id=$1
            AND product.status='ACTIVE'
            AND p.code=$2
            AND product.code=$3
            AND g.revoked_at IS NULL
            AND g.valid_from<=now()
            AND (g.valid_until IS NULL OR g.valid_until>=now())
       ) AS allowed`,
      [input.authSession.user.id, row.required_permission_code, row.product_code],
    );
    if (!permission.rows[0]?.allowed) {
      await client.query(`UPDATE auth_authorization_requests SET consumed_at=now() WHERE id=$1`, [row.id]);
      await appendAudit(client, {
        eventType: "SSO_AUTHORIZE",
        userId: input.authSession.user.id,
        method: "AUTHORIZATION_CODE",
        result: "DENY",
        correlationId: input.correlationId,
        metadata: { clientId: row.client_id, requestId: row.id, reason: "MISSING_PERMISSION", permissionCode: row.required_permission_code },
      });
      throw new DimproAuthError("Client permission denied.", "AUTH_SSO_PERMISSION_DENIED", 403, "Ehhez az alkalmazáshoz nincs aktív hozzáférésed.", { commitTransaction: true });
    }
    const codeExpiresAt = new Date(Date.now() + 60 * 1000);
    await client.query(
      `INSERT INTO auth_authorization_codes(code_hash,client_id,user_id,auth_session_id,redirect_uri,code_challenge,code_challenge_method,expires_at,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        hashAuthorizationCode(input.rawCode),
        row.client_db_id,
        input.authSession.user.id,
        input.authSession.id,
        row.redirect_uri,
        row.code_challenge,
        row.code_challenge_method,
        codeExpiresAt,
        input.correlationId,
      ],
    );
    await client.query(`UPDATE auth_authorization_requests SET consumed_at=now() WHERE id=$1`, [row.id]);
    await appendAudit(client, {
      eventType: "SSO_AUTHORIZE",
      userId: input.authSession.user.id,
      method: "AUTHORIZATION_CODE",
      result: "SUCCESS",
      correlationId: input.correlationId,
      metadata: { clientId: row.client_id, requestId: row.id },
    });
    return {
      clientId: row.client_id,
      redirectUri: row.redirect_uri,
      state: row.state,
      expiresAt: codeExpiresAt,
    };
  });
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  rawCode: string;
  codeVerifier: string;
  ip: string | null;
  userAgent: string;
  correlationId: string;
  environment: "DEV" | "PROD";
}) {
  const config = getDimproAuthConfig();
  return withAuthTransaction(async (client) => {
    if (input.ip) {
      await lockAuthRateKey(client, "sso-token-ip", input.ip);
      const recent = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth_audit_events
         WHERE event_type='SSO_TOKEN_EXCHANGE' AND ip_address=$1::inet
           AND created_at >= now() - ($2::text || ' minutes')::interval`,
        [input.ip, config.ssoWindowMinutes],
      );
      if (Number(recent.rows[0]?.count || 0) >= config.ssoTokenIpMaxRequests) {
        await appendAudit(client, {
          eventType: "SSO_TOKEN_EXCHANGE", method: "AUTHORIZATION_CODE", result: "RATE_LIMIT_IP",
          ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId, metadata: { clientId: input.clientId },
        });
        throw new DimproAuthError("SSO token IP rate limit exceeded.", "AUTH_SSO_RATE_LIMIT", 429, "Túl sok belépési visszaigazolás történt. Próbáld újra később.", { commitTransaction: true });
      }
    }
    const codeResult = await client.query<AuthorizationCodeRow>(
      `SELECT ac.id,ac.client_id AS client_db_id,c.client_id,c.product_code,c.required_permission_code,c.environment,ac.user_id,ac.auth_session_id,ac.redirect_uri,ac.code_challenge,ac.code_challenge_method,ac.expires_at,ac.consumed_at,
              s.absolute_expires_at AS auth_session_absolute_expires_at,
              s.inactivity_expires_at AS auth_session_inactivity_expires_at,
              (s.revoked_at IS NULL AND s.absolute_expires_at>now() AND s.inactivity_expires_at>now() AND s.user_session_version=u.session_version) AS auth_session_valid
         FROM auth_authorization_codes ac
         JOIN auth_clients c ON c.id=ac.client_id
         JOIN auth_sessions s ON s.id=ac.auth_session_id
         JOIN auth_users u ON u.id=ac.user_id
        WHERE ac.code_hash=$1
        LIMIT 1 FOR UPDATE`,
      [hashAuthorizationCode(input.rawCode)],
    );
    const code = codeResult.rows[0] || null;
    if (
      !code
      || !code.auth_session_valid
      || code.consumed_at
      || new Date(code.expires_at).getTime() <= Date.now()
      || code.client_id !== input.clientId
      || code.environment !== input.environment
      || code.redirect_uri !== input.redirectUri
      || code.code_challenge_method !== "S256"
      || createPkceChallenge(input.codeVerifier) !== code.code_challenge
    ) {
      await appendAudit(client, {
        eventType: "SSO_TOKEN_EXCHANGE",
        userId: code?.user_id,
        method: "AUTHORIZATION_CODE",
        result: "DENY",
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { clientId: input.clientId },
      });
      throw new DimproAuthError("Authorization code exchange failed.", "AUTH_SSO_CODE_INVALID", 400, "A belépési visszaigazolás érvénytelen vagy lejárt.", { commitTransaction: true });
    }
    const clientRow = await client.query<AuthClientRow>(
      `SELECT id,client_id,product_code,required_permission_code,environment,status FROM auth_clients WHERE id=$1 AND status='ACTIVE' AND environment=$2 LIMIT 1`,
      [code.client_db_id, input.environment],
    );
    if (!clientRow.rows[0]) {
      throw new DimproAuthError("Client is disabled.", "AUTH_SSO_CLIENT_INVALID", 400, "Az alkalmazás jelenleg nem fogad belépést.");
    }
    const userRow = await client.query<UserRow>(
      `SELECT id,email_original,email_normalized,display_name,status,security_level,login_enabled,session_version,email_verified_at
         FROM auth_users WHERE id=$1 AND status='ACTIVE' AND login_enabled=true LIMIT 1`,
      [code.user_id],
    );
    const user = userRow.rows[0] || null;
    if (!user) {
      throw new DimproAuthError("User disabled during code exchange.", "AUTH_USER_NOT_ACTIVE", 403, "A fiók jelenleg nem használható belépésre.");
    }
    const permission = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS(
         SELECT 1
           FROM auth_access_grants g
           JOIN auth_role_permissions rp ON rp.role_id=g.role_id
           JOIN auth_permissions p ON p.id=rp.permission_id
           JOIN auth_products product ON product.id=g.product_id
          WHERE g.user_id=$1 AND product.status='ACTIVE' AND p.code=$2 AND product.code=$3
            AND g.revoked_at IS NULL AND g.valid_from<=now()
            AND (g.valid_until IS NULL OR g.valid_until>=now())
       ) AS allowed`,
      [user.id, code.required_permission_code, code.product_code],
    );
    if (!permission.rows[0]?.allowed) {
      await appendAudit(client, {
        eventType: "SSO_TOKEN_EXCHANGE", userId: user.id, method: "AUTHORIZATION_CODE", result: "DENY",
        ip: input.ip, userAgent: input.userAgent, correlationId: input.correlationId,
        metadata: { clientId: input.clientId, reason: "MISSING_PERMISSION", permissionCode: code.required_permission_code },
      });
      throw new DimproAuthError("Client permission denied during exchange.", "AUTH_SSO_PERMISSION_DENIED", 403, "Ehhez az alkalmazáshoz nincs aktív hozzáférésed.", { commitTransaction: true });
    }
    const appToken = createAppSessionToken();
    const sessionPolicy = getDimproAuthSessionPolicy(user.security_level);
    const sessionNow = Date.now();
    const parentAbsoluteExpiresAt = new Date(code.auth_session_absolute_expires_at);
    const absoluteExpiresAt = new Date(Math.min(
      sessionNow + sessionPolicy.absoluteSeconds * 1000,
      parentAbsoluteExpiresAt.getTime(),
    ));
    const inactivityExpiresAt = new Date(Math.min(
      sessionNow + sessionPolicy.inactivitySeconds * 1000,
      absoluteExpiresAt.getTime(),
    ));
    const appSession = await client.query<{ id: string }>(
      `INSERT INTO auth_app_sessions(client_id,user_id,auth_session_id,token_hash,user_session_version,absolute_expires_at,inactivity_expires_at,ip_created,user_agent,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::inet,$9,$10) RETURNING id`,
      [code.client_db_id, user.id, code.auth_session_id, hashAppSessionToken(appToken), user.session_version, absoluteExpiresAt, inactivityExpiresAt, input.ip, input.userAgent, input.correlationId],
    );
    await client.query(`UPDATE auth_authorization_codes SET consumed_at=now() WHERE id=$1`, [code.id]);
    await appendAudit(client, {
      eventType: "SSO_TOKEN_EXCHANGE",
      userId: user.id,
      method: "AUTHORIZATION_CODE",
      result: "SUCCESS",
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { clientId: input.clientId, appSessionId: appSession.rows[0]!.id },
    });
    return {
      appSessionToken: appToken,
      user: userFromRow(user),
      absoluteExpiresAt,
      inactivityExpiresAt,
    };
  });
}

export async function getAppSessionByToken(token: string, clientId: string, touch = true): Promise<DimproAuthSession | null> {
  if (!token || token.length < 32 || token.length > 200) return null;
  const config = getDimproAuthConfig();
  const result = await authQuery<AppSessionRow>(
    `SELECT s.id,s.client_id AS client_db_id,c.client_id,s.user_id,s.auth_session_id,u.security_level,s.created_at,s.last_seen_at,s.absolute_expires_at,s.inactivity_expires_at,
            parent_session.last_seen_at AS parent_last_seen_at,parent_session.absolute_expires_at AS parent_absolute_expires_at,parent_session.inactivity_expires_at AS parent_inactivity_expires_at,
            u.email_original,u.email_normalized,u.display_name,u.status,u.session_version,u.email_verified_at
       FROM auth_app_sessions s
       JOIN auth_clients c ON c.id=s.client_id
       JOIN auth_users u ON u.id=s.user_id
       JOIN auth_sessions parent_session ON parent_session.id=s.auth_session_id
      WHERE s.token_hash=$1 AND c.client_id=$2 AND c.status='ACTIVE'
        AND s.revoked_at IS NULL AND s.absolute_expires_at>now() AND s.inactivity_expires_at>now()
        AND parent_session.revoked_at IS NULL
        AND parent_session.absolute_expires_at>now()
        AND parent_session.inactivity_expires_at>now()
        AND parent_session.user_session_version=u.session_version
        AND u.status='ACTIVE' AND u.login_enabled=true
        AND s.user_session_version=u.session_version
      LIMIT 1`,
    [hashAppSessionToken(token), clientId],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  const now = Date.now();
  const lastSeen = new Date(row.last_seen_at).getTime();
  let inactivityExpiresAt = new Date(row.inactivity_expires_at);
  if (touch && now - lastSeen >= config.sessionTouchIntervalSeconds * 1000) {
    const sessionPolicy = getDimproAuthSessionPolicy(row.security_level);
    const proposed = new Date(now + sessionPolicy.inactivitySeconds * 1000);
    const absolute = new Date(row.absolute_expires_at);
    inactivityExpiresAt = proposed.getTime() > absolute.getTime() ? absolute : proposed;
    await authQuery(
      `UPDATE auth_app_sessions SET last_seen_at=now(), inactivity_expires_at=$2 WHERE id=$1 AND revoked_at IS NULL`,
      [row.id, inactivityExpiresAt],
    );
  }
  if (touch) {
    const parentLastSeen = new Date(row.parent_last_seen_at).getTime();
    if (now - parentLastSeen >= config.sessionTouchIntervalSeconds * 1000) {
      const sessionPolicy = getDimproAuthSessionPolicy(row.security_level);
      const parentProposed = new Date(now + sessionPolicy.inactivitySeconds * 1000);
      const parentAbsolute = new Date(row.parent_absolute_expires_at);
      const parentInactivityExpiresAt = parentProposed.getTime() > parentAbsolute.getTime() ? parentAbsolute : parentProposed;
      await authQuery(
        `UPDATE auth_sessions SET last_seen_at=now(), inactivity_expires_at=$2 WHERE id=$1 AND revoked_at IS NULL`,
        [row.auth_session_id, parentInactivityExpiresAt],
      );
    }
  }
  return {
    id: row.id,
    user: userFromRow({ ...row, id: row.user_id, login_enabled: true }),
    createdAt: iso(row.created_at),
    lastSeenAt: touch ? new Date().toISOString() : iso(row.last_seen_at),
    absoluteExpiresAt: iso(row.absolute_expires_at),
    inactivityExpiresAt: inactivityExpiresAt.toISOString(),
  };
}

export async function revokeAppSession(token: string, clientId: string, reason: string, correlationId: string, revokeCentralSession = false) {
  if (!token) return false;
  return withAuthTransaction(async (client) => {
    const current = await client.query<{ id: string; user_id: string; auth_session_id: string }>(
      `SELECT s.id,s.user_id,s.auth_session_id FROM auth_app_sessions s JOIN auth_clients c ON c.id=s.client_id
       WHERE s.token_hash=$1 AND c.client_id=$2 AND s.revoked_at IS NULL LIMIT 1 FOR UPDATE`,
      [hashAppSessionToken(token), clientId],
    );
    const row = current.rows[0];
    if (!row) return false;
    await client.query(`UPDATE auth_app_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1`, [row.id, reason.slice(0, 240)]);
    if (revokeCentralSession) {
      await client.query(
        `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,$2) WHERE id=$1`,
        [row.auth_session_id, `APP_LOGOUT:${reason}`.slice(0, 240)],
      );
    }
    await appendAudit(client, {
      eventType: "SESSION_REVOKE",
      userId: row.user_id,
      method: "APP_SESSION",
      result: "SUCCESS",
      correlationId,
      metadata: { clientId, appSessionId: row.id, centralSessionRevoked: revokeCentralSession, reason: reason.slice(0, 240) },
    });
    return true;
  });
}

export async function listAuthPermissions(userId: string) {
  const result = await authQuery<{
    permission_code: string;
    product_code: string | null;
    organization_id: string | null;
    project_id: string | null;
    role_code: string;
    valid_until: Date | string | null;
  }>(
    `SELECT DISTINCT p.code AS permission_code,product.code AS product_code,g.organization_id,g.project_id,r.code AS role_code,g.valid_until
       FROM auth_access_grants g
       JOIN auth_roles r ON r.id=g.role_id
       JOIN auth_role_permissions rp ON rp.role_id=r.id
       JOIN auth_permissions p ON p.id=rp.permission_id
       LEFT JOIN auth_products product ON product.id=g.product_id
      WHERE g.user_id=$1
        AND (product.id IS NULL OR product.status='ACTIVE')
        AND g.revoked_at IS NULL
        AND g.valid_from<=now()
        AND (g.valid_until IS NULL OR g.valid_until>=now())
      ORDER BY product.code NULLS FIRST,p.code,r.code,g.project_id NULLS FIRST`,
    [userId],
  );
  return result.rows.map((row) => ({
    permissionCode: row.permission_code,
    productCode: row.product_code,
    organizationId: row.organization_id,
    projectId: row.project_id,
    roleCode: row.role_code,
    validUntil: row.valid_until ? iso(row.valid_until) : null,
  }));
}

export async function revokeAllUserSessions(userId: string, correlationId: string, reason = "USER_LOGOUT_ALL") {
  return withAuthTransaction(async (client) => {
    const authSessions = await client.query<{ id: string }>(
      `UPDATE auth_sessions
          SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,$2)
        WHERE user_id=$1 AND revoked_at IS NULL
      RETURNING id`,
      [userId, reason.slice(0, 240)],
    );
    const appSessions = await client.query<{ id: string }>(
      `UPDATE auth_app_sessions
          SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,$2)
        WHERE user_id=$1 AND revoked_at IS NULL
      RETURNING id`,
      [userId, reason.slice(0, 240)],
    );
    await appendAudit(client, {
      eventType: "LOGOUT_ALL",
      userId,
      method: "SESSION",
      result: "SUCCESS",
      correlationId,
      metadata: { authSessions: authSessions.rowCount || 0, appSessions: appSessions.rowCount || 0 },
    });
    return { authSessions: authSessions.rowCount || 0, appSessions: appSessions.rowCount || 0 };
  });
}
