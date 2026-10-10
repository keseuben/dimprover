import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const dir=mkdtempSync(join(tmpdir(),"dimpro-producer-contract-"));
for (const name of ["digestCore","followPolicy","producerPlanning"]) {
  let source=readFileSync(resolve("app/lib/drive-notifications",name+".ts"),"utf8");
  source=source.replaceAll('from "./digestCore"', 'from "./digestCore.ts"')
    .replaceAll('from "./followPolicy"', 'from "./followPolicy.ts"');
  writeFileSync(join(dir,name+".ts"),source);
}
const { planDigestJournalPage }=await import(pathToFileURL(join(dir,"producerPlanning.ts")).href);
rmSync(dir,{recursive:true,force:true});

const docChange=(sequence,eventType="METADATA_UPDATED",id="doc-A",extra={})=>({
  sequence,id:"change-"+sequence,projectId:"project-A",eventType,entityType:"document",entityId:id,
  payload:{documentId:id,...extra},actorUserId:"sender",createdAt:"2026-10-10T17:00:00Z",
});
const options={
  projectId:"project-A",recipientId:"recipient",category:"DOCUMENT_CHANGES",cursorFrom:5,
  visibleDocumentIds:new Set(["doc-A"]),approvalDocumentIds:new Set(),
  followedOnly:false,follows:[],hasMore:true,
};
const page=(rows,patch={})=>planDigestJournalPage({...options,journalPage:rows,...patch});
{
  const p=page([]);
  assert.equal(p.action,"EMPTY");
  assert.equal(p.cursorTo,5);
}
{
  const p=page([docChange(6),docChange(7)]);
  assert.equal(p.action,"ADVANCE");
  assert.equal(p.cursorTo,7);
  assert.deepEqual(p.eventIds,[]);
}
{
  const p=page([docChange(6),docChange(8,"DOCUMENT_VERSION_CREATED"),docChange(9)]);
  assert.equal(p.action,"RESERVE");
  assert.equal(p.cursorTo,9);
  assert.deepEqual(p.eventIds,["change-8"]);
}
{
  const p=page([docChange(6,"DOCUMENT_VERSION_CREATED","private-doc"),docChange(7)]);
  assert.equal(p.action,"ADVANCE");
  assert.equal(p.cursorTo,7);
}
{
  const p=page([docChange(6,"DOCUMENT_VERSION_CREATED")],{followedOnly:true});
  assert.equal(p.action,"ADVANCE");
}
{
  const p=page([docChange(6,"DOCUMENT_VERSION_CREATED")],{followedOnly:true,
    follows:[{documentId:"doc-A",notifyVersions:true,notifyRevisions:true,notifyApprovals:false,digestFrequency:"DAILY"}]});
  assert.equal(p.action,"RESERVE");
}
assert.throws(()=>page([docChange(6),docChange(6)]),/ORDER/);
assert.throws(()=>page([docChange(8),docChange(7)]),/ORDER/);
assert.throws(()=>page([docChange(5)]),/ORDER/);
assert.throws(()=>page([docChange(6,"DOCUMENT_VERSION_CREATED","doc-A",{secret:"x"})],{projectId:"project-B"}),/ORDER/);
assert.throws(()=>page(Array.from({length:251},(_,i)=>docChange(i+6))),/RANGE/);
console.log("DRIVE NOTIFICATION PRODUCER CONTRACT 11/11 PASS");
