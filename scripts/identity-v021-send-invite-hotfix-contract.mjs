import fs from 'node:fs';
const invitation=fs.readFileSync('app/lib/identity-core/invitations.ts','utf8');
const admin=fs.readFileSync('app/lib/identity-core/admin.ts','utf8');
const ui=fs.readFileSync('components/drop/DropPublicWorkflowManager.tsx','utf8');
const route=fs.readFileSync('app/api/dimpro-identity/admin/organization-invitations/route.ts','utf8');
const checks=[
 ['active onboarding supported', invitation.includes('activeMemberOnboarding')],
 ['registered active member blocked', invitation.includes('DIMPRO_ORGANIZATION_MEMBER_ALREADY_REGISTERED')],
 ['active membership preserved on invite', invitation.includes('const membershipPatch = activeMemberOnboarding')],
 ['accept active or invited membership', invitation.includes('["invited", "active"].includes')],
 ['send auto grant switch', admin.includes('input.grantMembershipModules === true')],
 ['send module license validation', admin.includes('DIMPRO_SEND_MODULE_NOT_LICENSED')],
 ['membership module upsert', admin.includes('onConflict: "membership_id,module_code"')],
 ['overview exposes all license modules', !admin.includes('.in("module_code", ["DROP_SEND", "DROP_QUICK_IMAGE_SEND", "DROP_PROJECT_INBOX", "DROP_QUICK_VOICE_NOTE"])')],
 ['UI uses organization invitation API', ui.includes('/api/dimpro-identity/admin/organization-invitations')],
 ['UI no legacy createUser action', !ui.includes('action: "createUser"')],
 ['UI organization invite label', ui.includes('Felhasználó meghívása a szervezeti licencbe')],
 ['UI email send label', ui.includes('Meghívó e-mail küldése')],
 ['UI sends membership grant flag', ui.includes('grantMembershipModules: true')],
 ['UI identity version 0.2.1', ui.includes('DROP 1.2.11 · IDENTITY CORE 0.2.1')],
 ['route sends invitation email', route.includes('sendDimproOrganizationInvitationEmail')],
 ['route reports email delivery', route.includes('emailDelivery')],
];
const failed=checks.filter(([,ok])=>!ok);
console.log(JSON.stringify({ok:failed.length===0,checks:checks.length,failed:failed.map(([name])=>name)},null,2));
if(failed.length) process.exit(1);
