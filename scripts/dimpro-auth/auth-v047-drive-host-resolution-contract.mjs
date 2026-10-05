import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const page=fs.readFileSync(path.join(root,"app/drive/page.tsx"),"utf8");const proxy=fs.readFileSync(path.join(root,"proxy.ts"),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
check("Drive proxy derives authoritative host from Host header",()=>assert.match(proxy,/const hostHeader = request\.headers\.get\("host"\) \?\? ""/));
check("Drive page no longer performs a competing host-based auth decision",()=>{assert.doesNotMatch(page,/headers\(|x-forwarded-host|resolveDriveSsoConfig/)});
check("central SSO and legacy fallback selection remains centralized in proxy",()=>{assert.match(proxy,/const driveCentralSsoConfig = isDriveHost \? resolveDriveSsoConfig\(host\) : null/);assert.match(proxy,/!driveCentralSsoConfig && isDriveDevAccessConfigured\(host\)/)});
console.log(`DIMPRO AUTH V0.4.7 compatibility contract PASS · ${n}/${n}`);
