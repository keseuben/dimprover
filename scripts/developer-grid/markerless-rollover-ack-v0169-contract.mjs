import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const rollover = require(path.join(root, "desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs"));
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");

let n = 0;
function check(label, fn) { n += 1; fn(); console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); }

const expected = {
  taskId: "dev-task-grid-6d00963673f51c5ccde5",
  sessionId: "grid-work-dev-task-grid-6d00963673f51c5ccde5-jazminai",
  workerCode: "JAZMINAI",
  previousConversationId: "6ab4385f-21b4-83eb-a1ac-ab42866bb947",
  contextSnapshotId: "ctx-dev-task-grid-6d00963673f51c5ccde5-1790274564574-ed6b56e1",
  contextRevision: 13,
  handoffPackId: "hp-dev-task-grid-6d00963673f51c5ccde5-1790274564732-9692fca5",
  sourceHead: "117915263210cbe9d0cdcd728e070221e560e161",
  sourceProofSha256: "778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c",
};
const ackObject = {
  schemaVersion: 1,
  ...expected,
  productionAccess: "DENY",
  sameTask: true,
  newTaskLaunch: false,
};
const json = JSON.stringify(ackObject, null, 2);

check("canonical marker ACK remains valid", () => {
  const body = `BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1\n\`\`\`json\n${json}\n\`\`\``;
  const result = rollover.validateConversationRolloverAck(body, expected);
  assert.equal(result.validated, true);
  assert.equal(result.parseMode, "MARKER");
});

check("real-world markerless fenced JSON ACK is accepted", () => {
  const body = `\`\`\`json\n${json}\n\`\`\``;
  const result = rollover.validateConversationRolloverAck(body, expected);
  assert.equal(result.validated, true);
  assert.equal(result.markerPresent, false);
  assert.equal(result.parseMode, "STRICT_JSON_ONLY_FALLBACK");
});

check("markerless raw JSON ACK is accepted", () => {
  const result = rollover.validateConversationRolloverAck(json, expected);
  assert.equal(result.validated, true);
  assert.equal(result.parseMode, "STRICT_JSON_ONLY_FALLBACK");
});

check("markerless prose plus JSON remains blocked", () => {
  const result = rollover.validateConversationRolloverAck(`Rendben.\n${json}`, expected);
  assert.equal(result.validated, false);
  assert.ok(result.mismatches.includes("ROLLOVER_ACK_MARKER_MISSING"));
});

check("markerless JSON with trailing prose remains blocked", () => {
  const result = rollover.validateConversationRolloverAck(`${json}\nFolytatom.`, expected);
  assert.equal(result.validated, false);
  assert.ok(result.mismatches.includes("ROLLOVER_ACK_MARKERLESS_NOT_JSON_ONLY"));
});

check("markerless identity mismatch remains blocked", () => {
  const bad = JSON.stringify({ ...ackObject, taskId: "wrong-task" });
  const result = rollover.validateConversationRolloverAck(bad, expected);
  assert.equal(result.validated, false);
  assert.ok(result.mismatches.includes("taskId"));
});

check("markerless missing security field remains blocked", () => {
  const badObject = { ...ackObject };
  delete badObject.sourceProofSha256;
  const result = rollover.validateConversationRolloverAck(JSON.stringify(badObject), expected);
  assert.equal(result.validated, false);
  assert.ok(result.mismatches.includes("sourceProofSha256"));
});

check("markerless unexpected field remains blocked", () => {
  const result = rollover.validateConversationRolloverAck(JSON.stringify({ ...ackObject, note: "extra" }), expected);
  assert.equal(result.validated, false);
  assert.ok(result.mismatches.includes("unexpected:note"));
});

check("main ACK handler delegates ACK_WAIT bodies to validator without marker prefilter", () => {
  assert.match(main, /if \(state !== ROLLOVER_STATES\.ACK_WAIT\) return \{ processed:false, state \};/);
  assert.doesNotMatch(main, /ACK_WAIT \|\| !String\(body \|\| ""\)\.includes\(ROLLOVER_ACK_MARKER\)/);
});

check("conversation monitor retains marker recovery and recognizes latest strict JSON fallback", () => {
  assert.match(main, /const markedRolloverAck = assistantMessages\.find/);
  assert.match(main, /rolloverState === ROLLOVER_STATES\.ACK_WAIT/);
  assert.match(main, /parseConversationRolloverAck\(latestAssistant\.text\)\?\.ok/);
  assert.match(main, /markedRolloverAck \|\| markerlessLatestAck/);
});

console.log(`Developer Grid markerless rollover ACK v0.1.69 contract PASS · ${n}/${n}`);
