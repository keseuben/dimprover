import type { SharedPdfPageAnalysis, SharedPdfNormalizedPoint } from "@/components/viewers/pdfDocumentEngine";

export type DriveAutoAlignmentSource = "TEXT_LABELS" | "VECTOR_CONTOURS";

export type DriveAutoAlignmentPair = {
  key: string;
  source: DriveAutoAlignmentSource;
  a: SharedPdfNormalizedPoint;
  b: SharedPdfNormalizedPoint;
  weight: number;
};

export type DriveAutoAlignmentPairProposal = {
  source: DriveAutoAlignmentSource;
  pairs: DriveAutoAlignmentPair[];
  evidenceCount: number;
  spreadScore: number;
  confidenceBase: number;
  summary: string;
};

type Feature = {
  key: string;
  point: SharedPdfNormalizedPoint;
  weight: number;
};

const ignoredText = new Set([
  "DIMPRO",
  "ALAPRAJZ",
  "METSZET",
  "HOMLOKZAT",
  "TERV",
  "TERVLAP",
  "REVIZIO",
  "REVÍZIÓ",
  "DATUM",
  "DÁTUM",
  "LEPTEK",
  "LÉPTÉK",
  "MEGRENDELO",
  "MEGRENDELŐ",
  "TERVEZO",
  "TERVEZŐ",
]);

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("hu-HU")
    .replace(/[–—]/g, "-")
    .replace(/[^0-9A-ZÁÉÍÓÖŐÚÜŰ/_.+\- ]/giu, "")
    .trim();
}

function isUsableText(value: string) {
  const text = normalizeText(value);
  if (text.length < 3 || text.length > 56) return false;
  if (ignoredText.has(text)) return false;
  if (/^[\d\s.,+\-/%°]+$/u.test(text)) return false;
  if (/^(?:REV\.?\s*)?\d+(?:\.\d+)*$/iu.test(text)) return false;
  return true;
}

function centerOfText(item: SharedPdfPageAnalysis["textItems"][number]) {
  return {
    x: Math.min(1, Math.max(0, item.x + item.width / 2)),
    y: Math.min(1, Math.max(0, item.y + item.height / 2)),
  };
}

function distance(a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function triangleArea(a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint, c: SharedPdfNormalizedPoint) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

function uniqueTextFeatures(analysis: SharedPdfPageAnalysis) {
  const grouped = new Map<string, Feature[]>();
  for (const item of analysis.textItems) {
    if (!isUsableText(item.text)) continue;
    const key = normalizeText(item.text);
    const point = centerOfText(item);
    const marginPenalty = point.x > 0.76 && point.y > 0.68 ? 0.55 : 1;
    const weight = Math.min(2.4, Math.max(0.6, key.length / 12)) * marginPenalty;
    const feature = { key, point, weight };
    grouped.set(key, [...(grouped.get(key) || []), feature]);
  }
  return new Map([...grouped].filter(([, features]) => features.length === 1).map(([key, features]) => [key, features[0]]));
}

function selectSpreadPairs(pairs: DriveAutoAlignmentPair[]) {
  if (pairs.length < 2) return [];
  const pool = [...pairs].sort((left, right) => right.weight - left.weight).slice(0, 18);
  let bestTwo: [DriveAutoAlignmentPair, DriveAutoAlignmentPair] | null = null;
  let bestTwoScore = -1;
  for (let first = 0; first < pool.length; first += 1) {
    for (let second = first + 1; second < pool.length; second += 1) {
      const aDistance = distance(pool[first].a, pool[second].a);
      const bDistance = distance(pool[first].b, pool[second].b);
      const spread = Math.min(aDistance, bDistance);
      if (spread < 0.12) continue;
      const score = spread * (pool[first].weight + pool[second].weight);
      if (score > bestTwoScore) {
        bestTwoScore = score;
        bestTwo = [pool[first], pool[second]];
      }
    }
  }
  if (!bestTwo) return [];

  let bestThird: DriveAutoAlignmentPair | null = null;
  let bestThirdScore = -1;
  for (const candidate of pool) {
    if (bestTwo.includes(candidate)) continue;
    const areaA = triangleArea(bestTwo[0].a, bestTwo[1].a, candidate.a);
    const areaB = triangleArea(bestTwo[0].b, bestTwo[1].b, candidate.b);
    const area = Math.min(areaA, areaB);
    const minimumDistance = Math.min(
      distance(candidate.a, bestTwo[0].a),
      distance(candidate.a, bestTwo[1].a),
      distance(candidate.b, bestTwo[0].b),
      distance(candidate.b, bestTwo[1].b),
    );
    if (minimumDistance < 0.08 || area < 0.006) continue;
    const score = area * 8 + minimumDistance + candidate.weight * 0.15;
    if (score > bestThirdScore) {
      bestThirdScore = score;
      bestThird = candidate;
    }
  }
  return bestThird ? [...bestTwo, bestThird] : [...bestTwo];
}

function textProposal(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis): DriveAutoAlignmentPairProposal | null {
  const leftFeatures = uniqueTextFeatures(left);
  const rightFeatures = uniqueTextFeatures(right);
  const matches: DriveAutoAlignmentPair[] = [];
  for (const [key, aFeature] of leftFeatures) {
    const bFeature = rightFeatures.get(key);
    if (!bFeature) continue;
    matches.push({
      key,
      source: "TEXT_LABELS",
      a: aFeature.point,
      b: bFeature.point,
      weight: (aFeature.weight + bFeature.weight) / 2,
    });
  }
  const selected = selectSpreadPairs(matches);
  if (selected.length < 2) return null;
  const pairDistance = Math.min(distance(selected[0].a, selected[1].a), distance(selected[0].b, selected[1].b));
  const triangle = selected.length >= 3
    ? Math.min(triangleArea(selected[0].a, selected[1].a, selected[2].a), triangleArea(selected[0].b, selected[1].b, selected[2].b))
    : 0;
  return {
    source: "TEXT_LABELS",
    pairs: selected,
    evidenceCount: matches.length,
    spreadScore: Number((pairDistance + triangle * 4).toFixed(3)),
    confidenceBase: selected.length === 3 ? 0.9 : 0.8,
    summary: `${selected.length} távoli, mindkét terven egyedi azonos felirat alapján`,
  };
}

function contourPoint(contour: SharedPdfPageAnalysis["vectorContours"][number]) {
  return {
    x: contour.bounds.x + contour.bounds.width / 2,
    y: contour.bounds.y + contour.bounds.height / 2,
  };
}

function usableContours(analysis: SharedPdfPageAnalysis) {
  return analysis.vectorContours.filter((contour) => {
    const { width, height } = contour.bounds;
    return contour.closed
      && contour.points.length >= 4
      && contour.points.length <= 120
      && width >= 0.012
      && height >= 0.012
      && width <= 0.55
      && height <= 0.55
      && contour.normalizedArea >= 0.00008
      && contour.normalizedArea <= 0.22;
  }).slice(0, 500);
}

function contourSimilarity(
  a: SharedPdfPageAnalysis["vectorContours"][number],
  b: SharedPdfPageAnalysis["vectorContours"][number],
) {
  const safeLog = (value: number) => Math.log(Math.max(1e-6, value));
  const aspectA = a.bounds.width / Math.max(1e-6, a.bounds.height);
  const aspectB = b.bounds.width / Math.max(1e-6, b.bounds.height);
  return Math.abs(safeLog(a.bounds.width) - safeLog(b.bounds.width))
    + Math.abs(safeLog(a.bounds.height) - safeLog(b.bounds.height))
    + Math.abs(safeLog(a.normalizedArea) - safeLog(b.normalizedArea)) * 0.6
    + Math.abs(safeLog(aspectA) - safeLog(aspectB)) * 0.35
    + Math.abs(a.points.length - b.points.length) / Math.max(8, a.points.length + b.points.length);
}

function contourProposal(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis): DriveAutoAlignmentPairProposal | null {
  const leftContours = usableContours(left);
  const rightContours = usableContours(right);
  if (leftContours.length < 2 || rightContours.length < 2) return null;

  const rawMatches: DriveAutoAlignmentPair[] = [];
  for (let aIndex = 0; aIndex < leftContours.length; aIndex += 1) {
    const ranked = rightContours
      .map((contour, bIndex) => ({ contour, bIndex, score: contourSimilarity(leftContours[aIndex], contour) }))
      .sort((a, b) => a.score - b.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score > 0.2) continue;
    if (second && second.score < best.score * 1.45 + 0.035) continue;

    const reciprocal = leftContours
      .map((contour, index) => ({ index, score: contourSimilarity(contour, best.contour) }))
      .sort((a, b) => a.score - b.score)[0];
    if (!reciprocal || reciprocal.index !== aIndex) continue;

    rawMatches.push({
      key: `kontur-${aIndex}-${best.bIndex}`,
      source: "VECTOR_CONTOURS",
      a: contourPoint(leftContours[aIndex]),
      b: contourPoint(best.contour),
      weight: Math.max(0.5, 1.4 - best.score * 4),
    });
  }

  const selected = selectSpreadPairs(rawMatches);
  if (selected.length < 2) return null;
  const pairDistance = Math.min(distance(selected[0].a, selected[1].a), distance(selected[0].b, selected[1].b));
  const triangle = selected.length >= 3
    ? Math.min(triangleArea(selected[0].a, selected[1].a, selected[2].a), triangleArea(selected[0].b, selected[1].b, selected[2].b))
    : 0;
  return {
    source: "VECTOR_CONTOURS",
    pairs: selected,
    evidenceCount: rawMatches.length,
    spreadScore: Number((pairDistance + triangle * 4).toFixed(3)),
    confidenceBase: selected.length === 3 ? 0.72 : 0.62,
    summary: `${selected.length} egyedi vektoros kontúrközéppont geometriai hasonlósága alapján`,
  };
}

export function buildDriveAutoAlignmentPairProposal(
  left: SharedPdfPageAnalysis,
  right: SharedPdfPageAnalysis,
): DriveAutoAlignmentPairProposal | null {
  const text = textProposal(left, right);
  if (text) return text;
  if (left.contentKind === "raster" || right.contentKind === "raster") return null;
  return contourProposal(left, right);
}
