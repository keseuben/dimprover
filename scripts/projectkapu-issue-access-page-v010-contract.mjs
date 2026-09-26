#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const proxy=readFileSync("proxy.ts","utf8");
const page=readFileSync("app/projektkapu/kiadas/page.tsx","utf8");
const access=readFileSync("app/lib/drive-core/issueAccess.ts","utf8");
let pass=0; const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};
check("only dedicated issue landing is public on Projectkapu host",()=>assert.match(proxy,/isProjectGatePublicIssuePage/)&&assert.match(proxy,/pathname === "\/kiadas"/)&&assert.match(proxy,/pathname === "\/projektkapu\/kiadas"/));
check("public vanity path redirects to canonical page without self-proxy",()=>assert.match(proxy,/url\.pathname = "\/projektkapu\/kiadas"/)&&assert.match(proxy,/NextResponse\.redirect\(url, 307\)/)&&assert.doesNotMatch(proxy,/NextResponse\.rewrite\(url\)/));
check("landing requires token inspection",()=>assert.match(page,/inspectDriveIssueAccess\(token\)/));
check("landing does not directly create signed S3 URL",()=>assert.doesNotMatch(page,/createDriveSignedGetUrl/));
check("download remains separate audit API action",()=>assert.match(page,/\/api\/drive\/public\/issue-download\?token=/));
check("landing is noindex and no-referrer",()=>assert.match(page,/index: false/)&&assert.match(page,/referrer: "no-referrer"/));
check("generated links target landing page",()=>assert.match(access,/new URL\("\/kiadas", origin\)/));
check("expired and withdrawn UX is human-readable",()=>assert.match(page,/Kérjen új kiadási hivatkozást/)&&assert.match(page,/visszavonták vagy újabb kiadás/));
console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
