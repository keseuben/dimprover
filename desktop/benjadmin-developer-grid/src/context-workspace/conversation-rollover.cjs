"use strict";

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
      productionAccess:"DENY",
      sameTask:true,
      newTaskLaunch:false,
    }, null, 2),
    "```",
    "Az ACK blokk után ugyanabban a válaszban folytathatod a félbemaradt munkát. Ha execution request szükséges, csak az ACK után add ki a következő egyedi BENJADMIN_EXECUTION_REQUEST_V1 kérést.",
  ].join("\n");
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

function parseConversationRolloverAck(body) {
  const source = String(body || "");
  const markerIndex = source.indexOf(ROLLOVER_ACK_MARKER);
  if (markerIndex < 0) return { ok:false, code:"ROLLOVER_ACK_MARKER_MISSING" };
  const jsonText = balancedJsonFrom(source, markerIndex + ROLLOVER_ACK_MARKER.length);
  if (!jsonText) return { ok:false, code:"ROLLOVER_ACK_JSON_MISSING" };
  try {
    const ack = JSON.parse(jsonText);
    return { ok:true, ack };
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
  if (String(ack.productionAccess || "").toUpperCase() !== "DENY") mismatches.push("productionAccess");
  if (ack.sameTask !== true) mismatches.push("sameTask");
  if (ack.newTaskLaunch !== false) mismatches.push("newTaskLaunch");
  return { ok:true, ack, validated:mismatches.length === 0, mismatches };
}

module.exports = {
  ROLLOVER_PROMPT_MARKER,
  ROLLOVER_ACK_MARKER,
  ROLLOVER_STATES,
  detectConversationLimit,
  chatProjectRootFromConversationUrl,
  buildConversationRolloverPrompt,
  parseConversationRolloverAck,
  validateConversationRolloverAck,
};
