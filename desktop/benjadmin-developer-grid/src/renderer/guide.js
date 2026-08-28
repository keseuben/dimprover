"use strict";
const api = window.benjadminGuide;
const $ = (s) => document.querySelector(s);
let savedContent = "";
let editing = false;

function renderText(text) {
  const root = $("#preview");
  root.replaceChildren();
  const lines = String(text || "").split(/\r?\n/);
  let list = null;
  const flushList = () => { if (list) { root.append(list); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); root.append(document.createElement("br")); continue; }
    if (/^-\s+/.test(line)) {
      if (!list) list = document.createElement("ul");
      const li = document.createElement("li"); li.textContent = line.replace(/^-\s+/, ""); list.append(li); continue;
    }
    flushList();
    const node = document.createElement(/^\d+\.\s+/.test(line) ? "h2" : (/^[A-ZÁÉÍÓÖŐÚÜŰ0-9 /–—-]{3,}$/.test(line) ? "h1" : "p"));
    node.textContent = line;
    root.append(node);
  }
  flushList();
}

function setEditing(value) {
  editing = value;
  $("#preview").classList.toggle("is-hidden", value);
  $("#editor").classList.toggle("is-hidden", !value);
  $("#editButton").classList.toggle("is-hidden", value);
  $("#saveButton").classList.toggle("is-hidden", !value);
  $("#cancelButton").classList.toggle("is-hidden", !value);
  $("#resetButton").classList.toggle("is-hidden", !value);
  if (value) { $("#editor").value = savedContent; setTimeout(() => $("#editor").focus(), 20); }
}

async function load() {
  const result = await api.get();
  if (!result?.ok) { $("#notice").textContent = result?.error || "Az útmutató nem tölthető be."; return; }
  savedContent = result.content || "";
  $("#showOnUnlock").checked = result.showOnUnlock !== false;
  renderText(savedContent);
}

$("#closeButton").addEventListener("click", () => api.close());
$("#editButton").addEventListener("click", () => setEditing(true));
$("#cancelButton").addEventListener("click", () => setEditing(false));
$("#resetButton").addEventListener("click", async () => {
  const result = await api.reset();
  if (result?.ok) { $("#editor").value = result.content || ""; $("#notice").textContent = "Az alapverzió betöltve. Mentésig még visszavonható."; }
});
$("#saveButton").addEventListener("click", async () => {
  const content = $("#editor").value.trim();
  if (!content) { $("#notice").textContent = "Az útmutató nem lehet üres."; return; }
  const result = await api.save({ content, showOnUnlock: $("#showOnUnlock").checked });
  if (!result?.ok) { $("#notice").textContent = result?.error || "A mentés sikertelen."; return; }
  savedContent = result.content || content;
  renderText(savedContent);
  setEditing(false);
  $("#notice").textContent = "Mentve.";
});
$("#showOnUnlock").addEventListener("change", async () => {
  if (editing) return;
  const result = await api.save({ content: savedContent, showOnUnlock: $("#showOnUnlock").checked });
  $("#notice").textContent = result?.ok ? "Automatikus megjelenítés beállítása mentve." : (result?.error || "A beállítás nem menthető.");
});
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.altKey && (event.key === "9" || event.code === "Digit9")) {
    event.preventDefault();
    api.close();
    return;
  }
  if (event.key === "Escape") { if (editing) setEditing(false); else api.close(); }
});
void load();
