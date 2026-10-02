import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("Simple view has no file-status row coloring resolver", () => assert.doesNotMatch(panel, /function simpleRowStatusClass\(/));
check("Simple row renderer does not use file-status row classes", () => {
  for (const className of ["rowSimpleAvailable", "rowSimpleQuarantine", "rowSimpleRejected", "rowSimpleProcessing"]) {
    assert.doesNotMatch(panel, new RegExp(`styles\\.${className}`));
  }
});
check("Simple view keeps status color inside the status badge", () => {
  assert.match(panel, /styles\.statusBadge/);
  assert.match(panel, /styles\.statusAvailable/);
  assert.match(panel, /styles\.statusQuarantine/);
});

check("Engineering view has dedicated lifecycle resolver", () => assert.match(panel, /function engineeringRowStatusClass\(metadata: DriveEngineeringMetadata \| undefined\)/));
check("Engineering maps working current approved archive", () => {
  for (const className of ["rowEngineeringWorking", "rowEngineeringCurrent", "rowEngineeringApprovedCurrent", "rowEngineeringArchive"]) {
    assert.match(panel, new RegExp(`styles\\.${className}`));
  }
});
check("Engineering row renderer uses lifecycle resolver", () => assert.match(panel, /engineeringRowStatusClass\(metadata\)/));

check("Review view has dedicated approval resolver", () => assert.match(panel, /function reviewRowStatusClass\(metadata: DriveEngineeringMetadata \| undefined\)/));
check("Review archive overrides approval state", () => {
  const fn = panel.slice(panel.indexOf("function reviewRowStatusClass"), panel.indexOf("function approvalFocus"));
  assert.ok(fn.indexOf("rowReviewArchive") >= 0 && fn.indexOf("rowReviewArchive") < fn.indexOf("const approval = approvalVisual"));
});
check("Review maps returned in-progress approved pending", () => {
  for (const className of ["rowReviewReturned", "rowReviewInProgress", "rowReviewApproved", "rowReviewPending"]) {
    assert.match(panel, new RegExp(`styles\\.${className}`));
  }
});
check("Review row renderer uses approval resolver", () => assert.match(panel, /reviewRowStatusClass\(metadataByDocument\[row\.document\.id\]\)/));

check("Simple legend is file-status specific", () => assert.match(panel, /aria-label="Fájlállapot jelmagyarázat"/));
check("Engineering legend is lifecycle specific", () => assert.match(panel, /aria-label="Műszaki tervállapot jelmagyarázat"/));
check("Review legend explains row color semantics", () => assert.match(panel, /Sor: szürke várakozó · kék ellenőrzés alatt · narancs visszaadva · zöld jóváhagyott · szürke archív/));

check("Simple CSS no longer defines file-status row background classes", () => {
  for (const className of ["rowSimpleAvailable", "rowSimpleQuarantine", "rowSimpleRejected", "rowSimpleProcessing"]) assert.doesNotMatch(css, new RegExp(`\\.${className} td`));
});
check("Engineering CSS defines four lifecycle row classes", () => {
  for (const className of ["rowEngineeringWorking", "rowEngineeringCurrent", "rowEngineeringApprovedCurrent", "rowEngineeringArchive"]) assert.match(css, new RegExp(`\\.${className} td`));
});
check("Review CSS defines five approval row classes", () => {
  for (const className of ["rowReviewPending", "rowReviewInProgress", "rowReviewReturned", "rowReviewApproved", "rowReviewArchive"]) assert.match(css, new RegExp(`\\.${className} td`));
});
check("Selected row remains visually authoritative", () => {
  assert.match(css, /\.reviewRowSelected td \{ background: #[0-9a-f]+ !important; \}/i);
  assert.match(css, /\.fileSelected td \{ background: #[0-9a-f]+ !important; \}/i);
});
check("Status coloring stays client-side only", () => {
  assert.doesNotMatch(panel + css, /fetch\(|\/api\//);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.4 view-dependent status coloring",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
