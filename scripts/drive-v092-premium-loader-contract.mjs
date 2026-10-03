import assert from "node:assert/strict";
import fs from "node:fs";

const loader = fs.readFileSync("components/drive/DrivePremiumLoader.tsx", "utf8");
const css = fs.readFileSync("components/drive/DrivePremiumLoader.module.css", "utf8");
const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("premium loader remains integrated into the Drive boot lifecycle", () => {
  assert.match(workspace, /import DrivePremiumLoader from "\.\/DrivePremiumLoader"/);
  assert.match(workspace, /if \(bootLoaderVisible\)[\s\S]*?<DrivePremiumLoader complete=\{bootLoaderComplete\} \/>/);
});
check("legacy plain Drive loading spinner is removed", () => {
  assert.doesNotMatch(workspace, /return <div className=\{styles\.loadingState\}>/);
});
check("real DIMPRO hexagon+P asset is used", () => assert.match(loader, /src="\/dimprover-logo\.png"/));
check("boot sequence exposes five engineering stages", () => {
  for (const token of ["Kapcsolat", "Jogosultságok", "Workspace", "Dokumentumtár", "Metaadatok"]) assert.match(loader, new RegExp(token));
  const stepsSource = loader.slice(loader.indexOf("const BOOT_STEPS"), loader.indexOf("];", loader.indexOf("const BOOT_STEPS")) + 2);
  assert.equal((stepsSource.match(/threshold:/g) || []).length, 5);
});
check("progress starts low and fail-safe caps at 92 until completion mode", () => {
  assert.match(loader, /useState\(6\)/);
  assert.match(loader, /return 92/);
  assert.match(loader, /complete \? 100 : progressTarget\(elapsed\)/);
});
check("percentage is exposed visually and accessibly", () => {
  assert.match(loader, /role="progressbar"/);
  assert.match(loader, /aria-valuenow=\{roundedProgress\}/);
  assert.match(loader, /\{roundedProgress\}%/);
});
check("boot statuses include permission workspace tree and BOX metadata language", () => {
  assert.match(loader, /Projektjogosultságok/);
  assert.match(loader, /Workspace 1\.0/);
  assert.match(loader, /Projektmappák és dokumentumtár/);
  assert.match(loader, /CsomagBOX/);
});
check("premium loader includes animated orbit scan and shimmer layers", () => {
  for (const token of ["outerOrbit", "middleOrbit", "logoScan", "progressShimmer", "orbitNode"]) assert.match(loader, new RegExp(token));
});
check("light blueprint engineering background is present", () => {
  assert.match(css, /\.blueprint/);
  assert.match(css, /background-size: 32px 32px/);
  assert.match(css, /mask-image: radial-gradient/);
});
check("active and completed boot steps are visually distinct", () => {
  assert.match(css, /\.bootStepActive/);
  assert.match(css, /\.bootStepDone/);
});
check("slow-load hint appears only after extended loading", () => {
  assert.match(loader, /elapsedMs > 7000/);
  assert.match(loader, /Kapcsolat ellenőrzése folyamatban/);
});
check("reduced-motion accessibility disables premium animations", () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
});
check("DEV workspace and secure connection labels remain explicit", () => {
  assert.match(loader, /DEV WORKSPACE/);
  assert.match(loader, /Titkosított projektkapcsolat/);
});
check("production access stays denied by release policy", () => {
  assert.doesNotMatch(loader + css + workspace, /PROD ALLOW/);
});

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive Premium Boot Loader", pass, fail: 0, productionAccess: "DENY" }, null, 2));
