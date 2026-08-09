import assert from "node:assert/strict";
import { createDimproLicenseAdmin, createDimproSendEntitlementAdmin, createDimproSendUserAdmin } from "../app/lib/identity-core/admin";
import { deactivateDimproSendContact, getDimproIdentitySupabaseClient, getDimproSendContextByEntitlementId, recordDimproUploadRulesAcceptance, upsertDimproSendContact, verifyDimproSendEntitlement } from "../app/lib/identity-core/repository";
import { DROP_UPLOAD_RULES_VERSION } from "../app/lib/drop/dropUploadRules";

async function main() {
  const client = getDimproIdentitySupabaseClient();
  const suffix = Date.now().toString().slice(-6).replace(/[01]/g,"2");
  const email = `drop-v125-identity-${Date.now()}@example.invalid`;
  const sendCode = `VCTX-${suffix.slice(0,3)}-${suffix.slice(3)}`;
  const licenseCode = `LIC-26-VCTX-${suffix.slice(-4)}`;
  let userId="", organizationId="", licenseId="", entitlementId="", contactId="";
  const checks:string[]=[];
  const pass=(name:string,value:unknown)=>{assert.ok(value,name);checks.push(name);};
  try {
    const user=await createDimproSendUserAdmin({fullName:"DROP 1.2.5 Contact Rules E2E",email,phone:"+36 30 125 0125",organizationName:`DIMPRO V125 Contact Org ${suffix}`,emailVerified:true});
    userId=String(user.user.id||""); organizationId=String(user.organization?.id||"");
    pass("central-user",userId.length>20);
    const license=await createDimproLicenseAdmin({publicLicenseCode:licenseCode,ownerType:"user",ownerUserId:userId,productCode:"DIMPRO_DROP",planCode:"SEND",status:"active",activatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString(),maxDevices:1,modules:[{moduleCode:"DROP_SEND",enabled:true},{moduleCode:"DROP_QUICK_IMAGE_SEND",enabled:true}]});
    licenseId=String(license.id||""); pass("license",licenseId.length>20);
    const entitlement=await createDimproSendEntitlementAdmin({sendCode,userId,licenseId,recipientMode:"free_entry",recipients:[],expiresAt:new Date(Date.now()+20*86400000).toISOString(),canUseStandardSend:true,canUseQuickImageSend:true,canUseImageGroups:true,canUseFileComments:true,canUseProjectDrop:false,maxRecipients:6,maxSavedContacts:4,maxPackageSizeBytes:250*1024*1024,monthlySendLimit:null});
    entitlementId=String(entitlement.result.entitlementId||""); pass("entitlement",entitlementId.length>20);
    const verified=await verifyDimproSendEntitlement(sendCode,new Headers({"user-agent":"DROP V125 identity test","x-forwarded-for":"198.51.100.125"}));
    pass("send-code-usable",verified.ok===true);
    const context=await getDimproSendContextByEntitlementId(entitlementId);
    pass("max-recipients-6",context.entitlement.maxRecipients===6);
    pass("saved-contacts-limit-4",context.entitlement.maxSavedContacts===4);
    pass("rules-initial-0",context.entitlement.uploadRulesAcceptanceCount===0);

    const created=await upsertDimproSendContact({entitlementId,name:"Csató Ferenc",email:"csato.ferenc.v125@example.invalid",organizationName:"NAGISZ"});
    contactId=created.id; pass("contact-created",Boolean(contactId));
    const updated=await upsertDimproSendContact({entitlementId,contactId,name:"Csató Ferenc módosított",email:"csato.ferenc.v125@example.invalid",organizationName:"NAGISZ Zrt."});
    pass("contact-updated",updated.name.includes("módosított")&&updated.organizationName==="NAGISZ Zrt.");
    const contextWithContact=await getDimproSendContextByEntitlementId(entitlementId);
    pass("contact-visible",contextWithContact.recipients.some((row)=>row.id===contactId&&row.email==="csato.ferenc.v125@example.invalid"));
    await deactivateDimproSendContact(entitlementId,contactId);
    const afterDelete=await getDimproSendContextByEntitlementId(entitlementId);
    pass("contact-removed",afterDelete.recipients.every((row)=>row.id!==contactId));

    for(let expected=1;expected<=3;expected++){
      const row=await recordDimproUploadRulesAcceptance(entitlementId,DROP_UPLOAD_RULES_VERSION);
      pass(`rules-accept-${expected}`,Number(row.upload_rules_acceptance_count)===expected&&row.upload_rules_version===DROP_UPLOAD_RULES_VERSION);
    }
    const fourth=await recordDimproUploadRulesAcceptance(entitlementId,DROP_UPLOAD_RULES_VERSION);
    pass("rules-clamped-at-3",Number(fourth.upload_rules_acceptance_count)===3);
    const finalContext=await getDimproSendContextByEntitlementId(entitlementId);
    pass("rules-final-context",finalContext.entitlement.uploadRulesAcceptanceCount===3&&finalContext.entitlement.uploadRulesVersion===DROP_UPLOAD_RULES_VERSION);
    console.log(JSON.stringify({ok:true,version:"DROP 1.2.5",checks:checks.length,names:checks},null,2));
  } finally {
    if(entitlementId){await client.from("drop_public_sessions").delete().eq("dimpro_send_entitlement_id",entitlementId);await client.from("drop_public_package_workflows").delete().eq("dimpro_send_entitlement_id",entitlementId);await client.from("dimpro_send_recipients").delete().eq("entitlement_id",entitlementId);await client.from("dimpro_access_audit_logs").delete().eq("entitlement_id",entitlementId);await client.from("dimpro_send_entitlements").delete().eq("id",entitlementId);}
    if(licenseId){await client.from("dimpro_license_modules").delete().eq("license_id",licenseId);await client.from("dimpro_access_audit_logs").delete().eq("license_id",licenseId);await client.from("dimpro_licenses").delete().eq("id",licenseId);}
    if(userId){await client.from("dimpro_access_audit_logs").delete().eq("user_id",userId);await client.from("dimpro_organization_memberships").delete().eq("user_id",userId);await client.from("dimpro_users").delete().eq("id",userId);}
    if(organizationId){await client.from("dimpro_organizations").delete().eq("id",organizationId);}
  }
}
main().catch((error)=>{console.error(error);process.exit(1)});
