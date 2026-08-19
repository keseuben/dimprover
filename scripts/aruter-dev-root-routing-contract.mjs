import assert from "node:assert/strict";
import fs from "node:fs";
const proxy=fs.readFileSync("proxy.ts","utf8");
const checks=[
  ["DEV Aruter host remains recognized",proxy.includes('host === "aruter.dev.dimpro.hu"')],
  ["Aruter redirect keeps HTTPS app host split",proxy.includes('url.hostname = isDevEnvironment ? "app.dev.dimpro.hu" : "app.dimpro.hu"')],
  ["DEV Aruter root opens pilot business storefront",proxy.includes('isDevEnvironment ? "/aruter/kovacs-kerteszet" : "/aruter"')],
  ["PROD Aruter root remains legacy landing",proxy.includes(': "/aruter")')],
  ["non-root Aruter paths remain unchanged",proxy.includes(': pathname;')],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
