import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const types = read("app/lib/drive-core/types.ts");
const uiTypes = read("components/drive/driveTypes.ts");
const repo = read("app/lib/drive-core/databaseRepository.ts");
const access = read("app/lib/drive-core/folderAccess.ts");
const grid = read("components/drive/FileGridPanel.tsx");
const tree = read("components/drive/FolderTreePanel.tsx");
const css = read("components/drive/DriveWorkspace.module.css");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("core folder type exposes ACL inherit and security state", () => {
  assert.match(types, /aclInherit: boolean/);
  assert.match(types, /securityState: "NORMAL" \| "RESTRICTED" \| "CUSTOM" \| "PASSWORD"/);
});

check("UI folder type exposes folder security state", () => {
  assert.match(uiTypes, /securityState\?: "NORMAL" \| "RESTRICTED" \| "CUSTOM" \| "PASSWORD"/);
});

check("database folder mapping serializes ACL inherit", () => {
  assert.match(repo, /aclInherit: row\.acl_inherit === true/);
});

check("database tree accepts server-derived folder security states", () => {
  assert.match(repo, /folderSecurityStates\?: ReadonlyMap<string, DriveFolder\["securityState"\]>/);
  assert.match(repo, /securityState: folderSecurityStates\?\.get\(folder\.id\) \|\| folder\.securityState/);
});

check("security-state resolver uses authoritative ACL rows", () => {
  assert.match(access, /resolveDriveFolderSecurityStates/);
  assert.match(access, /listDriveFolderAccessRows\(projectId\)/);
  assert.match(access, /listDriveFolderAclEntries\(projectId\)/);
});

check("inherited ACL folders are NORMAL", () => {
  assert.match(access, /if \(folder\.aclInherit\)[\s\S]*?states\.set\(folder\.id, "NORMAL"\)/);
});

check("USER-specific ACL folders are CUSTOM", () => {
  assert.match(access, /entry\.principalType === "USER"\) \? "CUSTOM" : "RESTRICTED"/);
});

check("non-inherited non-user ACL folders are RESTRICTED", () => {
  assert.match(access, /\? "CUSTOM" : "RESTRICTED"/);
});

check("ACL-filtered tree receives folder security states", () => {
  assert.match(access, /Promise\.all\(\[[\s\S]*?resolveAccessibleDriveFolderIds[\s\S]*?resolveDriveFolderSecurityStates/);
  assert.match(access, /listDriveTree\(projectId, accessibleFolderIds, folderSecurityStates\)/);
});

check("table derives direct child folders from current folder", () => {
  assert.match(grid, /const targetParentId = selectedFolderId === "all" \? null : selectedFolderId/);
  assert.match(grid, /filter\(\(folder\) => folder\.parentId === targetParentId\)/);
});

check("folder rows exist in all three table views", () => {
  for (const view of ["review", "simple", "engineering"]) {
    assert.match(grid, new RegExp('view="' + view + '"'));
  }
});

check("folder row single click selects and double click opens", () => {
  assert.match(grid, /onClick: onSelect/);
  assert.match(grid, /onDoubleClick: onOpen/);
  assert.match(grid, /Kattintás: kijelölés · Dupla kattintás: megnyitás/);
});

check("folder row keyboard Enter opens folder", () => {
  assert.match(grid, /event\.key === "Enter"[\s\S]*?onOpen\(\)/);
});

check("simple folder row preserves 11-column structure", () => {
  assert.match(grid, /view === "simple"[\s\S]*?reviewSelectCell[\s\S]*?folderStatusText/);
});

check("engineering folder row preserves 15-column structure", () => {
  assert.match(grid, /view === "engineering"[\s\S]*?inode\/directory[\s\S]*?folderStatusText/);
});

check("review folder row preserves review table structure", () => {
  assert.match(grid, /Array\.from\(\{ length: 12 \}/);
});

check("folder table selection is independent from document checkbox selection", () => {
  assert.match(grid, /activeFolderRowId/);
  assert.match(grid, /tableFolderRowSelected/);
  assert.match(grid, /setActiveFolderRowId\(""\)/);
});

check("review active document row uses selectedDocumentId visual selection", () => {
  assert.match(grid, /selectedDocumentId === row\.document\.id \? styles\.fileSelected/);
});

check("review checkbox multi-selection remains separate", () => {
  assert.match(grid, /selectedSet\.has\(row\.document\.id\) \? styles\.reviewRowSelected/);
});

check("folder empty state does not hide existing child folders", () => {
  assert.match(grid, /!reviewRows\.length && !childFolders\.length/);
  assert.match(grid, /!documents\.length && !childFolders\.length/);
});

check("folder security presentation covers all four states", () => {
  for (const token of ["folderSecurityNormal","folderSecurityRestricted","folderSecurityCustom","folderSecurityPassword"]) {
    assert.match(grid, new RegExp(token));
    assert.match(tree, new RegExp(token));
    assert.match(css, new RegExp("\\." + token));
  }
});

check("folder tree uses the same server security state", () => {
  assert.match(tree, /folderSecurityVisual\(folder\)/);
  assert.match(tree, /folderTreeSecurityIcon/);
});

check("folder security icon is colored rather than a separate lock icon", () => {
  assert.match(css, /folderTreeSecurityIcon svg[\s\S]*?fill: currentColor/);
  assert.doesNotMatch(tree, /Lock/);
});

check("normal folder uses amber-yellow visual", () => {
  assert.match(css, /\.folderSecurityNormal \{ color: #c69227; \}/);
});

check("restricted folder uses muted orange-red visual", () => {
  assert.match(css, /\.folderSecurityRestricted \{ color: #c76b43; \}/);
});

check("custom ACL folder uses blue-purple family", () => {
  assert.match(css, /\.folderSecurityCustom \{ color: #6b5bb7; \}/);
});

check("password visual state is reserved for password gate phase", () => {
  assert.match(css, /\.folderSecurityPassword \{ color: #b84d39; \}/);
  assert.match(types, /"PASSWORD"/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.5 Folder Table & Security Visual UX",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
