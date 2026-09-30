#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("TableSortKey includes name fileName uploadedAt", () => {
  assert.match(grid, /type TableSortKey = "name" \| "fileName" \| "uploadedAt"/);
});
check("shared sort state stores key and direction", () => {
  assert.match(grid, /useState<TableSortState>\(\{ key: "name", direction: "asc" \}\)/);
});
check("name sorting exists", () => assert.match(grid, /sortKey="name"/));
check("filename sorting exists", () => assert.match(grid, /sortKey="fileName"/));
check("Simple Feltöltve sorting exists", () => {
  assert.match(grid, /startColumnResize\("simple", "uploadedAt"/);
  assert.match(grid, /label="Feltöltve" sortKey="uploadedAt"/);
});
check("Review Feltöltve sorting exists", () => {
  assert.match(grid, /startColumnResize\("review", "uploadedAt"/);
});
check("Engineering does not add upload date column", () => {
  const start = grid.indexOf('<table className={styles.fileTable} style={{ zoom: tableZoom / 100, minWidth: tableMinWidth("engineering")');
  const end = grid.indexOf("</table>", start);
  assert.ok(start >= 0 && end > start);
  const section = grid.slice(start, end);
  assert.doesNotMatch(section, /label="Feltöltve"|uploadedAt/);
});
check("Engineering keeps 15 configured columns", () => {
  const block = grid.slice(grid.indexOf("const ENGINEERING_COLUMNS"), grid.indexOf("const REVIEW_COLUMNS"));
  assert.equal((block.match(/\{ id:/g) || []).length, 15);
});
check("text sorting is hu-HU numeric aware", () => {
  assert.match(grid, /localeCompare\(String\(b \|\| ""\), "hu-HU", \{ sensitivity: "base", numeric: true \}\)/);
});
check("uploadedAt sorting uses Date.parse", () => assert.match(grid, /Date\.parse/));
check("name/fileName new key defaults asc", () => {
  assert.match(grid, /key === "uploadedAt" \? "desc" : "asc"/);
});
check("uploadedAt new key defaults desc", () => {
  assert.match(grid, /key === "uploadedAt" \? "desc" : "asc"/);
});
check("active sort renders direction indicator", () => {
  assert.match(grid, /ChevronUp/);
  assert.match(grid, /ChevronDown/);
  assert.match(grid, /sortDirectionActive/);
});
check("sortable header exposes aria-sort", () => assert.match(grid, /aria-sort=\{ariaSort\}/));
check("Simple renders sortedDocuments", () => {
  const simpleStart = grid.indexOf('tableMinWidth("simple")');
  const engStart = grid.indexOf('tableMinWidth("engineering")');
  assert.ok(simpleStart >= 0 && engStart > simpleStart);
  assert.match(grid.slice(simpleStart, engStart), /sortedDocuments\.map/);
});
check("Engineering renders sortedDocuments", () => {
  const engStart = grid.indexOf('tableMinWidth("engineering")');
  assert.ok(engStart >= 0);
  assert.match(grid.slice(engStart), /sortedDocuments\.map/);
});
check("Review renders sortedReviewRows", () => assert.match(grid, /sortedReviewRows\.map/));
check("sorting copies arrays before sort", () => {
  assert.match(grid, /\[\.\.\.documents\]\.sort/);
  assert.match(grid, /\[\.\.\.reviewRows\]\.sort/);
});
check("independent simple engineering review width state exists", () => {
  assert.match(grid, /simple: createColumnWidthMap\(SIMPLE_COLUMNS\)/);
  assert.match(grid, /engineering: createColumnWidthMap\(ENGINEERING_COLUMNS\)/);
  assert.match(grid, /review: createColumnWidthMap\(REVIEW_COLUMNS\)/);
});
check("Simple colgroup uses width state", () => assert.match(grid, /columnWidths\.simple\[column\.id\]/));
check("Engineering colgroup uses width state", () => assert.match(grid, /columnWidths\.engineering\[column\.id\]/));
check("Review colgroup uses width state", () => assert.match(grid, /columnWidths\.review\[column\.id\]/));
check("resize handler prevents default", () => {
  const start = grid.indexOf("const startColumnResize");
  const end = grid.indexOf("const clearPanTimer", start);
  assert.ok(start >= 0 && end > start);
  assert.match(grid.slice(start, end), /event\.preventDefault\(\)/);
});
check("resize handler stops propagation", () => {
  const start = grid.indexOf("const startColumnResize");
  const end = grid.indexOf("const clearPanTimer", start);
  assert.match(grid.slice(start, end), /event\.stopPropagation\(\)/);
});
check("resize handle click is isolated from sort", () => {
  assert.match(grid, /className=\{styles\.columnResizeHandle\}[\s\S]*?event\.stopPropagation\(\)/);
});
check("minimum width clamp exists", () => {
  assert.match(grid, /Math\.max\(config\.minWidth, Math\.round\(startWidth \+ delta\)\)/);
});
check("resize delta accounts for tableZoom", () => {
  assert.match(grid, /Math\.max\(0\.01, tableZoom \/ 100\)/);
  assert.match(grid, /\/ zoomFactor/);
});
check("dynamic table min width exists", () => {
  assert.match(grid, /const tableMinWidth/);
  assert.match(grid, /minWidth: tableMinWidth\("simple"\) \+ "px"/);
  assert.match(grid, /minWidth: tableMinWidth\("engineering"\) \+ "px"/);
  assert.match(grid, /Math\.max\(1742, tableMinWidth\("review"\)\)/);
});
check("selection columns are fixed non-resizable", () => {
  assert.equal((grid.match(/id: "select", defaultWidth: 34, minWidth: 34, resizable: false/g) || []).length, 3);
});
check("Review grouped header colSpans stay unchanged", () => {
  assert.match(grid, /<th colSpan=\{10\}>Dokumentum<\/th>/);
  assert.match(grid, /<th colSpan=\{6\} className=\{styles\.reviewGroupTechnical\}>/);
  assert.match(grid, /<th colSpan=\{3\} className=\{styles\.reviewGroupCustomer\}>/);
});
check("Review inline folder colSpan stays 22", () => assert.match(grid, /<InlineNewFolderRow[\s\S]*?colSpan=\{22\}/));
check("Simple inline folder colSpan stays 11", () => assert.match(grid, /<InlineNewFolderRow[\s\S]*?colSpan=\{11\}/));
check("Engineering inline folder colSpan stays 15", () => assert.match(grid, /<InlineNewFolderRow[\s\S]*?colSpan=\{15\}/));
check("no column reorder implementation exists", () => {
  assert.doesNotMatch(grid, /columnReorder|reorderColumn|draggableColumn|onColumnDrop/);
});
check("no width persistence is introduced", () => {
  assert.doesNotMatch(grid, /localStorage|sessionStorage|columnWidths.*fetch|fetch.*columnWidths/);
});
check("V0.7.6 UI has no Projectkapu implementation dependency", () => {
  assert.doesNotMatch(grid, /from ["'][^"']*project-gate|components\/project-gate/);
  assert.match(css, /\.columnResizeHandle/);
  assert.match(css, /\.sortableHeaderButton/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.6 table sort and resize UX",
  pass,
  fail: 0,
}, null, 2));
