#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const shell = readFileSync("components/drive/DriveShell.tsx", "utf8");
const board = readFileSync("components/drive/FloatingProjectBoard.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };
check("DriveShell GETs project Drive provisioning", () => assert.match(shell, /fetch\("\/api\/projects\/" \+ encodeURIComponent\(projectId\) \+ "\/drive\/provision", \{/));
check("Provisioning GET uses same-origin credentials", () => assert.match(shell, /drive\/provision", \{[\s\S]*?credentials: "same-origin"/));
check("Provisioning GET disables cache", () => assert.match(shell, /drive\/provision", \{[\s\S]*?cache: "no-store"/));
check("Provisioning reload is driven by selected project id", () => assert.match(shell, /useEffect\(\(\) => \{[\s\S]*?const projectId = selectedProject\?\.id;[\s\S]*?\}, \[selectedProject\?\.id\]\);/));
check("Stale provisioning responses are guarded with AbortController", () => {
  assert.match(shell, /const controller = new AbortController\(\)/);
  assert.match(shell, /signal: controller\.signal/);
  assert.match(shell, /return \(\) => controller\.abort\(\)/);
});
check("Project switch immediately resets old provisioning state", () => assert.match(shell, /const projectId = selectedProject\?\.id;[\s\S]*?setProvisioning\(null\);[\s\S]*?setProvisioningError\(null\);[\s\S]*?setProvisioningNotice\(null\);/));
check("Ready provisioning state is represented", () => assert.match(shell, /payload\.provisioning\.ready \? "ready" : "repair-required"/));
check("Repair-required provisioning state is represented", () => {
  assert.match(shell, /"repair-required"/);
  assert.match(board, /A Drive projektkörnyezet javítást igényel\./);
});
check("Repair permission is exact project.update permission", () => assert.match(shell, /selectedProject\?\.permissions\?\.includes\("project\.update"\)/));
check("Repair uses POST on Drive provisioning endpoint", () => assert.match(shell, /fetch\("\/api\/projects\/" \+ encodeURIComponent\(projectId\) \+ "\/drive\/provision", \{[\s\S]*?method: "POST"/));
check("Repair success writes returned provisioning into state", () => assert.match(shell, /setProvisioning\(payload\.provisioning\)/));
check("Repair success increments workspace revision", () => assert.match(shell, /setWorkspaceRevision\(\(value\) => value \+ 1\)/));
check("DriveWorkspace key includes workspace revision", () => assert.match(shell, /key=\{selectedProject\.id \+ ":" \+ workspaceRevision\}/));
check("Repair failure is user-visible", () => {
  assert.match(shell, /setProvisioningError\(caught instanceof Error \? caught\.message/);
  assert.match(board, /provisioningStatus === "error" && provisioningError/);
});
check("FloatingProjectBoard receives provisioning state", () => {
  assert.match(shell, /provisioning=\{provisioning\}/);
  assert.match(shell, /provisioningStatus=\{provisioningStatus\}/);
  assert.match(shell, /onRepairProvisioning=\{handleRepairProvisioning\}/);
});
check("Ready card shows version folder count and Incoming Drop", () => {
  assert.match(board, />Verzió</);
  assert.match(board, /provisioning\.version/);
  assert.match(board, />Mappák</);
  assert.match(board, /provisioning\.folderCount/);
  assert.match(board, />Beérkező Drop</);
});
check("PILOT row only renders when pilotFolder exists", () => assert.match(board, /provisioning\.pilotFolder \? <div><span>PILOT<\/span>/));
check("Repair button is gated by canRepairProvisioning", () => {
  assert.match(board, /canRepairProvisioning && \(provisioningStatus === "repair-required" \|\| provisioningStatus === "error"\)/);
  assert.match(board, /Javítás \/ újrapróbálás/);
});
check("Repair does not use full-page reload", () => {
  assert.doesNotMatch(shell, /window\.location\.reload/);
  assert.doesNotMatch(board, /window\.location\.reload/);
});
check("Shared Drive provisioning UX has no Projectkapu implementation dependency", () => {
  assert.doesNotMatch(shell, /components\/project-gate|from ["'][^"']*project-gate/);
  assert.doesNotMatch(board, /components\/project-gate|from ["'][^"']*project-gate/);
  assert.match(css, /\.provisioningCard/);
});
console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.7.3 provisioning health and repair UX", pass, fail: 0 }, null, 2));
