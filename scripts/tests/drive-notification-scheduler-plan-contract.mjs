import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const directory=mkdtempSync(join(tmpdir(),"dimpro-scheduler-plan-"));
try {
  for(const file of ["scheduling","schedulerPlan"]) {
    const source=readFileSync(resolve("app/lib/drive-notifications",file+".ts"),"utf8")
      .replaceAll('from "./scheduling"','from "./scheduling.ts"');
    writeFileSync(join(directory,file+".ts"),source);
  }
  const {planDigestScheduler}=await import(pathToFileURL(join(directory,"schedulerPlan.ts")).href);
  const sub=(id,frequency="DAILY",enabled=true)=>({projectId:"p",userId:id,category:"DOCUMENT_CHANGES",frequency,enabled});
  const now=new Date("2026-10-12T05:07:00Z");
  {
    const plan=planDigestScheduler({now,subscriptions:[sub("a"),sub("a"),sub("b","NONE"),sub("c","DAILY",false),sub("d","WEEKLY"),sub("e","MONTHLY")]});
    assert.equal(plan.candidates.length,2);
    assert.equal(plan.duplicates,1);
    assert.equal(plan.disabled,2);
    assert.equal(plan.notDue,1);
    assert.equal(plan.truncated,false);
    assert.equal(plan.candidates[0].scheduledSlot,"2026-10-12T07:00-Europe/Budapest");
    assert.equal(plan.candidates[0].latenessMinutes,7);
  }
  {
    const plan=planDigestScheduler({now,subscriptions:[sub("a"),sub("b")],maxCandidates:1});
    assert.equal(plan.candidates.length,1);
    assert.equal(plan.truncated,true);
    assert.equal(plan.examined,2);
  }
  assert.throws(()=>planDigestScheduler({now,subscriptions:[sub("a")],maxCandidates:0}),/BATCH_LIMIT/);
  assert.throws(()=>planDigestScheduler({now:new Date(NaN),subscriptions:[sub("a")]}),/INVALID_NOW/);
  assert.throws(()=>planDigestScheduler({now,subscriptions:[sub("")]}),/INVALID_SUBSCRIPTION/);
  assert.throws(()=>planDigestScheduler({now,subscriptions:Array.from({length:2001},(_,i)=>sub("u"+i))}),/PAGE_TOO_LARGE/);
  console.log("DRIVE NOTIFICATION SCHEDULER PLAN CONTRACT 13/13 PASS");
}finally {rmSync(directory,{recursive:true,force:true});}
