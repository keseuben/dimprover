import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY=required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("COMMERCE_MIRROR_E2E_BASE").replace(/\/$/,"");
const HOST=process.env.COMMERCE_MIRROR_E2E_HOST?.trim()||"aruter.dev.dimpro.hu";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const regular=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`commerce-mirror-${marker}@example.invalid`;
const password=`Cm!${randomBytes(18).toString("base64url")}7Z`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
let authUserId="",dimproUserId="",membershipId="",organizationId="",legacyOrderId="",commerceOrderId="",attemptId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,{method="GET",body,cookie}={}){
  const response=await fetch(`${BASE}${path}`,{method,headers:{host:HOST,"x-forwarded-host":HOST,...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});
  const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}
  return{status:response.status,raw,json,headers:response.headers};
}
async function waitFor(label,probe,{timeoutMs=15000,intervalMs=250}={}){const end=Date.now()+timeoutMs;let last;while(Date.now()<end){last=await probe();if(last?.ok)return last.value;await new Promise(resolve=>setTimeout(resolve,intervalMs));}throw new Error(`${label} timeout: ${JSON.stringify(last)}`);}

try{
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();
  if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:"COMMERCE_LEGACY_MIRROR_HTTP_E2E"}});
  if(created.error||!created.data.user)throw created.error||new Error("Auth fixture create failed");authUserId=created.data.user.id;
  const identity=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:authUserId,full_name:"Commerce Mirror HTTP QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id").single();
  if(identity.error||!identity.data)throw identity.error||new Error("Identity fixture create failed");dimproUserId=String(identity.data.id);
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"ADMIN",role_label:"Commerce Mirror HTTP QA",status:"active",is_primary:true}).select("id").single();
  if(membership.error||!membership.data)throw membership.error||new Error("Membership fixture create failed");membershipId=String(membership.data.id);

  const signed=await regular.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw signed.error||new Error("Auth session create failed");
  const cookieJar=[];
  const ssr=createServerClient(SUPABASE_URL,ANON_KEY,{cookies:{getAll(){return[];},setAll(next){cookieJar.splice(0,cookieJar.length,...next);}}});
  const setSession=await ssr.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});if(setSession.error)throw setSession.error;
  const cookie=cookieJar.map(item=>`${item.name}=${item.value}`).join("; ");
  pass("authenticated SSR cookie prepared",cookieJar.length>0,String(cookieJar.length));

  let response=await api("/api/v1/commerce/context",{cookie});
  pass("Commerce context endpoint accepts fixture session",response.status===200&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,300)}`);
  pass("Commerce context resolves expected organization",response.json?.context?.organizationId===organizationId,String(response.json?.context?.organizationId||""));
  pass("Commerce context grants reconciliation permission",response.json?.context?.permissions?.includes("commerce.order.reconcile")===true,JSON.stringify(response.json?.context?.permissions||[]));

  response=await api("/api/aruter/orders",{method:"POST",cookie,body:{template:"egyedi",customerName:"HTTP Mirror QA",customerType:"walk_in",recorderName:"OutminAI HTTP QA",items:[{id:`legacy-item-${marker}`,productId:`legacy-product-${marker}`,productName:"HTTP nem azonosított tétel",sku:`HTTP-UNMAPPED-${marker}`,unit:"db",quantity:2,priceNet:1900,vatRate:27,storageZone:"QA"}]}});
  pass("legacy order create remains HTTP 201",response.status===201&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,500)}`);
  legacyOrderId=String(response.json?.data?.id||"");assert.ok(legacyOrderId,"Legacy order id hiányzik");

  const sentAttempt=await waitFor("sent mirror",async()=>{const r=await api("/api/v1/commerce/mirror/reconciliation?limit=200",{cookie});const item=r.json?.data?.find?.(entry=>entry.legacyOrderId===legacyOrderId);return{ok:r.status===200&&item?.state==="SUCCEEDED",value:item||r.json};});
  attemptId=String(sentAttempt.id);commerceOrderId=String(sentAttempt.commerceOrderId);
  pass("Next after() persists SUCCEEDED reconciliation after legacy create",Boolean(attemptId&&commerceOrderId));
  pass("unmapped legacy item remains explicitly unresolved",sentAttempt.unresolvedItemCount===1&&sentAttempt.mappedItemCount===0,JSON.stringify(sentAttempt));

  response=await api("/api/v1/commerce/orders?cashierQueue=true&limit=200",{cookie});
  const queueOrder=response.json?.data?.find?.(item=>item.id===commerceOrderId);
  pass("mirrored external order is visible in Commerce cashier queue",response.status===200&&queueOrder?.sourceChannel==="EXTERNAL_MARKETPLACE",`${response.status}`);

  response=await api(`/api/aruter/orders/${legacyOrderId}/status`,{method:"PATCH",cookie,body:{status:"paid"}});
  pass("legacy cashier paid update remains successful",response.status===200&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,300)}`);
  await waitFor("paid mirror",async()=>{const r=await api(`/api/v1/commerce/orders/${commerceOrderId}`,{cookie});return{ok:r.status===200&&r.json?.data?.status==="PAID",value:r.json?.data};});
  const paidAttempt=await waitFor("paid reconciliation",async()=>{const r=await api("/api/v1/commerce/mirror/reconciliation?limit=200",{cookie});const item=r.json?.data?.find?.(entry=>entry.id===attemptId);return{ok:item?.state==="SUCCEEDED"&&item?.attemptCount>=2,value:item};});
  pass("paid lifecycle mirrors into same Commerce order",paidAttempt.commerceOrderId===commerceOrderId&&paidAttempt.attemptCount>=2,JSON.stringify(paidAttempt));

  response=await api(`/api/aruter/orders/${legacyOrderId}/status`,{method:"PATCH",cookie,body:{status:"issued"}});
  pass("legacy cashier issued update remains successful",response.status===200&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,300)}`);
  const issuedOrder=await waitFor("issued mirror",async()=>{const r=await api(`/api/v1/commerce/orders/${commerceOrderId}`,{cookie});return{ok:r.status===200&&r.json?.data?.status==="ISSUED",value:r.json?.data};});
  pass("issued lifecycle reaches Commerce ISSUED",issuedOrder.status==="ISSUED");
  pass("unresolved item still does not block issue",issuedOrder.items?.[0]?.inventoryStatus==="UNRESOLVED",JSON.stringify(issuedOrder.items||[]));

  response=await api("/api/v1/commerce/orders?cashierQueue=true&limit=200",{cookie});
  pass("issued mirrored order leaves Commerce cashier queue",response.status===200&&!response.json?.data?.some?.(item=>item.id===commerceOrderId));

  const finalAttempt=await waitFor("final reconciliation",async()=>{const r=await api("/api/v1/commerce/mirror/reconciliation?limit=200",{cookie});const item=r.json?.data?.find?.(entry=>entry.id===attemptId);return{ok:item?.state==="SUCCEEDED"&&item?.legacyStatus==="issued"&&item?.attemptCount>=3,value:item};});
  pass("reconciliation snapshot reaches issued state",finalAttempt.legacyStatus==="issued"&&finalAttempt.commerceOrderId===commerceOrderId,JSON.stringify(finalAttempt));

  response=await api("/aruter/admin/egyeztetes",{cookie});
  pass("authenticated reconciliation admin page renders HTTP 200",response.status===200,`${response.status} ${response.headers.get("location")||""}`);
  pass("reconciliation admin HTML contains module title",response.raw.includes("Rendelés-egyeztetés")||response.raw.includes("Rendel%C3%A9s-egyeztet%C3%A9s"),response.raw.slice(0,180));

  response=await api("/aruter/penztar",{cookie});
  pass("legacy cashier route remains reachable",response.status===200,`${response.status} ${response.headers.get("location")||""}`);

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(attemptId)await admin.from("commerce_order_mirror_attempts").update({archived_at:now}).eq("organization_id",organizationId).eq("id",attemptId);
  if(commerceOrderId)await admin.from("commerce_orders").update({archived_at:now}).eq("organization_id",organizationId).eq("id",commerceOrderId);
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
  if(authUserId)await admin.auth.admin.deleteUser(authUserId).catch(()=>undefined);
}
