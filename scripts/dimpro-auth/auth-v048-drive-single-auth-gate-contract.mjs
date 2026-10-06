import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const page=fs.readFileSync(path.join(root,"app/drive/page.tsx"),"utf8");const proxy=fs.readFileSync(path.join(root,"proxy.ts"),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
check("DrivePage has no independent authentication redirect",()=>{assert.doesNotMatch(page,/redirect\(/);assert.doesNotMatch(page,/\/login/)});
check("DrivePage has no legacy DEV access cookie dependency",()=>{assert.doesNotMatch(page,/DRIVE_DEV_ACCESS_COOKIE|verifyProjectGateDevAccessToken|isDriveDevAccessConfigured/)});
check("DrivePage has no duplicate host-based auth decision",()=>{assert.doesNotMatch(page,/resolveDriveSsoConfig|headers\(|cookies\(/)});
check("proxy remains authoritative central SSO gate",()=>{assert.match(proxy,/isDriveHost && \(isDrivePage \|\| isDriveProtectedApi\)/);assert.match(proxy,/getAppSessionByToken/);assert.match(proxy,/hasAuthPermission\(\{ userId: session\.user\.id, permissionCode: "drive\.access", productCode: "DRIVE" \}\)/)});
check("proxy retains legacy Drive DEV fallback only without central SSO",()=>{assert.match(proxy,/const driveDevAccessConfigured = isDriveHost && !driveCentralSsoConfig && isDriveDevAccessConfigured\(host\)/);assert.match(proxy,/requestHasDriveDevAccess/)});
console.log(`DIMPRO AUTH V0.4.8 Drive single-auth-gate contract PASS · ${n}/${n}`);
