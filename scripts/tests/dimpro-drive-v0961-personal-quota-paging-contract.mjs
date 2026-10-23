import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectPersonalQuotaUsedBytes, PERSONAL_QUOTA_REF_PAGE_SIZE,
  PERSONAL_QUOTA_OBJECT_BATCH_SIZE,
} from "../../app/lib/content-core/personalQuotaPaging.ts";
import { PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION }
  from "../../app/lib/content-core/personalUploadPolicy.ts";

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const refs=Array.from({length:2_505},(_,i)=>({
  id:id(3_000-i),
  // Every second ref points to an existing content object; dedup all pages.
  content_object_id:id(5_000-Math.floor(i/2)),
}));
const objects=new Map(refs.map(row=>[
  row.content_object_id, {id:row.content_object_id,size_bytes:4*1024**2}
]));
const requests={refs:0,objects:0};
const readRefPage=async(before,limit)=>{
  requests.refs++;
  assert.equal(limit,PERSONAL_QUOTA_REF_PAGE_SIZE);
  return refs.filter(row=>!before || row.id<before).slice(0,limit);
};
const readObjectBatch=async ids=>{
  requests.objects++;
  assert.ok(ids.length<=PERSONAL_QUOTA_OBJECT_BATCH_SIZE);
  return ids.map(id=>objects.get(id)).filter(Boolean);
};
const result=await collectPersonalQuotaUsedBytes({readRefPage,readObjectBatch});
assert.equal(result.countedRefs,2_505);
assert.equal(result.distinctObjects,1_253);
assert.equal(result.usedBytes,1_253*4*1024**2);
assert.equal(requests.refs,6);
assert.equal(requests.objects,13);
assert.equal(PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION,500);

const empty=await collectPersonalQuotaUsedBytes({
  readRefPage:async()=>[],readObjectBatch:async()=>{throw Error("unreachable");},
});
assert.deepEqual(empty,{usedBytes:0,countedRefs:0,distinctObjects:0});
await assert.rejects(()=>collectPersonalQuotaUsedBytes({
  readRefPage:async()=>refs.slice(0,2),readObjectBatch:async()=>[],
  pageSize:1_000,
}),/PERSONAL_QUOTA_PAGING_CONFIG_INVALID/);
await assert.rejects(()=>collectPersonalQuotaUsedBytes({
  readRefPage:async()=>refs.slice(0,2),readObjectBatch:async()=>[],
  maxRefs:1,
}),/PERSONAL_QUOTA_TOO_MANY_REFS/);
await assert.rejects(()=>collectPersonalQuotaUsedBytes({
  readRefPage:async()=>refs.slice().reverse().slice(0,500),readObjectBatch:async()=>[],
}),/PERSONAL_QUOTA_REF_ORDER_INVALID/);
await assert.rejects(()=>collectPersonalQuotaUsedBytes({
  readRefPage:async()=>refs.slice(0,1),readObjectBatch:async()=>[{id:id(9_999),size_bytes:10}],
}),/PERSONAL_QUOTA_OBJECT_INVALID/);
await assert.rejects(()=>collectPersonalQuotaUsedBytes({
  readRefPage:async()=>refs.slice(0,1),readObjectBatch:async ids=>[
    {id:ids[0],size_bytes:Number.MAX_SAFE_INTEGER},
    {id:ids[0],size_bytes:10},
  ],
}),/PERSONAL_QUOTA_OBJECT_BATCH_INVALID/);
const read=path=>readFileSync(path,"utf8");
const repo=read("app/lib/content-core/repository.ts");
assert.match(repo,/collectPersonalQuotaUsedBytes/);
assert.match(repo,/\.order\("id", \{ ascending: false \}\)/);
assert.match(repo,/query\.lt\("id", beforeId\)/);
assert.match(repo,/\.in\("status", \["ACTIVE", "REMOVED"\]\)/);
assert.match(repo,/PERSONAL_QUOTA_PAGED_SUMMARY_INVALID/);
assert.ok(!repo.includes('const [limitResult, refsResult]'));
console.log("DIMPRO Drive V0.9.61 personal quota 2505 refs / 1253 distinct objects / 500 photo selection PASS");
