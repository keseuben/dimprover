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
const facade = read("app/lib/developer-grid/system-health.ts");
let n = 0;
const check = (label, fn) => { fn(); n += 1; console.log(`PASS ${String(n).padStart(2, "0")} ${label}`); };

function loadSeverityModule() {
  const js = ts.transpileModule(severitySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", js)(module.exports, module, require);
  return module.exports;
}

const severity = loadSeverityModule();
const baseNode = (overrides = {}) => ({
  id: "test", label: "TEST", kind: "DEV", state: "READY", severity: "OK", reason: "ok",
  sampledAt: new Date().toISOString(), staleAfterMs: 60_000, stale: false, readOnly: false,
  metrics: {}, capabilities: [], source: "TEST", quality: "LIVE", ...overrides,
});

check("V2 model defines all infrastructure kinds", () => { for (const kind of ["DEV","BUILD","PROD","DATABASE","STORAGE","AI"]) assert.ok(model.includes(`\"${kind}\"`)); });
check("V2 model defines state and severity vocabulary", () => { for (const value of ["READY","BUSY","DEGRADED","BLOCKED","NOT_CONNECTED","OFFLINE","UNKNOWN","PLANNED","OK","INFO","WARNING","CRITICAL"]) assert.ok(model.includes(`\"${value}\"`)); });
check("V2 node includes stale quality source and readOnly fields", () => { for (const field of ["staleAfterMs","stale:","readOnly:","source:","quality:","capabilities:"]) assert.ok(model.includes(field)); });
check("DIMPROMIN adapter contract is sanitized and health-only", () => { assert.match(model, /DimprominAiHealthAdapter/); assert.match(model, /DimprominAiHealthMetrics/); for (const key of ["gpuType","vramUsedBytes","loadedModel","queueDepth","tokensPerSecond"]) assert.ok(model.includes(key)); for (const forbidden of ["prompt:","conversation:","apiKey:","password:","connectionString:","requestPayload:","responsePayload:"]) assert.ok(!model.includes(forbidden)); });
check("DIMPROMIN adapter sanitizes only allowlisted health metrics", () => { assert.match(ai, /AI_METRIC_KEYS/); assert.match(ai, /sanitizeDimprominMetrics/); assert.match(ai, /item\.slice\(0, 160\)/); assert.doesNotMatch(ai, /prompt|conversation|apiKey|password|connectionString|requestPayload|responsePayload/i); });
check("operational context exposes safe fields only", () => { assert.match(operationsSource, /SAFE_OPERATION_FIELDS/); for (const key of ["status","operation","owner","task","target","workerCode","host","pid","startedAt","finishedAt","exitCode","event"]) assert.ok(operationsSource.includes(`"${key}"`)); assert.doesNotMatch(operationsSource, /"command"|"token"|"apiKey"|"password"|connectionString/i); });
check("operational context is read-only lock/runtime diagnostics", () => { assert.match(operationsSource, /exclusive-operation\.lock/); assert.match(operationsSource, /flock/); assert.match(operationsSource, /probeLocalTcp/); assert.doesNotMatch(operationsSource, /restart|deploy|pm2 restart|systemctl restart/i); });
check("V2 response keeps legacy servers and storage compatibility", () => { assert.match(model, /servers: LegacyHealthServer\[\]/); assert.match(model, /storage: LegacyHealthStorage\[\]/); });
check("registry includes DEV BUILD PROD DB STORAGE AI", () => { for (const id of ["dev-vps","build01","build02","prod-vps","db-vps","dev-root","drive-storage","drop-storage","backup-storage","artifact-storage","dimpromin-ai-01","dimpromin-ai-02"]) assert.ok(registry.includes(`id: \"${id}\"`)); });
check("DIMPROMIN nodes are registry-driven planned AI nodes", () => { assert.match(registry, /dimpromin-ai-01[\s\S]*kind: \"AI\"[\s\S]*planned: true/); assert.match(registry, /dimpromin-ai-02[\s\S]*kind: \"AI\"[\s\S]*planned: true/); });
check("storage registry includes Drive Drop backup and artifact placeholders", () => { for (const id of ["drive-storage","drop-storage","backup-storage","artifact-storage"]) assert.ok(registry.includes(`id: "${id}"`)); });
check("planned AI metrics are explicit null health fields", () => { for (const key of ["gpuType","gpuUtilPercent","vramTotalBytes","vramUsedBytes","loadedModel","queueDepth","tokensPerSecond","modelState"]) assert.ok(registry.includes(`${key}: null`)); });
check("PROD and DB registry nodes are read only", () => { assert.match(registry, /prod-vps[\s\S]*kind: \"PROD\"[\s\S]*readOnly: true/); assert.match(registry, /db-vps[\s\S]*kind: \"DATABASE\"[\s\S]*readOnly: true/); });
check("adapter normalizes legacy servers and storage", () => { assert.match(adapters, /normalizeHealthServer/); assert.match(adapters, /normalizeHealthStorage/); assert.match(adapters, /normalizeInfrastructureNodes/); });
check("adapter never invents missing build metrics", () => { assert.match(adapters, /memoryPercent: metrics\.memoryPercent/); assert.match(adapters, /diskPercent: metrics\.diskPercent/); });
check("facade publishes schemaVersion 2 and normalized nodes", () => { assert.match(facade, /schemaVersion: 2/); assert.match(facade, /nodes, overall: aggregateInfrastructureHealth\(nodes\), alerts: infrastructureHealthAlerts\(nodes\), operations, servers, storage/); });
check("facade integrates optional DIMPROMIN adapter and operational context", () => { assert.match(facade, /applyDimprominAiAdapter/); assert.match(facade, /getInfrastructureOperationalContext/); assert.match(facade, /aiAdapter: DimprominAiHealthAdapter/); });
check("facade keeps 30 60 300 second cache policy and AI 30 second base", () => { assert.match(facade, /SERVER_TTL_MS = 30_000/); assert.match(facade, /PROTECTED_SERVER_TTL_MS = 60_000/); assert.match(facade, /DISK_TTL_MS = 60_000/); assert.match(facade, /STORAGE_TTL_MS = 300_000/); assert.match(facade, /AI_TTL_MS = 30_000/); });
check("facade collects Linux memory PSI", () => { assert.match(facade, /\/proc\/pressure\/memory/); assert.match(facade, /memoryPsiSomeAvg60/); assert.match(facade, /memoryPsiFullAvg60/); });
check("health core still has no Supabase polling", () => { for (const source of [facade, adapters, registry, severitySource]) assert.doesNotMatch(source, /@supabase|createClient\(|\.from\(/i); });
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

console.log(`Developer Grid Health Core V2 contract PASS · ${n}/${n}`);
