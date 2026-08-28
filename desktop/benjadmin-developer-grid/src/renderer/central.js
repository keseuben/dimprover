"use strict";
const api = window.benjadminCentral;
function apply(state) {
  if (!state) return;
  document.documentElement.dataset.theme = state.appearance === "light" ? "light" : "dark";
  document.querySelector("#label").textContent = state.label || "DevminAI";
  document.querySelector("#avatarButton").classList.toggle("is-hidden", state.showAvatars === false);
  document.querySelector("#profilePanel").classList.toggle("is-hidden", state.profileVisible !== true);
  document.querySelector("#centralQuietBadge").classList.toggle("is-hidden", state.quietMode !== true);
}
for (const b of document.querySelectorAll("[data-cell-action]")) b.addEventListener("click", async () => { await api.cellAction(b.dataset.cellAction); });
for (const b of document.querySelectorAll("[data-window-action]")) b.addEventListener("click", async () => { await api.windowAction(b.dataset.windowAction); });
document.querySelector("#avatarButton").addEventListener("click", async () => { await api.toggleProfile(); });
document.querySelector("#globalSettingsButton").addEventListener("click", async () => { await api.openGlobalSettings(); });
document.querySelector("#profileClose").addEventListener("click", async () => { await api.closeProfile(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") void api.closeProfile(); });
api.onState(apply);
void api.getState().then((r) => { if (r?.ok) apply(r.state); });
