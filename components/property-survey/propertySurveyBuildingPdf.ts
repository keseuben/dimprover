import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { getWallSegmentGeometry, type SurveyBuildingLevel, type SurveyWallOpening, type SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyEnergySummary } from "@/components/property-survey/propertySurveyEnergyCalculations";
import type { EnergyAssemblySetResult } from "@/components/energy/domain/energyAssemblyTypes";
import type { EnergyZoneSetResult } from "@/components/energy/domain/energyZoneTypes";
import type { EnergyOpeningSetResult } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyDemandSetResult } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyRenewableSizingResult } from "@/components/energy/domain/energyRenewableTypes";
import type { EnergyRenovationComparisonSetResult } from "@/components/energy/domain/energyRenovationComparisonTypes";
import type { PropertySurveyIssue } from "@/components/property-survey/propertySurveyIssueTypes";
import { getSurveyThermalBoundarySegments } from "@/components/property-survey/propertySurveyThermalBoundary";
import { getSurveySectionInternalWallPositions, getSurveySectionLengthMeters, surveyRoofShapeLabels, surveySectionKindLabels, type SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";
import type { PropertySurveyDraft, PropertySurveyProject } from "@/components/property-survey/propertySurveyWorkspaceTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import { drawSurveyNorthMarkPdf } from "@/components/viewers/drawSurveyNorthMarkPdf";

const MM_TO_PT = 72 / 25.4;
const SURVEY_SHEET_FRAME_INSET_MM = 5;
const SURVEY_TITLE_BLOCK_WIDTH_MM = 200;
const SURVEY_TITLE_BLOCK_HEIGHT_MM = 34;
const SURVEY_TITLE_BLOCK_GAP_MM = 3;
const SURVEY_PLAN_INFO_BLOCK_HEIGHT_MM = 24;

type PdfLibRuntime = typeof import("pdf-lib");
type PdfColor = ReturnType<PdfLibRuntime["rgb"]>;

type DrawingBounds = { minX: number; minY: number; maxX: number; maxY: number };

type PageTransform = {
  x: (modelX: number) => number;
  y: (modelY: number) => number;
  scale: number;
  contentLeft: number;
  contentBottom: number;
  contentWidth: number;
  contentHeight: number;
};

function safePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/[Őő]/g, (character) => character === "Ő" ? "O" : "o")
    .replace(/[Űű]/g, (character) => character === "Ű" ? "U" : "u")
    .replace(/[–—]/g, "-")
    .replace(/↔/g, "<->")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/°/g, " fok")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");
}

function getSurveySheetLocation(draft: PropertySurveyDraft, project: PropertySurveyProject | null) {
  const composedAddress = draft.property.address || [
    draft.property.postalCode,
    draft.property.settlement,
    [draft.property.street, draft.property.houseNumber].filter(Boolean).join(" "),
  ].filter(Boolean).join(" ");
  return [
    composedAddress || project?.location || "Nincs megadva",
    draft.property.parcelNumber ? `hrsz. ${draft.property.parcelNumber}` : "",
  ].filter(Boolean).join(", ");
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawTextBlock(input: { page: PDFPage; text: string; x: number; y: number; width: number; font: PDFFont; size: number; color: PdfColor; lineHeight?: number; maxLines?: number; boldFont?: PDFFont }) {
  const lineHeight = input.lineHeight ?? input.size * 1.35;
  const lines = wrapText(input.text, input.font, input.size, input.width).slice(0, input.maxLines || 100);
  lines.forEach((line, index) => input.page.drawText(line, { x: input.x, y: input.y - index * lineHeight, size: input.size, font: input.boldFont || input.font, color: input.color }));
  return input.y - lines.length * lineHeight;
}

function getLevelRooms(draft: PropertySurveyDraft, levelId: string) {
  return draft.rooms.filter((room) => (room.levelId || draft.activeLevelId) === levelId);
}

function generalBounds(rooms: SurveyRoom[], sectionLines: SurveySectionLine[]): DrawingBounds {
  const xs = rooms.flatMap((room) => [room.x, room.x + room.width]).concat(sectionLines.flatMap((line) => [line.x1, line.x2]));
  const ys = rooms.flatMap((room) => [room.y, room.y + room.depth]).concat(sectionLines.flatMap((line) => [line.y1, line.y2]));
  if (!xs.length || !ys.length) return { minX: 0, minY: 0, maxX: 900, maxY: 610 };
  const padding = 45;
  return { minX: Math.min(...xs) - padding, minY: Math.min(...ys) - padding, maxX: Math.max(...xs) + padding, maxY: Math.max(...ys) + padding };
}

function industrialBounds(draft: PropertySurveyDraft): DrawingBounds {
  return { minX: 0, minY: 0, maxX: Math.max(1, draft.industrialSettings.planWidthMeters), maxY: Math.max(1, draft.industrialSettings.planHeightMeters) };
}

function createTransform(bounds: DrawingBounds, page: PDFPage, hasPlanInfoBlock = true): PageTransform {
  const margin = 30;
  const contentLeft = margin;
  const reservedBottomMm = SURVEY_SHEET_FRAME_INSET_MM + SURVEY_TITLE_BLOCK_HEIGHT_MM + SURVEY_TITLE_BLOCK_GAP_MM
    + (hasPlanInfoBlock ? SURVEY_PLAN_INFO_BLOCK_HEIGHT_MM + SURVEY_TITLE_BLOCK_GAP_MM : 0);
  const contentBottom = Math.max(margin, reservedBottomMm * MM_TO_PT);
  const contentWidth = page.getWidth() - margin * 2;
  const contentHeight = page.getHeight() - contentBottom - margin;
  const modelWidth = Math.max(1, bounds.maxX - bounds.minX);
  const modelHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(contentWidth / modelWidth, contentHeight / modelHeight);
  const offsetX = contentLeft + (contentWidth - modelWidth * scale) / 2;
  const offsetY = contentBottom + (contentHeight - modelHeight * scale) / 2;
  return {
    scale,
    contentLeft,
    contentBottom,
    contentWidth,
    contentHeight,
    x: (modelX) => offsetX + (modelX - bounds.minX) * scale,
    y: (modelY) => offsetY + contentHeight - (modelY - bounds.minY) * scale - (contentHeight - modelHeight * scale) / 2,
  };
}

function drawHeader(input: { page: PDFPage; title: string; subtitle: string; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  input.page.drawText(safePdfText(input.title), { x: 30, y: input.page.getHeight() - 28, size: 14, font: input.bold, color: input.rgb(0.04, 0.18, 0.2) });
  input.page.drawText(safePdfText(input.subtitle), { x: 30, y: input.page.getHeight() - 43, size: 8.5, font: input.font, color: input.rgb(0.3, 0.38, 0.46) });
  input.page.drawLine({ start: { x: 30, y: input.page.getHeight() - 49 }, end: { x: input.page.getWidth() - 30, y: input.page.getHeight() - 49 }, thickness: 1, color: input.rgb(0.1, 0.7, 0.72) });
}

function drawSurveySheetFrame(input: { page: PDFPage; rgb: PdfLibRuntime["rgb"] }) {
  const inset = SURVEY_SHEET_FRAME_INSET_MM * MM_TO_PT;
  input.page.drawRectangle({
    x: inset,
    y: inset,
    width: input.page.getWidth() - inset * 2,
    height: input.page.getHeight() - inset * 2,
    borderColor: input.rgb(0.08, 0.72, 0.65),
    borderWidth: 0.85,
  });
}

function wrapPdfTitleCellText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const explicitLines = safePdfText(value).split(/\n+/);
  const lines = explicitLines.flatMap((line) => wrapText(line, font, size, maxWidth));
  if (lines.length <= 2) return lines;
  const truncated = lines.slice(0, 2);
  let last = truncated[1];
  while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
  truncated[1] = `${last.trim()}...`;
  return truncated;
}

function drawPdfTitleCell(input: { page: PDFPage; x: number; y: number; width: number; height: number; label: string; value: string; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const border = input.rgb(0.08, 0.72, 0.65);
  const labelColor = input.rgb(0.05, 0.46, 0.43);
  const valueColor = input.rgb(0.04, 0.09, 0.16);
  const padding = 5.5;
  const labelSize = 5.4;
  const valueSize = 7.1;
  input.page.drawRectangle({ x: input.x, y: input.y, width: input.width, height: input.height, color: input.rgb(1, 1, 1), borderColor: border, borderWidth: 0.65 });
  input.page.drawText(safePdfText(input.label), { x: input.x + padding, y: input.y + input.height - 8.5, size: labelSize, font: input.bold, color: labelColor, maxWidth: input.width - padding * 2 });
  const lines = wrapPdfTitleCellText(input.value || "Nincs megadva", input.bold, valueSize, input.width - padding * 2);
  const firstBaseline = input.y + input.height - 20;
  lines.forEach((line, index) => input.page.drawText(line, { x: input.x + padding, y: firstBaseline - index * 9.2, size: valueSize, font: input.bold, color: valueColor, maxWidth: input.width - padding * 2 }));
}

function drawTitleBlock(input: { page: PDFPage; projectName: string; clientName: string; surveyName: string; surveyType: string; levelName: string; revisionLabel: string; location: string; surveyDate: string; creator: string; paperSize: string; orientation: "portrait" | "landscape"; scale: number; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const inset = SURVEY_SHEET_FRAME_INSET_MM * MM_TO_PT;
  const width = Math.min(SURVEY_TITLE_BLOCK_WIDTH_MM * MM_TO_PT, input.page.getWidth() - inset * 2);
  const height = SURVEY_TITLE_BLOCK_HEIGHT_MM * MM_TO_PT;
  const rowHeight = height / 2;
  const x = input.page.getWidth() - inset - width;
  const y = inset;
  const topWidths = [width * 0.28, width * 0.25, width * 0.29, width * 0.18];
  const bottomWidths = [width * 0.12, width * 0.21, width * 0.30, width * 0.12, width * 0.14, width * 0.11];
  const topCells = [
    ["PROJEKT NEVE", input.projectName],
    ["MEGRENDELO", input.clientName],
    ["FELMERES NEVE", input.surveyName],
    ["RAJZVERZIO", input.revisionLabel],
  ] as const;
  const bottomCells = [
    ["SZINT", input.levelName],
    ["FELMERES TIPUSA", input.surveyType],
    ["HELYSZIN", input.location],
    ["DATUM", input.surveyDate],
    ["KESZITO", input.creator],
    ["LEPTEK", `M=1:${Math.max(1, Math.round(input.scale))}`],
  ] as const;
  let topX = x;
  topCells.forEach(([label, value], index) => {
    drawPdfTitleCell({ page: input.page, x: topX, y: y + rowHeight, width: topWidths[index], height: rowHeight, label, value, font: input.font, bold: input.bold, rgb: input.rgb });
    topX += topWidths[index];
  });
  let bottomX = x;
  bottomCells.forEach(([label, value], index) => {
    drawPdfTitleCell({ page: input.page, x: bottomX, y, width: bottomWidths[index], height: rowHeight, label, value, font: input.font, bold: input.bold, rgb: input.rgb });
    bottomX += bottomWidths[index];
  });
}

function drawPlanLegendAndAreaSummary(input: { page: PDFPage; rooms: SurveyRoom[]; levelName: string; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  if (!input.rooms.length) return;
  const inset = SURVEY_SHEET_FRAME_INSET_MM * MM_TO_PT;
  const width = Math.min(SURVEY_TITLE_BLOCK_WIDTH_MM * MM_TO_PT, input.page.getWidth() - inset * 2);
  const height = SURVEY_PLAN_INFO_BLOCK_HEIGHT_MM * MM_TO_PT;
  const x = input.page.getWidth() - inset - width;
  const y = inset + SURVEY_TITLE_BLOCK_HEIGHT_MM * MM_TO_PT + SURVEY_TITLE_BLOCK_GAP_MM * MM_TO_PT;
  const legendWidth = width * 0.64;
  const summaryWidth = width - legendWidth;
  const border = input.rgb(0.08, 0.72, 0.65);
  const dark = input.rgb(0.04, 0.09, 0.16);
  const muted = input.rgb(0.28, 0.34, 0.4);
  const labelColor = input.rgb(0.05, 0.46, 0.43);
  const padding = 5.5;
  input.page.drawRectangle({ x, y, width: legendWidth, height, color: input.rgb(1, 1, 1), borderColor: border, borderWidth: 0.65 });
  input.page.drawRectangle({ x: x + legendWidth, y, width: summaryWidth, height, color: input.rgb(1, 1, 1), borderColor: border, borderWidth: 0.65 });
  input.page.drawText("JELMAGYARAZAT", { x: x + padding, y: y + height - 10, size: 5.7, font: input.bold, color: labelColor });
  input.page.drawText(safePdfText(`ALAPTERULET-OSSZESITO - ${input.levelName}`), { x: x + legendWidth + padding, y: y + height - 10, size: 5.7, font: input.bold, color: labelColor, maxWidth: summaryWidth - padding * 2 });
  const legend = [
    { label: "Kulso fal", color: input.rgb(0.98, 0.45, 0.09), dash: undefined, dot: false },
    { label: "Belso fal", color: input.rgb(0.58, 0.64, 0.72), dash: undefined, dot: false },
    { label: "Futetlen hatar", color: input.rgb(0.92, 0.66, 0.04), dash: [3, 2] as number[], dot: false },
    { label: "Nyilaszaro", color: input.rgb(0.06, 0.65, 0.91), dash: undefined, dot: false },
    { label: "Hohatar", color: input.rgb(0.06, 0.72, 0.51), dash: [3, 2] as number[], dot: false },
    { label: "Metszetvonal", color: input.rgb(0.63, 0.11, 0.69), dash: [3, 2] as number[], dot: false },
    { label: "Fotopont", color: input.rgb(0.15, 0.39, 0.92), dash: undefined, dot: true },
    { label: "Hibapont", color: input.rgb(0.86, 0.15, 0.15), dash: undefined, dot: true },
  ];
  const cellWidth = (legendWidth - padding * 2) / 4;
  legend.forEach((item, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const itemX = x + padding + column * cellWidth;
    const itemY = y + height - 28 - row * 18;
    if (item.dot) input.page.drawCircle({ x: itemX + 4, y: itemY + 2, size: 3.2, color: item.color, borderColor: input.rgb(1, 1, 1), borderWidth: 0.5 });
    else input.page.drawLine({ start: { x: itemX, y: itemY + 2 }, end: { x: itemX + 12, y: itemY + 2 }, thickness: 2.2, color: item.color, dashArray: item.dash });
    input.page.drawText(item.label, { x: itemX + 16, y: itemY, size: 5.1, font: input.bold, color: muted, maxWidth: cellWidth - 17 });
  });
  const heated = input.rooms.filter((room) => room.heated).reduce((sum, room) => sum + room.area, 0);
  const unheated = input.rooms.filter((room) => !room.heated).reduce((sum, room) => sum + room.area, 0);
  const total = heated + unheated;
  const rows = [
    ["Futott", `${heated.toFixed(1)} m2`],
    ["Futetlen", `${unheated.toFixed(1)} m2`],
    ["Osszesen", `${total.toFixed(1)} m2`],
    ["Helyisegek", `${input.rooms.length} db`],
  ] as const;
  const summaryCellWidth = (summaryWidth - padding * 2) / 2;
  rows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + legendWidth + padding + column * summaryCellWidth;
    const cellY = y + height - 29 - row * 19;
    input.page.drawText(label, { x: cellX, y: cellY, size: 5.2, font: input.bold, color: muted });
    const valueWidth = input.bold.widthOfTextAtSize(value, 5.8);
    input.page.drawText(value, { x: cellX + summaryCellWidth - valueWidth - 2, y: cellY, size: 5.8, font: input.bold, color: dark });
  });
}

function openingGeometry(opening: SurveyWallOpening, wallSegments: SurveyWallSegment[], rooms: SurveyRoom[]) {
  const segment = wallSegments.find((item) => item.id === opening.wallSegmentId);
  const room = rooms.find((item) => item.id === opening.roomId);
  if (!segment || !room) return null;
  const geometry = getWallSegmentGeometry(room, segment);
  const dx = geometry.x2 - geometry.x1;
  const dy = geometry.y2 - geometry.y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const centerX = geometry.x1 + dx * Math.min(1, Math.max(0, opening.offsetRatio));
  const centerY = geometry.y1 + dy * Math.min(1, Math.max(0, opening.offsetRatio));
  const half = Math.min(length * 0.45, Math.max(8, opening.widthMeters * 30));
  return { x1: centerX - ux * half, y1: centerY - uy * half, x2: centerX + ux * half, y2: centerY + uy * half };
}

function drawGeneralPlan(input: { page: PDFPage; draft: PropertySurveyDraft; level: SurveyBuildingLevel; rooms: SurveyRoom[]; issues: PropertySurveyIssue[]; transform: PageTransform; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const wallSegments = input.draft.wallSegments.filter((segment) => segment.levelId === input.level.id && input.rooms.some((room) => room.id === segment.roomId));
  const openings = input.draft.wallOpenings.filter((opening) => opening.levelId === input.level.id);
  const thermalSettings = input.draft.thermalBoundaries.find((item) => item.levelId === input.level.id);
  const sections = input.draft.sectionLines.filter((line) => line.levelId === input.level.id);

  for (const room of input.rooms) {
    const x = input.transform.x(room.x);
    const top = input.transform.y(room.y);
    const width = room.width * input.transform.scale;
    const height = room.depth * input.transform.scale;
    input.page.drawRectangle({ x, y: top - height, width, height, color: input.rgb(room.heated ? 0.93 : 0.96, room.heated ? 0.99 : 0.96, room.heated ? 0.99 : 0.92), borderColor: input.rgb(0.45, 0.52, 0.58), borderWidth: 0.6 });
    const label = `${room.name} - ${Number(room.area).toFixed(1)} m2`;
    input.page.drawText(safePdfText(label), { x: x + 4, y: top - 13, size: Math.max(5.5, Math.min(8.5, width / 14)), font: input.bold, color: input.rgb(0.04, 0.18, 0.2), maxWidth: Math.max(8, width - 8) });
  }

  for (const segment of wallSegments) {
    const room = input.rooms.find((item) => item.id === segment.roomId);
    if (!room) continue;
    const geometry = getWallSegmentGeometry(room, segment);
    const color = segment.boundaryType === "external" || segment.boundaryType === "adjacent" ? input.rgb(0.08, 0.12, 0.16) : segment.boundaryType === "unheated" ? input.rgb(0.85, 0.43, 0.08) : input.rgb(0.45, 0.52, 0.58);
    input.page.drawLine({ start: { x: input.transform.x(geometry.x1), y: input.transform.y(geometry.y1) }, end: { x: input.transform.x(geometry.x2), y: input.transform.y(geometry.y2) }, thickness: Math.max(0.8, Math.min(5, segment.thicknessCm / 8)), color });
  }

  for (const opening of openings) {
    const geometry = openingGeometry(opening, wallSegments, input.rooms);
    if (!geometry) continue;
    input.page.drawLine({ start: { x: input.transform.x(geometry.x1), y: input.transform.y(geometry.y1) }, end: { x: input.transform.x(geometry.x2), y: input.transform.y(geometry.y2) }, thickness: 4, color: input.rgb(0.1, 0.45, 0.75) });
  }

  const thermalSegments = getSurveyThermalBoundarySegments({ rooms: input.rooms, wallSegments, settings: thermalSettings });
  for (const segment of thermalSegments) input.page.drawLine({ start: { x: input.transform.x(segment.x1), y: input.transform.y(segment.y1) }, end: { x: input.transform.x(segment.x2), y: input.transform.y(segment.y2) }, thickness: 1.4, dashArray: [5, 3], color: input.rgb(0.04, 0.65, 0.58) });

  for (const line of sections) {
    const start = { x: input.transform.x(line.x1), y: input.transform.y(line.y1) };
    const end = { x: input.transform.x(line.x2), y: input.transform.y(line.y2) };
    input.page.drawLine({ start, end, thickness: 2, dashArray: [8, 4], color: input.rgb(0.55, 0.12, 0.55) });
    input.page.drawCircle({ x: start.x, y: start.y, size: 8, color: input.rgb(1, 1, 1), borderColor: input.rgb(0.55, 0.12, 0.55), borderWidth: 2 });
    input.page.drawCircle({ x: end.x, y: end.y, size: 8, color: input.rgb(1, 1, 1), borderColor: input.rgb(0.55, 0.12, 0.55), borderWidth: 2 });
    input.page.drawText(safePdfText(line.serial.split("-")[0] || "A"), { x: start.x - 3, y: start.y - 3, size: 7, font: input.bold, color: input.rgb(0.35, 0.05, 0.35) });
    input.page.drawText(safePdfText(line.serial.split("-")[1] || "A"), { x: end.x - 3, y: end.y - 3, size: 7, font: input.bold, color: input.rgb(0.35, 0.05, 0.35) });
  }

  for (const point of input.draft.photoPoints.filter((item) => item.levelId === input.level.id)) {
    const x = input.transform.x(point.xPercent / 100 * 900);
    const y = input.transform.y(point.yPercent / 100 * 610);
    input.page.drawCircle({ x, y, size: 5.5, color: input.rgb(0.15, 0.45, 0.85), borderColor: input.rgb(1, 1, 1), borderWidth: 1 });
    input.page.drawText(safePdfText(point.serial), { x: x + 6, y: y + 2, size: 5.5, font: input.bold, color: input.rgb(0.05, 0.25, 0.55) });
  }
  for (const issue of input.issues.filter((item) => !item.roomId || input.rooms.some((room) => room.id === item.roomId))) {
    const x = input.transform.x(issue.xPercent / 100 * 900);
    const y = input.transform.y(issue.yPercent / 100 * 610);
    input.page.drawCircle({ x, y, size: 6, color: input.rgb(0.9, 0.16, 0.16), borderColor: input.rgb(1, 1, 1), borderWidth: 1 });
    input.page.drawText(safePdfText(issue.serial), { x: x + 7, y: y + 2, size: 5.5, font: input.bold, color: input.rgb(0.55, 0.05, 0.05) });
  }
}

function industrialPointToModel(draft: PropertySurveyDraft, point: { xMeters: number; yMeters: number }) {
  return { x: point.xMeters, y: point.yMeters };
}

function drawIndustrialPlan(input: { page: PDFPage; draft: PropertySurveyDraft; level: SurveyBuildingLevel; transform: PageTransform; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const contours = input.draft.industrialBuildingContours.filter((item) => item.levelId === input.level.id);
  const markups = input.draft.industrialMarkups.filter((item) => item.levelId === input.level.id);
  const pillars = input.draft.pillars.filter((item) => item.levelId === input.level.id);
  for (const contour of contours) {
    const points = contour.points.map((point) => industrialPointToModel(input.draft, point));
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      input.page.drawLine({ start: { x: input.transform.x(points[index].x), y: input.transform.y(points[index].y) }, end: { x: input.transform.x(next.x), y: input.transform.y(next.y) }, thickness: 2.3, color: input.rgb(0.04, 0.18, 0.2) });
    }
    const first = points[0];
    if (first) input.page.drawText(safePdfText(contour.title), { x: input.transform.x(first.x) + 5, y: input.transform.y(first.y) - 12, size: 8, font: input.bold, color: input.rgb(0.04, 0.18, 0.2) });
  }
  for (const pillar of pillars) {
    const center = { x: input.transform.x(pillar.xMeters), y: input.transform.y(pillar.yMeters) };
    const size = Math.max(3, Math.min(11, pillar.shape === "circle" ? pillar.diameterMeters * input.transform.scale / 2 : Math.max(pillar.widthMeters, pillar.depthMeters) * input.transform.scale / 2));
    if (pillar.shape === "circle") input.page.drawCircle({ x: center.x, y: center.y, size, color: input.rgb(0.95, 0.97, 0.98), borderColor: input.rgb(0.04, 0.18, 0.2), borderWidth: 1 });
    else input.page.drawRectangle({ x: center.x - size, y: center.y - size, width: size * 2, height: size * 2, color: input.rgb(0.95, 0.97, 0.98), borderColor: input.rgb(0.04, 0.18, 0.2), borderWidth: 1 });
  }
  for (const markup of markups) {
    const points = markup.points.map((point) => ({ x: input.transform.x(point.xMeters), y: input.transform.y(point.yMeters) }));
    if (markup.closed && points.length >= 3) {
      for (let index = 0; index < points.length; index += 1) input.page.drawLine({ start: points[index], end: points[(index + 1) % points.length], thickness: 1.6, color: input.rgb(0.7, 0.35, 0.05) });
    } else {
      for (let index = 0; index < points.length - 1; index += 1) input.page.drawLine({ start: points[index], end: points[index + 1], thickness: markup.kind === "crack" ? 2 : 1.4, color: markup.kind === "crack" ? input.rgb(0.85, 0.08, 0.08) : input.rgb(0.1, 0.35, 0.75) });
    }
  }
  for (const line of input.draft.sectionLines.filter((item) => item.levelId === input.level.id)) {
    const dx = (line.x1 - 72) / 756 * input.draft.industrialSettings.planWidthMeters;
    const dy = (line.y1 - 72) / 455 * input.draft.industrialSettings.planHeightMeters;
    const ex = (line.x2 - 72) / 756 * input.draft.industrialSettings.planWidthMeters;
    const ey = (line.y2 - 72) / 455 * input.draft.industrialSettings.planHeightMeters;
    input.page.drawLine({ start: { x: input.transform.x(dx), y: input.transform.y(dy) }, end: { x: input.transform.x(ex), y: input.transform.y(ey) }, thickness: 2, dashArray: [8, 4], color: input.rgb(0.55, 0.12, 0.55) });
  }
}

function drawSectionPage(input: { page: PDFPage; line: SurveySectionLine; level: SurveyBuildingLevel; draft: PropertySurveyDraft; project: PropertySurveyProject | null; revisionNumber: number; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const projectName = input.project?.name || "Projekt nelkuli felmeres";
  drawHeader({ page: input.page, title: `${input.line.serial} METSZET - ${input.line.name}`, subtitle: `${projectName} / ${input.draft.surveyName} / ${input.level.name}`, font: input.font, bold: input.bold, rgb: input.rgb });
  const left = 65;
  const right = input.page.getWidth() - 65;
  const floorY = 252;
  const maxHeight = Math.max(1, input.line.ridgeHeightMeters, input.line.eavesHeightMeters, input.line.clearHeightMeters, input.line.topSurfaceHeightMeters);
  const scale = Math.min(72, (input.page.getHeight() - floorY - 105) / maxHeight);
  const eavesY = floorY + input.line.eavesHeightMeters * scale;
  const ridgeY = floorY + input.line.ridgeHeightMeters * scale;
  const clearY = floorY + input.line.clearHeightMeters * scale;
  const leftKneeY = floorY + input.line.leftKneeWallHeightMeters * scale;
  const rightKneeY = floorY + input.line.rightKneeWallHeightMeters * scale;
  const center = (left + right) / 2;
  const floorSlabThickness = Math.max(3, input.line.floorSlabThicknessCm / 100 * scale);
  const ceilingSlabThickness = Math.max(3, input.line.ceilingSlabThicknessCm / 100 * scale);
  const rooms = getLevelRooms(input.draft, input.level.id);
  const wallSegments = input.draft.wallSegments.filter((segment) => segment.levelId === input.level.id && rooms.some((room) => room.id === segment.roomId));
  const internalWalls = getSurveySectionInternalWallPositions({ line: input.line, rooms, wallSegments });
  const industrialMode = input.draft.surveyMode === "Épület- és csarnokfelmérés" || input.draft.surveyMode === "Térbeton- és burkolatfelmérés";
  const spanMeters = getSurveySectionLengthMeters({ line: input.line, industrialMode, industrialSettings: input.draft.industrialSettings });

  input.page.drawRectangle({ x: left, y: floorY - floorSlabThickness, width: right - left, height: floorSlabThickness, color: input.rgb(0.8, 0.98, 0.95), borderColor: input.rgb(0.05, 0.46, 0.43), borderWidth: 0.8 });
  input.page.drawRectangle({ x: left, y: clearY, width: right - left, height: ceilingSlabThickness, color: input.rgb(0.8, 0.98, 0.95), borderColor: input.rgb(0.05, 0.46, 0.43), borderWidth: 0.8 });
  input.page.drawLine({ start: { x: left - 15, y: floorY }, end: { x: right + 15, y: floorY }, thickness: 2.6, color: input.rgb(0.04, 0.18, 0.2) });

  for (const wall of internalWalls) {
    const x = left + wall.ratio * (right - left);
    const wallWidth = Math.max(2.6, wall.thicknessCm / 100 / Math.max(0.1, spanMeters) * (right - left));
    input.page.drawRectangle({ x: x - wallWidth / 2, y: floorY, width: wallWidth, height: Math.max(1, clearY - floorY), color: input.rgb(0.8, 0.84, 0.88), borderColor: input.rgb(0.28, 0.34, 0.4), borderWidth: 0.55 });
  }

  input.page.drawLine({ start: { x: left, y: floorY }, end: { x: left, y: input.line.roofShape === "gable" ? leftKneeY : eavesY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
  input.page.drawLine({ start: { x: right, y: floorY }, end: { x: right, y: input.line.roofShape === "gable" ? rightKneeY : eavesY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
  if (input.line.roofShape === "flat") input.page.drawLine({ start: { x: left, y: eavesY }, end: { x: right, y: eavesY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
  else if (input.line.roofShape === "singleSlope") input.page.drawLine({ start: { x: left, y: eavesY }, end: { x: right, y: ridgeY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
  else {
    input.page.drawLine({ start: { x: left, y: leftKneeY }, end: { x: center, y: ridgeY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
    input.page.drawLine({ start: { x: center, y: ridgeY }, end: { x: right, y: rightKneeY }, thickness: 4, color: input.rgb(0.04, 0.18, 0.2) });
  }
  input.page.drawLine({ start: { x: left, y: clearY }, end: { x: right, y: clearY }, thickness: 1.2, dashArray: [6, 4], color: input.rgb(0.02, 0.55, 0.61) });
  input.page.drawText(safePdfText(`Padloszerkezet ${input.line.floorSlabThicknessCm.toFixed(0)} cm`), { x: left + 4, y: floorY - floorSlabThickness - 11, size: 6.5, font: input.bold, color: input.rgb(0.05, 0.46, 0.43) });
  input.page.drawText(safePdfText(`Fodem ${input.line.ceilingSlabThicknessCm.toFixed(0)} cm`), { x: left + 4, y: clearY + ceilingSlabThickness + 4, size: 6.5, font: input.bold, color: input.rgb(0.05, 0.46, 0.43) });
  input.page.drawText(safePdfText(`Belso falmetszes: ${internalWalls.length} db`), { x: right - 95, y: floorY - floorSlabThickness - 11, size: 6.5, font: input.bold, color: input.rgb(0.28, 0.34, 0.4) });

  const data = [
    ["Metszet tipusa", surveySectionKindLabels[input.line.kind]],
    ["Tetoforma", surveyRoofShapeLabels[input.line.roofShape]],
    ["Metszeti hossz", `${spanMeters.toFixed(2)} m`],
    ["Padloszint", `${input.line.floorElevationMeters.toFixed(2)} m`],
    ["Belmagassag", `${input.line.clearHeightMeters.toFixed(2)} m`],
    ["Padlo / fodem", `${input.line.floorSlabThicknessCm.toFixed(0)} / ${input.line.ceilingSlabThicknessCm.toFixed(0)} cm`],
    ["Belso falmetszes", `${internalWalls.length} db`],
    ["Eresz / fal felso sik", `${input.line.eavesHeightMeters.toFixed(2)} m`],
    ["Gerincmagassag", `${input.line.ridgeHeightMeters.toFixed(2)} m`],
    ["Bal / jobb terdfal", `${input.line.leftKneeWallHeightMeters.toFixed(2)} / ${input.line.rightKneeWallHeightMeters.toFixed(2)} m`],
    ["Bal / jobb tetohajlas", `${input.line.leftRoofPitchDegrees} / ${input.line.rightRoofPitchDegrees} fok`],
    ["Tetoablak", `${input.line.roofWindowCount} db, ${input.line.roofWindowWidthMeters.toFixed(2)} x ${input.line.roofWindowHeightMeters.toFixed(2)} m`],
  ];
  const sectionColumns = [data.slice(0, 6), data.slice(6)];
  sectionColumns.forEach((column, columnIndex) => {
    const labelX = columnIndex === 0 ? 55 : 305;
    const valueX = columnIndex === 0 ? 145 : 405;
    let rowY = 225;
    for (const [label, value] of column) {
      input.page.drawText(safePdfText(label), { x: labelX, y: rowY, size: 7, font: input.bold, color: input.rgb(0.25, 0.32, 0.4), maxWidth: 88 });
      input.page.drawText(safePdfText(value), { x: valueX, y: rowY, size: 7, font: input.font, color: input.rgb(0.04, 0.18, 0.2), maxWidth: columnIndex === 0 ? 145 : 130 });
      rowY -= 14;
    }
  });
  if (input.line.note) drawTextBlock({ page: input.page, text: `Megjegyzes: ${input.line.note}`, x: 55, y: 132, width: input.page.getWidth() - 110, font: input.font, size: 6.8, color: input.rgb(0.25, 0.32, 0.4), lineHeight: 8, maxLines: 2 });

  drawSurveySheetFrame({ page: input.page, rgb: input.rgb });
  drawTitleBlock({
    page: input.page,
    projectName,
    clientName: input.project?.clientName || "Nincs megadva",
    surveyName: input.draft.surveyName,
    surveyType: `${input.draft.surveyMode} / ${input.line.serial} metszet`,
    levelName: input.level.name,
    revisionLabel: `v${String(input.revisionNumber).padStart(3, "0")}`,
    location: getSurveySheetLocation(input.draft, input.project),
    surveyDate: input.draft.property.surveyDate || "Nincs megadva",
    creator: input.draft.exportDetails.engineerName || input.draft.exportDetails.companyName || "Nincs megadva",
    paperSize: "A4",
    orientation: "portrait",
    scale: input.draft.planSheet.scaleDenominator,
    font: input.font,
    bold: input.bold,
    rgb: input.rgb,
  });
}

function drawCover(input: { pdf: PDFDocument; draft: PropertySurveyDraft; project: PropertySurveyProject | null; energySummary: SurveyEnergySummary; revisionNumber: number; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
  const dark = input.rgb(0.04, 0.18, 0.2);
  const cyan = input.rgb(0.02, 0.55, 0.61);
  page.drawRectangle({ x: 0, y: page.getHeight() - 150, width: page.getWidth(), height: 150, color: dark });
  page.drawText("DIMPRO", { x: 45, y: page.getHeight() - 70, size: 30, font: input.bold, color: input.rgb(0.58, 0.96, 0.89) });
  page.drawText("FELMERESI DOKUMENTUMCSOMAG", { x: 45, y: page.getHeight() - 102, size: 13, font: input.bold, color: input.rgb(1, 1, 1) });
  page.drawText("v0.8.0 - terepi energetikai es felujitasi csomag", { x: 45, y: page.getHeight() - 121, size: 8.5, font: input.font, color: input.rgb(0.78, 0.89, 0.9) });
  drawSurveyNorthMarkPdf({ page, centerX: page.getWidth() - 82, centerY: page.getHeight() - 78, northAngle: input.draft.northAngle, bold: input.bold, rgb: input.rgb });
  let y = page.getHeight() - 205;
  page.drawText(safePdfText(input.draft.surveyName), { x: 45, y, size: 20, font: input.bold, color: dark, maxWidth: page.getWidth() - 90 });
  y -= 38;
  const rows = [
    ["Projekt", input.project?.name || "Projekt nelkuli felmeres"],
    ["Projektkod", input.project?.code || "-"],
    ["Megrendelo", input.project?.clientName || "-"],
    ["Rajzverzio", `v${String(input.revisionNumber).padStart(3, "0")}`],
    ["Ingatlan", input.draft.property.address || "-"],
    ["Helyrajzi szam", input.draft.property.parcelNumber || "-"],
    ["Felmersi mod", input.draft.surveyMode],
    ["Felmérés datuma", input.draft.property.surveyDate || "-"],
    ["Szintek", `${input.draft.levels.length} db`],
    ["Metszetek", `${input.draft.sectionLines.length} db`],
  ];
  for (const [label, value] of rows) {
    page.drawText(safePdfText(label), { x: 45, y, size: 8, font: input.bold, color: input.rgb(0.33, 0.4, 0.47) });
    page.drawText(safePdfText(value), { x: 160, y, size: 8.5, font: input.font, color: dark, maxWidth: page.getWidth() - 205 });
    page.drawLine({ start: { x: 45, y: y - 5 }, end: { x: page.getWidth() - 45, y: y - 5 }, thickness: 0.4, color: input.rgb(0.82, 0.86, 0.89) });
    y -= 25;
  }
  y -= 12;
  page.drawText("Energetikai feluletosszesito", { x: 45, y, size: 11, font: input.bold, color: cyan });
  y -= 23;
  const totals = input.energySummary.totals;
  const summaryRows = [
    ["Brutto hatarolo falfelulet", `${totals.grossWallAreaSquareMeters.toFixed(2)} m2`],
    ["Nyilaszaro felulet", `${totals.openingAreaSquareMeters.toFixed(2)} m2`],
    ["Netto hatarolo falfelulet", `${totals.netWallAreaSquareMeters.toFixed(2)} m2`],
    ["Padlo / fodem felulet", `${totals.floorAreaSquareMeters.toFixed(2)} / ${totals.ceilingAreaSquareMeters.toFixed(2)} m2`],
  ];
  for (const [label, value] of summaryRows) {
    page.drawText(safePdfText(label), { x: 45, y, size: 8, font: input.font, color: dark });
    page.drawText(safePdfText(value), { x: page.getWidth() - 175, y, size: 8, font: input.bold, color: dark });
    y -= 18;
  }
  if (input.draft.exportDetails.coverNote) drawTextBlock({ page, text: input.draft.exportDetails.coverNote, x: 45, y: y - 8, width: page.getWidth() - 90, font: input.font, size: 8, color: input.rgb(0.3, 0.38, 0.46), maxLines: 6 });
  page.drawText("A dokumentum helyszini felmeresi adatokat tartalmaz; vegleges szakmai felhasznalas elott ellenorzendo.", { x: 45, y: 35, size: 7, font: input.font, color: input.rgb(0.4, 0.45, 0.5), maxWidth: page.getWidth() - 90 });
}

function drawZoneSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; zoneSet: EnergyZoneSetResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const rowsPerPage = 9;
  const zonePages = Math.max(1, Math.ceil(input.zoneSet.zones.length / rowsPerPage));
  for (let pageIndex = 0; pageIndex < zonePages; pageIndex += 1) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "ENERGETIKAI ZONAOSSZESITO", subtitle: `${input.draft.surveyName} · ${pageIndex + 1}/${zonePages}`, font: input.font, bold: input.bold, rgb: input.rgb });
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    const cyan = input.rgb(0.02, 0.55, 0.61);
    let y = page.getHeight() - 82;
    page.drawText(safePdfText(`Zonak: ${input.zoneSet.totals.zoneCount} · futott helyisegek: ${input.zoneSet.totals.assignedConditionedRoomCount} · futetlen terek: ${input.zoneSet.totals.unheatedSpaceCount}`), { x: 45, y, size: 8, font: input.bold, color: cyan });
    y -= 18;
    page.drawText(safePdfText(`Futott terulet: ${input.zoneSet.totals.conditionedFloorAreaSquareMeters.toFixed(2)} m2 · terfogat: ${input.zoneSet.totals.conditionedVolumeCubicMeters.toFixed(2)} m3 · futetlen hatar: ${input.zoneSet.totals.unheatedBoundaryAreaSquareMeters.toFixed(2)} m2`), { x: 45, y, size: 7.2, font: input.font, color: dark });
    y -= 23;
    for (const zone of input.zoneSet.zones.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)) {
      page.drawRectangle({ x: 45, y: y - 49, width: page.getWidth() - 90, height: 58, color: input.rgb(0.96, 0.99, 0.99), borderColor: input.rgb(0.55, 0.78, 0.8), borderWidth: 0.5 });
      page.drawText(safePdfText(zone.zoneName), { x: 55, y, size: 9, font: input.bold, color: dark, maxWidth: 245 });
      page.drawText(safePdfText(`${zone.roomCount} helyiseg · ${zone.floorAreaSquareMeters.toFixed(2)} m2 · ${zone.volumeCubicMeters.toFixed(2)} m3`), { x: 310, y, size: 7.2, font: input.bold, color: cyan, maxWidth: 235 });
      y -= 14;
      page.drawText(safePdfText(`Profil: ${zone.usageProfile} · szolgaltatas: ${zone.serviceLevel} · futes: ${zone.heatingSetpointC.toFixed(1)} C${zone.coolingSetpointC === null ? "" : ` · hutes: ${zone.coolingSetpointC.toFixed(1)} C`}`), { x: 55, y, size: 6.6, font: input.font, color: muted, maxWidth: page.getWidth() - 110 });
      y -= 13;
      page.drawText(safePdfText(`Kulso fal ${zone.externalWallAreaSquareMeters.toFixed(2)} m2 · futetlen hatar ${zone.unheatedBoundaryAreaSquareMeters.toFixed(2)} m2 · zonakozi hatar ${zone.interzoneBoundaryAreaSquareMeters.toFixed(2)} m2 · talajfal ${zone.groundWallAreaSquareMeters.toFixed(2)} m2`), { x: 55, y, size: 6.6, font: input.font, color: dark, maxWidth: page.getWidth() - 110 });
      y -= 31;
    }
    page.drawText(safePdfText(`Motor: ${input.zoneSet.engineVersion} · Forras: ${input.zoneSet.sourceReferenceId} · Ellenorzes: ${input.zoneSet.sourceCheckedAt}`), { x: 45, y: 45, size: 6.5, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
    page.drawText("A zonahatarok es hasznalati profilok szakmai ellenorzest igenyelnek.", { x: 45, y: 32, size: 6.5, font: input.bold, color: input.rgb(0.75, 0.43, 0.05), maxWidth: page.getWidth() - 90 });
  }

  if (input.zoneSet.unheatedSpaces.length || input.zoneSet.connections.length) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "FUTETLEN TEREK ES ZONAKAPCSOLATOK", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    let y = page.getHeight() - 82;
    for (const space of input.zoneSet.unheatedSpaces.slice(0, 10)) {
      page.drawText(safePdfText(space.unheatedSpaceName), { x: 45, y, size: 8.5, font: input.bold, color: dark, maxWidth: 250 });
      page.drawText(safePdfText(`${space.roomCount} helyiseg · ${space.floorAreaSquareMeters.toFixed(2)} m2 · ${space.volumeCubicMeters.toFixed(2)} m3`), { x: 310, y, size: 7.2, font: input.font, color: dark, maxWidth: 230 });
      y -= 13;
      page.drawText(safePdfText(`Tipus: ${space.type} · szellozes: ${space.ventilation} · kapcsolodo hatar: ${space.connectedBoundaryAreaSquareMeters.toFixed(2)} m2 · homerseklet: ${space.designTemperatureC === null ? "nincs szamitva" : `${space.designTemperatureC.toFixed(1)} C`}`), { x: 45, y, size: 6.6, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
      y -= 18;
      page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.25, color: input.rgb(0.82, 0.86, 0.89) });
      y -= 14;
    }
    if (input.zoneSet.connections.length) {
      y -= 4;
      page.drawText("ZONAKAPCSOLATOK", { x: 45, y, size: 9, font: input.bold, color: input.rgb(0.02, 0.55, 0.61) });
      y -= 18;
      for (const connection of input.zoneSet.connections.slice(0, 14)) {
        const target = connection.targetZoneName || connection.targetUnheatedSpaceName || "ismeretlen cel";
        page.drawText(safePdfText(`${connection.sourceZoneName} -> ${target}`), { x: 45, y, size: 7.2, font: input.bold, color: dark, maxWidth: 300 });
        page.drawText(safePdfText(`${connection.netAreaSquareMeters.toFixed(2)} m2 · ${connection.sourceRoomName} / ${connection.adjacentRoomName}`), { x: 350, y, size: 6.6, font: input.font, color: muted, maxWidth: 195 });
        y -= 15;
      }
    }
    page.drawText(safePdfText(`Zonakozi hatar: ${input.zoneSet.totals.interzoneBoundaryAreaSquareMeters.toFixed(2)} m2 · futetlen hatar: ${input.zoneSet.totals.unheatedBoundaryAreaSquareMeters.toFixed(2)} m2`), { x: 45, y: 32, size: 6.5, font: input.bold, color: dark, maxWidth: page.getWidth() - 90 });
  }
}

function drawOpeningThermalSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; openingSet: EnergyOpeningSetResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const rowsPerPage = 12;
  const pageCount = Math.max(1, Math.ceil(input.openingSet.openings.length / rowsPerPage));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "NYILASZARO HOTECNIKAI OSSZESITO", subtitle: `${input.draft.surveyName} · ${pageIndex + 1}/${pageCount}`, font: input.font, bold: input.bold, rgb: input.rgb });
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    let y = page.getHeight() - 82;
    page.drawText(safePdfText(`Nyilaszarok: ${input.openingSet.totals.openingCount} · felulet: ${input.openingSet.totals.totalOpeningAreaSquareMeters.toFixed(2)} m2 · teljes H: ${input.openingSet.totals.totalHeatLossCoefficientWK.toFixed(3)} W/K`), { x: 45, y, size: 8, font: input.bold, color: input.rgb(0.02, 0.55, 0.61), maxWidth: page.getWidth() - 90 });
    y -= 24;
    const headers = [[45, "Nyilaszaró"], [225, "Meret"], [300, "Felulet"], [355, "Uw"], [405, "Kov."], [450, "Beep. H"], [510, "Allapot"]] as const;
    for (const [x, label] of headers) page.drawText(safePdfText(label), { x, y, size: 6.7, font: input.bold, color: muted });
    y -= 11;
    page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.6, color: input.rgb(0.55, 0.65, 0.68) });
    y -= 15;
    for (const result of input.openingSet.openings.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)) {
      const status = result.blocked ? "BLOKKOLT" : result.compliance === "compliant" ? "MEGFELEL" : result.compliance === "notCompliant" ? "NEM FELEL" : result.compliance === "notApplicableSmallArea" ? "KUSZOB ALATT" : "NEM VIZSGALT";
      const statusColor = result.blocked || result.compliance === "notCompliant" ? input.rgb(0.78, 0.12, 0.18) : result.compliance === "compliant" ? input.rgb(0.04, 0.52, 0.35) : input.rgb(0.75, 0.43, 0.05);
      page.drawText(safePdfText(result.openingName), { x: 45, y, size: 7.3, font: input.bold, color: dark, maxWidth: 170 });
      page.drawText(`${result.widthMeters.toFixed(2)}x${result.heightMeters.toFixed(2)}`, { x: 225, y, size: 7, font: input.font, color: dark });
      page.drawText(result.areaSquareMeters.toFixed(2), { x: 300, y, size: 7, font: input.font, color: dark });
      page.drawText(result.effectiveUwWm2K === null ? "-" : result.effectiveUwWm2K.toFixed(3), { x: 355, y, size: 7, font: input.font, color: dark });
      page.drawText(result.requirementMaximumUwWm2K === null ? "-" : result.requirementMaximumUwWm2K.toFixed(2), { x: 405, y, size: 7, font: input.font, color: dark });
      page.drawText(result.installationHeatLossCoefficientWK.toFixed(3), { x: 450, y, size: 7, font: input.font, color: dark });
      page.drawText(status, { x: 510, y, size: 6.2, font: input.bold, color: statusColor, maxWidth: 55 });
      y -= 12;
      const detail = input.draft.energyOpeningWorkspace.openingDetails[result.openingId];
      const source = detail?.calculationMode === "declared" ? detail.declaredSourceReference : detail?.glazingEdgeSourceReference;
      page.drawText(safePdfText(`mod: ${result.calculationMode} / tipus: ${result.requirementType} / Hny: ${result.openingHeatLossCoefficientWK === null ? "-" : result.openingHeatLossCoefficientWK.toFixed(3)} W/K / forras: ${source || "nincs"}`), { x: 45, y, size: 5.9, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
      y -= 11;
      page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.25, color: input.rgb(0.82, 0.86, 0.89) });
      y -= 10;
    }
    page.drawText(safePdfText(`Motor: ${input.openingSet.engineVersion} · Uw: ${input.openingSet.openingFormulaSourceReferenceId} · Kovetelmeny: ${input.openingSet.requirementSourceReferenceId}`), { x: 45, y: 45, size: 6.2, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
    page.drawText("Az arnyekolo tobblet hoszigetelo hatasa nem resze az elemi Uw-kovetelmeny vizsgalatanak.", { x: 45, y: 32, size: 6.2, font: input.bold, color: input.rgb(0.75, 0.43, 0.05), maxWidth: page.getWidth() - 90 });
  }

  if (input.openingSet.thermalBridges.length) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "LINEARIS ES PONTSZERU HOHIDAK", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    let y = page.getHeight() - 82;
    page.drawText(safePdfText(`Kulon hohid H: ${input.openingSet.totals.otherThermalBridgeHeatLossCoefficientWK.toFixed(3)} W/K · beepitesi perem H: ${input.openingSet.totals.installationHeatLossCoefficientWK.toFixed(3)} W/K`), { x: 45, y, size: 8, font: input.bold, color: input.rgb(0.02, 0.55, 0.61) });
    y -= 24;
    for (const result of input.openingSet.thermalBridges.slice(0, 24)) {
      const source = input.draft.energyOpeningWorkspace.thermalBridges.find((item) => item.id === result.id);
      page.drawText(safePdfText(result.name), { x: 45, y, size: 7.5, font: input.bold, color: dark, maxWidth: 220 });
      page.drawText(safePdfText(`${result.kind === "linear" ? "LINEARIS" : "PONTSZERU"} · ${result.category}`), { x: 275, y, size: 6.7, font: input.font, color: muted, maxWidth: 150 });
      page.drawText(result.heatLossCoefficientWK === null ? "-" : `${result.heatLossCoefficientWK.toFixed(3)} W/K`, { x: 445, y, size: 7, font: input.bold, color: result.blocked ? input.rgb(0.78, 0.12, 0.18) : dark });
      y -= 12;
      page.drawText(safePdfText(`forras: ${source?.sourceReference || "nincs"} / kapcsolat: ${source?.openingId || source?.wallSegmentId || "altalanos"}`), { x: 45, y, size: 6, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
      y -= 12;
      page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.25, color: input.rgb(0.82, 0.86, 0.89) });
      y -= 11;
    }
    page.drawText(safePdfText(`Hohidforras: ${input.openingSet.thermalBridgeSourceReferenceId} · Ellenorzes: ${input.openingSet.sourceCheckedAt}`), { x: 45, y: 32, size: 6.2, font: input.bold, color: muted, maxWidth: page.getWidth() - 90 });
  }
}

function drawDemandAndSystemsSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; demandSet: EnergyDemandSetResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const dark = input.rgb(0.04, 0.18, 0.2);
  const muted = input.rgb(0.35, 0.42, 0.48);
  const cyan = input.rgb(0.02, 0.55, 0.61);
  const red = input.rgb(0.78, 0.12, 0.18);
  const green = input.rgb(0.04, 0.52, 0.35);
  const amber = input.rgb(0.75, 0.43, 0.05);

  if (!input.demandSet.enabled) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "ZONATERHELESI SZAMITAS", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
    page.drawRectangle({ x: 45, y: page.getHeight() - 230, width: page.getWidth() - 90, height: 105, borderColor: input.rgb(0.55, 0.65, 0.68), borderWidth: 1 });
    page.drawText("A ZONATERHELESI RETEG NINCS BEKAPCSOLVA", { x: 65, y: page.getHeight() - 170, size: 12, font: input.bold, color: amber, maxWidth: page.getWidth() - 130 });
    page.drawText("Nem keszult meretezesi futesi terheles vagy rendszerkapacitas-ellenorzes.", { x: 65, y: page.getHeight() - 196, size: 8, font: input.font, color: dark, maxWidth: page.getWidth() - 130 });
    page.drawText("Ez nem nulla energiaigenyt jelent, hanem kikapcsolt szamitasi allapotot.", { x: 65, y: page.getHeight() - 215, size: 8, font: input.bold, color: red, maxWidth: page.getWidth() - 130 });
    page.drawText(safePdfText(`Motor: ${input.demandSet.engineVersion} · ${input.demandSet.limitation}`), { x: 45, y: 40, size: 6.2, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
    return;
  }

  const rowsPerPage = 6;
  const pageCount = Math.max(1, Math.ceil(input.demandSet.zones.length / rowsPerPage));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "ZONANKENTI MERETEZESI FUTESI TERHELES", subtitle: `${input.draft.surveyName} · ${pageIndex + 1}/${pageCount}`, font: input.font, bold: input.bold, rgb: input.rgb });
    let y = page.getHeight() - 82;
    const totals = input.demandSet.totals;
    page.drawText(safePdfText(`Htranszmisszio: ${totals.transmissionHeatLossCoefficientWK.toFixed(3)} W/K · Hszellozes: ${totals.ventilationHeatLossCoefficientWK.toFixed(3)} W/K · Hosszes: ${totals.totalHeatLossCoefficientWK.toFixed(3)} W/K`), { x: 45, y, size: 7.4, font: input.bold, color: cyan, maxWidth: page.getWidth() - 90 });
    y -= 17;
    page.drawText(safePdfText(`Meretezesi futesi igeny: ${totals.designHeatingPowerKw === null ? "nincs szamitva" : `${totals.designHeatingPowerKw.toFixed(3)} kW`} · kulso homerseklet: ${input.draft.energyDemandWorkspace.externalDesignTemperatureC ?? "-"} C`), { x: 45, y, size: 7.2, font: input.font, color: dark, maxWidth: page.getWidth() - 90 });
    y -= 26;

    for (const zone of input.demandSet.zones.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)) {
      const status = zone.blocked ? "BLOKKOLT" : zone.systemCoverageStatus === "sufficient" ? "KAPACITAS MEGFELELO" : zone.systemCoverageStatus === "insufficient" ? "KAPACITAS KEVES" : zone.systemCoverageStatus === "unknownCapacity" ? "KAPACITAS ISMERETLEN" : zone.systemCoverageStatus === "missing" ? "RENDSZER HIANYZIK" : "SZAMITHATO";
      const statusColor = zone.blocked || zone.systemCoverageStatus === "insufficient" ? red : zone.systemCoverageStatus === "sufficient" ? green : amber;
      page.drawRectangle({ x: 45, y: y - 74, width: page.getWidth() - 90, height: 82, borderColor: input.rgb(0.75, 0.8, 0.84), borderWidth: 0.6 });
      page.drawText(safePdfText(zone.zoneName), { x: 57, y: y - 12, size: 9, font: input.bold, color: dark, maxWidth: 225 });
      page.drawText(status, { x: page.getWidth() - 190, y: y - 12, size: 6.4, font: input.bold, color: statusColor, maxWidth: 135 });
      page.drawText(safePdfText(`A: ${zone.floorAreaSquareMeters.toFixed(2)} m2 · V: ${zone.volumeCubicMeters.toFixed(2)} m3 · Tint: ${zone.heatingSetpointC.toFixed(1)} C · DeltaT: ${zone.designTemperatureDifferenceK === null ? "-" : zone.designTemperatureDifferenceK.toFixed(1)} K`), { x: 57, y: y - 29, size: 6.7, font: input.font, color: muted, maxWidth: page.getWidth() - 115 });
      page.drawText(safePdfText(`Fal ${zone.wallHeatLossCoefficientWK.toFixed(3)} · also ${zone.lowerBoundaryHeatLossCoefficientWK.toFixed(3)} · felso ${zone.upperBoundaryHeatLossCoefficientWK.toFixed(3)} · nyilas ${zone.openingHeatLossCoefficientWK.toFixed(3)} W/K`), { x: 57, y: y - 44, size: 6.7, font: input.font, color: dark, maxWidth: page.getWidth() - 115 });
      page.drawText(safePdfText(`Beepitesi perem ${zone.installationHeatLossCoefficientWK.toFixed(3)} · hohid ${zone.thermalBridgeHeatLossCoefficientWK.toFixed(3)} · szellozes ${zone.ventilationHeatLossCoefficientWK.toFixed(3)} W/K`), { x: 57, y: y - 58, size: 6.7, font: input.font, color: dark, maxWidth: page.getWidth() - 115 });
      page.drawText(safePdfText(`Hosszes ${zone.totalHeatLossCoefficientWK.toFixed(3)} W/K · Phi ${zone.designHeatingPowerKw === null ? "-" : zone.designHeatingPowerKw.toFixed(3)} kW · ${zone.designHeatingPowerPerAreaWm2 === null ? "-" : zone.designHeatingPowerPerAreaWm2.toFixed(1)} W/m2 · kapacitas ${zone.allocatedHeatingCapacityKw === null ? "-" : zone.allocatedHeatingCapacityKw.toFixed(3)} kW`), { x: 57, y: y - 72, size: 6.7, font: input.bold, color: dark, maxWidth: page.getWidth() - 115 });
      y -= 94;
    }
    page.drawText(safePdfText(`Motor: ${input.demandSet.engineVersion} · Forras: ${input.demandSet.sourceReferenceIds.join(" / ")} · Ellenorzes: ${input.demandSet.sourceCheckedAt}`), { x: 45, y: 44, size: 6, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
    page.drawText("Meretezesi futesi terheles-elokeszites; nem havi vagy eves tanusitasi energiaigeny.", { x: 45, y: 31, size: 6.2, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
  }

  const systemsPage = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
  drawHeader({ page: systemsPage, title: "GEPESZETI RENDSZERKAPCSOLATOK", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
  let systemY = systemsPage.getHeight() - 82;
  systemsPage.drawText(safePdfText(`Rendszerek: ${input.demandSet.systems.length} · kapcsolt kapacitas: ${input.demandSet.totals.allocatedHeatingCapacityKw.toFixed(3)} kW · megfelelo zona: ${input.demandSet.totals.sufficientZoneCount} · elegtelen: ${input.demandSet.totals.insufficientZoneCount} · hianyzo rendszer: ${input.demandSet.totals.missingSystemZoneCount}`), { x: 45, y: systemY, size: 7.2, font: input.bold, color: cyan, maxWidth: systemsPage.getWidth() - 90 });
  systemY -= 28;
  if (!input.demandSet.systems.length) {
    systemsPage.drawText("Nincs energetikai rendszer rogzitve. A zonaterheles ettol meg szamithato, a kapacitas-lefedettseg azonban ismeretlen.", { x: 45, y: systemY, size: 8, font: input.bold, color: amber, maxWidth: systemsPage.getWidth() - 90 });
  } else {
    for (const system of input.demandSet.systems.slice(0, 16)) {
      const source = input.draft.energyDemandWorkspace.systems.find((item) => item.id === system.systemId);
      const zoneNames = system.servedZoneIds.map((zoneId) => input.demandSet.zones.find((zone) => zone.zoneId === zoneId)?.zoneName || zoneId).join(", ");
      const deviceNames = system.linkedSurveyDeviceIds.map((deviceId) => input.draft.mechanicalDevices.find((device) => device.id === deviceId)?.name || deviceId).join(", ");
      systemsPage.drawText(safePdfText(system.systemName), { x: 45, y: systemY, size: 8.2, font: input.bold, color: system.blocked ? red : dark, maxWidth: 240 });
      systemsPage.drawText(safePdfText(`${system.service} / ${system.type}`), { x: 300, y: systemY, size: 6.5, font: input.font, color: muted, maxWidth: 100 });
      systemsPage.drawText(safePdfText(`nevleges ${system.nominalCapacityKw === null ? "-" : system.nominalCapacityKw.toFixed(3)} kW · kiosztott ${system.allocatedCapacityKw.toFixed(3)} kW · maradek ${system.remainingCapacityKw === null ? "-" : system.remainingCapacityKw.toFixed(3)} kW`), { x: 410, y: systemY, size: 6.5, font: input.bold, color: dark, maxWidth: 145 });
      systemY -= 14;
      systemsPage.drawText(safePdfText(`Zonak: ${zoneNames || "nincs"}`), { x: 55, y: systemY, size: 6.2, font: input.font, color: dark, maxWidth: systemsPage.getWidth() - 110 });
      systemY -= 12;
      const allocationText = Object.entries(source?.zoneCapacityAllocationsKw || {}).map(([zoneId, capacity]) => `${input.demandSet.zones.find((zone) => zone.zoneId === zoneId)?.zoneName || zoneId}: ${Number(capacity).toFixed(3)} kW`).join(" · ");
      systemsPage.drawText(safePdfText(`Kiosztas: ${allocationText || "nincs kulon megadva"}`), { x: 55, y: systemY, size: 6.2, font: input.bold, color: dark, maxWidth: systemsPage.getWidth() - 110 });
      systemY -= 12;
      systemsPage.drawText(safePdfText(`Helyszini berendezesek: ${deviceNames || "nincs"}`), { x: 55, y: systemY, size: 6.2, font: input.font, color: dark, maxWidth: systemsPage.getWidth() - 110 });
      systemY -= 12;
      systemsPage.drawText(safePdfText(`Forras: ${source?.sourceReference || "nincs"}`), { x: 55, y: systemY, size: 6.2, font: input.font, color: muted, maxWidth: systemsPage.getWidth() - 110 });
      systemY -= 13;
      systemsPage.drawLine({ start: { x: 45, y: systemY }, end: { x: systemsPage.getWidth() - 45, y: systemY }, thickness: 0.3, color: input.rgb(0.82, 0.86, 0.89) });
      systemY -= 14;
      if (systemY < 75) break;
    }
  }
  systemsPage.drawText("A kapacitas-ellenorzes a rogzitett nevleges es zonara kiosztott adatokra epul; helyszini es tervezoi ellenorzes szukseges.", { x: 45, y: 32, size: 6.2, font: input.bold, color: amber, maxWidth: systemsPage.getWidth() - 90 });
}



function drawRenovationComparisonSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; comparison: EnergyRenovationComparisonSetResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
  drawHeader({ page, title: "MEGLEVO ES TERVEZETT ALLAPOT OSSZEHASONLITASA", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
  const dark = input.rgb(0.04, 0.18, 0.2);
  const muted = input.rgb(0.35, 0.42, 0.48);
  const cyan = input.rgb(0.02, 0.55, 0.61);
  const green = input.rgb(0.05, 0.55, 0.3);
  const amber = input.rgb(0.75, 0.43, 0.05);
  const red = input.rgb(0.78, 0.12, 0.18);
  let y = page.getHeight() - 82;
  page.drawText(safePdfText(`Valtozatok: ${input.comparison.totals.scenarioCount} · szamithato: ${input.comparison.totals.calculatedScenarioCount} · reszleges: ${input.comparison.totals.partialScenarioCount} · nem szamithato: ${input.comparison.totals.unavailableScenarioCount} · blokkolt: ${input.comparison.totals.blockedScenarioCount}`), { x: 45, y, size: 7.2, font: input.bold, color: cyan, maxWidth: page.getWidth() - 90 });
  y -= 25;
  for (const scenario of input.comparison.scenarios.slice(0, 6)) {
    const status = scenario.calculationStatus === "baseline" ? "ALAPALLAPOT" : scenario.calculationStatus === "calculated" ? "SZAMITHATO" : scenario.calculationStatus === "partial" ? "RESZBEN SZAMITHATO" : scenario.calculationStatus === "blocked" ? "JAVITANDO" : "MEG NEM SZAMITHATO";
    const statusColor = scenario.calculationStatus === "calculated" || scenario.calculationStatus === "baseline" ? green : scenario.calculationStatus === "blocked" ? red : amber;
    page.drawRectangle({ x: 45, y: y - 89, width: page.getWidth() - 90, height: 98, color: input.rgb(0.97, 0.99, 0.99), borderColor: input.rgb(0.62, 0.76, 0.78), borderWidth: 0.5 });
    page.drawText(safePdfText(`${scenario.scenarioCode} · ${scenario.scenarioName}`), { x: 56, y, size: 9, font: input.bold, color: dark, maxWidth: 315 });
    page.drawText(status, { x: 390, y, size: 6.2, font: input.bold, color: statusColor, maxWidth: 155 });
    y -= 17;
    page.drawText(safePdfText(`Intezkedes: ${scenario.includedMeasureCount} · szamitott: ${scenario.calculatedMeasureCount} · reszleges: ${scenario.partialMeasureCount} · nem szamithato: ${scenario.unavailableMeasureCount}`), { x: 56, y, size: 6.4, font: input.font, color: muted, maxWidth: page.getWidth() - 112 });
    y -= 15;
    page.drawText(safePdfText(`Htr: ${scenario.baseline.transmissionHeatLossCoefficientWK === null ? "-" : scenario.baseline.transmissionHeatLossCoefficientWK.toFixed(3)} -> ${scenario.projected.transmissionHeatLossCoefficientWK === null ? "-" : scenario.projected.transmissionHeatLossCoefficientWK.toFixed(3)} W/K · valtozas: ${scenario.change.transmissionReductionPercent === null ? "-" : `${scenario.change.transmissionReductionPercent.toFixed(1)} %`}`), { x: 56, y, size: 6.5, font: input.bold, color: dark, maxWidth: page.getWidth() - 112 });
    y -= 15;
    page.drawText(safePdfText(`Hosszes: ${scenario.baseline.totalHeatLossCoefficientWK === null ? "-" : scenario.baseline.totalHeatLossCoefficientWK.toFixed(3)} -> ${scenario.projected.totalHeatLossCoefficientWK === null ? "-" : scenario.projected.totalHeatLossCoefficientWK.toFixed(3)} W/K · valtozas: ${scenario.change.totalHeatLossReductionPercent === null ? "-" : `${scenario.change.totalHeatLossReductionPercent.toFixed(1)} %`}`), { x: 56, y, size: 6.5, font: input.font, color: dark, maxWidth: page.getWidth() - 112 });
    y -= 15;
    page.drawText(safePdfText(`Futesi igeny: ${scenario.baseline.designHeatingPowerKw === null ? "-" : scenario.baseline.designHeatingPowerKw.toFixed(3)} -> ${scenario.projected.designHeatingPowerKw === null ? "-" : scenario.projected.designHeatingPowerKw.toFixed(3)} kW · valtozas: ${scenario.change.designHeatingPowerReductionPercent === null ? "-" : `${scenario.change.designHeatingPowerReductionPercent.toFixed(1)} %`}`), { x: 56, y, size: 6.5, font: input.bold, color: dark, maxWidth: page.getWidth() - 112 });
    y -= 15;
    page.drawText(safePdfText(`Kapacitas: ${scenario.projected.plannedHeatingCapacityKw === null ? "-" : `${scenario.projected.plannedHeatingCapacityKw.toFixed(3)} kW`} · ${scenario.projected.heatingCapacityStatus} · PV ${scenario.renewables.pvCapacityKwp === null ? "-" : `${scenario.renewables.pvCapacityKwp.toFixed(2)} kWp`} · akku ${scenario.renewables.batteryCapacityKwh === null ? "-" : `${scenario.renewables.batteryCapacityKwh.toFixed(2)} kWh`}`), { x: 56, y, size: 6.2, font: input.font, color: muted, maxWidth: page.getWidth() - 112 });
    y -= 34;
    if (y < 90) break;
  }
  page.drawText("A valtozas meretezesi hoveszteseg- es teljesitmeny-osszehasonlitas, nem eves energiamegtakaritas, koltseg vagy tanusitasi besorolas.", { x: 45, y: 32, size: 6.2, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
}

function drawRenovationSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const proposalScenarios = input.draft.energyRenovationWorkspace.scenarios.filter((scenario) => scenario.kind === "proposal");
  const measures = proposalScenarios.flatMap((scenario) => scenario.measures.filter((measure) => measure.included).map((measure) => ({ scenario, measure })));
  const rowsPerPage = 8;
  const pageCount = Math.max(1, Math.ceil(measures.length / rowsPerPage));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "HELYSZINI FELUJITASI JAVASLATOK", subtitle: `${input.draft.surveyName} · ${pageIndex + 1}/${pageCount}`, font: input.font, bold: input.bold, rgb: input.rgb });
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    const cyan = input.rgb(0.02, 0.55, 0.61);
    const amber = input.rgb(0.75, 0.43, 0.05);
    let y = page.getHeight() - 82;
    page.drawText(safePdfText(`Valtozatok: ${proposalScenarios.length} · bevont intezkedesek: ${measures.length}`), { x: 45, y, size: 8, font: input.bold, color: cyan });
    y -= 18;
    page.drawText("A javaslat tervezes-elokeszito, nem kivitelezoi ajanlat vagy hiteles tanusitvany.", { x: 45, y, size: 7, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
    y -= 25;
    const pageRows = measures.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    if (!pageRows.length) {
      page.drawRectangle({ x: 45, y: page.getHeight() - 235, width: page.getWidth() - 90, height: 105, borderColor: input.rgb(0.55, 0.65, 0.68), borderWidth: 1 });
      page.drawText("NINCS BEVALASZTOTT FELUJITASI INTEZKEDES", { x: 65, y: page.getHeight() - 178, size: 11, font: input.bold, color: amber, maxWidth: page.getWidth() - 130 });
      page.drawText("A helyszini vagy automatikus javaslatokat a Felujitas munkalapon lehet osszeallitani.", { x: 65, y: page.getHeight() - 204, size: 8, font: input.font, color: dark, maxWidth: page.getWidth() - 130 });
    }
    for (const { scenario, measure } of pageRows) {
      page.drawRectangle({ x: 45, y: y - 72, width: page.getWidth() - 90, height: 80, color: input.rgb(0.96, 0.99, 0.99), borderColor: input.rgb(0.55, 0.78, 0.8), borderWidth: 0.5 });
      page.drawText(safePdfText(`${scenario.code} · ${measure.title}`), { x: 55, y, size: 8.5, font: input.bold, color: dark, maxWidth: 330 });
      page.drawText(safePdfText(`${measure.effectLevel} · ${measure.dataStatus}`), { x: 400, y, size: 6.4, font: input.bold, color: cyan, maxWidth: 150 });
      y -= 15;
      page.drawText(safePdfText(`Meglevo: ${measure.existingDescription || "nincs reszletezve"}`), { x: 55, y, size: 6.4, font: input.font, color: muted, maxWidth: page.getWidth() - 110 });
      y -= 13;
      page.drawText(safePdfText(`Tervezett: ${measure.proposedDescription || "nincs reszletezve"}`), { x: 55, y, size: 6.4, font: input.bold, color: dark, maxWidth: page.getWidth() - 110 });
      y -= 13;
      const values = measure.currentValue === undefined && measure.targetValue === undefined ? "" : `Ertek: ${measure.currentValue ?? "-"} -> ${measure.targetValue ?? "-"} ${measure.unit || ""}`;
      page.drawText(safePdfText(`${values}${values ? " · " : ""}Forras: ${measure.sourceReference || "nincs"}`), { x: 55, y, size: 6.1, font: input.font, color: muted, maxWidth: page.getWidth() - 110 });
      y -= 39;
    }
    page.drawText("Minden celerték, rendszermeret es varhato hatas szakmai ellenorzest es WinWattban torteno veglegesitest igenyel.", { x: 45, y: 32, size: 6.2, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
  }
}

function drawRenewableSummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; result: EnergyRenewableSizingResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
  drawHeader({ page, title: "MEGUJULO ES VILLAMOS ELOMERETEZES", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
  const dark = input.rgb(0.04, 0.18, 0.2);
  const muted = input.rgb(0.35, 0.42, 0.48);
  const cyan = input.rgb(0.02, 0.55, 0.61);
  const amber = input.rgb(0.75, 0.43, 0.05);
  const red = input.rgb(0.78, 0.12, 0.18);
  let y = page.getHeight() - 82;
  if (!input.result.enabled) {
    page.drawRectangle({ x: 45, y: page.getHeight() - 235, width: page.getWidth() - 90, height: 105, borderColor: input.rgb(0.55, 0.65, 0.68), borderWidth: 1 });
    page.drawText("AZ ELOMERETEZES NINCS BEKAPCSOLVA", { x: 65, y: page.getHeight() - 178, size: 11, font: input.bold, color: amber, maxWidth: page.getWidth() - 130 });
    page.drawText("Nem keszult napelem-, napkollektor-, akkumulator- vagy autotolto-meretezes.", { x: 65, y: page.getHeight() - 204, size: 8, font: input.font, color: dark, maxWidth: page.getWidth() - 130 });
    page.drawText(safePdfText(input.result.limitation), { x: 45, y: 32, size: 6.2, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
    return;
  }
  const blocking = input.result.validationMessages.filter((message) => message.severity === "blocking").length;
  const warnings = input.result.validationMessages.filter((message) => message.severity === "warning").length;
  page.drawText(safePdfText(`Kivalasztott tetosikok: ${input.result.roof.selectedSurfaceCount} · hasznos felulet: ${input.result.roof.usableAreaSquareMeters.toFixed(2)} m2 · blokkoló hiany: ${blocking} · figyelmeztetes: ${warnings}`), { x: 45, y, size: 7.5, font: input.bold, color: blocking ? red : cyan, maxWidth: page.getWidth() - 90 });
  y -= 28;
  const cards = [
    ["NAPELEM", `${input.result.pv.selectedPanelCount} db · ${input.result.pv.installedPowerKwp.toFixed(2)} kWp`, `eves hozam ${input.result.pv.estimatedAnnualYieldKwh === null ? "-" : `${input.result.pv.estimatedAnnualYieldKwh.toFixed(0)} kWh`} · sajatfogyasztas ${input.result.pv.estimatedDirectSelfConsumptionKwh === null ? "-" : `${input.result.pv.estimatedDirectSelfConsumptionKwh.toFixed(0)} kWh`} · tobblet ${input.result.pv.estimatedSurplusKwh === null ? "-" : `${input.result.pv.estimatedSurplusKwh.toFixed(0)} kWh`}`],
    ["NAPKOLLEKTOR", `${input.draft.energyRenewableWorkspace.solarThermal.collectorAreaSquareMeters.toFixed(1)} m2 kollektor`, `HMV igeny ${input.result.solarThermal.annualHotWaterDemandKwh === null ? "-" : `${input.result.solarThermal.annualHotWaterDemandKwh.toFixed(0)} kWh`} · hozam ${input.result.solarThermal.estimatedAnnualYieldKwh === null ? "-" : `${input.result.solarThermal.estimatedAnnualYieldKwh.toFixed(0)} kWh`} · lefedettseg ${input.result.solarThermal.estimatedCoveragePercent === null ? "-" : `${input.result.solarThermal.estimatedCoveragePercent.toFixed(1)} %`} · tarolo ${input.result.solarThermal.suggestedStorageVolumeLiters ?? "-"} l`],
    ["AKKUMULATOR", `${input.draft.energyRenewableWorkspace.battery.nominalCapacityKwh.toFixed(2)} kWh kivalasztva`, `javasolt hasznalhato ${input.result.battery.suggestedUsableCapacityKwh === null ? "-" : `${input.result.battery.suggestedUsableCapacityKwh.toFixed(2)} kWh`} · javasolt nevleges ${input.result.battery.suggestedNominalCapacityKwh === null ? "-" : `${input.result.battery.suggestedNominalCapacityKwh.toFixed(2)} kWh`} · tartalekigeny ${input.result.battery.backupUsableCapacityKwh === null ? "-" : `${input.result.battery.backupUsableCapacityKwh.toFixed(2)} kWh`}`],
    ["ELEKTROMOSAUTO-TOLTES", `${input.draft.energyRenewableWorkspace.evCharging.chargerPowerKw.toFixed(1)} kW tolto`, `eves otthoni toltes ${input.result.evCharging.annualHomeChargingEnergyKwh === null ? "-" : `${input.result.evCharging.annualHomeChargingEnergyKwh.toFixed(0)} kWh`} · aram ${input.result.evCharging.chargerCurrentAmps === null ? "-" : `${input.result.evCharging.chargerCurrentAmps.toFixed(2)} A/fazis`} · csatlakozas ${input.result.evCharging.connectionSufficient === true ? "megfelelo" : input.result.evCharging.connectionSufficient === false ? "ellenorizendo" : "ismeretlen"}`],
  ] as const;
  for (const [title, value, detail] of cards) {
    page.drawRectangle({ x: 45, y: y - 70, width: page.getWidth() - 90, height: 78, color: input.rgb(0.96, 0.99, 0.99), borderColor: input.rgb(0.55, 0.78, 0.8), borderWidth: 0.5 });
    page.drawText(title, { x: 57, y, size: 8.5, font: input.bold, color: cyan });
    page.drawText(safePdfText(value), { x: 260, y, size: 8, font: input.bold, color: dark, maxWidth: 280 });
    y -= 20;
    drawTextBlock({ page, text: detail, x: 57, y, width: page.getWidth() - 114, font: input.font, size: 6.6, color: muted, maxLines: 3 });
    y -= 70;
  }
  if (input.result.validationMessages.length) {
    page.drawText("ELLENORZESI UZENETEK", { x: 45, y, size: 8.5, font: input.bold, color: blocking ? red : amber });
    y -= 16;
    for (const message of input.result.validationMessages.slice(0, 8)) {
      page.drawText(safePdfText(`${message.code}: ${message.message}`), { x: 50, y, size: 6.2, font: message.severity === "blocking" ? input.bold : input.font, color: message.severity === "blocking" ? red : amber, maxWidth: page.getWidth() - 100 });
      y -= 13;
    }
  }
  page.drawText(safePdfText(input.result.limitation), { x: 45, y: 32, size: 6.2, font: input.bold, color: amber, maxWidth: page.getWidth() - 90 });
}

function drawAssemblySummary(input: { pdf: PDFDocument; draft: PropertySurveyDraft; assemblySet: EnergyAssemblySetResult; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const rowsPerPage = 14;
  const pages = Math.max(1, Math.ceil(input.assemblySet.results.length / rowsPerPage));
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawHeader({ page, title: "RETEGRENDI U-ERTEK OSSZESITO", subtitle: `${input.draft.surveyName} · ${pageIndex + 1}/${pages}`, font: input.font, bold: input.bold, rgb: input.rgb });
    let y = page.getHeight() - 82;
    const dark = input.rgb(0.04, 0.18, 0.2);
    const muted = input.rgb(0.35, 0.42, 0.48);
    const headers = [[45, "Szerkezet"], [250, "U W/m2K"], [320, "Rtot"], [375, "dU"], [425, "Kovetelmeny"], [505, "Allapot"]] as const;
    for (const [x, label] of headers) page.drawText(label, { x, y, size: 7.2, font: input.bold, color: muted });
    y -= 12;
    page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.7, color: input.rgb(0.55, 0.65, 0.68) });
    y -= 14;
    for (const result of input.assemblySet.results.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)) {
      const status = result.compliance === "compliant" ? "MEGFELEL" : result.compliance === "notCompliant" ? "NEM FELEL MEG" : result.compliance === "groundCalculationRequired" ? "TALAJSZAMITAS" : result.compliance === "notApplicable" ? "NEM VIZSGALT" : "NEM SZAMITHATO";
      const statusColor = result.compliance === "compliant" ? input.rgb(0.04, 0.52, 0.35) : result.compliance === "notCompliant" || result.blocked ? input.rgb(0.78, 0.12, 0.18) : input.rgb(0.75, 0.43, 0.05);
      page.drawText(safePdfText(result.assemblyName), { x: 45, y, size: 7.5, font: input.bold, color: dark, maxWidth: 195 });
      page.drawText(result.effectiveUValueWm2K === null ? "-" : result.effectiveUValueWm2K.toFixed(3), { x: 250, y, size: 7.5, font: input.font, color: dark });
      page.drawText(result.totalResistanceM2KPerW === null ? "-" : result.totalResistanceM2KPerW.toFixed(3), { x: 320, y, size: 7.5, font: input.font, color: dark });
      page.drawText(result.correction.appliedDeltaUWm2K.toFixed(4), { x: 375, y, size: 7.5, font: input.font, color: dark });
      page.drawText(result.requirementMaximumUValueWm2K === null ? "-" : result.requirementMaximumUValueWm2K.toFixed(2), { x: 425, y, size: 7.5, font: input.font, color: dark });
      page.drawText(status, { x: 505, y, size: 6.8, font: input.bold, color: statusColor, maxWidth: 70 });
      y -= 13;
      const detail = `mod: ${result.calculationMode} / hoaram: ${result.heatFlowDirection} / retegek: ${result.layerResults.length} / hibak: ${result.validationMessages.filter((message) => message.severity === "error").length}`;
      page.drawText(safePdfText(detail), { x: 45, y, size: 6.2, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
      y -= 11;
      page.drawLine({ start: { x: 45, y }, end: { x: page.getWidth() - 45, y }, thickness: 0.25, color: input.rgb(0.82, 0.86, 0.89) });
      y -= 11;
    }
    page.drawText(safePdfText(`Motor: ${input.assemblySet.engineVersion} · Forras: ${input.assemblySet.ruleSourceReferenceId} · Ellenorzes: ${input.assemblySet.ruleCheckedAt}`), { x: 45, y: 45, size: 6.5, font: input.font, color: muted, maxWidth: page.getWidth() - 90 });
    page.drawText("Tervezoi energetikai szamitas - szakmai ellenorzes szukseges.", { x: 45, y: 32, size: 6.5, font: input.bold, color: input.rgb(0.75, 0.43, 0.05), maxWidth: page.getWidth() - 90 });
  }
}

function drawLegendAndSignature(input: { pdf: PDFDocument; draft: PropertySurveyDraft; energySummary: SurveyEnergySummary; font: PDFFont; bold: PDFFont; rgb: PdfLibRuntime["rgb"] }) {
  const page = input.pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
  drawHeader({ page, title: "JELMAGYARAZAT ES MERNOKI ALAIRASI BLOKK", subtitle: input.draft.surveyName, font: input.font, bold: input.bold, rgb: input.rgb });
  let y = page.getHeight() - 85;
  const legend = [
    [input.rgb(0.04, 0.18, 0.2), "Kulso / hatarolo falszakasz"],
    [input.rgb(0.45, 0.52, 0.58), "Belso falszakasz"],
    [input.rgb(0.85, 0.43, 0.08), "Futetlen terrel hataros falszakasz"],
    [input.rgb(0.1, 0.45, 0.75), "Nyilaszaro"],
    [input.rgb(0.04, 0.65, 0.58), "Energetikai hohatar"],
    [input.rgb(0.55, 0.12, 0.55), "Metszetvonal"],
    [input.rgb(0.9, 0.16, 0.16), "Hibapont"],
  ] as const;
  for (const [color, label] of legend) {
    page.drawLine({ start: { x: 55, y }, end: { x: 105, y }, thickness: 4, color });
    page.drawText(safePdfText(label), { x: 120, y: y - 3, size: 9, font: input.font, color: input.rgb(0.04, 0.18, 0.2) });
    y -= 24;
  }
  y -= 10;
  page.drawText("Tajolasonkenti energetikai osszesito", { x: 55, y, size: 11, font: input.bold, color: input.rgb(0.02, 0.55, 0.61) });
  y -= 22;
  for (const row of input.energySummary.orientationRows.slice(0, 12)) {
    page.drawText(safePdfText(`${row.orientation} (${Math.round(row.azimuth)} fok)`), { x: 55, y, size: 7.5, font: input.bold, color: input.rgb(0.04, 0.18, 0.2) });
    page.drawText(safePdfText(`brutto ${row.grossWallAreaSquareMeters.toFixed(2)} m2 / nyilas ${row.openingAreaSquareMeters.toFixed(2)} m2 / netto ${row.netWallAreaSquareMeters.toFixed(2)} m2`), { x: 180, y, size: 7.5, font: input.font, color: input.rgb(0.25, 0.32, 0.4) });
    y -= 15;
  }
  y = Math.min(y - 25, 260);
  page.drawRectangle({ x: 55, y: 70, width: page.getWidth() - 110, height: 155, borderColor: input.rgb(0.1, 0.25, 0.28), borderWidth: 1 });
  page.drawText("MERNOKI ALAIRASI BLOKK", { x: 70, y: 205, size: 10, font: input.bold, color: input.rgb(0.02, 0.55, 0.61) });
  const detailRows = [
    ["Ceg / szervezet", input.draft.exportDetails.companyName || "-"],
    ["Felelos mernok", input.draft.exportDetails.engineerName || "-"],
    ["Kamarai szam", input.draft.exportDetails.chamberNumber || "-"],
    ["Keltezes helye", input.draft.exportDetails.signaturePlace || "-"],
    ["Keltezes", input.draft.exportDetails.signatureDate || input.draft.property.surveyDate || "-"],
  ];
  let detailY = 182;
  for (const [label, value] of detailRows) {
    page.drawText(safePdfText(label), { x: 70, y: detailY, size: 7.5, font: input.bold, color: input.rgb(0.3, 0.38, 0.46) });
    page.drawText(safePdfText(value), { x: 180, y: detailY, size: 8, font: input.font, color: input.rgb(0.04, 0.18, 0.2) });
    detailY -= 19;
  }
  page.drawLine({ start: { x: page.getWidth() - 235, y: 105 }, end: { x: page.getWidth() - 70, y: 105 }, thickness: 0.8, color: input.rgb(0.1, 0.25, 0.28) });
  page.drawText("alairas / pecset", { x: page.getWidth() - 185, y: 92, size: 7, font: input.font, color: input.rgb(0.4, 0.45, 0.5) });
}

export async function createSurveyBuildingVectorPdf(input: {
  project: PropertySurveyProject | null;
  draft: PropertySurveyDraft;
  issues: PropertySurveyIssue[];
  energySummary: SurveyEnergySummary;
  energyAssemblies: EnergyAssemblySetResult;
  energyZones: EnergyZoneSetResult;
  energyOpenings: EnergyOpeningSetResult;
  energyDemand: EnergyDemandSetResult;
  energyRenewables: EnergyRenewableSizingResult;
  energyRenovationComparison: EnergyRenovationComparisonSetResult;
  revisionNumber: number;
}) {
  const runtime = await import("pdf-lib");
  const { PDFDocument, StandardFonts, rgb } = runtime;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(safePdfText(input.draft.surveyName));
  pdf.setSubject("DIMPRO Felmero tobbszintes vektoros felmeresi dokumentumcsomag");
  pdf.setCreator("DIMPRO Felmero v0.8.2");
  pdf.setProducer("DIMPRO vector PDF engine");
  drawCover({ pdf, draft: input.draft, project: input.project, energySummary: input.energySummary, revisionNumber: input.revisionNumber, font, bold, rgb });

  const paper = input.draft.planSheet.paperSize;
  const base = paper === "A2" ? { width: 420, height: 594 } : paper === "A3" ? { width: 297, height: 420 } : { width: 210, height: 297 };
  const dimensions = input.draft.planSheet.orientation === "landscape" ? { width: base.height, height: base.width } : base;
  const isIndustrial = input.draft.surveyMode === "Épület- és csarnokfelmérés" || input.draft.surveyMode === "Térbeton- és burkolatfelmérés";

  for (const level of [...input.draft.levels].sort((left, right) => left.order - right.order)) {
    const page = pdf.addPage([dimensions.width * MM_TO_PT, dimensions.height * MM_TO_PT]);
    const rooms = getLevelRooms(input.draft, level.id);
    const sections = input.draft.sectionLines.filter((line) => line.levelId === level.id);
    const bounds = isIndustrial ? industrialBounds(input.draft) : generalBounds(rooms, sections);
    const transform = createTransform(bounds, page, rooms.length > 0);
    if (isIndustrial) drawIndustrialPlan({ page, draft: input.draft, level, transform, font, bold, rgb });
    else drawGeneralPlan({ page, draft: input.draft, level, rooms, issues: input.issues, transform, font, bold, rgb });
    drawSurveyNorthMarkPdf({ page, centerX: page.getWidth() - 78, centerY: page.getHeight() - 92, northAngle: input.draft.northAngle, bold, rgb });
    drawSurveySheetFrame({ page, rgb });
    drawTitleBlock({
      page,
      projectName: input.project?.name || "Projekt nelkuli felmeres",
      clientName: input.project?.clientName || "Nincs megadva",
      surveyName: input.draft.surveyName,
      surveyType: input.draft.surveyMode,
      levelName: level.name,
      revisionLabel: `v${String(input.revisionNumber).padStart(3, "0")}`,
      location: getSurveySheetLocation(input.draft, input.project),
      surveyDate: input.draft.property.surveyDate || "Nincs megadva",
      creator: input.draft.exportDetails.engineerName || input.draft.exportDetails.companyName || "Nincs megadva",
      paperSize: input.draft.planSheet.paperSize,
      orientation: input.draft.planSheet.orientation,
      scale: input.draft.planSheet.scaleDenominator,
      font,
      bold,
      rgb,
    });
    drawPlanLegendAndAreaSummary({ page, rooms, levelName: level.name, font, bold, rgb });
  }

  for (const line of input.draft.sectionLines) {
    const level = input.draft.levels.find((item) => item.id === line.levelId) || input.draft.levels[0];
    const page = pdf.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
    drawSectionPage({ page, line, level, draft: input.draft, project: input.project, revisionNumber: input.revisionNumber, font, bold, rgb });
  }

  drawZoneSummary({ pdf, draft: input.draft, zoneSet: input.energyZones, font, bold, rgb });
  drawOpeningThermalSummary({ pdf, draft: input.draft, openingSet: input.energyOpenings, font, bold, rgb });
  drawDemandAndSystemsSummary({ pdf, draft: input.draft, demandSet: input.energyDemand, font, bold, rgb });
  drawRenovationComparisonSummary({ pdf, draft: input.draft, comparison: input.energyRenovationComparison, font, bold, rgb });
  drawRenovationSummary({ pdf, draft: input.draft, font, bold, rgb });
  drawRenewableSummary({ pdf, draft: input.draft, result: input.energyRenewables, font, bold, rgb });
  drawAssemblySummary({ pdf, draft: input.draft, assemblySet: input.energyAssemblies, font, bold, rgb });
  drawLegendAndSignature({ pdf, draft: input.draft, energySummary: input.energySummary, font, bold, rgb });
  const bytes = await pdf.save();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/pdf" });
}
