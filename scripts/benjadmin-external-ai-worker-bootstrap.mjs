import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}
const apply=process.argv.includes("--apply");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()||"", key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()||"";
if(!url||!key) throw new Error("DEV Supabase app environment missing");
if(os.hostname()!=="dimpro-dev") throw new Error("Fail-closed: external AI worker bootstrap csak dimpro-dev hoston futtatható.");
const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const desired=[
 {id:"worker_mforge",code:"MFORGE",name:"M.Forge-AI",role:"External Coding Worker",status:"ready",capabilities:["frontend","backend","api","implementation","refactor","targeted_fix","build","test"],metadata:{layer:"EXTERNAL_AI",personName:"Márk",productionAccess:"DENY",allowedEnvironmentKinds:["DEV"],allowedOperations:["write","build","test"],reviewOnly:false,providerBound:false}},
 {id:"worker_vguard",code:"VGUARD",name:"V.Guard-AI",role:"External Review & Quality Worker",status:"ready",capabilities:["review","security","regression","test","build","scope_review","quality_gate"],metadata:{layer:"EXTERNAL_AI",personName:"Viktória",productionAccess:"DENY",allowedEnvironmentKinds:["DEV"],allowedOperations:["build","test"],reviewOnly:true,providerBound:false}},
];
const existing=await db.from("dev_center_workers").select("id,code,name,role,status,capabilities,metadata").in("id",desired.map(x=>x.id));
if(existing.error) throw existing.error;
console.log(JSON.stringify({ok:true,apply,current:existing.data||[],desired:desired.map(x=>({id:x.id,code:x.code,role:x.role,metadata:x.metadata}))},null,2));
if(!apply) process.exit(0);
const stamp=new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replace("Z","Z");
const backupDir=path.join(process.cwd(),".dimprover","backups",`external-ai-workers-${stamp}`);
await mkdir(backupDir,{recursive:true,mode:0o700});
await writeFile(path.join(backupDir,"workers-before.json"),`${JSON.stringify(existing.data||[],null,2)}\n`,{mode:0o600});
for(const worker of desired){
 const result=await db.from("dev_center_workers").upsert({...worker,updated_at:new Date().toISOString()},{onConflict:"id"}).select("id,code,name,role,status,capabilities,metadata").single();
 if(result.error) throw result.error;
 if(result.data.code!==worker.code||result.data.metadata?.productionAccess!=="DENY") throw new Error(`Worker bootstrap verification failed: ${worker.code}`);
}
const verify=await db.from("dev_center_workers").select("id,code,name,role,status,capabilities,metadata").in("id",desired.map(x=>x.id)).order("code");
if(verify.error) throw verify.error;
console.log(JSON.stringify({applied:true,backupDir,workers:verify.data},null,2));
