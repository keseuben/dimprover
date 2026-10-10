import assert from "node:assert/strict";
import { filterFollowedDigestEvents } from "../../app/lib/drive-notifications/followPolicy.ts";
const make=(kind,documentId)=>({kind,documentId,eventId:kind+documentId,sequence:1,
  projectId:"p",occurredAt:"2026-10-10T00:00:00Z",actorUserId:"a",category:"DOCUMENT_CHANGES"});
const events=[make("NEW_VERSION","d1"),make("NEW_REVISION","d1"),make("REVIEW_DECISION","d1"),
  make("NEW_DOCUMENT","d1"),make("NEW_VERSION","hidden")];
const flags={documentId:"d1",notifyVersions:true,notifyRevisions:false,notifyApprovals:false,digestFrequency:"DAILY"};
assert.equal(filterFollowedDigestEvents(events,false,[]).length,5);
assert.deepEqual(filterFollowedDigestEvents(events,true,[flags]).map(x=>x.kind),["NEW_VERSION"]);
assert.equal(filterFollowedDigestEvents(events,true,[{...flags,digestFrequency:"NONE"}]).length,0);
assert.deepEqual(filterFollowedDigestEvents(events,true,[{...flags,notifyVersions:false,notifyApprovals:true}]).map(x=>x.kind),["REVIEW_DECISION"]);
assert.deepEqual(filterFollowedDigestEvents(events,true,[{...flags,notifyVersions:false,notifyRevisions:true}]).map(x=>x.kind),["NEW_REVISION"]);
assert.equal(filterFollowedDigestEvents([make("NEW_DOCUMENT","d1")],true,[flags]).length,0);
console.log("DRIVE NOTIFICATION FOLLOW POLICY 6/6 PASS");
