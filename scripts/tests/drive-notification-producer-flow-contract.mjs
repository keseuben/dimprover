import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const dir=mkdtempSync(join(tmpdir(),"dimpro-producer-flow-"));
for (const name of ["digestCore","followPolicy","producerPlanning","producerFlow"]) {
  let source=readFileSync(resolve("app/lib/drive-notifications",name+".ts"),"utf8");
  source=source.replaceAll('from "./digestCore"', 'from "./digestCore.ts"')
    .replaceAll('from "./followPolicy"', 'from "./followPolicy.ts"')
    .replaceAll('from "./producerPlanning"', 'from "./producerPlanning.ts"');
  writeFileSync(join(dir,name+".ts"),source);
}
const {prepareDigestJournalBatch}=await import(pathToFileURL(join(dir,"producerFlow.ts")).href);
rmSync(dir,{recursive:true,force:true});
const event=(n,type="METADATA_UPDATED")=>({
  sequence:n,id:"event-"+n,projectId:"project",entityType:"document",entityId:"doc",
  eventType:type,payload:{documentId:"doc"},actorUserId:"actor",createdAt:"2026-10-10T00:00:00Z",
});
const scope={projectId:"project",userId:"user",category:"DOCUMENT_CHANGES",digestFrequency:"DAILY",
  slot:"2026-10-10T07:00-Europe/Budapest",cursorFrom:4,
  visibleDocumentIds:new Set(["doc"]),approvalDocumentIds:new Set(),followedOnly:false,follows:[]};
const commit=async p=>p.action==="ADVANCE"?{status:"ADVANCED",cursorTo:p.cursorTo}:{status:"RESERVED",deliveryId:"d-1"};
{
 const x=await prepareDigestJournalBatch({scope,read:async()=>({changes:[],hasMore:false}),commit});
 assert.equal(x.status,"EMPTY");
}
{
 const calls=[];const x=await prepareDigestJournalBatch({scope,read:async c=>{
   calls.push(c); return c===4?{changes:[event(5)],hasMore:true}:{changes:[event(8,"DOCUMENT_VERSION_CREATED")],hasMore:false};
 },commit});
 assert.deepEqual(calls,[4,5]);
 assert.equal(x.status,"QUEUED");assert.equal(x.cursorFrom,5);assert.equal(x.cursorTo,8);
}
{
 const x=await prepareDigestJournalBatch({scope,read:async()=>({changes:[event(6)],hasMore:false}),commit});
 assert.equal(x.status,"EMPTY");assert.equal(x.cursor,6);
}
{
 const x=await prepareDigestJournalBatch({scope,read:async()=>({changes:[event(6)],hasMore:false}),
   commit:async()=>({status:"CURSOR_CHANGED"})});
 assert.equal(x.status,"BLOCKED");assert.equal(x.cursor,4);
}
{
 const x=await prepareDigestJournalBatch({scope,read:async c=>({changes:[event(c+1)],hasMore:true}),
   commit,maxPages:3});
 assert.equal(x.status,"BUDGET_EXHAUSTED");assert.equal(x.cursor,7);
}
await assert.rejects(()=>prepareDigestJournalBatch({scope,read:async()=>({changes:[],hasMore:true}),commit}),
  /EMPTY_PAGE/);
await assert.rejects(()=>prepareDigestJournalBatch({scope,read:async()=>({changes:[event(3)],hasMore:false}),commit}),
  /ORDER/);
await assert.rejects(()=>prepareDigestJournalBatch({scope,read:async()=>({changes:[event(6)],hasMore:false}),
  commit:async()=>({status:"RESERVED",deliveryId:"bogus"})}),/UNEXPECTED_RESERVATION/);
console.log("DRIVE NOTIFICATION PRODUCER FLOW CONTRACT 8/8 PASS");
