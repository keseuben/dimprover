import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const read=p=>fs.readFileSync(path.join(root,p),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
const page=read("app/drive/page.tsx"),proxy=read("proxy.ts");
check("Drive page detects central SSO config",()=>{assert.match(page,/resolveDriveSsoConfig/);assert.match(page,/centralSsoConfigured = Boolean\(resolveDriveSsoConfig\(host\)\)/)});
check("legacy Drive DEV cookie gate is skipped under central SSO",()=>assert.match(page,/if \(!centralSsoConfigured && isDriveDevAccessConfigured\(host\)\)/));
check("legacy fallback remains for non-SSO hosts",()=>{assert.match(page,/DRIVE_DEV_ACCESS_COOKIE/);assert.match(page,/verifyProjectGateDevAccessToken/);assert.match(page,/redirect\("\/login"\)/)});
check("Drive proxy still protects Drive page with central app session",()=>{assert.match(proxy,/isDriveHost && \(isDrivePage \|\| isDriveProtectedApi\)/);assert.match(proxy,/getAppSessionByToken/)});
console.log(`DIMPRO AUTH V0.4.6 Drive page central-SSO contract PASS · ${n}/${n}`);
