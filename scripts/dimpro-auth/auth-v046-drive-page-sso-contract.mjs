import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const read=p=>fs.readFileSync(path.join(root,p),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
const page=read("app/drive/page.tsx"),proxy=read("proxy.ts");
check("central SSO Drive page no longer depends on legacy page-level gate",()=>{assert.doesNotMatch(page,/DRIVE_DEV_ACCESS_COOKIE|verifyProjectGateDevAccessToken|isDriveDevAccessConfigured|redirect\("\/login"\)/)});
check("Drive proxy protects Drive page with central app session",()=>{assert.match(proxy,/isDriveHost && \(isDrivePage \|\| isDriveProtectedApi\)/);assert.match(proxy,/getAppSessionByToken/)});
check("legacy DEV fallback remains centralized in proxy",()=>{assert.match(proxy,/const driveDevAccessConfigured = isDriveHost && !driveCentralSsoConfig && isDriveDevAccessConfigured\(host\)/);assert.match(proxy,/requestHasDriveDevAccess/)});
check("Drive page remains render-only",()=>assert.match(page,/return \([\s\S]*<DriveShell/));
console.log(`DIMPRO AUTH V0.4.6 compatibility contract PASS · ${n}/${n}`);
