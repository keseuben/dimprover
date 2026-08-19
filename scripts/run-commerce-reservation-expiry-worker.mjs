import { createClient } from "@supabase/supabase-js";

const env=(name,fallback="")=>process.env[name]?.trim()||fallback;
const clamp=(value,fallback,min,max)=>{const parsed=Number(value);return Number.isFinite(parsed)?Math.max(min,Math.min(max,Math.floor(parsed))):fallback;};
const enabled=env("DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED","false").toLowerCase()==="true";
const url=env("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
const perOrganizationLimit=clamp(env("DIMPRO_COMMERCE_EXPIRY_WORKER_LIMIT","50"),50,1,100);
const organizationLimit=clamp(env("DIMPRO_COMMERCE_EXPIRY_WORKER_ORG_LIMIT","200"),200,1,1000);
const organizationFilter=env("DIMPRO_COMMERCE_EXPIRY_WORKER_ORGANIZATION_ID");

function output(payload,error=false){const safe={...payload,secretsExposed:false};(error?console.error:console.log)(JSON.stringify(safe));}
function fail(code,message,status=2){output({ok:false,code,error:message},true);process.exit(status);}
function semverAtLeast(actual,required){const a=String(actual||"").split(".").map(Number),b=String(required).split(".").map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]||0,y=b[i]||0;if(x>y)return true;if(x<y)return false;}return true;}

if(!enabled)fail("COMMERCE_EXPIRY_WORKER_DISABLED","A Commerce reservation expiry worker nincs engedélyezve.");
if(!url||serviceKey.length<32)fail("COMMERCE_EXPIRY_WORKER_ENV_MISSING","A Commerce expiry worker adatbázis-környezete hiányos.");
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

const meta=await admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").maybeSingle();
if(meta.error||!meta.data)fail("COMMERCE_EXPIRY_WORKER_SCHEMA_UNAVAILABLE","A Commerce schema állapota nem olvasható.",1);
if(!semverAtLeast(meta.data.schema_version,"0.1.10")||Number(meta.data.migration_count)<11)fail("COMMERCE_EXPIRY_WORKER_SCHEMA_TOO_OLD","A Commerce reservation expiry schema még nem aktív.",1);

let organizationsQuery=admin.from("dimpro_organizations").select("id").eq("status","active").order("created_at",{ascending:true}).limit(organizationLimit);
if(organizationFilter)organizationsQuery=organizationsQuery.eq("id",organizationFilter);
const organizations=await organizationsQuery;
if(organizations.error)fail("COMMERCE_EXPIRY_WORKER_ORGANIZATIONS_FAILED","Az aktív Commerce szervezetek lekérése sikertelen.",1);
if(organizationFilter&&organizations.data.length!==1)fail("COMMERCE_EXPIRY_WORKER_ORGANIZATION_NOT_FOUND","A kért aktív szervezet nem található.",1);

const startedAt=new Date();
const results=[];
let processedCount=0;
let releasedQuantity=0;
let failureCount=0;
for(const organization of organizations.data){
  const organizationId=String(organization.id);
  const result=await admin.rpc("commerce_inventory_expire_due_reservations",{
    p_organization_id:organizationId,
    p_limit:perOrganizationLimit,
    p_now:new Date().toISOString(),
  });
  if(result.error){
    failureCount++;
    results.push({organizationId,ok:false,code:"COMMERCE_EXPIRY_ORGANIZATION_FAILED"});
    continue;
  }
  const data=result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{};
  const count=Number(data.processedCount||0);
  const released=Number(data.releasedQuantity||0);
  processedCount+=Number.isFinite(count)?count:0;
  releasedQuantity+=Number.isFinite(released)?released:0;
  results.push({organizationId,ok:true,processedCount:Number.isFinite(count)?count:0,releasedQuantity:Number.isFinite(released)?released:0});
}
const completedAt=new Date();
output({
  ok:failureCount===0,
  version:"commerce-reservation-expiry-worker-v1",
  schemaVersion:meta.data.schema_version,
  migrationCount:Number(meta.data.migration_count),
  organizationCount:organizations.data.length,
  organizationFilterApplied:Boolean(organizationFilter),
  perOrganizationLimit,
  processedCount,
  releasedQuantity,
  failureCount,
  results,
  startedAt:startedAt.toISOString(),
  completedAt:completedAt.toISOString(),
  durationMs:completedAt.getTime()-startedAt.getTime(),
},failureCount>0);
if(failureCount>0)process.exit(1);
