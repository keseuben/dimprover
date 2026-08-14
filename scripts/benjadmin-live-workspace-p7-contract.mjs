import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const state = read("components/admin/developer-console/live-workspace-p7-state.ts");
const panel = read("components/admin/developer-console/LiveWorkspaceMultiPanel.tsx");
const live = read("components/admin/developer-console/LiveWorkspaceReadOnly.tsx");
const monaco = read("components/admin/developer-console/LiveWorkspaceMonaco.tsx");
const detached = read("components/admin/developer-console/DetachedLiveWorkspaceShell.tsx");
const detachedPage = read("app/admin/dev-console/workspace/page.tsx");
const adminShell = read("components/admin/AdminThemeShell.tsx");
const adminLayout = read("app/admin/layout.tsx");
const hub = read("components/admin/developer-console/TerminalHubWorkspace.tsx");
const config = read("app/lib/dev-center/terminal-hub/config.ts");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS ${name}`); }
  else { fail += 1; console.error(`FAIL ${name}`); }
}

check("P7 külön feature flag meglévő típusban", read("app/lib/dev-center/terminal-hub/types.ts").includes("multiPanelEnabled: boolean"));
check("P7 gate Live Workspace + Monaco mögött", config.includes('multiPanelEnabled: liveWorkspaceEnabled && flag("BENJADMIN_WORKSPACE_MONACO_ENABLED", false) && flag("BENJADMIN_MULTI_PANEL_ENABLED", false)'));
check("P7 layout kizárólag 1/2/4", state.includes("export type LiveWorkspacePanelCount = 1 | 2 | 4") && state.includes("value === 1 || value === 2 || value === 4"));
check("P7 panel mode LIVE/DIFF/HISTORY", state.includes('"live" | "diff" | "history"'));
check("P7 perzisztált state csak descriptor/meta", state.includes("workspaceId: string") && state.includes("relativePath: string") && !state.includes("content: string"));
check("P7 localStorage kulcs külön", state.includes('benjadmin-live-workspace-p7-state'));
check("P7 BroadcastChannel külön", state.includes('benjadmin-live-workspace-p7-sync') && panel.includes("new BroadcastChannel(LIVE_WORKSPACE_P7_CHANNEL)"));
check("Storage-event fallback létezik", panel.includes('window.addEventListener("storage", onStorage)'));
check("P7 remote state normalizált", panel.includes("normalizeLiveWorkspacePanelState(event.data.state)"));
check("P7 fájltartalom nem state-ben perzisztált", panel.includes("writeStoredState(next)") && panel.includes("type PanelFile =") && !state.includes("LiveWorkspaceFilePreview"));
check("Restored pane fájlt API-ról hidratál", panel.includes("hydrateFiles") && panel.includes("/api/dev/terminal-hub/live-workspace/file?"));
check("P7 file API csak GET", panel.includes("fetch(`/api/dev/terminal-hub/live-workspace/file?") && !/method:\s*["'](?:POST|PUT|PATCH|DELETE)/.test(panel));
check("Aktív panel fogadja a navigator assignmentet", panel.includes("const panelId = state.activePanelId") && panel.includes("assignmentSerialRef"));
check("Ugyanaz a fájl új panelre újra kiosztható serial alapján", live.includes("setAssignmentSerial((value) => value + 1)") && live.includes("serial: assignmentSerial"));
check("Panelváltás külön aktív state", panel.includes("activePanelId") && panel.includes("activatePanel"));
check("Panelenként saját Monaco mód perzisztált", panel.includes("setPanelMode") && panel.includes("mode={panel.mode}") && panel.includes("onModeChange"));
check("P6 Monaco kontrollált módot támogat", monaco.includes("mode: controlledMode") && monaco.includes("onModeChange") && monaco.includes("controlledMode ?? internalMode"));
check("P6 Monaco panelenként saját instance ID", monaco.includes('instanceId = "primary"') && monaco.includes("modelAuthority"));
check("P6 model cleanup csak saját authority", monaco.includes("model.uri.authority === modelAuthority") && !monaco.includes('model.uri.authority === "dimpro"'));
check("P7 mindegyik pane Monaco instanceId-t kap", panel.includes("instanceId={panel.id}"));
check("P7 1 panel gomb", panel.includes("setLayout(1)"));
check("P7 2 panel gomb", panel.includes("setLayout(2)"));
check("P7 4 panel gomb", panel.includes("setLayout(4)"));
check("P7 CSS 1/2/4 layout", css.includes('.liveWorkspaceMultiPanelGrid[data-layout="1"]') && css.includes('.liveWorkspaceMultiPanelGrid[data-layout="2"]') && css.includes('.liveWorkspaceMultiPanelGrid[data-layout="4"]'));
check("P7 CSS 4 panel 2x2", css.includes('grid-template-columns: repeat(2,minmax(0,1fr))') && css.includes('grid-template-rows: repeat(2,minmax(0,1fr))'));
check("Leválasztás felhasználói window.open", panel.includes('window.open("about:blank"') && panel.includes('popup.location.replace("/admin/dev-console/workspace")'));
check("Detached ablak sessiont csak aktív sessionből örökít", panel.includes('sessionStorage.getItem("dimproBenjadminSession") === "active"') && panel.includes('popup.sessionStorage.setItem("dimproBenjadminSession", "active")'));
check("Detached route külön létezik", detachedPage.includes("DetachedLiveWorkspaceShell"));
check("Detached route ugyanazon AdminThemeShell alatt", adminLayout.includes("<AdminThemeShell>{children}</AdminThemeShell>") && adminShell.includes('pathname.startsWith("/admin/dev-console")'));
check("Detached shell státusz API admin fejléccel", detached.includes('/api/dev/terminal-hub/status') && detached.includes("adminHeaders()"));
check("Detached shell csak P4/P6/P7 gate együtt READY", detached.includes("features.liveWorkspaceEnabled") && detached.includes("features.workspaceMonacoEnabled") && detached.includes("features.multiPanelEnabled"));
check("Visszadokkolás explicit", panel.includes("Visszadokkolás") && panel.includes("window.close()"));
check("Detached és docked ugyanazt a panel komponenst használja", detached.includes("<LiveWorkspaceMultiPanel") && live.includes("<LiveWorkspaceMultiPanel"));
check("P7 OFF esetén P6 fallback megmarad", live.includes("multiPanelEnabled ?") && live.includes("monacoEnabled ? <LiveWorkspaceMonaco"));
check("Terminal Hub átadja P7 flaget", hub.includes("multiPanelEnabled={Boolean(status?.features.multiPanelEnabled)}"));
check("P7 UI explicit READ ONLY", panel.includes("READ ONLY") && detached.includes("READ ONLY"));
check("P7 nem indít terminált/shellt", !/node-pty|spawn\(|exec\(|execFile\(|ssh-prod|powershell\.exe/i.test(panel + detached + state));
check("P7 nem használ fájlíró browser API-t", !/showSaveFilePicker|FileSystemWritableFileStream|createWritable/i.test(panel + detached));
check("P7 saját CSS minimum 12 px", !/liveWorkspaceMultiPanel[^\n]*font-size:\s*(?:[0-9]|1[01])px/.test(css));
check("Detached header minimum 12 px", css.includes(".liveWorkspaceDetachedHeader span, .liveWorkspaceDetachedHeader b { font-size: 12px; }"));
check("P7 második monitor nézet full viewport", css.includes(".liveWorkspaceDetachedShell { width: 100vw; height: 100dvh"));
check("P7 state reset biztonságos metadata reset", panel.includes("createLiveWorkspacePanelState(1)") && panel.includes("setFiles({})"));
check("P7 nincs új szerveroldali mutation route", !fs.existsSync(path.join(root, "app/api/dev/terminal-hub/live-workspace/multi-panel")));

console.log(`SUMMARY ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
