import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY=required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("STOREFRONT_MULTI_E2E_BASE").replace(/\/$/,"");
const HOST=process.env.STOREFRONT_MULTI_E2E_HOST?.trim()||"app.dev.dimpro.hu";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const regular=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`storefront-multi-${marker}@example.invalid`;
const password=`Sm!${randomBytes(18).toString("base64url")}7K`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
const idempotencyKey=`checkout-${randomUUID()}`;
let authUserId="",dimproUserId="",membershipId="",organizationId="",legacyOrderId="",attemptId="",commerceOrderId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,{method="GET",body,cookie,headers={}}={}){const response=await fetch(`${BASE}${path}`,{method,headers:{host:HOST,"x-forwarded-host":HOST,...headers,...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}return{status:response.status,raw,json};}
async function waitFor(label,probe,{timeoutMs=15000,intervalMs=200}={}){const end=Date.now()+timeoutMs;let last;while(Date.now()<end){last=await probe();if(last?.ok)return last.value;await new Promise(resolve=>setTimeout(resolve,intervalMs));}throw new Error(`${label} timeout: ${JSON.stringify(last)}`);}

const checkoutBody={
  businessSlug:"kovacs-kerteszet",
  items:[{productId:"prod-001",quantity:1},{productId:"prod-002",quantity:2},{productId:"prod-001",quantity:2}],
  pickupSlotId:"slot-1500",pickupSlotLabel:"15:00",customerName:"Storefront Multi QA",phone:"+36 30 111 2222",email:"multi@example.invalid",note:"Multi-item E2E",acceptedPrivacy:true,
};

try{
  const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").single();if(meta.error)throw meta.error;
  pass("Commerce schema is 0.1.13 / 14",meta.data.schema_version==="0.1.13"&&Number(meta.data.migration_count)===14,JSON.stringify(meta.data));
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const due=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(due.error)throw due.error;
  pass("multi-item E2E starts with zero foreign due jobs",(due.count||0)===0,String(due.count||0));

  const createdUser=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:"STOREFRONT_MULTI_ITEM_E2E"}});if(createdUser.error||!createdUser.data.user)throw createdUser.error||new Error("Auth fixture create failed");authUserId=createdUser.data.user.id;
  const identity=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:authUserId,full_name:"Storefront Multi QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id").single();if(identity.error||!identity.data)throw identity.error||new Error("Identity fixture create failed");dimproUserId=String(identity.data.id);
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"ADMIN",role_label:"Storefront Multi QA",status:"active",is_primary:true}).select("id").single();if(membership.error||!membership.data)throw membership.error||new Error("Membership fixture create failed");membershipId=String(membership.data.id);
  const signed=await regular.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw signed.error||new Error("Auth session create failed");
  const cookieJar=[];const ssr=createServerClient(SUPABASE_URL,ANON_KEY,{cookies:{getAll(){return[];},setAll(next){cookieJar.splice(0,cookieJar.length,...next);}}});const setSession=await ssr.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});if(setSession.error)throw setSession.error;const cookie=cookieJar.map(item=>`${item.name}=${item.value}`).join("; ");
  pass("authenticated admin session prepared",cookieJar.length>0,String(cookieJar.length));

  const noKey=await api("/api/aruter/public-checkouts",{method:"POST",body:checkoutBody});
  pass("checkout rejects missing idempotency key",noKey.status===400&&noKey.json?.code==="STOREFRONT_CHECKOUT_IDEMPOTENCY_INVALID",`${noKey.status} ${noKey.raw.slice(0,300)}`);

  const stockFail=await api("/api/aruter/public-checkouts",{method:"POST",headers:{"idempotency-key":`stock-${randomUUID()}`},body:{...checkoutBody,items:[{productId:"prod-001",quantity:99}]}});
  pass("checkout rejects quantity above authoritative stock",stockFail.status===409&&stockFail.json?.code==="STOREFRONT_CHECKOUT_STOCK_EXCEEDED",`${stockFail.status} ${stockFail.raw.slice(0,300)}`);

  const created=await api("/api/aruter/public-checkouts",{method:"POST",headers:{"idempotency-key":idempotencyKey},body:checkoutBody});
  pass("new multi-item checkout returns HTTP 201",created.status===201&&created.json?.ok===true,`${created.status} ${created.raw.slice(0,500)}`);
  legacyOrderId=String(created.json?.data?.orderId||"");assert.ok(legacyOrderId,"Legacy order id hiányzik");
  pass("duplicate product rows aggregate to two order lines",Number(created.json?.data?.lineCount)===2&&Number(created.json?.data?.itemQuantity)===5,JSON.stringify(created.json?.data));
  pass("checkout gross total uses authoritative net and VAT",Math.abs(Number(created.json?.data?.grossTotal)-25717.5)<0.001,String(created.json?.data?.grossTotal));
  pass("new checkout queues Commerce service job",created.json?.data?.commerceQueued===true&&created.json?.data?.reused===false,JSON.stringify(created.json?.data));

  const order=await waitFor("legacy order",async()=>{const r=await api("/api/aruter/orders");const item=r.json?.data?.find?.(entry=>entry.id===legacyOrderId);return{ok:r.status===200&&Boolean(item),value:item};});
  pass("exactly one legacy order contains two authoritative lines",order.items?.length===2&&order.status==="sent_to_cashier",JSON.stringify(order));
  const bySku=new Map(order.items.map(item=>[item.sku,item]));
  pass("tuja duplicate rows aggregate to quantity 3",Number(bySku.get("KERT-TUJA-120")?.quantity)===3,JSON.stringify(order.items));
  pass("mulch line keeps quantity 2",Number(bySku.get("KERT-MULCS-50")?.quantity)===2,JSON.stringify(order.items));
  pass("legacy lines use authoritative net price and VAT",Number(bySku.get("KERT-TUJA-120")?.priceNet)===5490&&Number(bySku.get("KERT-TUJA-120")?.vatRate)===27&&Number(bySku.get("KERT-MULCS-50")?.priceNet)===1890&&Number(bySku.get("KERT-MULCS-50")?.vatRate)===27,JSON.stringify(order.items));
  pass("raw idempotency key is not stored in order note",!String(order.note||"").includes(idempotencyKey)&&String(order.note||"").includes("[PUBLIC_CHECKOUT:")&&String(order.note||"").includes("[CHECKOUT_PAYLOAD:"),String(order.note||""));

  const pending=await waitFor("queue attempt",async()=>{const r=await admin.from("commerce_order_mirror_attempts").select("*").eq("organization_id",organizationId).eq("legacy_order_id",legacyOrderId).is("deleted_at",null).maybeSingle();if(r.error)throw r.error;return{ok:r.data?.state==="PENDING",value:r.data};});
  attemptId=String(pending.id);pass("one PENDING queue attempt contains both legacy items",pending.legacy_order_payload?.items?.length===2&&Number(pending.attempt_count)===0,JSON.stringify(pending));
  const auditBeforeReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);const outboxBeforeReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);if(auditBeforeReplay.error)throw auditBeforeReplay.error;if(outboxBeforeReplay.error)throw outboxBeforeReplay.error;

  const replayBody={...checkoutBody,items:[{productId:"prod-002",quantity:2},{productId:"prod-001",quantity:3}]};
  const replay=await api("/api/aruter/public-checkouts",{method:"POST",headers:{"idempotency-key":idempotencyKey},body:replayBody});
  pass("same key and canonical-equivalent payload returns HTTP 200",replay.status===200&&replay.json?.ok===true&&replay.json?.data?.reused===true,`${replay.status} ${replay.raw.slice(0,500)}`);
  pass("idempotent replay returns same legacy order",String(replay.json?.data?.orderId)===legacyOrderId,JSON.stringify(replay.json?.data));
  await new Promise(resolve=>setTimeout(resolve,250));
  const ordersAfterReplay=await api("/api/aruter/orders");
  pass("idempotent replay creates no second legacy order",ordersAfterReplay.json?.data?.filter?.(entry=>entry.id===legacyOrderId).length===1,String(ordersAfterReplay.json?.data?.length));
  const auditAfterReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);const outboxAfterReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);if(auditAfterReplay.error)throw auditAfterReplay.error;if(outboxAfterReplay.error)throw outboxAfterReplay.error;
  pass("idempotent replay adds no queue audit or outbox",auditAfterReplay.count===auditBeforeReplay.count&&outboxAfterReplay.count===outboxBeforeReplay.count,`${auditBeforeReplay.count}/${auditAfterReplay.count} ${outboxBeforeReplay.count}/${outboxAfterReplay.count}`);

  const mismatch=await api("/api/aruter/public-checkouts",{method:"POST",headers:{"idempotency-key":idempotencyKey},body:{...checkoutBody,items:[{productId:"prod-001",quantity:4},{productId:"prod-002",quantity:2}]}});
  pass("same idempotency key with changed payload is rejected",mismatch.status===409&&mismatch.json?.code==="STOREFRONT_CHECKOUT_IDEMPOTENCY_PAYLOAD_MISMATCH",`${mismatch.status} ${mismatch.raw.slice(0,400)}`);

  const retry=await api("/api/v1/commerce/mirror/reconciliation/retry-due",{method:"POST",cookie,body:{limit:10}});
  pass("authenticated retry processes exactly one checkout queue job",retry.status===200&&Number(retry.json?.data?.requested)===1&&Number(retry.json?.data?.succeeded)===1,`${retry.status} ${retry.raw.slice(0,700)}`);
  const finalAttempt=await admin.from("commerce_order_mirror_attempts").select("*").eq("organization_id",organizationId).eq("id",attemptId).single();if(finalAttempt.error)throw finalAttempt.error;commerceOrderId=String(finalAttempt.data.commerce_order_id||"");
  pass("checkout queue reaches SUCCEEDED with Commerce order id",finalAttempt.data.state==="SUCCEEDED"&&Boolean(commerceOrderId),JSON.stringify(finalAttempt.data));
  const commerce=await api(`/api/v1/commerce/orders/${commerceOrderId}`,{cookie});
  pass("one Commerce order contains both checkout lines",commerce.status===200&&commerce.json?.data?.status==="SENT_TO_CASHIER"&&commerce.json?.data?.items?.length===2,`${commerce.status} ${commerce.raw.slice(0,1000)}`);

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(attemptId)await admin.from("commerce_order_mirror_attempts").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",attemptId).is("deleted_at",null);
  if(commerceOrderId)await admin.from("commerce_orders").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",commerceOrderId).is("deleted_at",null);
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
  if(authUserId)await admin.auth.admin.deleteUser(authUserId).catch(()=>undefined);
}
