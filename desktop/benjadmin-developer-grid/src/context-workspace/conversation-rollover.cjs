"use strict";

const { CONTINUATION_PROTOCOL_VERSION, buildContinuationCapsule } = require("./continuation-contract.cjs");

const ROLLOVER_PROMPT_MARKER = "BENJADMIN_PROMPT_KIND: CONVERSATION_ROLLOVER_V1";
const ROLLOVER_ACK_MARKER = "BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1";
const ROLLOVER_STATES = Object.freeze({
  HANDOFF_SAVED: "HANDOFF_SAVED",
  NAVIGATING: "NAVIGATING",
  CONTINUATION_SENT: "CONTINUATION_SENT",
  CLIPBOARD_COPIED: "CLIPBOARD_COPIED",
  ACK_WAIT: "ACK_WAIT",
  READY: "READY",
  BLOCKED: "BLOCKED",
});

function text(value, max = 8000) { return String(value ?? "").trim().slice(0, max); }
function backendWorkerCode(value) { const code = text(value, 40).toUpperCase(); return code === "BENAI" ? "BENJAMINAI" : code; }

function detectConversationLimit(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const assistant = [...list].reverse().find((item) => String(item?.role || "").toUpperCase() === "ASSISTANT" && text(item?.text));
  const body = text(assistant?.text, 90000);
  if (!body) return { reached:false, reason:"NO_ASSISTANT_MESSAGE" };
  const maximum = [
    /el[ée]rted\s+a\s+(?:besz[ée]lget[ée]s|cseveg[ée]s)\s+maxim[aá]lis\s+hossz[aá]t/i,
    /you(?:['’])?ve\s+reached\s+the\s+maximum\s+length\s+for\s+this\s+conversation/i,
    /this\s+conversation\s+has\s+reached\s+(?:its|the)\s+maximum\s+length/i,
    /maximum\s+conversation\s+length\s+(?:has\s+been\s+)?reached/i,
  ].some((pattern) => pattern.test(body));
  const continuation = /(?:[uú]j\s+cseveg[ée]s|new\s+chat|new\s+conversation|start\s+(?:a\s+)?new)/i.test(body);
  return {
    reached: maximum && continuation,
    reason: maximum ? (continuation ? "CONVERSATION_LIMIT_REACHED" : "LIMIT_TEXT_WITHOUT_CONTINUATION") : "NO_LIMIT_MARKER",
    messageId: assistant?.messageId || null,
    excerpt: body.slice(-900),
  };
}

function chatProjectRootFromConversationUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com"].includes(url.hostname)) return "";
    const match = url.pathname.match(/^(\/g\/g-p-[^/]+)\/c\/[A-Za-z0-9_-]+(?:\/.*)?$/);
    if (!match) return "";
    url.pathname = match[1];
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch { return ""; }
}

function buildConversationRolloverPrompt({ task, workerCode, previousConversationId, previousConversationUrl = "", previousConversationTitle = "", humanHandoffId = "", humanHandoffFileName = "", memory, sourceProofSha256 }) {
  const context = memory?.context || {};
  const handoff = memory?.handoff || {};
  const code = backendWorkerCode(workerCode);
  const capsule = buildContinuationCapsule({ task, workerCode:code, previousConversationId, previousConversationUrl, memory, sourceProofSha256 });
  const summary = text(context.summary || handoff.summary || task?.contextSnapshotSummary || "Nincs Context Snapshot összefoglaló.", 12000);
  const blockers = Array.isArray(context.unresolvedBlockers) ? context.unresolvedBlockers.map((item) => text(item?.summary || item, 500)).filter(Boolean) : [];
  return [
    ROLLOVER_PROMPT_MARKER,
    "BENJADMIN CONTROL EVENT · CONVERSATION LIMIT RECOVERY · SAME TASK",
    `Worker: ${code}`,
    `Task: ${text(task?.id, 220)}`,
    `Session: ${text(task?.sessionId, 240)}`,
    `Previous conversation: ${text(previousConversationId, 180)}`,
    `Previous title: ${text(previousConversationTitle, 500) || "—"}`,
    `Previous URL: ${text(previousConversationUrl, 1200) || "—"}`,
    `Human Handoff MD: ${text(humanHandoffId, 260) || "—"} · ${text(humanHandoffFileName, 500) || "—"}`,
    `Continuation Protocol: ${CONTINUATION_PROTOCOL_VERSION}`,
    `Continuation Capsule: ${capsule.id} · ${capsule.capsuleSha256}`,
    `Rule Pack: ${capsule.policy.rulePackId} · ${capsule.policy.rulePackSha256}`,
    `Skill Manifest: ${capsule.skills.skillManifestId} · ${capsule.skills.skillManifestSha256}`,
    `Context Snapshot: ${text(context.id, 260)} · revision ${Number(context.revision || 0)}`,
    `Handoff Pack: ${text(handoff.id, 260)}`,
    `Stage: ${Number(context.stage || task?.workStageIndex || 1)}/6 · ${text(context.stageLabel || "")}`,
    `Branch: ${text(context.branch || task?.branchName, 500)}`,
    `Worktree: ${text(context.worktree || task?.worktreePath, 1000)}`,
    `HEAD: ${text(context.sourceHead || task?.sourceHead, 64)}`,
    `Source proof: ${text(sourceProofSha256, 64) || "—"}`,
    "DEV ONLY · PROD DENY.",
    "",
    "CENTRAL CORE BOOTSTRAP:",
    "- A teljes authoritative taskállapot a Central Core-ban marad.",
    "- Ellenőrizd a Task + Session + Context Snapshot + Handoff Pack + Branch/Worktree/HEAD azonosságát.",
    "- A beágyazott összefoglaló fallback, nem helyettesíti az authoritative állapotot.",
    "",
    "FONTOS FOLYTONOSSÁGI SZABÁLYOK:",
    "- Ez NEM új TASK_LAUNCH és NEM új fejlesztési task.",
    "- Ugyanazt a taskot, sessiont, worktree-t, branch-et és source proofot folytatod.",
    "- Ne hozz létre új taskot, sessiont, worktree-t vagy branchet pusztán a csevegés betelése miatt.",
    "- A Context Snapshot + Handoff Pack a régi csevegés lezárt folytonossági állapota.",
    "- Identity/provenance eltérésnél azonnal állj meg és jelents BLOCKER_REPORTED / SOURCE_BASELINE_MISMATCH állapotot.",
    "",
    "FOLYTATÁSI KONTEXTUS:",
    summary,
    blockers.length ? `Aktív blokkolók: ${blockers.join(" | ")}` : "Aktív blokkolók: nincs rögzített HIGH/CRITICAL blocker.",
    "",
    "A VÁLASZOD ELEJÉN add vissza pontosan ezt a markert és egy JSON blokkot:",
    ROLLOVER_ACK_MARKER,
    "```json",
    JSON.stringify({
      schemaVersion:1,
      taskId:text(task?.id,220),
      sessionId:text(task?.sessionId,240),
      workerCode:code,
      previousConversationId:text(previousConversationId,180),
      contextSnapshotId:text(context.id,260),
      contextRevision:Number(context.revision || 0),
      handoffPackId:text(handoff.id,260),
      sourceHead:text(context.sourceHead || task?.sourceHead,64),
      sourceProofSha256:text(sourceProofSha256,64),
      continuationProtocolVersion:CONTINUATION_PROTOCOL_VERSION,
      continuationCapsuleId:capsule.id,
      continuationCapsuleSha256:capsule.capsuleSha256,
      rulePackSha256:capsule.policy.rulePackSha256,
      skillManifestSha256:capsule.skills.skillManifestSha256,
      productionAccess:"DENY",
      sameTask:true,
      newTaskLaunch:false,
    }, null, 2),
    "```",
    "ELSŐ VÁLASZ SZABÁLY:",
    "- Az első assistant-válasz KIZÁRÓLAG a BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1 markerből és a fenti JSON blokkból állhat.",
    "- Az ACK elküldése előtt és ugyanebben az első válaszban NE hívj semmilyen eszközt, MCP-t, VPS-t, shellt, webet vagy fájlműveletet.",
    "- Az ACK után ne folytasd önállóan a munkát: várd meg a Grid automatikus BENJADMIN_PROMPT_KIND: CONVERSATION_ROLLOVER_READY_V1 vezérlőüzenetét.",
    "- DEV source/provenance ellenőrzéshez közvetlen DIMPROVER VPS MCP vagy raw shell használata TILOS; az authoritative DEV worktree-t kizárólag a Central Core Execution Bridge kezelheti.",
  ].join("\n");
}

function promptLine(source, label) {
  const lines = String(source || "").split(/\r?\n/);
  const prefix = String(label || "") + ":";
  const line = lines.find((item) => String(item || "").trimStart().startsWith(prefix));
  return line ? String(line).trim().slice(prefix.length).trim() : "";
}

function contractRefLine(source, label) {
  const raw = promptLine(source, label);
  const match = raw.match(/^([^\s·]+)\s*·\s*([0-9a-f]{64})$/i);
  return match ? { id:String(match[1] || ""), sha256:String(match[2] || "").toLowerCase() } : { id:"", sha256:"" };
}

function parseConversationRolloverPrompt(body) {
  const source = String(body || "");
  if (!source.includes(ROLLOVER_PROMPT_MARKER)) return { ok:false, code:"ROLLOVER_PROMPT_MARKER_MISSING" };
  const contextLine = promptLine(source, "Context Snapshot");
  const contextMatch = contextLine.match(/^([^\s·]+)\s*·\s*revision\s+(\d+)$/i);
  const capsuleRef = contractRefLine(source, "Continuation Capsule");
  const rulePackRef = contractRefLine(source, "Rule Pack");
  const skillManifestRef = contractRefLine(source, "Skill Manifest");
  const prompt = {
    workerCode:backendWorkerCode(promptLine(source, "Worker")),
    taskId:promptLine(source, "Task"),
    sessionId:promptLine(source, "Session"),
    previousConversationId:promptLine(source, "Previous conversation"),
    contextSnapshotId:contextMatch ? String(contextMatch[1] || "") : "",
    contextRevision:contextMatch ? Number(contextMatch[2] || 0) : 0,
    handoffPackId:promptLine(source, "Handoff Pack"),
    sourceHead:promptLine(source, "HEAD").toLowerCase(),
    sourceProofSha256:promptLine(source, "Source proof").toLowerCase(),
    continuationProtocolVersion:promptLine(source, "Continuation Protocol"),
    continuationCapsuleId:capsuleRef.id,
    continuationCapsuleSha256:capsuleRef.sha256,
    rulePackId:rulePackRef.id,
    rulePackSha256:rulePackRef.sha256,
    skillManifestId:skillManifestRef.id,
    skillManifestSha256:skillManifestRef.sha256,
    productionAccess:/DEV ONLY\s*·\s*PROD DENY\./i.test(source) ? "DENY" : "",
  };
  const required = ["workerCode","taskId","sessionId","previousConversationId","contextSnapshotId","handoffPackId","sourceHead","sourceProofSha256","productionAccess"];
  const continuationV2 = Boolean(prompt.continuationProtocolVersion || prompt.continuationCapsuleId || prompt.continuationCapsuleSha256 || prompt.rulePackSha256 || prompt.skillManifestSha256);
  if (continuationV2) required.push("continuationProtocolVersion","continuationCapsuleId","continuationCapsuleSha256","rulePackId","rulePackSha256","skillManifestId","skillManifestSha256");
  const missing = required.filter((field) => !String(prompt[field] ?? "").trim());
  if (!Number.isInteger(prompt.contextRevision) || prompt.contextRevision < 1) missing.push("contextRevision");
  if (!/^[0-9a-f]{40}$/.test(prompt.sourceHead)) missing.push("sourceHeadFormat");
  if (!/^[0-9a-f]{64}$/.test(prompt.sourceProofSha256)) missing.push("sourceProofSha256Format");
  if (continuationV2 && !/^[0-9a-f]{64}$/.test(prompt.continuationCapsuleSha256)) missing.push("continuationCapsuleSha256Format");
  if (continuationV2 && !/^[0-9a-f]{64}$/.test(prompt.rulePackSha256)) missing.push("rulePackSha256Format");
  if (continuationV2 && !/^[0-9a-f]{64}$/.test(prompt.skillManifestSha256)) missing.push("skillManifestSha256Format");
  if (continuationV2 && prompt.continuationProtocolVersion !== CONTINUATION_PROTOCOL_VERSION) missing.push("continuationProtocolVersion");
  return missing.length ? { ok:false, code:"ROLLOVER_PROMPT_IDENTITY_INCOMPLETE", missing, prompt } : { ok:true, prompt };
}

function validateConversationRolloverPrompt(body, expected) {
  const parsed = parseConversationRolloverPrompt(body);
  if (!parsed.ok) return { ...parsed, validated:false, mismatches:[parsed.code] };
  const prompt = parsed.prompt || {};
  const mismatches = [];
  const same = (field, actual, wanted) => { if (String(actual ?? "") !== String(wanted ?? "")) mismatches.push(field); };
  same("taskId", prompt.taskId, expected.taskId);
  same("sessionId", prompt.sessionId, expected.sessionId);
  same("workerCode", backendWorkerCode(prompt.workerCode), backendWorkerCode(expected.workerCode));
  same("previousConversationId", prompt.previousConversationId, expected.previousConversationId);
  same("contextSnapshotId", prompt.contextSnapshotId, expected.contextSnapshotId);
  same("contextRevision", Number(prompt.contextRevision || 0), Number(expected.contextRevision || 0));
  same("handoffPackId", prompt.handoffPackId, expected.handoffPackId);
  same("sourceHead", String(prompt.sourceHead || "").toLowerCase(), String(expected.sourceHead || "").toLowerCase());
  if (expected.continuationProtocolVersion) same("continuationProtocolVersion", prompt.continuationProtocolVersion, expected.continuationProtocolVersion);
  if (expected.continuationCapsuleId) same("continuationCapsuleId", prompt.continuationCapsuleId, expected.continuationCapsuleId);
  if (expected.continuationCapsuleSha256) same("continuationCapsuleSha256", prompt.continuationCapsuleSha256, expected.continuationCapsuleSha256);
  if (expected.rulePackSha256) same("rulePackSha256", prompt.rulePackSha256, expected.rulePackSha256);
  if (expected.skillManifestSha256) same("skillManifestSha256", prompt.skillManifestSha256, expected.skillManifestSha256);
  if (Array.isArray(expected.acceptedSourceProofSha256) && expected.acceptedSourceProofSha256.length) {
    const accepted = expected.acceptedSourceProofSha256.map((item) => String(item || "").toLowerCase()).filter((item) => /^[0-9a-f]{64}$/.test(item));
    if (!accepted.includes(String(prompt.sourceProofSha256 || "").toLowerCase())) mismatches.push("sourceProofSha256");
  }
  if (prompt.productionAccess !== "DENY") mismatches.push("productionAccess");
  return { ok:true, prompt, validated:mismatches.length === 0, mismatches };
}

function balancedJsonFrom(value, startAt) {
  const source = String(value || "");
  let start = source.indexOf("{", Math.max(0, startAt || 0));
  while (start >= 0) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") { inString = true; continue; }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    start = source.indexOf("{", start + 1);
  }
  return "";
}

function markerlessAckJsonOnly(body) {
  const source = String(body || "").trim();
  if (!source) return { ok:false, code:"ROLLOVER_ACK_MARKER_MISSING" };
  let candidate = source;
  const fenced = source.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) candidate = String(fenced[1] || "").trim();
  if (!candidate.startsWith("{")) return { ok:false, code:"ROLLOVER_ACK_MARKER_MISSING" };
  const jsonText = balancedJsonFrom(candidate, 0);
  if (!jsonText || jsonText.length !== candidate.length) return { ok:false, code:"ROLLOVER_ACK_MARKERLESS_NOT_JSON_ONLY" };
  try {
    return { ok:true, ack:JSON.parse(jsonText), markerPresent:false, parseMode:"STRICT_JSON_ONLY_FALLBACK" };
  } catch {
    return { ok:false, code:"ROLLOVER_ACK_JSON_INVALID" };
  }
}

function parseConversationRolloverAck(body) {
  const source = String(body || "");
  const markerIndex = source.indexOf(ROLLOVER_ACK_MARKER);
  if (markerIndex < 0) return markerlessAckJsonOnly(source);
  const jsonText = balancedJsonFrom(source, markerIndex + ROLLOVER_ACK_MARKER.length);
  if (!jsonText) return { ok:false, code:"ROLLOVER_ACK_JSON_MISSING" };
  try {
    const ack = JSON.parse(jsonText);
    return { ok:true, ack, markerPresent:true, parseMode:"MARKER" };
  } catch {
    return { ok:false, code:"ROLLOVER_ACK_JSON_INVALID" };
  }
}

function validateConversationRolloverAck(body, expected) {
  const parsed = parseConversationRolloverAck(body);
  if (!parsed.ok) return { ...parsed, validated:false, mismatches:[parsed.code] };
  const ack = parsed.ack || {};
  const mismatches = [];
  const same = (field, actual, wanted) => { if (String(actual ?? "") !== String(wanted ?? "")) mismatches.push(field); };
  same("schemaVersion", Number(ack.schemaVersion || 0), 1);
  same("taskId", ack.taskId, expected.taskId);
  same("sessionId", ack.sessionId, expected.sessionId);
  same("workerCode", backendWorkerCode(ack.workerCode), backendWorkerCode(expected.workerCode));
  same("previousConversationId", ack.previousConversationId, expected.previousConversationId);
  same("contextSnapshotId", ack.contextSnapshotId, expected.contextSnapshotId);
  same("contextRevision", Number(ack.contextRevision || 0), Number(expected.contextRevision || 0));
  same("handoffPackId", ack.handoffPackId, expected.handoffPackId);
  same("sourceHead", String(ack.sourceHead || "").toLowerCase(), String(expected.sourceHead || "").toLowerCase());
  same("sourceProofSha256", String(ack.sourceProofSha256 || "").toLowerCase(), String(expected.sourceProofSha256 || "").toLowerCase());
  const continuationExpected = Boolean(expected.continuationProtocolVersion || expected.continuationCapsuleId || expected.continuationCapsuleSha256 || expected.rulePackSha256 || expected.skillManifestSha256);
  const continuationProvided = Boolean(ack.continuationProtocolVersion || ack.continuationCapsuleId || ack.continuationCapsuleSha256 || ack.rulePackSha256 || ack.skillManifestSha256);
  if (continuationExpected || continuationProvided) {
    same("continuationProtocolVersion", ack.continuationProtocolVersion, expected.continuationProtocolVersion || CONTINUATION_PROTOCOL_VERSION);
    same("continuationCapsuleId", ack.continuationCapsuleId, expected.continuationCapsuleId);
    same("continuationCapsuleSha256", String(ack.continuationCapsuleSha256 || "").toLowerCase(), String(expected.continuationCapsuleSha256 || "").toLowerCase());
    same("rulePackSha256", String(ack.rulePackSha256 || "").toLowerCase(), String(expected.rulePackSha256 || "").toLowerCase());
    same("skillManifestSha256", String(ack.skillManifestSha256 || "").toLowerCase(), String(expected.skillManifestSha256 || "").toLowerCase());
  }
  if (String(ack.productionAccess || "").toUpperCase() !== "DENY") mismatches.push("productionAccess");
  if (ack.sameTask !== true) mismatches.push("sameTask");
  if (ack.newTaskLaunch !== false) mismatches.push("newTaskLaunch");
  if (parsed.parseMode === "STRICT_JSON_ONLY_FALLBACK") {
    const allowedFields = new Set([
      "schemaVersion", "taskId", "sessionId", "workerCode", "previousConversationId",
      "contextSnapshotId", "contextRevision", "handoffPackId", "sourceHead",
      "sourceProofSha256", "continuationProtocolVersion", "continuationCapsuleId", "continuationCapsuleSha256",
      "rulePackSha256", "skillManifestSha256", "productionAccess", "sameTask", "newTaskLaunch",
    ]);
    for (const field of Object.keys(ack)) if (!allowedFields.has(field)) mismatches.push(`unexpected:${field}`);
  }
  return { ok:true, ack, markerPresent:parsed.markerPresent, parseMode:parsed.parseMode, validated:mismatches.length === 0, mismatches };
}

module.exports = {
  ROLLOVER_PROMPT_MARKER,
  ROLLOVER_ACK_MARKER,
  ROLLOVER_STATES,
  detectConversationLimit,
  chatProjectRootFromConversationUrl,
  buildConversationRolloverPrompt,
  parseConversationRolloverPrompt,
  validateConversationRolloverPrompt,
  parseConversationRolloverAck,
  validateConversationRolloverAck,
};
