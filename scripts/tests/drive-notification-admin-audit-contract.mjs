import assert from "node:assert/strict";
import { projectAdminDeliveryAudit } from "../../app/lib/drive-notifications/adminAuditProjection.ts";
const delivery=(id,project_id,user_id)=>({
  id,project_id,user_id,category:"DOCUMENT_CHANGES",scheduled_slot:"2026-10-10T07:00-Europe/Budapest",
  status:"SENT",attempt_count:1,created_at:"2026-10-10T05:00:00Z",
  sent_at:"2026-10-10T05:02:00Z",completed_at:"2026-10-10T05:02:00Z",
  last_error_code:null,recipient_email_sha256:"a".repeat(64),
});
const rows=projectAdminDeliveryAudit("project-A",[
  delivery("1","project-A","user-1"),
  delivery("2","project-B","user-2"),
  delivery("3","project-A","former-user"),
],[{userId:"user-1",email:"new-address@example.com",displayName:"Teszt Felhasználó",
  role:"OWNER",status:"ACTIVE"}],(r)=>r==="OWNER"?"Projektgazda":r);
assert.equal(rows.length,2,"project isolation");
assert.equal(rows[0].recipient.displayName,"Teszt Felhasználó");
assert.equal(rows[0].recipient.currentProjectRole,"Projektgazda");
assert.equal(rows[0].recipient.currentProjectEmail,"new-address@example.com");
assert.equal(rows[0].recipient.sentRecipientEmailSha256,"a".repeat(64));
assert.ok(!("actualRecipientEmail" in rows[0].recipient),"never claim current email was historical recipient");
assert.equal(rows[1].recipient.currentProjectEmail,null,"unresolved historical user");
assert.equal(rows[1].recipient.membershipStatus,null);
console.log("DRIVE NOTIFICATION ADMIN AUDIT CONTRACT 8/8 PASS");
