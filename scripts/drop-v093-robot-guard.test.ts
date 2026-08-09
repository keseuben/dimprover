import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupDropRobotGuard,
  consumeDropUploadIntent,
  createDropRobotAuthFingerprint,
  getDropRobotGuardConfig,
  issueDropUploadIntents,
} from "../app/lib/drop/robot/dropRobotGuard";

process.env.DROP_BOT_GUARD_DISABLE_AUDIT = "true";
process.env.DROP_BOT_HARD_BLOCK_MS = "400";
process.env.DROP_BOT_MIN_HUMAN_MS = "1500";
process.env.DROP_BOT_INTENT_TTL_MS = "30000";

const headers = new Headers({ "x-forwarded-for": "198.51.100.20", "user-agent": "DIMPRO robot guard test" });
const changedIpHeaders = new Headers({ "x-forwarded-for": "198.51.100.21", "user-agent": "DIMPRO robot guard test" });
const packageId = "11111111-1111-4111-8111-111111111111";
const auth = createDropRobotAuthFingerprint("space_session", "dsp_s_test_credential_that_is_long_enough_1234567890");
const otherAuth = createDropRobotAuthFingerprint("space_session", "dsp_s_other_credential_that_is_long_enough_1234567890");
let checks = 0;
function pass() { checks += 1; }
async function expectCode(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => (error as { code?: string }).code === code);
  pass();
}
async function withStore(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "drop-v093-"));
  process.env.DROP_BOT_GUARD_DATA_DIR = root;
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function main() {
assert.equal(getDropRobotGuardConfig().hardBlockMs, 400); pass();
assert.equal(getDropRobotGuardConfig().minimumHumanMs, 1500); pass();

await withStore(async () => {
  const issued = await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 3, nowMs: 10_000 });
  assert.equal(issued.intents.length, 3); pass();
  assert.ok(issued.intents.every((item) => item.token.startsWith("dgi_"))); pass();
  const first = issued.intents[0];
  await expectCode(() => consumeDropUploadIntent({ rawToken: first.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 10_100 }), "DROP_BOT_TIMING_BLOCKED");
  await expectCode(() => consumeDropUploadIntent({ rawToken: first.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 12_000 }), "DROP_BOT_INTENT_REPLAY");
  const second = issued.intents[1];
  await expectCode(() => consumeDropUploadIntent({ rawToken: second.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 10_700 }), "DROP_BOT_TIMING_TOO_EARLY");
  const consumed = await consumeDropUploadIntent({ rawToken: second.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 11_600 });
  assert.ok(consumed.elapsedMs >= 1500); pass();
  await expectCode(() => consumeDropUploadIntent({ rawToken: second.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 12_000 }), "DROP_BOT_INTENT_REPLAY");
  await expectCode(() => consumeDropUploadIntent({ rawToken: issued.intents[2].token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "https://bot.invalid", headers, nowMs: 11_600 }), "DROP_BOT_HONEYPOT_BLOCKED");
});

await withStore(async () => {
  const [intent] = (await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 20_000 })).intents;
  await expectCode(() => consumeDropUploadIntent({ rawToken: intent.token, packageId: "22222222-2222-4222-8222-222222222222", authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 22_000 }), "DROP_BOT_INTENT_CONTEXT_MISMATCH");
});
await withStore(async () => {
  const [intent] = (await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 30_000 })).intents;
  await expectCode(() => consumeDropUploadIntent({ rawToken: intent.token, packageId, authorizationMode: "space_session", authFingerprint: otherAuth, honeypot: "", headers, nowMs: 32_000 }), "DROP_BOT_INTENT_CONTEXT_MISMATCH");
});
await withStore(async () => {
  const [intent] = (await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 40_000 })).intents;
  await expectCode(() => consumeDropUploadIntent({ rawToken: intent.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 71_000 }), "DROP_BOT_INTENT_EXPIRED");
});
await withStore(async () => {
  const [intent] = (await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 80_000 })).intents;
  const result = await consumeDropUploadIntent({ rawToken: intent.token, packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers: changedIpHeaders, nowMs: 82_000 });
  assert.equal(result.ok, true); pass();
});
await withStore(async () => {
  process.env.DROP_BOT_ACTIVE_INTENTS = "5";
  await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 5, nowMs: 90_000 });
  await expectCode(() => issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 90_100 }), "DROP_BOT_ACTIVE_INTENT_LIMIT");
  delete process.env.DROP_BOT_ACTIVE_INTENTS;
});
await withStore(async () => {
  process.env.DROP_BOT_BATCHES_PER_MINUTE = "2";
  await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 100_000 });
  await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 100_001 });
  await expectCode(() => issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 100_002 }), "DROP_BOT_INTENT_RATE_LIMIT");
  delete process.env.DROP_BOT_BATCHES_PER_MINUTE;
});
await withStore(async () => {
  await expectCode(() => consumeDropUploadIntent({ rawToken: "invalid", packageId, authorizationMode: "space_session", authFingerprint: auth, honeypot: "", headers, nowMs: 110_000 }), "DROP_BOT_INTENT_INVALID");
});
await withStore(async () => {
  await issueDropUploadIntents({ packageId, authorizationMode: "space_session", authFingerprint: auth, headers, count: 1, nowMs: 120_000 });
  const cleanup = await cleanupDropRobotGuard(151_000);
  assert.equal(cleanup.removedActive, 1); pass();
});

console.log(JSON.stringify({ ok: true, version: "DROP 0.9.3", checks }, null, 2));
}
void main().catch((error) => { console.error(error); process.exit(1); });
