import assert from "node:assert/strict";
import { classifyDriveChange, buildRecipientDigest, renderDigestHtml } from "../../app/lib/drive-notifications/digestCore.ts";

const base={id:"change-1",sequence:12,projectId:"project-A",entityType:"document_version",
  entityId:"version-1",payload:{documentId:"doc-1"},actorUserId:"user-1",createdAt:"2026-10-10T12:00:00Z"};
const change=(eventType,opts={})=>({...base,eventType,...opts});
const events=[
  change("DOCUMENT_REVISION_CREATED"),
  change("DOCUMENT_METADATA_UPDATED",{id:"metadata",sequence:13}),
  change("DOCUMENT_MARKED_VALID",{id:"approval",sequence:14}),
  change("DOCUMENT_VERSION_APPROVED",{id:"security-scan",sequence:15}),
  change("DOCUMENT_UPLOADED",{id:"upload",sequence:16,entityType:"document",entityId:"doc-1",payload:{document:{id:"doc-1"}}}),
  change("DOCUMENT_REVISION_CREATED"), // duplicate id
  change("DOCUMENT_REVIEW_DECISION_CHANGED",{id:"review-decision",sequence:17,entityType:"document",entityId:"doc-1",payload:{documentId:"doc-1",changedFields:["customerApproval"]}}),
  change("DOCUMENT_CREATED",{id:"new-doc",sequence:18,entityType:"document",entityId:"doc-2",payload:{document:{id:"doc-2"}}}),
];
assert.equal(classifyDriveChange(events[1]),null,"metadata change excluded");
assert.equal(classifyDriveChange(events.at(-1))?.kind,"NEW_DOCUMENT","actual Drive-created event is included");
assert.equal(classifyDriveChange(events[3]),null,"security scan approval excluded");
assert.equal(classifyDriveChange(change("DOCUMENT_REVISION_CREATED",{payload:{}})),null,"no document ID excluded");
const filter=(approvalIds, visibleIds=new Set(["doc-1"]))=>buildRecipientDigest(events,{
  userId:"recipient",projectId:"project-A",
  enabledCategories:new Set(["DOCUMENT_CHANGES","APPROVAL_DECISIONS"]),
  visibleDocumentIds:visibleIds,approvalDocumentIds:approvalIds,
});
assert.deepEqual(filter(new Set()).map(x=>x.kind),["NEW_REVISION","NEW_DOCUMENT"],"ordinary document recipient");
assert.deepEqual(filter(new Set(["doc-1"])).map(x=>x.kind),["NEW_REVISION","REVIEW_DECISION","NEW_DOCUMENT","REVIEW_DECISION"],"approval ACL");
assert.equal(filter(new Set(["doc-1"]),new Set()).length,0,"hidden document");
assert.equal(buildRecipientDigest(events,{userId:"recipient",projectId:"project-X",enabledCategories:new Set(["DOCUMENT_CHANGES"]),visibleDocumentIds:new Set(["doc-1"]),approvalDocumentIds:new Set()}).length,0,"project isolation");
const html=renderDigestHtml({projectTitle:"Szekszárd <projekt>",periodLabel:"Október & 2026",items:filter(new Set()),
  namesByDocumentId:new Map([["doc-1","Alaprajz <script>alert(1)</script>"]])});
assert.ok(html?.includes("Szekszárd &lt;projekt&gt;"));
assert.ok(!html?.includes("<script>"));
assert.equal(renderDigestHtml({projectTitle:"P",periodLabel:"now",items:[],namesByDocumentId:new Map()}),null,"no empty mail");
console.log("DRIVE NOTIFICATION DIGEST CONTRACT PASS");
