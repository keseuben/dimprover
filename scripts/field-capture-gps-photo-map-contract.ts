import assert from "node:assert/strict";
import {
  GPS_PHOTO_MAP_DISCLAIMER,
  buildGpsPhotoMapModel,
  calculateGpsPhotoMapBounds,
  fitGpsPhotoMapToViewport,
  isGpsPhotoMapLocationUsable,
  normalizeGpsPhotoHeading,
  projectWgs84ToLocalMeters,
  type GpsPhotoMapSourceItem,
} from "../app/lib/field-capture/gpsPhotoMap";

function item(overrides: Partial<GpsPhotoMapSourceItem> = {}): GpsPhotoMapSourceItem {
  return {
    id: "p1",
    sequence: 1,
    displayName: "IMG_0001.jpg",
    capturedAt: "2026-08-19T00:00:00.000Z",
    location: { latitude: 47.5, longitude: 21.0, accuracyMeters: 4, status: "READY" },
    orientation: { headingDegrees: 90, headingAccuracyDegrees: 5, directionLabel: "K", status: "READY" },
    ...overrides,
  };
}

const tests: Array<[string, () => void]> = [
  ["READY location usable", () => assert.equal(isGpsPhotoMapLocationUsable(item()), true)],
  ["LOW_ACCURACY remains visible", () => assert.equal(isGpsPhotoMapLocationUsable(item({ location: { latitude: 47.5, longitude: 21, accuracyMeters: 80, status: "LOW_ACCURACY" } })), true)],
  ["unavailable location excluded", () => assert.equal(isGpsPhotoMapLocationUsable(item({ location: { latitude: null, longitude: null, accuracyMeters: null, status: "UNAVAILABLE" } })), false)],
  ["invalid latitude excluded", () => assert.equal(isGpsPhotoMapLocationUsable(item({ location: { latitude: 95, longitude: 21, accuracyMeters: 4, status: "READY" } })), false)],
  ["heading wraps positive", () => assert.equal(normalizeGpsPhotoHeading(450), 90)],
  ["heading wraps negative", () => assert.equal(normalizeGpsPhotoHeading(-45), 315)],
  ["null heading preserved", () => assert.equal(normalizeGpsPhotoHeading(null), null)],
  ["reference projects to origin", () => assert.deepEqual(projectWgs84ToLocalMeters({ latitude: 47.5, longitude: 21, referenceLatitude: 47.5, referenceLongitude: 21 }), { eastMeters: 0, northMeters: 0 })],
  ["northward latitude increases local north", () => assert.ok(projectWgs84ToLocalMeters({ latitude: 47.5001, longitude: 21, referenceLatitude: 47.5, referenceLongitude: 21 }).northMeters > 10)],
  ["eastward longitude increases local east", () => assert.ok(projectWgs84ToLocalMeters({ latitude: 47.5, longitude: 21.0001, referenceLatitude: 47.5, referenceLongitude: 21 }).eastMeters > 7)],
  ["bounds calculate dimensions", () => assert.deepEqual(calculateGpsPhotoMapBounds([{ eastMeters: -2, northMeters: 3 }, { eastMeters: 8, northMeters: 13 }]), { minEastMeters: -2, maxEastMeters: 8, minNorthMeters: 3, maxNorthMeters: 13, widthMeters: 10, heightMeters: 10 })],
  ["model sorts by photo sequence and links only consecutive photos", () => { const model = buildGpsPhotoMapModel([item({ id: "b", sequence: 2 }), item({ id: "a", sequence: 1 })]); assert.ok(model); assert.deepEqual(model.points.map((p) => p.id), ["a", "b"]); assert.deepEqual(model.sequenceSegments, [{ fromId: "a", toId: "b" }]); }],
  ["model preserves accuracy and filename", () => { const model = buildGpsPhotoMapModel([item()]); assert.ok(model); assert.equal(model.points[0].accuracyMeters, 4); assert.equal(model.points[0].displayName, "IMG_0001.jpg"); assert.equal(model.disclaimer, GPS_PHOTO_MAP_DISCLAIMER); }],
  ["viewport fit keeps all points inside padded canvas", () => { const model = buildGpsPhotoMapModel([item({ id: "a", sequence: 1 }), item({ id: "b", sequence: 2, location: { latitude: 47.5002, longitude: 21.0003, accuracyMeters: 5, status: "READY" } })]); assert.ok(model); const fitted = fitGpsPhotoMapToViewport(model, { width: 800, height: 500, padding: 40 }); for (const point of fitted) { assert.ok(point.x >= 40 && point.x <= 760); assert.ok(point.y >= 40 && point.y <= 460); } }],
];

let passed = 0;
for (const [name, test] of tests) {
  test();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}
console.log(`FIELD_CAPTURE_GPS_PHOTO_MAP_CONTRACT ${passed}/${tests.length} PASS`);
