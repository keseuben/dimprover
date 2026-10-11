import assert from "node:assert/strict";
import {sortedRecentUploads,recentUploadTimestamp} from "../../app/lib/drive-core/recentUploadCore.ts";

const sample=(id,versionAt,editedAt,versionKind="VERSION")=>({
  id,updatedAt:editedAt,currentVersion:versionAt?{id:id+"-v",createdAt:versionAt,versionKind}:null,
});
const docs=[
 sample("older","2026-10-01T08:00:00Z","2026-10-11T12:00:00Z"),
 sample("newest","2026-10-11T09:00:00Z","2026-10-11T09:00:00Z"),
 sample("middle","2026-10-06T07:00:00Z","2026-10-09T12:00:00Z"),
 sample("metadata-only",null,"2026-10-11T12:01:00Z"),
];
const original=docs.map(doc=>doc.id);
const sorted=sortedRecentUploads(docs);
assert.deepEqual(sorted.map(d=>d.id),["newest","middle","older"],"sort by actual file version, not metadata update");
assert.deepEqual(docs.map(doc=>doc.id),original,"input untouched");
assert.equal(recentUploadTimestamp(docs[0]),Date.parse("2026-10-01T08:00:00Z"));
assert.equal(recentUploadTimestamp({id:"x",updatedAt:"invalid",currentVersion:null}),0);
assert.equal(sortedRecentUploads([]).length,0);
console.log("DRIVE V0935 RECENT UPLOAD CORE 5/5 PASS");
