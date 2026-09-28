import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const desktop=path.join(root,"desktop/benjadmin-developer-grid");
const pkg=JSON.parse(fs.readFileSync(path.join(desktop,"package.json"),"utf8"));
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const liveSource=fs.readFileSync(path.join(desktop,"src/live/benjadmin-live-client.cjs"),"utf8");
const require=createRequire(import.meta.url);
const { BenjadminLiveClient, synthesizeGridSnapshot }=require(path.join(desktop,"src/live/benjadmin-live-client.cjs"));
let n=0;
const check=(name,fn)=>{fn();n+=1;console.log("PASS",name);};

check("desktop version v0.1.88",()=>assert.equal(pkg.version,"0.1.88"));
check("backend version v0.1.88-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.88-dev"')));
check("foundation 409 is recoverable only with foundation payload",()=>{
  assert.match(liveSource,/pathname === "\/api\/dev\/grid\/foundation"/);
  assert.match(liveSource,/response\.status === 409/);
  assert.match(liveSource,/payload\?\.foundation/);
  assert.match(liveSource,/degradedReason/);
});
check("401 and 403 remain authentication failures",()=>{
  assert.match(liveSource,/response\.status === 401 \|\| response\.status === 403/);
  assert.match(liveSource,/AUTH_REJECTED/);
});
check("native bootstrap still validates delta contract",()=>{
  assert.match(liveSource,/realtime\?\.mode !== "DELTA_EVENT"/);
  assert.match(liveSource,/fullSnapshotPollingAllowed !== false/);
});

const snapshot=synthesizeGridSnapshot({
  foundation:{workers:[
    {code:"BENJAMINAI",label:"BenjáminAI",state:"ACTIVE"},
    {code:"JAZMINAI",label:"JázminAI",state:"ACTIVE"},
  ]},
  state:{
    revision:348,
    task:{id:"jaz-task",title:"DIMPRO Bridge",status:"RUNNING",projectId:"project_dimprover",priority:90,acceptance:[]},
    sessions:[
      {id:"ben-session",workerCode:"BENJAMINAI",taskId:"drive-task",startedAt:"2026-09-27T06:00:00Z",endedAt:null,
       developmentContext:{projectId:"project_dimprover",mainModule:"BENJADMIN",moduleName:"DIMPRO Projektkapu",workItem:"DIMPRO Drive fejlesztés",workStageIndex:3},
       sourceProvenance:{branch:"worker/benjaminai/drive",worktree:"/srv/dimpro-dev/worktrees/drive",head:"abc",sourceState:"VERIFIED",verifiedAt:"2026-09-27T07:00:00Z"}},
      {id:"jaz-session",workerCode:"JAZMINAI",taskId:"jaz-task",startedAt:"2026-09-27T06:00:00Z",endedAt:null,
       developmentContext:{projectId:"project_dimprover",mainModule:"BENJADMIN",moduleName:"DIMPRO Bridge",workItem:"Bridge",workStageIndex:4},
       sourceProvenance:{branch:"worker/jazminai/bridge",worktree:"/srv/dimpro-dev/worktrees/bridge",head:"def",sourceState:"VERIFIED",verifiedAt:"2026-09-27T07:00:00Z"}}
    ],
    updatedAt:"2026-09-27T07:00:00Z"
  },
  liveEventsByWorker:new Map(),
  generatedAt:"2026-09-27T07:00:00Z"
});
const benTask=snapshot.tasks.find((item)=>item.assignedWorkerId==="BENAI");
const benPresence=snapshot.workerPresence.find((item)=>item.workerCode==="BENAI");
check("secondary active session becomes a worker task",()=>{
  assert.equal(benTask?.id,"drive-task");
  assert.equal(benTask?.moduleName,"DIMPRO Projektkapu");
});
check("secondary worker keeps module and stage",()=>{
  assert.equal(benPresence?.moduleName,"DIMPRO Projektkapu");
  assert.equal(benPresence?.workStageIndex,3);
  assert.equal(benPresence?.active,true);
});

const originalFetch=global.fetch;
try {
  global.fetch=async (url)=>{
    const pathname=new URL(String(url)).pathname;
    if(pathname==="/api/dev/grid/foundation") return new Response(JSON.stringify({
      ok:false,
      error:"Source provenance warning",
      foundation:{realtime:{mode:"DELTA_EVENT",fullSnapshotPollingAllowed:false},workers:[]}
    }),{status:409,headers:{"content-type":"application/json"}});
    throw new Error("unexpected "+pathname);
  };
  const client=new BenjadminLiveClient({baseUrl:"https://dev.invalid",authMode:"reporter",authToken:"test",pollIntervalMs:1000});
  const payload=await client.request("/api/dev/grid/foundation");
  check("authenticated degraded foundation payload is accepted",()=>{
    assert.equal(payload.ok,true);
    assert.equal(payload.degraded,true);
    assert.equal(payload.foundation.realtime.mode,"DELTA_EVENT");
  });
} finally {
  global.fetch=originalFetch;
}

console.log("Developer Grid native delta foundation recovery v0.1.88 contract PASS · "+n+"/"+n);
