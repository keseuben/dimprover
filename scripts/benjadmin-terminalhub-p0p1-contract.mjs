import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) throw new Error(`${name}: ${detail}`);
}

const types = read("app/lib/dev-center/terminal-hub/types.ts");
const config = read("app/lib/dev-center/terminal-hub/config.ts");
const status = read("app/lib/dev-center/terminal-hub/status.ts");
const workspacePolicy = read("app/lib/dev-center/terminal-hub/workspace-policy.ts");
const dataPolicy = read("app/lib/dev-center/terminal-hub/data-policy.ts");
const events = read("app/lib/dev-center/terminal-hub/events.ts");
const route = read("app/api/dev/terminal-hub/status/route.ts");
const workspace = read("components/admin/developer-console/TerminalHubWorkspace.tsx");
const live = read("components/admin/developer-console/LiveWorkPanel.tsx");
const shell = read("components/admin/developer-console/DeveloperConsoleShell.tsx");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");
const pkg = JSON.parse(read("package.json"));
const terminalCss = css.slice(css.indexOf("BENJADMIN Terminal Hub P0/P1"));

check("P0 TerminalKind szerződés", types.includes('"benjadmin-managed" | "powershell" | "ssh-dev" | "ssh-prod" | "git"'));
check("P0 AI visibility szerződés", types.includes('"blocked" | "filtered" | "allowed"'));
check("P0 RAW/SANITIZED/AUDIT adatklasszis", types.includes('"raw" | "sanitized" | "audit"'));
check("A 06 terv hét normatív feature flagje külön létezik", ["BENJADMIN_TERMINAL_HUB_ENABLED", "BENJADMIN_COMMAND_LIBRARY_ENABLED", "BENJADMIN_LIVE_WORKSPACE_ENABLED", "BENJADMIN_MULTI_PANEL_ENABLED", "BENJADMIN_WINDOWS_BRIDGE_ENABLED", "BENJADMIN_PROD_TERMINAL_ENABLED", "BENJADMIN_SECRET_VAULT_ENABLED"].every((name) => config.includes(name)));
check("P0/P1 veszélyes alrendszerek alapból false", ["BENJADMIN_COMMAND_LIBRARY_ENABLED", "BENJADMIN_LIVE_WORKSPACE_ENABLED", "BENJADMIN_MULTI_PANEL_ENABLED", "BENJADMIN_WINDOWS_BRIDGE_ENABLED", "BENJADMIN_PROD_TERMINAL_ENABLED", "BENJADMIN_SECRET_VAULT_ENABLED", "BENJADMIN_TERMINAL_EXECUTION_ENABLED"].every((name) => config.includes(`flag("${name}", false)`)));
check("PROD fail-closed", status.includes('kind: "ssh-prod"') && status.includes('aiVisibility: "blocked"') && status.includes('state: "LOCKED"') && status.includes('executionEnabled: false'));
check("DEV UI státusz külön a végrehajtástól", status.includes('kind: "ssh-dev"') && status.includes('state: "ONLINE"') && status.includes('executionEnabled: false'));
check("Central lock kötelező read model", status.includes("managedCommandsRequireCentralLock: true") && status.includes("exclusive-operation.lock"));
check("Workspace allowlist-first + realpath védelem", workspacePolicy.includes("TERMINAL_HUB_WORKSPACE_ROOTS") && workspacePolicy.includes("realpath") && workspacePolicy.includes("path.relative") && workspacePolicy.includes("WORKSPACE_PATH_DENIED"));
check("Workspace deny policy érzékeny és build könyvtárakra", workspacePolicy.includes("isSensitivePath") && ["node_modules", ".next", "backups", "credentials", "secrets"].every((name) => workspacePolicy.includes(name)));
check("Terminál sanitization a meglévő secret-scannert használja", dataPolicy.includes("scanSensitiveText") && dataPolicy.includes("REDACTED_SENSITIVE_TERMINAL_DATA") && dataPolicy.includes("findings"));
check("Közös esemény-envelope security metaadatot hordoz", events.includes("BenjadminTerminalEvent") && events.includes("aiVisibility") && events.includes("containsSecrets") && events.includes("sanitized"));
check("Terminal Hub API admin-autholt", route.includes("isDevCenterAuthorized(request.headers, false)") && route.includes("status: 401"));
check("Jobb Élő munka panel tartalmaz Terminal Hub kártyát", live.includes("<TerminalHubCard") && live.includes("onOpenTerminalHub"));
check("Konzol shell kezeli a Terminal Hub réteget és ESC bezárást", shell.includes("TerminalHubWorkspace") && shell.includes("terminalHubOpen") && shell.includes("setTerminalHubOpen(false)"));
check("P1 öt fő fül", ["TERMINAL", "TERMINÁL PARANCSTÁR", "LIVE WORKSPACE", "SESSIONS", "AUDIT"].every((label) => workspace.includes(label)));
check("P1 egyértelműen tiltja a valós shellt", workspace.includes("nincs valódi shell vagy SSH végrehajtás") && workspace.includes("nincs PROD write"));
check("Terminal Hub saját UI szövege minimum 12 px", !/font-size:\s*(?:10|11)px/.test(terminalCss));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
check("P1 nem húz be idő előtt Monaco/XTerm/Chokidar függőséget", !Object.keys(deps).some((name) => /monaco|xterm|chokidar/i.test(name)));

const terminalFiles = [
  "app/lib/dev-center/terminal-hub/config.ts",
  "app/lib/dev-center/terminal-hub/status.ts",
  "app/lib/dev-center/terminal-hub/workspace-policy.ts",
  "app/lib/dev-center/terminal-hub/data-policy.ts",
  "app/lib/dev-center/terminal-hub/events.ts",
  "app/api/dev/terminal-hub/status/route.ts",
];
const serverSource = terminalFiles.map(read).join("\n");
check("P0/P1 nem tartalmaz shell processz indítást", !/child_process|\bspawn\s*\(|\bexecFile\s*\(|\bexecSync\s*\(/.test(serverSource));
check("197 normatív checkpoint jelen van", fs.existsSync(path.join(root, "DIMPROVER_PRODUCT_DOCS/197_benjadmin_terminalhub_normative_checkpoint_20260814.md")));

console.log(`SUMMARY ${checks.filter((item) => item.ok).length}/${checks.length} PASS`);
