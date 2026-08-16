#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const base=(process.env.BENJADMIN_API_BASE||"http://127.0.0.1:3100").replace(/\/$/,"");
const host=process.env.BENJADMIN_HOST||"admin.dev.dimpro.hu";
const projectRoot=process.env.BENJADMIN_EXPECTED_PROJECT_ROOT||process.cwd();
const key=fs.readFileSync(path.join(projectRoot,".dimprover/license/admin-key.txt"),"utf8").trim();
const endpoint=`https://push.invalid.example/${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storePath=path.join(projectRoot,".data/dimpro-dev-center/push-subscriptions.json");
const headers={host,"x-dimpro-license-admin-key":key,"content-type":"application/json"};
let passed=0;
function check(name,condition,detail=""){if(!condition)throw new Error(`${name}${detail?` :: ${detail}`:""}`);passed++;console.log(`PASS ${name}${detail?` :: ${detail}`:""}`)}
async function request(url,options={}){const response=await fetch(`${base}${url}`,{headers,...options});const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={raw:text}}return{response,payload}}
try{
  let result=await request("/api/dev/push/public-key");
  check("Push config authorized",result.response.status===200,`status=${result.response.status}`);
  check("VAPID public config ready",result.payload?.ok===true&&result.payload?.configured===true&&typeof result.payload?.publicKey==="string"&&result.payload.publicKey.length>20,JSON.stringify({ok:result.payload?.ok,configured:result.payload?.configured,count:result.payload?.subscriptionCount}));
  const before=Number(result.payload?.subscriptionCount||0);

  result=await request("/api/dev/push/subscribe",{method:"POST",body:JSON.stringify({subscription:{endpoint,expirationTime:null,keys:{p256dh:"runtime-test-p256dh",auth:"runtime-test-auth"}},deviceLabel:"BENJADMIN V1.3 runtime acceptance"})});
  check("Synthetic subscription accepted",result.response.status===200&&result.payload?.ok===true,`status=${result.response.status}`);
  check("Subscription count increments",Number(result.payload?.subscriptionCount)===before+1,JSON.stringify(result.payload));
  check("Persistent push store created under project root",fs.existsSync(storePath),storePath);
  const store=JSON.parse(fs.readFileSync(storePath,"utf8"));
  check("Synthetic subscription persisted in shared store",Array.isArray(store.subscriptions)&&store.subscriptions.some((item)=>item.endpoint===endpoint),`count=${store.subscriptions?.length}`);

  result=await request("/api/dev/push/public-key");
  check("Public config sees persisted subscription",Number(result.payload?.subscriptionCount)===before+1,JSON.stringify({count:result.payload?.subscriptionCount}));

  const taskId=`dev-task-runtime-${Date.now()}`;
  result=await request("/api/dev/push/test",{method:"POST",body:JSON.stringify({taskId})});
  check("Task test push route responds",result.response.status===200&&result.payload?.ok===true,`status=${result.response.status}`);
  check("Task test push returns task id",result.payload?.targetTaskId===taskId,JSON.stringify(result.payload));
  check("Task test push returns deep-link",result.payload?.targetUrl===`/admin/dev-console?task=${encodeURIComponent(taskId)}`,String(result.payload?.targetUrl));

  result=await request("/api/dev/push/unsubscribe",{method:"POST",body:JSON.stringify({endpoint})});
  check("Synthetic subscription removed",result.response.status===200&&result.payload?.ok===true&&result.payload?.removed===true,JSON.stringify(result.payload));
  check("Subscription count restored",Number(result.payload?.subscriptionCount)===before,JSON.stringify(result.payload));

  const finalStore=JSON.parse(fs.readFileSync(storePath,"utf8"));
  check("Synthetic endpoint absent after cleanup",!finalStore.subscriptions.some((item)=>item.endpoint===endpoint),`count=${finalStore.subscriptions.length}`);
  console.log(JSON.stringify({ok:true,passed,failed:0,storePath,baselineSubscriptionCount:before},null,2));
} finally {
  try { await request("/api/dev/push/unsubscribe",{method:"POST",body:JSON.stringify({endpoint})}); } catch {}
}
