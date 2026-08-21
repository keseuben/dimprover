import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(path,"utf8");
const engine=read("app/lib/field-capture/gpsPlanCalibration.ts");
const store=read("app/lib/field-capture/gpsPlanCalibrationStore.ts");
const pointStore=read("app/lib/field-capture/gpsPhotoMapCalibrationStore.ts");
const panel=read("components/field-capture/GpsPlanCalibrationPanel.tsx");
const mapPanel=read("components/field-capture/GpsPhotoMapPanel.tsx");
const report=read("app/lib/field-capture/fieldCaptureSummaryPdf.ts");
const reportPanel=read("components/field-capture/FieldCaptureReportPanel.tsx");
const types=read("app/lib/field-capture/types.ts");
const checks=[
 ["F10.1 client version 0.4.7-dev",()=>assert.match(types,/FIELD_CAPTURE_VERSION = "0\.4\.7-dev"/)],
 ["affine plan calibration needs at least three pairs",()=>assert.match(engine,/pairs\.length < 3/)],
 ["fourth point enables residual verification",()=>assert.match(engine,/pairs\.length >= 4/)],
 ["degenerate affine transform fails closed",()=>assert.match(engine,/Math\.abs\(determinant\) < EPSILON/)],
 ["GPS projection uses local metric coordinates",()=>assert.match(engine,/projectWgs84ToLocalMeters/)],
 ["camera heading is transformed through plan matrix",()=>assert.match(engine,/projectGpsHeadingToPlan/)],
 ["distance uses earth radius and GPS coordinates",()=>{assert.match(engine,/EARTH_RADIUS_METERS/);assert.match(engine,/calculateGpsDistanceMeters/)}],
 ["distance label uses exactly two decimals and Hungarian comma",()=>assert.match(engine,/toFixed\(2\)\.replace\("\."\s*,\s*","\)/)],
 ["consecutive photo segments are explicit model objects",()=>assert.match(engine,/buildConsecutiveGpsPlanDistanceSegments/)],
 ["plan PDF is persisted in IndexedDB, not localStorage",()=>{assert.match(store,/indexedDB/);assert.doesNotMatch(store,/localStorage/)}],
 ["plan storage is session namespaced",()=>{assert.match(store,/keyPath: "sessionId"/);assert.match(store,/sessionId/)}],
 ["plan storage does not persist Send token or capability",()=>assert.doesNotMatch(store,/sessionToken|uploadCapability|sendCode|pinCode/)],
 ["reference point store emits change event",()=>assert.match(pointStore,/GPS_CALIBRATION_POINTS_CHANGED_EVENT/)],
 ["UI accepts PDF plan only",()=>assert.match(panel,/accept="application\/pdf,\.pdf"/)],
 ["UI limits local plan file size",()=>assert.match(panel,/40 \* 1024 \* 1024/)],
 ["UI requires same physical R points on plan",()=>assert.match(panel,/ugyanazokat a helyszíni R referencia-pontokat kattintsd meg a terven/)],
 ["UI records normalized plan percentages",()=>{assert.match(panel,/xPercent/);assert.match(panel,/yPercent/)}],
 ["UI renders R reference markers separately",()=>assert.match(panel,/data-gps-plan-anchor/)],
 ["UI renders projected photo markers",()=>assert.match(panel,/data-gps-plan-photo/)],
 ["UI renders dashed distance overlay with label",()=>{assert.match(panel,/data-gps-plan-distance/);assert.match(panel,/strokeDasharray/)}],
 ["UI renders transformed camera direction arrows",()=>assert.match(panel,/headingPlanDegrees/)],
 ["UI reports residual error when 4+ points exist",()=>assert.match(panel,/Átlagos eltérés/)],
 ["GPS photo map contains plan calibration panel",()=>assert.match(mapPanel,/<GpsPlanCalibrationPanel items=\{items\} sessionId=\{sessionId\}/)],
 ["summary PDF accepts plan calibration source",()=>assert.match(report,/gpsPlanCalibration\?:/)],
 ["summary PDF embeds original PDF plan vector page",()=>assert.match(report,/pdf\.embedPdf\(input\.gpsPlanCalibration\.pdfBytes/)],
 ["summary PDF suppresses relative grid when calibrated plan exists",()=>assert.match(report,/if \(!gpsPlanModel\)/)],
 ["summary PDF draws dashed real-distance segments",()=>{assert.match(report,/gpsPlanDistanceSegments/);assert.match(report,/dashArray: \[5, 4\]/)}],
 ["summary PDF draws R references and numbered photo points on same plan",()=>{assert.match(report,/calibrationIndex/);assert.match(report,/gpsPlanPhotoPoints/)}],
 ["summary PDF north mark uses transformed plan north",()=>assert.match(report,/northAngle: gpsPlanModel\.northAngleDegrees/)],
 ["report download loads plan source from IndexedDB",()=>assert.match(reportPanel,/loadGpsPlanCalibrationForReport\(session\.id\)/)],
 ["email fingerprint changes with plan revision",()=>assert.match(reportPanel,/gpsPlanUpdatedAt/)],
 ["emailed PDF uses same calibrated plan source",()=>assert.match(reportPanel,/gpsPlanCalibration \}\)/)],
 ["fallback relative GPS view remains available without plan",()=>assert.match(reportPanel,/relatív GPS-nézet/)],
];
let passed=0;for(const [name,fn] of checks){fn();console.log(`PASS ${++passed}: ${name}`)}
console.log(`FIELD_CAPTURE_F10_PLAN_CALIBRATION_CONTRACT ${passed}/${checks.length} PASS`);
