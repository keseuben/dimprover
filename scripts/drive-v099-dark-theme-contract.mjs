#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const page = read("app/drive/page.tsx");
const shell = read("components/drive/DriveShell.tsx");
const board = read("components/drive/FloatingProjectBoard.tsx");
const theme = read("components/drive/driveTheme.ts");
const buildInfo = read("components/drive/driveBuildInfo.ts");
const css = read("components/drive/DriveWorkspace.module.css");
const loaderCss = read("components/drive/DrivePremiumLoader.module.css");

let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log("PASS " + String(pass).padStart(2, "0") + " " + label); };
function luminance(hex) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a, b) { let x = luminance(a), y = luminance(b); if (x < y) [x, y] = [y, x]; return (x + 0.05) / (y + 0.05); }

check("Drive dark-theme series uses shared 0.9.x version source", () => assert.match(buildInfo, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.\d+"/));
check("theme storage key and normalization are centralized", () => {
  assert.match(theme, /DRIVE_THEME_STORAGE_KEY = "dimpro-drive-theme"/);
  assert.match(theme, /value === "dark" \? "dark" : "light"/);
});
check("Drive page restores stored theme before the shell renders", () => {
  assert.match(page, /localStorage\.getItem\("dimpro-drive-theme"\)/);
  assert.match(page, /document\.documentElement\.dataset\.driveTheme/);
  assert.match(page, /document\.documentElement\.style\.colorScheme/);
  assert.ok(page.indexOf("<script") < page.indexOf("<DriveShell"));
});
check("DriveShell owns one persistent light/dark state", () => {
  assert.match(shell, /useState<DriveTheme>\("light"\)/);
  assert.match(shell, /normalizeDriveTheme/);
  assert.match(shell, /window\.localStorage\.setItem\(DRIVE_THEME_STORAGE_KEY, nextTheme\)/);
  assert.match(shell, /document\.documentElement\.dataset\.driveTheme = nextTheme/);
  assert.match(shell, /document\.documentElement\.style\.colorScheme = nextTheme/);
});
check("theme switching uses stable callbacks and does not reintroduce reload loop", () => {
  assert.match(shell, /const handleThemeChange = useCallback\(/);
  assert.match(shell, /const handleStorageQuotaChange = useCallback\(/);
  assert.doesNotMatch(shell, /onStorageQuotaChange=\{\(quota\) =>/);
});
check("expanded board exposes explicit light and dark controls", () => {
  assert.match(board, /aria-label="Drive megjelenési mód"/);
  assert.match(board, /Világos mód/);
  assert.match(board, /Sötét mód/);
  assert.match(board, /onThemeChange\("light"\)/);
  assert.match(board, /onThemeChange\("dark"\)/);
});
check("main Drive workspace has dark theme surface overrides", () => {
  for (const token of [".shell", ".projectHeader", ".fileTable th", ".fileTable td", ".detailsPanel", ".boxShelf", ".projectCreatePanel", ".fullTableOverlay"]) {
    assert.ok(css.includes('html[data-drive-theme="dark"]') && css.includes(token), "missing dark selector for " + token);
  }
});
check("interactive states remain distinct in dark mode", () => {
  assert.match(css, /fileSelected td[\s\S]*?background: #16375b/);
  assert.match(css, /favoriteToggleActive[\s\S]*?color: #ffc62f/);
  assert.match(css, /statusAvailable[\s\S]*?color: #72d79e/);
  assert.match(css, /statusQuarantine[\s\S]*?color: #ffd26b/);
  assert.match(css, /rowTrashAction[\s\S]*?color: #ff8b92/);
});
check("premium loader has dedicated dark palette", () => {
  for (const token of [".root", ".loaderCard", ".logoCore", ".progressTrack", ".bootStep", ".driveWordmarkMain strong"]) {
    assert.ok(loaderCss.includes('html[data-drive-theme="dark"]') && loaderCss.includes(token), "missing loader dark selector for " + token);
  }
});
check("key dark palette text/background combinations satisfy AA normal text contrast", () => {
  const pairs = [["#cbd9e5","#0b1724"],["#93a7ba","#101f2e"],["#c8d7e5","#122231"],["#8bc0ff","#153153"],["#72d79e","#123928"],["#ffd26b","#403414"],["#e5eef6","#0f1d2b"],["#94aabd","#0f1d2b"],["#d9e9f7","#07111c"],["#79bbff","#0c1f30"]];
  for (const [fg, bg] of pairs) { const ratio = contrast(fg, bg); assert.ok(ratio >= 4.5, fg + " on " + bg + " contrast " + ratio.toFixed(2)); }
});
check("higher-contrast user preference receives stronger dark boundaries", () => assert.match(css, /@media \(prefers-contrast: more\)/));
check("production access remains denied by policy", () => assert.doesNotMatch(page + shell + board + theme + css + loaderCss, /PROD ALLOW/));

console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive V0.9.9 Persistent Dark Theme + Dark Premium Loader", pass, fail: 0, productionAccess: "DENY" }, null, 2));