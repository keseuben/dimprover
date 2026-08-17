import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const shell = read("components/admin/AdminThemeShell.tsx");
const map = read("components/admin/developer-console/DevelopmentMapWorkspace.tsx");
const css = read("app/admin/admin-theme.css");
const msgCss = read("components/admin/developer-console/DeveloperConsole.module.css");
const consoleLib = read("app/lib/dev-center/developer-console.ts");
const engine = read("app/lib/dev-center/engine-repository.ts");
const taskRoute = read("app/api/dev/console/tasks/[taskId]/route.ts");
const plusRoute = read("app/api/dev/console/plus-bridge/[workerCode]/next/route.ts");

const checks = [
  ["Admin shell supports Sunlight", shell.includes('"light" | "dark" | "sunlight"')],
  ["Map reads Developer Console theme", shell.includes("DEVELOPER_CONSOLE_THEME_KEY") && shell.includes('benjadmin-developer-console-theme')],
  ["Map popup receives source theme in URL", shell.includes("/admin/dev-map?theme=") && shell.includes("encodeURIComponent(sourceTheme)")],
  ["Existing map popup receives theme message", shell.includes("BENJADMIN_DEVELOPMENT_MAP_THEME") && shell.includes("postMessage")],
  ["Map applies received theme", shell.includes('event.data?.type !== "BENJADMIN_DEVELOPMENT_MAP_THEME"') && shell.includes("setTheme(next)")],
  ["Sunlight has admin palette", css.includes(".dimpro-admin-shell.admin-theme-sunlight")],
  ["Drop zone uses theme-neutral class", map.includes("benjadmin-development-map-dropzone") && css.includes(".benjadmin-development-map-dropzone")],
  ["Jázmin/right worker header is mirrored", msgCss.includes(".message_right .messageHeader { flex-direction: row-reverse; }")],
  ["Audit mapper prefers operational worker", consoleLib.includes("operationalWorker") && consoleLib.includes("metadata.workerCode")],
  ["Audit writer supports actorId", engine.includes("actorId?: string | null") && engine.includes('actor_id: text(input.actorId) || "BenAI"')],
  ["Session open persists worker identity", engine.includes("sessionWorkerCode") && engine.includes("activeWorkerCode")],
  ["START emits worker activity", taskRoute.includes("createWorkerActivityConsoleMessage({ workerCode: started.worker.code")],
  ["Operational task states resolve worker", taskRoute.includes("createOperationalMessage") && taskRoute.includes("taskWorkerCode")],
  ["Routing stays Ben-AI owned", taskRoute.includes('if (action === "ROUTE")') && taskRoute.includes("await createBenAiConsoleMessage({ summary: `${routed.task.title} -> ${routed.worker.name}`")],
  ["Plus pull emits real worker activity", plusRoute.includes("createWorkerActivityConsoleMessage") && plusRoute.includes("workerCode: pulled.worker.code")],
  ["Worker operational metadata remains PROD DENY", taskRoute.includes('productionAccess: "DENY"') && engine.includes('productionAccess: "DENY"')],
];

let passed = 0;
for (let i=0;i<checks.length;i++) {
  const [name, ok] = checks[i];
  if (ok) { passed++; console.log(`PASS ${String(i+1).padStart(2,"0")} ${name}`); }
  else console.log(`FAIL ${String(i+1).padStart(2,"0")} ${name}`);
}
const failed = checks.length - passed;
console.log(JSON.stringify({ok: failed===0, passed, failed, total: checks.length, contract:"BENJADMIN Map Theme + Worker Attribution V1"}, null, 2));
process.exit(failed ? 1 : 0);
