import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(); const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if(!url||!key) throw new Error("DEV Supabase env missing");
const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const mod=await import(`../app/lib/dev-center/team-dashboard-metrics.ts?contract=${Date.now()}`);
let passed=0; const check=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};
const summary=await mod.getTeamDashboardMetrics();
check("Vezetői metrics OK",()=>assert.equal(summary.ok,true));
check("Budapest időzóna és periódus",()=>{assert.match(summary.period.day,/^\d{4}-\d{2}-\d{2}$/);assert.match(summary.period.month,/^\d{4}-\d{2}$/)});
const expected=["BenjAdmin","Ben-AI","Ármin-AI","Jázmin-AI","Outmin-AI","M.Forge-AI","V.Guard-AI","ChatGPT + VPS-MCP"];
check("Nyolc ráfordítási szereplő kanonikus névvel",()=>assert.deepEqual(summary.time.people.map(x=>x.name),expected));
check("M.Forge és V.Guard provider aktív időként mérendő",()=>{assert.equal(summary.time.people.find(x=>x.code==="MFORGE")?.measurement,"PROVIDER_ACTIVE");assert.equal(summary.time.people.find(x=>x.code==="VGUARD")?.measurement,"PROVIDER_ACTIVE")});
check("Belső AI session falióra",()=>["BENAI","ARMINAI","JAZMINAI","OUTMINAI"].forEach(code=>assert.equal(summary.time.people.find(x=>x.code===code)?.measurement,"SESSION_WALL")));
check("ChatGPT + VPS-MCP fejlesztési naplóként mérendő",()=>assert.equal(summary.time.people.find(x=>x.code==="CHATGPT_MCP")?.measurement,"DEV_WORKLOG"));
check("Infrastruktúra költség nem talál ki hiányzó összeget",()=>{assert.equal(summary.costs.infrastructure.totalCount,6);for(const item of summary.costs.infrastructure.items){assert.ok(item.monthlyHuf===null||Number.isFinite(item.monthlyHuf))}});
check("Napi és éves projekció külön mező",()=>{assert.ok(Number.isFinite(summary.costs.projection.infrastructureDailyHuf));assert.ok(Number.isFinite(summary.costs.projection.infrastructureAnnualHuf))});

if(!summary.time.benjadminTimer.running){
 const marker=`acceptance-${Date.now()}`;
 const start=await mod.startBenjadminTime(marker);
 check("BenjAdmin saját időmérő indítható",()=>assert.equal(start.running,true));
 const during=await mod.getTeamDashboardMetrics();
 check("Futó saját időmérő visszaolvasható",()=>assert.equal(during.time.benjadminTimer.timerId,start.timerId));
 const stop=await mod.stopBenjadminTime();
 check("BenjAdmin saját időmérő leállítható",()=>assert.equal(stop.running,false));
 const cleanup=await db.from("dev_center_live_worklog").delete().eq("source","benjadmin-time").contains("metadata",{timerId:start.timerId});
 if(cleanup.error) throw cleanup.error;
} else {
 console.log("SKIP timer write acceptance: meglévő BenjAdmin timer fut, nem avatkozunk bele.");
}
console.log(JSON.stringify({ok:true,passed,failed:0},null,2));
