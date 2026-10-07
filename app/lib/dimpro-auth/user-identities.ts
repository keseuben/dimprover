import { authQuery, withAuthTransaction } from "./db";
import { getDimproAuthConfig } from "./config";
import {
  DIMPRO_AUTH_PURPOSE_USER_IDENTITY,
  hashDimproAuthOtp,
  verifyDimproAuthOtpHash,
} from "./security";
import { DimproAuthError } from "./types";

export type AuthUserIdentityType = "PERSONAL" | "WORK";
export type AuthUserIdentityStatus = "PENDING" | "VERIFIED" | "DISABLED";

export type AuthUserIdentity = {
  id: string;
  userId: string;
  identityType: AuthUserIdentityType;
  email: string;
  displayName: string | null;
  organizationName: string | null;
  status: AuthUserIdentityStatus;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

type IdentityRow = {
  id: string;
  user_id: string;
  identity_type: AuthUserIdentityType;
  email_original: string;
  email_normalized: string;
  display_name: string | null;
  organization_name: string | null;
  status: AuthUserIdentityStatus;
  is_primary: boolean;
  verified_at: Date | string | null;
  challenge_id: string | null;
  created_at: Date | string;
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

function iso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapIdentity(row: IdentityRow): AuthUserIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    identityType: row.identity_type,
    email: row.email_original || row.email_normalized,
    displayName: row.display_name,
    organizationName: row.organization_name,
    status: row.status,
    isPrimary: row.is_primary,
    verifiedAt: iso(row.verified_at),
    createdAt: iso(row.created_at) || new Date().toISOString(),
  };
}

export async function listAuthUserIdentities(userId: string) {
  const result = await authQuery<IdentityRow>(
    `SELECT id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at
       FROM auth_user_identities
      WHERE user_id=$1 AND status<>'DISABLED'
      ORDER BY is_primary DESC, status='VERIFIED' DESC, created_at ASC`,
    [userId],
  );
  return result.rows.map(mapIdentity);
}

export async function getVerifiedAuthUserIdentity(userId: string, identityId?: string | null) {
  const result = await authQuery<IdentityRow>(
    `SELECT id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at
       FROM auth_user_identities
      WHERE user_id=$1 AND status='VERIFIED'
        AND ($2::uuid IS NULL OR id=$2::uuid)
      ORDER BY CASE WHEN $2::uuid IS NULL THEN is_primary ELSE true END DESC, created_at ASC
      LIMIT 1`,
    [userId, identityId || null],
  );
  return result.rows[0] ? mapIdentity(result.rows[0]) : null;
}

export async function beginAuthUserIdentityVerification(input: {
  userId: string;
  email: string;
  displayName: string;
  organizationName: string;
  identityType: AuthUserIdentityType;
  code: string;
  ip: string | null;
  userAgent: string;
  correlationId: string;
}) {
  const config = getDimproAuthConfig();
  const expiresAt = new Date(Date.now() + config.otpTtlSeconds * 1000);
  return withAuthTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`dimpro-auth:user-identity:${input.email}`]);

    const primaryOwner = await client.query<{ id: string }>(
      `SELECT id FROM auth_users WHERE email_normalized=$1 AND id<>$2 LIMIT 1`,
      [input.email, input.userId],
    );
    if (primaryOwner.rows[0]) {
      throw new DimproAuthError(
        "Identity email belongs to another DIMPRO account.",
        "AUTH_USER_IDENTITY_EMAIL_IN_USE",
        409,
        "Ez az e-mail-cím már egy másik DIMPRO-fiók elsődleges címe.",
      );
    }

    const existingResult = await client.query<IdentityRow>(
      `SELECT id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at
         FROM auth_user_identities WHERE email_normalized=$1 LIMIT 1 FOR UPDATE`,
      [input.email],
    );
    const existing = existingResult.rows[0] || null;
    if (existing && existing.user_id !== input.userId) {
      throw new DimproAuthError(
        "Identity email belongs to another DIMPRO user.",
        "AUTH_USER_IDENTITY_EMAIL_IN_USE",
        409,
        "Ez az e-mail-cím már egy másik DIMPRO-fiókhoz van kapcsolva.",
      );
    }
    if (existing?.status === "VERIFIED") {
      throw new DimproAuthError(
        "Identity is already verified.",
        "AUTH_USER_IDENTITY_ALREADY_VERIFIED",
        409,
        "Ez az e-mail-cím már hitelesítve van a DIMPRO-fiókodban.",
      );
    }

    const cooldown = await client.query<{ id: string }>(
      `SELECT id FROM auth_email_challenges
        WHERE email_normalized=$1 AND purpose=$2 AND created_at>now()-make_interval(secs=>$3)
        ORDER BY created_at DESC LIMIT 1`,
      [input.email, DIMPRO_AUTH_PURPOSE_USER_IDENTITY, config.otpResendCooldownSeconds],
    );
    if (cooldown.rows[0]) {
      throw new DimproAuthError("Identity OTP cooldown.", "AUTH_OTP_COOLDOWN", 429, "Várj röviden az új kód kérése előtt.");
    }

    const emailWindow = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_email_challenges
        WHERE email_normalized=$1 AND created_at>=now()-make_interval(mins=>$2)`,
      [input.email, config.otpEmailWindowMinutes],
    );
    if (Number(emailWindow.rows[0]?.count || 0) >= config.otpEmailWindowMaxRequests) {
      throw new DimproAuthError("Identity OTP email rate limit.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.");
    }

    if (input.ip) {
      const ipWindow = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth_email_challenges
          WHERE requested_ip=$1::inet AND created_at>=now()-make_interval(mins=>$2)`,
        [input.ip, config.otpIpWindowMinutes],
      );
      if (Number(ipWindow.rows[0]?.count || 0) >= config.otpIpWindowMaxRequests) {
        throw new DimproAuthError("Identity OTP IP rate limit.", "AUTH_OTP_RATE_LIMIT", 429, "Túl sok kódkérés történt. Próbáld újra később.");
      }
    }

    await client.query(
      `UPDATE auth_email_challenges SET invalidated_at=now()
        WHERE user_id=$1 AND email_normalized=$2 AND purpose=$3
          AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [input.userId, input.email, DIMPRO_AUTH_PURPOSE_USER_IDENTITY],
    );
    const challenge = await client.query<{ id: string }>(
      `INSERT INTO auth_email_challenges(user_id,email_normalized,purpose,code_hash,expires_at,max_attempts,requested_ip,requested_user_agent,correlation_id)
       VALUES($1,$2,$3,$4,$5,$6,$7::inet,$8,$9) RETURNING id`,
      [input.userId, input.email, DIMPRO_AUTH_PURPOSE_USER_IDENTITY, hashDimproAuthOtp(input.email, DIMPRO_AUTH_PURPOSE_USER_IDENTITY, input.code), expiresAt, config.otpMaxAttempts, input.ip, input.userAgent, input.correlationId],
    );
    const challengeId = challenge.rows[0]!.id;

    let identity: IdentityRow;
    if (existing) {
      const updated = await client.query<IdentityRow>(
        `UPDATE auth_user_identities
            SET identity_type=$2,display_name=$3,organization_name=$4,status='PENDING',verified_at=NULL,challenge_id=$5,updated_at=now()
          WHERE id=$1
          RETURNING id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at`,
        [existing.id, input.identityType, input.displayName || null, input.organizationName || null, challengeId],
      );
      identity = updated.rows[0]!;
    } else {
      const created = await client.query<IdentityRow>(
        `INSERT INTO auth_user_identities(user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,challenge_id)
         VALUES($1,$2,$3,$3,$4,$5,'PENDING',false,$6)
         RETURNING id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at`,
        [input.userId, input.identityType, input.email, input.displayName || null, input.organizationName || null, challengeId],
      );
      identity = created.rows[0]!;
    }
    return { identity: mapIdentity(identity), challengeId, expiresAt };
  });
}

export async function verifyAuthUserIdentity(input: { userId: string; identityId: string; code: string }) {
  return withAuthTransaction(async (client) => {
    const identityResult = await client.query<IdentityRow>(
      `SELECT id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at
         FROM auth_user_identities WHERE id=$1 AND user_id=$2 LIMIT 1 FOR UPDATE`,
      [input.identityId, input.userId],
    );
    const identity = identityResult.rows[0] || null;
    if (!identity || identity.status !== "PENDING" || !identity.challenge_id) {
      throw new DimproAuthError("Identity verification is not pending.", "AUTH_USER_IDENTITY_NOT_PENDING", 400, "Ez az e-mail-hitelesítés nem aktív vagy már lezárult.");
    }
    const challengeResult = await client.query<ChallengeRow>(
      `SELECT id,user_id,email_normalized,purpose,code_hash,expires_at,attempts,max_attempts,consumed_at,invalidated_at
         FROM auth_email_challenges WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [identity.challenge_id],
    );
    const challenge = challengeResult.rows[0] || null;
    if (!challenge || challenge.user_id !== input.userId || challenge.purpose !== DIMPRO_AUTH_PURPOSE_USER_IDENTITY || challenge.email_normalized !== identity.email_normalized || challenge.consumed_at || challenge.invalidated_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      throw new DimproAuthError("Identity OTP invalid or expired.", "AUTH_OTP_INVALID", 400, "A hitelesítő kód hibás vagy lejárt.", { commitTransaction: true });
    }
    if (challenge.attempts >= challenge.max_attempts) {
      throw new DimproAuthError("Identity OTP attempts exceeded.", "AUTH_OTP_ATTEMPTS_EXCEEDED", 429, "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot.", { commitTransaction: true });
    }
    if (!verifyDimproAuthOtpHash(challenge.code_hash, identity.email_normalized, challenge.purpose, input.code)) {
      const attempts = challenge.attempts + 1;
      await client.query(`UPDATE auth_email_challenges SET attempts=$2 WHERE id=$1`, [challenge.id, attempts]);
      throw new DimproAuthError(
        "Identity OTP mismatch.",
        attempts >= challenge.max_attempts ? "AUTH_OTP_ATTEMPTS_EXCEEDED" : "AUTH_OTP_INVALID",
        attempts >= challenge.max_attempts ? 429 : 400,
        attempts >= challenge.max_attempts ? "A kódhoz tartozó próbálkozási keret elfogyott. Kérj új kódot." : "A hitelesítő kód hibás vagy lejárt.",
        { commitTransaction: true },
      );
    }
    await client.query(`UPDATE auth_email_challenges SET consumed_at=now() WHERE id=$1`, [challenge.id]);
    const verified = await client.query<IdentityRow>(
      `UPDATE auth_user_identities SET status='VERIFIED',verified_at=now(),challenge_id=NULL,updated_at=now()
        WHERE id=$1 AND user_id=$2
        RETURNING id,user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at,challenge_id,created_at`,
      [identity.id, input.userId],
    );
    return mapIdentity(verified.rows[0]!);
  });
}
