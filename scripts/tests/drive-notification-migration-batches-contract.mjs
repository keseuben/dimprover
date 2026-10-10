import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const preferencesSql=readFileSync("supabase/migrations/20261010_drive_notification_preferences_v010.sql","utf8");
const producerSql=readFileSync("supabase/migrations/20261010_drive_digest_cursor_producer_v013.sql","utf8");
const repo=readFileSync("app/lib/drive-notifications/deliveryRepository.ts","utf8");
assert.match(preferencesSql,/UNIQUE\(project_id,user_id,category,scheduled_slot,cursor_from\)/);
assert.match(producerSql,/ON CONFLICT\(project_id,user_id,category,scheduled_slot,cursor_from\) DO NOTHING/);
assert.doesNotMatch(preferencesSql,/UNIQUE\(project_id,user_id,category,scheduled_slot\)/);
assert.doesNotMatch(repo,/\.from\("drive_core_digest_deliveries"\)\s*\.insert/);
assert.match(producerSql,/DRIVE_DIGEST_CURSOR_RANGE_NOT_VERIFIED/);
assert.match(producerSql,/status IN \('PENDING','PROCESSING','FAILED','AMBIGUOUS'\)/);

// A pure producer flow is exercised across two bounded windows of the same scheduled slot.
const dir=mkdtempSync(join(tmpdir(),"dimpro-multi-batch-"));
try {
  for(const name of ["digestCore","followPolicy","producerPlanning","producerFlow"]){
    const content=readFileSync(resolve("app/lib/drive-notifications",name+".ts"),"utf8")
      .replaceAll('from "./digestCore"','from "./digestCore.ts"')
      .replaceAll('from "./followPolicy"','from "./followPolicy.ts"')
      .replaceAll('from "./producerPlanning"','from "./producerPlanning.ts"');
    writeFileSync(join(dir,name+".ts"),content);
  }
  const {prepareDigestJournalBatch}=await import(pathToFileURL(join(dir,"producerFlow.ts")).href);
  let acknowledged=0;
  const slots=new Set();
  const scope={projectId:"p",userId:"u",category:"DOCUMENT_CHANGES",digestFrequency:"DAILY",
    slot:"2026-10-10T07:00-Europe/Budapest",visibleDocumentIds:new Set(["doc"]),
    approvalDocumentIds:new Set(),followedOnly:false,follows:[]};
  const event=n=>({id:"evt-"+n,sequence:n,projectId:"p",eventType:"DOCUMENT_VERSION_CREATED",
    entityType:"document_version",entityId:"version-"+n,payload:{documentId:"doc"},
    actorUserId:"actor",createdAt:"2026-10-10T04:30:00Z"});
  const first=await prepareDigestJournalBatch({scope:{...scope,cursorFrom:0},
    read:async()=>({changes:Array.from({length:250},(_,i)=>event(i+1)),hasMore:true}),
    commit:async p=>{
      assert.equal(p.eventIds.length,250);
      const key=[scope.slot,p.cursorFrom].join("|");
      assert.ok(!slots.has(key));slots.add(key);
      return {status:"RESERVED",deliveryId:"batch-1"};
    },
  });
  assert.equal(first.status,"QUEUED");assert.equal(first.cursorFrom,0);assert.equal(first.cursorTo,250);
  acknowledged=first.cursorTo; // simulated SMTP accepted and cursor acked
  const second=await prepareDigestJournalBatch({scope:{...scope,cursorFrom:acknowledged},
    read:async()=>({changes:[event(251),event(252)],hasMore:false}),
    commit:async p=>{
      const key=[scope.slot,p.cursorFrom].join("|");
      assert.ok(!slots.has(key),"same slot, different cursor is allowed");slots.add(key);
      return {status:"RESERVED",deliveryId:"batch-2"};
    },
  });
  assert.equal(second.status,"QUEUED");assert.equal(second.cursorFrom,250);assert.equal(second.cursorTo,252);
  assert.equal(slots.size,2);
  console.log("DRIVE NOTIFICATION MULTI-BATCH CONTRACT 11/11 PASS");
}finally {rmSync(dir,{force:true,recursive:true});}
