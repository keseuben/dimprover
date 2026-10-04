import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const read=p=>fs.readFileSync(path.join(root,p),"utf8");let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`)};
const repo=read("app/lib/dimpro-auth/repository.ts"),authorize=read("app/api/dimpro-auth/authorize/route.ts");
check("authorization request locks only mutable request row",()=>assert.match(repo,/WHERE r\.id=\$1 LIMIT 1 FOR UPDATE OF r/));
check("authorization code exchange locks only mutable code row",()=>assert.match(repo,/WHERE ac\.code_hash=\$1[\s\S]{0,80}LIMIT 1 FOR UPDATE OF ac/));
check("app-session revoke locks only mutable app-session row",()=>assert.match(repo,/WHERE s\.token_hash=\$1 AND c\.client_id=\$2 AND s\.revoked_at IS NULL LIMIT 1 FOR UPDATE OF s/));
check("SSO joins remain read-only for clients users and parent sessions",()=>{assert.doesNotMatch(repo,/FOR UPDATE OF c/);assert.doesNotMatch(repo,/FOR UPDATE OF u/)});
check("authorize unexpected failures emit correlation-safe server diagnostics",()=>{assert.match(authorize,/DIMPRO AUTH authorize failure/);assert.match(authorize,/correlationId/);assert.match(authorize,/errorCode/)});
console.log(`DIMPRO AUTH V0.4.3 SSO row-lock contract PASS · ${n}/${n}`);
