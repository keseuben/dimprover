import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { createFieldCaptureSummaryPdf, FIELD_CAPTURE_REPORT_DISCLAIMER, summarizeFieldCaptureReport } from "../app/lib/field-capture/fieldCaptureSummaryPdf";
import type { FieldCaptureItem, FieldCaptureLocalSession, PreCaptureOptions } from "../app/lib/field-capture/types";
import type { FieldCaptureReportMetadata } from "../app/lib/field-capture/reportMetadata";
import type { GpsPhotoMapCalibrationPoint } from "../app/lib/field-capture/gpsPhotoMap";

async function main() {
const png = await readFile("public/drop-app-icon-v099-192.png");
const makeFile = (name: string) => new File([png], name, { type: "image/png", lastModified: Date.parse("2026-08-21T08:00:00Z") });

const baseOptions: PreCaptureOptions = {
  gpsEnabled: true,
  orientationEnabled: true,
  voiceNoteEnabled: true,
  transcriptMode: "cleaned",
  saveToDevice: false,
  saveToUserDrive: true,
  saveToProjectDrive: false,
  rememberForSession: false,
};

function item(sequence: number, status: FieldCaptureItem["status"], edited: boolean): FieldCaptureItem {
  const file = makeFile(`terepi-${sequence}.png`);
  return {
    id: `item-${sequence}`,
    sessionId: "f4-e2e-session",
    sequence,
    capturedAt: `2026-08-21T0${8 + sequence}:15:00.000Z`,
    originalName: `IMG_${sequence}.png`,
    displayName: `260821_terepi_F${String(sequence).padStart(4, "0")}.png`,
    originalSize: file.size,
    uploadSize: file.size,
    optimized: true,
    optimizationNote: "192x192; teszt optimalizálás; EXIF eltávolítva.",
    width: 192,
    height: 192,
    previewUrl: null,
    uploadFile: file,
    originalFile: file,
    note: sequence === 1 ? "Főbejárat melletti részlet ellenőrzendő." : "Kooperációhoz rögzített állapotfotó.",
    voiceTranscript: sequence === 1 ? "Terepi hangos teszt." : "",
    status,
    progress: status === "SYNCED" ? 100 : 0,
    error: null,
    edited,
    editRevision: edited ? 2 : 0,
    options: { ...baseOptions },
    locationStatus: "READY",
    orientationStatus: "READY",
    location: {
      enabled: true,
      latitude: 47.318 + sequence / 1000,
      longitude: 21.112 + sequence / 1000,
      accuracyMeters: 7 + sequence,
      capturedAt: `2026-08-21T0${8 + sequence}:15:02.000Z`,
      source: "browser-geolocation",
      status: "READY",
      detail: "Teszt GPS.",
    },
    orientation: {
      enabled: true,
      headingDegrees: sequence === 1 ? 43 : 180,
      headingAccuracyDegrees: 6,
      directionLabel: sequence === 1 ? "ÉK" : "D",
      capturedAt: `2026-08-21T0${8 + sequence}:15:03.000Z`,
      source: "device-orientation",
      status: "READY",
      detail: "Teszt tájolás.",
    },
  };
}

const items = [item(1, "SYNCED", true), item(2, "SERVER_STORED", false)];
const session: FieldCaptureLocalSession = {
  id: "f4-e2e-session",
  createdAt: "2026-08-21T08:00:00.000Z",
  projectId: "project-test",
  projectName: "DIMPRO F4 E2E Projekt",
  status: "CLOSED",
  closedAt: "2026-08-21T10:30:00.000Z",
  serverSessionId: "server-session-f4",
};
const metadata: FieldCaptureReportMetadata = {
  reportTitle: "Terepi összesítő E2E",
  surveyNature: "Részleges",
  coveragePercent: 35,
};

const calibrationPoints: GpsPhotoMapCalibrationPoint[] = [
  { id: "ref-1", label: "ÉK épületsarok", type: "CORNER", latitude: 47.3194, longitude: 21.1126, accuracyMeters: 5, capturedAt: "2026-08-21T09:20:00.000Z", sampleCount: 8, samplingDurationMs: 8000, note: "Északkeleti sarok." },
  { id: "ref-2", label: "DNy kitűzési pont", type: "SETTING_OUT", latitude: 47.3198, longitude: 21.1138, accuracyMeters: 6, capturedAt: "2026-08-21T09:22:00.000Z", sampleCount: 9, samplingDurationMs: 8000, note: "Kitűzési referencia." },
  { id: "ref-3", label: "Kapubejáró referencia", type: "CUSTOM_REFERENCE", latitude: 47.3202, longitude: 21.1142, accuracyMeters: 9, capturedAt: "2026-08-21T09:24:00.000Z", sampleCount: 7, samplingDurationMs: 8000, note: "Kapubejáró mellett." },
];

const planPdf = await PDFDocument.create();
const planPage = planPdf.addPage([841.89, 595.28]);
planPage.drawText("DIMPRO F10 E2E HELYSZINRAJZ", { x: 36, y: 550, size: 18 });
planPage.drawRectangle({ x: 90, y: 110, width: 620, height: 350, borderWidth: 1 });
planPage.drawLine({ start: { x: 90, y: 110 }, end: { x: 710, y: 460 }, thickness: 0.8 });
const planBytes = await planPdf.save();
const planAnchors = [
  { id: "anchor-ref-1", calibrationPointId: "ref-1", pageNumber: 1, xPercent: 24, yPercent: 25, createdAt: "2026-08-21T09:30:00.000Z" },
  { id: "anchor-ref-2", calibrationPointId: "ref-2", pageNumber: 1, xPercent: 72, yPercent: 34, createdAt: "2026-08-21T09:31:00.000Z" },
  { id: "anchor-ref-3", calibrationPointId: "ref-3", pageNumber: 1, xPercent: 42, yPercent: 76, createdAt: "2026-08-21T09:32:00.000Z" },
];

const summary = summarizeFieldCaptureReport(items);
assert.equal(summary.itemCount, 2);
assert.equal(summary.noteCount, 2);
assert.equal(summary.gpsCount, 2);
assert.equal(summary.orientationCount, 2);
assert.equal(summary.editedCount, 1);
assert.equal(summary.serverStoredCount, 2);
assert.equal(summary.userDriveRequestedCount, 2);
assert.equal(summary.userDriveStoredCount, 1);
assert.equal(summary.errorCount, 0);

const result = await createFieldCaptureSummaryPdf({
  items,
  session,
  metadata,
  recorderName: "F4 Tesztelő",
  organizationName: "DIMPRO DEV",
  generatedAt: new Date("2026-08-21T12:00:00.000Z"),
  includePhotoAnnex: true,
  gpsCalibrationPoints: calibrationPoints,
  gpsPlanCalibration: { fileName: "F10_helyszinrajz.pdf", pageNumber: 1, pageCount: 1, anchors: planAnchors, pdfBytes: planBytes },
});

assert.ok(result.bytes.length > 10_000, `PDF túl kicsi: ${result.bytes.length}`);
assert.match(result.fileName, /^DIMPRO_Terepi_osszesito_2026-08-21_f4-e2e-session\.pdf$/);
assert.equal(result.itemCount, 2);
assert.equal(result.photoCount, 2);
assert.equal(result.gpsPhotoPointCount, 2);
assert.equal(result.gpsReferencePointCount, 3);
assert.equal(result.gpsPlanCalibrated, true);
assert.equal(result.gpsPlanPageCount, 1);
assert.equal(result.gpsDistanceSegmentCount, 1);
assert.ok(result.gpsPageCount >= 2, `Legalább 2 GPS oldal várt, kapott: ${result.gpsPageCount}`);
assert.equal(result.metadata.coveragePercent, 35);
assert.equal(result.metadata.surveyNature, "Részleges");
assert.ok(result.pageCount >= 5, `Legalább 5 oldal várt, kapott: ${result.pageCount}`);
assert.match(FIELD_CAPTURE_REPORT_DISCLAIMER, /nem minősülnek a teljes projekt készültségi fokának/);

const parsed = await PDFDocument.load(result.bytes);
assert.equal(parsed.getPageCount(), result.pageCount);
const first = parsed.getPage(0);
const [width, height] = [first.getWidth(), first.getHeight()];
assert.ok(Math.abs(width - 210 * 72 / 25.4) < 0.2, `A4 szélesség hibás: ${width}`);
assert.ok(Math.abs(height - 297 * 72 / 25.4) < 0.2, `A4 magasság hibás: ${height}`);
const landscapePages = parsed.getPages().filter((page) => page.getWidth() > page.getHeight());
assert.equal(landscapePages.length, 1, `Pontosan 1 kalibrált landscape tervlapoldal várt, kapott: ${landscapePages.length}`);

console.log(JSON.stringify({
  ok: true,
  pageCount: result.pageCount,
  photoCount: result.photoCount,
  gpsPageCount: result.gpsPageCount,
  gpsPhotoPointCount: result.gpsPhotoPointCount,
  gpsReferencePointCount: result.gpsReferencePointCount,
  gpsPlanCalibrated: result.gpsPlanCalibrated,
  gpsPlanPageCount: result.gpsPlanPageCount,
  gpsDistanceSegmentCount: result.gpsDistanceSegmentCount,
  itemCount: result.itemCount,
  bytes: result.bytes.length,
  coveragePercent: result.metadata.coveragePercent,
  surveyNature: result.metadata.surveyNature,
  userDrive: `${result.summary.userDriveStoredCount}/${result.summary.userDriveRequestedCount}`,
}, null, 2));
console.log("FIELD_CAPTURE_F4_REPORT_PDF_E2E 21/21 PASS");

}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
