#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

const expectedHost = "dimpro-dev";
const baseEnv = "/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35/.env.local";
const canonicalEnv = "/srv/dimpro-dev/worktrees/drop-v1212-gyorssend/.env.local";
const consensusEnvs = [
  canonicalEnv,
  "/srv/dimpro-dev/worktrees/dimpro-one-health-v1/.env.local",
  "/srv/dimpro-dev/worktrees/diag-health-v019-ts/.env.local",
];
const targetDir = process.env.PROJECTKAPU_PILOT_CANDIDATE_DIR?.trim()
  || "/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot";
const targetEnv = join(targetDir, ".env.local");
const secretKeys = ["DROP_TOKEN_HMAC_SECRET","DROP_SESSION_SECRET","DROP_WORKER_SECRET"];
const stagedValues = {
  DROP_RELEASE_GATE_ENABLED: "true",
  DROP_PACKAGE_ENGINE_ENABLED: "true",
  DROP_ACCESS_GATE_ENABLED: "true",
  DROP_EMAIL_NOTIFICATIONS_ENABLED: "false",
  DROP_STORAGE_CORE_ENABLED: "true",
  DROP_QUARANTINE_UPLOAD_ENABLED: "true",
  DROP_SUBMISSION_GATE_ENABLED: "true",
  DROP_DRIVE_INCOMING_ENABLED: "true",
  DROP_SUBMISSION_GATE_DELIVERY_MODE: "manual-link",
  DROP_IMAGE_DROP_ENABLED: "true",
  DROP_FILE_DROP_ENABLED: "true",
  DROP_ZIP_UPLOAD_ENABLED: "true",
  DROP_MIXED_PACKAGE_ENABLED: "true",
  DIMPRO_DROP_VIRUS_SCANNER_COMMAND: "clamd-instream",
  DIMPRO_DROP_STORAGE_MODE: "active",
};

function fail(code, message) {
  console.error(JSON.stringify({ok:false,code,message},null,2));
  process.exit(2);
}
function parseEnv(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const raw of readFileSync(file,"utf8").split(/\r?\n/)) {
    if (!raw || raw.lstrip?.()?.startsWith?.("#")) continue;
    const at=raw.indexOf("=");
    if(at<=0) continue;
    map.set(raw.slice(0,at).trim(), raw.slice(at+1));
  }
  return map;
}
function parseEnvSafe(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const raw of readFileSync(file,"utf8").split(/\r?\n/)) {
    const trimmed=raw.trim();
    if(!trimmed || trimmed.startsWith("#")) continue;
    const at=raw.indexOf("=");
    if(at<=0) continue;
    map.set(raw.slice(0,at).trim(), raw.slice(at+1));
  }
  return map;
}
function upsert(lines,key,value) {
  const prefix=key+"=";
  const index=lines.findIndex((line)=>line.startsWith(prefix));
  const row=prefix+value;
  if(index>=0) lines[index]=row;
  else lines.push(row);
}

if(hostname()!==expectedHost) fail("PROJECTKAPU_PILOT_HOST_MISMATCH","Candidate staging may run only on dimpro-dev.");
if(!existsSync(baseEnv)) fail("PROJECTKAPU_PILOT_BASE_ENV_MISSING","Base DEV env is missing.");
for(const file of consensusEnvs) if(!existsSync(file)) fail("PROJECTKAPU_PILOT_SECRET_REFERENCE_MISSING","A canonical DEV secret reference env is missing.");

const refs=consensusEnvs.map(parseEnvSafe);
for(const key of secretKeys){
  const vals=refs.map((m)=>m.get(key)||"");
  if(vals.some((v)=>v.length<32)) fail("PROJECTKAPU_PILOT_SECRET_REFERENCE_INVALID",`DEV secret consensus is incomplete for ${key}.`);
  if(new Set(vals).size!==1) fail("PROJECTKAPU_PILOT_SECRET_CONSENSUS_FAILED",`DEV secret references disagree for ${key}.`);
}

mkdirSync(targetDir,{recursive:true,mode:0o700});
chmodSync(targetDir,0o700);
if(existsSync(targetEnv)){
  const backup=join(targetDir,`.env.local.before-${new Date().toISOString().replace(/[-:.]/g,"").replace("Z","Z")}`);
  copyFileSync(targetEnv,backup);
  chmodSync(backup,0o600);
}
const lines=readFileSync(baseEnv,"utf8").split(/\r?\n/);
for(const key of secretKeys) upsert(lines,key,refs[0].get(key));
for(const [key,value] of Object.entries(stagedValues)) upsert(lines,key,value);
const tmp=targetEnv+".tmp";
writeFileSync(tmp,lines.join("\n").replace(/\n+$/,"")+"\n",{mode:0o600});
chmodSync(tmp,0o600);
renameSync(tmp,targetEnv);
chmodSync(targetEnv,0o600);

console.log(JSON.stringify({
  ok:true,
  environment:"DEV",
  productionAccess:"DENY",
  targetEnv,
  secretConsensus:true,
  secretKeysStaged:secretKeys,
  nonSecretKeysStaged:Object.keys(stagedValues),
  note:"No runtime env, process, database or PROD configuration was modified."
},null,2));
