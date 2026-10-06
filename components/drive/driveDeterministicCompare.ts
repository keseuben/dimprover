import type { SharedPdfPageAnalysis } from "@/components/viewers/pdfDocumentEngine";
import type { DriveDocument } from "./driveTypes";

export type DeterministicCompareStatus = "LIKELY_REVISION_PAIR" | "REVIEW_REQUIRED" | "DIFFERENT_DOCUMENT";

export type DeterministicCompareCheck = {
  key: "drawingCode" | "scale" | "pageCount" | "contentKind" | "text" | "geometry";
  label: string;
  status: "MATCH" | "DIFFERENT" | "UNKNOWN" | "INFO";
  left: string;
  right: string;
  detail: string;
};

export type DeterministicCompareResult = {
  status: DeterministicCompareStatus;
  compatibilityScore: number;
  headline: string;
  summary: string;
  drawingCode: { left: string | null; right: string | null };
  scale: { left: string | null; right: string | null };
  checks: DeterministicCompareCheck[];
  text: {
    commonCount: number;
    addedCount: number;
    removedCount: number;
    added: string[];
    removed: string[];
    similarityPercent: number;
  };
  geometry: {
    leftSegments: number;
    rightSegments: number;
    segmentDeltaPercent: number;
    leftContours: number;
    rightContours: number;
    contourDeltaPercent: number;
    leftParallelPairs: number;
    rightParallelPairs: number;
  };
};

const WATERMARK_PATTERNS = [/^dimpro\s+dev\s+minta$/i, /^minta$/i, /^sample$/i];

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return cleanText(value).toLocaleLowerCase("hu-HU").replace(/[–—]/g, "-");
}

function usefulTextItems(analysis: SharedPdfPageAnalysis) {
  const result = new Map<string, string>();
  for (const item of analysis.textItems) {
    const display = cleanText(item.text);
    if (display.length < 2 || WATERMARK_PATTERNS.some((pattern) => pattern.test(display))) continue;
    const key = normalizeText(display);
    if (!result.has(key)) result.set(key, display);
  }
  return result;
}

function basename(value: string) {
  return value.replace(/\.[^.]+$/, "").trim();
}

function extractDrawingCode(document: DriveDocument, analysis: SharedPdfPageAnalysis) {
  const candidates = [basename(document.name), document.currentVersion?.originalName || "", ...analysis.textItems.map((item) => item.text)];
  const patterns = [
    /\b([A-ZÁÉÍÓÖŐÚÜŰ]{1,5}\s*[-–]\s*\d{2,5}[A-Z]?)\b/i,
    /\b([A-ZÁÉÍÓÖŐÚÜŰ]{1,4}\d{2,5})\b/i,
  ];
  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = cleanText(candidate).match(pattern);
      if (match?.[1]) return match[1].replace(/\s+/g, "").replace("–", "-").toUpperCase();
    }
  }
  return null;
}

function extractScale(analysis: SharedPdfPageAnalysis) {
  const joined = analysis.textItems.map((item) => cleanText(item.text)).join(" | ");
  const labeled = joined.match(/(?:\bM\b|\bLÉPTÉK\b|\bLEPTEK\b)\s*[:.]?\s*1\s*[:/]\s*(\d{1,5})\b/i);
  const conventional = joined.match(/\b1\s*:\s*(\d{2,5})\b/);
  const match = labeled || conventional;
  return match?.[1] ? `1:${Number(match[1])}` : null;
}

function percentageDelta(left: number, right: number) {
  const base = Math.max(1, left, right);
  return Math.round((Math.abs(left - right) / base) * 100);
}

function textDiff(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis) {
  const leftMap = usefulTextItems(left);
  const rightMap = usefulTextItems(right);
  const leftKeys = new Set(leftMap.keys());
  const rightKeys = new Set(rightMap.keys());
  const common = [...leftKeys].filter((key) => rightKeys.has(key));
  const removedKeys = [...leftKeys].filter((key) => !rightKeys.has(key));
  const addedKeys = [...rightKeys].filter((key) => !leftKeys.has(key));
  const union = new Set([...leftKeys, ...rightKeys]).size;
  const similarityPercent = union ? Math.round((common.length / union) * 100) : 100;
  const important = (values: string[]) => values
    .map((key) => ({ key, display: leftMap.get(key) || rightMap.get(key) || key }))
    .sort((a, b) => b.display.length - a.display.length || a.display.localeCompare(b.display, "hu"))
    .slice(0, 12)
    .map((item) => item.display);
  return {
    commonCount: common.length,
    addedCount: addedKeys.length,
    removedCount: removedKeys.length,
    added: important(addedKeys),
    removed: important(removedKeys),
    similarityPercent,
  };
}

export function buildDeterministicCompareResult(input: {
  leftDocument: DriveDocument;
  rightDocument: DriveDocument;
  leftAnalysis: SharedPdfPageAnalysis;
  rightAnalysis: SharedPdfPageAnalysis;
  leftPageCount: number;
  rightPageCount: number;
}) : DeterministicCompareResult {
  const { leftDocument, rightDocument, leftAnalysis, rightAnalysis, leftPageCount, rightPageCount } = input;
  const leftCode = extractDrawingCode(leftDocument, leftAnalysis);
  const rightCode = extractDrawingCode(rightDocument, rightAnalysis);
  const leftScale = extractScale(leftAnalysis);
  const rightScale = extractScale(rightAnalysis);
  const texts = textDiff(leftAnalysis, rightAnalysis);
  const segmentDeltaPercent = percentageDelta(leftAnalysis.lineSegmentCount, rightAnalysis.lineSegmentCount);
  const contourDeltaPercent = percentageDelta(leftAnalysis.closedContourCount, rightAnalysis.closedContourCount);

  const checks: DeterministicCompareCheck[] = [];
  checks.push({
    key: "drawingCode", label: "Tervazonosító",
    status: leftCode && rightCode ? (leftCode === rightCode ? "MATCH" : "DIFFERENT") : "UNKNOWN",
    left: leftCode || "nem felismerhető", right: rightCode || "nem felismerhető",
    detail: leftCode && rightCode ? (leftCode === rightCode ? "Azonos tervazonosító." : "Eltérő tervazonosító; revíziópárként nem tekinthető automatikusan azonos tervnek.") : "A tervazonosító nem olvasható ki mindkét oldalból.",
  });
  checks.push({
    key: "scale", label: "Lépték",
    status: leftScale && rightScale ? (leftScale === rightScale ? "MATCH" : "DIFFERENT") : "UNKNOWN",
    left: leftScale || "nem felismerhető", right: rightScale || "nem felismerhető",
    detail: leftScale && rightScale ? (leftScale === rightScale ? "Azonos felismert lépték." : "Eltérő lépték; geometriai fedés csak illesztéssel értelmezhető.") : "A lépték nem olvasható ki biztosan mindkét PDF-ből.",
  });
  checks.push({
    key: "pageCount", label: "Oldalszám", status: leftPageCount === rightPageCount ? "MATCH" : "DIFFERENT",
    left: String(leftPageCount), right: String(rightPageCount),
    detail: leftPageCount === rightPageCount ? "Azonos oldalszám." : "A dokumentumok oldalszáma eltér.",
  });
  checks.push({
    key: "contentKind", label: "PDF tartalom", status: leftAnalysis.contentKind === rightAnalysis.contentKind ? "MATCH" : "DIFFERENT",
    left: leftAnalysis.contentKind, right: rightAnalysis.contentKind,
    detail: leftAnalysis.contentKind === rightAnalysis.contentKind ? "Azonos PDF tartalomtípus." : "Eltérő PDF tartalomtípus; a mérési pontosság különbözhet.",
  });
  checks.push({
    key: "text", label: "Szöveges egyezés", status: texts.similarityPercent >= 70 ? "MATCH" : texts.similarityPercent >= 35 ? "INFO" : "DIFFERENT",
    left: `${leftAnalysis.textItemCount} elem`, right: `${rightAnalysis.textItemCount} elem`,
    detail: `${texts.similarityPercent}% egyedi szöveges egyezés · +${texts.addedCount} / -${texts.removedCount} eltérő szövegelem.`,
  });
  checks.push({
    key: "geometry", label: "Vektorgeometria", status: segmentDeltaPercent <= 15 ? "MATCH" : segmentDeltaPercent <= 40 ? "INFO" : "DIFFERENT",
    left: `${leftAnalysis.lineSegmentCount} szakasz`, right: `${rightAnalysis.lineSegmentCount} szakasz`,
    detail: `Vonalszakasz-darabszám eltérés: ${segmentDeltaPercent}% · kontúr eltérés: ${contourDeltaPercent}%.`,
  });

  let score = 100;
  if (leftCode && rightCode && leftCode !== rightCode) score -= 65;
  else if (!leftCode || !rightCode) score -= 15;
  if (leftScale && rightScale && leftScale !== rightScale) score -= 15;
  else if (!leftScale || !rightScale) score -= 5;
  if (leftPageCount !== rightPageCount) score -= 10;
  if (leftAnalysis.contentKind !== rightAnalysis.contentKind) score -= 10;
  if (texts.similarityPercent < 35) score -= 15;
  else if (texts.similarityPercent < 70) score -= 7;
  if (segmentDeltaPercent > 40) score -= 10;
  else if (segmentDeltaPercent > 20) score -= 5;
  score = Math.max(0, Math.min(100, score));

  const explicitDifferentDocument = Boolean(leftCode && rightCode && leftCode !== rightCode);
  const status: DeterministicCompareStatus = explicitDifferentDocument || score < 45
    ? "DIFFERENT_DOCUMENT"
    : score >= 75 ? "LIKELY_REVISION_PAIR" : "REVIEW_REQUIRED";

  const headline = status === "DIFFERENT_DOCUMENT"
    ? "Nem valószínű, hogy ugyanazon terv revíziói"
    : status === "LIKELY_REVISION_PAIR"
      ? "A dokumentumok revízió-összehasonlításra alkalmasnak tűnnek"
      : "Az összehasonlíthatóság emberi ellenőrzést igényel";
  const reasons: string[] = [];
  if (leftCode && rightCode && leftCode !== rightCode) reasons.push(`eltérő tervazonosító (${leftCode} ↔ ${rightCode})`);
  if (leftScale && rightScale && leftScale !== rightScale) reasons.push(`eltérő lépték (${leftScale} ↔ ${rightScale})`);
  if (leftPageCount !== rightPageCount) reasons.push(`eltérő oldalszám (${leftPageCount} ↔ ${rightPageCount})`);
  reasons.push(`${texts.similarityPercent}% egyedi szöveges egyezés`);
  reasons.push(`${segmentDeltaPercent}% vonalszakasz-darabszám eltérés`);
  const summary = `${headline}. ${reasons.join(" · ")}. A minősítés szabályalapú, nem AI-vélemény és nem szakmai tervjóváhagyás.`;

  return {
    status, compatibilityScore: score, headline, summary,
    drawingCode: { left: leftCode, right: rightCode },
    scale: { left: leftScale, right: rightScale },
    checks, text: texts,
    geometry: {
      leftSegments: leftAnalysis.lineSegmentCount, rightSegments: rightAnalysis.lineSegmentCount, segmentDeltaPercent,
      leftContours: leftAnalysis.closedContourCount, rightContours: rightAnalysis.closedContourCount, contourDeltaPercent,
      leftParallelPairs: leftAnalysis.parallelWallPairCount, rightParallelPairs: rightAnalysis.parallelWallPairCount,
    },
  };
}
