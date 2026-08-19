import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require=createRequire(import.meta.url);
const createJiti=require("jiti");
const jiti=createJiti(import.meta.url,{interopDefault:true,alias:{"server-only":new URL("./server-only-worker-noop.cjs",import.meta.url).pathname}});
const {resolveCommerceServiceActorContext}=jiti("../app/lib/commerce/core/service-context.ts");
const {setCommerceOrderStatus}=jiti("../app/lib/commerce/order/repository.ts");

const BASE=(process.env.STOREFRONT_TRACKING_E2E_BASE||"").replace(/\/$/,"");
const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const ORGANIZATION_ID=process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID||"";
const ACTOR_ID=process.env.DIMPRO_COMMERCE_STOREFRONT_MIRROR_WORKER_ACTOR_USER_ID||"";
if(!BASE||!SUPABASE_URL||!SERVICE_KEY||!ORGANIZATION_ID||!ACTOR_ID)throw new Error("Tracking E2E config missing");
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const marker=randomUUID().slice(0,8);
const idempotencyKey=`tracking-e2e-${randomUUID()}`;
let attemptId="",commerceOrderId="";
let checks=0;
function pass(name,ok=true,detail=""){checks++;if(!ok)throw new Error(`FAIL ${String(checks).padStart(2,"0")} ${name}${detail?`: ${detail}`:""}`);console.log(`PASS ${String(checks).padStart(2,"0")} ${name}`)}
async function api(path,{method="POST",body}={}){const r=await fetch(`${BASE}${path}`,{method,headers:{"content-type":"application/json",host:"app.dev.dimpro.hu","x-forwarded-host":"app.dev.dimpro.hu"},body:body?JSON.stringify(body):undefined,redirect:"manual"});const raw=await r.text();let json=null;try{json=JSON.parse(raw)}catch{}return{status:r.status,raw,json,cacheControl:r.headers.get("cache-control")||""};}
async function waitFor(label,fn,timeout=100000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await fn();if(last?.ok)return last.value;await new Promise(r=>setTimeout(r,2000));}throw new Error(`${label} timeout: ${JSON.stringify(last)}`)}
async function status(token){return api("/api/aruter/public-checkouts/status",{body:{trackingToken:token}})}

try{
  const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").single();if(meta.error)throw meta.error;
  pass("Commerce schema is 0.1.13 / 14",meta.data.schema_version==="0.1.13"&&Number(meta.data.migration_count)===14,JSON.stringify(meta.data));
  const due=await admin.from("commerce_order_mirror_attempts").select("id",{count:"exact",head:true}).eq("organization_id",ORGANIZATION_ID).is("deleted_at",null).in("state",["PENDING","FAILED"]).lte("next_retry_at",new Date().toISOString());if(due.error)throw due.error;
  pass("tracking E2E starts with zero foreign due jobs",(due.count||0)===0,String(due.count||0));

  const body={businessSlug:"kovacs-kerteszet",items:[{productId:"prod-001",quantity:1},{productId:"prod-002",quantity:1}],pickupSlotId:"tracking-e2e",pickupSlotLabel:"Tracking E2E",customerName:`Tracking QA ${marker}`,phone:"+36300000000",email:"tracking@example.invalid",note:"TRACKING E2E",acceptedPrivacy:true};
  const created=await api("/api/aruter/public-checkouts",{body,method:"POST",headers:{}});
  // api helper cannot add idempotency header, so repeat request explicitly with the required header.
  if(created.status!==400||created.json?.code!=="STOREFRONT_CHECKOUT_IDEMPOTENCY_INVALID")throw new Error(`Expected missing-key guard before tracked checkout, got ${created.status} ${created.raw.slice(0,300)}`);
  pass("tracked checkout still requires idempotency key");
  const response=await fetch(`${BASE}/api/aruter/public-checkouts`,{method:"POST",headers:{"content-type":"application/json","idempotency-key":idempotencyKey,host:"app.dev.dimpro.hu","x-forwarded-host":"app.dev.dimpro.hu"},body:JSON.stringify(body)});
  const raw=await response.text();let result=null;try{result=JSON.parse(raw)}catch{}
  pass("tracked checkout returns HTTP 201",response.status===201&&result?.ok===true,`${response.status} ${raw.slice(0,500)}`);
  const data=result.data;
  pass("checkout returns signed tracking token",typeof data.trackingToken==="string"&&data.trackingToken.startsWith("v1.")&&data.trackingToken.split(".").length===3);
  pass("checkout returns future tracking expiry",Date.parse(data.trackingExpiresAt)>Date.now());
  pass("tracking token does not contain plaintext customer PII",!data.trackingToken.includes(body.customerName)&&!data.trackingToken.includes(body.phone)&&!data.trackingToken.includes(body.email));
  pass("checkout is queued for Commerce",data.commerceQueued===true);

  const getAttempt=async()=>{const r=await admin.from("commerce_order_mirror_attempts").select("*").eq("organization_id",ORGANIZATION_ID).eq("legacy_order_id",data.orderId).is("deleted_at",null).maybeSingle();if(r.error)throw r.error;return r.data;};
  const initialAttempt=await waitFor("queue attempt",async()=>{const x=await getAttempt();return{ok:Boolean(x),value:x}},10000);attemptId=String(initialAttempt.id);
  pass("persistent queue attempt exists",Boolean(attemptId));

  const tampered=`${data.trackingToken.slice(0,-1)}${data.trackingToken.endsWith("A")?"B":"A"}`;
  const invalid=await status(tampered);
  pass("tampered tracking token is rejected generically",invalid.status===404&&invalid.json?.code==="STOREFRONT_TRACKING_TOKEN_INVALID",`${invalid.status} ${invalid.raw.slice(0,300)}`);
  pass("tracking endpoint response disables cache",invalid.cacheControl.toLowerCase().includes("no-store"),invalid.cacheControl);

  const first=await status(data.trackingToken);
  pass("valid tracking token is accepted",first.status===200&&first.json?.ok===true,`${first.status} ${first.raw.slice(0,500)}`);
  pass("initial public state is bounded",["QUEUED","PROCESSING","AT_CASHIER"].includes(first.json.data.state),JSON.stringify(first.json.data));
  pass("public tracking response exposes no customer PII",!first.raw.includes(body.customerName)&&!first.raw.includes(body.phone)&&!first.raw.includes(body.email));
  pass("public tracking response exposes no Commerce order id",!first.raw.includes("commerceOrderId"));

  const cashier=await waitFor("automatic worker -> cashier",async()=>{const r=await status(data.trackingToken);return{ok:r.status===200&&r.json?.data?.state==="AT_CASHIER",value:r}},100000);
  pass("systemd worker advances public state to AT_CASHIER",cashier.json.data.queueState==="SUCCEEDED"&&cashier.json.data.commerceStatus==="SENT_TO_CASHIER",JSON.stringify(cashier.json.data));
  const succeeded=await getAttempt();commerceOrderId=String(succeeded.commerce_order_id||"");
  pass("queue attempt succeeded once",succeeded.state==="SUCCEEDED"&&Number(succeeded.attempt_count)===1&&Boolean(commerceOrderId),JSON.stringify(succeeded));

  const context=await resolveCommerceServiceActorContext({organizationId:ORGANIZATION_ID,userId:ACTOR_ID,requiredPermissions:["commerce.order.read","commerce.order.pay","commerce.order.issue"],requiredRoleCodes:["COMMERCE_MIRROR_WORKER"],requireNonInteractiveActor:true});
  await setCommerceOrderStatus(context,commerceOrderId,{status:"PAID",paymentMethod:"CARD",cashierName:"Tracking E2E",idempotencyKey:`tracking-paid-${marker}`});
  const paid=await waitFor("public PAID",async()=>{const r=await status(data.trackingToken);return{ok:r.status===200&&r.json?.data?.state==="PAID",value:r}},10000);
  pass("public tracking reflects PAID",paid.json.data.commerceStatus==="PAID"&&paid.json.data.terminal===false,JSON.stringify(paid.json.data));

  await setCommerceOrderStatus(context,commerceOrderId,{status:"ISSUED",issuerName:"Tracking E2E",idempotencyKey:`tracking-issued-${marker}`});
  const issued=await waitFor("public ISSUED",async()=>{const r=await status(data.trackingToken);return{ok:r.status===200&&r.json?.data?.state==="ISSUED",value:r}},10000);
  pass("public tracking reflects terminal ISSUED",issued.json.data.commerceStatus==="ISSUED"&&issued.json.data.terminal===true,JSON.stringify(issued.json.data));

  console.log(`RESULT ${checks}/${checks} PASS`);
} finally {
  const now=new Date().toISOString();
  if(commerceOrderId){await admin.from("commerce_order_items").update({deleted_at:now}).eq("organization_id",ORGANIZATION_ID).eq("order_id",commerceOrderId).is("deleted_at",null);await admin.from("commerce_orders").update({deleted_at:now}).eq("organization_id",ORGANIZATION_ID).eq("id",commerceOrderId).is("deleted_at",null);}
  if(attemptId)await admin.from("commerce_order_mirror_attempts").update({deleted_at:now}).eq("organization_id",ORGANIZATION_ID).eq("id",attemptId).is("deleted_at",null);
}
