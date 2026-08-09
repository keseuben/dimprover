import assert from 'node:assert/strict';
import { createDimproSendUserAdmin, createDimproLicenseAdmin, createDimproSendEntitlementAdmin } from '../app/lib/identity-core/admin';
import { getDimproIdentitySupabaseClient, verifyDimproSendEntitlement } from '../app/lib/identity-core/repository';

async function main() {
  const client = getDimproIdentitySupabaseClient();
  const suffix = Date.now().toString().slice(-6);
  const email = `drop-v123-user-${suffix}@example.invalid`;
  const sendCode = `TEST-${suffix.slice(0,3)}-${suffix.slice(3)}`;
  const licenseCode = `LIC-26-TSTX-${suffix.slice(-4).replace(/[01]/g,'2')}`;
  let userId=''; let orgId=''; let licenseId=''; let entitlementId='';
  const checks:string[]=[];
  const pass=(name:string, ok:boolean)=>{assert.ok(ok,name);checks.push(name)};
  try {
    const createdUser = await createDimproSendUserAdmin({
      fullName: 'DIMPRO Send V123 Teszt', email, phone: '+36 30 123 4567', organizationName: `DIMPRO V123 Test ${suffix}`, emailVerified: true,
    });
    userId=String(createdUser.user.id||''); orgId=String(createdUser.organization?.id||'');
    pass('central-user-created', userId.length>20);
    pass('email-verified', Boolean(createdUser.user.email_verified_at));
    pass('phone-saved', createdUser.user.phone === '+36 30 123 4567');
    pass('organization-linked', orgId.length>20);

    const license = await createDimproLicenseAdmin({
      publicLicenseCode: licenseCode, ownerType:'user', ownerUserId:userId, productCode:'DIMPRO_DROP', planCode:'SEND', status:'active',
      activatedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+30*86400000).toISOString(), maxDevices:1,
      modules:[{moduleCode:'DROP_SEND',enabled:true},{moduleCode:'DROP_QUICK_IMAGE_SEND',enabled:true}],
    });
    licenseId=String(license.id||'');
    pass('license-created', licenseId.length>20 && license.public_license_code===licenseCode);

    const entitlement = await createDimproSendEntitlementAdmin({
      sendCode,userId,licenseId,recipientMode:'free_entry',recipients:[],expiresAt:new Date(Date.now()+20*86400000).toISOString(),
      canUseStandardSend:true,canUseQuickImageSend:true,canUseImageGroups:true,canUseFileComments:true,canUseProjectDrop:false,
      maxRecipients:3,maxPackageSizeBytes:250*1024*1024,monthlySendLimit:null,
    });
    entitlementId=String(entitlement.result.entitlementId||'');
    pass('entitlement-created', entitlementId.length>20 && entitlement.formattedCode===sendCode);

    const verified = await verifyDimproSendEntitlement(sendCode, new Headers({'user-agent':'DIMPRO V123 chain test','x-forwarded-for':'198.51.100.123'}));
    pass('send-code-usable', verified.ok===true);
    if (verified.ok) {
      pass('verified-user-matches', verified.user.id===userId && verified.user.email===email);
      pass('verified-standard-send', verified.entitlement.canUseStandardSend===true);
      pass('verified-quick-send', verified.entitlement.canUseQuickImageSend===true);
      pass('verified-organization', verified.user.organizationName===`DIMPRO V123 Test ${suffix}`);
    }
    console.log(JSON.stringify({ok:true,checks:checks.length,names:checks},null,2));
  } finally {
    if(entitlementId) await client.from('dimpro_access_audit_logs').delete().eq('entitlement_id',entitlementId);
    if(entitlementId) await client.from('dimpro_send_entitlements').delete().eq('id',entitlementId);
    if(licenseId) await client.from('dimpro_access_audit_logs').delete().eq('license_id',licenseId);
    if(licenseId) await client.from('dimpro_licenses').delete().eq('id',licenseId);
    if(userId) await client.from('dimpro_access_audit_logs').delete().eq('user_id',userId);
    if(userId) await client.from('dimpro_organization_memberships').delete().eq('user_id',userId);
    if(userId) await client.from('dimpro_users').delete().eq('id',userId);
    if(orgId) await client.from('dimpro_organizations').delete().eq('id',orgId);
  }
}
main().catch((e)=>{console.error(e);process.exit(1)});
