import assert from "node:assert/strict";
import fs from "node:fs";

const loader = fs.readFileSync("components/drive/DrivePremiumLoader.tsx", "utf8");
const css = fs.readFileSync("components/drive/DrivePremiumLoader.module.css", "utf8");
const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("completion mode is explicit on the premium loader", () => {
  assert.match(loader, /type Props = \{ complete\?: boolean \}/);
  assert.match(loader, /DrivePremiumLoader\(\{ complete = false \}/);
});
check("backend-loading phase remains capped at 92 percent", () => {
  assert.match(loader, /return 92/);
  assert.match(loader, /complete \? 100 : progressTarget\(elapsed\)/);
});
check("completion mode advances visual progress to 100", () => {
  assert.match(loader, /const target = complete \? 100/);
  assert.match(loader, /Math\.max\(4, Math\.ceil\(distance \* 0\.35\)\)/);
});
check("completion copy clearly says Drive is ready", () => {
  assert.match(loader, /DIMPRO Drive készen áll\./);
  assert.match(loader, /SYSTEM READY/);
  assert.match(loader, /RENDSZER KÉSZ/);
  assert.match(loader, /Munkatér előkészítve/);
});
check("all boot steps complete in completion mode", () => {
  assert.match(loader, /const done = complete \|\| progress >= step\.threshold/);
  assert.match(loader, /const active = !complete && !done/);
});
check("workspace holds completed loader for 1800ms", () => {
  assert.match(workspace, /setBootLoaderComplete\(true\)/);
  assert.match(workspace, /window\.setTimeout\(\(\) => \{[\s\S]*?setBootLoaderVisible\(false\)[\s\S]*?\}, 1800\)/);
});
check("completion hold only applies while boot loader lifecycle is active", () => {
  assert.match(workspace, /if \(bootLoaderVisibleRef\.current\)/);
  assert.match(workspace, /bootLoaderVisibleRef\.current = false/);
});
check("project changes reset the premium boot lifecycle", () => {
  assert.match(workspace, /bootLoaderVisibleRef\.current = true/);
  assert.match(workspace, /setBootLoaderVisible\(true\)/);
  assert.match(workspace, /setBootLoaderComplete\(false\)/);
});
check("loader hold timer is cleared on lifecycle cleanup", () => {
  assert.match(workspace, /bootLoaderHoldTimerRef/);
  assert.match(workspace, /window\.clearTimeout\(bootLoaderHoldTimerRef\.current\)/);
});
check("load failure does not trap the user behind the loader", () => {
  assert.match(workspace, /setError\([\s\S]*?setBootLoaderVisible\(false\)[\s\S]*?setBootLoaderComplete\(false\)/);
});
check("large DIMPRO DRIVE wordmark renders below the card", () => {
  const cardIndex = loader.indexOf("styles.loaderCard");
  const wordmarkIndex = loader.indexOf("styles.driveWordmark");
  assert.ok(cardIndex >= 0 && wordmarkIndex > cardIndex);
  assert.match(loader, /<strong>DIMPRO<\/strong>/);
  assert.match(loader, /<span>DRIVE<\/span>/);
  assert.match(loader, /DIGITÁLIS PROJEKTMUNKATÉR/);
});
check("wordmark is visually large, centered and brand weighted", () => {
  assert.match(css, /\.driveWordmarkMain[\s\S]*?font-size: clamp\(42px, 3\.55vw, 58px\)/);
  assert.match(css, /\.driveWordmarkMain strong[\s\S]*?font-weight: 950/);
  assert.match(css, /\.driveWordmarkMain span[\s\S]*?color: #63839f/);
});
check("wordmark receives a ready-state accent", () => {
  assert.match(loader, /driveWordmarkReady/);
  assert.match(css, /\.driveWordmarkReady \.driveWordmarkMain strong/);
});
check("completion card receives a restrained ready-state accent", () => {
  assert.match(loader, /loaderCardComplete/);
  assert.match(css, /\.loaderCardComplete/);
});
check("legacy loading state variable is fully removed", () => {
  assert.doesNotMatch(workspace, /const \[loading, setLoading\]/);
  assert.doesNotMatch(workspace, /setLoading\(/);
});
check("production access remains denied by release policy", () => {
  assert.doesNotMatch(loader + css + workspace, /PROD ALLOW/);
});

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.9.3 Completion Hold + Wordmark", pass, fail: 0, productionAccess: "DENY" }, null, 2));