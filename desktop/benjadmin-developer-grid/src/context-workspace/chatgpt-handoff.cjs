"use strict";

const CONVERSATION_INFO_SCRIPT = String.raw`(() => {
  try {
    const currentPath = new URL(location.href).pathname;
    for (const a of document.querySelectorAll('a[href*="/c/"]')) {
      const href = new URL(a.href, location.origin);
      if (href.pathname !== currentPath) continue;
      const title = [a.textContent, a.getAttribute("aria-label"), a.getAttribute("title")]
        .filter(Boolean)
        .map((value) => String(value).trim().replace(/\s+/g, " "))
        .find(Boolean) || "";
      const match = title.match(/^(\d{6})[_\s-]+([1-5])[_\s-]+/);
      return { title, id: match ? match[1] + "_" + match[2] : "" };
    }
    return { title: document.querySelector("main h1")?.textContent?.trim() || "", id: "" };
  } catch {
    return { title: "", id: "" };
  }
})()`;

const HANDOFF_ASSISTANT_SCRIPT = String.raw`(() => {
  const nodes = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  if (!nodes.length) return { ok: false, error: "Nem található assistant-válasz." };
  let legacy = null;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    const container = node.closest("article") || node.closest('[data-testid^="conversation-turn-"]') || node;
    const text = String(container.innerText || container.textContent || "").trim();
    if (!text) continue;
    if (text.includes("BENJADMIN_HANDOFF_META_V2")) {
      return { ok: true, text: text.slice(0, 190000), format: "v2", messageIndexFromEnd: nodes.length - 1 - i };
    }
    const markerlessV2 = /"schemaVersion"\s*:\s*2/.test(text)
      && /"workerCode"\s*:/.test(text)
      && /"workedMainProject"\s*:/.test(text)
      && /"workedTaskTitle"\s*:/.test(text)
      && /"prodDeny"\s*:/.test(text);
    if (markerlessV2) {
      return { ok: true, text: text.slice(0, 190000), format: "v2-markerless", messageIndexFromEnd: nodes.length - 1 - i };
    }
    if (!legacy && /MUNKA\s+VISSZAADVA/i.test(text) && /ÁTADÓ/i.test(text) && text.length >= 120) {
      legacy = { ok: true, text: text.slice(0, 190000), format: "legacy", messageIndexFromEnd: nodes.length - 1 - i };
    }
  }
  return legacy || { ok: false, error: "Nem található érvényes BENJADMIN Handoff V2 vagy korábbi szabványos átadó az assistant-válaszok között." };
})()`;

function stripUiArtifacts(value) {
  return String(value ?? "")
    .replace(/\s*:?(?:contentReference|oaicite)\[[^\]]*\]\{[^}]*\}/gi, "")
    .replace(/\s*\[?oaicite:\d+\]?\{[^}]*\}/gi, "")
    .trim();
}
function text(value, max = 4000) { return stripUiArtifacts(value).slice(0, max); }
function list(value, max = 80, itemMax = 3000) {
  const source = Array.isArray(value) ? value : (text(value) ? [value] : []);
  return source.map((item) => text(item, itemMax)).filter(Boolean).slice(0, max);
}
function normalizeStatus(value) {
  const result = text(value, 30).toUpperCase();
  return ["COMPLETED", "PARTIAL", "BLOCKED", "FAILED"].includes(result) ? result : "PARTIAL";
}
function iso(value) {
  const raw = text(value, 100);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}
function fileAreaKey(value, fallback) {
  const normalized = text(value, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized) return normalized.slice(0, 48);
  return text(fallback, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "Fejlesztes";
}

async function getConversationInfo(view, cell, cells) {
  if (!cell || !view || view.webContents.isDestroyed()) return { chatSessionId: "", chatTitle: "" };
  const info = await view.webContents.executeJavaScript(CONVERSATION_INFO_SCRIPT, true)
    .catch(() => ({ title: "", id: "" }));
  const slot = cell.id === "central" ? 5 : (cells || []).findIndex((item) => item.id === cell.id) + 1;
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const fallbackId = `${yy}${mm}${dd}_${slot}`;
  return {
    chatSessionId: String(info?.id || fallbackId).slice(0, 120),
    chatTitle: String(info?.title || `${fallbackId} ${cell.label} – fejlesztés`).slice(0, 300),
  };
}

async function captureLatestAssistantMarkdown(view) {
  if (!view || view.webContents.isDestroyed()) return { ok: false, error: "A ChatGPT felület nem érhető el." };
  return view.webContents.executeJavaScript(HANDOFF_ASSISTANT_SCRIPT, true)
    .catch(() => ({ ok: false, error: "A ChatGPT válasz nem olvasható biztonságosan." }));
}

function balancedObjectFrom(source, aroundIndex = 0) {
  const value = String(source || "");
  let start = value.lastIndexOf("{", Math.max(0, aroundIndex));
  if (start < 0) start = value.indexOf("{");
  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < value.length; i += 1) {
      const ch = value[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = value.slice(start, i + 1);
          if (/"schemaVersion"\s*:\s*2/.test(candidate) && /"workerCode"\s*:/.test(candidate)) return candidate;
          break;
        }
      }
    }
    start = value.indexOf("{", start + 1);
  }
  return "";
}

function extractV2Json(source) {
  const value = String(source || "");
  const marker = value.indexOf("BENJADMIN_HANDOFF_META_V2");
  const search = marker >= 0 ? value.slice(marker + "BENJADMIN_HANDOFF_META_V2".length) : value;
  const fenced = [...search.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1]?.trim() || "")
    .find((candidate) => /"schemaVersion"\s*:\s*2/.test(candidate) && /"workerCode"\s*:/.test(candidate));
  if (fenced) return fenced;
  const schemaIndex = search.search(/"schemaVersion"\s*:\s*2/);
  return balancedObjectFrom(search, schemaIndex >= 0 ? schemaIndex : 0);
}

function parseHandoffV2(body) {
  const jsonText = extractV2Json(body);
  if (!jsonText) throw new Error("A HANDOFF V2 JSON blokk hiányzik vagy nem azonosítható.");
  let raw;
  try { raw = JSON.parse(jsonText); }
  catch { throw new Error("A HANDOFF V2 JSON nem érvényes."); }
  if (Number(raw?.schemaVersion) !== 2) throw new Error("A HANDOFF V2 schemaVersion értéke nem 2.");

  const legacyDocs = list(raw.requiredDocuments, 20, 500);
  const meta = {
    schemaVersion: 2,
    chatSessionId: text(raw.chatSessionId, 120),
    chatTitle: text(raw.chatTitle, 300),
    workerCode: text(raw.workerCode, 40).toUpperCase(),
    workedMainProject: text(raw.workedMainProject, 160),
    workedProject: text(raw.workedProject, 160),
    workedModule: text(raw.workedModule, 160),
    workedContextModule: text(raw.workedContextModule, 160),
    primaryDevelopmentArea: text(raw.primaryDevelopmentArea, 220),
    fileAreaKey: fileAreaKey(raw.fileAreaKey, raw.primaryDevelopmentArea),
    relatedAreas: list(raw.relatedAreas, 5, 220),
    workedTaskId: text(raw.workedTaskId, 180),
    workedTaskTitle: text(raw.workedTaskTitle, 500),
    liveNextTaskId: text(raw.liveNextTaskId, 180),
    liveNextTaskTitle: text(raw.liveNextTaskTitle, 500),
    startedAt: iso(raw.startedAt),
    finishedAt: iso(raw.finishedAt),
    status: normalizeStatus(raw.status),
    startingState: text(raw.startingState, 700),
    workDone: list(raw.workDone, 6, 300),
    changedFiles: list(raw.changedFiles, 10, 350),
    branch: text(raw.branch, 300),
    worktree: text(raw.worktree, 700),
    startCommit: text(raw.startCommit, 64),
    endCommit: text(raw.endCommit, 64),
    databaseChanges: text(raw.databaseChanges, 1600),
    buildRelease: text(raw.buildRelease, 1600),
    tests: list(raw.tests, 10, 300),
    completed: list(raw.completed, 6, 300),
    partial: list(raw.partial, 6, 300),
    notCompleted: list(raw.notCompleted, 6, 300),
    technicalDebt: list(raw.technicalDebt, 6, 300),
    blockers: list(raw.blockers, 6, 300),
    benjadminDecisions: list(raw.benjadminDecisions, 6, 300),
    nextStep: list(raw.nextStep, 6, 300),
    requiredDocumentsWorkedTask: list(raw.requiredDocumentsWorkedTask, 10, 500),
    requiredDocumentsNextTask: list(raw.requiredDocumentsNextTask, 10, 500),
    summary: text(raw.summary, 1200),
    prodDeny: text(raw.prodDeny, 500),
  };
  if (!meta.requiredDocumentsWorkedTask.length && legacyDocs.length) meta.requiredDocumentsWorkedTask = legacyDocs;

  const required = [
    "chatSessionId", "chatTitle", "workerCode", "workedMainProject", "workedProject",
    "workedModule", "primaryDevelopmentArea", "fileAreaKey", "workedTaskTitle", "summary"
  ];
  const missing = required.filter((key) => !meta[key]);
  if (missing.length) throw new Error(`Hiányzó HANDOFF V2 metaadat: ${missing.join(", ")}.`);
  if (meta.startedAt && meta.finishedAt && Date.parse(meta.finishedAt) < Date.parse(meta.startedAt)) throw new Error("A HANDOFF V2 finishedAt korábbi, mint a startedAt.");
  if (!/PROD\s*DENY/i.test(meta.prodDeny)) throw new Error("A HANDOFF V2 prodDeny mezőben kötelező a PROD DENY.");
  return meta;
}

function bullets(items, empty = "NINCS") {
  const values = list(items, 200, 5000);
  return values.length ? values.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function renderHandoffMarkdown(meta) {
  const m = meta || {};
  return `# BENJADMIN ChatGrid – fejlesztési átadó

## Azonosítás

- **Csevegés:** ${text(m.chatSessionId)}
- **Csevegés neve:** ${text(m.chatTitle)}
- **Worker:** ${text(m.workerCode)}
- **Főprojekt:** ${text(m.workedMainProject)}
- **Projekt:** ${text(m.workedProject)}
- **Modul:** ${text(m.workedModule)}
- **Kontextus modul:** ${text(m.workedContextModule) || "Nincs megadva"}
- **Fő fejlesztési terület:** ${text(m.primaryDevelopmentArea)}
- **Fájlnév területkulcs:** ${text(m.fileAreaKey)}
- **Tényleges task ID:** ${text(m.workedTaskId) || "Nincs egyetlen task ID"}
- **Tényleges task:** ${text(m.workedTaskTitle)}
- **Következő/live task ID a lezáráskor:** ${text(m.liveNextTaskId) || "NINCS"}
- **Következő/live task a lezáráskor:** ${text(m.liveNextTaskTitle) || "NINCS"}
- **MUNKAFELVÉTEL:** ${text(m.startedAt) || "NINCS HITELESÍTETT ADAT"}
- **MUNKA VISSZAADVA:** ${text(m.finishedAt)}
- **Állapot:** ${normalizeStatus(m.status)}
- **PROD:** DENY

## Kapcsolódó fejlesztési területek

${bullets(m.relatedAreas)}

## Kiinduló fejlesztési állapot

${text(m.startingState) || "Nincs külön rögzítve."}

## Ebben a csevegésben elvégzett munka

${bullets(m.workDone)}

## Módosított fájlok és fő változtatások

${bullets(m.changedFiles)}

## Git / munkatér

- **Worktree:** ${text(m.worktree) || "NINCS"}
- **Branch:** ${text(m.branch) || "NINCS"}
- **Kiinduló HEAD:** ${text(m.startCommit) || "NINCS"}
- **Aktuális HEAD:** ${text(m.endCommit) || "NINCS"}

## Adatbázis / migráció

${text(m.databaseChanges) || "NINCS"}

## Build / release / restart

${text(m.buildRelease) || "NINCS"}

## Tesztek és eredmények

${bullets(m.tests)}

## Teljesen elkészült

${bullets(m.completed)}

## Részben elkészült

${bullets(m.partial)}

## Még nincs elkészítve

${bullets(m.notCompleted)}

## Ismert hibák / technikai adósság

${bullets(m.technicalDebt)}

## Aktív blokkolók

${bullets(m.blockers)}

## Nyitott BenjAdmin-döntések

${bullets(m.benjadminDecisions)}

## Következő javasolt fejlesztési lépés

${bullets(m.nextStep)}

## A lezárt munka folytatásához kötelező dokumentumok / átadók

${bullets(m.requiredDocumentsWorkedTask)}

## Csak a külön következő/live task indításához szükséges dokumentumok

${bullets(m.requiredDocumentsNextTask)}

## Folytatási összefoglaló

${text(m.summary)}

## PROD DENY igazolás

${text(m.prodDeny) || "DEV ONLY; PROD DENY"}

MUNKA VISSZAADVA: ${text(m.finishedAt)}
ÁTADÓ: KÉSZ A BENJADMIN MENTÉSHEZ
`;
}

function handoffStatusForTask(task, body, meta = null) {
  if (meta?.status) return normalizeStatus(meta.status);
  const taskStatus = String(task?.status || "").toLowerCase();
  if (taskStatus === "completed") return "COMPLETED";
  if (taskStatus === "blocked" || /\bBLOCKED\b|BLOKKOL/i.test(body)) return "BLOCKED";
  if (/\bFAILED\b|SIKERTELEN/i.test(body)) return "FAILED";
  return "PARTIAL";
}

function extractHandoffTimestamp(body, label) {
  const source = String(body || "");
  const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hu = source.match(new RegExp(`${escapedLabel}\\s*:?\\s*(\\d{4})[.\\/-](\\d{1,2})[.\\/-](\\d{1,2})\\.?\\s+(\\d{1,2}):(\\d{2})`, "i"));
  if (hu) {
    const date = new Date(Number(hu[1]), Number(hu[2]) - 1, Number(hu[3]), Number(hu[4]), Number(hu[5]), 0, 0);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  const isoMatch = source.match(new RegExp(`${escapedLabel}\\s*:?\\s*(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:?\\d{2})?)`, "i"));
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function extractCommit(body, label) {
  const match = String(body || "").match(new RegExp(`${label}[^\\n]{0,80}?([a-f0-9]{7,40})`, "i"));
  return match?.[1] || "";
}

module.exports = {
  CONVERSATION_INFO_SCRIPT,
  HANDOFF_ASSISTANT_SCRIPT,
  getConversationInfo,
  captureLatestAssistantMarkdown,
  parseHandoffV2,
  renderHandoffMarkdown,
  handoffStatusForTask,
  extractHandoffTimestamp,
  extractCommit,
  extractV2Json,
  stripUiArtifacts,
};
