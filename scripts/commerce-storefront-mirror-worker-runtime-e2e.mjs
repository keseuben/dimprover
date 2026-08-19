import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`storefront-worker-${marker}@example.invalid`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
let organizationId="",dimproUserId="",membershipId="",attemptId="",commerceOrderId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
function runWorker(actorUserId,{check=false}={}){
  const args=["-r","./scripts/load-next-env.cjs","./scripts/run-commerce-storefront-mirror-worker.mjs"];
  if(check)args.push("--check");
  const result=spawnSync(process.execPath,args,{
    cwd:process.cwd(),encoding:"utf8",maxBuffer:8*1024*1024,
    env:{...process.env,DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ENABLED:"1",ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID:organizationId,DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ACTOR_USER_ID:actorUserId,DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_LIMIT:"5",ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID:""},
  });
  let json=null;
  const output=`${result.stdout||""}\n${result.stderr||""}`.trim();
  for(const line of output.split(/\r?\n/).reverse()){try{json=JSON.parse(line);break}catch{}}
  return{status:result.status,stdout:result.stdout||"",stderr:result.stderr||"",json};
}

try{
  const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").single();if(meta.error)throw meta.error;
  pass("worker E2E runs on Commerce 0.1.13 / 14",meta.data.schema_version==="0.1.13"&&Number(meta.data.migration_count)===14,JSON.stringify(meta.data));
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const dueBefore=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(dueBefore.error)throw dueBefore.error;
  pass("worker E2E starts with zero foreign due jobs",(dueBefore.count||0)===0,String(dueBefore.count||0));

  const user=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:null,full_name:"Storefront Mirror Worker QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id,auth_user_id").single();if(user.error||!user.data)throw user.error||new Error("DIMPRO technical QA user create failed");dimproUserId=String(user.data.id);
  pass("temporary non-interactive DIMPRO technical actor created",Boolean(dimproUserId)&&user.data.auth_user_id===null,JSON.stringify(user.data));
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"USER",role_label:"Storefront Mirror Worker QA",status:"active",is_primary:false}).select("id").single();if(membership.error||!membership.data)throw membership.error||new Error("QA membership create failed");membershipId=String(membership.data.id);
  pass("technical actor starts with underprivileged USER membership",Boolean(dimproUserId&&membershipId));
  const denied=runWorker(dimproUserId,{check:true});
  pass("underprivileged USER worker check is rejected by dedicated role gate",denied.status===1&&denied.json?.ok===false&&denied.json?.code==="COMMERCE_SERVICE_ROLE_DENIED",`${denied.status} ${denied.stderr.slice(0,500)}`);
  const promoted=await admin.from("dimpro_organization_memberships").update({role_code:"COMMERCE_MIRROR_WORKER",role_label:"Commerce Mirror Worker"}).eq("id",membershipId).select("id,role_code").single();if(promoted.error)throw promoted.error;
  pass("same technical actor receives dedicated mirror worker role",String(promoted.data.role_code).toUpperCase()==="COMMERCE_MIRROR_WORKER",JSON.stringify(promoted.data));
  const readiness=runWorker(dimproUserId,{check:true});
  pass("dedicated non-interactive worker actor passes read-only readiness",readiness.status===0&&readiness.json?.ok===true&&readiness.json?.checkOnly===true&&readiness.json?.roleCode==="COMMERCE_MIRROR_WORKER"&&Number(readiness.json?.dueCount)===0,`${readiness.status} ${readiness.stdout.slice(0,500)} ${readiness.stderr.slice(0,300)}`);

  const orderNumber=`AR-WORKER-${Date.now()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const legacyOrder={
    id:`worker-qa-${marker}`,orderNumber,template:"kertészet",status:"sent_to_cashier",customerName:"Storefront Mirror Worker QA",customerType:"walk_in",recorderName:"Worker E2E",
    note:"Storefront mirror worker runtime E2E",items:[{id:`worker-item-${marker}`,productId:"qa-unresolved",productName:"Worker QA unresolved item",sku:`WORKER-QA-${marker}`,unit:"db",quantity:1,priceNet:1000,vatRate:27,storageZone:"QA"}],
    createdAt:new Date().toISOString(),sentToCashierAt:new Date().toISOString(),
  };
  const queued=await admin.rpc("commerce_order_mirror_enqueue",{p_organization_id:organizationId,p_legacy_order_id:legacyOrder.id,p_order_number:legacyOrder.orderNumber,p_legacy_status:legacyOrder.status,p_legacy_order_payload:legacyOrder});if(queued.error)throw queued.error;
  attemptId=String(queued.data?.attemptId||"");
  pass("service queue fixture created PENDING with zero attempts",queued.data?.state==="PENDING"&&Number(queued.data?.attemptCount)===0&&Boolean(attemptId),JSON.stringify(queued.data));

  const before=await admin.from("commerce_order_mirror_attempts").select("state,attempt_count,last_attempt_at,next_retry_at").eq("id",attemptId).single();if(before.error)throw before.error;
  pass("queued fixture is immediately due and never attempted",before.data.state==="PENDING"&&Number(before.data.attempt_count)===0&&before.data.last_attempt_at===null&&Date.parse(before.data.next_retry_at)<=Date.now()+2000,JSON.stringify(before.data));

  const worker=runWorker(dimproUserId);
  pass("worker process exits successfully",worker.status===0,`${worker.status} ${(worker.stderr||"").slice(0,500)}`);
  pass("worker processes exactly one due job",worker.json?.ok===true&&Number(worker.json?.requested)===1&&Number(worker.json?.succeeded)===1&&Number(worker.json?.failed)===0,JSON.stringify(worker.json));
  pass("worker output contains no Supabase service secret",!worker.stdout.includes(SERVICE_KEY)&&!worker.stderr.includes(SERVICE_KEY));

  const attempt=await admin.from("commerce_order_mirror_attempts").select("state,attempt_count,commerce_order_id,last_error_code,last_attempt_at,succeeded_at").eq("organization_id",organizationId).eq("id",attemptId).single();if(attempt.error)throw attempt.error;commerceOrderId=String(attempt.data.commerce_order_id||"");
  pass("worker persists attempt as SUCCEEDED",attempt.data.state==="SUCCEEDED"&&Number(attempt.data.attempt_count)===1&&Boolean(attempt.data.succeeded_at)&&Boolean(commerceOrderId),JSON.stringify(attempt.data));
  pass("worker leaves no mirror error",attempt.data.last_error_code===null,JSON.stringify(attempt.data));

  const order=await admin.from("commerce_orders").select("id,status,source_channel,external_reference,customer_name,created_by_user_id,deleted_at").eq("organization_id",organizationId).eq("id",commerceOrderId).single();if(order.error)throw order.error;
  pass("worker creates one active external Commerce cashier order",order.data.status==="SENT_TO_CASHIER"&&order.data.source_channel==="EXTERNAL_MARKETPLACE"&&order.data.customer_name==="Storefront Mirror Worker QA"&&order.data.deleted_at===null,JSON.stringify(order.data));
  pass("Commerce order is audited to configured worker actor",String(order.data.created_by_user_id)===dimproUserId,String(order.data.created_by_user_id));
  const items=await admin.from("commerce_order_items").select("id,inventory_status,product_name,deleted_at").eq("organization_id",organizationId).eq("order_id",commerceOrderId).is("deleted_at",null);if(items.error)throw items.error;
  pass("unmapped worker item remains explicit UNRESOLVED",items.data.length===1&&items.data[0]?.inventory_status==="UNRESOLVED",JSON.stringify(items.data));

  const mirrorAudit=await admin.from("commerce_audit_events").select("actor_user_id,action,entity_id").eq("organization_id",organizationId).eq("action","LEGACY_ORDER_MIRROR_SUCCEEDED").eq("entity_id",commerceOrderId).order("created_at",{ascending:false}).limit(1);if(mirrorAudit.error)throw mirrorAudit.error;
  pass("mirror success audit uses worker actor",mirrorAudit.data.length===1&&String(mirrorAudit.data[0]?.actor_user_id)===dimproUserId,JSON.stringify(mirrorAudit.data));

  const replay=runWorker(dimproUserId);
  pass("second worker run exits successfully",replay.status===0,`${replay.status} ${(replay.stderr||"").slice(0,300)}`);
  pass("second worker run is idempotent with zero requested",replay.json?.ok===true&&Number(replay.json?.requested)===0&&Number(replay.json?.succeeded)===0&&Number(replay.json?.failed)===0,JSON.stringify(replay.json));
  const afterReplay=await admin.from("commerce_order_mirror_attempts").select("state,attempt_count,commerce_order_id").eq("id",attemptId).single();if(afterReplay.error)throw afterReplay.error;
  pass("idempotent worker replay preserves one succeeded attempt",afterReplay.data.state==="SUCCEEDED"&&Number(afterReplay.data.attempt_count)===1&&String(afterReplay.data.commerce_order_id)===commerceOrderId,JSON.stringify(afterReplay.data));

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(commerceOrderId){
    await admin.from("commerce_order_items").update({deleted_at:now}).eq("organization_id",organizationId).eq("order_id",commerceOrderId).is("deleted_at",null);
    await admin.from("commerce_orders").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",commerceOrderId).is("deleted_at",null);
  }
  if(attemptId)await admin.from("commerce_order_mirror_attempts").update({deleted_at:now}).eq("organization_id",organizationId).eq("id",attemptId).is("deleted_at",null);
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
}
