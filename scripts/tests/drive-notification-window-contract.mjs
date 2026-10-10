import assert from "node:assert/strict";
import { clipJournalAtScheduledTime } from "../../app/lib/drive-notifications/journalWindow.ts";
const slot=new Date("2026-10-10T05:00:00Z");
const ev=(id,at)=>({id:String(id),sequence:id,createdAt:at,projectId:"p",eventType:"DOCUMENT_VERSION_CREATED",entityType:"document",entityId:"doc",payload:{},actorUserId:"x"});
const before=ev(1,"2026-10-10T04:59:59Z");
const at=ev(2,"2026-10-10T05:00:00Z");
const after=ev(3,"2026-10-10T05:00:01Z");
{
 const out=clipJournalAtScheduledTime({rows:[before,at,after],hasMore:true,scheduledAt:slot});
 assert.deepEqual(out.changes.map(x=>x.id),["1","2"]);
 assert.equal(out.hasMore,false);
 assert.equal(out.deferredRows,1);
}
{
 const out=clipJournalAtScheduledTime({rows:[after],hasMore:false,scheduledAt:slot});
 assert.equal(out.changes.length,0);
 assert.equal(out.deferredRows,1);
}
{
 const out=clipJournalAtScheduledTime({rows:[before,at],hasMore:true,scheduledAt:slot});
 assert.equal(out.hasMore,true);
 assert.equal(out.deferredRows,0);
}
assert.throws(()=>clipJournalAtScheduledTime({rows:[{...before,createdAt:"garbage"}],hasMore:false,scheduledAt:slot}),/TIME_INVALID/);
assert.throws(()=>clipJournalAtScheduledTime({rows:[],hasMore:false,scheduledAt:new Date(NaN)}),/CUTOFF/);
console.log("DRIVE NOTIFICATION JOURNAL WINDOW CONTRACT 7/7 PASS");
