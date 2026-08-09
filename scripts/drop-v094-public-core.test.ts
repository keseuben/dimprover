import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function expectCode(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === code);
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "drop-v094-public-"));
  process.env.DROP_PUBLIC_STATE_DATA_DIR = root;
  process.env.DROP_PUBLIC_STORE_MARKER_DIR = `${root}-marker`;
  process.env.DROP_PUBLIC_STORE_MODE = "file";
  const repository = await import("../app/lib/drop/public/dropPublicRepository");
  const proof = await import("../app/lib/drop/public/dropDownloadProof");
  const checks: string[] = [];
  const pass = (name: string) => checks.push(name);
  const headers = new Headers({ "x-forwarded-for": "198.51.100.94", "user-agent": "DIMPRO DROP 0.9.4 core test" });
  const otherHeaders = new Headers({ "x-forwarded-for": "198.51.100.95", "user-agent": "DIMPRO DROP 0.9.4 core test" });
  try {
    const defaults = repository.getDropPublicDefaults();
    assert.equal(defaults.limits.maxFileCount, 50); pass("50-file-limit");
    assert.equal(defaults.limits.maxFileSizeBytes, 262_144_000); pass("250mb-file-limit");
    assert.equal(defaults.limits.maxTotalSizeBytes, 262_144_000); pass("250mb-total-limit");

    const created = await repository.createDropSendCode({
      label: "Teszt küldési kód",
      code: "123123",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      maxPackagesPerDay: 2,
      maxBytesPerDay: 800_000_000,
      maxRecipients: 4,
      defaultRetentionDays: 5,
    }, "Automatikus teszt");
    assert.equal(created.formattedCode, "123-123"); pass("formatted-code");
    assert.equal(created.record.codeHint, "***-123"); pass("safe-code-hint");
    assert.equal("codeHash" in created.record, false); pass("safe-record-no-hash");
    assert.equal("codeSalt" in created.record, false); pass("safe-record-no-salt");
    const stateRaw = await readFile(path.join(root, "state.json"), "utf8");
    assert.equal(stateRaw.includes("123123"), false); pass("raw-code-not-persisted");
    assert.equal(stateRaw.includes("codeHash"), true); pass("hash-persisted");
    assert.equal((await repository.verifyDropSendCode("123-123")).id, created.record.id); pass("correct-code-valid");
    await expectCode(() => repository.verifyDropSendCode("999999"), "DROP_SEND_CODE_DENIED"); pass("wrong-code-denied");
    await expectCode(() => repository.createDropSendCode({ label: "Duplikált", code: "123123", expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, "Teszt"), "DROP_SEND_CODE_DUPLICATE"); pass("duplicate-code-denied");
    await repository.setDropSendCodeStatus(created.record.id, "revoked");
    await expectCode(() => repository.verifyDropSendCode("123123"), "DROP_SEND_CODE_DENIED"); pass("revoked-code-denied");
    await repository.setDropSendCodeStatus(created.record.id, "active");
    assert.equal((await repository.verifyDropSendCode("123123")).status, "active"); pass("code-reactivated");

    const personal = await repository.createDropSubmissionGate({
      type: "personal",
      title: "Személyes tesztkapu",
      slug: "szemelyes-teszt",
      recipients: [{ name: "Teszt Címzett", email: "recipient@example.hu", label: "Projektvezető" }],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      requireSenderEmail: false,
    }, "Teszt");
    assert.equal(personal.type, "personal"); pass("personal-gate-created");
    assert.equal(personal.recipients.length, 1); pass("personal-one-recipient");
    assert.equal(personal.requireSenderEmail, true); pass("sender-email-mandatory");
    await expectCode(() => repository.createDropSubmissionGate({ type: "project", title: "Hibás projektkapu", recipients: [{ name: "A", email: "a@example.hu" }, { name: "B", email: "b@example.hu" }] }, "Teszt"), "DROP_GATE_SINGLE_RECIPIENT_REQUIRED"); pass("project-multiple-recipient-denied");

    const organization = await repository.createDropSubmissionGate({
      type: "organization",
      title: "Szervezeti tesztkapu",
      slug: "szervezeti-teszt",
      recipients: [
        { name: "Első Címzett", email: "first@example.hu", label: "Projektvezető" },
        { name: "Második Címzett", email: "second@example.hu", label: "Műszaki ellenőr" },
      ],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      allowFileComments: true,
      downloadProtection: "link_pin",
    }, "Teszt");
    assert.equal(organization.recipients.length, 2); pass("organization-multiple-recipients");
    assert.equal((await repository.getDropSubmissionGateBySlug("szervezeti-teszt")).id, organization.id); pass("gate-slug-lookup");
    await repository.setDropSubmissionGateStatus(organization.id, "revoked");
    await expectCode(() => repository.getDropSubmissionGateBySlug("szervezeti-teszt"), "DROP_GATE_NOT_AVAILABLE"); pass("revoked-gate-denied");
    await repository.setDropSubmissionGateStatus(organization.id, "active");

    const publicSession = await repository.createDropPublicSession({ workflowType: "send", sendCodeId: created.record.id, headers });
    assert.ok(publicSession.rawToken.startsWith("dps_")); pass("public-session-token-format");
    const rawAfterSession = await readFile(path.join(root, "state.json"), "utf8");
    assert.equal(rawAfterSession.includes(publicSession.rawToken), false); pass("raw-session-not-persisted");
    assert.equal((await repository.resolveDropPublicSession(publicSession.rawToken, headers, "send")).id, publicSession.record.id); pass("session-resolves");
    await expectCode(() => repository.resolveDropPublicSession(publicSession.rawToken, otherHeaders, "send"), "DROP_PUBLIC_SESSION_CONTEXT_CHANGED"); pass("session-ip-bound");
    await expectCode(() => repository.resolveDropPublicSession(publicSession.rawToken, headers, "submission_gate"), "DROP_PUBLIC_SESSION_PURPOSE_MISMATCH"); pass("session-purpose-bound");
    await repository.bindDropPublicSessionPackage(publicSession.rawToken, "11111111-1111-4111-8111-111111111111", 262_144_000);
    await expectCode(() => repository.bindDropPublicSessionPackage(publicSession.rawToken, "22222222-2222-4222-8222-222222222222", 262_144_000), "DROP_PUBLIC_SESSION_ALREADY_BOUND"); pass("one-package-per-session");

    const quotaCode = await repository.createDropSendCode({ label: "Egyszeri kód", code: "654654", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), maxPackagesPerDay: 1, maxBytesPerDay: 300_000_000 }, "Teszt");
    const quotaSession = await repository.createDropPublicSession({ workflowType: "send", sendCodeId: quotaCode.record.id, headers });
    await repository.bindDropPublicSessionPackage(quotaSession.rawToken, "33333333-3333-4333-8333-333333333333", 262_144_000);
    await expectCode(() => repository.verifyDropSendCode("654654"), "DROP_SEND_CODE_DAILY_PACKAGE_LIMIT"); pass("daily-package-quota");

    const workflow = await repository.saveDropPackageWorkflow({
      packageId: "11111111-1111-4111-8111-111111111111",
      workflowType: "send",
      subject: "Teszt tárgy",
      senderMessage: "Teszt üzenet",
      packageNote: "Teszt megjegyzés",
      requireDownloadPin: true,
      sendCodeId: created.record.id,
      gateId: null,
      gateType: null,
      projectId: null,
      projectName: null,
      targetFolder: null,
      selectedRecipientIds: [],
      recipientEmails: ["recipient@example.hu"],
      finalizedAt: null,
      notificationStatus: "not_requested",
      notificationDetail: null,
      downloadLinkHint: null,
    });
    assert.equal(workflow.requireDownloadPin, true); pass("workflow-saved");
    assert.equal((await repository.getDropPackageWorkflow(workflow.packageId))?.packageNote, "Teszt megjegyzés"); pass("workflow-read");
    const claim = await repository.claimDropPackageFinalization(workflow.packageId);
    assert.equal(claim.state, "claimed"); pass("finalization-claimed");
    await expectCode(() => repository.claimDropPackageFinalization(workflow.packageId), "DROP_PUBLIC_FINALIZE_IN_PROGRESS"); pass("parallel-finalization-blocked");
    await repository.updateDropPackageWorkflow(workflow.packageId, { finalizedAt: new Date().toISOString(), notificationStatus: "sent" });
    assert.equal((await repository.claimDropPackageFinalization(workflow.packageId)).state, "finalized"); pass("finalization-idempotent");

    const downloadProof = proof.createDropDownloadProof(workflow.packageId);
    assert.equal(proof.verifyDropDownloadProof(downloadProof.value, workflow.packageId), true); pass("download-proof-valid");
    assert.equal(proof.verifyDropDownloadProof(downloadProof.value, "22222222-2222-4222-8222-222222222222"), false); pass("download-proof-package-bound");
    assert.equal(proof.verifyDropDownloadProof(`${downloadProof.value}tampered`, workflow.packageId), false); pass("download-proof-tamper-denied");

    const safe = await repository.getDropPublicStateSafe();
    assert.equal(safe.sendCodes.every((row) => !("codeHash" in row)), true); pass("safe-state-no-code-hash");
    assert.ok(safe.packageWorkflowCount >= 1); pass("safe-state-workflow-count");

    await writeFile(path.join(root, "state.json"), "{broken-json", "utf8");
    await expectCode(() => repository.getDropPublicStateSafe(), "DROP_PUBLIC_STATE_CORRUPT"); pass("corrupt-state-fails-closed");

    console.log(JSON.stringify({ ok: true, version: "DROP 0.9.4", checks: checks.length, names: checks }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(`${root}-marker`, { recursive: true, force: true });
  }
}
void main().catch((error) => { console.error(error); process.exit(1); });
