import { access } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const env=(name,fallback="")=>process.env[name]?.trim()||fallback;
const enabled=env("DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED","false").toLowerCase()==="true";
const url=env("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
const serviceTemplate="ops/systemd/dimpro-commerce-reservation-expiry-worker.service";
const timerTemplate="ops/systemd/dimpro-commerce-reservation-expiry-worker.timer";
const installedService="/etc/systemd/system/dimpro-commerce-reservation-expiry-worker.service";
const installedTimer="/etc/systemd/system/dimpro-commerce-reservation-expiry-worker.timer";
const exists=(path)=>access(path).then(()=>true).catch(()=>false);
let schemaVersion=null,migrationCount=null,activeOrganizations=null,databaseReady=false;
if(url&&serviceKey.length>=32){
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const [meta,orgs]=await Promise.all([
    admin.from("commerce_schema_meta").select("schema_version,migration_count").eq("component","commerce-core").maybeSingle(),
    admin.from("dimpro_organizations").select("id",{count:"exact",head:true}).eq("status","active"),
  ]);
  if(!meta.error&&meta.data){schemaVersion=meta.data.schema_version;migrationCount=Number(meta.data.migration_count);databaseReady=true;}
  if(!orgs.error)activeOrganizations=orgs.count||0;
}
const [serviceTemplatePresent,timerTemplatePresent,serviceInstalled,timerInstalled]=await Promise.all([exists(serviceTemplate),exists(timerTemplate),exists(installedService),exists(installedTimer)]);
const ready=enabled&&url.length>0&&serviceKey.length>=32&&databaseReady&&schemaVersion==="0.1.10"&&migrationCount>=11&&serviceTemplatePresent&&timerTemplatePresent;
console.log(JSON.stringify({ok:ready,enabled,serviceRoleConfigured:serviceKey.length>=32,supabaseUrlConfigured:url.length>0,databaseReady,schemaVersion,migrationCount,activeOrganizations,serviceTemplatePresent,timerTemplatePresent,serviceInstalled,timerInstalled,secretsExposed:false},null,2));
process.exit(ready?0:2);
