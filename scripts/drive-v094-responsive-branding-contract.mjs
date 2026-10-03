import assert from "node:assert/strict";
import fs from "node:fs";

const loader = fs.readFileSync("components/drive/DrivePremiumLoader.tsx", "utf8");
const css = fs.readFileSync("components/drive/DrivePremiumLoader.module.css", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("loader root uses full dynamic viewport height instead of 68vh", () => {
  assert.match(css, /\.root \{[\s\S]*?height: 100dvh/);
  assert.doesNotMatch(css, /height: min\(68vh, 720px\)/);
});
check("root includes viewport-safe box sizing and padding", () => {
  assert.match(css, /box-sizing: border-box/);
  assert.match(css, /padding: clamp\(14px, 2\.2vh, 26px\) 18px/);
});
check("large-screen composition is wider and keeps wordmark below card", () => {
  assert.match(css, /\.loaderComposition[\s\S]*?width: min\(810px/);
  assert.match(css, /gap: 28px/);
});
check("main DIMPRO DRIVE wordmark is enlarged", () => {
  assert.match(css, /font-size: clamp\(42px, 3\.55vw, 58px\)/);
  assert.match(loader, /<strong>DIMPRO<\/strong>/);
  assert.match(loader, /<span>DRIVE<\/span>/);
});
check("Digitális projektmunkatér subtitle is larger and readable", () => {
  assert.match(css, /\.driveWordmark small[\s\S]*?font-size: 10px/);
  assert.match(loader, /DIGITÁLIS PROJEKTMUNKATÉR/);
});
check("central DIMPRO logo remains enlarged and has advanced beyond V094", () => {
  assert.match(loader, /width=\{132\} height=\{132\}/);
  assert.match(css, /\.logo \{ width: 132px; height: 132px/);
});
check("logo core remains enlarged and has advanced beyond V094", () => assert.match(css, /\.logoCore \{ width: 160px; height: 160px/));
check("visual orbit stage remains enlarged and has advanced beyond V094", () => assert.match(css, /\.visualStage \{ width: 252px; height: 252px/));
check("laptop height breakpoint exists at 900px", () => {
  assert.match(css, /@media \(max-height: 900px\) and \(min-width: 881px\)/);
  assert.match(css, /align-items: start/);
});
check("short laptop breakpoint exists at 760px", () => {
  assert.match(css, /@media \(max-height: 760px\) and \(min-width: 881px\)/);
  assert.match(css, /overflow-y: auto/);
});
check("laptop wordmark remains large instead of disappearing", () => {
  assert.match(css, /max-height: 900px[\s\S]*?driveWordmarkMain[\s\S]*?font-size: clamp\(44px, 4\.1vw, 56px\)/);
});
check("short laptop mode compacts the card rather than clipping the wordmark", () => {
  assert.match(css, /max-height: 760px[\s\S]*?loaderCard[\s\S]*?min-height: 398px/);
  assert.match(css, /max-height: 760px[\s\S]*?loaderComposition \{ gap: 10px/);
});
check("narrow displays remain scroll-safe", () => {
  assert.match(css, /@media \(max-width: 880px\)[\s\S]*?min-height: 100dvh[\s\S]*?overflow-y: auto/);
});
check("production access remains denied by policy", () => assert.doesNotMatch(loader + css, /PROD ALLOW/));

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.9.4 Responsive Premium Branding", pass, fail: 0, productionAccess: "DENY" }, null, 2));