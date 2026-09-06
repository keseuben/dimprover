const candidateBase = String(process.env.DEVELOPER_GRID_CANDIDATE_BASE || "").trim();
if (!candidateBase) throw new Error("DEVELOPER_GRID_CANDIDATE_BASE hiányzik; candidate smoke nem használhat implicit/stale portot.");
const parsedBase = new URL(candidateBase);
if (!(["127.0.0.1", "localhost"].includes(parsedBase.hostname) && parsedBase.protocol === "http:")) {
  throw new Error(`DEVELOPER_GRID_CANDIDATE_BASE_LOCAL_ONLY: ${parsedBase.origin}`);
}
const base = parsedBase.origin.replace(/\/+$/, "");
const reporterKey = process.env.DEVELOPER_GRID_CANDIDATE_REPORTER_KEY || "";
const adminKey = process.env.DEVELOPER_GRID_CANDIDATE_ADMIN_KEY || "";

let checks = 0;

function check(ok, label, detail = "") {
  checks += 1;
  if (!ok) throw new Error(`FAIL ${label}${detail ? ` · ${detail}` : ""}`);
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}${detail ? ` · ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...options });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, text, json };
}

const page = await request("/admin/developer-grid");
check([200, 307, 308].includes(page.response.status), "Developer Grid page route responds", `HTTP ${page.response.status}`);

const anonymous = await request("/api/dev/grid/foundation");
check(anonymous.response.status === 401, "Foundation API fails closed without auth", `HTTP ${anonymous.response.status}`);

if (!reporterKey) throw new Error("DEVELOPER_GRID_CANDIDATE_REPORTER_KEY hiányzik.");
const reporterHeaders = { "x-dimpro-dev-reporter-key": reporterKey };

const foundation = await request("/api/dev/grid/foundation", { headers: reporterHeaders });
check(foundation.response.status === 200, "Foundation API reporter auth", `HTTP ${foundation.response.status}`);
check(foundation.json?.foundation?.sourceProvenance?.sourceState === "VERIFIED", "Source provenance VERIFIED");
check(foundation.json?.foundation?.releaseRuntimeProvenance?.state === "VERIFIED", "Release/runtime provenance VERIFIED");
check(foundation.json?.foundation?.releaseRuntimeProvenance?.blockCode === null, "Release/runtime blockCode empty");
check(foundation.json?.foundation?.version === "0.1.23-dev", "Developer Grid version v0.1.23 DEV");
check(Boolean(foundation.json?.foundation?.releaseRuntimeProvenance?.buildId), "Runtime BUILD_ID exposed");
check(/^[0-9a-f]{40}$/.test(String(foundation.json?.foundation?.releaseRuntimeProvenance?.sourceCommit || "")), "Runtime source commit exposed");
check(foundation.json?.foundation?.productionAccess === "DENY", "PROD access DENY");
const buildNodes = foundation.json?.foundation?.buildNodes || [];
check(Array.isArray(buildNodes) && buildNodes.length === 2, "Two build nodes exposed");
check(buildNodes.every((node) => Boolean(node.lastVerifiedAt)), "Build node SSH readiness timestamps exposed");
const hasReadyBuildNode = buildNodes.some((node) => node.state === "READY");
check(
  hasReadyBuildNode
    ? foundation.json?.foundation?.buildExecutor?.kind === "REMOTE_BUILD_NODE"
    : foundation.json?.foundation?.buildExecutor?.kind === "BUILD_QUEUE",
  "Build executor follows readiness state without DEV-host fallback",
);
check(foundation.json?.foundation?.realtime?.mode === "DELTA_EVENT", "Realtime mode DELTA_EVENT");
check(foundation.json?.foundation?.realtime?.fullSnapshotPollingAllowed === false, "Full snapshot polling forbidden");

const state = await request("/api/dev/grid/state", { headers: reporterHeaders });
check(state.response.status === 200 && state.json?.ok === true, "State snapshot bootstrap available");
const revision = Number(state.json?.state?.revision || 0);
const stateDelta = await request(`/api/dev/grid/state?after=${revision}&limit=10`, { headers: reporterHeaders });
check(stateDelta.response.status === 200 && Array.isArray(stateDelta.json?.delta?.changes), "State delta endpoint bounded");
check(!("state" in (stateDelta.json || {})), "State delta does not return full snapshot");

const events = await request("/api/dev/grid/events?limit=10", { headers: reporterHeaders });
check(events.response.status === 200 && events.json?.mode === "DELTA_EVENT", "Activity endpoint DELTA_EVENT");
check(Array.isArray(events.json?.page?.events) && events.json.page.events.length <= 10, "Activity history bounded");

const bridge = await request("/api/dev/grid/bridge", { headers: reporterHeaders });
check(bridge.response.status === 200 && bridge.json?.bridge?.connected === true, "Developer Console bridge connected");
check(bridge.json?.bridge?.presenceAuthoritative === false, "Presence remains non-authoritative");

if (adminKey) {
  const materialize = await request("/api/dev/grid/state", {
    method: "POST",
    headers: { "x-dimpro-license-admin-key": adminKey },
  });
  check(materialize.response.status === 200 && materialize.json?.ok === true, "Task/session materialization");
  check(materialize.json?.materialized?.session?.sourceProvenance?.sourceState === "VERIFIED", "Materialized session source VERIFIED");
} else {
  console.log("SKIP task/session materialization · DEVELOPER_GRID_CANDIDATE_ADMIN_KEY nincs megadva");
}

console.log(`Developer Grid ${foundation.json?.foundation?.version || "unknown"} candidate smoke PASS · ${checks} checks · ${base}`);
