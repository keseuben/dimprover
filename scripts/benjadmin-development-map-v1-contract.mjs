#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const shell = read("components/admin/AdminThemeShell.tsx");
const rail = read("components/admin/developer-console/DeveloperConsoleProjectRail.tsx");
const mapUi = read("components/admin/developer-console/DevelopmentMapWorkspace.tsx");
const mapModel = read("app/lib/dev-center/development-map.ts");
const repo = read("app/lib/dev-center/engine-repository.ts");
const route = read("app/api/dev/console/development-map/[taskId]/route.ts");
const page = read("app/admin/dev-map/page.tsx");

const checks = [
  ["Ctrl+Alt+2 shortcut exists", shell.includes("ctrlAltTwo") && shell.includes("Digit2") && shell.includes("Numpad2")],
  ["Full map route opens", shell.includes('const target = `/admin/dev-map?theme=') && shell.includes('"benjadmin-development-map"')],
  ["Map shortcut hides/focuses opener", shell.includes('pathname === "/admin/dev-map"') && shell.includes("window.blur()") && shell.includes("window.opener.focus()")],
  ["Topbar map button exists", shell.includes('data-testid="benjadmin-development-map-button"')],
  ["Console rail opens map event", rail.includes('benjadmin:development-map-open') && rail.includes('data-testid="benjadmin-open-development-map"')],
  ["Compact rail renamed to active development", rail.includes("AKTÍV FEJLESZTÉSEK") && !rail.includes("> FELADATOK<")],
  ["Technical tasks hidden from compact rail", rail.includes("isTechnicalDevelopmentTask") && rail.includes("Technikai / acceptance taskok")],
  ["Compact rail shows 6-stage state", rail.includes("6/{context.workStageIndex}") && rail.includes("workStageLabel")],
  ["Full map has two-column workspace", mapUi.includes('data-testid="benjadmin-development-map-columns"') && mapUi.includes("xl:grid-cols-")],
  ["Source and target columns exist", mapUi.includes('data-testid="benjadmin-development-map-source"') && mapUi.includes('data-testid="benjadmin-development-map-targets"')],
  ["Task cards are draggable", mapUi.includes("draggable") && mapUi.includes("text/benjadmin-task-id")],
  ["Map targets accept drops", mapUi.includes("onDragOver") && mapUi.includes("onDrop") && mapUi.includes("data-development-map-node")],
  ["Drop persists via map API", mapUi.includes("/api/dev/console/development-map/") && mapUi.includes('method: "PATCH"')],
  ["Hierarchy is group-project-module-context", mapModel.includes("groupName") && mapModel.includes("projectName") && mapModel.includes("moduleName") && mapModel.includes("contextModuleName")],
  ["BENJADMIN own project taxonomy exists", mapModel.includes("BENJADMIN Fejlesztői Konzol")],
  ["ChatGrid Desktop has explicit BENJADMIN map node", mapModel.includes('id: "benjadmin-chatgrid"') && mapModel.includes('moduleName: "ChatGrid Desktop"')],
  ["External Review Room has explicit BENJADMIN map node", mapModel.includes('id: "benjadmin-external-review-room"') && mapModel.includes("M.Forge / V.Guard review thread")],
  ["Drop and Drive are separate map projects", mapModel.includes('projectName: "DIMPRO Drop"') && mapModel.includes('projectName: "DIMPRO Drive"')],
  ["Existing task context is reused", mapModel.includes("resolveTaskDevelopmentContext")],
  ["Explicit developmentMap placement wins", mapModel.includes("metadata.developmentMap") || mapModel.includes("meta.developmentMap")],
  ["API requires authenticated mutation subject", route.includes("getDevCenterMutationSubject") && route.includes("engineUnauthorized")],
  ["Repository persists developmentMap metadata", repo.includes("updateDevEngineTaskDevelopmentMap") && repo.includes("developmentMap") && repo.includes("developmentContext")],
  ["Repository writes audited move event", repo.includes("TASK_DEVELOPMENT_MAP_MOVED")],
  ["Map move is PROD denied", repo.includes('productionAccess: "DENY"')],
  ["Map move never physically moves Git", repo.includes("physicalGitMove: false") && mapUi.includes("Git/worktree nem")],
  ["No DB migration required", !mapModel.includes("CREATE TABLE") && !route.includes("migration")],
  ["Map page renders workspace", page.includes("DevelopmentMapWorkspace")],
];
let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${String(passed + (ok ? 1 : 0)).padStart(2,"0")} ${name}`);
  if (ok) passed += 1;
}
console.log(JSON.stringify({ok: passed === checks.length, passed, failed: checks.length - passed, total: checks.length, contract: "BENJADMIN Development Map V1"}, null, 2));
if (passed !== checks.length) process.exit(1);
