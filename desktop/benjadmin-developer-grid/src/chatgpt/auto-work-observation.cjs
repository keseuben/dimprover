"use strict";

const { createHash } = require("node:crypto");
const { CHATGPT_SELECTORS } = require("./chatgpt-dom-adapter.cjs");
const normalize = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 1800);
const identity = row => String(row?.messageId || "") + ":" + createHash("sha256").update(normalize(row?.text)).digest("hex");

// Restored/navigated conversations are history. Only a newly observed USER turn
// matching an actual send gesture in this cell may auto-start work.
// A trusted live submission also covers the first turn of a newly created chat.
function createAutoWorkStartObservationGuard() {
  const conversations = new Map();
  const submissionBindings = new Map();
  return {
    observe({ workerCode, conversationId, messages, submissions = [], now = Date.now() } = {}) {
      if (!workerCode || !conversationId || !Array.isArray(messages)) return { eligible:false, reason:"OBSERVATION_INVALID" };
      const users = messages.filter(row => String(row?.role || "").toUpperCase() === "USER" && normalize(row.text));
      if (!users.length) return { eligible:false, reason:"NO_USER_TURN" };
      const code = String(workerCode).toUpperCase().replace(/^BENJAMINAI$/, "BENAI");
      const key = code + ":" + conversationId;
      const latest = users.at(-1);
      const latestIdentity = identity(latest);
      const liveSubmission = submissions.find(row =>
        Number.isFinite(row?.at) && now >= row.at && now - row.at <= 30 * 60_000
        && (!row.conversationId || row.conversationId === conversationId)
        && normalize(row.text) === normalize(latest.text)
        && (!submissionBindings.has(code + ":" + row.at)
          || submissionBindings.get(code + ":" + row.at) === key + ":" + latestIdentity));
      if (liveSubmission) {
        submissionBindings.set(code + ":" + liveSubmission.at, key + ":" + latestIdentity);
        while (submissionBindings.size > 500) submissionBindings.delete(submissionBindings.keys().next().value);
      }
      let historical = conversations.get(key);
      if (!historical) {
        historical = new Set(users.map(identity));
        conversations.set(key, historical);
        while (conversations.size > 120) conversations.delete(conversations.keys().next().value);
        if (liveSubmission) historical.delete(latestIdentity);
      }
      const eligible = !historical.has(latestIdentity) && Boolean(liveSubmission);
      // Older turns arriving later through hydration/pagination are also history.
      for (const row of users.slice(0, -1)) historical.add(identity(row));
      while (historical.size > 1000) historical.delete(historical.values().next().value);
      return { eligible, reason:eligible ? "FRESH_USER_TURN" : "HISTORICAL_USER_TURN" };
    },
  };
}

// Installed once per document. Drafts/navigation/assistant text cannot authorize.
function installLiveSubmissionObserver(selectors) {
  if (window.__benjadminLiveUserSubmissions) return true;
  const state = { events:[] };
  window.__benjadminLiveUserSubmissions = state;
  const visible = node => Boolean(node && node.getClientRects().length);
  const composer = () => selectors.composer.map(selector => document.querySelector(selector)).find(visible);
  const record = event => {
    if (!event.isTrusted) return;
    const field = composer();
    if (!field) return;
    const inComposer = event.target === field || field.contains(event.target);
    const enter = event.type === "keydown" && inComposer && event.key === "Enter"
      && !event.shiftKey && !event.altKey && !event.isComposing;
    const click = event.type === "click" && selectors.sendButton.some(selector => event.target?.closest?.(selector));
    const submit = event.type === "submit" && event.target?.contains?.(field);
    if (!enter && !click && !submit) return;
    const text = String(field instanceof HTMLTextAreaElement ? field.value : (field.innerText || field.textContent || "")).trim();
    if (!text || /BENJADMIN_(?:PROMPT_KIND|EXECUTION_|STAGE_REPORT|CONTINUATION_|TASK_LAUNCH|HANDOFF_)/i.test(text)) return;
    let conversationId = "";
    try { conversationId = new URL(location.href).pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/)?.[1] || ""; } catch {}
    state.events.push({ at:Date.now(), conversationId, text:text.slice(0,12000) });
    state.events = state.events.slice(-10);
  };
  for (const name of ["keydown", "click", "submit"]) document.addEventListener(name, record, true);
  return true;
}
const INSTALL_LIVE_SUBMISSION_OBSERVER_SCRIPT = "(" + installLiveSubmissionObserver.toString() + ")(" + JSON.stringify(CHATGPT_SELECTORS) + ")";
const READ_LIVE_SUBMISSIONS_SCRIPT = "window.__benjadminLiveUserSubmissions?.events || []";
module.exports = { createAutoWorkStartObservationGuard, INSTALL_LIVE_SUBMISSION_OBSERVER_SCRIPT, READ_LIVE_SUBMISSIONS_SCRIPT };
