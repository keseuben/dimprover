import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function required(name){const value=process.env[name]?.trim();assert.ok(value,`${name} hiányzik`);return value;}
const SUPABASE_URL=required("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY=required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY=required("SUPABASE_SERVICE_ROLE_KEY");
const BASE=required("COMMERCE_SOFT_DELETE_SMOKE_BASE").replace(/\/$/,"");
const HOST=process.env.COMMERCE_SOFT_DELETE_SMOKE_HOST?.trim()||"app.dev.dimpro.hu";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const regular=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const marker=`${Date.now()}-${randomBytes(3).toString("hex")}`;
const email=`commerce-soft-delete-${marker}@example.invalid`;
const password=`Cs!${randomBytes(18).toString("base64url")}4X`;
const alphabet="23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codePart=()=>Array.from(randomBytes(4),byte=>alphabet[byte%alphabet.length]).join("");
const publicCode=`USR-26-${codePart()}-${codePart()}`;
let authUserId="",dimproUserId="",membershipId="",organizationId="";
const checks=[];
function pass(name,condition,detail=""){assert.ok(condition,`${name}${detail?`: ${detail}`:""}`);checks.push(name);console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`);}
async function api(path,cookie){const response=await fetch(`${BASE}${path}`,{headers:{host:HOST,"x-forwarded-host":HOST,cookie},redirect:"manual"});const raw=await response.text();let json=null;try{json=JSON.parse(raw);}catch{}return{status:response.status,raw,json};}
async function expectOk(path,label,cookie){const result=await api(path,cookie);pass(label,result.status===200&&result.json?.ok===true,`${result.status} ${result.raw.slice(0,300)}`);return result.json?.data;}

try{
  const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").single();
  if(meta.error)throw meta.error;
  pass("live Commerce schema is 0.1.11 / 12",meta.data.schema_version==="0.1.11"&&Number(meta.data.migration_count)===12,JSON.stringify(meta.data));
  const org=await admin.from("dimpro_organizations").select("id").eq("status","active").limit(1).maybeSingle();
  if(org.error||!org.data)throw org.error||new Error("Aktív DEV organization hiányzik");organizationId=String(org.data.id);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:"COMMERCE_SOFT_DELETE_V011_HTTP_SMOKE"}});
  if(created.error||!created.data.user)throw created.error||new Error("Auth fixture create failed");authUserId=created.data.user.id;
  const identity=await admin.from("dimpro_users").insert({public_user_code:publicCode,auth_user_id:authUserId,full_name:"Commerce Soft Delete HTTP QA",email,email_normalized:email.toLowerCase(),email_verified_at:new Date().toISOString(),status:"active"}).select("id").single();
  if(identity.error||!identity.data)throw identity.error||new Error("Identity fixture create failed");dimproUserId=String(identity.data.id);
  const membership=await admin.from("dimpro_organization_memberships").insert({user_id:dimproUserId,organization_id:organizationId,role_code:"ADMIN",role_label:"Commerce Soft Delete HTTP QA",status:"active",is_primary:true}).select("id").single();
  if(membership.error||!membership.data)throw membership.error||new Error("Membership fixture create failed");membershipId=String(membership.data.id);

  const signed=await regular.auth.signInWithPassword({email,password});if(signed.error||!signed.data.session)throw signed.error||new Error("Auth session create failed");
  const cookieJar=[];
  const ssr=createServerClient(SUPABASE_URL,ANON_KEY,{cookies:{getAll(){return[];},setAll(next){cookieJar.splice(0,cookieJar.length,...next);}}});
  const setSession=await ssr.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});if(setSession.error)throw setSession.error;
  const cookie=cookieJar.map(item=>`${item.name}=${item.value}`).join("; ");
  pass("authenticated SSR cookie prepared",cookieJar.length>0,String(cookieJar.length));

  const contextResponse=await api("/api/v1/commerce/context",cookie);
  pass("Commerce context works after soft-delete migration",contextResponse.status===200&&contextResponse.json?.ok===true,`${contextResponse.status} ${contextResponse.raw.slice(0,300)}`);
  const context=contextResponse.json?.context;
  pass("Commerce context resolves expected organization",context?.organizationId===organizationId,String(context?.organizationId||""));
  const products=await expectOk("/api/v1/commerce/products?limit=10","Product repository deleted_at filter works",cookie);
  pass("Product endpoint returns a canonical list payload",Array.isArray(products?.items)&&Number.isFinite(Number(products?.total)),JSON.stringify(products));
  await expectOk("/api/v1/commerce/catalog/categories","Category repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/catalog/brands","Brand repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/catalog/manufacturers","Manufacturer repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/inventory","Inventory balance deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/inventory/reservations?limit=10","Reservation repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/receiving?limit=10","Receiving repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/receiving/options","Receiving options deleted_at filters work",cookie);
  await expectOk("/api/v1/commerce/orders?limit=10","Order repository deleted_at filter works",cookie);
  await expectOk("/api/v1/commerce/mirror/reconciliation?limit=10","Reconciliation deleted_at filter works",cookie);

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} finally {
  if(membershipId)await admin.from("dimpro_organization_memberships").delete().eq("id",membershipId);
  if(dimproUserId)await admin.from("dimpro_users").delete().eq("id",dimproUserId);
  if(authUserId)await admin.auth.admin.deleteUser(authUserId).catch(()=>undefined);
}
