"use strict";

const DEVELOPMENT_ACTION = /(?:\b(?:folytasd|folytat(?:hatod|nád)?|kezd(?:d|heted|jük)?(?:\s+el)?|indítsd|csináld(?:\s+meg)?|készítsd(?:\s+el)?|fejleszd|javítsd|építsd|implementáld|dolgozz(?:\s+rajta)?|vidd(?:\s+végig)?|menj(?:\s+tovább)?|mehet)\b|\b(?:continue|start|implement|develop|fix|proceed|go\s+ahead)\b)/iu;
const DEVELOPMENT_CONTEXT = /(?:fejleszt|kód|commit|branch|worktree|build|teszt|developer\s*grid|benjadmin|dimpro|dimprover|auth|login|drive|projektkapu|api|adatbázis|postgres|typescript|next\.js)/iu;
const TERSE_CONTINUATION = /^(?:ok(?:é|e)?[,.!? ]*|rendben[,.!? ]*)?(?:folytasd|mehet|kezd(?:d)?(?:\s+el)?|csináld(?:\s+meg)?|vidd(?:\s+végig)?|menj(?:\s+tovább)?|continue|go\s+ahead)[.!? ]*$/iu;
const MACHINE_MARKER = /BENJADMIN_(?:PROMPT_KIND|EXECUTION_|STAGE_REPORT|CONTINUATION_|TASK_LAUNCH|HANDOFF_)/i;

function clean(value, max = 2000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function userTurns(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => String(item?.role || "").toUpperCase() === "USER")
    .map((item) => ({ messageId:clean(item?.messageId, 240), text:clean(item?.text, 1800) }))
    .filter((item) => item.text && !MACHINE_MARKER.test(item.text));
}

function recentContext(messages, conversationTitle) {
  const rows=(Array.isArray(messages) ? messages : []).slice(-12).map((item)=>clean(item?.text, 900)).filter(Boolean);
  return `${clean(conversationTitle, 300)}\n${rows.join("\n")}`;
}

function inferAutoWorkModuleName(conversationTitle, messages) {
  const title=clean(conversationTitle, 180);
  const haystack=recentContext(messages, title);
  if (/dimpro\s*auth|auth\s*(?:bel[eé]ptet[eé]s|login)|login\.dimpro/i.test(haystack)) return "DIMPRO AUTH Beléptetés";
  if (/dimpro\s*drive|\bdrive\b/i.test(haystack)) return "DIMPRO Drive";
  if (/projektkapu|project\s*gate/i.test(haystack)) return "DIMPRO Projektkapu";
  if (/developer\s*grid|benjadmin/i.test(haystack)) return "Developer Grid V1";
  if (/dimpro\s*one|eg[eé]szs[eé]g|health/i.test(haystack)) return "DIMPRO ONE Egészség";
  if (title && !/^(chatgpt|new chat|új csevegés)$/iu.test(title)) {
    return title
      .replace(/\s*[–—:-]\s*(?:fejleszt[eé]s|folytat[aá]sa|jav[ií]t[aá]sa).*$/iu, "")
      .replace(/\s+(?:fejleszt[eé]s(?:e|ének)?|folytat[aá]sa|elkezd[eé]se|jav[ií]t[aá]sa).*$/iu, "")
      .trim()
      .slice(0, 180) || "DIMPRO / DIMPROVER";
  }
  return "DIMPRO / DIMPROVER";
}

function buildAutoWorkSourcePrompt(messages, conversationTitle) {
  const turns=userTurns(messages).slice(-8);
  const title=clean(conversationTitle, 180);
  const lines=[];
  if (title) lines.push(`Fejlesztési csevegés: ${title}`);
  lines.push("Felhasználói fejlesztési utasítások, időrendi sorrendben:");
  for (const turn of turns) lines.push(`- ${turn.text}`);
  return lines.join("\n").slice(0, 12000);
}

function detectChatDevelopmentIntent({ messages, conversationTitle = "" } = {}) {
  const turns=userTurns(messages);
  const latest=turns.at(-1) || null;
  if (!latest) return { triggered:false, reason:"NO_USER_TURN" };
  const action=DEVELOPMENT_ACTION.test(latest.text);
  if (!action) return { triggered:false, reason:"NO_DEVELOPMENT_ACTION", latestUserMessageId:latest.messageId, latestUserText:latest.text };
  const terse=latest.text.length <= 96 && TERSE_CONTINUATION.test(latest.text);
  const context=DEVELOPMENT_CONTEXT.test(recentContext(messages, conversationTitle));
  if (terse && !context) return { triggered:false, reason:"TERSE_WITHOUT_DEVELOPMENT_CONTEXT", latestUserMessageId:latest.messageId, latestUserText:latest.text };
  const sourcePrompt=buildAutoWorkSourcePrompt(messages, conversationTitle);
  if (sourcePrompt.length < 12) return { triggered:false, reason:"SOURCE_PROMPT_TOO_SHORT", latestUserMessageId:latest.messageId, latestUserText:latest.text };
  return {
    triggered:true,
    reason:terse ? "TERSE_CONTINUATION_IN_DEVELOPMENT_CONTEXT" : "EXPLICIT_DEVELOPMENT_ACTION",
    latestUserMessageId:latest.messageId,
    latestUserText:latest.text,
    sourcePrompt,
    moduleName:inferAutoWorkModuleName(conversationTitle, messages),
  };
}

module.exports={
  detectChatDevelopmentIntent,
  inferAutoWorkModuleName,
  buildAutoWorkSourcePrompt,
};
