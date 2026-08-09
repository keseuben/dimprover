import { randomUUID } from "node:crypto";
import { createDropCapabilityToken, hashDropToken } from "./dropCrypto";
import type { DropAdminRepositoryPort, DropPackageStatusPatch } from "./dropAdminRepositoryPort";
import type {
  DropAccessAttemptInput,
  DropAttemptCountFilters,
  DropEventInput,
  DropRepositoryPort,
} from "./dropRepositoryPort";
import type {
  DropAccessPurpose,
  DropAccessTokenRecord,
  DropPackageRecord,
} from "./dropTypes";

type MemoryAttempt = DropAccessAttemptInput & {
  id: string;
  createdAt: string;
};

type MemoryEvent = DropEventInput & {
  id: string;
  createdAt: string;
};

type MemorySeed = {
  packages?: DropPackageRecord[];
  accessTokens?: DropAccessTokenRecord[];
};

/**
 * Kizárólag automatizált tesztekhez használható repository.
 * Nem exportál singleton példányt, és nem kapcsolható be környezeti változóval,
 * ezért éles vagy preview futásban nem tud véletlenül adatforrássá válni.
 */
export class InMemoryDropRepository implements DropRepositoryPort, DropAdminRepositoryPort {
  private readonly packages = new Map<string, DropPackageRecord>();
  private readonly tokens = new Map<string, DropAccessTokenRecord>();
  private readonly attempts: MemoryAttempt[] = [];
  private readonly events: MemoryEvent[] = [];

  constructor(seed: MemorySeed = {}) {
    for (const packageRow of seed.packages || []) {
      this.packages.set(packageRow.id, structuredClone(packageRow));
    }
    for (const token of seed.accessTokens || []) {
      this.tokens.set(token.token_hash, structuredClone(token));
    }
  }

  async findPackageByPublicCode(publicCode: string) {
    const normalized = publicCode.trim().toUpperCase();
    const packageRow = [...this.packages.values()].find(
      (item) => item.public_code.toUpperCase() === normalized,
    );
    return packageRow ? structuredClone(packageRow) : null;
  }

  async findPackageById(packageId: string) {
    const packageRow = this.packages.get(packageId);
    return packageRow ? structuredClone(packageRow) : null;
  }

  async updatePackageStatus(
    packageId: string,
    expectedStatus: DropPackageRecord["status"],
    patch: DropPackageStatusPatch,
  ) {
    const packageRow = this.packages.get(packageId);
    if (!packageRow) throw new Error("DROP_MEMORY_PACKAGE_NOT_FOUND");
    if (packageRow.status !== expectedStatus) {
      const error = new Error("DROP_PACKAGE_STATUS_CONFLICT");
      Object.assign(error, { code: "DROP_PACKAGE_STATUS_CONFLICT", status: 409 });
      throw error;
    }
    const updated: DropPackageRecord = {
      ...packageRow,
      ...patch,
    };
    this.packages.set(packageId, updated);
    return structuredClone(updated);
  }

  async revokeActiveTokens(packageId: string, purpose?: DropAccessPurpose) {
    let revoked = 0;
    const now = new Date().toISOString();
    for (const [tokenHash, token] of this.tokens.entries()) {
      if (token.package_id !== packageId || token.status !== "active") continue;
      if (purpose && token.purpose !== purpose) continue;
      this.tokens.set(tokenHash, { ...token, status: "revoked", revoked_at: now });
      revoked += 1;
    }
    return revoked;
  }

  async revokeToken(packageId: string, tokenId: string) {
    const now = new Date().toISOString();
    for (const [tokenHash, token] of this.tokens.entries()) {
      if (token.package_id !== packageId || token.id !== tokenId || token.status !== "active") continue;
      this.tokens.set(tokenHash, { ...token, status: "revoked", revoked_at: now });
      return true;
    }
    return false;
  }

  async issueAccessToken(
    packageId: string,
    purpose: DropAccessPurpose,
    expiresAt: string,
    source: "package_creation" | "pin_gate" | "admin_reissue",
  ) {
    if (!this.packages.has(packageId)) {
      throw new Error("DROP_MEMORY_PACKAGE_NOT_FOUND");
    }
    const capability = createDropCapabilityToken(purpose, expiresAt);
    const now = new Date().toISOString();
    const record: DropAccessTokenRecord = {
      id: randomUUID(),
      package_id: packageId,
      purpose,
      token_hash: capability.tokenHash,
      token_hint: capability.tokenHint,
      status: "active",
      expires_at: expiresAt,
      max_uses: null,
      use_count: 0,
      last_used_at: null,
      created_at: now,
      revoked_at: null,
    };
    this.tokens.set(record.token_hash, record);
    this.events.push({
      id: randomUUID(),
      packageId,
      eventType: "access.token_issued",
      severity: "info",
      payload: { purpose, source, tokenHint: capability.tokenHint },
      createdAt: now,
    });
    return { capability, record: structuredClone(record) };
  }

  async findAccessToken(rawToken: string) {
    const record = this.tokens.get(hashDropToken(rawToken));
    if (!record) return null;
    const packageRow = this.packages.get(record.package_id);
    if (!packageRow) return null;
    return {
      token: structuredClone(record),
      package: structuredClone(packageRow),
    };
  }

  async markAccessTokenUsed(token: DropAccessTokenRecord) {
    const stored = this.tokens.get(token.token_hash);
    if (!stored) throw new Error("DROP_MEMORY_TOKEN_NOT_FOUND");
    const now = new Date().toISOString();
    this.tokens.set(token.token_hash, {
      ...stored,
      use_count: stored.use_count + 1,
      last_used_at: now,
    });
  }

  async recordAccessAttempt(input: DropAccessAttemptInput) {
    this.attempts.push({
      ...structuredClone(input),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  async countRecentFailedAttempts(filters: DropAttemptCountFilters) {
    const threshold = Date.now() - filters.windowMinutes * 60_000;
    return this.attempts.filter((attempt) => {
      if (attempt.success) return false;
      if (new Date(attempt.createdAt).getTime() < threshold) return false;
      if (attempt.ipHash !== filters.ipHash) return false;
      if (filters.packageId && attempt.packageId !== filters.packageId) return false;
      if (filters.tokenFingerprint && attempt.tokenFingerprint !== filters.tokenFingerprint) return false;
      if (filters.attemptType && attempt.attemptType !== filters.attemptType) return false;
      return true;
    }).length;
  }

  async writeEvent(input: DropEventInput) {
    this.events.push({
      ...structuredClone(input),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  snapshot() {
    return {
      packages: [...this.packages.values()].map((item) => structuredClone(item)),
      accessTokens: [...this.tokens.values()].map((item) => structuredClone(item)),
      attempts: this.attempts.map((item) => structuredClone(item)),
      events: this.events.map((item) => structuredClone(item)),
    };
  }
}
