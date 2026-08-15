import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import httpModule from "node:http";

const processName = process.env.BENJADMIN_RUNTIME_PROCESS_NAME?.trim() || "dimpro-benjadmin-operator-ui-v2-dev";
const expectedCwd = path.resolve(process.env.BENJADMIN_RUNTIME_EXPECTED_CWD?.trim() || "/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2");
const expectedPort = String(process.env.BENJADMIN_RUNTIME_EXPECTED_PORT || "3100");
const expectedHost = process.env.BENJADMIN_RUNTIME_EXPECTED_HOST?.trim() || "127.0.0.1";
const skipHttp = process.env.BENJADMIN_RUNTIME_SKIP_HTTP === "1";

function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok: false, code, message, processName, expectedCwd, ...details }, null, 2));
  process.exit(2);
}

function readPm2() {
  const result = spawnSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail("PM2_LIST_FAILED", "A PM2 processzlista nem olvasható.");
  try { return JSON.parse(result.stdout); } catch { fail("PM2_LIST_INVALID", "A PM2 processzlista nem értelmezhető."); }
}

function readBuildId(root) {
  const file = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(file)) fail("BENJADMIN_BUILD_ID_MISSING", "A BENJADMIN operator BUILD_ID hiányzik.");
  const value = fs.readFileSync(file, "utf8").trim();
  if (!value) fail("BENJADMIN_BUILD_ID_EMPTY", "A BENJADMIN operator BUILD_ID üres.");
  return value;
}

async function probe(pathname, expectedStatus) {
  return new Promise((resolve) => {
    const request = httpModule.request({
      host: expectedHost,
      port: Number(expectedPort),
      path: pathname,
      method: "GET",
      headers: { Host: "admin.dev.dimpro.hu", Connection: "close" },
      timeout: 5000,
    }, (response) => {
      response.resume();
      response.once("end", () => {
        if (response.statusCode !== expectedStatus) fail("BENJADMIN_RUNTIME_HTTP_MISMATCH", `Várt HTTP ${expectedStatus}, kapott ${response.statusCode}.`, { path: pathname, status: response.statusCode });
        resolve(response.statusCode);
      });
    });
    request.once("timeout", () => { request.destroy(); fail("BENJADMIN_RUNTIME_HTTP_TIMEOUT", "A BENJADMIN runtime HTTP probe időtúllépett.", { path: pathname }); });
    request.once("error", () => fail("BENJADMIN_RUNTIME_HTTP_FAILED", "A BENJADMIN runtime HTTP probe sikertelen.", { path: pathname }));
    request.end();
  });
}

const list = readPm2();
const matches = list.filter((item) => item?.name === processName);
if (matches.length !== 1) fail("BENJADMIN_PM2_IDENTITY_COUNT", "Pontosan egy BENJADMIN DEV PM2 processz szükséges.", { count: matches.length });
const processInfo = matches[0];
const cwd = path.resolve(processInfo?.pm2_env?.pm_cwd || "");
if (cwd !== expectedCwd) fail("BENJADMIN_PM2_CWD_MISMATCH", "A BENJADMIN PM2 processz másik worktree-re mutat.", { actualCwd: cwd });
if (processInfo?.pm2_env?.status !== "online") fail("BENJADMIN_PM2_NOT_ONLINE", "A BENJADMIN PM2 processz nem online.", { status: processInfo?.pm2_env?.status || "unknown" });
const port = String(processInfo?.pm2_env?.PORT || "");
const host = String(processInfo?.pm2_env?.HOSTNAME || "");
if (port !== expectedPort) fail("BENJADMIN_PM2_PORT_MISMATCH", "A BENJADMIN PM2 port eltér az elvárttól.", { actualPort: port, expectedPort });
if (host !== expectedHost) fail("BENJADMIN_PM2_HOST_MISMATCH", "A BENJADMIN PM2 host eltér az elvárttól.", { actualHost: host, expectedHost });
const args = Array.isArray(processInfo?.pm2_env?.args) ? processInfo.pm2_env.args.map(String) : [String(processInfo?.pm2_env?.args || "")];
if (!args.includes("start")) fail("BENJADMIN_PM2_START_ARGS_MISMATCH", "A BENJADMIN PM2 processz nem a start scriptet futtatja.", { args });
const buildId = readBuildId(expectedCwd);
const marker = path.join(expectedCwd, ".next", "standalone", ".dimpro-assets-build-id");
if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8").trim() !== buildId) fail("BENJADMIN_STANDALONE_BUILD_MISMATCH", "A standalone asset marker nem egyezik az aktív BUILD_ID-val.", { buildId });

const http = {};
if (!skipHttp) {
  http.console = await probe("/admin/dev-console", 200);
  http.p9VaultAuthGate = await probe("/api/dev/terminal-hub/secret-vault/readiness", 401);
}
console.log(JSON.stringify({ ok: true, processName, cwd, port, host, buildId, status: "online", http }, null, 2));
