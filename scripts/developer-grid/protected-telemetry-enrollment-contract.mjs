import assert from "node:assert/strict";import fs from "node:fs";const read=f=>fs.readFileSync(new URL(`../../${f}`,import.meta.url),"utf8");const enroll=read("app/lib/developer-grid/protected-telemetry-enrollment.ts"),route=read("app/api/dev/grid/protected-telemetry/enroll/route.ts"),ingress=read("app/lib/developer-grid/protected-telemetry-ingress.ts"),agent=read("scripts/developer-grid/protected-telemetry-agent.py");let n=0;const c=(l,f)=>{f();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${l}`)};
c("enrollment source IP allowlist exact",()=>{assert.match(enroll,/213\.160\.68\.24/);assert.match(enroll,/213\.160\.68\.33/);assert.match(enroll,/timingSafeEqual/)});
c("node secrets separate and 0600",()=>{assert.match(enroll,/\$\{nodeId\}\.key/);assert.match(enroll,/mode: 0o600/)});
c("one-time enrollment with bounded replay",()=>{assert.match(enroll,/ENROLLMENT_TTL_MS = 10 \* 60_000/);assert.match(enroll,/PROTECTED_TELEMETRY_ALREADY_ENROLLED/)});
c("enrollment response no-cache",()=>assert.match(route,/no-store, no-cache, must-revalidate/));
c("ingress authorizes by node key",()=>assert.match(ingress,/isProtectedTelemetryAuthorized\(headers: Headers, nodeId: ProtectedTelemetryNodeId\)/));
c("agent self-enrolls only when key absent",()=>{assert.match(agent,/def ensure_key/);assert.match(agent,/DEFAULT_ENROLL_ENDPOINT/);assert.match(agent,/os\.chmod\(key_path,0o600\)/)});
c("agent still has no command channel",()=>assert.doesNotMatch(agent,/subprocess|os\.system|Popen|ssh|exec\(/));
console.log(`Developer Grid protected telemetry enrollment contract PASS · ${n}/${n}`);
