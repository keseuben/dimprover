import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const url=required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey=required("SUPABASE_SERVICE_ROLE_KEY");
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const marker=`${Date.now()}-${randomUUID().slice(0,8)}`;
const warehouseId=randomUUID(),sourceId=randomUUID(),productId=randomUUID(),variantId=randomUUID(),referenceId=randomUUID();
let organizationId="",reservationId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function balance(){const r=await admin.from("commerce_inventory_balances").select("physical_quantity,reserved_quantity,available_quantity").eq("organization_id",organizationId).eq("source_id",sourceId).eq("variant_id",variantId).eq("stock_status","SELLABLE").maybeSingle();if(r.error)throw r.error;return r.data;}
function runWorker(){
  const run=spawnSync(process.execPath,["scripts/run-commerce-reservation-expiry-worker.mjs"],{
    cwd:process.cwd(),encoding:"utf8",env:{...process.env,DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED:"true",DIMPRO_COMMERCE_EXPIRY_WORKER_ORGANIZATION_ID:organizationId,DIMPRO_COMMERCE_EXPIRY_WORKER_LIMIT:"10",DIMPRO_COMMERCE_EXPIRY_WORKER_ORG_LIMIT:"1"},
  });
  let payload=null;try{payload=JSON.parse((run.stdout||run.stderr||"").trim());}catch{}
  return{status:run.status,payload,stdout:run.stdout,stderr:run.stderr};
}

try{
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();
  if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const preexisting=await admin.from("commerce_inventory_reservations").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).is("deleted_at",null).in("status",["ACTIVE","PARTIAL"]).lte("expires_at",new Date().toISOString()).gt("remaining_quantity",0);
  if(preexisting.error)throw preexisting.error;
  pass("worker E2E starts only with zero foreign due reservations",(preexisting.count||0)===0,String(preexisting.count||0));

  const wh=await admin.from("commerce_warehouses").insert({id:warehouseId,organization_id:organizationId,code:`EXPW-${warehouseId.slice(0,6)}`,name:"Expiry Worker QA",active:true}).select("id").single();if(wh.error)throw wh.error;
  const src=await admin.from("commerce_inventory_sources").insert({id:sourceId,organization_id:organizationId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`EXPW-${sourceId.slice(0,6)}`,name:"Expiry Worker QA",active:true}).select("id").single();if(src.error)throw src.error;
  const product=await admin.from("commerce_products").insert({id:productId,organization_id:organizationId,name:"Expiry Worker QA",slug:`expiry-worker-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single();if(product.error)throw product.error;
  const variant=await admin.from("commerce_product_variants").insert({id:variantId,organization_id:organizationId,product_id:productId,name:"Expiry Worker QA",unit:"DB",status:"ACTIVE"}).select("id").single();if(variant.error)throw variant.error;
  pass("worker runtime fixture created",true);

  const receipt=await admin.rpc("commerce_inventory_apply_movement",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_stock_status:"SELLABLE",p_movement_type:"RECEIPT",p_physical_delta:"5",p_reserved_delta:"0",p_incoming_delta:"0",p_idempotency_key:`expiry-worker-receipt-${marker}`,p_reference_type:"QA",p_reference_id:referenceId,p_occurred_at:new Date().toISOString()});if(receipt.error)throw receipt.error;
  pass("worker fixture stock seeded through ledger",Boolean(receipt.data));

  const reserve=await admin.rpc("commerce_inventory_reservation_create",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_quantity:"2",p_idempotency_key:`expiry-worker-reserve-${marker}`,p_stock_status:"SELLABLE",p_reference_type:"QA",p_reference_id:referenceId,p_expires_at:new Date(Date.now()+1200).toISOString()});if(reserve.error||!reserve.data)throw reserve.error||new Error("Reservation create failed");reservationId=String(reserve.data.reservationId||"");
  pass("short-lived worker reservation created",reservationId.length>0&&String(reserve.data.status)==="ACTIVE",JSON.stringify(reserve.data));

  let b=await balance();
  pass("pre-worker balance is physical 5 / reserved 2 / available 3",Number(b?.physical_quantity)===5&&Number(b?.reserved_quantity)===2&&Number(b?.available_quantity)===3,JSON.stringify(b));
  await new Promise(resolve=>setTimeout(resolve,1700));

  const first=runWorker();
  pass("worker exits successfully",first.status===0&&first.payload?.ok===true,`${first.status} ${first.stdout} ${first.stderr}`);
  pass("worker filter restricts execution to one organization",first.payload?.organizationFilterApplied===true&&first.payload?.organizationCount===1,JSON.stringify(first.payload));
  pass("worker processes exactly one due reservation",Number(first.payload?.processedCount)===1&&Number(first.payload?.releasedQuantity)===2&&Number(first.payload?.failureCount)===0,JSON.stringify(first.payload));
  pass("worker output never exposes secrets",first.payload?.secretsExposed===false&&!JSON.stringify(first.payload).includes(serviceKey));

  const state=await admin.from("commerce_inventory_reservations").select("status,released_quantity,remaining_quantity").eq("organization_id",organizationId).eq("id",reservationId).single();if(state.error)throw state.error;
  pass("worker persists reservation as EXPIRED",state.data.status==="EXPIRED"&&Number(state.data.released_quantity)===2&&Number(state.data.remaining_quantity)===0,JSON.stringify(state.data));
  b=await balance();
  pass("worker releases reserved quantity without changing physical stock",Number(b?.physical_quantity)===5&&Number(b?.reserved_quantity)===0&&Number(b?.available_quantity)===5,JSON.stringify(b));

  const second=runWorker();
  pass("worker replay is idempotent",second.status===0&&Number(second.payload?.processedCount)===0&&Number(second.payload?.releasedQuantity)===0,`${second.status} ${second.stdout} ${second.stderr}`);

  const audit=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","INVENTORY_RESERVATION_EXPIRED").eq("entity_id",reservationId);
  const outbox=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","INVENTORY_RESERVATION_EXPIRED").eq("aggregate_id",reservationId);
  if(audit.error||outbox.error)throw audit.error||outbox.error;
  pass("worker expiry emits exactly one audit and one outbox event",(audit.count||0)===1&&(outbox.count||0)===1,`audit=${audit.count} outbox=${outbox.count}`);

  const neutralize=await admin.rpc("commerce_inventory_apply_movement",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_stock_status:"SELLABLE",p_movement_type:"ADJUSTMENT",p_physical_delta:"-5",p_reserved_delta:"0",p_incoming_delta:"0",p_idempotency_key:`expiry-worker-neutralize-${marker}`,p_reference_type:"QA",p_reference_id:referenceId,p_occurred_at:new Date().toISOString()});if(neutralize.error)throw neutralize.error;
  b=await balance();
  pass("worker QA inventory is neutralized to zero",Number(b?.physical_quantity)===0&&Number(b?.reserved_quantity)===0&&Number(b?.available_quantity)===0,JSON.stringify(b));
  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(organizationId&&variantId)await admin.from("commerce_inventory_reservations").update({deleted_at:now}).eq("organization_id",organizationId).eq("variant_id",variantId).is("deleted_at",null);
  if(organizationId&&variantId)await admin.from("commerce_product_variants").update({deleted_at:now,status:"ARCHIVED"}).eq("organization_id",organizationId).eq("id",variantId);
  if(organizationId&&productId)await admin.from("commerce_products").update({deleted_at:now,status:"ARCHIVED"}).eq("organization_id",organizationId).eq("id",productId);
  if(organizationId&&sourceId)await admin.from("commerce_inventory_sources").update({deleted_at:now,active:false}).eq("organization_id",organizationId).eq("id",sourceId);
  if(organizationId&&warehouseId)await admin.from("commerce_warehouses").update({deleted_at:now,active:false}).eq("organization_id",organizationId).eq("id",warehouseId);
}
