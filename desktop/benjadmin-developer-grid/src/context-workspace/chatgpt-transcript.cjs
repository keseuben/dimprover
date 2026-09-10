"use strict";

const TRANSCRIPT_SCRIPT = String.raw`(() => {
  try {
    const generating = Boolean(document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="Leáll"]'));
    const url = String(location.href || "");
    const match = new URL(url).pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/);
    const conversationId = match?.[1] || "";
    if (!conversationId) return { ok:false, generating, error:"Nincs rögzíthető /c/... ChatGPT csevegés." };
    const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
    const messages = [];
    for (const [index, node] of nodes.entries()) {
      const rawRole = String(node.getAttribute('data-message-author-role') || '').toLowerCase();
      const role = rawRole === 'user' ? 'USER' : rawRole === 'assistant' ? 'ASSISTANT' : rawRole === 'system' ? 'SYSTEM' : rawRole === 'tool' ? 'TOOL' : '';
      if (!role) continue;
      const container = node.closest('[data-message-id]') || node.closest('article') || node.closest('[data-testid^="conversation-turn-"]') || node;
      const text = String(container.innerText || container.textContent || '').trim();
      if (!text) continue;
      const messageId = String(container.getAttribute?.('data-message-id') || node.getAttribute('data-message-id') || container.getAttribute?.('data-testid') || (role.toLowerCase() + '-' + (index + 1))).slice(0,220);
      messages.push({ messageId, role, text: text.slice(0,80000) });
      if (messages.length >= 500) break;
    }
    return {
      ok: messages.length > 0,
      generating,
      conversationId,
      conversationUrl: url,
      conversationTitle: String(document.querySelector('main h1')?.textContent || document.title || '').trim().slice(0,500),
      messages,
      capturedAt: new Date().toISOString(),
      error: messages.length ? '' : 'Nem található rögzíthető  ChatGPT üzenet.'
    };
  } catch (error) {
    return { ok:false, generating:false, error:String(error?.message || error || 'Transcript capture failed') };
  }
})()`;

async function captureConversationTranscript(view) {
  if (!view || view.webContents.isDestroyed()) return { ok:false, generating:false, error:"A ChatGPT felület nem érhető el." };
  return view.webContents.executeJavaScript(TRANSCRIPT_SCRIPT, true)
    .catch(() => ({ ok:false, generating:false, error:"A ChatGPT transcript nem olvasható biztonságosan." }));
}

module.exports = { TRANSCRIPT_SCRIPT, captureConversationTranscript };
