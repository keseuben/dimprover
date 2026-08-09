"use client";

import type {
  SurveyIndustrialBackground,
  SurveyIndustrialBackgroundPage,
} from "@/components/property-survey/propertySurveyIndustrialModel";

const MAX_IMAGE_DIMENSION = 2200;
const MAX_PDF_PAGE_DIMENSION = 1500;
const MAX_PDF_PAGES = 6;
const MAX_SOURCE_FILE_BYTES = 24 * 1024 * 1024;

function createBackgroundId() {
  return `industrial-background-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function canvasToOptimizedDataUrl(canvas: HTMLCanvasElement, quality = 0.84) {
  return canvas.toDataURL("image/jpeg", quality);
}

function createBackgroundRecord(input: {
  fileName: string;
  mimeType: string;
  pages: SurveyIndustrialBackgroundPage[];
  sourcePageCount: number;
}): SurveyIndustrialBackground {
  const now = new Date().toISOString();
  const firstPage = input.pages[0];
  if (!firstPage) throw new Error("Nem készült megjeleníthető háttéroldal.");
  return {
    id: createBackgroundId(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    dataUrl: firstPage.dataUrl,
    sourceWidthPixels: firstPage.widthPixels,
    sourceHeightPixels: firstPage.heightPixels,
    pages: input.pages,
    activePageIndex: 0,
    pageCount: input.pages.length,
    sourcePageCount: input.sourcePageCount,
    visible: true,
    opacity: 0.5,
    grayscale: true,
    offsetXMeters: 0,
    offsetYMeters: 0,
    rotationDegrees: 0,
    scalePercent: 100,
    calibrationDistanceMeters: 10,
    calibrationPoints: [],
    importedAt: now,
    updatedAt: now,
  };
}

async function loadImageFromDataUrl(dataUrl: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A kép nem olvasható."));
    image.src = dataUrl;
  });
}

function fitCanvasSize(width: number, height: number, maximumDimension: number) {
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function processImageFile(file: File) {
  const sourceDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("A képfájl nem olvasható."));
    reader.readAsDataURL(file);
  });
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const size = fitCanvasSize(image.naturalWidth, image.naturalHeight, MAX_IMAGE_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A képfeldolgozó vászon nem érhető el.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const page: SurveyIndustrialBackgroundPage = {
    pageNumber: 1,
    dataUrl: canvasToOptimizedDataUrl(canvas, 0.86),
    widthPixels: canvas.width,
    heightPixels: canvas.height,
  };
  return createBackgroundRecord({
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    pages: [page],
    sourcePageCount: 1,
  });
}

async function renderPdfPage(
  pdfDocument: Awaited<ReturnType<typeof import("pdfjs-dist")["getDocument"]>>["promise"] extends Promise<infer T> ? T : never,
  pageNumber: number,
): Promise<SurveyIndustrialBackgroundPage> {
  const page = await pdfDocument.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, MAX_PDF_PAGE_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale: Math.max(0.5, scale) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A PDF előnézeti vászon nem érhető el.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  page.cleanup();
  return {
    pageNumber,
    dataUrl: canvasToOptimizedDataUrl(canvas, 0.78),
    widthPixels: canvas.width,
    heightPixels: canvas.height,
  };
}

async function processPdfFile(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdfDocument = await loadingTask.promise;
  try {
    const storedPageCount = Math.min(pdfDocument.numPages, MAX_PDF_PAGES);
    const pages: SurveyIndustrialBackgroundPage[] = [];
    for (let pageNumber = 1; pageNumber <= storedPageCount; pageNumber += 1) {
      pages.push(await renderPdfPage(pdfDocument, pageNumber));
    }
    return createBackgroundRecord({
      fileName: file.name,
      mimeType: "application/pdf",
      pages,
      sourcePageCount: pdfDocument.numPages,
    });
  } finally {
    await loadingTask.destroy();
  }
}

export function getIndustrialBackgroundPagePatch(background: SurveyIndustrialBackground, requestedIndex: number) {
  const index = Math.min(background.pages.length - 1, Math.max(0, Math.round(requestedIndex)));
  const page = background.pages[index];
  if (!page) return {};
  return {
    activePageIndex: index,
    dataUrl: page.dataUrl,
    sourceWidthPixels: page.widthPixels,
    sourceHeightPixels: page.heightPixels,
    calibrationPoints: [],
    calibratedAt: undefined,
    calibrationScaleFactor: undefined,
    updatedAt: new Date().toISOString(),
  } satisfies Partial<SurveyIndustrialBackground>;
}

export async function processIndustrialBackgroundFile(file: File) {
  if (file.size > MAX_SOURCE_FILE_BYTES) throw new Error("A háttérfájl legfeljebb 24 MB lehet.");
  if (file.type === "application/pdf" || file.name.toLocaleLowerCase("hu-HU").endsWith(".pdf")) return processPdfFile(file);
  if (file.type.startsWith("image/")) return processImageFile(file);
  throw new Error("Csak PDF vagy képfájl tölthető be háttérként.");
}
