import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const sampler = read("app/lib/field-capture/gpsPhotoMapCalibration.ts");
const store = read("app/lib/field-capture/gpsPhotoMapCalibrationStore.ts");
const panel = read("components/field-capture/GpsCalibrationPanel.tsx");
const mapPanel = read("components/field-capture/GpsPhotoMapPanel.tsx");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const tests = [
  ["calibration uses geolocation watchPosition", () => assert.match(sampler, /geolocation\.watchPosition/)],
  ["calibration explicitly clears geolocation watch", () => assert.match(sampler, /geolocation\.clearWatch/)],
  ["sampling is clamped to 5-10 seconds", () => { assert.match(sampler, /Math\.min\(10_000/); assert.match(sampler, /Math\.max\(5_000/); }],
  ["default field sampling is 8 seconds", () => assert.match(panel, /durationMs: 8_000/)],
  ["three point types are exposed", () => { assert.match(panel, /Sarokpont/); assert.match(panel, /Kitűzési pont/); assert.match(panel, /Egyedi referencia/); }],
  ["capture action has exact product wording", () => assert.match(panel, /GPS koordináta rögzítése/)],
  ["minimum three point readiness is visible", () => { assert.match(panel, /Minimum 3 pont szükséges/); assert.match(sampler, /count >= 3/); }],
  ["progress exposes sample count and accuracy", () => { assert.match(panel, /sampleCount/); assert.match(panel, /latestAccuracyMeters/); }],
  ["session namespaced storage is used", () => { assert.match(store, /gpsCalibration\.v1\./); assert.match(store, /PREFIX \+ sessionId/); }],
  ["session id flows from shell to calibration panel", () => { assert.match(shell, /sessionId=\{session\?\.id\}/); assert.match(mapPanel, /<GpsCalibrationPanel sessionId=\{sessionId\}/); }],
  ["calibration point keeps note and timestamp presentation", () => { assert.match(panel, /point\.note/); assert.match(panel, /point\.capturedAt/); }],
  ["calibration UI hands reference points to the plan calibration workflow", () => assert.match(panel, /Tervlap-kalibráció panelben ugyanazon fizikai pont tervlapi helyéhez kell párosítani/)],
];
let passed = 0;
for (const [name, fn] of tests) { fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); }
console.log(`FIELD_CAPTURE_GPS_CALIBRATION_UI_CONTRACT ${passed}/${tests.length} PASS`);
