import type { PropertySurveyIssue } from "@/components/property-survey/propertySurveyIssueTypes";
import type { SurveyPhotoPoint } from "@/components/property-survey/propertySurveyEnergyModel";
import {
  getPaperDimensionsMm,
  getWallSegmentGeometry,
  type SurveyPaperOrientation,
  type SurveyPaperSize,
  type SurveyPlanSheetSettings,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  getSurveyThermalBoundarySegments,
  type SurveyThermalBoundarySegment,
} from "@/components/property-survey/propertySurveyThermalBoundary";
import type { SurveyThermalBoundarySettings } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";

export function sanitizeSurveyFileName(value: string, fallback = "dimpro_felmeres") {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hu-HU")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function downloadSurveyBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function dxfPair(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

function dxfLine(layer: string, x1Meters: number, y1Meters: number, x2Meters: number, y2Meters: number) {
  return dxfPair(0, "LINE") + dxfPair(8, layer)
    + dxfPair(10, (x1Meters * 1000).toFixed(3)) + dxfPair(20, (-y1Meters * 1000).toFixed(3))
    + dxfPair(11, (x2Meters * 1000).toFixed(3)) + dxfPair(21, (-y2Meters * 1000).toFixed(3));
}

function dxfText(layer: string, xMeters: number, yMeters: number, value: string, heightMillimeters = 180) {
  const safe = value.replace(/[\r\n]+/g, " ").slice(0, 250);
  return dxfPair(0, "TEXT") + dxfPair(8, layer)
    + dxfPair(10, (xMeters * 1000).toFixed(3)) + dxfPair(20, (-yMeters * 1000).toFixed(3))
    + dxfPair(40, heightMillimeters.toFixed(3)) + dxfPair(1, safe);
}

function openingGeometry(input: { opening: SurveyWallOpening; wallSegments: SurveyWallSegment[]; rooms: SurveyRoom[] }) {
  const segment = input.wallSegments.find((item) => item.id === input.opening.wallSegmentId);
  const room = input.rooms.find((item) => item.id === input.opening.roomId);
  if (!segment || !room) return null;
  const geometry = getWallSegmentGeometry(room, segment);
  const dx = geometry.x2 - geometry.x1;
  const dy = geometry.y2 - geometry.y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const centerX = geometry.x1 + dx * Math.min(1, Math.max(0, input.opening.offsetRatio));
  const centerY = geometry.y1 + dy * Math.min(1, Math.max(0, input.opening.offsetRatio));
  const halfPlanUnits = Math.min(length * 0.45, Math.max(8, input.opening.widthMeters * 30));
  return {
    x1: (centerX - ux * halfPlanUnits) / 60,
    y1: (centerY - uy * halfPlanUnits) / 60,
    x2: (centerX + ux * halfPlanUnits) / 60,
    y2: (centerY + uy * halfPlanUnits) / 60,
  };
}

export function createSurveyPlanDxf(input: {
  projectName?: string;
  surveyName: string;
  levelName: string;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  thermalBoundary?: SurveyThermalBoundarySettings;
  photoPoints?: SurveyPhotoPoint[];
  issues?: PropertySurveyIssue[];
  sectionLines?: SurveySectionLine[];
}) {
  const layers = [
    ["DIMPRO_ROOMS", 7],
    ["DIMPRO_WALL_EXTERNAL", 30],
    ["DIMPRO_WALL_INTERNAL", 8],
    ["DIMPRO_WALL_UNHEATED", 3],
    ["DIMPRO_OPENINGS", 5],
    ["DIMPRO_THERMAL", 3],
    ["DIMPRO_PHOTOS", 4],
    ["DIMPRO_ISSUES", 1],
    ["DIMPRO_SECTIONS", 6],
    ["DIMPRO_TEXT", 7],
  ] as const;

  let output = dxfPair(0, "SECTION") + dxfPair(2, "HEADER")
    + dxfPair(9, "$ACADVER") + dxfPair(1, "AC1015")
    + dxfPair(9, "$INSUNITS") + dxfPair(70, 4)
    + dxfPair(0, "ENDSEC");
  output += dxfPair(0, "SECTION") + dxfPair(2, "TABLES") + dxfPair(0, "TABLE") + dxfPair(2, "LAYER") + dxfPair(70, layers.length);
  for (const [name, color] of layers) output += dxfPair(0, "LAYER") + dxfPair(2, name) + dxfPair(70, 0) + dxfPair(62, color) + dxfPair(6, "CONTINUOUS");
  output += dxfPair(0, "ENDTAB") + dxfPair(0, "ENDSEC") + dxfPair(0, "SECTION") + dxfPair(2, "ENTITIES");

  for (const room of input.rooms) {
    const x1 = room.x / 60;
    const y1 = room.y / 60;
    const x2 = (room.x + room.width) / 60;
    const y2 = (room.y + room.depth) / 60;
    output += dxfLine("DIMPRO_ROOMS", x1, y1, x2, y1);
    output += dxfLine("DIMPRO_ROOMS", x2, y1, x2, y2);
    output += dxfLine("DIMPRO_ROOMS", x2, y2, x1, y2);
    output += dxfLine("DIMPRO_ROOMS", x1, y2, x1, y1);
    output += dxfText("DIMPRO_TEXT", (x1 + x2) / 2, (y1 + y2) / 2, `${room.name} ${room.area.toFixed(2)} m2`, 180);
  }

  for (const segment of input.wallSegments) {
    const room = input.rooms.find((item) => item.id === segment.roomId);
    if (!room) continue;
    const geometry = getWallSegmentGeometry(room, segment);
    const layer = segment.boundaryType === "external" || segment.boundaryType === "adjacent"
      ? "DIMPRO_WALL_EXTERNAL"
      : segment.boundaryType === "unheated"
        ? "DIMPRO_WALL_UNHEATED"
        : "DIMPRO_WALL_INTERNAL";
    output += dxfLine(layer, geometry.x1 / 60, geometry.y1 / 60, geometry.x2 / 60, geometry.y2 / 60);
  }

  for (const opening of input.wallOpenings) {
    const geometry = openingGeometry({ opening, wallSegments: input.wallSegments, rooms: input.rooms });
    if (!geometry) continue;
    output += dxfLine("DIMPRO_OPENINGS", geometry.x1, geometry.y1, geometry.x2, geometry.y2);
    output += dxfText("DIMPRO_TEXT", (geometry.x1 + geometry.x2) / 2, (geometry.y1 + geometry.y2) / 2, `${opening.name} ${opening.widthMeters.toFixed(2)}x${opening.heightMeters.toFixed(2)}m`, 130);
  }

  const thermalSegments: SurveyThermalBoundarySegment[] = getSurveyThermalBoundarySegments({
    rooms: input.rooms,
    wallSegments: input.wallSegments,
    settings: input.thermalBoundary,
  });
  for (const segment of thermalSegments) {
    output += dxfLine("DIMPRO_THERMAL", segment.x1 / 60, segment.y1 / 60, segment.x2 / 60, segment.y2 / 60);
  }

  for (const point of input.photoPoints || []) {
    const x = point.xPercent / 100 * 900 / 60;
    const y = point.yPercent / 100 * 610 / 60;
    output += dxfPair(0, "CIRCLE") + dxfPair(8, "DIMPRO_PHOTOS") + dxfPair(10, (x * 1000).toFixed(3)) + dxfPair(20, (-y * 1000).toFixed(3)) + dxfPair(40, 120);
    output += dxfText("DIMPRO_TEXT", x + 0.15, y - 0.15, point.serial, 120);
  }

  for (const issue of input.issues || []) {
    const x = issue.xPercent / 100 * 900 / 60;
    const y = issue.yPercent / 100 * 610 / 60;
    output += dxfPair(0, "CIRCLE") + dxfPair(8, "DIMPRO_ISSUES") + dxfPair(10, (x * 1000).toFixed(3)) + dxfPair(20, (-y * 1000).toFixed(3)) + dxfPair(40, 140);
    output += dxfText("DIMPRO_TEXT", x + 0.17, y - 0.17, `${issue.serial} ${issue.title}`, 120);
  }

  for (const line of input.sectionLines || []) {
    const x1 = line.x1 / 60;
    const y1 = line.y1 / 60;
    const x2 = line.x2 / 60;
    const y2 = line.y2 / 60;
    output += dxfLine("DIMPRO_SECTIONS", x1, y1, x2, y2);
    output += dxfText("DIMPRO_SECTIONS", (x1 + x2) / 2, (y1 + y2) / 2, `${line.serial} METSZET ${line.name}`, 150);
  }

  output += dxfText("DIMPRO_TEXT", 0, -1, `${input.projectName || "DIMPRO"} - ${input.surveyName} - ${input.levelName}`, 240);
  output += dxfPair(0, "ENDSEC") + dxfPair(0, "EOF");
  return output;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Az SVG rajz képpé alakítása sikertelen."));
    image.src = url;
  });
}

function numberAttribute(element: Element, name: string) {
  const value = Number(element.getAttribute(name));
  if (!Number.isFinite(value)) throw new Error(`Hiányzó vagy hibás SVG ${name} érték.`);
  return value;
}

export async function createSurveyPdfFromSvg(input: {
  svg: SVGSVGElement;
  paperSize: SurveyPaperSize;
  orientation: SurveyPaperOrientation;
  surveyName: string;
  projectName?: string;
  levelName?: string;
}) {
  const frame = input.svg.querySelector('[data-survey-paper-frame="true"]');
  if (!frame) throw new Error("A rajzi papírkeret nem található.");
  const x = numberAttribute(frame, "x");
  const y = numberAttribute(frame, "y");
  const width = numberAttribute(frame, "width");
  const height = numberAttribute(frame, "height");
  const clone = input.svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.setAttribute("style", [
    "--survey-paper-top:#ffffff",
    "--survey-paper-bottom:#f8fafc",
    "--survey-border:#94a3b8",
    "--survey-text:#0f172a",
    "--survey-muted:#64748b",
    "--survey-panel:#ffffff",
    "--survey-panel-strong:#f8fafc",
  ].join(";"));
  clone.querySelectorAll('[data-survey-export-exclude="true"]').forEach((element) => element.remove());

  const paper = getPaperDimensionsMm({ paperSize: input.paperSize, orientation: input.orientation, scaleMode: "manual", scaleDenominator: 50 });
  const longSidePixels = Math.min(3600, Math.max(2200, Math.round(Math.max(paper.width, paper.height) / 25.4 * 150)));
  const pixelWidth = paper.width >= paper.height ? longSidePixels : Math.round(longSidePixels * paper.width / paper.height);
  const pixelHeight = paper.height >= paper.width ? longSidePixels : Math.round(longSidePixels * paper.height / paper.width);
  clone.setAttribute("width", String(pixelWidth));
  clone.setAttribute("height", String(pixelHeight));

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A PDF rajzi vászon nem hozható létre.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    const pngDataUrl = canvas.toDataURL("image/png");

    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    pdf.setTitle(input.surveyName);
    pdf.setSubject("DIMPRO Felmero alaprajzi export");
    pdf.setCreator("DIMPRO Felmero");
    pdf.setProducer("DIMPRO PDF export engine");
    const mmToPt = 72 / 25.4;
    const page = pdf.addPage([paper.width * mmToPt, paper.height * mmToPt]);
    const embedded = await pdf.embedPng(pngDataUrl);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
    const bytes = await pdf.save();
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: "application/pdf" });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function getSurveyExportFileBase(input: {
  surveyName: string;
  levelName?: string;
  planSheet?: SurveyPlanSheetSettings;
}) {
  const parts = ["dimpro", sanitizeSurveyFileName(input.surveyName)];
  if (input.levelName) parts.push(sanitizeSurveyFileName(input.levelName, "szint"));
  if (input.planSheet) parts.push(input.planSheet.paperSize.toLowerCase(), input.planSheet.orientation === "landscape" ? "fekvo" : "allo");
  return parts.join("_");
}
