import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
const lock=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package-lock.json"),"utf8"));
const packages=lock.packages||{};
let n=0; const check=(label,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`);};
check("desktop v0.1.106",()=>assert.equal(pkg.version,"0.1.106"));
const expected=new Map([["node_modules/@electron/asar/node_modules/brace-expansion","1.1.21"],["node_modules/@electron/universal/node_modules/brace-expansion","2.1.7"],["node_modules/brace-expansion","5.0.12"],["node_modules/dir-compare/node_modules/brace-expansion","1.1.21"],["node_modules/filelist/node_modules/brace-expansion","2.1.7"],["node_modules/glob/node_modules/brace-expansion","1.1.21"]]);
for(const [key,version] of expected) check(`${key} patched`,()=>assert.equal(packages[key]?.version,version));
check("Electron security patch version pinned",()=>assert.equal(pkg.devDependencies?.electron,"43.8.3"));
check("HTTP cache semantics security patch pinned",()=>assert.equal(packages["node_modules/http-cache-semantics"]?.version,"4.3.0"));
check("electron-builder direct version unchanged",()=>assert.equal(pkg.devDependencies?.["electron-builder"],"26.15.3"));
const patchedTransitives=new Map([["node_modules/fast-uri","3.1.9"],["node_modules/undici","7.30.1"],["node_modules/node-gyp/node_modules/undici","6.29.1"]]);
for(const [key,version] of patchedTransitives) {
  check(key+" security patch locked",()=>assert.equal(packages[key]?.version,version));
  check(key+" installed content matches lock",()=>{
    const installed=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid",key,"package.json"),"utf8"));
    assert.equal(installed.version,packages[key]?.version);
  });
}
console.log(`Developer Grid v0.1.106 build dependency security contract PASS · ${n}/${n}`);
