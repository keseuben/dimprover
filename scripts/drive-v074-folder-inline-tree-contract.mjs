#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const tree = readFileSync("components/drive/FolderTreePanel.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("normal Drive folder creation no longer uses browser prompt", () => {
  assert.doesNotMatch(workspace, /window\.prompt\("Új mappa neve:"/);
});
check("DriveWorkspace has explicit inline folder editor state", () => {
  assert.match(workspace, /newFolderEditorOpen/);
  assert.match(workspace, /newFolderName/);
  assert.match(workspace, /newFolderSaving/);
});
check("toolbar new-folder action opens inline editor", () => {
  assert.match(workspace, /onCreateFolder=\{openNewFolderEditor\}/);
});
check("folder POST endpoint remains shared Drive folders endpoint", () => {
  assert.match(workspace, /drive\/folders/);
  assert.match(workspace, /method: "POST"/);
});
check("folder payload keeps name and parentId", () => {
  assert.match(workspace, /body: JSON\.stringify\(\{ name, parentId:/);
});
check("Drive root still maps parentId to null", () => {
  assert.match(workspace, /selectedFolderId === "all" \? null : selectedFolderId/);
});
check("successful create reloads Drive", () => {
  const start = workspace.indexOf("async function saveNewFolder");
  const end = workspace.indexOf("async function renameSelectedFolder", start);
  assert.ok(start >= 0 && end > start);
  assert.match(workspace.slice(start, end), /await load\(\)/);
});
check("create failure uses visible Drive error state", () => {
  assert.match(workspace, /setError\(createError instanceof Error/);
});
check("FileGridPanel receives controlled folder editor props", () => {
  for (const token of ["newFolderEditorOpen", "newFolderName", "newFolderSaving", "onNewFolderNameChange", "onSaveNewFolder", "onCancelNewFolder"]) {
    assert.match(grid, new RegExp(token));
  }
});
check("inline folder input autofocuses", () => {
  assert.match(grid, /autoFocus/);
});
check("Enter invokes save", () => {
  assert.match(grid, /event\.key === "Enter"[\s\S]*?onSave\(\)/);
});
check("Escape invokes cancel", () => {
  assert.match(grid, /event\.key === "Escape"[\s\S]*?onCancel\(\)/);
});
check("inline editor does not save on blur", () => {
  assert.doesNotMatch(grid, /onBlur=\{[^}]*onSave/);
});
check("review table contains inline folder row", () => {
  assert.match(grid, /colSpan=\{22\}/);
});
check("simple table contains inline folder row", () => {
  assert.match(grid, /colSpan=\{11\}/);
});
check("engineering table contains inline folder row", () => {
  assert.match(grid, /colSpan=\{15\}/);
});
check("FolderTreePanel hierarchy is based on parentId", () => {
  assert.match(tree, /folder\.parentId/);
  assert.match(tree, /childrenByParent/);
  assert.doesNotMatch(tree, /displayPath \|\| folder\.path\)\.split/);
});
check("FolderTreePanel keeps expanded folders in Set state", () => {
  assert.match(tree, /expandedFolderIds/);
  assert.match(tree, /useState<Set<string>>/);
});
check("branch toggle stops event propagation", () => {
  assert.match(tree, /event\.stopPropagation\(\)/);
  assert.match(tree, /toggleFolder\(folder\.id\)/);
});
check("collapsed branches omit descendants", () => {
  assert.match(tree, /!expandedFolderIds\.has\(folder\.id\)/);
});
check("selected nested folder ancestors auto-expand", () => {
  assert.match(tree, /ancestors/);
  assert.match(tree, /selectedFolderId/);
  assert.match(tree, /next\.add\(id\)/);
});
check("folder label remains displayName or name", () => {
  assert.match(tree, /folder\.displayName \|\| folder\.name/);
});
check("document counts stay wired to folder rows", () => {
  assert.match(tree, /documentCounts\.get\(folder\.id\)/);
});
check("recursive traversal has cycle guards", () => {
  assert.match(tree, /path\.has\(folder\.id\)/);
  assert.match(tree, /visited/);
});
check("V0.7.4 folder UX does not add a Projectkapu implementation dependency", () => {
  assert.doesNotMatch(grid, /components\/project-gate|from ["'][^"']*project-gate/);
  assert.doesNotMatch(tree, /components\/project-gate|from ["'][^"']*project-gate/);
  const folderUxStart = workspace.indexOf("function openNewFolderEditor");
  const folderUxEnd = workspace.indexOf("async function renameSelectedFolder", folderUxStart);
  assert.ok(folderUxStart >= 0 && folderUxEnd > folderUxStart);
  assert.doesNotMatch(workspace.slice(folderUxStart, folderUxEnd), /project-gate|ProjectAccessMenu/);
  assert.match(css, /\.newFolderRow/);
  assert.match(css, /\.folderTreeToggle/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.4 inline folder editor and hierarchical folder tree",
  pass,
  fail: 0,
}, null, 2));
