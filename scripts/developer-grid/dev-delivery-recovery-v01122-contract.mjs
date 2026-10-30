import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const require=createRequire(import.meta.url),ts=require("typescript"),crypto=require("node:crypto");
process.chdir(fileURLToPath(new URL("../../",import.meta.url)));
const engineSource=ts.transpileModule(fs.readFileSync("scripts/developer-grid/dev-delivery-engine.mjs","utf8").replaceAll("import.meta.url",'"file:///fixture/engine.mjs"'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const ROOT="/srv/dimpro-dev/coordination/developer-grid/dev-deliveries",id="dev-delivery-"+"d".repeat(32),runtime="/srv/dimpro-dev/runtime/"+id,source="/srv/dimpro-dev/worktrees/fixture-worker",nginx="/etc/nginx/sites-enabled/dimpro-dev.conf",realNginx="/etc/nginx/sites-available/dimpro-dev.conf";
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function fixture(options={}){
  const now=Date.now(),files=new Map(),commands=[],identity={taskId:"task",sessionId:"session",workerCode:"OUTMINAI",sourceCommit:"a".repeat(40),sourceBranch:"worker/outminai/task",buildRunId:"fixture-build",buildId:"fixture_build_id",artifactSha256:"b".repeat(64)};
  const common={HOSTNAME:"127.0.0.1",DIMPRO_PRODUCTION_ACCESS:"DENY",DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED:"false",DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED:"false"};
  const env={...common,PORT:"3460",DIMPRO_RELEASE_SOURCE_COMMIT:identity.sourceCommit,DIMPRO_RELEASE_BUILD_ID:identity.buildId};
  const keys=Object.keys(env).filter(k=>/^(NEXT_PUBLIC_|SUPABASE_|DIMPRO_AUTH_|DIMPRO_DRIVE_|DIMPRO_DROP_|DRIVE_DEV_|DRIVE_PILOT_)/.test(k)).sort();
  const before="fixture_old_config",after="fixture_new_config",asset="/_next/static/version.js",assetBytes=Buffer.from("fixture_drive_0.9.67");
  let record={...identity,schemaVersion:1,id,target:"DRIVE_DEV",environment:"DEV",productionAccess:"DENY",status:options.staging?"STAGING":"PUBLIC_PENDING_BROWSER",runtimeRoot:runtime,port:3460,oldPort:3414,processName:"dimpro-"+id,version:"0.9.67",environmentFingerprint:hash(JSON.stringify(keys.map(k=>[k,env[k]]))),httpBaseline:{"/":{status:307,location:"https://drive.dev.dimpro.hu/drive"},"/login":{status:307,location:"https://drive.dev.dimpro.hu/api/dimpro-auth/start"},"/api/drive/health":{status:401,location:null}},asset,assetSha256:hash(assetBytes),browserVerification:null,publicChangedAt:new Date(now-60000).toISOString(),browserDeadlineAt:new Date(now+(options.expired?-1000:60000)).toISOString()};
  const put=(p,v)=>files.set(path.normalize(p),typeof v==="string"?v:JSON.stringify(v));
  put(ROOT+`/${id}.json`,record);
  put("/srv/dimpro-dev/coordination/active-development.json",{operation:"release",task:id,status:"running"});
  put(ROOT+"/../state.json",{sessions:[{id:identity.sessionId,taskId:identity.taskId,workerCode:identity.workerCode,endedAt:null,developmentContext:{devDeliveryTarget:"DRIVE_DEV",bootAckState:"VALIDATED",workStageIndex:6},sourceProvenance:{head:identity.sourceCommit,branch:identity.sourceBranch,worktree:source}}]});
  put(ROOT+"/../build-runs.json",{runs:[{...identity,id:identity.buildRunId,status:"PASS",queuedAt:new Date(now-100000).toISOString()}]});
  put(runtime+"/nginx.before",before);put(runtime+"/nginx.after",after);put(realNginx,options.external?"other_operator_config":options.crashBeforeWrite?before:after);
  put("/proc/101/environ",Object.entries({...common,PORT:"3414"}).map(([k,v])=>k+"="+v).join("\0"));
  put("/proc/102/environ",Object.entries(env).map(([k,v])=>k+"="+v).join("\0"));
  if(options.paused)put(ROOT+`/${id}.paused`,{});
  if(options.browser)put(ROOT+`/${id}.browser.json`,{...identity,id:options.staleBrowser?"stale-id":id,result:options.browser,note:"Bejelentkezett Drive ellenőrizve",authority:"PAIRED_OPERATOR",observedAt:new Date(now).toISOString()});
  if(options.staging){
    const meta={...identity,runId:identity.buildRunId,environment:"DEV",productionAccess:"DENY",runner:{id:"build01"}};
    put(`/srv/dimpro-dev/artifacts/build-runs/${identity.buildRunId}/metadata.json`,meta);
    put(`/srv/dimpro-dev/artifacts/build-runs/${identity.buildRunId}/result.json`,{...meta,status:"PASS",nodeId:"build01"});
    put(source+"/components/drive/driveBuildInfo.ts",'export const DRIVE_DEVELOPMENT_VERSION = "0.9.67";');
    put(runtime+"/release","directory");put(runtime+"/release/.next/.dimpro-release.json",{gitCommit:identity.sourceCommit,gitBranch:identity.sourceBranch,buildId:identity.buildId});
    put(runtime+"/release/.next/BUILD_ID",identity.buildId);put(runtime+"/release/.next/standalone/.next/static/version.js",assetBytes.toString());
  }
  const normalized=p=>p===nginx?realNginx:path.normalize(p);
  const fakeFs={
    readFileSync:(p,encoding)=>{p=normalized(p);assert.ok(files.has(p),"Unexpected fixture read: "+p);return encoding?files.get(p):Buffer.from(files.get(p));},
    writeFileSync:(p,data)=>{files.set(normalized(p),String(data));},
    renameSync:(a,b)=>{assert.ok(files.has(a));files.set(normalized(b),files.get(a));files.delete(a);},
    existsSync:p=>files.has(normalized(p)),
    realpathSync:p=>p===nginx?realNginx:p==="/proc/102/cwd"?runtime+"/release/.next/standalone":p,
    statSync:()=>({mode:0o100644,isFile:()=>true}),
    readdirSync:()=>[{name:"version.js",isDirectory:()=>false}],
  };
  const ps=[{name:"old-dev",pid:101,pm2_env:{status:"online"}},{name:record.processName,pid:102,pm2_env:{status:"online"}}];
  function spawnSync(file,args){commands.push([file,...args]);if(file==="git")return {status:0,stdout:args[0]==="rev-parse"?identity.sourceCommit:args[0]==="branch"?identity.sourceBranch:options.dirty?" M source.ts":""};if(file==="pm2"&&args[0]==="jlist")return {status:0,stdout:JSON.stringify(ps)};if(["nginx","systemctl"].includes(file))return {status:0,stdout:""};throw Error("Unexpected subprocess: "+file+" "+args.join(" "));}
  async function fetchMock(url){
    const p=new URL(url).pathname,publicSite=url.startsWith("https://");
    let status=p===asset?200:p==="/api/drive/health"?401:307;
    if(options.badPublic&&publicSite)status=500;
    const headers={"x-dimpro-drive-source":identity.sourceCommit,"x-dimpro-drive-build":identity.buildId,"x-dimpro-production-access":"DENY"};
    if(p==="/")headers.location="https://drive.dev.dimpro.hu/drive";if(p==="/login")headers.location="https://drive.dev.dimpro.hu/api/dimpro-auth/start";
    return new Response(p===asset?assetBytes:"fixture",{status,headers});
  }
  const exports={};
  vm.runInNewContext(engineSource,{exports,require:name=>name==="node:fs"?fakeFs:name==="node:child_process"?{spawnSync}:name==="node:os"?{hostname:()=>"dimpro-dev"}:require(name),Buffer,URL,AbortSignal,fetch:fetchMock,setTimeout:fn=>{fn();},process:{argv:[],env:{}},console});
  return {run:()=>exports.runDelivery(id),read:()=>JSON.parse(files.get(ROOT+`/${id}.json`)),config:()=>files.get(realNginx),commands,before,after};
}
let tests=0;async function check(label,fn){await fn();console.log("PASS",++tests,label);}
await check("delivered HTTP alone remains pending and does not reapply an already active cutover",async()=>{const f=fixture();await f.run();assert.equal(f.read().status,"PUBLIC_PENDING_BROWSER");assert.equal(f.commands.filter(c=>c[0]==="systemctl").length,0);});
await check("crash before nginx write resumes exactly that cutover, without another candidate",async()=>{const f=fixture({crashBeforeWrite:true});await f.run();await f.run();assert.equal(f.config(),f.after);assert.equal(f.commands.filter(c=>c[0]==="systemctl").length,1);assert.ok(!f.commands.some(c=>c[0]==="pm2"&&c[1]==="start"));});
await check("matching operator browser proof completes once and survives replay",async()=>{const f=fixture({browser:"PASS"});await f.run();assert.equal(f.read().status,"PASS_ASSISTED");const n=f.commands.length;await f.run();assert.equal(f.commands.length,n);});
await check("negative browser verdict restores old routing and preserves both processes",async()=>{const f=fixture({browser:"FAIL"});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);assert.ok(!f.commands.some(c=>c[0]==="pm2"&&["delete","stop","restart"].includes(c[1])));});
await check("browser deadline expiration restores old routing",async()=>{const f=fixture({expired:true});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);});
await check("failed public smoke restores old routing and cannot return PASS",async()=>{const f=fixture({badPublic:true});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);});
await check("external routing edit blocks rollback instead of clobbering another operator",async()=>{const f=fixture({external:true});await assert.rejects(f.run());assert.equal(f.read().status,"BLOCKED");assert.equal(f.read().publicRoutingUncertain,true);assert.equal(f.config(),"other_operator_config");});
await check("stale browser identity triggers rollback instead of reusing prior approval",async()=>{const f=fixture({browser:"PASS",staleBrowser:true});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);});
await check("manual pause before an interrupted cutover prevents that release",async()=>{const f=fixture({paused:true,crashBeforeWrite:true});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);});
await check("source drift during pending release restores old routing",async()=>{const f=fixture({dirty:true});await f.run();assert.equal(f.read().status,"ROLLED_BACK");assert.equal(f.config(),f.before);});
await check("staged release and already running candidate resume without duplicate extraction/start",async()=>{const f=fixture({staging:true,crashBeforeWrite:true});await f.run();assert.equal(f.read().status,"PUBLIC_PENDING_BROWSER");assert.equal(f.config(),f.after);assert.ok(!f.commands.some(c=>c[0]==="python3"||(c[0]==="pm2"&&c[1]==="start")));});
console.log(JSON.stringify({ok:true,tests,scope:"actual deployment engine with isolated filesystem/process/HTTP fixtures; no live deployment",liveMutation:false}));
