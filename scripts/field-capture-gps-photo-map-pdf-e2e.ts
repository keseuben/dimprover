import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createGpsPhotoMapPdf } from "../app/lib/field-capture/gpsPhotoMapPdf";

const items = [
  { id:"p1", sequence:1, displayName:"IMG_0001.jpg", capturedAt:"2026-08-19T01:00:00.000Z", location:{ latitude:47.321, longitude:21.112, accuracyMeters:4.2, status:"READY" }, orientation:{ headingDegrees:15, headingAccuracyDegrees:8, directionLabel:"É", status:"READY" } },
  { id:"p2", sequence:2, displayName:"IMG_0002.jpg", capturedAt:"2026-08-19T01:01:00.000Z", location:{ latitude:47.3212, longitude:21.1124, accuracyMeters:7.5, status:"READY" }, orientation:{ headingDegrees:95, headingAccuracyDegrees:10, directionLabel:"K", status:"READY" } },
  { id:"p3", sequence:3, displayName:"IMG_0003.jpg", capturedAt:"2026-08-19T01:02:00.000Z", location:{ latitude:47.3208, longitude:21.1128, accuracyMeters:55, status:"LOW_ACCURACY" }, orientation:{ headingDegrees:220, headingAccuracyDegrees:18, directionLabel:"DNy", status:"READY" } },
];
const mmToPt = 72/25.4;
async function verify(size:"A4"|"A3", expected:[number,number]) {
  const result = await createGpsPhotoMapPdf({ items, paperSize:size, orientation:"landscape", projectName:"DIMPRO teszt projekt", generatedAt:new Date("2026-08-19T01:03:00Z") });
  assert.equal(result.pointCount, 3);
  assert.equal(result.paperSize, size);
  assert.match(result.fileName, new RegExp(`${size}\\.pdf$`));
  assert.ok(result.bytes.length > 1500);
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 1);
  const page = doc.getPage(0);
  assert.ok(Math.abs(page.getWidth() - expected[0]*mmToPt) < 0.6);
  assert.ok(Math.abs(page.getHeight() - expected[1]*mmToPt) < 0.6);
  console.log(`${size} ${Math.round(page.getWidth())}x${Math.round(page.getHeight())}pt bytes=${result.bytes.length}`);
}
async function main() {
  await verify("A4", [297,210]);
  await verify("A3", [420,297]);
  console.log("FIELD_CAPTURE_GPS_PHOTO_MAP_PDF_E2E 2/2 PASS");
}
main().catch((error) => { console.error(error); process.exit(1); });
