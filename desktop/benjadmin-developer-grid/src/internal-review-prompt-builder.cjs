"use strict";

function clean(value, max = 1200) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function buildInternalReviewFallbackPrompt({ workerCode, workerLabel, task, presence }) {
  const code = clean(workerCode, 40);
  const label = clean(workerLabel, 120);
  const taskId = clean(task?.id, 220);
  const sessionId = clean(task?.sessionId, 240);
  const head = clean(task?.sourceHead, 80);
  return [
    "BENJADMIN_PROMPT_KIND: DEVELOPER_GRID_INTERNAL_REVIEW_FALLBACK_V1",
    "MŰVELET: 4/6 ELLENŐRZÉS · INTERNAL_REVIEW_FALLBACK",
    "KÖRNYEZET: DEV ONLY · PROD DENY",
    `WORKER/REVIEWER: ${label} (${code})`,
    `TASK ID: ${taskId}`,
    `SESSION ID: ${sessionId}`,
    `CURRENT AUTHORITATIVE HEAD: ${head}`,
    `BRANCH: ${clean(presence?.branch || task?.branchName, 500) || "NINCS"}`,
    `WORKTREE: ${clean(presence?.worktree || task?.worktreePath, 800) || "NINCS"}`,
    "",
    "KÜLSŐ V.GUARD JELENLEG NEM READY.",
    "Ezért ideiglenesen ugyanaz a kijelölt worker végzi az auditált belső review-t.",
    "A review NEM független V.Guard review; reviewMode kötelezően INTERNAL_REVIEW_FALLBACK.",
    "",
    "FELADAT",
    "- Review-zd a teljes base → current HEAD commitált változást a saját engedélyezett DEV worktree-den.",
    "- Ellenőrizd külön: security, jogosultság/auth, adatvesztési kockázat, regresszió, concurrency/atomicitás, migráció, scope, tesztlefedettség és build-readiness.",
    "- Ellenőrizd a releváns diffet és a current HEAD-hez tartozó teszt evidence-et.",
    "- Ne módosíts review közben fájlt csak azért, hogy PASS legyen. Ha hibát találsz, FAIL-t adj; utána a normál fejlesztési kör javítson és review-zd újra.",
    "- Secretet, .env értéket, tokent vagy üzleti dokumentumtartalmat ne írj a reportba.",
    "",
    "EREDMÉNY",
    "- PASS: nincs HIGH/BLOCKER/CRITICAL finding.",
    "- PASS_WITH_NOTES: csak nem blokkoló megjegyzés van.",
    "- FAIL: legalább egy HIGH/BLOCKER/CRITICAL finding van.",
    "",
    "KÖTELEZŐ GÉPI REVIEW REPORT",
    "A normál rövid összefoglaló után pontosan add vissza a két marker közötti EGYETLEN JSON objektumot. Markdown code fence tilos.",
    "BENJADMIN_INTERNAL_REVIEW_V1",
    JSON.stringify({
      schemaVersion:1,
      reviewMode:"INTERNAL_REVIEW_FALLBACK",
      workerCode:code,
      taskId,
      sessionId,
      head:"REPLACE_WITH_CURRENT_40_CHAR_HEAD",
      result:"PASS",
      summary:"Belső review PASS; nincs blokkoló finding.",
      findings:[],
      tests:["git diff --check PASS", "releváns contract/acceptance PASS"]
    }),
    "BENJADMIN_INTERNAL_REVIEW_END",
    "",
    "A Developer Grid a reportot authoritative state/source identity ellenőrzi. PASS/PASS_WITH_NOTES esetén a Central Core léptethet 5/6 BUILD / KIADÁS fázisba.",
  ].join("\n");
}

module.exports = { buildInternalReviewFallbackPrompt };
