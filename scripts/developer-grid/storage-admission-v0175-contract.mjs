import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRuntimeRetention, evaluateStorageAdmission, operationReserveGiB } from "./dev-storage-admission.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/dimpro-dev-storage-retention.json"), "utf8"));
const dispatch = fs.readFileSync(path.join(root, "scripts/developer-grid/remote-build-dispatch.mjs"), "utf8");
const windows = fs.readFileSync(path.join(root, "scripts/developer-grid/package-windows.sh"), "utf8");
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));

const GiB = 1024 ** 3;
let n=0;
const check=(label,fn)=>{fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop version v0.1.75",()=>assert.equal(pkg.version,"0.1.86"));
check("backend version v0.1.75-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.86-dev"/));
check("hard minimum remains 15 GiB",()=>assert.equal(config.preBuildHardMinFreeGiB,15));
check("remote FULL BUILD dispatch reserves only DEV-side transfer space",()=>assert.equal(operationReserveGiB(config,"remote-build"),1));
check("local small build fallback keeps larger DEV reserve",()=>assert.equal(operationReserveGiB(config,"local-small-build"),3));
check("windows package reserve is 1 GiB",()=>assert.equal(operationReserveGiB(config,"windows-package"),1));
check("runtime admission allows at most three online candidates",()=>{
  assert.equal(config.developerGridAdmission.maxOnlineRuntimeCandidatesBeforeBuild,3);
  assert.equal(evaluateRuntimeRetention({onlineCount:3,maxOnline:3}).ok,true);
  const blocked=evaluateRuntimeRetention({onlineCount:4,maxOnline:3});
  assert.equal(blocked.ok,false); assert.equal(blocked.reason,"RUNTIME_RETENTION_LIMIT");
});
check("remote build dispatch requires 16 GiB free before admission",()=>{
  const ok=evaluateStorageAdmission({freeBytes:16*GiB,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:1,emergencyUsedPercent:90});
  const blocked=evaluateStorageAdmission({freeBytes:16*GiB-1,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:1,emergencyUsedPercent:90});
  assert.equal(ok.ok,true); assert.equal(ok.projectedFreeBytes,15*GiB);
  assert.equal(blocked.ok,false); assert.ok(blocked.reasons.includes("PROJECTED_FREE_BELOW_HARD_MIN"));
});
check("local small build requires 18 GiB free before admission",()=>{
  const ok=evaluateStorageAdmission({freeBytes:18*GiB,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:3,emergencyUsedPercent:90});
  const blocked=evaluateStorageAdmission({freeBytes:18*GiB-1,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:3,emergencyUsedPercent:90});
  assert.equal(ok.ok,true); assert.equal(blocked.ok,false);
});
check("windows package requires 16 GiB free before admission",()=>{
  const ok=evaluateStorageAdmission({freeBytes:16*GiB,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:1,emergencyUsedPercent:90});
  const blocked=evaluateStorageAdmission({freeBytes:16*GiB-1,totalBytes:100*GiB,hardMinGiB:15,reserveGiB:1,emergencyUsedPercent:90});
  assert.equal(ok.ok,true); assert.equal(ok.projectedFreeBytes,15*GiB);
  assert.equal(blocked.ok,false);
});
check("emergency usage independently blocks",()=>{
  const r=evaluateStorageAdmission({freeBytes:9*GiB,totalBytes:100*GiB,hardMinGiB:1,reserveGiB:1,emergencyUsedPercent:90});
  assert.equal(r.ok,false); assert.ok(r.reasons.includes("EMERGENCY_USED_PERCENT"));
});
check("remote dispatch runs storage cleanup/admission before local artifact directory",()=>{
  const sourceValidation=dispatch.indexOf("if(actualHead!==sourceCommit)");
  const pre=dispatch.indexOf("execFileSync(STORAGE_PREBUILD");
  const admission=dispatch.indexOf('STORAGE_ADMISSION, "--operation", "remote-build"');
  const local=dispatch.indexOf("fs.mkdirSync(LOCAL_ROOT");
  assert.ok(sourceValidation>0 && pre>sourceValidation && admission>pre && local>admission);
});
check("remote dispatch maps storage failure to explicit block code",()=>assert.match(dispatch,/DEV_STORAGE_ADMISSION_BLOCKED/));
check("remote dispatch keeps stdout JSON-only during storage gates",()=>{
  assert.match(dispatch,/execFileSync\(STORAGE_PREBUILD, \[\], \{ stdio:\["ignore","ignore","inherit"\]/);
  assert.match(dispatch,/execFileSync\(process\.execPath, \[STORAGE_ADMISSION, "--operation", "remote-build"\], \{ stdio:\["ignore","ignore","inherit"\]/);
});
check("windows admission runs before preflight PASS and desktop checks",()=>{
  const admission=windows.indexOf('node "$STORAGE_ADMISSION" --operation windows-package');
  const preflight=windows.indexOf('if [[ "${1:-}" == "--preflight-only" ]]');
  const checks=windows.indexOf("npm run check");
  assert.ok(admission>0 && preflight>admission && checks>preflight);
});
check("windows storage failure is explicit exit 75",()=>assert.match(windows,/WINDOWS_STORAGE_ADMISSION_BLOCKED" 75/));
check("source contains PM2 runtime retention inventory",()=>assert.match(fs.readFileSync(path.join(root,"scripts/developer-grid/dev-storage-admission.mjs"),"utf8"),/RUNTIME_RETENTION_LIMIT/));
check("storage admission remains DEV/PROD DENY",()=>{
  assert.match(dispatch,/STORAGE_ADMISSION/);
  assert.match(windows,/PROD_DENY/);
});

console.log("Developer Grid storage admission v0.1.75 contract PASS · "+n+"/"+n);
