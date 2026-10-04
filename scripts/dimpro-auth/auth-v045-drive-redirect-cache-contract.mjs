import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const proxy=fs.readFileSync(path.join(root,"proxy.ts"),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
check("Drive auth redirect helper disables browser caching",()=>{assert.match(proxy,/function applyDriveAuthRedirectHeaders/);assert.match(proxy,/no-store, no-cache, max-age=0, must-revalidate/);assert.match(proxy,/Pragma", "no-cache/);assert.match(proxy,/Expires", "0/)});
check("Drive root redirect is no-store",()=>assert.match(proxy,/isDriveHost && pathname === "\/"[\s\S]{0,260}applyDriveAuthRedirectHeaders\(NextResponse\.redirect\(url, 307\)\)/));
check("Drive login redirect is no-store",()=>assert.match(proxy,/isDriveHost && isLoginPage && driveCentralSsoConfig[\s\S]{0,360}applyDriveAuthRedirectHeaders\(NextResponse\.redirect\(url, 307\)\)/));
check("missing app session redirect is no-store",()=>assert.match(proxy,/url\.searchParams\.set\("return_to", pathname \+ request\.nextUrl\.search\);\n\s+return applyDriveAuthRedirectHeaders\(NextResponse\.redirect\(url\)\)/));
check("Drive forbidden redirect is no-store",()=>assert.match(proxy,/url\.searchParams\.set\("access", "drive-forbidden"\);\n\s+return applyDriveAuthRedirectHeaders\(NextResponse\.redirect\(url\)\)/));
console.log(`DIMPRO AUTH V0.4.5 Drive redirect-cache contract PASS · ${n}/${n}`);
