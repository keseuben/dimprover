import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  reissueDropPackageToken,
  revokeDropPackageToken,
  transitionDropPackageStatus,
} from "../app/lib/drop/dropAdminService";
import { validateDropAccessToken, DropAccessError } from "../app/lib/drop/dropAccess";
import { hashDropPin } from "../app/lib/drop/dropCrypto";
import { InMemoryDropRepository } from "../app/lib/drop/dropMemoryRepository";
import type { DropAccessPurpose, DropPackageRecord } from "../app/lib/drop/dropTypes";

process.env.DROP_TOKEN_HMAC_SECRET = "drop-admin-token-secret-".repeat(3);
process.env.DROP_SESSION_SECRET = "drop-admin-session-secret-".repeat(3);
process.env.DROP_PUBLIC_BASE_URL = "https://drop.dimpro.hu";

const now = Date.now();
const pin = hashDropPin("684219");
const packageRow: DropPackageRecord = {
  id: randomUUID(),
  public_code: "DMP-2608-ADMIN1",
  mode: "mixed",
  title: "Admin életciklus teszt",
  description: "",
  project_id: null,
  project_name_snapshot: null,
  owner_user_id: "admin",
  organization_id: null,
  created_by_user_id: "admin",
  uploader_name: "Teszt Elek",
  uploader_email: "teszt@example.hu",
  status: "active",
  access_policy: "token_pin",
  upload_opens_at: new Date(now - 60_000).toISOString(),
  upload_closes_at: new Date(now + 3_600_000).toISOString(),
  expires_at: new Date(now + 86_400_000).toISOString(),
  grace_expires_at: new Date(now + 90_000_000).toISOString(),
  retention_days: 1,
  pin_hash: pin.hash,
  pin_salt: pin.salt,
  max_file_count: 500,
  max_file_size_bytes: 262_144_000,
  max_total_size_bytes: 2_147_483_648,
  current_file_count: 0,
  current_total_size_bytes: 0,
  created_at: new Date(now - 60_000).toISOString(),
  updated_at: new Date(now - 60_000).toISOString(),
  closed_at: null,
  expired_at: null,
  deleted_at: null,
};

const actor = { userId: "license-admin", name: "DIMPRO licencadmin" };
const headers = new Headers({ "x-forwarded-for": "203.0.113.50", "user-agent": "Drop admin lifecycle test" });

class AtomicProbeRepository extends InMemoryDropRepository {
  atomicReissueCalls = 0;
  atomicRevokeCalls = 0;

  async reissueTokenAtomic(input: {
    packageId: string;
    purpose: DropAccessPurpose;
    expiresAt: string;
    eventPayload: Record<string, unknown>;
  }) {
    this.atomicReissueCalls += 1;
    const revokedTokenCount = await super.revokeActiveTokens(input.packageId, input.purpose);
    const issued = await super.issueAccessToken(
      input.packageId,
      input.purpose,
      input.expiresAt,
      "admin_reissue",
    );
    await super.writeEvent({
      packageId: input.packageId,
      eventType: "access.token_reissued",
      payload: input.eventPayload,
    });
    return { ...issued, revokedTokenCount };
  }

  async revokeTokenAtomic(input: {
    packageId: string;
    tokenId: string;
    eventPayload: Record<string, unknown>;
  }) {
    this.atomicRevokeCalls += 1;
    const revoked = await super.revokeToken(input.packageId, input.tokenId);
    if (revoked) {
      await super.writeEvent({
        packageId: input.packageId,
        eventType: "access.token_revoked",
        payload: input.eventPayload,
      });
    }
    return revoked;
  }

  async revokeActiveTokens(
    _packageId: string,
    _purpose?: DropAccessPurpose,
  ): Promise<number> {
    void _packageId;
    void _purpose;
    throw new Error("DROP_FALLBACK_REISSUE_MUST_NOT_RUN");
  }

  async revokeToken(_packageId: string, _tokenId: string): Promise<boolean> {
    void _packageId;
    void _tokenId;
    throw new Error("DROP_FALLBACK_REVOKE_MUST_NOT_RUN");
  }
}

async function expectAccessError(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail(`A műveletnek ${code} hibával meg kellett volna állnia.`);
  } catch (error) {
    assert.ok(error instanceof DropAccessError);
    assert.equal(error.code, code);
  }
}

async function main() {
  const repository = new InMemoryDropRepository({ packages: [packageRow] });
  const issued = new Map<DropAccessPurpose, string>();
  for (const purpose of ["upload", "view", "download", "report"] as const) {
    const result = await repository.issueAccessToken(packageRow.id, purpose, packageRow.expires_at, "package_creation");
    issued.set(purpose, result.capability.rawToken);
  }

  const closedAt = new Date(now + 1_000);
  const closed = await transitionDropPackageStatus(repository, {
    packageId: packageRow.id,
    targetStatus: "upload_closed",
    actor,
    reason: "Kézi feltöltészárás",
    now: closedAt,
  });
  assert.equal(closed.changed, true);
  assert.equal(closed.package.status, "upload_closed");
  assert.equal(closed.package.closed_at, closedAt.toISOString());
  assert.equal(closed.revokedTokenCount, 1);

  const afterClose = repository.snapshot();
  assert.equal(afterClose.accessTokens.find((token) => token.purpose === "upload")?.status, "revoked");
  assert.equal(afterClose.accessTokens.find((token) => token.purpose === "view")?.status, "active");

  await validateDropAccessToken({
    rawToken: issued.get("view")!,
    expectedPurpose: "view",
    headers,
  }, repository);
  await expectAccessError(
    () => validateDropAccessToken({
      rawToken: issued.get("upload")!,
      expectedPurpose: "upload",
      headers,
    }, repository),
    "DROP_TOKEN_UNAVAILABLE",
  );

  const reissued = await reissueDropPackageToken(repository, {
    packageId: packageRow.id,
    purpose: "view",
    actor,
  });
  assert.match(reissued.rawToken, /^dmp_v_/);
  assert.match(reissued.link, /^https:\/\/drop\.dimpro\.hu\/p\/dmp_v_/);
  assert.equal(reissued.revokedTokenCount, 1);
  assert.equal(JSON.stringify(repository.snapshot()).includes(reissued.rawToken), false);

  const manualToken = await repository.issueAccessToken(
    packageRow.id,
    "report",
    packageRow.expires_at,
    "admin_reissue",
  );
  const revoked = await revokeDropPackageToken(repository, {
    packageId: packageRow.id,
    tokenId: manualToken.record.id,
    actor,
    reason: "Kézi biztonsági visszavonás",
  });
  assert.equal(revoked.revoked, true);
  assert.equal(
    repository.snapshot().accessTokens.find((token) => token.id === manualToken.record.id)?.status,
    "revoked",
  );

  const expiring = await transitionDropPackageStatus(repository, {
    packageId: packageRow.id,
    targetStatus: "expiring",
    actor,
    reason: "Lejárati workflow",
    now: new Date(now + 2_000),
  });
  assert.equal(expiring.package.status, "expiring");
  assert.ok(expiring.revokedTokenCount >= 3);
  assert.equal(repository.snapshot().accessTokens.every((token) => token.status !== "active"), true);

  assert.ok(repository.snapshot().events.some((event) => event.eventType === "package.status_changed"));
  assert.ok(repository.snapshot().events.some((event) => event.eventType === "access.token_reissued"));

  const atomicPackage = {
    ...packageRow,
    id: randomUUID(),
    public_code: "DMP-2608-ATOMIC",
    status: "active" as const,
    closed_at: null,
  };
  const atomicRepository = new AtomicProbeRepository({ packages: [atomicPackage] });
  const previousView = await atomicRepository.issueAccessToken(
    atomicPackage.id,
    "view",
    atomicPackage.expires_at,
    "package_creation",
  );
  const atomicReissue = await reissueDropPackageToken(atomicRepository, {
    packageId: atomicPackage.id,
    purpose: "view",
    actor,
  });
  assert.equal(atomicRepository.atomicReissueCalls, 1);
  assert.equal(atomicReissue.revokedTokenCount, 1);
  assert.notEqual(atomicReissue.rawToken, previousView.capability.rawToken);

  const activeReport = await atomicRepository.issueAccessToken(
    atomicPackage.id,
    "report",
    atomicPackage.expires_at,
    "package_creation",
  );
  const atomicRevoke = await revokeDropPackageToken(atomicRepository, {
    packageId: atomicPackage.id,
    tokenId: activeReport.record.id,
    actor,
  });
  assert.equal(atomicRepository.atomicRevokeCalls, 1);
  assert.equal(atomicRevoke.revoked, true);

  console.log("DROP 0.2.0 admin lifecycle tests: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
