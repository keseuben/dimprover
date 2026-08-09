import assert from 'node:assert/strict';
import { createDimproSendUserAdmin } from '../app/lib/identity-core/admin';
import { getDimproIdentitySupabaseClient } from '../app/lib/identity-core/repository';

async function main(){
 const c=getDimproIdentitySupabaseClient();
 const suffix=Date.now().toString().slice(-6); const email=`drop-v123-existing-${suffix}@example.invalid`;
 let userId=''; let orgId='';
 try{
  const created=await c.rpc('dimpro_create_user',{p_full_name:'Régi név',p_email:email,p_auth_user_id:null,p_phone:null,p_created_by:null});
  if(created.error) throw created.error;
  userId=String(((created.data || {}) as Record<string, unknown>).id || '');
  const before=await c.from('dimpro_users').select('id,email_verified_at,status').eq('id',userId).single();
  if(before.error)throw before.error;
  assert.equal(before.data.email_verified_at,null);
  const result=await createDimproSendUserAdmin({fullName:'Frissített Send felhasználó',email,phone:'+36 20 555 0101',organizationName:`V123 Existing ${suffix}`,emailVerified:true});
  orgId=String(result.organization?.id||'');
  assert.equal(result.user.id,userId,'nem hozhat létre duplikált felhasználót');
  assert.equal(result.user.full_name,'Frissített Send felhasználó');
  assert.equal(result.user.status,'active');
  assert.ok(result.user.email_verified_at);
  assert.equal(result.user.phone,'+36 20 555 0101');
  const count=await c.from('dimpro_users').select('id',{count:'exact',head:true}).eq('email_normalized',email);
  if(count.error)throw count.error;
  assert.equal(count.count,1);
  console.log(JSON.stringify({ok:true,checks:7,names:['pending-user-created','same-user-reused','name-updated','user-active','email-verified','phone-updated','no-duplicate-user']},null,2));
 }finally{
  if(userId) await c.from('dimpro_access_audit_logs').delete().eq('user_id',userId);
  if(userId) await c.from('dimpro_organization_memberships').delete().eq('user_id',userId);
  if(userId) await c.from('dimpro_users').delete().eq('id',userId);
  if(orgId) await c.from('dimpro_organizations').delete().eq('id',orgId);
 }
}
main().catch(e=>{console.error(e);process.exit(1)});
