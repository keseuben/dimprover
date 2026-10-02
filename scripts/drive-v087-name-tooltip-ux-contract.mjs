import assert from "node:assert/strict";
import fs from "node:fs";

const grid = fs.readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const details = fs.readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const tooltip = fs.readFileSync("components/drive/OverflowTooltipText.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
const tree = fs.readFileSync("components/drive/FolderTreePanel.tsx", "utf8");
const commander = fs.readFileSync("components/drive/CommanderPanel.tsx", "utf8");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("display name resolution recognizes displayName planTitle and drawingTitle", () => {
  assert.match(grid, /extra\.displayName/);
  assert.match(grid, /extra\.planTitle/);
  assert.match(grid, /extra\.drawingTitle/);
});

check("fallback display name comes from original filename without extension", () => {
  assert.match(grid, /currentVersion\?\.originalName \|\| document\.name/);
  assert.match(grid, /fileNameWithoutExtension/);
});

check("pencil icon is rendered only when explicit name is missing and user can write", () => {
  assert.match(grid, /!displayName\.explicit && canWrite/);
  assert.match(grid, /<Pencil size=\{11\}/);
});

check("pencil tooltip says Egyedi név megadása", () => {
  assert.match(grid, /title="Egyedi név megadása"/);
});

check("pencil click stops row propagation and opens edit callback", () => {
  assert.match(grid, /event\.stopPropagation\(\);[\s\S]*?onEdit\(\)/);
});

check("all three file table views route missing-name edit to planTitle", () => {
  const matches = grid.match(/onEdit=\{\(\) => openDetail\([^\n]+, "planTitle"\)\}/g) || [];
  assert.ok(matches.length >= 3, `expected >=3 planTitle edit routes, got ${matches.length}`);
});

check("details focus supports planTitle", () => {
  assert.match(details, /detailsFocus\?: "planNo" \| "planTitle" \| "scales" \| "numbering"/);
  assert.match(details, /detailsFocus === "planTitle"[\s\S]*?"drive-meta-planTitle"/);
});

check("workspace detail focus routes planTitle into details panel", () => {
  assert.match(workspace, /field: "planNo" \| "planTitle" \| "scales" \| "numbering"/);
  assert.match(workspace, /field === "planTitle"/);
});

check("explicit and fallback display names use the same visual weight", () => {
  assert.match(css, /\.fileDisplayNameExplicit,[\s\S]*?\.fileDisplayNameFallback \{ color: #33465d; font-weight: 600 !important; \}/);
  assert.match(css, /\.reviewNameExplicit,[\s\S]*?\.reviewNameFallback \{ color: #33465d; font-weight: 600; \}/);
});

check("review name header and cells are left aligned", () => {
  assert.match(css, /\.reviewNameHeader \{ text-align: left !important; \}/);
  assert.match(css, /\.reviewNameCell \{ text-align: left !important; \}/);
});

check("overflow tooltip measures actual overflow", () => {
  assert.match(tooltip, /scrollWidth > element\.clientWidth/);
  assert.match(tooltip, /scrollHeight > element\.clientHeight/);
});

check("overflow tooltip only sets title when content is clipped", () => {
  assert.match(tooltip, /if \(overflowed\) element\.setAttribute\("title", text\)/);
  assert.match(tooltip, /else element\.removeAttribute\("title"\)/);
});

check("overflow tooltip is wired into file grid", () => {
  assert.match(grid, /import OverflowTooltipText from "\.\/OverflowTooltipText"/);
  const matches = grid.match(/<OverflowTooltipText/g) || [];
  assert.ok(matches.length >= 10, `expected broad tooltip coverage, got ${matches.length}`);
});

check("overflow tooltip covers folder tree labels", () => {
  assert.match(tree, /import OverflowTooltipText from "\.\/OverflowTooltipText"/);
  assert.match(tree, /text=\{folder\.displayName \|\| folder\.name\}/);
});

check("display name wrapper can actually shrink inside table cells", () => {
  assert.match(css, /\.displayNameValue \{[^}]*flex: 1 1 auto;[^}]*overflow: hidden;/);
});



check("overflow tooltip covers details and file-list headings", () => {
  assert.match(details, /import OverflowTooltipText from "\.\/OverflowTooltipText"/);
  assert.match(details, /className=\{styles\.detailsHeaderTitle\}/);
  assert.match(grid, /className=\{styles\.filePanelTitleMain\}/);
});

check("overflow tooltip covers Commander path folder and file names", () => {
  assert.match(commander, /import OverflowTooltipText from "\.\/OverflowTooltipText"/);
  assert.match(commander, /className=\{styles\.commanderPath\}[\s\S]*?<OverflowTooltipText/);
  assert.match(commander, /commanderFolderNameText/);
  assert.match(commander, /commanderFileNameText/);
});


check("file and folder rows do not carry parent native instruction tooltips", () => {
  assert.doesNotMatch(grid, /title="Kattintás: kijelölés · Dupla kattintás: megnyitás/);
  assert.doesNotMatch(grid, /title: security\.title \+ " · Kattintás:/);
});

check("folder tree parent button does not override label tooltip", () => {
  assert.doesNotMatch(tree, /title=\{\(folder\.displayPath \|\| folder\.path\) \+ " · " \+ security\.title\}/);
  assert.match(tree, /aria-label=\{\(folder\.displayPath \|\| folder\.path\) \+ "\. " \+ security\.title\}/);
});

check("Commander row instruction moved from native title to aria-label", () => {
  assert.doesNotMatch(commander, /title="Kattintás: kijelölés · Dupla kattintás: megnyitás · Húzás: áthelyezés"/);
  assert.match(commander, /aria-label=\{document\.name \+ "\. Kattintás:/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.7 Name + Overflow Tooltip UX",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
