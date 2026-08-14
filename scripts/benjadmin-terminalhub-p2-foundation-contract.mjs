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

const pkg = JSON.parse(read("package.json"));
const readiness = read("app/lib/dev-center/terminal-hub/readiness.ts");
const identity = read("app/lib/dev-center/terminal-hub/os-identity.ts");
const route = read("app/api/dev/terminal-hub/readiness/route.ts");
const sessionTypes = read("app/lib/dev-center/terminal-hub/session-types.ts");
const ui = read("components/admin/developer-console/TerminalHubWorkspace.tsx");

check("P2 PTY dependency rögzítve", Boolean(pkg.dependencies?.["node-pty"]));
check("P2 XTerm dependency rögzítve", Boolean(pkg.dependencies?.["@xterm/xterm"] && pkg.dependencies?.["@xterm/addon-fit"]));
check("Nem-root UID/GID readiness kötelező", identity.includes("BENJADMIN_TERMINAL_UID") && identity.includes("BENJADMIN_TERMINAL_GID") && identity.includes("Root UID/GID nem engedélyezett"));
check("P2 execution kill switch kötelező", readiness.includes("terminalExecutionEnabled") && readiness.includes("Terminal execution kill switch OFF"));
check("PROD terminal P2-ben tiltott", readiness.includes("prodTerminalEnabled") && readiness.includes("PROD terminal flag P2-ben nem lehet ON"));
check("P2 execution readiness későbbi read-only moduloktól független", !readiness.includes("Live Workspace P4 előtt nem lehet ON") && !readiness.includes("Windows Bridge P8 előtt nem lehet ON"));
check("P2 readiness továbbra is megjeleníti P4/P8 flagállapotot", readiness.includes("liveWorkspaceEnabled: flags.liveWorkspaceEnabled") && readiness.includes("windowsBridgeEnabled: flags.windowsBridgeEnabled"));
check("Readiness API admin-only", route.includes("isDevCenterAuthorized(request.headers, false)") && route.includes("status: 401"));
check("Session lifecycle típusok léteznek", ["STARTING", "RUNNING", "DISCONNECTED", "EXITED", "CLOSED", "FAILED"].every((state) => sessionTypes.includes(state)));
check("Resize és input szerződés létezik", sessionTypes.includes("TerminalSessionResizeRequest") && sessionTypes.includes("TerminalSessionInputRequest"));
check("P2 UI blokkoló okokat mutat", ui.includes("TERMINAL CORE GATE") && ui.includes("terminalReadiness.blockers"));
check("P2 UI explicit nem-root gate-et mutat", ui.includes("Nem-root OS-identitás") && ui.includes("P2 · DEV TERMINAL CORE CANDIDATE"));

console.log(`SUMMARY ${checks.filter((item) => item.ok).length}/${checks.length} PASS`);
