import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pdf = readFileSync("app/lib/field-capture/fieldCaptureSummaryPdf.ts", "utf8");
const panel = readFileSync("components/field-capture/FieldCaptureReportPanel.tsx", "utf8");

const checks = [
  ["summary PDF accepts separate GPS calibration points", () => assert.match(pdf, /gpsCalibrationPoints\?: GpsPhotoMapCalibrationPoint\[\]/)],
  ["summary PDF reuses GPS photo map model", () => assert.match(pdf, /buildGpsPhotoMapModel\(items\)/)],
  ["photo and reference points share one projected extent", () => { assert.match(pdf, /projectWgs84ToLocalMeters/); assert.match(pdf, /calculateGpsPhotoMapBounds/); }],
  ["GPS site plan page is embedded into summary PDF", () => assert.match(pdf, /GPS helyszinrajz es fotopontok/)],
  ["north mark is embedded", () => assert.match(pdf, /drawSurveyNorthMarkPdf/)],
  ["photo points are numbered", () => assert.match(pdf, /page\.drawCircle[\s\S]*String\(point\.sequence\)/)],
  ["camera heading is drawn on site plan", () => assert.match(pdf, /90 - point\.headingDegrees/)],
  ["separate GPS points use distinct reference markers", () => { assert.match(pdf, /mapLabel: `R\$\{index \+ 1\}`/); assert.match(pdf, /lila negyzet/); }],
  ["GPS coordinate appendix is embedded", () => assert.match(pdf, /addPage\("GPS koordinatak"\)/)],
  ["photo coordinates include seven decimal digits", () => assert.match(pdf, /point\.latitude\.toFixed\(7\).*point\.longitude\.toFixed\(7\)/s)],
  ["separate reference point type is printed", () => assert.match(pdf, /calibrationTypeLabel\(point\.type\)/)],
  ["reference sample count and sampling duration are printed", () => { assert.match(pdf, /point\.sampleCount/); assert.match(pdf, /point\.samplingDurationMs/); }],
  ["summary distinguishes GPS photo and reference point metrics", () => { assert.match(pdf, /GPS-fotopont/); assert.match(pdf, /GPS referencia/); }],
  ["report panel loads per-session calibration points", () => assert.match(panel, /loadGpsCalibrationPoints\(session\?\.id\)/)],
  ["downloaded summary receives calibration points", () => assert.match(panel, /gpsCalibrationPoints: currentGpsCalibrationPoints\(\)/)],
  ["email fingerprint includes calibration points", () => assert.match(panel, /gpsCalibrationPoints: currentGpsCalibrationPoints\(\),[\s\S]*items:/)],
  ["emailed PDF uses the same GPS-enhanced summary engine", () => assert.match(panel, /createFieldCaptureSummaryPdf\(\{ items, session, metadata, recorderName, organizationName, includePhotoAnnex: true, gpsCalibrationPoints: currentGpsCalibrationPoints\(\) \}\)/)],
  ["UI describes GPS site plan and separate GPS list", () => assert.match(panel, /GPS-helyszínrajz számozott fotópontokkal[\s\S]*külön GPS referencia-\/kalibrációs pontlista/)],
  ["GPS map disclaimer remains non-geodetic", () => assert.match(pdf, /GPS_PHOTO_MAP_DISCLAIMER/)],
  ["result reports both GPS point counts", () => { assert.match(pdf, /gpsPhotoPointCount/); assert.match(pdf, /gpsReferencePointCount/); }],
];

let passed = 0;
for (const [label, test] of checks) {
  try { test(); passed += 1; console.log(`PASS ${passed}: ${label}`); }
  catch (error) { console.error(`FAIL: ${label}`); throw error; }
}
console.log(`FIELD_CAPTURE_GPS_SUMMARY_PDF_CONTRACT ${passed}/${checks.length} PASS`);
