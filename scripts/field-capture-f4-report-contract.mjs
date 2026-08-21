import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const metadata = read("app/lib/field-capture/reportMetadata.ts");
const pdf = read("app/lib/field-capture/fieldCaptureSummaryPdf.ts");
const panel = read("components/field-capture/FieldCaptureReportPanel.tsx");
const shell = read("components/field-capture/FieldCaptureShell.tsx");

const tests = [
  ["five explicit survey nature choices", () => {
    for (const value of [
      "Teljes körű",
      "Részleges",
      "Mintavételes / szemrevételezéses",
      "Kooperáció előkészítő fotódokumentáció",
      "Célzott munkaterületi ellenőrzés",
    ]) assert.match(metadata, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }],
  ["coverage is clamped to 0..100", () => {
    assert.match(metadata, /Math\.max\(0,\s*Math\.min\(100,/);
    assert.match(metadata, /coveragePercent/);
  }],
  ["report metadata persists per session", () => {
    assert.match(metadata, /dimpro\.fieldCapture\.reportMetadata\.v1/);
    assert.match(metadata, /localStorage\.setItem/);
  }],
  ["full-project readiness disclaimer is explicit", () => {
    assert.match(pdf, /megtekintett és rögzített munkaterületekre/);
    assert.match(pdf, /teljes projekt készültségi fokának/);
  }],
  ["A4 pdf-lib report engine is used", () => {
    assert.match(pdf, /210 \* MM_TO_PT/);
    assert.match(pdf, /297 \* MM_TO_PT/);
    assert.match(pdf, /import\("pdf-lib"\)/);
  }],
  ["report summary contains storage and User Drive states", () => {
    assert.match(pdf, /serverStoredCount/);
    assert.match(pdf, /userDriveRequestedCount/);
    assert.match(pdf, /userDriveStoredCount/);
  }],
  ["recorded item list contains notes GPS direction and edit state", () => {
    assert.match(pdf, /Rogzitett tetelek/);
    assert.match(pdf, /item\.note \|\| item\.voiceTranscript/);
    assert.match(pdf, /accuracyMeters/);
    assert.match(pdf, /headingDegrees/);
    assert.match(pdf, /editRevision/);
  }],
  ["photo annex is numbered and includes metadata", () => {
    assert.match(pdf, /Fotomelleklet/);
    assert.match(pdf, /slotsPerPage = 2/);
    assert.match(pdf, /item\.uploadFile/);
    assert.match(pdf, /Sajat DIMPRO Drive/);
  }],
  ["report panel exposes title nature coverage and PDF export", () => {
    assert.match(panel, /data-terep-report-title/);
    assert.match(panel, /data-terep-report-survey-nature/);
    assert.match(panel, /data-terep-report-coverage/);
    assert.match(panel, /data-terep-summary-pdf-export/);
  }],
  ["report panel is integrated only in workflow step 3", () => {
    assert.match(shell, /workflowStep === 3 \? <FieldCaptureReportPanel/);
    assert.match(shell, /FieldCaptureReportPanel/);
  }],
  ["F4 does not activate project Drive or email delivery", () => {
    assert.doesNotMatch(panel, /saveToProjectDrive|Projektkapu Drive/);
    assert.doesNotMatch(pdf, /sendMail|email|smtp/i);
  }],
];

let passed = 0;
for (const [name, run] of tests) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${passed}: ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`FIELD_CAPTURE_F4_REPORT_CONTRACT ${passed}/${tests.length} PASS`);
