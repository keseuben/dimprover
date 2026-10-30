import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DELIVERY_ROOT = "/srv/dimpro-dev/coordination/developer-grid/dev-deliveries";
const WORKTREES = "/srv/dimpro-dev/worktrees/";
const NGINX = "/etc/nginx/sites-enabled/dimpro-dev.conf";
const SITE = "https://drive.dev.dimpro.hu";
const START = "# DIMPRO_DRIVE_DEV_CANDIDATE_18BD6E76_START";
const END = "# DIMPRO_DRIVE_DEV_CANDIDATE_18BD6E76_END";
export const sha = data => crypto.createHash("sha256").update(data).digest("hex");
export function atomic(file, value) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
}
function json(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function cmd(file, args, options = {}) {
  const r = spawnSync(file, args, { encoding: "utf8", timeout: 30000, maxBuffer: 4*1024*1024, ...options });
  // Do not copy arbitrary subprocess output or environment into public evidence.
  assert.equal(r.status, 0, `DEV_DELIVERY_COMMAND_FAILED:${path.basename(file)}`);
  return r.stdout;
}
export function validateArtifact(record, meta, result) {
  for (const p of [meta, result]) {
    for (const k of ["sourceCommit", "sourceBranch", "buildId", "artifactSha256"]) assert.equal(p[k], record[k], `ARTIFACT_${k}_MISMATCH`);
    assert.equal(p.environment, "DEV"); assert.equal(p.productionAccess, "DENY"); assert.equal(p.runId, record.buildRunId);
  }
  for (const k of ["taskId", "sessionId", "workerCode"]) assert.equal(meta[k], record[k], `ARTIFACT_${k}_MISMATCH`);
  assert.equal(result.status, "PASS"); assert.ok(["build01", "build02"].includes(result.nodeId)); assert.equal(meta.runner.id, result.nodeId);
}
export function planDriveRouting(original, port, record, version) {
  assert.ok(Number.isInteger(port) && port >= 3460 && port <= 3479);
  assert.match(record.sourceCommit, /^[0-9a-f]{40}$/); assert.match(record.buildId, /^[A-Za-z0-9_-]{1,180}$/);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const a = original.indexOf(START), b = original.indexOf(END, a);
  assert.ok(a >= 0 && b > a && original.indexOf(START, a+1) < 0 && original.indexOf(END, b+1) < 0, "DEV_VHOST_BOUNDARY_INVALID");
  const section = original.slice(a,b);
  assert.equal((section.match(/server_name drive\.dev\.dimpro\.hu;/g) || []).length, 2);
  assert.equal((section.match(/proxy_pass http:\/\/127\.0\.0\.1:\d+;/g) || []).length, 1);
  let next = section.replace(/proxy_pass http:\/\/127\.0\.0\.1:\d+;/, `proxy_pass http://127.0.0.1:${port};`);
  for (const [key, value] of [["X-DIMPRO-Drive-Source", record.sourceCommit], ["X-DIMPRO-Drive-Build", record.buildId], ["X-DIMPRO-Drive-Candidate", `${record.sourceCommit.slice(0,9)} DRIVE V${version} GRID DEV`]]) {
    const re = new RegExp(`add_header ${key} "[^"\\n]*" always;`, "g");
    assert.equal((next.match(re) || []).length, 1, `DEV_VHOST_HEADER_INVALID:${key}`);
    next = next.replace(re, `add_header ${key} "${value}" always;`);
  }
  assert.ok(next.includes('add_header X-DIMPRO-Production-Access "DENY" always;'));
  return original.slice(0,a) + next + original.slice(b);
}
export function allowedRoutingWrite(current, baseline, desired) {
  assert.ok(current === baseline || current === desired, "DEV_ROUTING_CHANGED_EXTERNALLY");
  return current !== desired;
}
function nginxWrite(content) {
  const file = fs.realpathSync(NGINX);
  assert.ok(["/etc/nginx/sites-available/dimpro-dev.conf", NGINX].includes(file));
  const tmp = `${file}.grid-dev-delivery.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, content, { mode: fs.statSync(file).mode & 0o777, flag: "wx" });
  fs.renameSync(tmp, file);
  cmd("nginx", ["-t"]); cmd("systemctl", ["reload", "nginx"]);
}
function processes() { return JSON.parse(cmd("pm2", ["jlist"])); }
function envFor(p) {
  assert.ok(p?.pid > 1 && p.pm2_env.status === "online", "DEV_RUNTIME_NOT_ONLINE");
  return Object.fromEntries(fs.readFileSync(`/proc/${p.pid}/environ`, "utf8").split("\0").filter(Boolean).map(x => { const i=x.indexOf("="); return [x.slice(0,i),x.slice(i+1)]; }));
}
function routingPort(original) {
  const a=original.indexOf(START),b=original.indexOf(END,a);
  assert.ok(a>=0&&b>a);const matches=[...original.slice(a,b).matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+);/g)];
  assert.equal(matches.length,1);return Number(matches[0][1]);
}
function runtimeAt(port) {
  const matches=processes().filter(p=>p.pm2_env.status==="online").filter(p=>{try{return envFor(p).PORT===String(port);}catch{return false;}});
  assert.equal(matches.length,1,"DEV_RUNTIME_PORT_IDENTITY_AMBIGUOUS");return matches[0];
}
function protectedFingerprint(env) {
  const keys=Object.keys(env).filter(k=>/^(NEXT_PUBLIC_|SUPABASE_|DIMPRO_AUTH_|DIMPRO_DRIVE_|DIMPRO_DROP_|DRIVE_DEV_|DRIVE_PILOT_)/.test(k)).sort();
  return sha(JSON.stringify(keys.map(k=>[k,env[k]])));
}
function assertSession(record) {
  const s=json(path.join(DELIVERY_ROOT,"../state.json")).sessions.find(s=>s.id===record.sessionId&&s.taskId===record.taskId&&s.workerCode===record.workerCode&&s.endedAt===null);
  assert.ok(s&&s.developmentContext.devDeliveryTarget==="DRIVE_DEV"&&s.developmentContext.bootAckState==="VALIDATED"&&s.developmentContext.workStageIndex===6,"DELIVERY_SESSION_STALE");
  assert.equal(s.sourceProvenance.head,record.sourceCommit);assert.equal(s.sourceProvenance.branch,record.sourceBranch);
  const source=fs.realpathSync(s.sourceProvenance.worktree);assert.ok(source.startsWith(WORKTREES)&&!source.includes("/../"));
  assert.equal(cmd("git",["rev-parse","HEAD"],{cwd:source}).trim(),record.sourceCommit);
  assert.equal(cmd("git",["branch","--show-current"],{cwd:source}).trim(),record.sourceBranch);
  assert.equal(cmd("git",["status","--porcelain"],{cwd:source}).trim(),"");
  const runs=json(path.join(DELIVERY_ROOT,"../build-runs.json")).runs.filter(r=>r.taskId===record.taskId&&r.sessionId===record.sessionId&&r.workerCode===record.workerCode).sort((a,b)=>Date.parse(b.queuedAt)-Date.parse(a.queuedAt));
  assert.equal(runs[0]?.id,record.buildRunId);assert.equal(runs[0]?.status,"PASS");
  for(const k of ["sourceCommit","sourceBranch","buildId","artifactSha256"])assert.equal(runs[0][k],record[k]);
  return source;
}
async function freePort() {
  for(let port=3460;port<=3479;port++)if(await new Promise(resolve=>{const s=net.createServer();s.once("error",()=>resolve(false));s.listen(port,"127.0.0.1",()=>s.close(()=>resolve(true)));}))return port;
  throw Error("DEV_CANDIDATE_NO_FREE_PORT");
}
async function get(url) {
  const r=await fetch(url,{headers:{host:"drive.dev.dimpro.hu","x-forwarded-proto":"https"},redirect:"manual",signal:AbortSignal.timeout(20000)});
  const bytes=Buffer.from(await r.arrayBuffer());const location=r.headers.get("location");
  const u=location?new URL(location,SITE):null;
  return {status:r.status,location:u?u.origin+u.pathname:null,sha256:sha(bytes),bytes,source:r.headers.get("x-dimpro-drive-source"),build:r.headers.get("x-dimpro-drive-build"),productionAccess:r.headers.get("x-dimpro-production-access")};
}
function publicResult(r){const {bytes,...value}=r;return value;}
async function smoke(record, publicSite=false) {
  const base=publicSite?SITE:`http://127.0.0.1:${record.port}`;
  const p=runtimeAt(record.port),env=envFor(p);
  assert.equal(p.name,record.processName);assert.equal(env.HOSTNAME,"127.0.0.1");assert.equal(env.DIMPRO_PRODUCTION_ACCESS,"DENY");
  assert.equal(env.DIMPRO_RELEASE_SOURCE_COMMIT,record.sourceCommit);assert.equal(env.DIMPRO_RELEASE_BUILD_ID,record.buildId);
  assert.equal(protectedFingerprint(env),record.environmentFingerprint,"DEV_ENVIRONMENT_CHANGED");
  assert.equal(fs.realpathSync(`/proc/${p.pid}/cwd`),path.join(record.runtimeRoot,"release/.next/standalone"));
  const result=[];
  for(const route of ["/","/login","/api/drive/health",record.asset]) {
    const r=await get(base+route);
    assert.ok([200,301,302,303,307,308,401,403].includes(r.status),`DEV_SMOKE_HTTP_FAILED:${route}`);
    if(route===record.asset){assert.equal(r.status,200);assert.equal(r.sha256,record.assetSha256);}
    else {const baseline=record.httpBaseline[route];assert.equal(r.status,baseline.status);assert.equal(r.location,baseline.location);}
    if(publicSite){assert.equal(r.source,record.sourceCommit);assert.equal(r.build,record.buildId);assert.equal(r.productionAccess,"DENY");}
    result.push({route,...publicResult(r)});
  }
  return result;
}
function rollback(record) {
  const original=fs.readFileSync(path.join(record.runtimeRoot,"nginx.before"),"utf8"),desired=fs.readFileSync(path.join(record.runtimeRoot,"nginx.after"),"utf8"),current=fs.readFileSync(NGINX,"utf8");
  allowedRoutingWrite(current,original,desired); // Never overwrite another operator's configuration.
  assert.equal(envFor(runtimeAt(record.oldPort)).PORT,String(record.oldPort));
  nginxWrite(original);
  return {...record,status:"ROLLED_BACK",code:record.code||"DEV_BROWSER_CHECK_FAILED",updatedAt:new Date().toISOString()};
}

export async function runDelivery(id) {
  assert.equal(os.hostname(),"dimpro-dev");assert.match(id,/^dev-delivery-[0-9a-f]{32}$/);
  const coord=json("/srv/dimpro-dev/coordination/active-development.json");assert.equal(coord.operation,"release");assert.equal(coord.task,id);assert.equal(coord.status,"running");
  const file=path.join(DELIVERY_ROOT,`${id}.json`);let record=json(file);
  assert.equal(record.id,id);assert.equal(record.target,"DRIVE_DEV");assert.equal(record.environment,"DEV");assert.equal(record.productionAccess,"DENY");
  const save=patch=>{record={...record,...patch,updatedAt:new Date().toISOString()};atomic(file,record);};
  if(["PASS_ASSISTED","ROLLED_BACK","BLOCKED"].includes(record.status))return record;
  let operation="VERIFY_SOURCE";
  try {
    const source=assertSession(record);
    const paused=()=>fs.existsSync(path.join(DELIVERY_ROOT,`${id}.paused`));
    if(paused()&&record.status!=="PUBLIC_PENDING_BROWSER")return record;
    if(record.status==="APPROVED") {
      const occupied=fs.readdirSync(DELIVERY_ROOT).filter(n=>/^dev-delivery-[0-9a-f]{32}\.json$/.test(n)&&n!==`${id}.json`).map(n=>json(path.join(DELIVERY_ROOT,n))).find(r=>r.target==="DRIVE_DEV"&&["STAGING","CANDIDATE_READY","PUBLIC_PENDING_BROWSER"].includes(r.status));
      if(occupied){save({code:"DEV_DELIVERY_TARGET_BUSY"});return record;}
    }
    if(["APPROVED","STAGING"].includes(record.status)) {
      operation="VERIFY_BUILD_ARTIFACT";
      const artifactDir=path.join("/srv/dimpro-dev/artifacts/build-runs",record.buildRunId);
      assert.match(record.buildRunId,/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/);
      validateArtifact(record,json(artifactDir+"/metadata.json"),json(artifactDir+"/result.json"));
      const versionSource=fs.readFileSync(path.join(source,"components/drive/driveBuildInfo.ts"),"utf8");
      const version=versionSource.match(/\bDRIVE_DEVELOPMENT_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/)?.[1];assert.ok(version,"DRIVE_VERSION_UNVERIFIED");
      if(record.status==="APPROVED") {
        operation="PREPARE_DEV_BASELINE";
        const original=fs.readFileSync(NGINX,"utf8"),oldPort=routingPort(original),oldEnv=envFor(runtimeAt(oldPort));
        assert.equal(oldEnv.DIMPRO_PRODUCTION_ACCESS,"DENY");assert.notEqual(oldEnv.DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED,"true");assert.notEqual(oldEnv.DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED,"true");
        const port=await freePort();const runtimeRoot=`/srv/dimpro-dev/runtime/${id}`;
        const baseline={};for(const route of ["/","/login","/api/drive/health"]){const r=await get(`http://127.0.0.1:${oldPort}`+route);assert.ok([200,301,302,303,307,308,401,403].includes(r.status));baseline[route]=publicResult(r);}
        fs.mkdirSync(runtimeRoot,{mode:0o700});fs.writeFileSync(runtimeRoot+"/nginx.before",original,{mode:0o600,flag:"wx"});
        const desired=planDriveRouting(original,port,record,version);fs.writeFileSync(runtimeRoot+"/nginx.after",desired,{mode:0o600,flag:"wx"});
        save({status:"STAGING",runtimeRoot,port,oldPort,processName:`dimpro-${id}`,version,httpBaseline:baseline,environmentFingerprint:protectedFingerprint(oldEnv),oldNginxSha256:sha(original),newNginxSha256:sha(desired)});
      }
      // Reuse a fully staged release after a crash; partial staging never becomes executable.
      const release=path.join(record.runtimeRoot,"release");
      if(!fs.existsSync(release)) {
        operation="EXTRACT_ARTIFACT_STORAGE_PREFLIGHT";
        const temp=fs.mkdtempSync(path.join(record.runtimeRoot,"unpack-"));
        const py=`import sys,tarfile,pathlib,hashlib,os\na=pathlib.Path(sys.argv[1]);d=pathlib.Path(sys.argv[2]);assert hashlib.file_digest(a.open('rb'),'sha256').hexdigest()==sys.argv[3]\nwith tarfile.open(a) as t:\n names=set();size=0\n for m in t.getmembers():\n  p=pathlib.PurePosixPath(m.name);assert not p.is_absolute() and '..' not in p.parts and p.parts[0]=='.next' and p.as_posix() not in names;names.add(p.as_posix());assert not m.isdev() and not m.isfifo();size+=m.size\n v=os.statvfs(d);available=v.f_bavail*v.f_frsize;total=v.f_blocks*v.f_frsize;assert available-size>=15*1024**3 and (total-available+size)/total<0.90,'DEV_STORAGE_PREFLIGHT_BLOCKED'\n t.extractall(d,filter='data')\n`;
        cmd("python3",["-c",py,artifactDir+"/build-artifact.tar.gz",temp,record.artifactSha256],{timeout:180000});
        const meta=json(temp+"/.next/.dimpro-release.json");assert.equal(meta.gitCommit,record.sourceCommit);assert.equal(meta.gitBranch,record.sourceBranch);assert.equal(meta.buildId,record.buildId);
        assert.equal(fs.readFileSync(temp+"/.next/BUILD_ID","utf8").trim(),record.buildId);assert.ok(fs.statSync(temp+"/.next/standalone/server.js").isFile());
        fs.renameSync(temp,release);
      }
      const root=path.join(release,".next/standalone/.next/static");let asset;
      operation="VERIFY_COMPILED_VERSION";
      const releaseMeta=json(release+"/.next/.dimpro-release.json");
      assert.equal(releaseMeta.gitCommit,record.sourceCommit);assert.equal(releaseMeta.gitBranch,record.sourceBranch);assert.equal(releaseMeta.buildId,record.buildId);
      assert.equal(fs.readFileSync(release+"/.next/BUILD_ID","utf8").trim(),record.buildId);
      function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(!asset&&entry.name.endsWith(".js")&&fs.readFileSync(p).includes(Buffer.from(record.version)))asset=p;}}
      walk(root);assert.ok(asset,"COMPILED_DRIVE_VERSION_MISSING");
      save({asset:"/_next/static/"+path.relative(root,asset).split(path.sep).join("/"),assetSha256:sha(fs.readFileSync(asset))});
      const shellQuote=x=>"'"+String(x).replaceAll("'","'\\''")+"'";
      const script=`#!/usr/bin/env bash\nset -Eeuo pipefail\nset -a\nsource /srv/dimpro-dev/candidates/drive-pilot/.env.local\nsource /root/.dimpro-secrets/dimpro-auth/dev/runtime.env\nset +a\nexport PORT=${record.port}\nexport HOSTNAME=127.0.0.1\nexport NODE_ENV=production\nexport DIMPRO_PRODUCTION_ACCESS=DENY\nexport DIMPRO_RELEASE_SOURCE_COMMIT=${shellQuote(record.sourceCommit)}\nexport DIMPRO_RELEASE_SOURCE_BRANCH=${shellQuote(record.sourceBranch)}\nexport DIMPRO_RELEASE_BUILD_ID=${shellQuote(record.buildId)}\nexport DIMPRO_DRIVE_OPEN_TICKET_ROOT=/srv/dimpro-dev/data/drive-open-tickets-v1\ncd ${shellQuote(path.join(release,".next/standalone"))}\nexec node server.js\n`;
      const start=record.runtimeRoot+"/start.sh";
      if(!fs.existsSync(start))fs.writeFileSync(start,script,{mode:0o700,flag:"wx"});else assert.equal(fs.readFileSync(start,"utf8"),script);
      const existing=processes().filter(p=>p.name===record.processName);assert.ok(existing.length<=1);
      operation="START_CANDIDATE";
      if(!existing.length)cmd("pm2",["start",start,"--name",record.processName,"--interpreter","bash"]);
      operation="VERIFY_CANDIDATE";
      let failure;for(let i=0;i<20;i++){try{const checks=await smoke(record);save({status:"CANDIDATE_READY",candidateHttp:checks});failure=null;break;}catch(error){failure=error;await new Promise(r=>setTimeout(r,1000));}}if(failure)throw failure;
    }
    if(record.status==="CANDIDATE_READY") {
      operation="DEV_ROUTING_CUTOVER";
      if(paused())return record;
      assertSession(record);await smoke(record);
      const original=fs.readFileSync(record.runtimeRoot+"/nginx.before","utf8"),desired=fs.readFileSync(record.runtimeRoot+"/nginx.after","utf8"),current=fs.readFileSync(NGINX,"utf8");
      allowedRoutingWrite(current,original,desired);
      // Persist before modifying routing: a crash resumes verification/rollback, never another cutover.
      save({status:"PUBLIC_PENDING_BROWSER",publicChangedAt:new Date().toISOString(),browserDeadlineAt:new Date(Date.now()+30*60*1000).toISOString()});
      nginxWrite(desired);
    }
    if(record.status==="PUBLIC_PENDING_BROWSER") {
      operation="VERIFY_PUBLIC_DEV_AND_BROWSER";
      const desired=fs.readFileSync(record.runtimeRoot+"/nginx.after","utf8"),original=fs.readFileSync(record.runtimeRoot+"/nginx.before","utf8"),current=fs.readFileSync(NGINX,"utf8");
      allowedRoutingWrite(current,original,desired);
      // A crash between intent persistence and nginx replacement is retried once under the same lock.
      if(current===original){if(paused()){record=rollback({...record,code:"DEV_DELIVERY_PAUSED_BEFORE_CUTOVER"});atomic(file,record);return record;}nginxWrite(desired);}
      let publicHttp,publicError;
      for(let attempt=0;attempt<5;attempt++){try{publicHttp=await smoke(record,true);publicError=null;break;}catch(error){publicError=error;await new Promise(r=>setTimeout(r,1000));}}
      if(publicError)throw publicError;save({publicHttp});
      const browserFile=path.join(DELIVERY_ROOT,`${id}.browser.json`);
      const browser=fs.existsSync(browserFile)?json(browserFile):null;
      if(browser) {
        for(const k of ["id","sourceCommit","buildId","artifactSha256"])assert.equal(browser[k],record[k],"BROWSER_PROOF_IDENTITY_MISMATCH");
        assert.equal(browser.authority,"PAIRED_OPERATOR");assert.ok(Date.parse(browser.observedAt)>=Date.parse(record.publicChangedAt));
        if(browser.result==="PASS")assert.ok(Date.parse(browser.observedAt)<=Date.parse(record.browserDeadlineAt),"BROWSER_PROOF_EXPIRED");
        assert.ok(["PASS","FAIL"].includes(browser.result));
        save({browserVerification:browser});
        if(browser.result==="PASS")save({status:"PASS_ASSISTED",code:null,completedAt:new Date().toISOString()});
        else {record=rollback({...record,code:"DEV_BROWSER_CHECK_FAILED"});atomic(file,record);}
      } else if(Date.now()>Date.parse(record.browserDeadlineAt)) {record=rollback({...record,code:"DEV_BROWSER_CHECK_TIMEOUT"});atomic(file,record);}
    }
    return record;
  } catch(error) {
    const failureReason=String(error?.message||"Ellenőrzési hiba").split("\n")[0].slice(0,300);
    // Failure after public intent must restore the old routing. If another operator changed it,
    // preserve that configuration and report an explicit unresolved rollback, never success.
    if(record.status==="PUBLIC_PENDING_BROWSER") {
      try{record=rollback({...record,code:"DEV_DELIVERY_PUBLIC_CHECK_FAILED",failureOperation:operation,failureReason});atomic(file,record);return record;}
      catch {save({status:"BLOCKED",code:"DEV_DELIVERY_ROLLBACK_REQUIRES_OPERATOR",failureOperation:operation,failureReason,publicRoutingUncertain:true});}
    } else save({status:"BLOCKED",code:"DEV_DELIVERY_PREFLIGHT_OR_CANDIDATE_FAILED",failureOperation:operation,failureReason});
    throw error;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  runDelivery(process.argv[2]).then(r=>console.log(JSON.stringify({id:r.id,status:r.status,code:r.code}))).catch(()=>{console.error("A DEV-kihelyezés ellenőrzése sikertelen. A részletes művelet nem kapott PASS állapotot.");process.exitCode=1;});
}
