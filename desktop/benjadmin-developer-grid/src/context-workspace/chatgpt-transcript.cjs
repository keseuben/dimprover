"use strict";

const { TRANSCRIPT_SCRIPT } = require("../chatgpt/chatgpt-dom-adapter.cjs");

async function captureConversationTranscript(view) {
  if (!view || view.webContents.isDestroyed()) return { ok:false, generating:false, error:"A ChatGPT felület nem érhető el." };
  return view.webContents.executeJavaScript(TRANSCRIPT_SCRIPT, true)
    .catch(() => ({ ok:false, generating:false, error:"A ChatGPT transcript nem olvasható biztonságosan." }));
}

module.exports = { TRANSCRIPT_SCRIPT, captureConversationTranscript };
