import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY=required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("COMMERCE_EXPIRY_E2E_BASE").replace(/\/$/,"");
const HOST=process.env.COMMERCE_EXPIRY_E2E_HOST?.trim()||"app.dev.dimpro.hu";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const regular=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`commerce-expiry-${marker}@example.invalid`;
const password=`Ce!${randomBytes(18).toString("base64url")}9Q`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
const warehouseId=randomUUID(),sourceId=randomUUID(),productId=randomUUID(),variantId=randomUUID(),referenceId=randomUUID();
let authUserId="",dimproUserId="",membershipId="",organizationId="",reservationId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,{method="GET",body,cookie}={}){
  const response=await fetch(`${BASE}${path}`,{method,headers:{host:HOST,"x-forwarded-host":HOST,...(cookie?{cookie}:{}),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"manual"});
  const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}
  return{status:response.status,raw,json,headers:response.headers};
}
async function balance(){const r=await admin.from("commerce_inventory_balances").select("physical_quantity,reserved_quantity,available_quantity").eq("organization_id",organizationId).eq("source_id",sourceId).eq("variant_id",variantId).eq("stock_status","SELLABLE").maybeSingle();if(r.error)throw r.error;return r.data;}

try{
  let response=await api("/api/v1/commerce/inventory/reservations/expire-due",{method:"POST",body:{limit:10}});
  pass("unauthenticated expiry endpoint is protected",response.status===307&&(response.headers.get("location")||"").includes("/login"),`${response.status} ${response.headers.get("location")||""}`);

  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();
  if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:"COMMERCE_RESERVATION_EXPIRY_HTTP_E2E"}});
  if(created.error||!created.data.user)throw created.error||new Error("Auth fixture create failed");authUserId=created.data.user.id;
  const identity=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:authUserId,full_name:"Commerce Expiry HTTP QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id").single();
  if(identity.error||!identity.data)throw identity.error||new Error("Identity fixture create failed");dimproUserId=String(identity.data.id);
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"ADMIN",role_label:"Commerce Expiry HTTP QA",status:"active",is_primary:true}).select("id").single();
  if(membership.error||!membership.data)throw membership.error||new Error("Membership fixture create failed");membershipId=String(membership.data.id);

  const signed=await regular.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw signed.error||new Error("Auth session create failed");
  const cookieJar=[];
  const ssr=createServerClient(SUPABASE_URL,ANON_KEY,{cookies:{getAll(){return[];},setAll(next){cookieJar.splice(0,cookieJar.length,...next);}}});
  const setSession=await ssr.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});if(setSession.error)throw setSession.error;
  const cookie=cookieJar.map(item=>`${item.name}=${item.value}`).join("; ");
  pass("authenticated SSR cookie prepared",cookieJar.length>0,String(cookieJar.length));

  response=await api("/api/v1/commerce/context",{cookie});
  pass("Commerce context accepts expiry QA session",response.status===200&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,300)}`);
  pass("ADMIN context has move and adjust permissions",response.json?.context?.permissions?.includes("commerce.inventory.move")===true&&response.json?.context?.permissions?.includes("commerce.inventory.adjust")===true,JSON.stringify(response.json?.context?.permissions||[]));

  const wh=await admin.from("commerce_warehouses").insert({id:warehouseId,organization_id:organizationId,code:`EXPH-${warehouseId.slice(0,6)}`,name:"Expiry HTTP QA",active:true}).select("id").single();if(wh.error)throw wh.error;
  const src=await admin.from("commerce_inventory_sources").insert({id:sourceId,organization_id:organizationId,warehouse_id:warehouseId,source_type:"INTERNAL",code:`EXPH-${sourceId.slice(0,6)}`,name:"Expiry HTTP QA",active:true}).select("id").single();if(src.error)throw src.error;
  const product=await admin.from("commerce_products").insert({id:productId,organization_id:organizationId,name:"Expiry HTTP QA",slug:`expiry-http-${productId.slice(0,8)}`,status:"ACTIVE"}).select("id").single();if(product.error)throw product.error;
  const variant=await admin.from("commerce_product_variants").insert({id:variantId,organization_id:organizationId,product_id:productId,name:"Expiry HTTP QA",unit:"DB",status:"ACTIVE"}).select("id").single();if(variant.error)throw variant.error;
  pass("expiry HTTP inventory fixture created",true);

  const receipt=await admin.rpc("commerce_inventory_apply_movement",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_stock_status:"SELLABLE",p_movement_type:"RECEIPT",p_physical_delta:"5",p_reserved_delta:"0",p_incoming_delta:"0",p_idempotency_key:`expiry-http-receipt-${marker}`,p_reference_type:"QA",p_reference_id:referenceId,p_occurred_at:new Date().toISOString()});
  if(receipt.error)throw receipt.error;
  pass("physical stock seeded through immutable ledger",Boolean(receipt.data));

  const reserve=await admin.rpc("commerce_inventory_reservation_create",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_quantity:"2",p_idempotency_key:`expiry-http-reserve-${marker}`,p_stock_status:"SELLABLE",p_reference_type:"QA",p_reference_id:referenceId,p_expires_at:new Date(Date.now()+1200).toISOString()});
  if(reserve.error||!reserve.data)throw reserve.error||new Error("Reservation create failed");reservationId=String(reserve.data.reservationId||"");assert.ok(reservationId,"Reservation id hiányzik");
  pass("short-lived reservation created",String(reserve.data.status)==="ACTIVE"&&Number(reserve.data.remainingQuantity)===2,JSON.stringify(reserve.data));

  let b=await balance();
  pass("pre-expiry balance is physical 5 / reserved 2 / available 3",Number(b?.physical_quantity)===5&&Number(b?.reserved_quantity)===2&&Number(b?.available_quantity)===3,JSON.stringify(b));
  await new Promise(resolve=>setTimeout(resolve,1700));

  response=await api("/api/v1/commerce/inventory/reservations/expire-due",{method:"POST",cookie,body:{limit:10}});
  pass("authenticated expiry POST succeeds",response.status===200&&response.json?.ok===true,`${response.status} ${response.raw.slice(0,500)}`);
  pass("expiry POST processes exactly one reservation",Number(response.json?.data?.processedCount)===1&&Number(response.json?.data?.releasedQuantity)===2&&response.json?.data?.reservationIds?.includes?.(reservationId)===true,JSON.stringify(response.json?.data));

  const state=await admin.from("commerce_inventory_reservations").select("status,released_quantity,remaining_quantity").eq("organization_id",organizationId).eq("id",reservationId).single();if(state.error)throw state.error;
  pass("reservation persists as EXPIRED with zero remaining",state.data.status==="EXPIRED"&&Number(state.data.released_quantity)===2&&Number(state.data.remaining_quantity)===0,JSON.stringify(state.data));
  b=await balance();
  pass("HTTP expiry restores availability without changing physical stock",Number(b?.physical_quantity)===5&&Number(b?.reserved_quantity)===0&&Number(b?.available_quantity)===5,JSON.stringify(b));

  response=await api("/api/v1/commerce/inventory/reservations/expire-due",{method:"POST",cookie,body:{limit:10}});
  pass("HTTP expiry replay is idempotent",response.status===200&&Number(response.json?.data?.processedCount)===0&&Number(response.json?.data?.releasedQuantity)===0,`${response.status} ${response.raw.slice(0,400)}`);

  const event=await admin.from("commerce_inventory_reservation_events").select("id,stock_movement_id,quantity").eq("organization_id",organizationId).eq("reservation_id",reservationId).eq("action","EXPIRE");if(event.error)throw event.error;
  pass("exactly one EXPIRE event references a stock movement",event.data.length===1&&Boolean(event.data[0]?.stock_movement_id)&&Number(event.data[0]?.quantity)===2,JSON.stringify(event.data));
  const audit=await admin.from("commerce_audit_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("action","INVENTORY_RESERVATION_EXPIRED").eq("entity_id",reservationId);
  const outbox=await admin.from("commerce_outbox_events").select("id",{count:"exact",head:true}).eq("organization_id",organizationId).eq("event_type","INVENTORY_RESERVATION_EXPIRED").eq("aggregate_id",reservationId);
  if(audit.error||outbox.error)throw audit.error||outbox.error;
  pass("HTTP expiry emits one audit and one outbox event",(audit.count||0)===1&&(outbox.count||0)===1,`audit=${audit.count} outbox=${outbox.count}`);

  const neutralize=await admin.rpc("commerce_inventory_apply_movement",{p_organization_id:organizationId,p_source_id:sourceId,p_variant_id:variantId,p_stock_status:"SELLABLE",p_movement_type:"ADJUSTMENT",p_physical_delta:"-5",p_reserved_delta:"0",p_incoming_delta:"0",p_idempotency_key:`expiry-http-neutralize-${marker}`,p_reference_type:"QA",p_reference_id:referenceId,p_occurred_at:new Date().toISOString()});if(neutralize.error)throw neutralize.error;
  b=await balance();
  pass("QA inventory is neutralized to zero",Number(b?.physical_quantity)===0&&Number(b?.reserved_quantity)===0&&Number(b?.available_quantity)===0,JSON.stringify(b));

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  const now=new Date().toISOString();
  if(organizationId&&variantId)await admin.from("commerce_inventory_reservations").update({deleted_at:now}).eq("organization_id",organizationId).eq("variant_id",variantId).is("deleted_at",null);
  if(organizationId&&variantId)await admin.from("commerce_product_variants").update({deleted_at:now,status:"ARCHIVED"}).eq("organization_id",organizationId).eq("id",variantId);
  if(organizationId&&productId)await admin.from("commerce_products").update({deleted_at:now,status:"ARCHIVED"}).eq("organization_id",organizationId).eq("id",productId);
  if(organizationId&&sourceId)await admin.from("commerce_inventory_sources").update({deleted_at:now,active:false}).eq("organization_id",organizationId).eq("id",sourceId);
  if(organizationId&&warehouseId)await admin.from("commerce_warehouses").update({deleted_at:now,active:false}).eq("organization_id",organizationId).eq("id",warehouseId);
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
  if(authUserId)await admin.auth.admin.deleteUser(authUserId).catch(()=>undefined);
}
