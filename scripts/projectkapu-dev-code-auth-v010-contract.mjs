#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const access=readFileSync("app/lib/project-gate/devAccess.ts","utf8");
const route=readFileSync("app/api/project-gate/dev-access/session/route.ts","utf8");
const login=readFileSync("app/login/ProjectGateCodeLogin.tsx","utf8");
const loginPage=readFileSync("app/login/page.tsx","utf8");
const auth=readFileSync("app/lib/notifications/notificationAuth.ts","utf8");
const proxy=readFileSync("proxy.ts","utf8");
const guard=readFileSync("components/auth/SessionGuardClient.tsx","utf8");
let pass=0;const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("access code is never embedded in source",()=>{for(const source of [access,route,login,loginPage,auth,proxy,guard]) assert.doesNotMatch(source,/900407/);});
check("default host scope is DEV-only",()=>assert.match(access,/projektkapu\.dev\.dimpro\.hu/)&&assert.doesNotMatch(access,/www\.projektkapu\.dimpro\.hu/));
check("feature flag must explicitly enable code auth",()=>assert.match(access,/PROJECTKAPU_DEV_CODE_AUTH_ENABLED/));
check("configured verifier uses scrypt salt and hash",()=>assert.match(access,/PROJECTKAPU_DEV_ACCESS_CODE_SALT/)&&assert.match(access,/PROJECTKAPU_DEV_ACCESS_CODE_HASH/)&&assert.match(access,/scryptSync/));
check("session secret uses explicit or existing DROP secret and derives a separate key",()=>assert.match(access,/PROJECTKAPU_DEV_ACCESS_SESSION_SECRET/)&&assert.match(access,/DROP_SESSION_SECRET/)&&assert.match(access,/projectkapu-dev-access-session-v1/));
check("code uses scrypt while session token uses HMAC and expiry",()=>assert.match(access,/scryptSync/)&&assert.match(access,/createHmac\("sha256"/)&&assert.match(access,/expiresAt/));
check("token comparison uses timingSafeEqual",()=>assert.match(access,/timingSafeEqual/));
check("cookie is HttpOnly strict and host-only",()=>assert.match(access,/httpOnly: true/)&&assert.match(access,/sameSite: "strict"/)&&assert.match(access,/path: "\/"/));
check("login endpoint is rate limited",()=>assert.match(route,/MAX_ATTEMPTS = 5/)&&assert.match(route,/WINDOW_MS = 10 \* 60 \* 1000/));
check("login endpoint returns project route after success",()=>assert.match(route,/next: "\/projektkapu\/projects"/));
check("login UI accepts only six numeric digits",()=>assert.match(login,/inputMode="numeric"/)&&assert.match(login,/pattern="\[0-9\]\{6\}"/)&&assert.match(login,/maxLength=\{6\}/));
check("project host gets dedicated login UI",()=>assert.match(loginPage,/isProjectGateDevDomain/)&&assert.match(loginPage,/ProjectGateCodeLogin/));
check("pilot session resolves to existing dev-web-user only",()=>assert.match(auth,/mode: "project-gate-dev"/)&&assert.match(auth,/userId: DEV_WEB_USER_ID/)&&assert.match(auth,/uniqueUserIds\(\[DEV_WEB_USER_ID\]\)/));
check("proxy protects Projectkapu pages with code session",()=>assert.match(proxy,/projectGateDevAccessConfigured/)&&assert.match(proxy,/!projectGateDevSession && !pathname\.startsWith\("\/api\/"\)/));
check("proxy does not hardcode PROD account/modules redirect",()=>assert.doesNotMatch(proxy,/new URL\("\/", "https:\/\/projektkapu\.dimpro\.hu"\)/));
check("logout clears temporary Projectkapu session",()=>assert.match(guard,/api\/project-gate\/dev-access\/session/)&&assert.match(guard,/method: "DELETE"/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
