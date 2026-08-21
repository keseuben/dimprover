import type { FieldCaptureItem, FieldCaptureLocalSession } from "./types";
import type { FieldCaptureReportMetadata } from "./reportMetadata";
import { GPS_PHOTO_MAP_DISCLAIMER, buildGpsPhotoMapModel, calculateGpsPhotoMapBounds, projectWgs84ToLocalMeters, type GpsPhotoMapCalibrationPoint } from "./gpsPhotoMap";
import { drawSurveyNorthMarkPdf } from "@/components/viewers/drawSurveyNorthMarkPdf";
import { buildConsecutiveGpsPlanDistanceSegments, buildGpsPlanCalibrationModel, buildGpsPlanPhotoPoints, type GpsPlanAnchor } from "./gpsPlanCalibration";
import type { PDFDocument as PdfLibDocument, PDFImage, PDFPage, PDFFont, RGB } from "pdf-lib";

const MM_TO_PT = 72 / 25.4;
const A4 = { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT };
const MARGIN = 13 * MM_TO_PT;
const HEADER_H = 24 * MM_TO_PT;
const FOOTER_H = 11 * MM_TO_PT;

export const FIELD_CAPTURE_REPORT_DISCLAIMER =
  "A jelen állapotrögzítés csak a bejárás során megtekintett és rögzített munkaterületekre vonatkozik. " +
  "A rögzített állapot- vagy készültségi adatok nem minősülnek a teljes projekt készültségi fokának.";

export type FieldCaptureReportSummary = {
  itemCount: number;
  noteCount: number;
  gpsCount: number;
  orientationCount: number;
  editedCount: number;
  serverStoredCount: number;
  userDriveRequestedCount: number;
  userDriveStoredCount: number;
  errorCount: number;
};

export type CreateFieldCaptureSummaryPdfInput = {
  items: FieldCaptureItem[];
  session: FieldCaptureLocalSession;
  metadata: FieldCaptureReportMetadata;
  recorderName?: string | null;
  organizationName?: string | null;
  generatedAt?: Date;
  includePhotoAnnex?: boolean;
  gpsCalibrationPoints?: GpsPhotoMapCalibrationPoint[];
  gpsPlanCalibration?: {
    fileName: string;
    pageNumber: number;
    pageCount: number;
    anchors: GpsPlanAnchor[];
    pdfBytes: Uint8Array;
    updatedAt?: string;
  } | null;
};

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[Őő]/g, (c) => c === "Ő" ? "O" : "o")
    .replace(/[Űű]/g, (c) => c === "Ű" ? "U" : "u")
    .replace(/[–—]/g, "-")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/°/g, " fok")
    .replace(/±/g, "+/-")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safeText(value) : date.toLocaleString("hu-HU");
}

function statusLabel(status: FieldCaptureItem["status"]) {
  if (status === "LOCAL_ONLY") return "Csak az eszközön";
  if (status === "QUEUED") return "Szinkronra vár";
  if (status === "UPLOADING") return "Feltöltés alatt";
  if (status === "SERVER_STORED") return "DIMPRO szerveren";
  if (status === "DESTINATION_PENDING") return "Célhelyre vár";
  if (status === "SYNCED") return "Minden cél kész";
  return "Hiba";
}

export function summarizeFieldCaptureReport(items: FieldCaptureItem[]): FieldCaptureReportSummary {
  return {
    itemCount: items.length,
    noteCount: items.filter((item) => item.note.trim() || item.voiceTranscript.trim()).length,
    gpsCount: items.filter((item) => item.location.latitude !== null && item.location.longitude !== null).length,
    orientationCount: items.filter((item) => item.orientation.headingDegrees !== null).length,
    editedCount: items.filter((item) => item.edited).length,
    serverStoredCount: items.filter((item) => ["SERVER_STORED", "DESTINATION_PENDING", "SYNCED"].includes(item.status)).length,
    userDriveRequestedCount: items.filter((item) => item.options.saveToUserDrive).length,
    userDriveStoredCount: items.filter((item) => item.options.saveToUserDrive && item.status === "SYNCED").length,
    errorCount: items.filter((item) => item.status === "ERROR").length,
  };
}

function wrapText(text: string, font: { widthOfTextAtSize: (value: string, size: number) => number }, size: number, maxWidth: number) {
  const normalized = safeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(input: { page: PDFPage; text: string; x: number; y: number; width: number; font: PDFFont; size: number; color: RGB; lineHeight?: number; maxLines?: number }) {
  const lineHeight = input.lineHeight ?? input.size * 1.28;
  const lines = wrapText(input.text, input.font, input.size, input.width);
  const used = input.maxLines ? lines.slice(0, input.maxLines) : lines;
  if (input.maxLines && lines.length > input.maxLines && used.length) used[used.length - 1] = `${used[used.length - 1].replace(/[. ]+$/, "")}...`;
  used.forEach((line, index) => input.page.drawText(line, { x: input.x, y: input.y - index * lineHeight, size: input.size, font: input.font, color: input.color, maxWidth: input.width }));
  return input.y - used.length * lineHeight;
}

async function fileToEmbeddableImage(pdf: PdfLibDocument, file: File) {
  const type = file.type.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (type === "image/png" || file.name.toLowerCase().endsWith(".png")) return await pdf.embedPng(bytes);
    if (type === "image/jpeg" || type === "image/jpg" || /\.(jpe?g)$/i.test(file.name)) return await pdf.embedJpg(bytes);
  } catch {}
  if (typeof document === "undefined") return null;
  let objectUrl: string | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    let width = 0, height = 0;
    let imageElement: HTMLImageElement | null = null;
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      width = bitmap.width; height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(file);
      imageElement = new Image(); imageElement.decoding = "async";
      await new Promise<void>((resolve, reject) => { imageElement!.onload = () => resolve(); imageElement!.onerror = () => reject(new Error("A képet a böngésző nem tudta megnyitni.")); imageElement!.src = objectUrl!; });
      width = imageElement.naturalWidth; height = imageElement.naturalHeight;
    }
    if (!width || !height) return null;
    const scale = Math.min(1, 1800 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d"); if (!context) return null;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    if (bitmap) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    else if (imageElement) context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return null;
    return await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  } catch { return null; }
  finally { bitmap?.close(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
}

function fitImage(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

type GpsSummaryProjectedPoint = {
  id: string;
  latitude: number;
  longitude: number;
  eastMeters: number;
  northMeters: number;
};

function calibrationTypeLabel(type: GpsPhotoMapCalibrationPoint["type"]) {
  if (type === "CORNER") return "Sarokpont";
  if (type === "SETTING_OUT") return "Kituzesi pont";
  return "Egyedi referencia";
}

function usableCalibrationPoints(points: GpsPhotoMapCalibrationPoint[]) {
  return points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180);
}

function buildGpsSummaryOverview(items: FieldCaptureItem[], calibrationPoints: GpsPhotoMapCalibrationPoint[]) {
  const photoModel = buildGpsPhotoMapModel(items);
  const photos = photoModel?.points ?? [];
  const references = usableCalibrationPoints(calibrationPoints);
  const rawPoints = [
    ...photos.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    ...references.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
  ];
  if (!rawPoints.length) return null;
  const referenceLatitude = rawPoints.reduce((sum, point) => sum + point.latitude, 0) / rawPoints.length;
  const referenceLongitude = rawPoints.reduce((sum, point) => sum + point.longitude, 0) / rawPoints.length;
  const photoProjected = photos.map((point) => ({
    ...point,
    ...projectWgs84ToLocalMeters({ latitude: point.latitude, longitude: point.longitude, referenceLatitude, referenceLongitude }),
  }));
  const referenceProjected = references.map((point, index) => ({
    ...point,
    mapLabel: `R${index + 1}`,
    ...projectWgs84ToLocalMeters({ latitude: point.latitude, longitude: point.longitude, referenceLatitude, referenceLongitude }),
  }));
  const bounds = calculateGpsPhotoMapBounds([...(photoProjected as GpsSummaryProjectedPoint[]), ...(referenceProjected as GpsSummaryProjectedPoint[])]);
  return { referenceLatitude, referenceLongitude, photos: photoProjected, references: referenceProjected, bounds };
}

function fitGpsSummaryPoint(input: { eastMeters: number; northMeters: number }, bounds: ReturnType<typeof calculateGpsPhotoMapBounds>, viewport: { width: number; height: number; padding: number }) {
  const innerWidth = Math.max(1, viewport.width - viewport.padding * 2);
  const innerHeight = Math.max(1, viewport.height - viewport.padding * 2);
  const sourceWidth = Math.max(bounds.widthMeters, 1);
  const sourceHeight = Math.max(bounds.heightMeters, 1);
  const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const contentWidth = bounds.widthMeters * scale;
  const contentHeight = bounds.heightMeters * scale;
  const offsetX = viewport.padding + (innerWidth - contentWidth) / 2;
  const offsetY = viewport.padding + (innerHeight - contentHeight) / 2;
  return {
    x: offsetX + (input.eastMeters - bounds.minEastMeters) * scale,
    y: viewport.height - (offsetY + (input.northMeters - bounds.minNorthMeters) * scale),
  };
}
export async function createFieldCaptureSummaryPdf(input: CreateFieldCaptureSummaryPdfInput) {
  if (!input.items.length) throw new Error("Nincs PDF-be exportálható terepi tétel.");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = input.generatedAt ?? new Date();
  const summary = summarizeFieldCaptureReport(input.items);
  const gpsCalibrationPoints = usableCalibrationPoints(input.gpsCalibrationPoints ?? []);
  const contentTop = A4.height - MARGIN - HEADER_H;
  const contentBottom = MARGIN + FOOTER_H;

  const colors = {
    navy: rgb(0.04, 0.12, 0.2),
    cyan: rgb(0.02, 0.48, 0.58),
    slate: rgb(0.31, 0.38, 0.45),
    light: rgb(0.96, 0.985, 0.99),
    line: rgb(0.78, 0.84, 0.88),
    amber: rgb(1, 0.97, 0.87),
    amberText: rgb(0.42, 0.29, 0.06),
    green: rgb(0.05, 0.45, 0.35),
    white: rgb(1, 1, 1),
  };

  const addPage = (sectionLabel: string) => {
    const page = pdf.addPage([A4.width, A4.height]);
    page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: colors.white });
    page.drawRectangle({
      x: MARGIN,
      y: A4.height - MARGIN - HEADER_H,
      width: A4.width - MARGIN * 2,
      height: HEADER_H,
      color: colors.light,
      borderColor: colors.cyan,
      borderWidth: 0.8,
    });
    page.drawText("DIMPRO - Terepi osszesito", { x: MARGIN + 10, y: A4.height - MARGIN - 21, size: 15, font: bold, color: colors.navy });
    page.drawText(safeText(sectionLabel), { x: MARGIN + 10, y: A4.height - MARGIN - 37, size: 8.2, font: bold, color: colors.cyan });
    page.drawText(safeText(input.metadata.reportTitle), { x: MARGIN + 10, y: A4.height - MARGIN - 51, size: 7.2, font: regular, color: colors.slate });
    return page;
  };

  let page = addPage("Munkamenet osszesito");
  let y = contentTop - 12;

  page.drawText(safeText(input.session.projectName || "Projekt nelkuli terepi rogzites"), { x: MARGIN, y, size: 14, font: bold, color: colors.navy });
  y -= 19;
  page.drawText(safeText(`Rogzites jellege: ${input.metadata.surveyNature}`), { x: MARGIN, y, size: 8.5, font: bold, color: colors.slate });
  y -= 14;
  page.drawText(safeText(`Felmeresi lefedettseg: kb. ${input.metadata.coveragePercent}%`), { x: MARGIN, y, size: 8.5, font: bold, color: colors.cyan });
  y -= 22;

  const infoRows = [
    ["Rogzito", input.recorderName || "-"],
    ["Szervezet", input.organizationName || "-"],
    ["Helyi session", input.session.id],
    ["Szerver session", input.session.serverSessionId || "-"],
    ["Indulas", formatDateTime(input.session.createdAt)],
    ["Lezaras", input.session.status === "CLOSED" ? formatDateTime(input.session.closedAt) : "Aktiv munkamenet"],
    ["PDF keszult", generatedAt.toLocaleString("hu-HU")],
  ];
  const infoBoxHeight = 78;
  page.drawRectangle({ x: MARGIN, y: y - infoBoxHeight + 9, width: A4.width - MARGIN * 2, height: infoBoxHeight, color: colors.light, borderColor: colors.line, borderWidth: 0.5 });
  infoRows.forEach(([label, value], index) => {
    const rowY = y - index * 10;
    page.drawText(safeText(label), { x: MARGIN + 8, y: rowY, size: 6.7, font: bold, color: colors.slate });
    page.drawText(safeText(value), { x: MARGIN + 92, y: rowY, size: 6.7, font: regular, color: colors.navy, maxWidth: A4.width - MARGIN * 2 - 100 });
  });
  y -= infoBoxHeight + 10;

  const metrics: Array<[string, string | number]> = [
    ["Rogzitett kep", summary.itemCount],
    ["Megjegyzes", summary.noteCount],
    ["GPS-fotopont", summary.gpsCount],
    ["GPS referencia", gpsCalibrationPoints.length],
    ["Kamerairany", summary.orientationCount],
    ["Szerkesztett", summary.editedCount],
    ["DIMPRO szerveren", `${summary.serverStoredCount}/${summary.itemCount}`],
    ["Sajat Drive", summary.userDriveRequestedCount ? `${summary.userDriveStoredCount}/${summary.userDriveRequestedCount}` : "-"],
    ["Hiba", summary.errorCount],
  ];
  const gap = 5;
  const boxW = (A4.width - MARGIN * 2 - gap * 3) / 4;
  metrics.forEach(([label, value], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = MARGIN + col * (boxW + gap);
    const boxY = y - row * 43;
    page.drawRectangle({ x, y: boxY - 32, width: boxW, height: 34, color: colors.white, borderColor: colors.line, borderWidth: 0.5 });
    page.drawText(safeText(value), { x: x + 6, y: boxY - 13, size: 12, font: bold, color: colors.cyan });
    page.drawText(safeText(label), { x: x + 6, y: boxY - 25, size: 5.6, font: bold, color: colors.slate, maxWidth: boxW - 12 });
  });
  y -= Math.ceil(metrics.length / 4) * 43 + 8;

  page.drawRectangle({ x: MARGIN, y: y - 49, width: A4.width - MARGIN * 2, height: 55, color: colors.amber, borderColor: rgb(0.85, 0.66, 0.18), borderWidth: 0.6 });
  page.drawText("FELMERESI ERVENYESSEG", { x: MARGIN + 8, y: y - 11, size: 7, font: bold, color: colors.amberText });
  drawWrappedText({ page, text: FIELD_CAPTURE_REPORT_DISCLAIMER, x: MARGIN + 8, y: y - 25, width: A4.width - MARGIN * 2 - 16, font: bold, size: 6.5, lineHeight: 8.2, color: colors.amberText, maxLines: 4 });

  page = addPage("Rogzitett tetelek");
  y = contentTop - 8;
  const tableX = MARGIN;
  const tableW = A4.width - MARGIN * 2;
  for (const item of [...input.items].sort((a, b) => a.sequence - b.sequence)) {
    const rowHeight = 39;
    if (y - rowHeight < contentBottom) {
      page = addPage("Rogzitett tetelek - folytatas");
      y = contentTop - 8;
    }
    page.drawRectangle({ x: tableX, y: y - rowHeight + 5, width: tableW, height: rowHeight, color: colors.white, borderColor: colors.line, borderWidth: 0.45 });
    page.drawText(`#${item.sequence}`, { x: tableX + 7, y: y - 10, size: 8, font: bold, color: colors.cyan });
    page.drawText(safeText(item.displayName.slice(0, 58)), { x: tableX + 35, y: y - 10, size: 7, font: bold, color: colors.navy, maxWidth: tableW - 140 });
    page.drawText(safeText(statusLabel(item.status)), { x: tableX + tableW - 96, y: y - 10, size: 6.2, font: bold, color: item.status === "ERROR" ? rgb(0.7, 0.1, 0.12) : colors.green, maxWidth: 90 });
    const metaParts: string[] = [formatDateTime(item.capturedAt)];
    if (item.location.accuracyMeters !== null) metaParts.push(`GPS +/-${Math.round(item.location.accuracyMeters)} m`);
    if (item.orientation.headingDegrees !== null) metaParts.push(`${item.orientation.directionLabel || "irany"} ${Math.round(item.orientation.headingDegrees)} fok`);
    if (item.edited) metaParts.push(`szerkesztve v${item.editRevision}`);
    page.drawText(safeText(metaParts.join(" | ")), { x: tableX + 35, y: y - 21, size: 5.8, font: regular, color: colors.slate, maxWidth: tableW - 43 });
    drawWrappedText({ page, text: item.note || item.voiceTranscript || "Nincs megjegyzes.", x: tableX + 35, y: y - 30, width: tableW - 43, font: regular, size: 5.8, lineHeight: 7, color: colors.slate, maxLines: 2 });
    y -= rowHeight + 4;
  }
  const gpsOverview = buildGpsSummaryOverview(input.items, gpsCalibrationPoints);
  const gpsPlanModel = input.gpsPlanCalibration
    ? buildGpsPlanCalibrationModel({ calibrationPoints: gpsCalibrationPoints, anchors: input.gpsPlanCalibration.anchors, pageNumber: input.gpsPlanCalibration.pageNumber })
    : null;
  const gpsPlanPhotoPoints = gpsPlanModel ? buildGpsPlanPhotoPoints(input.items, gpsPlanModel) : [];
  const gpsPlanDistanceSegments = buildConsecutiveGpsPlanDistanceSegments(gpsPlanPhotoPoints);
  let gpsPageCount = 0;
  let gpsPlanPageCount = 0;
  if (gpsPlanModel && input.gpsPlanCalibration) {
    const LANDSCAPE = { width: A4.height, height: A4.width };
    page = pdf.addPage([LANDSCAPE.width, LANDSCAPE.height]);
    page.drawRectangle({ x: 0, y: 0, width: LANDSCAPE.width, height: LANDSCAPE.height, color: colors.white });
    page.drawText("DIMPRO - Tervlap - GPS fotopontok es referenciapontok", { x: MARGIN, y: LANDSCAPE.height - MARGIN - 4, size: 12, font: bold, color: colors.navy });
    page.drawText(safeText(`${input.gpsPlanCalibration.fileName} | ${input.gpsPlanCalibration.pageNumber}/${input.gpsPlanCalibration.pageCount}. oldal`), { x: MARGIN, y: LANDSCAPE.height - MARGIN - 19, size: 6.6, font: regular, color: colors.slate, maxWidth: LANDSCAPE.width - MARGIN * 2 - 160 });
    const qualityText = gpsPlanModel.verificationAvailable
      ? `Illesztes: ${gpsPlanModel.quality} | atlagos elteres +/-${(gpsPlanModel.averageResidualMeters ?? 0).toFixed(2)} m | max. +/-${(gpsPlanModel.maxResidualMeters ?? 0).toFixed(2)} m | ${gpsPlanModel.anchorCount} R pont`
      : `Illesztes: 3 pontos, ellenorzo tartalekpont nelkul | ${gpsPlanModel.anchorCount} R pont`;
    page.drawText(safeText(qualityText), { x: MARGIN, y: LANDSCAPE.height - MARGIN - 31, size: 6.2, font: bold, color: gpsPlanModel.quality === "WEAK" ? rgb(0.7, 0.1, 0.12) : colors.cyan, maxWidth: LANDSCAPE.width - MARGIN * 2 - 160 });

    const [embeddedPlan] = await pdf.embedPdf(input.gpsPlanCalibration.pdfBytes, [Math.max(0, input.gpsPlanCalibration.pageNumber - 1)]);
    const planBoxX = MARGIN;
    const planBoxY = MARGIN + FOOTER_H + 19;
    const planBoxW = LANDSCAPE.width - MARGIN * 2;
    const planBoxH = LANDSCAPE.height - planBoxY - MARGIN - 42;
    const planScale = Math.min(planBoxW / embeddedPlan.width, planBoxH / embeddedPlan.height);
    const planW = embeddedPlan.width * planScale;
    const planH = embeddedPlan.height * planScale;
    const planX = planBoxX + (planBoxW - planW) / 2;
    const planY = planBoxY + (planBoxH - planH) / 2;
    page.drawRectangle({ x: planX - 2, y: planY - 2, width: planW + 4, height: planH + 4, color: colors.white, borderColor: colors.line, borderWidth: 0.6 });
    page.drawPage(embeddedPlan, { x: planX, y: planY, width: planW, height: planH });
    const toPdfPoint = (point: { xPercent: number; yPercent: number }) => ({ x: planX + planW * point.xPercent / 100, y: planY + planH * (1 - point.yPercent / 100) });

    for (const segment of gpsPlanDistanceSegments.filter((item) => item.from.insidePlan && item.to.insidePlan)) {
      const from = toPdfPoint(segment.from);
      const to = toPdfPoint(segment.to);
      page.drawLine({ start: from, end: to, thickness: 1.15, color: colors.cyan, dashArray: [5, 4], opacity: 0.72 });
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const label = safeText(segment.displayLabel);
      const labelW = bold.widthOfTextAtSize(label, 6.4) + 8;
      page.drawRectangle({ x: midX - labelW / 2, y: midY - 5, width: labelW, height: 12, color: colors.white, borderColor: rgb(0.4, 0.82, 0.88), borderWidth: 0.5, opacity: 0.94 });
      page.drawText(label, { x: midX - labelW / 2 + 4, y: midY - 1, size: 6.4, font: bold, color: colors.navy });
    }

    const calibrationIndex = new Map(gpsCalibrationPoints.map((point, index) => [point.id, index]));
    for (const anchor of input.gpsPlanCalibration.anchors.filter((item) => item.pageNumber === input.gpsPlanCalibration!.pageNumber)) {
      if (!calibrationIndex.has(anchor.calibrationPointId)) continue;
      const point = toPdfPoint(anchor);
      const label = `R${(calibrationIndex.get(anchor.calibrationPointId) ?? 0) + 1}`;
      page.drawRectangle({ x: point.x - 7, y: point.y - 7, width: 14, height: 14, color: rgb(0.95, 0.93, 1), borderColor: rgb(0.42, 0.16, 0.72), borderWidth: 1.8 });
      page.drawText(label, { x: point.x - 5.4, y: point.y - 2.4, size: 6.2, font: bold, color: rgb(0.29, 0.08, 0.52) });
    }

    for (const photo of gpsPlanPhotoPoints.filter((item) => item.insidePlan)) {
      const point = toPdfPoint(photo);
      if (photo.headingPlanDegrees !== null) {
        const radians = photo.headingPlanDegrees * Math.PI / 180;
        const length = 22;
        const end = { x: point.x + Math.sin(radians) * length, y: point.y + Math.cos(radians) * length };
        page.drawLine({ start: point, end, thickness: 1.8, color: rgb(0.92, 0.34, 0.04) });
        const left = { x: end.x - Math.sin(radians - Math.PI / 5) * 7, y: end.y - Math.cos(radians - Math.PI / 5) * 7 };
        const right = { x: end.x - Math.sin(radians + Math.PI / 5) * 7, y: end.y - Math.cos(radians + Math.PI / 5) * 7 };
        page.drawLine({ start: left, end, thickness: 1.5, color: rgb(0.92, 0.34, 0.04) });
        page.drawLine({ start: right, end, thickness: 1.5, color: rgb(0.92, 0.34, 0.04) });
      }
      page.drawCircle({ x: point.x, y: point.y, size: 8, color: colors.white, borderColor: photo.accuracyMeters !== null && photo.accuracyMeters > 50 ? rgb(0.85, 0.47, 0.04) : colors.cyan, borderWidth: 2 });
      const serial = String(photo.sequence);
      page.drawText(serial, { x: point.x - bold.widthOfTextAtSize(serial, 6.5) / 2, y: point.y - 2.4, size: 6.5, font: bold, color: colors.navy });
    }

    drawSurveyNorthMarkPdf({ page, centerX: LANDSCAPE.width - MARGIN - 32, centerY: LANDSCAPE.height - MARGIN - 26, northAngle: gpsPlanModel.northAngleDegrees, bold, rgb, scale: 0.72 });
    page.drawText(safeText("Kek kor: GPS-fotopont | narancs nyil: kamera iranya | lila negyzet: R referencia | szaggatott vonal: egymast koveto fotok tavolsaga"), { x: MARGIN, y: MARGIN + 27, size: 5.7, font: bold, color: colors.slate, maxWidth: LANDSCAPE.width - MARGIN * 2 });
    drawWrappedText({ page, text: GPS_PHOTO_MAP_DISCLAIMER, x: MARGIN, y: MARGIN + 15, width: LANDSCAPE.width - MARGIN * 2, font: regular, size: 5.5, lineHeight: 6.7, color: colors.amberText, maxLines: 2 });
    gpsPageCount += 1;
    gpsPlanPageCount += 1;
  }
  if (gpsOverview) {
    if (!gpsPlanModel) {
      page = addPage("GPS helyszinrajz es fotopontok");
    gpsPageCount += 1;
    const mapX = MARGIN;
    const mapY = contentBottom + 58;
    const mapW = A4.width - MARGIN * 2;
    const mapH = contentTop - mapY - 4;
    page.drawRectangle({ x: mapX, y: mapY, width: mapW, height: mapH, color: colors.light, borderColor: colors.line, borderWidth: 0.7 });
    for (let grid = 1; grid < 8; grid += 1) page.drawLine({ start: { x: mapX + mapW * grid / 8, y: mapY }, end: { x: mapX + mapW * grid / 8, y: mapY + mapH }, thickness: 0.35, color: colors.line, dashArray: [3, 6], opacity: 0.55 });
    for (let grid = 1; grid < 6; grid += 1) page.drawLine({ start: { x: mapX, y: mapY + mapH * grid / 6 }, end: { x: mapX + mapW, y: mapY + mapH * grid / 6 }, thickness: 0.35, color: colors.line, dashArray: [3, 6], opacity: 0.55 });
    const photoFitted = gpsOverview.photos.map((point) => ({ ...point, ...fitGpsSummaryPoint(point, gpsOverview.bounds, { width: mapW, height: mapH, padding: 42 }) }));
    const photoById = new Map(photoFitted.map((point) => [point.id, point]));
    const orderedPhotoIds = [...gpsOverview.photos].sort((a, b) => a.sequence - b.sequence).map((point) => point.id);
    for (let index = 1; index < orderedPhotoIds.length; index += 1) {
      const from = photoById.get(orderedPhotoIds[index - 1]);
      const to = photoById.get(orderedPhotoIds[index]);
      if (!from || !to) continue;
      page.drawLine({ start: { x: mapX + from.x, y: mapY + (mapH - from.y) }, end: { x: mapX + to.x, y: mapY + (mapH - to.y) }, thickness: 1.1, color: colors.cyan, dashArray: [5, 4], opacity: 0.6 });
    }
    for (const point of photoFitted) {
      const x = mapX + point.x;
      const yPoint = mapY + (mapH - point.y);
      const weak = point.accuracyMeters !== null && point.accuracyMeters > 50;
      page.drawCircle({ x, y: yPoint, size: 7.5, color: colors.white, borderColor: weak ? rgb(0.85, 0.47, 0.04) : colors.cyan, borderWidth: 2 });
      page.drawText(String(point.sequence), { x: x - 2.7, y: yPoint - 2.5, size: 6.5, font: bold, color: colors.navy });
      if (point.headingDegrees !== null) {
        const radians = (90 - point.headingDegrees) * Math.PI / 180;
        const end = { x: x + Math.cos(radians) * 20, y: yPoint + Math.sin(radians) * 20 };
        page.drawLine({ start: { x, y: yPoint }, end, thickness: 1.8, color: rgb(0.92, 0.34, 0.04) });
      }
      page.drawText(safeText(`#${point.sequence} ${point.displayName.slice(0, 26)}`), { x: x + 10, y: yPoint + 4, size: 5.7, font: bold, color: colors.navy, maxWidth: 150 });
      page.drawText(safeText(`GPS ${point.accuracyMeters === null ? "pontossag n/a" : `+/-${Math.round(point.accuracyMeters)} m`}${point.directionLabel ? ` | kamera ${point.directionLabel}` : ""}`), { x: x + 10, y: yPoint - 5, size: 5.2, font: regular, color: colors.slate, maxWidth: 150 });
    }
    const referenceFitted = gpsOverview.references.map((point) => ({ ...point, ...fitGpsSummaryPoint(point, gpsOverview.bounds, { width: mapW, height: mapH, padding: 42 }) }));
    for (const point of referenceFitted) {
      const x = mapX + point.x;
      const yPoint = mapY + (mapH - point.y);
      page.drawRectangle({ x: x - 6, y: yPoint - 6, width: 12, height: 12, color: rgb(0.95, 0.93, 1), borderColor: rgb(0.45, 0.22, 0.75), borderWidth: 1.8 });
      page.drawText(point.mapLabel, { x: x - 5, y: yPoint - 2, size: 5.6, font: bold, color: rgb(0.3, 0.12, 0.55) });
      page.drawText(safeText(`${point.mapLabel} ${point.label.slice(0, 28)}`), { x: x + 10, y: yPoint + 3, size: 5.7, font: bold, color: rgb(0.3, 0.12, 0.55), maxWidth: 150 });
      page.drawText(safeText(`${calibrationTypeLabel(point.type)}${point.accuracyMeters === null ? "" : ` | +/-${Math.round(point.accuracyMeters)} m`}`), { x: x + 10, y: yPoint - 6, size: 5.2, font: regular, color: colors.slate, maxWidth: 150 });
    }
    drawSurveyNorthMarkPdf({ page, centerX: mapX + mapW - 38, centerY: mapY + mapH - 38, northAngle: 0, bold, rgb, scale: 0.78 });
    page.drawText(safeText(`Helyszini kiterjedes: ${gpsOverview.bounds.widthMeters.toFixed(1)} x ${gpsOverview.bounds.heightMeters.toFixed(1)} m`), { x: MARGIN, y: contentBottom + 43, size: 6.2, font: bold, color: colors.cyan });
    page.drawText(safeText(`Kek kor: GPS-fotopont | narancs vonal: kamera iranya | lila negyzet: kulon rogzitett GPS referencia/kalibracios pont`), { x: MARGIN, y: contentBottom + 31, size: 5.8, font: bold, color: colors.slate, maxWidth: A4.width - MARGIN * 2 });
    drawWrappedText({ page, text: GPS_PHOTO_MAP_DISCLAIMER, x: MARGIN, y: contentBottom + 18, width: A4.width - MARGIN * 2, font: regular, size: 5.7, lineHeight: 7, color: colors.amberText, maxLines: 2 });
    }

    const photoCoordinates = [...gpsOverview.photos].sort((a, b) => a.sequence - b.sequence);
    const referenceCoordinates = gpsOverview.references;
    page = addPage("GPS koordinatak");
    gpsPageCount += 1;
    y = contentTop - 8;
    const coordW = A4.width - MARGIN * 2;
    const startCoordinatePage = (label: string) => { page = addPage(label); gpsPageCount += 1; y = contentTop - 8; };
    const ensureCoordinateSpace = (height: number) => { if (y - height < contentBottom) startCoordinatePage("GPS koordinatak - folytatas"); };
    const drawCoordinateSection = (label: string) => { ensureCoordinateSpace(24); page.drawText(safeText(label), { x: MARGIN, y, size: 9, font: bold, color: colors.cyan }); y -= 18; };
    const drawCoordinateRow = (title: string, line1: string, line2: string, note?: string) => {
      const rowH = note ? 48 : 39;
      ensureCoordinateSpace(rowH + 5);
      page.drawRectangle({ x: MARGIN, y: y - rowH + 5, width: coordW, height: rowH, color: colors.white, borderColor: colors.line, borderWidth: 0.45 });
      page.drawText(safeText(title), { x: MARGIN + 7, y: y - 10, size: 6.8, font: bold, color: colors.navy, maxWidth: coordW - 14 });
      page.drawText(safeText(line1), { x: MARGIN + 7, y: y - 21, size: 5.7, font: regular, color: colors.slate, maxWidth: coordW - 14 });
      page.drawText(safeText(line2), { x: MARGIN + 7, y: y - 31, size: 5.7, font: regular, color: colors.slate, maxWidth: coordW - 14 });
      if (note) page.drawText(safeText(`Megjegyzes: ${note}`), { x: MARGIN + 7, y: y - 41, size: 5.5, font: regular, color: colors.slate, maxWidth: coordW - 14 });
      y -= rowH + 5;
    };
    if (photoCoordinates.length) {
      drawCoordinateSection(`GPS-fotopontok (${photoCoordinates.length})`);
      for (const point of photoCoordinates) drawCoordinateRow(
        `#${point.sequence} FOTO - ${point.displayName}`,
        `${point.latitude.toFixed(7)}, ${point.longitude.toFixed(7)} | pontossag ${point.accuracyMeters === null ? "n/a" : `+/-${Math.round(point.accuracyMeters)} m`} | ${formatDateTime(point.capturedAt)}`,
        point.headingDegrees === null ? "Kamerairany: nincs rogzitve" : `Kamerairany: ${point.directionLabel || "-"} / ${Math.round(point.headingDegrees)} fok`,
      );
    }
    if (referenceCoordinates.length) {
      drawCoordinateSection(`Kulon rogzitett GPS referencia/kalibracios pontok (${referenceCoordinates.length})`);
      for (const point of referenceCoordinates) drawCoordinateRow(
        `${point.mapLabel} ${calibrationTypeLabel(point.type)} - ${point.label}`,
        `${point.latitude.toFixed(7)}, ${point.longitude.toFixed(7)} | pontossag ${point.accuracyMeters === null ? "n/a" : `+/-${Math.round(point.accuracyMeters)} m`} | ${formatDateTime(point.capturedAt)}`,
        `${point.sampleCount} GPS-minta | mintagyujtes ${(point.samplingDurationMs / 1000).toFixed(1)} mp`,
        point.note || undefined,
      );
    }
  }

  let photoCount = 0;
  if (input.includePhotoAnnex !== false) {
    const sorted = [...input.items].sort((a, b) => a.sequence - b.sequence);
    const slotsPerPage = 2;
    const slotGap = 8;
    const available = contentTop - contentBottom - 12;
    const slotH = (available - slotGap) / slotsPerPage;
    for (let index = 0; index < sorted.length; index += slotsPerPage) {
      page = addPage(index === 0 ? "Fotomelleklet" : "Fotomelleklet - folytatas");
      for (let slotIndex = 0; slotIndex < slotsPerPage; slotIndex += 1) {
        const item = sorted[index + slotIndex];
        if (!item) continue;
        photoCount += 1;
        const slotTop = contentTop - 7 - slotIndex * (slotH + slotGap);
        const slotBottom = slotTop - slotH;
        page.drawRectangle({ x: MARGIN, y: slotBottom, width: A4.width - MARGIN * 2, height: slotH, color: colors.white, borderColor: colors.line, borderWidth: 0.55 });
        page.drawText(safeText(`#${item.sequence} - ${item.displayName.slice(0, 70)}`), { x: MARGIN + 7, y: slotTop - 14, size: 7.3, font: bold, color: colors.navy, maxWidth: A4.width - MARGIN * 2 - 14 });
        const imageX = MARGIN + 7;
        const imageY = slotBottom + 48;
        const imageW = 178;
        const imageH = slotH - 71;
        page.drawRectangle({ x: imageX, y: imageY, width: imageW, height: imageH, color: colors.light, borderColor: colors.line, borderWidth: 0.4 });
        const embedded = await fileToEmbeddableImage(pdf, item.uploadFile);
        if (embedded) {
          const fitted = fitImage(embedded, imageW - 8, imageH - 8);
          page.drawImage(embedded, { x: imageX + (imageW - fitted.width) / 2, y: imageY + (imageH - fitted.height) / 2, width: fitted.width, height: fitted.height });
        } else {
          page.drawText("Kepelozet nem agyazhato be ebben a bongeszoben.", { x: imageX + 8, y: imageY + imageH / 2, size: 5.8, font: regular, color: colors.slate, maxWidth: imageW - 16 });
        }

        const metaX = imageX + imageW + 10;
        const metaW = A4.width - MARGIN - 7 - metaX;
        let metaY = slotTop - 31;
        const metadataLines = [
          `Datum: ${formatDateTime(item.capturedAt)}`,
          `Statusz: ${statusLabel(item.status)}`,
          item.location.latitude !== null && item.location.longitude !== null
            ? `GPS: ${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}${item.location.accuracyMeters !== null ? ` (+/-${Math.round(item.location.accuracyMeters)} m)` : ""}`
            : "GPS: nincs rogzitetve",
          item.orientation.headingDegrees !== null
            ? `Kamerairany: ${item.orientation.directionLabel || "-"} / ${Math.round(item.orientation.headingDegrees)} fok`
            : "Kamerairany: nincs rogzitetve",
          item.edited ? `Kepjeloles: szerkesztve v${item.editRevision}` : "Kepjeloles: nincs",
          item.options.saveToUserDrive ? "Sajat DIMPRO Drive: kert cel" : "Sajat DIMPRO Drive: nincs kerve",
        ];
        metadataLines.forEach((line) => {
          page.drawText(safeText(line), { x: metaX, y: metaY, size: 5.7, font: regular, color: colors.slate, maxWidth: metaW });
          metaY -= 9;
        });
        page.drawText("Megjegyzes", { x: metaX, y: metaY - 2, size: 6.2, font: bold, color: colors.cyan });
        drawWrappedText({ page, text: item.note || item.voiceTranscript || "Nincs megjegyzes.", x: metaX, y: metaY - 13, width: metaW, font: regular, size: 5.7, lineHeight: 7.2, color: colors.navy, maxLines: 7 });
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const pageWidth = current.getWidth();
    current.drawLine({ start: { x: MARGIN, y: MARGIN + 17 }, end: { x: pageWidth - MARGIN, y: MARGIN + 17 }, thickness: 0.45, color: colors.line });
    current.drawText(safeText(`DIMPRO Terepi Gyorsrogzito | ${input.session.id.slice(0, 24)}`), { x: MARGIN, y: MARGIN + 6, size: 5.5, font: regular, color: colors.slate });
    const pageLabel = `${index + 1}/${pages.length}`;
    current.drawText(pageLabel, { x: pageWidth - MARGIN - bold.widthOfTextAtSize(pageLabel, 5.7), y: MARGIN + 6, size: 5.7, font: bold, color: colors.slate });
  });

  const safeSession = input.session.id.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 28);
  return {
    bytes: await pdf.save(),
    fileName: `DIMPRO_Terepi_osszesito_${generatedAt.toISOString().slice(0, 10)}_${safeSession}.pdf`,
    pageCount: pages.length,
    itemCount: input.items.length,
    photoCount,
    gpsPageCount,
    gpsPhotoPointCount: gpsOverview?.photos.length ?? 0,
    gpsReferencePointCount: gpsCalibrationPoints.length,
    gpsPlanPageCount,
    gpsDistanceSegmentCount: gpsPlanDistanceSegments.length,
    gpsPlanCalibrated: Boolean(gpsPlanModel),
    summary,
    metadata: input.metadata,
  };
}

export async function downloadFieldCaptureSummaryPdf(input: CreateFieldCaptureSummaryPdfInput) {
  const result = await createFieldCaptureSummaryPdf(input);
  const bytes = Uint8Array.from(result.bytes);
  const blob = new Blob([bytes.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return result;
}
