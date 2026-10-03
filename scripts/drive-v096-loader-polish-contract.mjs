import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("components/drive/DrivePremiumLoader.module.css", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log("PASS " + String(pass).padStart(2, "0") + " " + label); };

check("desktop percent badge moves farther outward", () => {
  assert.match(css, /\.percentRing \{ position: absolute; right: -17px; bottom: 20px/);
});
check("900px laptop percent badge moves proportionally outward", () => {
  assert.match(css, /max-height: 900px[\s\S]*?percentRing \{ right: -12px; bottom: 18px; \}/);
});
check("760px laptop percent badge moves proportionally outward", () => {
  assert.match(css, /max-height: 760px[\s\S]*?percentRing \{ right: -10px; bottom: 16px; \}/);
});
check("logo core border is subtler on normal state", () => {
  assert.match(css, /\.logoCore \{[\s\S]*?border: 1px solid rgba\(57,124,193,\.11\)/);
});
check("logo core shadow is slightly softened", () => {
  assert.match(css, /\.logoCore \{[\s\S]*?0 14px 38px rgba\(33,91,151,\.10\)/);
  assert.match(css, /inset 0 0 24px rgba\(70,145,216,\.05\)/);
});
check("ready state logo border remains subtle", () => {
  assert.match(css, /\.loaderCardComplete \.logoCore \{[\s\S]*?border-color: rgba\(52, 157, 99, \.17\)/);
});
check("heading receives more air below visual stage", () => {
  assert.match(css, /\.heading \{ text-align: center; margin-top: 4px; \}/);
});
check("900px laptop removes negative visual-stage bottom margin", () => {
  assert.match(css, /max-height: 900px[\s\S]*?visualStage \{ width: 228px; height: 228px; margin-top: -3px; margin-bottom: 0; \}/);
});
check("760px laptop reduces negative bottom margin", () => {
  assert.match(css, /max-height: 760px[\s\S]*?margin-bottom: -7px/);
});
check("production access remains denied by policy", () => assert.doesNotMatch(css, /PROD ALLOW/));

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.9.6 Loader Polish", pass, fail: 0, productionAccess: "DENY" }, null, 2));