import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const desktop=path.join(root,"desktop/benjadmin-developer-grid");
const pkg=JSON.parse(fs.readFileSync(path.join(desktop,"package.json"),"utf8"));
const html=fs.readFileSync(path.join(desktop,"src/renderer/index.html"),"utf8");
const renderer=fs.readFileSync(path.join(desktop,"src/renderer/renderer.js"),"utf8");
const css=fs.readFileSync(path.join(desktop,"src/renderer/styles.css"),"utf8");
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
let n=0;
const check=(name,fn)=>{fn();n+=1;console.log("PASS",name);};

check("desktop version keeps v0.1.78+ storage-meter baseline",()=>assert.ok(Number(pkg.version.split(".")[2]) >= 78));
check("backend version remains Developer Grid v0.1.78+",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.(?:7[89]|[89]\d|\d{3,})-dev"/));
check("five server footer disk meters rendered",()=>{
  for(const id of ["footerBuild01Disk","footerBuild02Disk","footerDevDisk","footerProdDisk","footerDbDisk"]) assert.ok(html.includes('id="'+id+'"'));
});
check("build READY label removed while BUSY remains",()=>{
  assert.match(renderer,/serverStatus\("build01"[\s\S]*?s\.state === "READY" \? "" : s\.state === "BUSY" \? "BUSY"/);
  assert.match(renderer,/serverStatus\("build02"[\s\S]*?s\.state === "READY" \? "" : s\.state === "BUSY" \? "BUSY"/);
});
check("disk thresholds are green below 75 orange from 75 red from 90",()=>{
  assert.match(renderer,/if \(value >= 90\) return "critical"/);
  assert.match(renderer,/if \(value >= 75\) return "warning"/);
  assert.match(renderer,/return "normal"/);
});
check("disk meter uses live server disk metrics",()=>{
  assert.match(renderer,/capacityPercent\(metrics\.diskUsedBytes, metrics\.diskTotalBytes, metrics\.diskPercent\)/);
  assert.match(renderer,/metrics\.diskAvailableBytes/);
});
check("disk tooltip exposes used total free and percent",()=>{
  assert.match(renderer,/Tárhely · Foglalt:/);
  assert.match(renderer,/Szabad:/);
  assert.match(renderer,/formatBytes\(available\)/);
});
check("disk meter color classes exist",()=>{
  assert.match(css,/\.footer-disk-meter\.is-normal \.footer-disk-fill/);
  assert.match(css,/\.footer-disk-meter\.is-warning \.footer-disk-fill/);
  assert.match(css,/\.footer-disk-meter\.is-critical \.footer-disk-fill/);
});
check("disk meter stays separate from footer cell state tone",()=>{
  assert.match(renderer,/setFooterDot\(dotId, tone\)/);
  assert.match(renderer,/renderFooterDiskMeter\(server, meterId\)/);
});
check("responsive compact footer meter CSS exists",()=>{
  assert.match(css,/@media \(max-width: 1500px\)[\s\S]*?\.footer-disk-meter/);
});

console.log("Developer Grid footer storage meter v0.1.78 contract PASS · "+n+"/"+n);
