"use client";

import type { SurveyCertificatePhotoCategory, SurveyPhotoPoint } from "@/components/property-survey/propertySurveyEnergyModel";
import { requiredSurveyCertificatePhotoCategories, surveyCertificatePhotoCategoryLabels } from "@/components/property-survey/propertySurveyEnergyModel";

export const SURVEY_CERTIFICATE_MAX_PHOTOS = 12;
export const SURVEY_CERTIFICATE_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const SURVEY_CERTIFICATE_WARNING_TOTAL_BYTES = Math.round(3.5 * 1024 * 1024);
export const SURVEY_PHOTO_TARGET_BYTES = 280 * 1024;
export const SURVEY_PHOTO_MAX_LONG_SIDE = 1600;

export type OptimizedSurveyPhoto = {
  dataUrl: string;
  mimeType: "image/jpeg";
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  pixelWidth: number;
  pixelHeight: number;
};

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("A képfájl nem olvasható."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A kép nem dolgozható fel."));
    image.src = source;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("A JPG-kép előállítása sikertelen.")), "image/jpeg", quality);
  });
}

function drawImageToCanvas(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("A böngésző képfeldolgozó felülete nem érhető el.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function optimizeSurveyPhoto(file: File): Promise<OptimizedSurveyPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Csak képfájl csatolható.");
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const initialScale = Math.min(1, SURVEY_PHOTO_MAX_LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
  let quality = 0.8;
  let canvas = drawImageToCanvas(image, width, height);
  let blob = await canvasToJpegBlob(canvas, quality);

  while (blob.size > SURVEY_PHOTO_TARGET_BYTES && quality > 0.62) {
    quality = Number((quality - 0.04).toFixed(2));
    blob = await canvasToJpegBlob(canvas, quality);
  }

  while (blob.size > SURVEY_PHOTO_TARGET_BYTES && Math.max(width, height) > 960) {
    width = Math.max(1, Math.round(width * 0.9));
    height = Math.max(1, Math.round(height * 0.9));
    canvas = drawImageToCanvas(image, width, height);
    quality = 0.76;
    blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > SURVEY_PHOTO_TARGET_BYTES && quality > 0.6) {
      quality = Number((quality - 0.04).toFixed(2));
      blob = await canvasToJpegBlob(canvas, quality);
    }
  }

  return {
    dataUrl: await fileToDataUrl(blob),
    mimeType: "image/jpeg",
    originalSizeBytes: file.size,
    optimizedSizeBytes: blob.size,
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}

export function getDataUrlByteSize(dataUrl?: string) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export function getSurveyPhotoSizeBytes(point: SurveyPhotoPoint) {
  return Number(point.optimizedSizeBytes) || getDataUrlByteSize(point.dataUrl);
}

export function formatSurveyPhotoBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function getSurveyCertificatePhotoSummary(points: SurveyPhotoPoint[]) {
  const selected = points.filter((point) => point.purpose !== "issue" && point.includeInCertificate === true && Boolean(point.dataUrl));
  const totalBytes = selected.reduce((sum, point) => sum + getSurveyPhotoSizeBytes(point), 0);
  const categoryCounts = requiredSurveyCertificatePhotoCategories.reduce<Record<SurveyCertificatePhotoCategory, number>>((result, category) => {
    result[category] = selected.filter((point) => point.certificateCategory === category).length;
    return result;
  }, { building: 0, heatGenerator: 0, heatEmitter: 0, other: 0 });
  return {
    selected,
    count: selected.length,
    totalBytes,
    categoryCounts,
    missingRequiredCategories: requiredSurveyCertificatePhotoCategories.filter((category) => categoryCounts[category] === 0),
    exceedsPhotoCount: selected.length > SURVEY_CERTIFICATE_MAX_PHOTOS,
    exceedsHardLimit: totalBytes > SURVEY_CERTIFICATE_MAX_TOTAL_BYTES,
    exceedsWarningLimit: totalBytes > SURVEY_CERTIFICATE_WARNING_TOTAL_BYTES,
  };
}

function sanitizeFilePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72) || "foto";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export async function createSurveyPhotoZip(input: {
  points: SurveyPhotoPoint[];
  mode: "certificate" | "all";
  surveyName: string;
}) {
  const candidates = input.mode === "certificate"
    ? input.points.filter((point) => point.purpose !== "issue" && point.includeInCertificate === true && Boolean(point.dataUrl))
    : input.points.filter((point) => Boolean(point.dataUrl));
  if (!candidates.length) throw new Error("Nincs ZIP-be csomagolható fénykép.");
  if (input.mode === "certificate") {
    if (candidates.length > SURVEY_CERTIFICATE_MAX_PHOTOS) throw new Error(`A WinWatt/e-tanúsítás csomag legfeljebb ${SURVEY_CERTIFICATE_MAX_PHOTOS} fényképet tartalmazhat.`);
    const totalBytes = candidates.reduce((sum, point) => sum + getSurveyPhotoSizeBytes(point), 0);
    if (totalBytes > SURVEY_CERTIFICATE_MAX_TOTAL_BYTES) throw new Error(`A kijelölt fényképek összmérete ${formatSurveyPhotoBytes(totalBytes)}, amely meghaladja a 4 MB-os e-tanúsítási korlátot.`);
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const rows = [["Sorszám", "Típus", "Kategória", "Megnevezés", "Fájlnév", "Méret", "Pixelszélesség", "Pixelmagasság", "Megjegyzés"]];
  candidates.forEach((point, index) => {
    const base64 = point.dataUrl?.split(",")[1];
    if (!base64) return;
    const categoryLabel = surveyCertificatePhotoCategoryLabels[point.certificateCategory];
    const fileName = `${String(index + 1).padStart(2, "0")}_${sanitizeFilePart(point.serial)}_${sanitizeFilePart(categoryLabel)}_${sanitizeFilePart(point.title)}.jpg`;
    zip.file(fileName, base64, { base64: true, binary: true });
    rows.push([
      point.serial,
      point.purpose === "issue" ? "Hibafotó" : "Fotódokumentáció",
      categoryLabel,
      point.title,
      fileName,
      String(getSurveyPhotoSizeBytes(point)),
      String(point.pixelWidth || ""),
      String(point.pixelHeight || ""),
      point.note || "",
    ]);
  });
  zip.file("DIMPRO_fotojegyzek.csv", `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`);
  zip.file("README.txt", [
    "DIMPRO Ingatlanfelmérő fotócsomag",
    `Felmérés: ${input.surveyName}`,
    `Képek száma: ${candidates.length}`,
    input.mode === "certificate" ? "Csomag: WinWatt / e-tanúsítás céljára kijelölt fotók" : "Csomag: minden feltöltött fotó",
    "Alap optimalizálás: JPG, legfeljebb 1600 px hosszabbik oldal, célérték legfeljebb 280 KB/kép.",
  ].join("\r\n"));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function downloadSurveyPhotoBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
