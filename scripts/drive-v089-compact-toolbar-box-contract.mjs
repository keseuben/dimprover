import assert from "node:assert/strict";
import fs from "node:fs";

const toolbar = fs.readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const drop = fs.readFileSync("components/drive/DropActionButton.tsx", "utf8");
const grid = fs.readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const box = fs.readFileSync("components/drive/BoxShelf.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log("PASS " + String(pass).padStart(2, "0") + " " + label);
};

check("toolbar has a leading action dropdown before New Folder", () => {
  assert.ok(toolbar.indexOf("toolbarActionMenuWrap") < toolbar.indexOf('aria-label="Új mappa"'));
  assert.match(toolbar, /aria-haspopup="menu"/);
  assert.match(toolbar, /aria-label="Drive műveletek"/);
});

check("action dropdown renders icon plus text entries", () => {
  assert.match(toolbar, /<FolderPlus size=\{15\} \/><span>Új mappa<\/span>/);
  assert.match(toolbar, /<UploadCloud size=\{15\} \/><span>Feltöltés<\/span>/);
  assert.match(toolbar, /<ExternalLink size=\{15\} \/><span>Megnyitás<\/span>/);
  assert.match(toolbar, /<Download size=\{15\} \/><span>Letöltés<\/span>/);
  assert.match(toolbar, /<FolderDown size=\{15\} \/><span>Mappa ZIP<\/span>/);
});

check("primary toolbar New Folder is icon-only with tooltip and aria label", () => {
  assert.match(toolbar, /toolPrimary[^\n]*toolIconOnly/);
  assert.match(toolbar, /title=\{canWrite \? "Új mappa"/);
  assert.match(toolbar, /aria-label="Új mappa"/);
  assert.doesNotMatch(toolbar, /<FolderPlus size=\{16\} \/>\s*<span>Új mappa<\/span>/);
});

check("primary toolbar upload version revision open download and ZIP are icon-only", () => {
  for (const label of ["Feltöltés", "Új verzió", "Új revízió", "Megnyitás", "Letöltés", "Mappa ZIP"]) {
    assert.ok(toolbar.includes('aria-label="' + label + '"'), label);
  }
});

check("CsomagBOX toolbar button is icon-only and keeps count badge", () => {
  assert.match(toolbar, /aria-label="CsomagBOX"/);
  assert.match(toolbar, /toolCountBadge/);
  assert.doesNotMatch(toolbar, /<span>CsomagBOX<\/span>/);
});

check("DROP supports icon-only toolbar mode with tooltip", () => {
  assert.match(toolbar, /<DropActionButton iconOnly \/>/);
  assert.match(drop, /title="DROP küldés"/);
  assert.match(drop, /!iconOnly && <span>DROP küldés<\/span>/);
});

check("All Files control is a square icon-only button", () => {
  assert.match(grid, /aria-label="Összes fájl"/);
  assert.match(grid, /<Files size=\{14\} \/>/);
  assert.doesNotMatch(grid, /<span>Összes fájl<\/span>/);
  assert.match(css, /\.fileFolderAllFilesButton \{[\s\S]*?width: 30px;[\s\S]*?height: 30px;/);
});

check("All Files and parent-folder controls have explicit separator", () => {
  assert.match(grid, /fileFolderActionSeparator/);
  assert.match(css, /\.fileFolderActionSeparator \{ width: 1px; height: 20px;/);
  assert.match(css, /grid-template-columns: auto minmax\(220px, 420px\) 30px 1px 30px minmax\(0,1fr\)/);
});

check("compact folder-navigation override preserves separate icon slots", () => {
  assert.match(css, /grid-template-columns: auto minmax\(210px, 390px\) 27px 1px 27px minmax\(0,1fr\)/);
});

check("CsomagBOX shelf is reduced from old 190px height", () => {
  assert.match(css, /\.boxShelf \{[\s\S]*?height: 154px;[\s\S]*?max-height: 34vh;/);
});

check("CsomagBOX cards are compact", () => {
  assert.match(css, /\.boxCard \{[^}]*min-height: 82px;/);
  assert.match(css, /\.boxCard \{[^}]*padding: 6px 7px;/);
});

check("CsomagBOX uses exactly six fixed action slots", () => {
  assert.match(css, /\.boxCardActions \{[\s\S]*?grid-template-columns: repeat\(6, 26px\)/);
  const actionIcons = box.match(/className=\{styles\.boxCardActionIcon\}/g) || [];
  assert.equal(actionIcons.length, 5);
  assert.match(box, /boxLifecycleActionWrap/);
});

check("six CsomagBOX controls are open history status folder ZIP compare", () => {
  assert.match(box, /CsomagBOX megnyitása/);
  assert.match(box, /title="Előzmények"/);
  assert.match(box, /title=\{"Állapot: " \+ lifecycleConfig/);
  assert.match(box, /title="Új mappa a CsomagBOX-ban"/);
  assert.match(box, /title="CsomagBOX letöltése ZIP fájlként"/);
  assert.match(box, /title="Összevetés"/);
});

check("CsomagBOX lifecycle uses compact native select behind icon", () => {
  assert.match(box, /boxLifecycleCompactSelect/);
  assert.match(css, /\.boxLifecycleCompactSelect \{[\s\S]*?opacity: 0;/);
  assert.doesNotMatch(box, /className=\{styles\.boxLifecycleSelect\}/);
});

check("selected-document add action moved outside six-icon strip", () => {
  assert.match(box, /boxCardStatsActions/);
  assert.match(box, /boxCardMiniAction/);
  assert.match(box, /title="Kijelölt fájl hozzáadása"/);
});


check("CsomagBOX lifecycle filters sit before cards in one shelf content row", () => {
  assert.match(box, /boxShelfContent[\s\S]*?boxLifecycleFilters[\s\S]*?boxCards/);
  assert.match(css, /\.boxShelfContent {[\s\S]*?display: flex;[\s\S]*?gap: 8px;/);
});

check("shelf lifecycle filters are a compact left column", () => {
  assert.match(css, /\.boxLifecycleFilters {[\s\S]*?flex: 0 0 88px;[\s\S]*?width: 88px;[\s\S]*?grid-template-columns: 1fr;/);
  assert.match(css, /\.boxLifecycleFilters button {[\s\S]*?min-height: 19px;/);
});

check("CsomagBOX cards use all remaining shelf width", () => {
  assert.match(css, /\.boxCards {[^}]*min-width: 0;[^}]*flex: 1 1 auto;/);
  assert.match(css, /\.boxCards {[^}]*margin-top: 0;/);
});

check("panel variant keeps lifecycle filters horizontal", () => {
  assert.match(css, /\.boxShelfPanel \.boxShelfContent {[\s\S]*?flex-direction: column;/);
  assert.match(css, /\.boxShelfPanel \.boxLifecycleFilters {[\s\S]*?flex-direction: row;/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.9 Compact Toolbar + CsomagBOX",
  pass,
  fail: 0,
  productionAccess: "DENY"
}, null, 2));
