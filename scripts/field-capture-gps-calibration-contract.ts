import assert from "node:assert/strict";
import { averageGpsCalibrationSamples, getGpsCalibrationReadiness, GPS_CALIBRATION_POINT_LABELS } from "../app/lib/field-capture/gpsPhotoMapCalibration";

const samples = [
  { latitude: 47.3200000, longitude: 21.1100000, accuracyMeters: 3, capturedAt: "2026-08-19T01:00:01.000Z" },
  { latitude: 47.3200300, longitude: 21.1100300, accuracyMeters: 12, capturedAt: "2026-08-19T01:00:03.000Z" },
  { latitude: 47.3199500, longitude: 21.1099500, accuracyMeters: 8, capturedAt: "2026-08-19T01:00:05.000Z" },
];

const point = averageGpsCalibrationSamples({ id: "p1", label: "ÉK sarok", type: "CORNER", note: "kapuoszlop mellett", samples, samplingDurationMs: 8_200 });
assert.equal(point.id, "p1");
assert.equal(point.type, "CORNER");
assert.equal(point.label, "ÉK sarok");
assert.equal(point.note, "kapuoszlop mellett");
assert.equal(point.sampleCount, 3);
assert.equal(point.samplingDurationMs, 8_200);
assert.equal(point.accuracyMeters, 8);
assert.equal(point.capturedAt, "2026-08-19T01:00:05.000Z");
assert.ok(Math.abs(point.latitude - samples[0].latitude) < Math.abs(point.latitude - samples[1].latitude));
assert.ok(Math.abs(point.longitude - samples[0].longitude) < Math.abs(point.longitude - samples[1].longitude));

const minDuration = averageGpsCalibrationSamples({ id: "p2", label: "", type: "SETTING_OUT", samples: [samples[0]], samplingDurationMs: 1_000 });
assert.equal(minDuration.samplingDurationMs, 5_000);
assert.match(minDuration.label, /Kalibrációs pont/);
const maxDuration = averageGpsCalibrationSamples({ id: "p3", label: "Ref", type: "CUSTOM_REFERENCE", samples: [samples[0]], samplingDurationMs: 15_000 });
assert.equal(maxDuration.samplingDurationMs, 10_000);

assert.throws(() => averageGpsCalibrationSamples({ id: "bad", label: "Bad", type: "CORNER", samples: [], samplingDurationMs: 8_000 }), /használható GPS-minta/);
assert.equal(getGpsCalibrationReadiness([point, minDuration]).readyForPlanAlignment, false);
assert.equal(getGpsCalibrationReadiness([point, minDuration, maxDuration]).readyForPlanAlignment, true);
assert.equal(GPS_CALIBRATION_POINT_LABELS.CORNER, "Sarokpont");
assert.equal(GPS_CALIBRATION_POINT_LABELS.SETTING_OUT, "Kitűzési pont");
assert.equal(GPS_CALIBRATION_POINT_LABELS.CUSTOM_REFERENCE, "Egyedi referencia");
console.log("FIELD_CAPTURE_GPS_CALIBRATION_CONTRACT 17/17 PASS");
