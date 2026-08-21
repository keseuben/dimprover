import assert from "node:assert/strict";
import { getDimproSendContextByEntitlementId } from "../app/lib/identity-core/repository";
import { requireFieldCaptureProjectDriveWriteAccess } from "../app/lib/field-capture/projectDriveService";
import type { FieldCaptureServerSession } from "../app/lib/field-capture/serverRepository";

const ENTITLEMENT_ID=process.env.TEREP_TEST_ENTITLEMENT_ID?.trim()||"1419cf53-f49a-4818-a0c2-b87c0850a2e4";
const WRITABLE_PROJECT=process.env.TEREP_P91_TEST_PROJECT_CORE_ID?.trim()||"project-040c0035-191";
function session(projectId:string|null):FieldCaptureServerSession{return{id:"00000000-0000-4000-8000-000000000091",clientSessionId:"p91-acl-e2e",userId:"",entitlementId:ENTITLEMENT_ID,projectId,status:"ACTIVE",startedAt:new Date().toISOString(),closedAt:null,updatedAt:new Date().toISOString()}}
async function expectCode(run:()=>Promise<unknown>,code:string){let actual="";try{await run()}catch(error){actual=String((error as {code?:unknown})?.code||"")}assert.equal(actual,code)}
async function main(){
 const context=await getDimproSendContextByEntitlementId(ENTITLEMENT_ID);
 const access=await requireFieldCaptureProjectDriveWriteAccess({session:session(WRITABLE_PROJECT),userId:context.user.id,userEmail:context.user.email});
 assert.equal(access.project.id,WRITABLE_PROJECT); assert.equal(access.membership.status,"ACTIVE"); assert.ok(access.permissions.includes("document.write")); console.log(`PASS 1 canonical active membership grants document.write (${access.membership.role})`);
 await expectCode(()=>requireFieldCaptureProjectDriveWriteAccess({session:session(null),userId:context.user.id,userEmail:context.user.email}),"FIELD_CAPTURE_PROJECT_DRIVE_PROJECT_REQUIRED"); console.log("PASS 2 projectless session fails closed");
 await expectCode(()=>requireFieldCaptureProjectDriveWriteAccess({session:session("project-does-not-exist"),userId:context.user.id,userEmail:context.user.email}),"FIELD_CAPTURE_PROJECT_DRIVE_MEMBERSHIP_REQUIRED"); console.log("PASS 3 unknown/unowned project fails closed");
 const foreignUser=`00000000-0000-4000-8000-${Date.now().toString().slice(-12).padStart(12,"0")}`;
 await expectCode(()=>requireFieldCaptureProjectDriveWriteAccess({session:session(WRITABLE_PROJECT),userId:foreignUser,userEmail:"p91-no-member@example.invalid"}),"FIELD_CAPTURE_PROJECT_DRIVE_MEMBERSHIP_REQUIRED"); console.log("PASS 4 non-member user fails closed");
 console.log("FIELD_CAPTURE_P91_PROJECT_ACL_RUNTIME_E2E 4/4 PASS");
}
main().catch(e=>{console.error(e);process.exit(1)});
