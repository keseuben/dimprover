import assert from "node:assert/strict";
import {
  buildConsecutiveGpsPlanDistanceSegments,
  buildGpsPlanCalibrationModel,
  buildGpsPlanPhotoPoints,
  formatPlanDistanceMeters,
  projectGpsCoordinateToPlan,
  projectGpsHeadingToPlan,
  type GpsPlanAnchor,
} from "../app/lib/field-capture/gpsPlanCalibration";
import type { GpsPhotoMapCalibrationPoint } from "../app/lib/field-capture/gpsPhotoMap";
import type { FieldCaptureItem, PreCaptureOptions } from "../app/lib/field-capture/types";

const R = 6_378_137;
const referenceLatitude = 47.5;
const referenceLongitude = 21.6;
function gps(eastMeters: number, northMeters: number) {
  return {
    latitude: referenceLatitude + northMeters / R * 180 / Math.PI,
    longitude: referenceLongitude + eastMeters / (R * Math.cos(referenceLatitude * Math.PI / 180)) * 180 / Math.PI,
  };
}
function plan(east: number, north: number) {
  return { xPercent: 20 + 2.2 * east + 0.35 * north, yPercent: 70 + 0.25 * east - 1.8 * north };
}
const locals = [[0, 0], [10, 0], [0, 10], [8, 7], [4, 4]] as const;
const calibrationPoints: GpsPhotoMapCalibrationPoint[] = locals.slice(0, 4).map(([east, north], index) => ({
  id: `r${index + 1}`,
  label: `R${index + 1}`,
  type: index === 1 ? "SETTING_OUT" : "CORNER",
  ...gps(east, north),
  accuracyMeters: 3 + index,
  capturedAt: `2026-08-21T19:0${index}:00.000Z`,
  sampleCount: 8,
  samplingDurationMs: 8000,
  note: "",
}));
const anchors: GpsPlanAnchor[] = calibrationPoints.map((point, index) => ({
  id: `a${index + 1}`,
  calibrationPointId: point.id,
  pageNumber: 1,
  ...plan(locals[index][0], locals[index][1]),
  createdAt: "2026-08-21T19:10:00.000Z",
}));

const model = buildGpsPlanCalibrationModel({ calibrationPoints, anchors, pageNumber: 1 });
assert.ok(model, "4 pontos affine illesztésnek létre kell jönnie");
assert.equal(model.anchorCount, 4);
assert.equal(model.verificationAvailable, true);
assert.equal(model.quality, "GOOD");
assert.ok((model.averageResidualMeters ?? 999) < 0.01);
console.log("PASS 1: 4 pontos affine illesztés és maradékhiba");

const targetLocal = locals[4];
const expected = plan(targetLocal[0], targetLocal[1]);
const projected = projectGpsCoordinateToPlan(model, gps(targetLocal[0], targetLocal[1]));
assert.ok(Math.abs(projected.xPercent - expected.xPercent) < 0.001);
assert.ok(Math.abs(projected.yPercent - expected.yPercent) < 0.001);
assert.equal(projected.insidePlan, true);
console.log("PASS 2: GPS pont tervlapra vetítése");

const threePointModel = buildGpsPlanCalibrationModel({ calibrationPoints: calibrationPoints.slice(0, 3), anchors: anchors.slice(0, 3) });
assert.ok(threePointModel);
assert.equal(threePointModel.verificationAvailable, false);
assert.equal(threePointModel.quality, "UNVERIFIED");
console.log("PASS 3: 3 ponttal illesztés van, ellenőrzési tartalék nincs");

assert.equal(buildGpsPlanCalibrationModel({ calibrationPoints: calibrationPoints.slice(0, 2), anchors: anchors.slice(0, 2) }), null);
console.log("PASS 4: 3 pont alatt fail-closed");

assert.equal(formatPlanDistanceMeters(1.924), "1,92 m");
assert.equal(formatPlanDistanceMeters(1.926), "1,93 m");
console.log("PASS 5: magyar két tizedesjegyes méterformátum");

const baseOptions: PreCaptureOptions = { gpsEnabled: true, orientationEnabled: true, voiceNoteEnabled: false, transcriptMode: "cleaned", saveToDevice: false, saveToUserDrive: false, saveToProjectDrive: false, rememberForSession: false };
function photo(sequence: number, east: number, north: number, heading: number): FieldCaptureItem {
  const file = new File([new Uint8Array([1, 2, 3])], `p${sequence}.jpg`, { type: "image/jpeg" });
  const coordinate = gps(east, north);
  return {
    id: `p${sequence}`, sessionId: "session", sequence, capturedAt: "2026-08-21T19:20:00.000Z", originalName: file.name, displayName: file.name,
    originalSize: file.size, uploadSize: file.size, optimized: false, optimizationNote: "", width: 10, height: 10, previewUrl: null, uploadFile: file, originalFile: file,
    note: "", voiceTranscript: "", status: "QUEUED", progress: 0, error: null, edited: false, editRevision: 0, options: baseOptions,
    locationStatus: "READY", orientationStatus: "READY",
    location: { enabled: true, ...coordinate, accuracyMeters: 4, capturedAt: "2026-08-21T19:20:00.000Z", source: "browser-geolocation", status: "READY", detail: "" },
    orientation: { enabled: true, headingDegrees: heading, headingAccuracyDegrees: 5, directionLabel: "É", capturedAt: "2026-08-21T19:20:00.000Z", source: "device-orientation", status: "READY", detail: "" },
  };
}
const photos = buildGpsPlanPhotoPoints([photo(1, 1, 1, 0), photo(2, 2.92, 1, 90)], model);
assert.equal(photos.length, 2);
assert.ok(photos.every((point) => point.insidePlan));
assert.ok(projectGpsHeadingToPlan(model, 0) !== null);
assert.ok(projectGpsHeadingToPlan(model, 90) !== null);
console.log("PASS 6: fotópont és kamerairány tervi vetítése");

const segments = buildConsecutiveGpsPlanDistanceSegments(photos);
assert.equal(segments.length, 1);
assert.match(segments[0].displayLabel, /^1,92 m$/);
assert.ok(Math.abs(segments[0].distanceMeters - 1.92) < 0.02);
console.log("PASS 7: egymást követő fotók szaggatott mérőszakasz-adatmodellje 1,92 m");

const degenerateAnchors = anchors.slice(0, 3).map((anchor, index) => ({ ...anchor, xPercent: 10 + index * 10, yPercent: 20 + index * 10 }));
assert.equal(buildGpsPlanCalibrationModel({ calibrationPoints: calibrationPoints.slice(0, 3), anchors: degenerateAnchors }), null);
console.log("PASS 8: degenerált tervillesztés fail-closed");

console.log("FIELD_CAPTURE_GPS_PLAN_CALIBRATION_CONTRACT 8/8 PASS");
