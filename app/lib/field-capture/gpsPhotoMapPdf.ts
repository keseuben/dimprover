import { buildGpsPhotoMapModel, fitGpsPhotoMapToViewport, type GpsPhotoMapSourceItem } from "@/app/lib/field-capture/gpsPhotoMap";
import { drawSurveyNorthMarkPdf } from "@/components/viewers/drawSurveyNorthMarkPdf";

export type GpsPhotoMapPdfPaperSize = "A4" | "A3";
export type GpsPhotoMapPdfOrientation = "landscape" | "portrait";

const MM_TO_PT = 72 / 25.4;
const PAGE_MM: Record<GpsPhotoMapPdfPaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
};

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[Őő]/g, (c) => c === "Ő" ? "O" : "o")
    .replace(/[Űű]/g, (c) => c === "Ű" ? "U" : "u")
    .replace(/[–—]/g, "-")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/°/g, " fok")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");
}

export async function createGpsPhotoMapPdf(input: {
  items: GpsPhotoMapSourceItem[];
  paperSize?: GpsPhotoMapPdfPaperSize;
  orientation?: GpsPhotoMapPdfOrientation;
  projectName?: string | null;
  generatedAt?: Date;
}) {
  const model = buildGpsPhotoMapModel(input.items);
  if (!model) throw new Error("Nincs PDF-be exportálható GPS-fotópont.");

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const paperSize = input.paperSize ?? "A4";
  const orientation = input.orientation ?? "landscape";
  const base = PAGE_MM[paperSize];
  const widthMm = orientation === "landscape" ? base.height : base.width;
  const heightMm = orientation === "landscape" ? base.width : base.height;
  const width = widthMm * MM_TO_PT;
  const height = heightMm * MM_TO_PT;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 12 * MM_TO_PT;
  const headerH = 26 * MM_TO_PT;
  const footerH = 26 * MM_TO_PT;
  const mapX = margin;
  const mapY = margin + footerH;
  const mapW = width - margin * 2;
  const mapH = height - margin * 2 - headerH - footerH;

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: margin, y: height - margin - headerH, width: width - margin * 2, height: headerH, color: rgb(0.96, 0.99, 1), borderColor: rgb(0.04, 0.45, 0.55), borderWidth: 0.8 });
  page.drawText("DIMPRO - Terepi GPS fototerkep", { x: margin + 10, y: height - margin - 24, size: 16, font: bold, color: rgb(0.04, 0.18, 0.2) });
  page.drawText(safeText(input.projectName || "Projekt nincs megadva"), { x: margin + 10, y: height - margin - 39, size: 8.5, font: bold, color: rgb(0.2, 0.3, 0.36) });
  const generatedAt = input.generatedAt ?? new Date();
  page.drawText(safeText(`${paperSize} ${orientation === "landscape" ? "fekvo" : "allo"} - ${generatedAt.toLocaleString("hu-HU")}`), { x: margin + 10, y: height - margin - 53, size: 7.5, font, color: rgb(0.35, 0.42, 0.48) });

  page.drawRectangle({ x: mapX, y: mapY, width: mapW, height: mapH, color: rgb(0.975, 0.985, 0.99), borderColor: rgb(0.75, 0.82, 0.86), borderWidth: 0.7 });
  const fitted = fitGpsPhotoMapToViewport(model, { width: mapW, height: mapH, padding: 32 });
  const byId = new Map(fitted.map((point) => [point.id, point]));

  for (const segment of model.sequenceSegments) {
    const from = byId.get(segment.fromId);
    const to = byId.get(segment.toId);
    if (!from || !to) continue;
    page.drawLine({
      start: { x: mapX + from.x, y: mapY + (mapH - from.y) },
      end: { x: mapX + to.x, y: mapY + (mapH - to.y) },
      thickness: 1.2,
      color: rgb(0.05, 0.45, 0.56),
      dashArray: [5, 4],
      opacity: 0.65,
    });
  }

  for (const point of fitted) {
    const x = mapX + point.x;
    const y = mapY + (mapH - point.y);
    const weak = point.accuracyMeters !== null && point.accuracyMeters > 50;
    page.drawCircle({ x, y, size: 7, color: rgb(1, 1, 1), borderColor: weak ? rgb(0.85, 0.47, 0.04) : rgb(0.03, 0.57, 0.7), borderWidth: 2 });
    page.drawText(String(point.sequence), { x: x - 2.4, y: y - 2.5, size: 6.5, font: bold, color: rgb(0.06, 0.1, 0.16) });

    if (point.headingDegrees !== null) {
      const radians = (90 - point.headingDegrees) * Math.PI / 180;
      const length = 18;
      const end = { x: x + Math.cos(radians) * length, y: y + Math.sin(radians) * length };
      page.drawLine({ start: { x, y }, end, thickness: 1.7, color: rgb(0.92, 0.34, 0.04) });
    }

    const label = safeText(`#${point.sequence} ${point.displayName.slice(0, 28)} | GPS ${point.accuracyMeters === null ? "n/a" : `+/-${Math.round(point.accuracyMeters)} m`}${point.directionLabel ? ` | kamera ${point.directionLabel}` : ""}`);
    page.drawText(label, { x: x + 9, y: y + 4, size: 6.2, font: bold, color: rgb(0.08, 0.13, 0.2), maxWidth: 160 });
  }

  drawSurveyNorthMarkPdf({ page, centerX: mapX + mapW - 38, centerY: mapY + mapH - 38, northAngle: 0, bold, rgb, scale: 0.8 });

  page.drawRectangle({ x: margin, y: margin, width: width - margin * 2, height: footerH - 5, color: rgb(1, 0.98, 0.92), borderColor: rgb(0.86, 0.67, 0.25), borderWidth: 0.6 });
  page.drawText(safeText("Szaggatott vonal: a fotok keszitesi sorrendje, nem a tenyleges bejart utvonal. Narancs vonal: kamera iranya."), { x: margin + 8, y: margin + footerH - 19, size: 6.7, font: bold, color: rgb(0.35, 0.25, 0.08), maxWidth: width - margin * 2 - 16 });
  page.drawText(safeText(model.disclaimer), { x: margin + 8, y: margin + 8, size: 6.3, font, color: rgb(0.35, 0.25, 0.08), maxWidth: width - margin * 2 - 16 });

  return {
    bytes: await pdf.save(),
    fileName: `DIMPRO_Terepi_GPS_fototerkep_${generatedAt.toISOString().slice(0, 10)}_${paperSize}.pdf`,
    pointCount: model.points.length,
    paperSize,
    orientation,
  };
}

export async function downloadGpsPhotoMapPdf(input: Parameters<typeof createGpsPhotoMapPdf>[0]) {
  const result = await createGpsPhotoMapPdf(input);
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
