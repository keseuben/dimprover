#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("components/drive/DriveShell.tsx", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const board = readFileSync("components/drive/FloatingProjectBoard.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("DriveShell still loads projects from GET /api/projects", () => {
  assert.match(shell, /fetch\("\/api\/projects", \{ credentials: "same-origin", cache: "no-store" \}\)/);
});
check("DriveShell keeps selectedProjectId as selection source of truth", () => {
  assert.match(shell, /const \[selectedProjectId, setSelectedProjectId\] = useState\(""\)/);
});
check("DriveShell does not add independent selectedWorkspaceId state", () => {
  assert.doesNotMatch(shell, /useState[^;\n]*selectedWorkspaceId|const \[selectedWorkspaceId,/);
});
check("workspace options derive only from projects", () => {
  assert.match(shell, /workspaceOptions = useMemo<DriveWorkspaceOption\[\]>\([\s\S]*?projects\.map\(\(project\)/);
});
check("DriveShell passes workspaceOptions to DriveWorkspace", () => {
  assert.match(shell, /workspaceOptions=\{workspaceOptions\}/);
});
check("DriveShell passes selectedProjectId as selectedWorkspaceId", () => {
  assert.match(shell, /selectedWorkspaceId=\{selectedProjectId\}/);
});
check("DriveShell passes setSelectedProjectId as workspace change callback", () => {
  assert.match(shell, /onWorkspaceChange=\{setSelectedProjectId\}/);
});
check("FloatingProjectBoard still receives selected project id", () => {
  assert.match(shell, /selectedProjectId=\{selectedProject\?\.id \|\| ""\}/);
});
check("FloatingProjectBoard still uses same-state project change callback", () => {
  assert.match(shell, /onProjectChange=\{setSelectedProjectId\}/);
});
check("DriveWorkspace renders workspace selector in project header before toolbar", () => {
  const headerStart = workspace.indexOf("<header className={styles.projectHeader}>");
  const toolbar = workspace.indexOf("<DriveToolbar", headerStart);
  const selector = workspace.indexOf("workspaceSelectorWrap", headerStart);
  assert.ok(headerStart >= 0 && selector > headerStart && toolbar > selector);
});
check("workspace selector uses Munkatér terminology", () => {
  assert.match(workspace, />Munkatér<\/label>/);
  assert.match(workspace, /aria-label="Drive munkatér kiválasztása"/);
});
check("selector options come only from workspaceOptions", () => {
  assert.match(workspace, /workspaceOptions\.map\(\(option\)/);
});
check("no hardcoded personal Drive option exists", () => {
  assert.doesNotMatch(shell + workspace, /Saját DIMPRO Drive|Saját Drive/);
});
check("no guest auth/workspace endpoint is introduced", () => {
  assert.doesNotMatch(shell + workspace, /guest-auth|guest\/auth|project-guest|guestWorkspace/);
});
check("selector does not fetch per-project storage or quota", () => {
  const selectorStart = workspace.indexOf("workspaceOptions.length > 0");
  const selectorEnd = workspace.indexOf("<div className={styles.headerActions}>", selectorStart);
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart);
  assert.doesNotMatch(workspace.slice(selectorStart, selectorEnd), /fetch\(|drive\/storage|quota/);
});
check("selected project provisioning effect remains", () => {
  assert.match(shell, /useEffect\(\(\) => \{[\s\S]*?const projectId = selectedProject\?\.id;[\s\S]*?\}, \[selectedProject\?\.id\]\);/);
});
check("DriveWorkspace key still includes selected project and workspace revision", () => {
  assert.match(shell, /key=\{selectedProject\.id \+ ":" \+ workspaceRevision\}/);
});
check("desktop selector uses independent true-center positioning", () => {
  assert.match(css, /\.workspaceSelectorWrap\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%, -50%\)/);
});
check("mobile selector removes absolute centering and uses second row", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobile, /\.workspaceSelectorWrap\s*\{[\s\S]*?position:\s*static;[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?grid-row:\s*2;/);
});
check("selector CSS constrains long labels and horizontal growth", () => {
  assert.match(css, /\.workspaceSelector\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /max-width:\s*100%/);
});
check("FloatingProjectBoard project selector remains present", () => {
  assert.match(board, /className=\{styles\.projectSelect\}/);
  assert.match(board, /onChange=\{\(event\) => onProjectChange\(event\.target\.value\)\}/);
});
check("V0.7.5 shared UI does not add Projectkapu dependency", () => {
  const selectorTypeStart = workspace.indexOf("type DriveWorkspaceOption");
  const propsEnd = workspace.indexOf("type ProjectMembershipRole", selectorTypeStart);
  assert.ok(selectorTypeStart >= 0 && propsEnd > selectorTypeStart);
  assert.doesNotMatch(workspace.slice(selectorTypeStart, propsEnd), /project-gate/);
});
check("workspace selector patch does not add backend project semantics", () => {
  assert.doesNotMatch(shell, /POST.*workspace|\/api\/workspaces|personal-drive/);
});
check("workspace selector patch does not add Drive Core backend calls", () => {
  const optionStart = shell.indexOf("const workspaceOptions");
  const optionEnd = shell.indexOf("const canRepairProvisioning", optionStart);
  assert.ok(optionStart >= 0 && optionEnd > optionStart);
  assert.doesNotMatch(shell.slice(optionStart, optionEnd), /fetch\(|drive-core|drive\/storage/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.5 workspace selector UX",
  pass,
  fail: 0,
}, null, 2));
