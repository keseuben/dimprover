import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const shell = read("components/field-capture/FieldCaptureShell.tsx");
const panel = read("components/field-capture/GpsPhotoMapPanel.tsx");
const survey = read("components/viewers/SurveyFloorPlanEngine.tsx");
const north = read("components/viewers/SurveyNorthMark.tsx");
const tests = [
  ["shared north mark used by survey", () => assert.match(survey, /<SurveyNorthMark northAngle=\{northAngle\}/)],
  ["shared north mark used by GPS map", () => assert.match(panel, /<SurveyNorthMark northAngle=\{0\}/)],
  ["official feature name present", () => assert.match(panel, /Terepi GPS fotótérkép/)],
  ["photo order explicitly not route", () => assert.match(panel, /nem a tényleges bejárt útvonalat/)],
  ["sequence uses dashed line", () => assert.match(panel, /strokeDasharray="9 7"/)],
  ["filename rendered", () => assert.match(panel, /point\.displayName/)],
  ["GPS accuracy rendered", () => assert.match(panel, /point\.accuracyMeters/)],
  ["camera heading rendered", () => assert.match(panel, /point\.headingDegrees/)],
  ["disclaimer rendered", () => assert.match(panel, /model\.disclaimer/)],
  ["shell mounts only at save step with GPS", () => assert.match(shell, /workflowStep === 3 && gpsCount > 0 \? <GpsPhotoMapPanel items=\{items\}/)],
  ["north mark keeps DIMPRO identity", () => assert.match(north, />DIMPRO<\/text>/)],
];
let passed=0;
for (const [name, test] of tests) { test(); passed += 1; console.log(`PASS ${passed}: ${name}`); }
console.log(`FIELD_CAPTURE_GPS_PHOTO_MAP_UI_CONTRACT ${passed}/${tests.length} PASS`);
