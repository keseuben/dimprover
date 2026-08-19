import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const gpsPdf = read("app/lib/field-capture/gpsPhotoMapPdf.ts");
const panel = read("components/field-capture/GpsPhotoMapPanel.tsx");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const surveyPdf = read("components/property-survey/propertySurveyBuildingPdf.ts");
const northPdf = read("components/viewers/drawSurveyNorthMarkPdf.ts");
const tests = [
  ["GPS export supports A4 and A3", () => { assert.match(gpsPdf, /"A4" \| "A3"/); assert.match(panel, /data-gps-photo-map-export="A4"/); assert.match(panel, /data-gps-photo-map-export="A3"/); }],
  ["GPS export defaults to landscape", () => assert.match(panel, /orientation: "landscape"/)],
  ["project name flows into PDF", () => { assert.match(shell, /projectName=\{session\?\.projectName\}/); assert.match(gpsPdf, /projectName \|\| "Projekt nincs megadva"/); }],
  ["shared PDF north renderer used by GPS map", () => assert.match(gpsPdf, /drawSurveyNorthMarkPdf/)],
  ["shared PDF north renderer used by Property Survey", () => { assert.match(surveyPdf, /import \{ drawSurveyNorthMarkPdf \}/); assert.doesNotMatch(surveyPdf, /function drawNorthMark/); }],
  ["north renderer keeps DIMPRO identity", () => { assert.match(northPdf, /drawText\("DIMPRO"/); assert.match(northPdf, /drawText\("É"/); }],
  ["PDF contains photo sequence semantics", () => { assert.match(gpsPdf, /sequenceSegments/); assert.match(gpsPdf, /fotok keszitesi sorrendje/); }],
  ["PDF includes camera direction", () => { assert.match(gpsPdf, /headingDegrees/); assert.match(gpsPdf, /kamera/); }],
  ["PDF includes GPS accuracy", () => assert.match(gpsPdf, /accuracyMeters/)],
  ["PDF includes disclaimer", () => assert.match(gpsPdf, /model\.disclaimer/)],
  ["UI exposes export result", () => assert.match(panel, /data-gps-photo-map-export-message/)],
  ["browser download is explicit user action", () => { assert.match(gpsPdf, /anchor\.click\(\)/); assert.match(panel, /onClick=\{\(\) => void exportPdf/); }],
];
let passed=0;
for (const [name, fn] of tests) { try { fn(); passed++; console.log(`PASS ${passed}: ${name}`); } catch(e) { console.error(`FAIL: ${name}`); throw e; } }
console.log(`FIELD_CAPTURE_GPS_PHOTO_MAP_PDF_CONTRACT ${passed}/${tests.length} PASS`);
