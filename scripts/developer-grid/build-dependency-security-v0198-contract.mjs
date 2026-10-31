import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
const lock=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package-lock.json"),"utf8"));
const packages=lock.packages||{};
let n=0; const check=(label,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`);};
check("desktop v0.1.124",()=>assert.equal(pkg.version,"0.1.124"));
const patchedMatchers=new Map([["brace-expansion","5.0.12"],["minimatch","11.0.3"],["glob","14.0.3"]]);
for(const [name,version] of patchedMatchers) {
  check(name+" patched version present",()=>assert.equal(packages["node_modules/"+name]?.version,version));
  for(const [key,entry] of Object.entries(packages).filter(([key])=>key.endsWith("/"+name))) {
    check(key+" has no vulnerable legacy copy",()=>assert.equal(entry.version,version));
    check(key+" installed content matches lock",()=>assert.equal(JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid",key,"package.json"),"utf8")).version,version));
  }
}
check("patched glob dependencies are pinned for every consumer",()=>{
  assert.equal(pkg.overrides.minimatch,"$minimatch");assert.equal(pkg.overrides.glob,"$glob");
});
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
console.log(`Developer Grid v0.1.124 build dependency security contract PASS · ${n}/${n}`);
