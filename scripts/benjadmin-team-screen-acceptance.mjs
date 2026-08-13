import fs from "node:fs";
import { spawnSync } from "node:child_process";

const adminKey=fs.readFileSync(".dimprover/license/admin-key.txt","utf8").trim();
const apiBase=process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100";
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
let passed=0;
function check(name,ok,details=""){if(!ok)throw new Error(`${name}: ${details}`);passed+=1;console.log(`PASS ${name}${details?` :: ${details}`:""}`)}

const infrastructureResponse=await fetch(`${apiBase}/api/dev/engine/infrastructure-summary`,{headers:{host,"x-dimpro-license-admin-key":adminKey}});
const infrastructure=await infrastructureResponse.json().catch(()=>({}));
check("Infrastruktúra összesítő API elérhető",infrastructureResponse.status===200&&infrastructure?.ok===true,`status=${infrastructureResponse.status}`);
check("PRODUCTION és DB szerver külön jelen van",["PRODUCTION","DATABASE"].every(code=>infrastructure?.servers?.some(item=>item.code===code)),JSON.stringify(infrastructure?.servers?.map(item=>item.code)||[]));
check("PRODUCTION és DB RAM/lemez minta elérhető",infrastructure?.servers?.filter(item=>["PRODUCTION","DATABASE"].includes(item.code)).every(item=>item.memory?.usagePercent!=null&&item.disk?.usePercent!=null&&item.sampledAt),JSON.stringify(infrastructure?.servers||[]));
check("PRODUCTION és DB swap mező rendelkezésre áll",infrastructure?.servers?.filter(item=>["PRODUCTION","DATABASE"].includes(item.code)).every(item=>Object.prototype.hasOwnProperty.call(item,"swap")),JSON.stringify(infrastructure?.servers||[]));
check("Drive és Drop külső tárhely külön jelen van",["DRIVE","DROP"].every(code=>infrastructure?.storages?.some(item=>item.code===code)),JSON.stringify(infrastructure?.storages?.map(item=>item.code)||[]));
check("Hetzner modell közös account-báziskeretet jelent",infrastructure?.storages?.every(item=>item.provider==="HETZNER_OBJECT_STORAGE"&&item.includedStorageBytes===1000000000000&&item.bucketHardLimitBytes===100000000000000)&&infrastructure?.storageBilling?.scope==="ACCOUNT_SHARED",JSON.stringify(infrastructure?.storageBilling||{}));
check("DIMPRO hard bucket keret nincs kitalálva",infrastructure?.storages?.every(item=>item.capacityBytes==null),JSON.stringify(infrastructure?.storages?.map(item=>({code:item.code,capacityBytes:item.capacityBytes}))||[]));

const entitlementResponse=await fetch(`${apiBase}/api/dev/engine/entitlements`,{headers:{host,"x-dimpro-license-admin-key":adminKey}});
const entitlement=await entitlementResponse.json().catch(()=>({}));
const ai=entitlement?.entitlements?.summary||{};
check("AI finanszírozási összesítő mezői elérhetők",entitlementResponse.status===200&&["aiCostHufThisMonth","aiMonthlyBudgetHuf","aiTotalTokensThisMonth","aiMonthlyTokenBudget"].every(key=>Object.prototype.hasOwnProperty.call(ai,key)),JSON.stringify(ai));
check("AI strict readiness biztonságosan jelentett",typeof ai.aiRuntimeStrictReady==="boolean"&&Array.isArray(ai.aiRuntimeStrictBlockers),JSON.stringify({ready:ai.aiRuntimeStrictReady,blockers:ai.aiRuntimeStrictBlockers}));

const child=spawnSync(process.execPath,["scripts/benjadmin-team-executive-v12-acceptance.mjs"],{cwd:process.cwd(),encoding:"utf8",stdio:"inherit",timeout:240000});
check("Csapatképernyő V1.2 vezetői browser acceptance PASS",child.status===0,`status=${child.status} signal=${child.signal||"—"}`);
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
