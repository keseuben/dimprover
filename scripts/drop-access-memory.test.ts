import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDropPackageWithPin, validateDropAccessToken, DropAccessError } from "../app/lib/drop/dropAccess";
import { hashDropPin } from "../app/lib/drop/dropCrypto";
import { InMemoryDropRepository } from "../app/lib/drop/dropMemoryRepository";
import type { DropPackageRecord } from "../app/lib/drop/dropTypes";

process.env.DROP_TOKEN_HMAC_SECRET = "drop-memory-token-secret-".repeat(3);
process.env.DROP_SESSION_SECRET = "drop-memory-session-secret-".repeat(3);

const TEST_PIN = "684219";
const pinMaterial = hashDropPin(TEST_PIN);
const now = Date.now();

function createPackage(overrides: Partial<DropPackageRecord> = {}): DropPackageRecord {
  const createdAt = new Date(now - 60_000).toISOString();
  return {
    id: randomUUID(),
    public_code: "DMP-2608-ABC234",
    mode: "file",
    title: "DROP memória integrációs teszt",
    description: "Fájl nélküli csomag",
    project_id: null,
    project_name_snapshot: "Tesztprojekt",
    owner_user_id: "test-admin",
    organization_id: null,
    created_by_user_id: "test-admin",
    uploader_name: "Teszt Elek",
    uploader_email: "teszt@example.hu",
    status: "active",
    access_policy: "token_pin",
    upload_opens_at: createdAt,
    upload_closes_at: new Date(now + 3_600_000).toISOString(),
    expires_at: new Date(now + 86_400_000).toISOString(),
    grace_expires_at: new Date(now + 90_000_000).toISOString(),
    retention_days: 1,
    pin_hash: pinMaterial.hash,
    pin_salt: pinMaterial.salt,
    max_file_count: 100,
    max_file_size_bytes: 100_000_000,
    max_total_size_bytes: 1_000_000_000,
    current_file_count: 0,
    current_total_size_bytes: 0,
    created_at: createdAt,
    updated_at: createdAt,
    closed_at: null,
    expired_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function requestHeaders(ip = "203.0.113.7") {
  return new Headers({
    "x-forwarded-for": `${ip}, 10.0.0.1`,
    "user-agent": "DIMPRO Drop memory integration test",
  });
}

async function expectAccessError(
  action: () => Promise<unknown>,
  expectedCode: string,
  expectedStatus: number,
) {
  try {
    await action();
    assert.fail(`A műveletnek ${expectedCode} hibával meg kellett volna állnia.`);
  } catch (error) {
    assert.ok(error instanceof DropAccessError, "A hozzáférési hiba típusa hibás.");
    assert.equal(error.code, expectedCode);
    assert.equal(error.status, expectedStatus);
  }
}

async function main() {
  const packageRow = createPackage();
const repository = new InMemoryDropRepository({ packages: [packageRow] });
const opened = await openDropPackageWithPin({
  publicCode: packageRow.public_code.toLowerCase(),
  pin: TEST_PIN,
  purpose: "view",
  headers: requestHeaders(),
}, repository);

assert.equal(opened.packageId, packageRow.id);
assert.equal(opened.purpose, "view");
assert.match(opened.rawToken, /^dmp_v_/);
assert.match(opened.redirectPath, /^\/p\/dmp_v_/);

const validated = await validateDropAccessToken({
  rawToken: opened.rawToken,
  expectedPurpose: "view",
  headers: requestHeaders(),
}, repository);
assert.equal(validated.packageId, packageRow.id);
assert.equal(validated.tokenHint, opened.tokenHint);

const successSnapshot = repository.snapshot();
assert.equal(successSnapshot.accessTokens.length, 1);
assert.equal(successSnapshot.accessTokens[0]?.use_count, 1);
assert.equal(successSnapshot.attempts.filter((item) => item.success).length, 2);
assert.ok(successSnapshot.events.some((item) => item.eventType === "access.pin_granted"));
assert.ok(successSnapshot.events.some((item) => item.eventType === "access.view_opened"));
assert.equal(JSON.stringify(successSnapshot).includes(opened.rawToken), false, "A memóriás adattár nyers tokent tartalmaz.");

await expectAccessError(
  () => validateDropAccessToken({
    rawToken: opened.rawToken,
    expectedPurpose: "upload",
    headers: requestHeaders("203.0.113.8"),
  }, repository),
  "DROP_TOKEN_PURPOSE_MISMATCH",
  403,
);

const wrongPinRepository = new InMemoryDropRepository({ packages: [packageRow] });
for (let attempt = 0; attempt < 5; attempt += 1) {
  await expectAccessError(
    () => openDropPackageWithPin({
      publicCode: packageRow.public_code,
      pin: "111111",
      purpose: "view",
      headers: requestHeaders("198.51.100.4"),
    }, wrongPinRepository),
    "DROP_ACCESS_DENIED",
    401,
  );
}
await expectAccessError(
  () => openDropPackageWithPin({
    publicCode: packageRow.public_code,
    pin: TEST_PIN,
    purpose: "view",
    headers: requestHeaders("198.51.100.4"),
  }, wrongPinRepository),
  "DROP_RATE_LIMIT_PACKAGE",
  429,
);
assert.equal(wrongPinRepository.snapshot().attempts.length, 5, "A blokkolt hatodik próbálkozás nem hozhat létre új sikertelen rekordot.");

const expiredTokenRepository = new InMemoryDropRepository({ packages: [packageRow] });
const expired = await expiredTokenRepository.issueAccessToken(
  packageRow.id,
  "download",
  new Date(now - 1_000).toISOString(),
  "admin_reissue",
);
await expectAccessError(
  () => validateDropAccessToken({
    rawToken: expired.capability.rawToken,
    expectedPurpose: "download",
    headers: requestHeaders("192.0.2.20"),
  }, expiredTokenRepository),
  "DROP_TOKEN_UNAVAILABLE",
  410,
);

const unavailablePackage = createPackage({ id: randomUUID(), public_code: "DMP-2608-CLOSED", status: "expiring" });
const unavailableRepository = new InMemoryDropRepository({ packages: [unavailablePackage] });
await expectAccessError(
  () => openDropPackageWithPin({
    publicCode: unavailablePackage.public_code,
    pin: TEST_PIN,
    purpose: "view",
    headers: requestHeaders("192.0.2.30"),
  }, unavailableRepository),
  "DROP_PACKAGE_UNAVAILABLE",
  410,
);

  console.log("DROP 0.2.0 in-memory access integration tests: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
