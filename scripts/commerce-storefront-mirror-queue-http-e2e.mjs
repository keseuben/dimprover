import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY=required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("STOREFRONT_QUEUE_E2E_BASE").replace(/\/$/,"");
const HOST=process.env.STOREFRONT_QUEUE_E2E_HOST?.trim()||"app.dev.dimpro.hu";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const regular=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`storefront-queue-${marker}@example.invalid`;
const password=`Sq!${randomBytes(18).toString("base64url")}8R`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
let authUserId="",dimproUserId="",membershipId="",organizationId="",reservationId="",legacyOrderId="",attemptId="",commerceOrderId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,{method="GET",body,cookie}={}){const response=await fetch(`${BASE}${path}`,{method,headers:{host:HOST,"x-forwarded-host":HOST,...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}return{status:response.status,raw,json,headers:response.headers};}
async function waitFor(label,probe,{timeoutMs=15000,intervalMs=200}={}){const end=Date.now()+timeoutMs;let last;while(Date.now()<end){last=await probe();if(last?.ok)return last.value;await new Promise(resolve=>setTimeout(resolve,intervalMs));}throw new Error(`${label} timeout: ${JSON.stringify(last)}`);}
async function attempt(){const r=await admin.from("commerce_order_mirror_attempts").select("*").eq("organization_id",organizationId).eq("legacy_order_id",legacyOrderId).is("deleted_at",null).maybeSingle();if(r.error)throw r.error;return r.data;}

try{
  const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").single();if(meta.error)throw meta.error;
  pass("Commerce queue schema is 0.1.13 / 14",meta.data.schema_version==="0.1.13"&&Number(meta.data.migration_count)===14,JSON.stringify(meta.data));
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const dueBefore=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(dueBefore.error)throw dueBefore.error;
  pass("queue E2E starts with zero foreign due jobs",(dueBefore.count||0)===0,String(dueBefore.count||0));

  const createdUser=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:"STOREFRONT_QUEUE_E2E"}});if(createdUser.error||!createdUser.data.user)throw createdUser.error||new Error("Auth fixture create failed");authUserId=createdUser.data.user.id;
  const identity=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:authUserId,full_name:"Storefront Queue QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id").single();if(identity.error||!identity.data)throw identity.error||new Error("Identity fixture create failed");dimproUserId=String(identity.data.id);
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"ADMIN",role_label:"Storefront Queue QA",status:"active",is_primary:true}).select("id").single();if(membership.error||!membership.data)throw membership.error||new Error("Membership fixture create failed");membershipId=String(membership.data.id);
  const signed=await regular.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw signed.error||new Error("Auth session create failed");
  const cookieJar=[];const ssr=createServerClient(SUPABASE_URL,ANON_KEY,{cookies:{getAll(){return[];},setAll(next){cookieJar.splice(0,cookieJar.length,...next);}}});const setSession=await ssr.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});if(setSession.error)throw setSession.error;const cookie=cookieJar.map(item=>`${item.name}=${item.value}`).join("; ");
  pass("authenticated admin SSR session prepared",cookieJar.length>0,String(cookieJar.length));

  const catalog=await api("/api/aruter/public-products?businessSlug=kovacs-kerteszet");
  const product=catalog.json?.data?.products?.find?.(item=>item.id==="prod-001");
  pass("public storefront catalog is available without Commerce session",catalog.status===200&&catalog.json?.ok===true&&Boolean(product),`${catalog.status} ${catalog.raw.slice(0,300)}`);

  const reservation=await api("/api/aruter/public-reservations",{method:"POST",body:{businessSlug:"kovacs-kerteszet",product:{id:"prod-001",name:"TAMPERED",price:1,unit:"kg"},quantity:1,pickupSlotId:"slot-1500",pickupSlotLabel:"15:00",customerName:"Storefront Queue QA",phone:"+36 30 000 0000",email:"storefront-queue@example.invalid",acceptedPrivacy:true}});
  pass("public reservation remains HTTP 201 without user session",reservation.status===201&&reservation.json?.ok===true,`${reservation.status} ${reservation.raw.slice(0,500)}`);
  reservationId=String(reservation.json?.data?.id||"");assert.ok(reservationId,"Reservation id hiányzik");

  const order=await waitFor("legacy cashier order",async()=>{const r=await api("/api/aruter/orders");const item=r.json?.data?.find?.(entry=>entry.note?.includes?.(`[PUBLIC_RESERVATION:${reservationId}]`));return{ok:r.status===200&&Boolean(item),value:item};});
  legacyOrderId=String(order.id);pass("public reservation creates one legacy cashier order",order.status==="sent_to_cashier"&&Boolean(legacyOrderId),JSON.stringify(order));

  const pending=await waitFor("persistent queue",async()=>{const row=await attempt();return{ok:row?.state==="PENDING",value:row};});
  attemptId=String(pending.id);
  pass("public bridge persists PENDING Commerce queue job",pending.state==="PENDING"&&pending.legacy_order_id===legacyOrderId,JSON.stringify(pending));
  pass("queued job has zero attempts and no last-attempt timestamp",Number(pending.attempt_count)===0&&pending.last_attempt_at===null,JSON.stringify(pending));
  pass("queued job is immediately due",Boolean(pending.next_retry_at)&&Date.parse(pending.next_retry_at)<=Date.now()+2000,String(pending.next_retry_at));
  pass("queued snapshot is authoritative cashier order",pending.order_number===order.orderNumber&&pending.legacy_status==="sent_to_cashier"&&pending.legacy_order_payload?.items?.[0]?.sku==="KERT-TUJA-120",JSON.stringify(pending.legacy_order_payload));

  const audit=await admin.from("commerce_audit_events").select("id,actor_user_id,metadata").eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);if(audit.error)throw audit.error;
  const outbox=await admin.from("commerce_outbox_events").select("id,event_type,payload").eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);if(outbox.error)throw outbox.error;
  pass("queue writes null-actor audit event",audit.data.length===1&&audit.data[0]?.actor_user_id===null,JSON.stringify(audit.data));
  pass("queue writes one persistent outbox event",outbox.data.length===1&&outbox.data[0]?.payload?.source==="STOREFRONT_SERVICE_QUEUE",JSON.stringify(outbox.data));

  const retry=await api("/api/v1/commerce/mirror/reconciliation/retry-due",{method:"POST",cookie,body:{limit:10}});
  pass("authenticated admin retry-due processes queued job",retry.status===200&&retry.json?.ok===true&&Number(retry.json?.data?.requested)===1&&Number(retry.json?.data?.succeeded)===1,`${retry.status} ${retry.raw.slice(0,800)}`);
  const succeeded=await attempt();commerceOrderId=String(succeeded?.commerce_order_id||"");
  pass("queue job reaches SUCCEEDED after authenticated retry",succeeded?.state==="SUCCEEDED"&&Number(succeeded?.attempt_count)===1&&Boolean(commerceOrderId),JSON.stringify(succeeded));
  const commerce=await api(`/api/v1/commerce/orders/${commerceOrderId}`,{cookie});
  pass("queued Storefront order becomes Commerce cashier order",commerce.status===200&&commerce.json?.data?.status==="SENT_TO_CASHIER",`${commerce.status} ${commerce.raw.slice(0,600)}`);

  const queueAuditBeforeSucceededReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);
  const queueOutboxBeforeSucceededReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);
  if(queueAuditBeforeSucceededReplay.error)throw queueAuditBeforeSucceededReplay.error;if(queueOutboxBeforeSucceededReplay.error)throw queueOutboxBeforeSucceededReplay.error;
  const succeededReplay=await admin.rpc("commerce_order_mirror_enqueue",{p_organization_id:organizationId,p_legacy_order_id:succeeded.legacy_order_id,p_order_number:succeeded.order_number,p_legacy_status:succeeded.legacy_status,p_legacy_order_payload:succeeded.legacy_order_payload});
  if(succeededReplay.error)throw succeededReplay.error;
  pass("identical SUCCEEDED snapshot is a queue no-op",succeededReplay.data?.queued===false&&succeededReplay.data?.duplicate===true,JSON.stringify(succeededReplay.data));
  const afterSucceededReplay=await attempt();
  pass("SUCCEEDED replay preserves succeeded state and attempt count",afterSucceededReplay?.state==="SUCCEEDED"&&Number(afterSucceededReplay?.attempt_count)===1,JSON.stringify(afterSucceededReplay));
  const queueAuditAfterSucceededReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);
  const queueOutboxAfterSucceededReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);
  if(queueAuditAfterSucceededReplay.error)throw queueAuditAfterSucceededReplay.error;if(queueOutboxAfterSucceededReplay.error)throw queueOutboxAfterSucceededReplay.error;
  pass("SUCCEEDED replay emits no extra queue audit or outbox",queueAuditAfterSucceededReplay.count===queueAuditBeforeSucceededReplay.count&&queueOutboxAfterSucceededReplay.count===queueOutboxBeforeSucceededReplay.count,`${queueAuditBeforeSucceededReplay.count}/${queueAuditAfterSucceededReplay.count} ${queueOutboxBeforeSucceededReplay.count}/${queueOutboxAfterSucceededReplay.count}`);

  const cancelled=await api(`/api/aruter/public-reservations/${reservationId}/status`,{method:"PATCH",body:{status:"cancelled"}});
  pass("public cancellation remains HTTP success",cancelled.status===200&&cancelled.json?.data?.status==="cancelled",`${cancelled.status} ${cancelled.raw.slice(0,400)}`);
  const requeued=await waitFor("cancel requeue",async()=>{const row=await attempt();return{ok:row?.state==="PENDING"&&row?.legacy_status==="cancelled",value:row};});
  pass("cancellation requeues same attempt with latest status",String(requeued.id)===attemptId&&String(requeued.commerce_order_id)===commerceOrderId&&Number(requeued.attempt_count)===1&&requeued.last_attempt_at===null,JSON.stringify(requeued));
  const queueAuditBeforePendingReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);
  const queueOutboxBeforePendingReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);
  if(queueAuditBeforePendingReplay.error)throw queueAuditBeforePendingReplay.error;if(queueOutboxBeforePendingReplay.error)throw queueOutboxBeforePendingReplay.error;
  const replayCancel=await api(`/api/aruter/public-reservations/${reservationId}/status`,{method:"PATCH",body:{status:"cancelled"}});
  pass("identical cancellation replay remains HTTP success",replayCancel.status===200&&replayCancel.json?.ok===true,`${replayCancel.status}`);
  await new Promise(resolve=>setTimeout(resolve,300));
  const afterPendingReplay=await attempt();
  pass("identical PENDING cancellation snapshot remains one pending attempt",afterPendingReplay?.state==="PENDING"&&Number(afterPendingReplay?.attempt_count)===1&&String(afterPendingReplay?.id)===attemptId,JSON.stringify(afterPendingReplay));
  const queueAuditAfterPendingReplay=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_QUEUED").eq("entity_id",attemptId);
  const queueOutboxAfterPendingReplay=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","LEGACY_ORDER_MIRROR_QUEUED").eq("aggregate_id",attemptId);
  if(queueAuditAfterPendingReplay.error)throw queueAuditAfterPendingReplay.error;if(queueOutboxAfterPendingReplay.error)throw queueOutboxAfterPendingReplay.error;
  pass("PENDING replay emits no extra queue audit or outbox",queueAuditAfterPendingReplay.count===queueAuditBeforePendingReplay.count&&queueOutboxAfterPendingReplay.count===queueOutboxBeforePendingReplay.count,`${queueAuditBeforePendingReplay.count}/${queueAuditAfterPendingReplay.count} ${queueOutboxBeforePendingReplay.count}/${queueOutboxAfterPendingReplay.count}`);

  const retryCancel=await api("/api/v1/commerce/mirror/reconciliation/retry-due",{method:"POST",cookie,body:{limit:10}});
  pass("authenticated retry processes cancellation queue",retryCancel.status===200&&retryCancel.json?.ok===true&&Number(retryCancel.json?.data?.requested)===1&&Number(retryCancel.json?.data?.succeeded)===1,`${retryCancel.status} ${retryCancel.raw.slice(0,800)}`);
  const finalAttempt=await attempt();
  pass("same attempt reaches SUCCEEDED second time",finalAttempt?.state==="SUCCEEDED"&&Number(finalAttempt?.attempt_count)===2&&String(finalAttempt?.commerce_order_id)===commerceOrderId,JSON.stringify(finalAttempt));
  const finalOrder=await api(`/api/v1/commerce/orders/${commerceOrderId}`,{cookie});
  pass("same Commerce order reaches CANCELLED",finalOrder.status===200&&finalOrder.json?.data?.status==="CANCELLED",`${finalOrder.status} ${finalOrder.raw.slice(0,600)}`);

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(attemptId)await admin.from("commerce_order_mirror_attempts").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",attemptId).is("deleted_at",null);
  if(commerceOrderId)await admin.from("commerce_orders").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",commerceOrderId).is("deleted_at",null);
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
  if(authUserId)await admin.auth.admin.deleteUser(authUserId).catch(()=>undefined);
}
