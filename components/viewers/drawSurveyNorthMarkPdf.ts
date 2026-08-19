import type { PDFFont, PDFPage } from "pdf-lib";

type PdfLibRuntime = typeof import("pdf-lib");
type PdfColor = ReturnType<PdfLibRuntime["rgb"]>;

function hexagonPoints(centerX: number, centerY: number, radius: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 3 * index - Math.PI / 6;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  });
}

function rotatePdfPoint(point: { x: number; y: number }, center: { x: number; y: number }, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function drawPdfPolygon(input: { page: PDFPage; points: Array<{ x: number; y: number }>; color: PdfColor; borderColor: PdfColor; borderWidth: number }) {
  const pageHeight = input.page.getHeight();
  const [first, ...rest] = input.points;
  const path = [`M ${first.x.toFixed(3)} ${(pageHeight - first.y).toFixed(3)}`, ...rest.map((point) => `L ${point.x.toFixed(3)} ${(pageHeight - point.y).toFixed(3)}`), "Z"].join(" ");
  input.page.drawSvgPath(path, { x: 0, y: pageHeight, scale: 1, color: input.color, borderColor: input.borderColor, borderWidth: input.borderWidth });
}

export function drawSurveyNorthMarkPdf(input: { page: PDFPage; centerX: number; centerY: number; northAngle: number; bold: PDFFont; rgb: PdfLibRuntime["rgb"]; scale?: number }) {
  const scale = input.scale ?? 1;
  const dark = input.rgb(0.04, 0.18, 0.2);
  const cyan = input.rgb(0.02, 0.55, 0.61);
  const mint = input.rgb(0.37, 0.92, 0.83);
  const outerPoints = hexagonPoints(input.centerX, input.centerY, 25 * scale);
  drawPdfPolygon({ page: input.page, points: outerPoints, color: input.rgb(0.93, 1, 0.99), borderColor: cyan, borderWidth: 2.4 * scale });

  const center = { x: input.centerX, y: input.centerY };
  const localPointer = [
    { x: input.centerX, y: input.centerY + 24 * scale },
    { x: input.centerX + 14 * scale, y: input.centerY + 7 * scale },
    { x: input.centerX + 11 * scale, y: input.centerY - 10 * scale },
    { x: input.centerX, y: input.centerY - 20 * scale },
    { x: input.centerX - 11 * scale, y: input.centerY - 10 * scale },
    { x: input.centerX - 14 * scale, y: input.centerY + 7 * scale },
  ];
  const pointerPoints = localPointer.map((point) => rotatePdfPoint(point, center, -input.northAngle));
  drawPdfPolygon({ page: input.page, points: pointerPoints, color: dark, borderColor: mint, borderWidth: 1.5 * scale });

  const spineStart = rotatePdfPoint({ x: input.centerX, y: input.centerY + 18 * scale }, center, -input.northAngle);
  const spineEnd = rotatePdfPoint({ x: input.centerX, y: input.centerY - 14 * scale }, center, -input.northAngle);
  const miniArrowLeft = rotatePdfPoint({ x: input.centerX - 3.5 * scale, y: input.centerY + 12.5 * scale }, center, -input.northAngle);
  const miniArrowRight = rotatePdfPoint({ x: input.centerX + 3.5 * scale, y: input.centerY + 12.5 * scale }, center, -input.northAngle);
  input.page.drawLine({ start: spineStart, end: spineEnd, thickness: 1.1 * scale, color: mint, opacity: 0.58 });
  input.page.drawLine({ start: miniArrowLeft, end: spineStart, thickness: 1.4 * scale, color: mint, opacity: 0.92 });
  input.page.drawLine({ start: miniArrowRight, end: spineStart, thickness: 1.4 * scale, color: mint, opacity: 0.92 });
  input.page.drawText("É", { x: input.centerX - 3.2 * scale, y: input.centerY - 3 * scale, size: 9 * scale, font: input.bold, color: input.rgb(1, 1, 1) });
  input.page.drawText("DIMPRO", { x: input.centerX - 17 * scale, y: input.centerY - 36 * scale, size: 6.8 * scale, font: input.bold, color: cyan });
}
