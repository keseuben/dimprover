import {
  assertDropPackageStatusTransition,
  isDropPackagePubliclyAccessible,
} from "./dropPackageLifecycle";
import type { DropAdminRepositoryPort, DropPackageStatusPatch } from "./dropAdminRepositoryPort";
import type {
  DropAccessPurpose,
  DropPackageRecord,
  DropPackageStatus,
} from "./dropTypes";

export class DropAdminError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "DropAdminError";
    this.code = code;
    this.status = status;
  }
}

export type DropAdminActor = {
  userId: string;
  name: string;
  email?: string;
};

function getPurposePath(purpose: DropAccessPurpose, rawToken: string) {
  const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
  const segment: Record<DropAccessPurpose, string> = {
    upload: "u",
    view: "p",
    download: "d",
    report: "report",
  };
  return `${base}/${segment[purpose]}/${encodeURIComponent(rawToken)}`;
}

function assertPurposeCanBeIssued(packageRow: DropPackageRecord, purpose: DropAccessPurpose) {
  const expired = new Date(packageRow.expires_at).getTime() <= Date.now();
  if (expired) {
    throw new DropAdminError("A lejárt csomaghoz nem adható ki új hozzáférési link.", "DROP_PACKAGE_EXPIRED", 410);
  }
  if (packageRow.status === "active") return;
  if (packageRow.status === "upload_closed" && purpose !== "upload") return;
  if (packageRow.status === "reporting" && purpose === "report") return;
  throw new DropAdminError(
    "A csomag jelenlegi állapotában ehhez a művelethez nem adható ki új link.",
    "DROP_TOKEN_REISSUE_NOT_ALLOWED",
    409,
  );
}

function buildStatusPatch(targetStatus: DropPackageStatus, now: string): DropPackageStatusPatch {
  const patch: DropPackageStatusPatch = {
    status: targetStatus,
    updated_at: now,
  };
  if (targetStatus === "upload_closed") patch.closed_at = now;
  if (targetStatus === "expired") patch.expired_at = now;
  if (targetStatus === "deleted") patch.deleted_at = now;
  return patch;
}

async function revokeTokensForStatus(
  repository: DropAdminRepositoryPort,
  packageId: string,
  targetStatus: DropPackageStatus,
) {
  if (targetStatus === "upload_closed") {
    return repository.revokeActiveTokens(packageId, "upload");
  }
  if (targetStatus === "reporting") {
    const purposes: DropAccessPurpose[] = ["upload", "view", "download"];
    let total = 0;
    for (const purpose of purposes) total += await repository.revokeActiveTokens(packageId, purpose);
    return total;
  }
  if (["expiring", "deleting", "expired", "deleted", "failed"].includes(targetStatus)) {
    return repository.revokeActiveTokens(packageId);
  }
  return 0;
}

export async function transitionDropPackageStatus(
  repository: DropAdminRepositoryPort,
  input: {
    packageId: string;
    targetStatus: DropPackageStatus;
    actor: DropAdminActor;
    reason?: string;
    now?: Date;
  },
) {
  const packageRow = await repository.findPackageById(input.packageId);
  if (!packageRow) {
    throw new DropAdminError("A Drop csomag nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
  }
  if (packageRow.status === input.targetStatus) {
    return { package: packageRow, revokedTokenCount: 0, changed: false };
  }

  assertDropPackageStatusTransition(packageRow.status, input.targetStatus);
  const now = (input.now || new Date()).toISOString();
  const patch = buildStatusPatch(input.targetStatus, now);
  const eventPayload = {
    reason: input.reason?.trim().slice(0, 500) || null,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorEmail: input.actor.email || null,
  };

  if (repository.transitionStatusAtomic) {
    const result = await repository.transitionStatusAtomic({
      packageId: packageRow.id,
      expectedStatus: packageRow.status,
      targetStatus: input.targetStatus,
      patch,
      eventPayload,
    });
    return {
      package: result.package,
      revokedTokenCount: result.revokedTokenCount,
      changed: true,
    };
  }

  const updated = await repository.updatePackageStatus(
    packageRow.id,
    packageRow.status,
    patch,
  );
  const revokedTokenCount = await revokeTokensForStatus(repository, packageRow.id, input.targetStatus);

  await repository.writeEvent({
    packageId: packageRow.id,
    eventType: "package.status_changed",
    severity: input.targetStatus === "failed" ? "error" : "info",
    payload: {
      from: packageRow.status,
      to: input.targetStatus,
      ...eventPayload,
      revokedTokenCount,
    },
  });

  return { package: updated, revokedTokenCount, changed: true };
}

export async function reissueDropPackageToken(
  repository: DropAdminRepositoryPort,
  input: {
    packageId: string;
    purpose: DropAccessPurpose;
    actor: DropAdminActor;
    expiresAt?: string;
  },
) {
  const packageRow = await repository.findPackageById(input.packageId);
  if (!packageRow) {
    throw new DropAdminError("A Drop csomag nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
  }
  assertPurposeCanBeIssued(packageRow, input.purpose);

  const packageExpiry = new Date(packageRow.expires_at).getTime();
  const requestedExpiry = input.expiresAt ? new Date(input.expiresAt).getTime() : packageExpiry;
  const expiresAtMs = Math.min(packageExpiry, requestedExpiry);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new DropAdminError("Az új token lejárata érvénytelen.", "DROP_INVALID_TOKEN_EXPIRY", 400);
  }

  const expiresAt = new Date(expiresAtMs).toISOString();
  const eventPayload = {
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorEmail: input.actor.email || null,
  };

  if (repository.reissueTokenAtomic) {
    const issued = await repository.reissueTokenAtomic({
      packageId: packageRow.id,
      purpose: input.purpose,
      expiresAt,
      eventPayload,
    });
    return {
      purpose: input.purpose,
      rawToken: issued.capability.rawToken,
      tokenHint: issued.capability.tokenHint,
      expiresAt: issued.capability.expiresAt,
      link: getPurposePath(input.purpose, issued.capability.rawToken),
      revokedTokenCount: issued.revokedTokenCount,
    };
  }

  const revokedTokenCount = await repository.revokeActiveTokens(packageRow.id, input.purpose);
  const issued = await repository.issueAccessToken(
    packageRow.id,
    input.purpose,
    expiresAt,
    "admin_reissue",
  );

  await repository.writeEvent({
    packageId: packageRow.id,
    eventType: "access.token_reissued",
    payload: {
      purpose: input.purpose,
      tokenHint: issued.capability.tokenHint,
      ...eventPayload,
      revokedTokenCount,
    },
  });

  return {
    purpose: input.purpose,
    rawToken: issued.capability.rawToken,
    tokenHint: issued.capability.tokenHint,
    expiresAt: issued.capability.expiresAt,
    link: getPurposePath(input.purpose, issued.capability.rawToken),
    revokedTokenCount,
  };
}

export function canAdminIssueDropPurpose(packageRow: DropPackageRecord, purpose: DropAccessPurpose) {
  if (!isDropPackagePubliclyAccessible(packageRow.status) && packageRow.status !== "reporting") return false;
  if (packageRow.status === "upload_closed" && purpose === "upload") return false;
  if (packageRow.status === "reporting" && purpose !== "report") return false;
  return new Date(packageRow.expires_at).getTime() > Date.now();
}

export async function revokeDropPackageToken(
  repository: DropAdminRepositoryPort,
  input: {
    packageId: string;
    tokenId: string;
    actor: DropAdminActor;
    reason?: string;
  },
) {
  const packageRow = await repository.findPackageById(input.packageId);
  if (!packageRow) {
    throw new DropAdminError("A Drop csomag nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
  }
  const eventPayload = {
    reason: input.reason?.trim().slice(0, 500) || null,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorEmail: input.actor.email || null,
  };

  if (repository.revokeTokenAtomic) {
    const revoked = await repository.revokeTokenAtomic({
      packageId: packageRow.id,
      tokenId: input.tokenId,
      eventPayload,
    });
    return { revoked };
  }

  const revoked = await repository.revokeToken(packageRow.id, input.tokenId);
  if (!revoked) {
    throw new DropAdminError(
      "A token nem található, már vissza lett vonva vagy nem ehhez a csomaghoz tartozik.",
      "DROP_TOKEN_NOT_ACTIVE",
      404,
    );
  }
  await repository.writeEvent({
    packageId: packageRow.id,
    eventType: "access.token_revoked",
    payload: {
      tokenId: input.tokenId,
      ...eventPayload,
    },
  });
  return { revoked: true };
}
