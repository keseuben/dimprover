import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const client = require(path.join(root, "desktop/benjadmin-developer-grid/src/context-workspace/context-workspace-client.cjs"));
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
let n=0; const check=async(label,fn)=>{await fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`)};

await check("desktop version v0.1.72", async()=>assert.equal(pkg.version,"0.1.81"));
await check("backend version v0.1.72-dev", async()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.81-dev"/));

await check("HTTP client preserves backend code and status", async()=>{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async()=>new Response(JSON.stringify({ok:false,code:"DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_SESSION_MISMATCH",error:"closed session"}),{status:409,headers:{"content-type":"application/json"}});
  try {
    await assert.rejects(
      ()=>client.heartbeatDeveloperGridSession({baseUrl:"https://admin.dev.dimpro.hu",deviceToken:"test-token",input:{taskId:"t",sessionId:"s",workerCode:"JAZMINAI"}}),
      (error)=>error?.code === "DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_SESSION_MISMATCH" && error?.status === 409 && error?.message === "closed session"
    );
  } finally { globalThis.fetch = originalFetch; }
});

await check("recovery trigger is exact engine-session mismatch only", async()=>{
  assert.match(main,/String\(errorCode \|\| ""\) !== "DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_SESSION_MISMATCH"/);
  assert.doesNotMatch(main,/\[\s*"DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_SESSION_MISMATCH"\s*,/);
});
await check("heartbeat recovery reuses strict V0168 authority recovery", async()=>assert.match(main,/recoverConversationExecutionAuthority\(launchTask, code\)/));
await check("recovery is single-flight per exact Grid identity", async()=>{
  assert.match(main,/heartbeatAuthorityRecoveryKeys\.has\(key\)/);
  assert.match(main,/heartbeatAuthorityRecoveryKeys\.delete\(key\)/);
});
await check("continuation requires exact authoritative bound conversation", async()=>{
  assert.match(main,/expectedConversationId && currentConversationId === expectedConversationId/);
  assert.match(main,/sendExecutionAuthorityRecoveredContinuation\(view, refreshedTask, code, authority\)/);
});
await check("recovery immediately proves heartbeat with refreshed authority", async()=>assert.match(main,/input:\{ taskId:String\(refreshedTask\.id\), sessionId:String\(refreshedTask\.sessionId\), workerCode:code \}/));
await check("recovery telemetry remains versioned V0171", async()=>{
  assert.match(main,/heartbeatAuthorityRecoveryVersion:"V0171"/);
  assert.match(main,/recoveryVersion:"V0171"/);
});
await check("PROD remains denied by existing execution authority contract", async()=>assert.match(main,/"DEV ONLY - PROD DENY\."/));

console.log(`Developer Grid heartbeat authority recovery v0.1.71 contract PASS · ${n}/${n}`);
