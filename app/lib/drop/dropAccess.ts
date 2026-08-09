import {
  createDropSecurityFingerprint,
  inferDropTokenPurpose,
  safeTokenReference,
  verifyDropPin,
} from "./dropCrypto";
import {
  supabaseDropRepository,
  type DropRepositoryPort,
} from "./dropRepositoryPort";
import type {
  DropAccessGrant,
  DropAccessPurpose,
  DropPackageRecord,
} from "./dropTypes";

export class DropAccessError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "DropAccessError";
    this.code = code;
    this.status = status;
  }
}

function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

function getUserAgentSummary(headers: Headers) {
  return (headers.get("user-agent") || "unknown").replace(/[\r\n]/g, " ").slice(0, 240);
}

function assertPackageAvailable(packageRow: DropPackageRecord, purpose: DropAccessPurpose) {
  const statusAllowed = packageRow.status === "active"
    || (packageRow.status === "upload_closed" && purpose !== "upload");
  if (!statusAllowed) {
    throw new DropAccessError(
      "A csomag lezárt, lejárt vagy jelenleg nem hozzáférhető.",
      "DROP_PACKAGE_UNAVAILABLE",
      410,
    );
  }
  if (new Date(packageRow.expires_at).getTime() <= Date.now()) {
    throw new DropAccessError("A csomag hozzáférési ideje lejárt.", "DROP_PACKAGE_EXPIRED", 410);
  }
}

function getPurposePath(purpose: DropAccessPurpose, rawToken: string) {
  const encoded = encodeURIComponent(rawToken);
  if (purpose === "upload") return `/u/${encoded}`;
  if (purpose === "download") return `/d/${encoded}`;
  if (purpose === "report") return `/report/${encoded}`;
  return `/p/${encoded}`;
}

function getGrantExpiry(packageRow: DropPackageRecord, purpose: DropAccessPurpose) {
  const ttlMinutes: Record<DropAccessPurpose, number> = {
    upload: 120,
    view: 720,
    download: 60,
    report: 60,
  };
  return new Date(
    Math.min(
      new Date(packageRow.expires_at).getTime(),
      Date.now() + ttlMinutes[purpose] * 60_000,
    ),
  ).toISOString();
}

async function recordFailedPin(
  repository: DropRepositoryPort,
  packageRow: DropPackageRecord | null,
  ipHash: string,
  userAgentSummary: string,
  failureCode: string,
  purpose: DropAccessPurpose,
) {
  await repository.recordAccessAttempt({
    packageId: packageRow?.id || null,
    attemptType: "pin",
    purpose,
    ipHash,
    success: false,
    failureCode,
    userAgentSummary,
  });
  if (packageRow) {
    await repository.writeEvent({
      packageId: packageRow.id,
      eventType: "access.pin_failed",
      severity: "warning",
      ipHash,
      userAgentSummary,
      payload: { purpose, failureCode },
    });
  }
}

export async function openDropPackageWithPin(input: {
  publicCode: string;
  pin: string;
  purpose: DropAccessPurpose;
  headers: Headers;
}, repository: DropRepositoryPort = supabaseDropRepository): Promise<DropAccessGrant & { rawToken: string }> {
  const ipHash = createDropSecurityFingerprint("ip", getClientIp(input.headers));
  const userAgentSummary = getUserAgentSummary(input.headers);

  const ipFailures = await repository.countRecentFailedAttempts({
    ipHash,
    attemptType: "pin",
    windowMinutes: 15,
  });
  if (ipFailures >= 20) {
    throw new DropAccessError(
      "Túl sok sikertelen próbálkozás történt. A hozzáférés ideiglenesen korlátozott.",
      "DROP_RATE_LIMIT_IP",
      429,
    );
  }

  const packageRow = await repository.findPackageByPublicCode(input.publicCode);
  if (!packageRow) {
    await recordFailedPin(repository, null, ipHash, userAgentSummary, "package_not_found", input.purpose);
    throw new DropAccessError(
      "A csomagkód vagy a PIN hibás, illetve a csomag már nem hozzáférhető.",
      "DROP_ACCESS_DENIED",
      401,
    );
  }

  const packageFailures = await repository.countRecentFailedAttempts({
    ipHash,
    packageId: packageRow.id,
    attemptType: "pin",
    windowMinutes: 15,
  });
  if (packageFailures >= 5) {
    throw new DropAccessError(
      "Ehhez a csomaghoz túl sok sikertelen PIN-próbálkozás történt. Próbálja meg később.",
      "DROP_RATE_LIMIT_PACKAGE",
      429,
    );
  }

  try {
    assertPackageAvailable(packageRow, input.purpose);
  } catch (error) {
    await recordFailedPin(repository, packageRow, ipHash, userAgentSummary, "package_unavailable", input.purpose);
    throw error;
  }

  if (packageRow.access_policy !== "token_pin" || !packageRow.pin_hash || !packageRow.pin_salt) {
    await recordFailedPin(repository, packageRow, ipHash, userAgentSummary, "pin_not_allowed", input.purpose);
    throw new DropAccessError("Ez a csomag nem nyitható meg PIN-kóddal.", "DROP_PIN_NOT_ALLOWED", 403);
  }

  if (!verifyDropPin(input.pin, packageRow.pin_hash, packageRow.pin_salt)) {
    await recordFailedPin(repository, packageRow, ipHash, userAgentSummary, "invalid_pin", input.purpose);
    throw new DropAccessError(
      "A csomagkód vagy a PIN hibás, illetve a csomag már nem hozzáférhető.",
      "DROP_ACCESS_DENIED",
      401,
    );
  }

  const expiresAt = getGrantExpiry(packageRow, input.purpose);
  const { capability, record } = await repository.issueAccessToken(
    packageRow.id,
    input.purpose,
    expiresAt,
    "pin_gate",
  );

  await repository.recordAccessAttempt({
    packageId: packageRow.id,
    accessTokenId: record.id,
    attemptType: "pin",
    purpose: input.purpose,
    ipHash,
    success: true,
    userAgentSummary,
  });
  await repository.writeEvent({
    packageId: packageRow.id,
    eventType: "access.pin_granted",
    ipHash,
    userAgentSummary,
    payload: { purpose: input.purpose, tokenHint: capability.tokenHint },
  });

  return {
    packageId: packageRow.id,
    publicCode: packageRow.public_code,
    title: packageRow.title,
    mode: packageRow.mode,
    purpose: input.purpose,
    tokenHint: capability.tokenHint,
    expiresAt,
    packageExpiresAt: packageRow.expires_at,
    redirectPath: getPurposePath(input.purpose, capability.rawToken),
    rawToken: capability.rawToken,
  };
}

export async function validateDropAccessToken(input: {
  rawToken: string;
  expectedPurpose: DropAccessPurpose;
  headers: Headers;
}, repository: DropRepositoryPort = supabaseDropRepository): Promise<DropAccessGrant> {
  const ipHash = createDropSecurityFingerprint("ip", getClientIp(input.headers));
  const tokenFingerprint = createDropSecurityFingerprint("token-attempt", input.rawToken);
  const userAgentSummary = getUserAgentSummary(input.headers);
  const inferredPurpose = inferDropTokenPurpose(input.rawToken);

  const recentFailures = await repository.countRecentFailedAttempts({
    ipHash,
    tokenFingerprint,
    attemptType: "token",
    windowMinutes: 15,
  });
  if (recentFailures >= 10) {
    throw new DropAccessError(
      "A hozzáférési hivatkozás ellenőrzése ideiglenesen korlátozott.",
      "DROP_RATE_LIMIT_TOKEN",
      429,
    );
  }

  if (!inferredPurpose || inferredPurpose !== input.expectedPurpose) {
    await repository.recordAccessAttempt({
      attemptType: "token",
      purpose: input.expectedPurpose,
      ipHash,
      tokenFingerprint,
      success: false,
      failureCode: "purpose_mismatch",
      userAgentSummary,
    });
    throw new DropAccessError(
      "Ez a hivatkozás nem használható ezen a Drop útvonalon.",
      "DROP_TOKEN_PURPOSE_MISMATCH",
      403,
    );
  }

  const found = await repository.findAccessToken(input.rawToken);
  if (!found) {
    await repository.recordAccessAttempt({
      attemptType: "token",
      purpose: input.expectedPurpose,
      ipHash,
      tokenFingerprint,
      success: false,
      failureCode: "token_not_found",
      userAgentSummary,
    });
    throw new DropAccessError("A hozzáférési hivatkozás érvénytelen vagy lejárt.", "DROP_TOKEN_INVALID", 401);
  }

  const { token, package: packageRow } = found;
  const tokenExpired = new Date(token.expires_at).getTime() <= Date.now();
  const usesExhausted = token.max_uses !== null && token.use_count >= token.max_uses;
  if (
    token.purpose !== input.expectedPurpose
    || token.status !== "active"
    || tokenExpired
    || usesExhausted
  ) {
    await repository.recordAccessAttempt({
      packageId: packageRow.id,
      accessTokenId: token.id,
      attemptType: "token",
      purpose: input.expectedPurpose,
      ipHash,
      tokenFingerprint,
      success: false,
      failureCode: "token_unavailable",
      userAgentSummary,
    });
    throw new DropAccessError("A hozzáférési hivatkozás érvénytelen vagy lejárt.", "DROP_TOKEN_UNAVAILABLE", 410);
  }

  try {
    assertPackageAvailable(packageRow, input.expectedPurpose);
  } catch (error) {
    await repository.recordAccessAttempt({
      packageId: packageRow.id,
      accessTokenId: token.id,
      attemptType: "token",
      purpose: input.expectedPurpose,
      ipHash,
      tokenFingerprint,
      success: false,
      failureCode: "package_unavailable",
      userAgentSummary,
    });
    throw error;
  }

  await repository.markAccessTokenUsed(token);
  await repository.recordAccessAttempt({
    packageId: packageRow.id,
    accessTokenId: token.id,
    attemptType: "token",
    purpose: input.expectedPurpose,
    ipHash,
    tokenFingerprint,
    success: true,
    userAgentSummary,
  });
  await repository.writeEvent({
    packageId: packageRow.id,
    eventType: `access.${input.expectedPurpose}_opened`,
    ipHash,
    userAgentSummary,
    payload: { purpose: input.expectedPurpose, tokenHint: safeTokenReference(input.rawToken) },
  });

  return {
    packageId: packageRow.id,
    publicCode: packageRow.public_code,
    title: packageRow.title,
    mode: packageRow.mode,
    purpose: input.expectedPurpose,
    tokenHint: token.token_hint,
    expiresAt: token.expires_at,
    packageExpiresAt: packageRow.expires_at,
    redirectPath: getPurposePath(input.expectedPurpose, input.rawToken),
  };
}
