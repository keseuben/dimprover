import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const grid = fs.readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("workspace has explicit folder-scoped all-files mode", () => {
  assert.match(workspace, /const \[allFilesInFolderMode, setAllFilesInFolderMode\] = useState\(false\)/);
});

check("Document repository root is no longer global all-files scope", () => {
  assert.match(workspace, /selectedFolderId === "all"[\s\S]*?\? !document\.folderId/);
  assert.doesNotMatch(workspace, /selectedFolderId === "all" \|\| document\.folderId === selectedFolderId/);
});

check("selected folder scope recursively includes descendants", () => {
  assert.match(workspace, /const selectedFolderScopeIds = useMemo/);
  assert.match(workspace, /ids\.add\(selectedFolderId\)/);
  assert.match(workspace, /folder\.parentId && ids\.has\(folder\.parentId\)/);
});

check("all-files mode filters documents to selected folder scope ids", () => {
  assert.match(workspace, /allFilesInFolderMode[\s\S]*?selectedFolderScopeIds\.has\(document\.folderId\)/);
});

check("normal concrete-folder mode remains direct-only", () => {
  assert.match(workspace, /: document\.folderId === selectedFolderId/);
});

check("root selection forces all-files mode off", () => {
  assert.match(workspace, /selectedFolderId === "all" && allFilesInFolderMode[\s\S]*?setAllFilesInFolderMode\(false\)/);
});

check("folder navigation resets all-files mode", () => {
  assert.match(workspace, /function selectFolder[\s\S]*?setAllFilesInFolderMode\(false\)[\s\S]*?setSelectedFolderId\(folderId\)/);
});

check("all-files mode cannot be enabled at root and clears document selection", () => {
  assert.match(workspace, /function setFolderFileScope\(allFiles: boolean\)/);
  const start = workspace.indexOf("function setFolderFileScope(allFiles: boolean)");
  const end = workspace.indexOf("const effectiveFolderClassification", start);
  const block = workspace.slice(start, end);
  assert.ok(block.includes('selectedFolderId === "all"'));
  assert.ok(block.includes("setAllFilesInFolderMode(false)"));
  assert.ok(block.includes('setSelectedDocumentId("")'));
  assert.ok(block.includes("setSelectedDocumentIds([])"));
  assert.ok(block.includes("setAllFilesInFolderMode(allFiles)"));
});

check("entering all-files mode closes pending inline folder editor", () => {
  assert.match(workspace, /if \(allFiles\) \{[\s\S]*?setNewFolderEditorOpen\(false\)[\s\S]*?setNewFolderName\("Új mappa"\)/);
});

check("both FileGrid instances receive the same scoped all-files state", () => {
  const modeProps = workspace.match(/allFilesMode=\{allFilesInFolderMode\}/g) || [];
  const changeProps = workspace.match(/onAllFilesModeChange=\{setFolderFileScope\}/g) || [];
  assert.equal(modeProps.length, 2);
  assert.equal(changeProps.length, 2);
});

check("root selector is plain Dokumentumtár without global all-files label", () => {
  assert.match(grid, /<option value="all">Dokumentumtár<\/option>/);
  assert.doesNotMatch(grid, /Dokumentumtár \/ összes fájl/);
});

check("all-files control is separate and unavailable at root", () => {
  assert.match(grid, /fileFolderAllFilesButton/);
  assert.match(grid, /disabled=\{!currentFolder \|\| !onAllFilesModeChange\}/);
  assert.match(grid, /<span>Összes fájl<\/span>/);
});

check("all-files mode hides child folder rows", () => {
  assert.match(grid, /const childFolders = useMemo\(\(\) => \{[\s\S]*?if \(allFilesMode\) return \[\]/);
});

check("all-files mode hides parent navigation and inline new-folder rows in all three table views", () => {
  const parentGuards = grid.match(/!allFilesMode && currentFolder && onNavigateParent/g) || [];
  const newFolderGuards = grid.match(/!allFilesMode && <InlineNewFolderRow/g) || [];
  assert.equal(parentGuards.length, 3);
  assert.equal(newFolderGuards.length, 3);
});

check("folder path explicitly labels recursive all-files state", () => {
  assert.match(grid, /allFilesMode \? " \/ összes fájl" : ""/);
});

check("workspace title and subtitle identify recursive scope", () => {
  assert.match(workspace, /titleBase \+ " · Összes fájl"/);
  assert.match(workspace, /allFilesInFolderMode \? " · almappákkal együtt" : ""/);
});

check("folder count is zero in all-files mode", () => {
  assert.match(workspace, /if \(!tree \|\| allFilesInFolderMode\) return 0/);
});

check("all-files button has active and disabled visual states", () => {
  assert.match(css, /\.fileFolderAllFilesButtonActive/);
  assert.match(css, /\.fileFolderAllFilesButton:disabled/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.8 Scoped All Files",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
