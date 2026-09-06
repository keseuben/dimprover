import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const model = read("app/lib/developer-grid/system-health-model.ts");
const registry = read("app/lib/developer-grid/system-health-registry.ts");
const severitySource = read("app/lib/developer-grid/system-health-severity.ts");
const adapters = read("app/lib/developer-grid/system-health-adapters.ts");
const ai = read("app/lib/developer-grid/system-health-ai.ts");
const operationsSource = read("app/lib/developer-grid/system-health-operations.ts");
const supabaseConfig = read("app/lib/developer-grid/supabase-monitoring-config.ts");
const supabaseRoute = read("app/api/dev/grid/supabase-monitoring/route.ts");
const facade = read("app/lib/developer-grid/system-health.ts");
const buildNodes = read("app/lib/developer-grid/build-nodes.ts");
let n = 0;
const check = (label, fn) => { fn(); n += 1; console.log(`PASS ${String(n).padStart(2, "0")} ${label}`); };

function loadSeverityModule() {
  const js = ts.transpileModule(severitySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cjsModule = { exports: {} };
  new Function("exports", "module", "require", js)(cjsModule.exports, cjsModule, require);
  return cjsModule.exports;
}

const severity = loadSeverityModule();
const baseNode = (overrides = {}) => ({
  id: "test", label: "TEST", kind: "DEV", state: "READY", severity: "OK", reason: "ok",
  sampledAt: new Date().toISOString(), staleAfterMs: 60_000, stale: false, readOnly: false,
  metrics: {}, capabilities: [], source: "TEST", quality: "LIVE", ...overrides,
});

check("V2 model defines all infrastructure kinds", () => { for (const kind of ["DEV","BUILD","PROD","DATABASE","STORAGE","SERVICE","AI"]) assert.ok(model.includes(`\"${kind}\"`)); });
check("V2 model defines state and severity vocabulary", () => { for (const value of ["READY","BUSY","DEGRADED","BLOCKED","NOT_CONNECTED","OFFLINE","UNKNOWN","PLANNED","OK","INFO","WARNING","CRITICAL"]) assert.ok(model.includes(`\"${value}\"`)); });
check("V2 node includes stale quality source and readOnly fields", () => { for (const field of ["staleAfterMs","stale:","readOnly:","source:","quality:","capabilities:"]) assert.ok(model.includes(field)); });
check("DIMPROMIN adapter contract is sanitized and health-only", () => { assert.match(model, /DimprominAiHealthAdapter/); assert.match(model, /DimprominAiHealthMetrics/); for (const key of ["gpuType","vramUsedBytes","loadedModel","queueDepth","tokensPerSecond"]) assert.ok(model.includes(key)); for (const forbidden of ["prompt:","conversation:","apiKey:","password:","connectionString:","requestPayload:","responsePayload:"]) assert.ok(!model.includes(forbidden)); });
check("DIMPROMIN adapter sanitizes only allowlisted health metrics", () => { assert.match(ai, /AI_METRIC_KEYS/); assert.match(ai, /sanitizeDimprominMetrics/); assert.match(ai, /item\.slice\(0, 160\)/); assert.doesNotMatch(ai, /prompt|conversation|apiKey|password|connectionString|requestPayload|responsePayload/i); });
check("operational context exposes safe fields only", () => { assert.match(operationsSource, /SAFE_OPERATION_FIELDS/); for (const key of ["status","operation","owner","task","target","workerCode","host","pid","startedAt","finishedAt","exitCode","event"]) assert.ok(operationsSource.includes(`"${key}"`)); assert.doesNotMatch(operationsSource, /"command"|"token"|"apiKey"|"password"|connectionString/i); });
check("operational context is read-only lock/runtime diagnostics", () => { assert.match(operationsSource, /exclusive-operation\.lock/); assert.match(operationsSource, /flock/); assert.match(operationsSource, /probeLocalTcp/); assert.doesNotMatch(operationsSource, /restart|deploy|pm2 restart|systemctl restart/i); });
check("V2 response keeps legacy servers storage and traffic compatibility", () => { assert.match(model, /servers: LegacyHealthServer\[\]/); assert.match(model, /storage: LegacyHealthStorage\[\]/); assert.match(model, /traffic: LegacyHealthTraffic\[\]/); });
check("registry includes DEV BUILD PROD DB external storage traffic and AI", () => { for (const id of ["dev-vps","build01","build02","prod-vps","db-vps","dev-root","hetzner-object-storage","hetzner-bx11","supabase-traffic","drive-storage","drop-storage","backup-storage","artifact-storage","dimpromin-ai-01","dimpromin-ai-02"]) assert.ok(registry.includes(`id: \"${id}\"`)); });
check("DIMPROMIN nodes are registry-driven planned AI nodes", () => { assert.match(registry, /dimpromin-ai-01[\s\S]*kind: \"AI\"[\s\S]*planned: true/); assert.match(registry, /dimpromin-ai-02[\s\S]*kind: \"AI\"[\s\S]*planned: true/); });
check("storage registry includes Drive Drop backup and artifact placeholders", () => { for (const id of ["drive-storage","drop-storage","backup-storage","artifact-storage"]) assert.ok(registry.includes(`id: "${id}"`)); });
check("planned AI metrics are explicit null health fields", () => { for (const key of ["gpuType","gpuUtilPercent","vramTotalBytes","vramUsedBytes","loadedModel","queueDepth","tokensPerSecond","modelState"]) assert.ok(registry.includes(`${key}: null`)); });
check("PROD and DB registry nodes are read only", () => { assert.match(registry, /prod-vps[\s\S]*kind: \"PROD\"[\s\S]*readOnly: true/); assert.match(registry, /db-vps[\s\S]*kind: \"DATABASE\"[\s\S]*readOnly: true/); });
check("adapter normalizes servers storage and traffic", () => { assert.match(adapters, /normalizeHealthServer/); assert.match(adapters, /normalizeHealthStorage/); assert.match(adapters, /normalizeHealthTraffic/); assert.match(adapters, /normalizeInfrastructureNodes/); });
check("adapter never invents missing build metrics", () => { assert.match(adapters, /memoryPercent: metrics\.memoryPercent/); assert.match(adapters, /diskPercent: metrics\.diskPercent/); });
check("build nodes use sanitized MCP gateway snapshots without direct SSH", () => { assert.match(buildNodes, /BENJADMIN_BUILD_NODE_SNAPSHOT_FILE/); assert.match(buildNodes, /DIMPRO_MCP_SSH_GATEWAY/); assert.match(buildNodes, /containsForbiddenKey/); assert.doesNotMatch(buildNodes, /execFile|\/usr\/bin\/ssh/); });
check("build gateway metrics and BLOCKED state reach the health adapter", () => { for (const field of ["buildLockHeld","swapMinimumBytes","storageGovernor","toolchainReady"]) assert.ok(adapters.includes(field)); assert.match(facade, /state: node\.healthState/); assert.match(facade, /metrics: node\.metrics/); });
check("facade publishes schemaVersion 2 and normalized external resources", () => { assert.match(facade, /schemaVersion: 2/); assert.match(facade, /nodes, overall: aggregateInfrastructureHealth\(nodes\), alerts: infrastructureHealthAlerts\(nodes\), operations, servers, storage, traffic/); });
check("facade integrates optional DIMPROMIN adapter and operational context", () => { assert.match(facade, /applyDimprominAiAdapter/); assert.match(facade, /getInfrastructureOperationalContext/); assert.match(facade, /aiAdapter: DimprominAiHealthAdapter/); });
check("facade keeps 30 60 300 second cache policy and AI 30 second base", () => { assert.match(facade, /SERVER_TTL_MS = 30_000/); assert.match(facade, /PROTECTED_SERVER_TTL_MS = 60_000/); assert.match(facade, /DISK_TTL_MS = 60_000/); assert.match(facade, /STORAGE_TTL_MS = 300_000/); assert.match(facade, /TRAFFIC_TTL_MS = 300_000/); assert.match(facade, /AI_TTL_MS = 30_000/); });
check("facade collects Linux memory PSI", () => { assert.match(facade, /\/proc\/pressure\/memory/); assert.match(facade, /memoryPsiSomeAvg60/); assert.match(facade, /memoryPsiFullAvg60/); });
check("Supabase traffic uses read-only Management API instead of database polling", () => { assert.match(facade, /SUPABASE_MANAGEMENT_API/); assert.match(facade, /usage\.api-counts/); assert.match(supabaseConfig, /BENJADMIN_SUPABASE_ANALYTICS_TOKEN/); assert.doesNotMatch(facade, /@supabase|createClient\(|\.from\(/i); });
check("Supabase analytics token supports secure server-side token file without service-role fallback", () => { assert.match(supabaseConfig, /DEFAULT_TOKEN_FILE/); assert.match(supabaseConfig, /analytics-usage-read\.token/); assert.match(supabaseConfig, /readSupabaseAnalyticsToken/); assert.doesNotMatch(supabaseConfig, /SUPABASE_SERVICE_ROLE_KEY/); });
check("protected resource snapshots are freshness gated and accept current metric aliases", () => { assert.match(facade, /INFRA_SNAPSHOT_MAX_AGE_MS = 5 \* 60_000/); assert.match(facade, /snapshotIsFresh/); assert.match(facade, /cpuPercent.*cpu_percent/); assert.match(facade, /uptimeSeconds.*uptimeSec/); assert.match(facade, /networkRttMs/); assert.match(facade, /quality: prodHasResources \? "LIVE" : "PARTIAL"/); });
check("Hetzner external storage uses S3 read-only listing and fixed BX11 SSH probe", () => { assert.match(facade, /inspectHetznerObjectStorage/); assert.match(facade, /listDriveS3Objects/); assert.match(facade, /listDropS3Objects/); assert.match(facade, /HETZNER_STORAGE_BOX_ALIAS/); assert.match(facade, /df -B1 --output=size,used,avail,pcent/); assert.doesNotMatch(facade, /rm -|delete|PutObject|DeleteObject/i); });
check("traffic quota saturation escalates to warning and critical", () => { assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"SERVICE", metrics:{usagePercent:85} })).severity,"WARNING"); assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"SERVICE", metrics:{usagePercent:95} })).severity,"CRITICAL"); });
check("RAM 75 percent becomes INFO", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { memoryPercent: 75 } })).severity, "INFO"));
check("RAM 85 percent becomes WARNING", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { memoryPercent: 85 } })).severity, "WARNING"));
check("RAM above 92 percent becomes CRITICAL", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { memoryPercent: 93 } })).severity, "CRITICAL"));
check("swap 50 percent becomes WARNING", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { swapPercent: 50 } })).severity, "WARNING"));
check("swap 80 percent becomes CRITICAL", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { swapPercent: 80 } })).severity, "CRITICAL"));
check("disk 80 percent becomes INFO", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { diskPercent: 80 } })).severity, "INFO"));
check("disk 90 percent becomes WARNING", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { diskPercent: 90 } })).severity, "WARNING"));
check("disk 95 percent becomes CRITICAL", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { diskPercent: 95 } })).severity, "CRITICAL"));
check("memory PSI sustained pressure becomes WARNING", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { memoryPsiSomeAvg60: 10 } })).severity, "WARNING"));
check("memory PSI severe pressure becomes CRITICAL", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ metrics: { memoryPsiFullAvg60: 25 } })).severity, "CRITICAL"));
check("stale READY node degrades and is marked STALE", () => { const node = severity.evaluateInfrastructureNode(baseNode({ sampledAt: new Date(Date.now()-120_000).toISOString(), staleAfterMs: 30_000 })); assert.equal(node.stale, true); assert.equal(node.state, "DEGRADED"); assert.equal(node.quality, "STALE"); assert.equal(node.severity, "WARNING"); });
check("registry-only PLANNED node is not falsely stale", () => { const node = severity.evaluateInfrastructureNode(baseNode({ kind:"AI", state:"PLANNED", sampledAt:null, quality:"REGISTRY_ONLY" })); assert.equal(node.stale, false); assert.equal(node.severity, "INFO"); });
check("BUILD not connected is informational not critical", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"BUILD", state:"NOT_CONNECTED" })).severity, "INFO"));
check("PROD not connected is critical", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"PROD", state:"NOT_CONNECTED", readOnly:true })).severity, "CRITICAL"));
check("PROD degraded availability is critical", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"PROD", state:"DEGRADED", readOnly:true })).severity, "CRITICAL"));
check("DB degraded availability is critical", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"DATABASE", state:"DEGRADED", readOnly:true })).severity, "CRITICAL"));
check("DB not connected is critical", () => assert.equal(severity.evaluateInfrastructureNode(baseNode({ kind:"DATABASE", state:"NOT_CONNECTED", readOnly:true })).severity, "CRITICAL"));
check("overall aggregation promotes critical node", () => { const nodes=[severity.evaluateInfrastructureNode(baseNode()),severity.evaluateInfrastructureNode(baseNode({id:"bad",kind:"PROD",state:"NOT_CONNECTED"}))]; const o=severity.aggregateInfrastructureHealth(nodes); assert.equal(o.severity,"CRITICAL"); assert.equal(o.state,"BLOCKED"); assert.equal(o.counts.CRITICAL,1); });
check("alerts contain only warning and critical nodes", () => { const nodes=[severity.evaluateInfrastructureNode(baseNode()),severity.evaluateInfrastructureNode(baseNode({id:"i",state:"PLANNED",kind:"AI",quality:"REGISTRY_ONLY",sampledAt:null})),severity.evaluateInfrastructureNode(baseNode({id:"w",metrics:{diskPercent:91}}))]; const alerts=severity.infrastructureHealthAlerts(nodes); assert.deepEqual(alerts.map((x)=>x.nodeId),["w"]); });

check("Supabase monitoring secret is admin-only validated and never returned", () => { assert.match(supabaseConfig, /analytics_usage_read/); assert.match(supabaseConfig, /mode: 0o600/); assert.match(supabaseConfig, /usage\.api-counts/); assert.match(supabaseConfig, /usage\.api-requests-count/); assert.doesNotMatch(supabaseConfig, /SUPABASE_SERVICE_ROLE_KEY/); assert.match(supabaseRoute, /isLicenseAdminAuthorized/); assert.doesNotMatch(supabaseRoute, /token:\s*body\.token|validated:\s*\{[^}]*token/); });
console.log(`Developer Grid Health Core V2 contract PASS · ${n}/${n}`);
