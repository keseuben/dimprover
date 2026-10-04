import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const page=fs.readFileSync(path.join(root,"app/drive/page.tsx"),"utf8");const proxy=fs.readFileSync(path.join(root,"proxy.ts"),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
check("Drive page prefers authoritative Host before forwarded host",()=>assert.match(page,/headerStore\.get\("host"\) \|\| headerStore\.get\("x-forwarded-host"\)/));
check("Drive proxy also derives host from Host header",()=>assert.match(proxy,/const hostHeader = request\.headers\.get\("host"\) \?\? ""/));
check("central SSO bypasses legacy page gate",()=>assert.match(page,/if \(!centralSsoConfigured && isDriveDevAccessConfigured\(host\)\)/));
console.log(`DIMPRO AUTH V0.4.7 Drive host-resolution contract PASS · ${n}/${n}`);
