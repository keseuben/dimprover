#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(process.env.DIMPRO_PROJECT_ROOT?.trim() || process.cwd());
const coordinationRoot = process.env.DIMPRO_COORDINATION_ROOT?.trim() || (root.startsWith("/srv/dimpro-dev/") ? "/srv/dimpro-dev/coordination" : path.join(root, ".dimprover"));
const leaseDir = path.join(coordinationRoot, "worker-presence-leases");
const valid = new Set(["ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"]);
function text(v){return typeof v === "string" ? v.trim() : "";}
function normalize(v){const c=text(v).toUpperCase().replace(/[^A-Z]/g,""); if(c==="MFORGEAI")return "MFORGE"; if(c==="VGUARDAI")return "VGUARD"; return valid.has(c)?c:"";}
function arg(name){const i=process.argv.indexOf(`--${name}`); return i>=0 ? text(process.argv[i+1]) : "";}
const action=text(process.argv[2]||"claim").toLowerCase();
const workerCode=normalize(arg("worker") || process.env.DIMPRO_WORKER_CODE);
if(!workerCode){console.error("Használat: benjadmin-worker-presence.mjs <claim|heartbeat|release> --worker ARMINAI|JAZMINAI|OUTMINAI|MFORGE|VGUARD [--task ...]");process.exit(64);}
fs.mkdirSync(leaseDir,{recursive:true,mode:0o700});
const file=path.join(leaseDir,`${workerCode}.json`);
let current={};try{current=JSON.parse(fs.readFileSync(file,"utf8"));}catch{}
if(action==="release"){
  try{fs.unlinkSync(file);}catch{}
  console.log(JSON.stringify({ok:true,workerCode,state:"RELEASED",productionAccess:"DENY"}));process.exit(0);
}
if(!["claim","heartbeat"].includes(action)){console.error(`Ismeretlen action: ${action}`);process.exit(64);}
const now=new Date();
const ttlMinutes=Math.max(3,Math.min(240,Number(arg("ttl")||15)));
const lease={
  schemaVersion:1, leaseId:text(current.leaseId)||crypto.randomUUID(), workerCode,
  state:"ACTIVE", startedAt:text(current.startedAt)||now.toISOString(), heartbeatAt:now.toISOString(), expiresAt:new Date(now.getTime()+ttlMinutes*60_000).toISOString(),
  taskId:arg("task")||text(current.taskId)||null, projectId:arg("project")||text(current.projectId)||null,
  phase:arg("phase")||text(current.phase)||"coding", summary:arg("summary")||text(current.summary)||null,
  detail:arg("detail")||text(current.detail)||null, mainModule:arg("main-module")||text(current.mainModule)||null,
  moduleName:arg("module")||text(current.moduleName)||null, submoduleName:arg("submodule")||text(current.submoduleName)||null,
  workItem:arg("work-item")||text(current.workItem)||null, operation:arg("operation")||text(current.operation)||null,
  owner:arg("owner")||text(current.owner)||null, worktree:root, branch:"", productionAccess:"DENY"
};
try{lease.branch=requireBranch();}catch{}
function requireBranch(){const cp=process.getBuiltinModule("node:child_process");return cp.execFileSync("git",["-C",root,"branch","--show-current"],{encoding:"utf8",timeout:3000}).trim();}
const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,`${JSON.stringify(lease,null,2)}\n`,{mode:0o600});fs.renameSync(tmp,file);fs.chmodSync(file,0o600);
console.log(JSON.stringify({ok:true,workerCode,state:"ACTIVE",leaseId:lease.leaseId,expiresAt:lease.expiresAt,productionAccess:"DENY"}));
