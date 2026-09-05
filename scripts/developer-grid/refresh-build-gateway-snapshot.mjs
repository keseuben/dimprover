#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getBuildGatewayNodes } from "./build-gateway-client.mjs";

const SOURCE = "DIMPRO_MCP_SSH_GATEWAY";
const ENVIRONMENT = "DEV";
const PRODUCTION_ACCESS = "DENY";
const DEFAULT_SNAPSHOT = "/srv/dimpro-dev/coordination/health-snapshots/build-nodes.json";
const SNAPSHOT_FILE = process.env.BENJADMIN_BUILD_NODE_SNAPSHOT_FILE?.trim() || DEFAULT_SNAPSHOT;
const NODES = [
  { id: "build01", hostname: "build01.dimpro.hu" },
  { id: "build02", hostname: "build02.dimpro.hu" },
];
const METRIC_NUMERIC_KEYS = [
  "cpuPercent", "load1", "cores",
  "memoryTotalBytes", "memoryUsedBytes", "memoryAvailableBytes", "memoryPercent",
  "swapTotalBytes", "swapUsedBytes", "swapMinimumBytes", "swapPercent",
  "diskTotalBytes", "diskUsedBytes", "diskAvailableBytes", "diskPercent",
  "uptimeSeconds",
];
const METRIC_STRING_KEYS = ["storageGovernor", "nodeVersion", "npmVersion", "gitVersion", "architecture", "kernel"];

function isObject(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function finiteNonNegative(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function safeText(value, max = 160) { return typeof value === "string" && value.length > 0 && value.length <= max ? value : null; }
function validIso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null; }
function unavailable(definition, reason) {
  return { schemaVersion:1,id:definition.id,hostname:definition.hostname,state:"NOT_CONNECTED",reason,lastVerifiedAt:new Date().toISOString(),source:SOURCE,quality:"UNKNOWN",metrics:null };
}
function sanitizeNode(raw, definition) {
  if (!isObject(raw)) return unavailable(definition, "Gateway health válasz nem objektum.");
  const allowedStates = new Set(["READY","BUSY","BLOCKED","NOT_CONNECTED","DEGRADED"]);
  if (raw.schemaVersion !== 1 || raw.id !== definition.id || raw.hostname !== definition.hostname || raw.source !== SOURCE || raw.quality !== "LIVE" || !allowedStates.has(raw.state) || !validIso(raw.lastVerifiedAt) || !isObject(raw.metrics)) {
    return unavailable(definition, "Gateway health válasz szerződése érvénytelen.");
  }
  const metrics = {};
  for (const key of METRIC_NUMERIC_KEYS) { const value=finiteNonNegative(raw.metrics[key]); if (value===null) return unavailable(definition, `Gateway metric hiányzik: ${key}.`); metrics[key]=value; }
  if (raw.metrics.buildLockHeld !== true && raw.metrics.buildLockHeld !== false) return unavailable(definition, "Gateway buildLockHeld metric érvénytelen.");
  if (raw.metrics.toolchainReady !== true && raw.metrics.toolchainReady !== false) return unavailable(definition, "Gateway toolchainReady metric érvénytelen.");
  metrics.buildLockHeld=raw.metrics.buildLockHeld; metrics.toolchainReady=raw.metrics.toolchainReady;
  if (raw.metrics.currentRunId === null) metrics.currentRunId=null; else { const value=safeText(raw.metrics.currentRunId,128); if(!value)return unavailable(definition,"Gateway currentRunId metric érvénytelen."); metrics.currentRunId=value; }
  if (raw.metrics.queueDepth === null) metrics.queueDepth=null; else { const value=finiteNonNegative(raw.metrics.queueDepth); if(value===null)return unavailable(definition,"Gateway queueDepth metric érvénytelen."); metrics.queueDepth=value; }
  for (const key of METRIC_STRING_KEYS) { const value=safeText(raw.metrics[key],key==="kernel"?64:32); if(!value)return unavailable(definition,`Gateway metric hiányzik: ${key}.`); metrics[key]=value; }
  return { schemaVersion:1,id:definition.id,hostname:definition.hostname,state:raw.state==="DEGRADED"?"BLOCKED":raw.state,reason:safeText(raw.reason,240)||"MCP Build Transport Gateway health minta.",lastVerifiedAt:raw.lastVerifiedAt,source:SOURCE,quality:"LIVE",metrics };
}
function atomicWrite(file,payload){const directory=path.dirname(file);fs.mkdirSync(directory,{recursive:true,mode:0o750});const temp=path.join(directory,`.build-nodes.${process.pid}.${Date.now()}.tmp`);fs.writeFileSync(temp,`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",mode:0o640,flag:"wx"});fs.chmodSync(temp,0o640);fs.renameSync(temp,file);}

let gateway;
try { gateway=await getBuildGatewayNodes(); }
catch (error) {
  const sampledAt=new Date().toISOString();
  const snapshot={schemaVersion:1,environment:ENVIRONMENT,productionAccess:PRODUCTION_ACCESS,source:SOURCE,sampledAt,nodes:NODES.map((node)=>unavailable(node,"MCP Build Transport Gateway health lekérés sikertelen."))};
  atomicWrite(SNAPSHOT_FILE,snapshot);
  console.error(error instanceof Error ? error.message : "Build gateway health hiba.");
  console.log(JSON.stringify({ok:false,environment:ENVIRONMENT,productionAccess:PRODUCTION_ACCESS,sampledAt,snapshotFile:SNAPSHOT_FILE,nodes:snapshot.nodes.map((node)=>({id:node.id,state:node.state,quality:node.quality}))},null,2));
  process.exitCode=2;
  process.exit();
}
const remote=gateway?.snapshot;
if (!isObject(remote) || remote.schemaVersion!==1 || remote.environment!==ENVIRONMENT || remote.productionAccess!==PRODUCTION_ACCESS || remote.source!==SOURCE || !Array.isArray(remote.nodes) || !validIso(remote.sampledAt)) throw new Error("A Build Transport Gateway snapshot szerződése érvénytelen.");
const nodes=NODES.map((definition)=>sanitizeNode(remote.nodes.find((node)=>node?.id===definition.id),definition));
const snapshot={schemaVersion:1,environment:ENVIRONMENT,productionAccess:PRODUCTION_ACCESS,source:SOURCE,sampledAt:remote.sampledAt,nodes};
atomicWrite(SNAPSHOT_FILE,snapshot);
console.log(JSON.stringify({ok:true,environment:ENVIRONMENT,productionAccess:PRODUCTION_ACCESS,sampledAt:snapshot.sampledAt,snapshotFile:SNAPSHOT_FILE,nodes:nodes.map((node)=>({id:node.id,state:node.state,quality:node.quality}))},null,2));
