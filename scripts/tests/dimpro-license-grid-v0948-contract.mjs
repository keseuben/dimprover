import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  LICENSE_GRID_COLUMNS,LICENSE_GRID_PREFERENCES_KEY,LICENSE_GRID_WIDTH_MIN,
  LICENSE_GRID_WIDTH_MAX,defaultLicenseGridPreferences,parseLicenseGridPreferences,
  updateLicenseGridColumnWidth,toggleLicenseGridColumn,visibleLicenseGridColumns,
} from "../../app/lib/license/licenseGridPreferences.ts";
const baseline=defaultLicenseGridPreferences();
assert.equal(LICENSE_GRID_COLUMNS.length,10);
assert.equal(visibleLicenseGridColumns(baseline).length,10);
assert.ok(LICENSE_GRID_PREFERENCES_KEY.startsWith("dimpro.license-center.grid."));
assert.deepEqual(baseline.hidden,[]);
assert.equal(baseline.density,"normal");
const preset=toggleLicenseGridColumn(baseline,"devices");
assert.deepEqual(preset.hidden,["devices"]);
assert.equal(visibleLicenseGridColumns(preset).length,9);
assert.deepEqual(toggleLicenseGridColumn(preset,"devices").hidden,[]);
assert.deepEqual(toggleLicenseGridColumn(baseline,"code").hidden,[],"code required");
assert.deepEqual(toggleLicenseGridColumn(baseline,"action").hidden,[],"editing action required");
assert.deepEqual(toggleLicenseGridColumn(baseline,"owner").hidden,[],"owner required");
assert.deepEqual(toggleLicenseGridColumn(baseline,"status").hidden,[],"status required");
assert.equal(updateLicenseGridColumnWidth(baseline,"code",20).widths.code,LICENSE_GRID_WIDTH_MIN);
assert.equal(updateLicenseGridColumnWidth(baseline,"owner",10000).widths.owner,LICENSE_GRID_WIDTH_MAX);
assert.equal(updateLicenseGridColumnWidth(baseline,"owner",192.7).widths.owner,193);
assert.equal(updateLicenseGridColumnWidth(baseline,"owner",Number.NaN),baseline,"NaN blocked");
assert.equal(updateLicenseGridColumnWidth(baseline,"owner",Number.POSITIVE_INFINITY),baseline,"infinity blocked");
assert.equal(baseline.widths.owner,210,"original preferences not mutated");
const stored=JSON.stringify({
  density:"compact",hidden:["devices","modules","owner","code","action","devices","unknown",{},8],
  widths:{owner:200,devices:0,code:99999,action:-999,modules:"200",unknown:222},
  credential:"CANNOT_BE_SAVED_AS_LICENSE_RECORD",
});
const parsed=parseLicenseGridPreferences(stored);
assert.equal(parsed.density,"compact");
assert.deepEqual(parsed.hidden,["devices","modules"]);
assert.equal(parsed.widths.owner,200);
assert.equal(parsed.widths.devices,LICENSE_GRID_WIDTH_MIN);
assert.equal(parsed.widths.code,LICENSE_GRID_WIDTH_MAX);
assert.equal(parsed.widths.action,LICENSE_GRID_WIDTH_MIN);
assert.equal(parsed.widths.modules,baseline.widths.modules);
assert.ok(!("credential" in parsed),"extra persisted fields discarded");
assert.deepEqual(parseLicenseGridPreferences("not-json"),baseline);
assert.deepEqual(parseLicenseGridPreferences("null"),baseline);
assert.deepEqual(parseLicenseGridPreferences("[]"),baseline);
assert.deepEqual(parseLicenseGridPreferences("a".repeat(10000)),baseline);
const page=readFileSync("app/admin/licenckozpont/page.tsx","utf8");
assert.ok(page.includes("parseLicenseGridPreferences(window.localStorage.getItem"));
assert.ok(page.includes("window.localStorage.setItem(LICENSE_GRID_PREFERENCES_KEY"));
assert.ok(page.includes("gridPreferencesLoaded"));
assert.ok(page.includes("aria-valuemin={76} aria-valuemax={480}"));
assert.ok(page.includes('role="separator" aria-orientation="vertical"'));
assert.ok(page.includes('event.key==="ArrowRight"?12:-12'));
assert.ok(page.includes('window.addEventListener("pointermove"'));
assert.ok(page.includes('window.removeEventListener("pointermove"'));
assert.ok(page.includes('window.addEventListener("keydown"'));
assert.ok(page.includes('onClick={()=>setGridPreferences(defaultLicenseGridPreferences())}'));
assert.ok(page.includes('shownColumns.map(column'));
assert.ok(page.includes('colSpan={shownColumns.length}'));
assert.ok(page.includes('setGridFullWindow(false);'));
assert.ok(page.includes('licenseEnvironment?.writesAllowed'));
const styles=readFileSync("app/admin/licenckozpont/license-center.css","utf8");
assert.ok(styles.includes(".dimpro-license-center__resize-handle"));
assert.ok(styles.includes("touch-action:none"));
assert.ok(styles.includes(".is-license-compact"));
assert.ok(styles.includes(".dimpro-license-center__grid-full-window"));
assert.ok(styles.includes(".dimpro-license-center__column-picker"));
assert.ok(styles.includes(".dimpro-license-center__environment"));
assert.ok(!styles.includes("\nbody{"),"no global CSS style override");
console.log("DIMPRO V0.9.48 LICENSE GRID PREFS CONTRACT PASS");
