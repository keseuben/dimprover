import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "drop-v110-send-"));
  const publicStore = path.join(root, "public");
  const markerStore = path.join(root, "marker");
  const entitlementStore = path.join(root, "entitlements");
  const licenseRoot = path.join(root, "licenses");
  await mkdir(path.join(licenseRoot, "data"), { recursive: true });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 180 * 86_400_000).toISOString();
  await writeFile(path.join(licenseRoot, "data", "license-store.json"), JSON.stringify({
    licenses: [{
      id: "lic-test-001",
      licenseKey: "DIMPRO-TEST-6M-ABCD-EFGH-JKMP-QRST",
      companyId: "test-company",
      companyName: "Teszt Szervezet Kft.",
      status: "active",
      startsAt: now.toISOString(),
      expiresAt,
      maxDevices: 5,
      enabledModules: ["DROP_SEND", "DROP_QUICK_IMAGE_SEND"],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }],
    devices: [],
  }, null, 2));

  process.env.DROP_SESSION_SECRET = "drop-v110-test-session-secret-0123456789abcdef";
  process.env.DROP_TOKEN_HMAC_SECRET = "drop-v110-test-token-secret-0123456789abcdef";
  process.env.DROP_PUBLIC_STATE_DATA_DIR = publicStore;
  process.env.DROP_PUBLIC_STORE_MARKER_DIR = markerStore;
  process.env.DROP_PUBLIC_STORE_MODE = "file";
  process.env.DROP_SEND_ENTITLEMENT_DATA_DIR = entitlementStore;
  process.env.DIMPRO_LICENSE_DATA_ROOT = licenseRoot;

  const formatter = await import("../app/lib/drop/public/dropSendCodeFormat");
  const repository = await import("../app/lib/drop/public/dropPublicRepository");
  const checks: string[] = [];
  const pass = (name: string) => checks.push(name);

  try {
    assert.equal(formatter.normalizeDropSendCode("abcd-123-456"), "ABCD123456"); pass("normalize-modern-code");
    assert.equal(formatter.formatDropSendCode("abcd123456"), "ABCD-123-456"); pass("format-modern-code");
    assert.equal(formatter.isModernDropSendCode("ABCD-123-456"), true); pass("modern-code-valid");
    assert.equal(formatter.formatDropSendCode("123456"), "123-456"); pass("legacy-code-format-compatible");
    assert.equal(formatter.isCompleteDropSendCode("123-456"), true); pass("legacy-code-compatible");
    assert.equal(formatter.isCompleteDropSendCode("ABC-123-456"), false); pass("short-prefix-denied");

    const created = await repository.createDropSendCode({
      label: "Teszt Send-felhasználó",
      code: "ABCD123456",
      licenseId: "lic-test-001",
      userFullName: "Teszt Elek",
      userEmail: "teszt.elek@example.hu",
      organizationName: "Teszt Szervezet Kft.",
      phone: "+36 30 123 4567",
      recipientMode: "locked_default",
      defaultRecipient: {
        id: "recipient-default",
        name: "Projekt Beérkező",
        email: "projekt@example.hu",
        company: "Teszt Szervezet Kft.",
      },
      approvedRecipients: [],
      canUseStandardSend: true,
      canUseQuickImageSend: true,
      canUseImageGroups: true,
      canUseFileComments: true,
      canUseProjectDrop: false,
      expiresAt,
      maxPackagesPerDay: 10,
      maxBytesPerDay: 2 * 1024 * 1024 * 1024,
      maxRecipients: 10,
      defaultRetentionDays: 5,
    }, "Automatikus teszt");

    assert.equal(created.formattedCode, "ABCD-123-456"); pass("created-modern-code-format");
    assert.equal(created.record.codeHint, "***-456"); pass("modern-code-safe-hint");
    assert.equal(created.record.entitlement?.userFullName, "Teszt Elek"); pass("entitlement-user-name");
    assert.equal(created.record.entitlement?.userEmail, "teszt.elek@example.hu"); pass("entitlement-user-email");
    assert.equal(created.record.entitlement?.licenseId, "lic-test-001"); pass("entitlement-license-link");
    assert.equal(created.record.entitlement?.recipientMode, "locked_default"); pass("locked-recipient-mode");
    assert.equal(created.record.entitlement?.defaultRecipient?.email, "projekt@example.hu"); pass("default-recipient-linked");
    assert.equal(created.record.entitlement?.canUseImageGroups, true); pass("image-groups-enabled");
    assert.equal(created.record.entitlement?.canUseProjectDrop, false); pass("project-drop-remains-disabled");

    const verified = await repository.verifyDropSendCode("abcd-123-456");
    assert.equal(verified.id, created.record.id); pass("modern-code-verifies");
    assert.equal(verified.entitlement?.userFullName, "Teszt Elek"); pass("verified-profile-returned");
    assert.equal((await repository.listDropSendCodes())[0]?.entitlement?.userEmail, "teszt.elek@example.hu"); pass("list-profile-returned");

    const publicState = await readFile(path.join(publicStore, "state.json"), "utf8");
    assert.equal(publicState.includes("ABCD123456"), false); pass("raw-code-not-in-public-store");
    assert.equal(publicState.includes("ABCD-123-456"), false); pass("formatted-code-not-in-public-store");
    const profiles = await readFile(path.join(entitlementStore, "profiles.json"), "utf8");
    assert.equal(profiles.includes("ABCD123456"), false); pass("raw-code-not-in-profile-store");
    assert.equal(profiles.includes("teszt.elek@example.hu"), true); pass("registered-email-in-profile-store");

    await assert.rejects(
      () => repository.createDropSendCode({
        label: "Hibás jogosultság",
        code: "WXYZ987654",
        licenseId: "lic-test-001",
        userFullName: "Teszt Anna",
        userEmail: "teszt.anna@example.hu",
        recipientMode: "locked_default",
        expiresAt,
      }, "Automatikus teszt"),
      (error: unknown) => (error as { code?: string }).code === "DROP_SEND_DEFAULT_RECIPIENT_REQUIRED",
    );
    pass("locked-mode-requires-default-recipient");

    const codes = await repository.listDropSendCodes();
    const failedRecord = codes.find((item) => item.label === "Hibás jogosultság");
    assert.equal(failedRecord?.status, "revoked"); pass("failed-profile-revokes-code");

    console.log(JSON.stringify({ ok: true, version: "DROP 1.1.0 candidate", checks: checks.length, names: checks }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

void main().catch((error) => { console.error(error); process.exit(1); });
