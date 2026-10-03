import assert from "node:assert/strict";
import fs from "node:fs";

const loader = fs.readFileSync("components/drive/DrivePremiumLoader.tsx", "utf8");
const css = fs.readFileSync("components/drive/DrivePremiumLoader.module.css", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log("PASS " + String(pass).padStart(2, "0") + " " + label); };

check("DIMPRO logo asset is 132px", () => {
  assert.match(loader, /width=\{132\} height=\{132\}/);
  assert.match(css, /\.logo \{ width: 132px; height: 132px/);
});
check("logo core is 160px", () => assert.match(css, /\.logoCore \{ width: 160px; height: 160px/));
check("visual stage is 252px", () => assert.match(css, /\.visualStage \{ width: 252px; height: 252px/));
check("orbit nodes are redistributed for 252px stage", () => {
  assert.match(css, /\.node1 \{ left: 122px; top: -5px; \}/);
  assert.match(css, /\.node2 \{ right: 15px; top: 58px; \}/);
  assert.match(css, /\.node4 \{ left: 122px; bottom: -5px; \}/);
});
check("percentage bubble moves outward on desktop", () => {
  assert.match(css, /\.percentRing \{ position: absolute; right: -14px; bottom: 20px/);
});
check("900px-height laptop keeps larger logo proportions", () => {
  assert.match(css, /max-height: 900px[\s\S]*?visualStage \{ width: 228px; height: 228px/);
  assert.match(css, /max-height: 900px[\s\S]*?logoCore \{ width: 146px; height: 146px/);
  assert.match(css, /max-height: 900px[\s\S]*?logo \{ width: 118px; height: 118px/);
});
check("900px-height laptop percentage bubble stays outside core", () => {
  assert.match(css, /max-height: 900px[\s\S]*?percentRing \{ right: -10px; bottom: 18px; \}/);
});
check("760px-height laptop remains compact and readable", () => {
  assert.match(css, /max-height: 760px[\s\S]*?visualStage[\s\S]*?width: 196px;[\s\S]*?height: 196px/);
  assert.match(css, /max-height: 760px[\s\S]*?logoCore \{ width: 132px; height: 132px/);
  assert.match(css, /max-height: 760px[\s\S]*?logo \{ width: 104px; height: 104px/);
});
check("760px-height percentage bubble remains slightly outside", () => {
  assert.match(css, /max-height: 760px[\s\S]*?percentRing \{ right: -8px; bottom: 16px; \}/);
});
check("wordmark and completion hold remain present", () => {
  assert.match(loader, /DIGITÁLIS PROJEKTMUNKATÉR/);
  assert.match(loader, /complete \? "SYSTEM READY" : "SECURE BOOT"/);
});
check("production access remains denied by policy", () => assert.doesNotMatch(loader + css, /PROD ALLOW/));

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.9.5 Logo Scale + Percent Bubble", pass, fail: 0, productionAccess: "DENY" }, null, 2));