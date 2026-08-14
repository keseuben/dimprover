import type { SharedPdfPageAnalysis, SharedPdfNormalizedPoint } from "@/components/viewers/pdfDocumentEngine";

export type DriveAutoAlignmentSource = "TEXT_LABELS" | "GEOMETRIC_NODES" | "VECTOR_CONTOURS";
export type DriveAutoAlignmentNodeKind = "CORNER" | "INTERSECTION";

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

type VectorContour = SharedPdfPageAnalysis["vectorContours"][number];

type ContourMatch = {
  key: string;
  a: VectorContour;
  b: VectorContour;
  aIndex: number;
  bIndex: number;
  score: number;
};

type GeometryNode = {
  key: string;
  kind: DriveAutoAlignmentNodeKind;
  point: SharedPdfNormalizedPoint;
  angleDegrees: number;
  weight: number;
};

type NormalizedSimilarity = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotationRadians: number;
};

type GeometrySegment = {
  a: SharedPdfNormalizedPoint;
  b: SharedPdfNormalizedPoint;
  length: number;
  contourIndex: number;
  edgeIndex: number;
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

function angleDifferenceDegrees(left: number, right: number) {
  let difference = Math.abs(left - right) % 180;
  if (difference > 90) difference = 180 - difference;
  return difference;
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
  const pool = [...pairs].sort((left, right) => right.weight - left.weight).slice(0, 24);
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

function proposalSpreadScore(selected: DriveAutoAlignmentPair[]) {
  if (selected.length < 2) return 0;
  const pairDistance = Math.min(distance(selected[0].a, selected[1].a), distance(selected[0].b, selected[1].b));
  const triangle = selected.length >= 3
    ? Math.min(triangleArea(selected[0].a, selected[1].a, selected[2].a), triangleArea(selected[0].b, selected[1].b, selected[2].b))
    : 0;
  return Number((pairDistance + triangle * 4).toFixed(3));
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
  return {
    source: "TEXT_LABELS",
    pairs: selected,
    evidenceCount: matches.length,
    spreadScore: proposalSpreadScore(selected),
    confidenceBase: selected.length === 3 ? 0.9 : 0.8,
    summary: `${selected.length} távoli, mindkét terven egyedi azonos felirat alapján`,
  };
}

function contourPoint(contour: VectorContour) {
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

function contourSimilarity(a: VectorContour, b: VectorContour) {
  const safeLog = (value: number) => Math.log(Math.max(1e-6, value));
  const aspectA = a.bounds.width / Math.max(1e-6, a.bounds.height);
  const aspectB = b.bounds.width / Math.max(1e-6, b.bounds.height);
  return Math.abs(safeLog(a.bounds.width) - safeLog(b.bounds.width))
    + Math.abs(safeLog(a.bounds.height) - safeLog(b.bounds.height))
    + Math.abs(safeLog(a.normalizedArea) - safeLog(b.normalizedArea)) * 0.6
    + Math.abs(safeLog(aspectA) - safeLog(aspectB)) * 0.35
    + Math.abs(a.points.length - b.points.length) / Math.max(8, a.points.length + b.points.length);
}

function matchUniqueContours(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis) {
  const leftContours = usableContours(left);
  const rightContours = usableContours(right);
  if (leftContours.length < 2 || rightContours.length < 2) return [] as ContourMatch[];

  const matches: ContourMatch[] = [];
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

    matches.push({
      key: `kontur-${aIndex}-${best.bIndex}`,
      a: leftContours[aIndex],
      b: best.contour,
      aIndex,
      bIndex: best.bIndex,
      score: best.score,
    });
  }
  return matches;
}

function contourCenterPairs(matches: ContourMatch[]) {
  return matches.map((match) => ({
    key: match.key,
    source: "VECTOR_CONTOURS" as const,
    a: contourPoint(match.a),
    b: contourPoint(match.b),
    weight: Math.max(0.5, 1.4 - match.score * 4),
  }));
}

function solveNormalizedSimilarity(pairs: DriveAutoAlignmentPair[]): NormalizedSimilarity | null {
  if (pairs.length < 2) return null;
  const centroidA = {
    x: pairs.reduce((sum, pair) => sum + pair.a.x, 0) / pairs.length,
    y: pairs.reduce((sum, pair) => sum + pair.a.y, 0) / pairs.length,
  };
  const centroidB = {
    x: pairs.reduce((sum, pair) => sum + pair.b.x, 0) / pairs.length,
    y: pairs.reduce((sum, pair) => sum + pair.b.y, 0) / pairs.length,
  };
  let dot = 0;
  let cross = 0;
  let denominator = 0;
  for (const pair of pairs) {
    const bx = pair.b.x - centroidB.x;
    const by = pair.b.y - centroidB.y;
    const ax = pair.a.x - centroidA.x;
    const ay = pair.a.y - centroidA.y;
    dot += bx * ax + by * ay;
    cross += bx * ay - by * ax;
    denominator += bx * bx + by * by;
  }
  if (denominator < 0.00005) return null;
  const scale = Math.hypot(dot, cross) / denominator;
  if (!Number.isFinite(scale) || scale <= 0 || scale < 0.65 || scale > 1.45) return null;
  const rotationRadians = Math.atan2(cross, dot);
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const rotatedB = {
    x: (centroidB.x * cosine - centroidB.y * sine) * scale,
    y: (centroidB.x * sine + centroidB.y * cosine) * scale,
  };
  return {
    offsetX: centroidA.x - rotatedB.x,
    offsetY: centroidA.y - rotatedB.y,
    scale,
    rotationRadians,
  };
}

function applyNormalizedSimilarity(point: SharedPdfNormalizedPoint, transform: NormalizedSimilarity) {
  const cosine = Math.cos(transform.rotationRadians);
  const sine = Math.sin(transform.rotationRadians);
  return {
    x: (point.x * cosine - point.y * sine) * transform.scale + transform.offsetX,
    y: (point.x * sine + point.y * cosine) * transform.scale + transform.offsetY,
  };
}

function contourSegments(analysis: SharedPdfPageAnalysis) {
  const segments: GeometrySegment[] = [];
  usableContours(analysis).forEach((contour, contourIndex) => {
    for (let edgeIndex = 0; edgeIndex < contour.points.length; edgeIndex += 1) {
      const a = contour.points[edgeIndex];
      const b = contour.points[(edgeIndex + 1) % contour.points.length];
      const length = distance(a, b);
      if (length < 0.008 || length > 0.5) continue;
      segments.push({ a, b, length, contourIndex, edgeIndex });
    }
  });
  return segments.sort((left, right) => right.length - left.length).slice(0, 700);
}

function cornerAngleDegrees(previous: SharedPdfNormalizedPoint, center: SharedPdfNormalizedPoint, next: SharedPdfNormalizedPoint) {
  const first = { x: previous.x - center.x, y: previous.y - center.y };
  const second = { x: next.x - center.x, y: next.y - center.y };
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);
  if (firstLength < 1e-6 || secondLength < 1e-6) return 180;
  const cosine = Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / (firstLength * secondLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function buildCornerNodes(analysis: SharedPdfPageAnalysis) {
  const nodes: GeometryNode[] = [];
  usableContours(analysis).forEach((contour, contourIndex) => {
    const points = contour.points;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length];
      const point = points[index];
      const next = points[(index + 1) % points.length];
      const previousLength = distance(previous, point);
      const nextLength = distance(point, next);
      const minimumArm = Math.min(previousLength, nextLength);
      if (minimumArm < 0.009) continue;
      const angleDegrees = cornerAngleDegrees(previous, point, next);
      if (angleDegrees < 24 || angleDegrees > 156) continue;
      const orthogonalBonus = Math.max(0, 1 - Math.abs(angleDegrees - 90) / 70);
      const weight = Math.min(2.2, 0.75 + minimumArm * 9 + orthogonalBonus * 0.55);
      nodes.push({
        key: `sarok-${contourIndex}-${index}`,
        kind: "CORNER",
        point,
        angleDegrees,
        weight,
      });
    }
  });
  return nodes.sort((left, right) => right.weight - left.weight).slice(0, 280);
}

function segmentIntersection(first: GeometrySegment, second: GeometrySegment) {
  const x1 = first.a.x;
  const y1 = first.a.y;
  const x2 = first.b.x;
  const y2 = first.b.y;
  const x3 = second.a.x;
  const y3 = second.a.y;
  const x4 = second.b.x;
  const y4 = second.b.y;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
  if (t <= 0.035 || t >= 0.965 || u <= 0.035 || u >= 0.965) return null;
  const point = { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  const firstAngle = Math.atan2(first.b.y - first.a.y, first.b.x - first.a.x) * 180 / Math.PI;
  const secondAngle = Math.atan2(second.b.y - second.a.y, second.b.x - second.a.x) * 180 / Math.PI;
  const crossingAngle = angleDifferenceDegrees(firstAngle, secondAngle);
  if (crossingAngle < 22 || crossingAngle > 90) return null;
  return { point, angleDegrees: crossingAngle };
}

function buildIntersectionNodes(analysis: SharedPdfPageAnalysis) {
  const segments = contourSegments(analysis).filter((segment) => segment.length >= 0.018).slice(0, 320);
  const nodes: GeometryNode[] = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    const first = segments[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const second = segments[secondIndex];
      if (first.contourIndex === second.contourIndex) continue;
      const hit = segmentIntersection(first, second);
      if (!hit) continue;
      const duplicate = nodes.find((node) => distance(node.point, hit.point) < 0.0035);
      if (duplicate) {
        duplicate.weight = Math.min(2.6, duplicate.weight + 0.18);
        continue;
      }
      const orthogonalBonus = Math.max(0, 1 - Math.abs(hit.angleDegrees - 90) / 68);
      nodes.push({
        key: `metszes-${firstIndex}-${secondIndex}`,
        kind: "INTERSECTION",
        point: hit.point,
        angleDegrees: hit.angleDegrees,
        weight: Math.min(2.5, 1.15 + Math.min(first.length, second.length) * 5 + orthogonalBonus * 0.55),
      });
      if (nodes.length >= 180) return nodes.sort((left, right) => right.weight - left.weight);
    }
  }
  return nodes.sort((left, right) => right.weight - left.weight);
}

function buildGeometryNodes(analysis: SharedPdfPageAnalysis) {
  return [...buildIntersectionNodes(analysis), ...buildCornerNodes(analysis)]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 360);
}

function matchGeometryNodes(leftNodes: GeometryNode[], rightNodes: GeometryNode[], transform: NormalizedSimilarity) {
  const candidates: Array<{ pair: DriveAutoAlignmentPair; score: number; aKey: string; bKey: string }> = [];
  const transformedRight = rightNodes.map((node) => ({ node, mapped: applyNormalizedSimilarity(node.point, transform) }));

  for (const leftNode of leftNodes) {
    const ranked = transformedRight
      .filter(({ node }) => node.kind === leftNode.kind)
      .map(({ node, mapped }) => {
        const positionalDistance = distance(leftNode.point, mapped);
        const angleDifference = angleDifferenceDegrees(leftNode.angleDegrees, node.angleDegrees);
        const score = positionalDistance + angleDifference / 900 + Math.abs(leftNode.weight - node.weight) * 0.012;
        return { node, mapped, positionalDistance, angleDifference, score };
      })
      .filter((entry) => entry.positionalDistance <= 0.055 && entry.angleDifference <= 18)
      .sort((a, b) => a.score - b.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best) continue;
    if (second && second.score < best.score * 1.28 + 0.006) continue;

    const reciprocal = leftNodes
      .filter((node) => node.kind === best.node.kind)
      .map((node) => ({ node, score: distance(node.point, best.mapped) + angleDifferenceDegrees(node.angleDegrees, best.node.angleDegrees) / 900 }))
      .sort((a, b) => a.score - b.score)[0];
    if (!reciprocal || reciprocal.node.key !== leftNode.key) continue;

    candidates.push({
      aKey: leftNode.key,
      bKey: best.node.key,
      score: best.score,
      pair: {
        key: `${leftNode.kind.toLowerCase()}-${leftNode.key}-${best.node.key}`,
        source: "GEOMETRIC_NODES",
        a: leftNode.point,
        b: best.node.point,
        weight: Math.max(0.7, (leftNode.weight + best.node.weight) / 2 - best.score * 3),
      },
    });
  }

  const usedA = new Set<string>();
  const usedB = new Set<string>();
  return candidates
    .sort((left, right) => left.score - right.score || right.pair.weight - left.pair.weight)
    .filter((candidate) => {
      if (usedA.has(candidate.aKey) || usedB.has(candidate.bKey)) return false;
      usedA.add(candidate.aKey);
      usedB.add(candidate.bKey);
      return true;
    })
    .map((candidate) => candidate.pair);
}

function geometricNodeProposal(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis): DriveAutoAlignmentPairProposal | null {
  const contourMatches = matchUniqueContours(left, right);
  const coarsePairs = selectSpreadPairs(contourCenterPairs(contourMatches));
  if (coarsePairs.length < 2) return null;
  const coarseTransform = solveNormalizedSimilarity(coarsePairs);
  if (!coarseTransform) return null;

  const leftNodes = buildGeometryNodes(left);
  const rightNodes = buildGeometryNodes(right);
  if (leftNodes.length < 2 || rightNodes.length < 2) return null;
  const matchedNodes = matchGeometryNodes(leftNodes, rightNodes, coarseTransform);
  const selected = selectSpreadPairs(matchedNodes);
  if (selected.length < 2) return null;

  const intersectionCount = selected.filter((pair) => pair.key.startsWith("intersection-") || pair.key.startsWith("metszes-")).length;
  const cornerCount = selected.length - intersectionCount;
  const details = [
    intersectionCount ? `${intersectionCount} metszéspont` : "",
    cornerCount ? `${cornerCount} sarok/csomópont` : "",
  ].filter(Boolean).join(" + ");

  return {
    source: "GEOMETRIC_NODES",
    pairs: selected,
    evidenceCount: matchedNodes.length,
    spreadScore: proposalSpreadScore(selected),
    confidenceBase: selected.length === 3 ? 0.82 : 0.72,
    summary: `${selected.length} geometriai referencia (${details}) kölcsönös egyezése alapján`,
  };
}

function contourProposal(left: SharedPdfPageAnalysis, right: SharedPdfPageAnalysis): DriveAutoAlignmentPairProposal | null {
  const rawMatches = contourCenterPairs(matchUniqueContours(left, right));
  const selected = selectSpreadPairs(rawMatches);
  if (selected.length < 2) return null;
  return {
    source: "VECTOR_CONTOURS",
    pairs: selected,
    evidenceCount: rawMatches.length,
    spreadScore: proposalSpreadScore(selected),
    confidenceBase: selected.length === 3 ? 0.72 : 0.62,
    summary: `${selected.length} egyedi vektoros kontúrközéppont geometriai hasonlósága alapján`,
  };
}

export function buildDriveAutoAlignmentPairProposals(
  left: SharedPdfPageAnalysis,
  right: SharedPdfPageAnalysis,
): DriveAutoAlignmentPairProposal[] {
  const candidates: DriveAutoAlignmentPairProposal[] = [];
  const text = textProposal(left, right);
  if (text) candidates.push(text);
  if (left.contentKind !== "raster" && right.contentKind !== "raster") {
    const geometry = geometricNodeProposal(left, right);
    if (geometry) candidates.push(geometry);
    const contour = contourProposal(left, right);
    if (contour) candidates.push(contour);
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const signature = `${candidate.source}:${candidate.pairs.map((pair) => pair.key).join("|")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).slice(0, 3);
}

export function buildDriveAutoAlignmentPairProposal(
  left: SharedPdfPageAnalysis,
  right: SharedPdfPageAnalysis,
): DriveAutoAlignmentPairProposal | null {
  return buildDriveAutoAlignmentPairProposals(left, right)[0] || null;
}
