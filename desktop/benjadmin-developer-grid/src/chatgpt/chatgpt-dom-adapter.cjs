"use strict";

const CHATGPT_DOM_ADAPTER_VERSION = "1.0.0";

const CHATGPT_SELECTORS = Object.freeze({
  composer: Object.freeze([
    "#prompt-textarea",
    'textarea[data-testid="prompt-textarea"]',
    '[data-testid="prompt-textarea"][contenteditable="true"]',
    'main form [contenteditable="true"]',
  ]),
  sendButton: Object.freeze([
    'button[data-testid="send-button"]',
    'button[data-testid*="send"]',
    'main form button[type="submit"]',
  ]),
  stopButton: Object.freeze([
    'button[data-testid="stop-button"]',
    'button[aria-label*="stop" i]',
    'button[aria-label*="leáll" i]',
  ]),
  microphoneButton: Object.freeze([
    'button[data-testid="composer-speech-button"]',
    'button[data-testid="voice-mode-button"]',
    'button[aria-label*="microphone" i]',
    'button[aria-label*="dictat" i]',
    'button[aria-label*="hang" i]',
  ]),
  messageRole: '[data-message-author-role]',
  assistantMessage: '[data-message-author-role="assistant"]',
  conversationTurn: '[data-testid^="conversation-turn-"]',
  conversationLink: 'a[href*="/c/"]',
  main: "main",
});

function selectorsLiteral() {
  return JSON.stringify(CHATGPT_SELECTORS);
}

function sharedPrelude() {
  return `
    const selectors = ${selectorsLiteral()};
    const visible = (node) => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const firstVisible = (list) => {
      for (const selector of list || []) {
        const candidate = document.querySelector(selector);
        if (visible(candidate)) return candidate;
      }
      return null;
    };
    const conversationId = (() => {
      try { return new URL(String(location.href || "")).pathname.match(/(?:^|\\/)c\\/([A-Za-z0-9_-]+)/)?.[1] || ""; }
      catch { return ""; }
    })();
  `;
}

const DOM_HEALTH_SCRIPT = String.raw`(() => {
  try {
    ${sharedPrelude()}
    const composer = firstVisible(selectors.composer);
    const main = document.querySelector(selectors.main);
    const turns = Array.from(document.querySelectorAll(selectors.messageRole));
    const stop = firstVisible(selectors.stopButton);
    const route = conversationId ? "CONVERSATION" : /\/g\/g-p-[^/]+\/?$/.test(new URL(String(location.href || "")).pathname) ? "PROJECT_ROOT" : "OTHER";
    const missing = [];
    if (!main) missing.push("main");
    if (!composer) missing.push("composer");
    return {
      ok: missing.length === 0,
      version: ${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)},
      route,
      conversationId,
      messageCount: turns.length,
      generating: Boolean(stop),
      missing,
      url: String(location.href || ""),
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      version: ${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)},
      route: "ERROR",
      conversationId: "",
      messageCount: 0,
      generating: false,
      missing: ["exception"],
      url: String(location.href || ""),
      capturedAt: new Date().toISOString(),
      error: String(error?.message || error || "ChatGPT DOM health failed"),
    };
  }
})()`;

const REFRESH_SAFETY_SCRIPT = String.raw`(() => {
  try {
    ${sharedPrelude()}
    const generating = Boolean(firstVisible(selectors.stopButton));
    const composer = firstVisible(selectors.composer);
    const readComposer = (node) => String(node instanceof HTMLTextAreaElement ? node.value : (node?.innerText || node?.textContent || ""));
    const hasDraft = Boolean(composer && readComposer(composer).trim().length > 0);
    const updatePattern = /(refresh|reload|update available|frissít|újratölt|actualizar|mettre à jour|aktualisieren)/i;
    const updateAvailable = Array.from(document.querySelectorAll("button")).filter(visible).some((button) => {
      const label = [button.textContent, button.title, button.getAttribute("aria-label")].filter(Boolean).join(" ");
      return updatePattern.test(label);
    });
    return {
      ok: Boolean(composer),
      version: ${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)},
      busy: !composer || generating || hasDraft,
      generating,
      hasDraft,
      domReady:Boolean(composer),
      updateAvailable,
      conversationId,
      url: String(location.href || ""),
    };
  } catch (error) {
    return { ok:false, version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)}, busy:true, generating:false, hasDraft:false, updateAvailable:false, conversationId:"", error:String(error?.message || error || "refresh safety failed") };
  }
})()`;

const SCROLL_LATEST_SCRIPT = String.raw`(() => {
  try {
    ${sharedPrelude()}
    if (!conversationId) return { ok:false, reason:"conversation-required", version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    const turns = Array.from(document.querySelectorAll(selectors.messageRole));
    if (!turns.length) return { ok:false, reason:"turns-not-ready", conversationId, messageCount:0, version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    const node = turns[turns.length - 1];
    const container = node.closest("[data-message-id]") || node.closest("article") || node.closest(selectors.conversationTurn) || node;
    if (!container) return { ok:false, reason:"latest-turn-container-missing", conversationId, messageCount:turns.length, version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    container.scrollIntoView({ block:"end", inline:"nearest", behavior:"auto" });
    let scroller = container.parentElement;
    let scrollerAdjusted = false;
    while (scroller && scroller !== document.body && scroller !== document.documentElement) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(String(style.overflowY || "")) && scroller.scrollHeight > scroller.clientHeight + 8) {
        scroller.scrollTop = scroller.scrollHeight;
        scrollerAdjusted = true;
        break;
      }
      scroller = scroller.parentElement;
    }
    if (!scrollerAdjusted) {
      const root = document.scrollingElement || document.documentElement;
      if (root && root.scrollHeight > root.clientHeight + 8) root.scrollTop = root.scrollHeight;
    }
    return {
      ok:true,
      reason:"latest-turn-aligned",
      conversationId,
      messageCount:turns.length,
      version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)},
      alignedAt:new Date().toISOString(),
    };
  } catch (error) {
    return { ok:false, reason:"scroll-exception", version:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)}, error:String(error?.message || error || "scroll latest failed") };
  }
})()`;

const TRANSCRIPT_SCRIPT = String.raw`(() => {
  try {
    ${sharedPrelude()}
    const generating = Boolean(firstVisible(selectors.stopButton));
    if (!conversationId) return { ok:false, generating, error:"Nincs rögzíthető /c/... ChatGPT csevegés.", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    const nodes = Array.from(document.querySelectorAll(selectors.messageRole));
    const messages = [];
    for (const [index, node] of nodes.entries()) {
      const rawRole = String(node.getAttribute("data-message-author-role") || "").toLowerCase();
      const role = rawRole === "user" ? "USER" : rawRole === "assistant" ? "ASSISTANT" : rawRole === "system" ? "SYSTEM" : rawRole === "tool" ? "TOOL" : "";
      if (!role) continue;
      const container = node.closest("[data-message-id]") || node.closest("article") || node.closest(selectors.conversationTurn) || node;
      const text = String(container.innerText || container.textContent || "").trim();
      if (!text) continue;
      const messageId = String(container.getAttribute?.("data-message-id") || node.getAttribute("data-message-id") || container.getAttribute?.("data-testid") || (role.toLowerCase() + "-" + (index + 1))).slice(0,220);
      messages.push({ messageId, role, text: text.slice(0,80000) });
      if (messages.length >= 500) break;
    }
    return {
      ok: messages.length > 0,
      generating,
      conversationId,
      conversationUrl: String(location.href || ""),
      conversationTitle: String(document.querySelector("main h1")?.textContent || document.title || "").trim().slice(0,500),
      messages,
      domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)},
      capturedAt: new Date().toISOString(),
      error: messages.length ? "" : "Nem található rögzíthető ChatGPT üzenet."
    };
  } catch (error) {
    return { ok:false, generating:false, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)}, error:String(error?.message || error || "Transcript capture failed") };
  }
})()`;

const CONVERSATION_INFO_SCRIPT = String.raw`(() => {
  try {
    ${sharedPrelude()}
    const currentPath = new URL(location.href).pathname;
    for (const a of document.querySelectorAll(selectors.conversationLink)) {
      const href = new URL(a.href, location.origin);
      if (href.pathname !== currentPath) continue;
      const title = [a.textContent, a.getAttribute("aria-label"), a.getAttribute("title")]
        .filter(Boolean)
        .map((value) => String(value).trim().replace(/\s+/g, " "))
        .find(Boolean) || "";
      const match = title.match(/^(\d{6})[_\s-]+([1-5])[_\s-]+/);
      return { title, id: match ? match[1] + "_" + match[2] : "", conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    }
    return { title: document.querySelector("main h1")?.textContent?.trim() || "", id: "", conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
  } catch {
    return { title: "", id: "", conversationId:"", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
  }
})()`;

const LATEST_ASSISTANT_SCRIPT = String.raw`(() => {
  ${sharedPrelude()}
  const generating = Boolean(firstVisible(selectors.stopButton));
  const nodes = Array.from(document.querySelectorAll(selectors.assistantMessage));
  if (!nodes.length) return { ok:false, generating, error:"Nem található assistant-válasz.", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
  const node = nodes[nodes.length - 1];
  const container = node.closest("[data-message-id]") || node.closest("article") || node.closest(selectors.conversationTurn) || node;
  const text = String(container.innerText || container.textContent || "").trim();
  return text ? { ok:true, generating, text:text.slice(0,190000), conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} } : { ok:false, generating, error:"A legutóbbi assistant-válasz üres.", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
})()`;

const HANDOFF_ASSISTANT_SCRIPT = String.raw`(() => {
  ${sharedPrelude()}
  const nodes = Array.from(document.querySelectorAll(selectors.assistantMessage));
  if (!nodes.length) return { ok:false, error:"Nem található assistant-válasz.", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
  let legacy = null;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    const container = node.closest("[data-message-id]") || node.closest("article") || node.closest(selectors.conversationTurn) || node;
    const text = String(container.innerText || container.textContent || "").trim();
    if (!text) continue;
    if (text.includes("BENJADMIN_HANDOFF_META_V2")) {
      return { ok:true, text:text.slice(0,190000), format:"v2", messageIndexFromEnd:nodes.length - 1 - i, conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    }
    const markerlessV2 = /"schemaVersion"\s*:\s*2/.test(text)
      && /"workerCode"\s*:/.test(text)
      && /"workedMainProject"\s*:/.test(text)
      && /"workedTaskTitle"\s*:/.test(text)
      && /"prodDeny"\s*:/.test(text);
    if (markerlessV2) {
      return { ok:true, text:text.slice(0,190000), format:"v2-markerless", messageIndexFromEnd:nodes.length - 1 - i, conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    }
    if (!legacy && /MUNKA\s+VISSZAADVA/i.test(text) && /ÁTADÓ/i.test(text) && text.length >= 120) {
      legacy = { ok:true, text:text.slice(0,190000), format:"legacy", messageIndexFromEnd:nodes.length - 1 - i, conversationId, domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
    }
  }
  return legacy || { ok:false, error:"Nem található érvényes BENJADMIN Handoff V2 vagy korábbi szabványos átadó az assistant-válaszok között.", domAdapterVersion:${JSON.stringify(CHATGPT_DOM_ADAPTER_VERSION)} };
})()`;

function composerSelectorLiteral() { return JSON.stringify(CHATGPT_SELECTORS.composer); }
function sendSelectorLiteral() { return JSON.stringify(CHATGPT_SELECTORS.sendButton); }
function stopSelectorLiteral() { return JSON.stringify(CHATGPT_SELECTORS.stopButton); }
function microphoneSelectorLiteral() { return JSON.stringify(CHATGPT_SELECTORS.microphoneButton); }
function conversationLinkSelectorLiteral() { return JSON.stringify(CHATGPT_SELECTORS.conversationLink); }

async function execute(view, script, fallback) {
  if (!view || view.webContents.isDestroyed()) return fallback;
  return view.webContents.executeJavaScript(script, true).catch(() => fallback);
}

async function inspectChatGptDom(view) {
  return execute(view, DOM_HEALTH_SCRIPT, {
    ok:false,
    version:CHATGPT_DOM_ADAPTER_VERSION,
    route:"UNAVAILABLE",
    conversationId:"",
    messageCount:0,
    generating:false,
    missing:["webcontents"],
    capturedAt:new Date().toISOString(),
  });
}

async function inspectChatRefreshSafety(view) {
  return execute(view, REFRESH_SAFETY_SCRIPT, {
    ok:false,
    version:CHATGPT_DOM_ADAPTER_VERSION,
    busy:true,
    generating:false,
    hasDraft:false,
    updateAvailable:false,
    conversationId:"",
  });
}

async function scrollToLatestChatTurn(view) {
  return execute(view, SCROLL_LATEST_SCRIPT, {
    ok:false,
    version:CHATGPT_DOM_ADAPTER_VERSION,
    reason:"chat-unavailable",
  });
}

module.exports = {
  CHATGPT_DOM_ADAPTER_VERSION,
  CHATGPT_SELECTORS,
  DOM_HEALTH_SCRIPT,
  REFRESH_SAFETY_SCRIPT,
  SCROLL_LATEST_SCRIPT,
  TRANSCRIPT_SCRIPT,
  CONVERSATION_INFO_SCRIPT,
  LATEST_ASSISTANT_SCRIPT,
  HANDOFF_ASSISTANT_SCRIPT,
  composerSelectorLiteral,
  sendSelectorLiteral,
  stopSelectorLiteral,
  microphoneSelectorLiteral,
  conversationLinkSelectorLiteral,
  inspectChatGptDom,
  inspectChatRefreshSafety,
  scrollToLatestChatTurn,
};
