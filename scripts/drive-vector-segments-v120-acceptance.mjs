import assert from "node:assert/strict";
import { buildDriveAutoAlignmentPairProposals } from "../components/drive/driveAutoAlignment.ts";

let pass = 0;
function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`);
  pass += 1;
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

function angleDegrees(a, b) {
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  while (angle < 0) angle += 180;
  while (angle >= 180) angle -= 180;
  return angle;
}

function segment(a, b, pathIndex, source = "openPath") {
  return {
    a,
    b,
    length: Math.hypot(b.x - a.x, b.y - a.y),
    angleDegrees: angleDegrees(a, b),
    source,
    pathIndex,
    segmentIndex: 0,
  };
}

function transformPoint(point, transform) {
  const radians = transform.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: (point.x * cosine - point.y * sine) * transform.scale + transform.offsetX,
    y: (point.x * sine + point.y * cosine) * transform.scale + transform.offsetY,
  };
}

function analysis(vectorSegments) {
  return {
    contentKind: "vector",
    vectorPathCount: vectorSegments.length,
    rasterImageCount: 0,
    textItemCount: 0,
    lineSegmentCount: vectorSegments.length,
    closedContourCount: 0,
    openContourCount: vectorSegments.length,
    stitchedContourCount: 0,
    parallelWallPairCount: 0,
    vectorContours: [],
    vectorSegments,
    textItems: [],
  };
}

function solveSimilarity(pairs) {
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
  const scale = Math.hypot(dot, cross) / denominator;
  const rotationRadians = Math.atan2(cross, dot);
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const mappedB = {
    x: (centroidB.x * cosine - centroidB.y * sine) * scale,
    y: (centroidB.x * sine + centroidB.y * cosine) * scale,
  };
  return {
    scale,
    rotationDegrees: rotationRadians * 180 / Math.PI,
    offsetX: centroidA.x - mappedB.x,
    offsetY: centroidA.y - mappedB.y,
  };
}

const rightBase = [
  segment({ x: 0.10, y: 0.16 }, { x: 0.36, y: 0.16 }, 0),
  segment({ x: 0.18, y: 0.28 }, { x: 0.53, y: 0.34 }, 1),
  segment({ x: 0.22, y: 0.50 }, { x: 0.59, y: 0.50 }, 2),
  segment({ x: 0.66, y: 0.18 }, { x: 0.66, y: 0.48 }, 3),
  segment({ x: 0.31, y: 0.68 }, { x: 0.58, y: 0.77 }, 4),
  segment({ x: 0.08, y: 0.78 }, { x: 0.29, y: 0.64 }, 5),
  segment({ x: 0.73, y: 0.58 }, { x: 0.91, y: 0.72 }, 6),
];
const expected = { scale: 1.045, rotationDegrees: 6.5, offsetX: 0.035, offsetY: -0.028 };
const leftBase = rightBase.map((item, index) => segment(transformPoint(item.a, expected), transformPoint(item.b, expected), index));
rightBase.push(segment({ x: 0.70, y: 0.82 }, { x: 0.84, y: 0.86 }, 50));
leftBase.push(segment({ x: 0.05, y: 0.90 }, { x: 0.19, y: 0.84 }, 60));

const proposals = buildDriveAutoAlignmentPairProposals(analysis(leftBase), analysis(rightBase));
const segmentProposal = proposals.find((item) => item.source === "VECTOR_SEGMENTS");
check("VECTOR_SEGMENTS proposal létrejön", Boolean(segmentProposal), proposals.map((item) => item.source).join(","));
check("Szegmens proposal legalább 3 evidencia", segmentProposal.evidenceCount >= 3, `evidence=${segmentProposal.evidenceCount}`);
check("Szegmens proposal 2/3 távoli pár", segmentProposal.pairs.length >= 2 && segmentProposal.pairs.length <= 3, `pairs=${segmentProposal.pairs.length}`);
check("Szegmens párok source metaadata", segmentProposal.pairs.every((pair) => pair.source === "VECTOR_SEGMENTS"));
check("Szegmens párok kulcsa auditálható", segmentProposal.pairs.every((pair) => pair.key.startsWith("szegmens-")));
check("Szegmens proposal térbeli szórása", segmentProposal.spreadScore >= 0.14, `spread=${segmentProposal.spreadScore}`);
const solved = solveSimilarity(segmentProposal.pairs);
check("Szegmens Auto Align skála közelítő", Math.abs(solved.scale - expected.scale) < 0.025, `got=${solved.scale.toFixed(4)}`);
check("Szegmens Auto Align forgatás közelítő", Math.abs(solved.rotationDegrees - expected.rotationDegrees) < 1.5, `got=${solved.rotationDegrees.toFixed(2)}°`);
check("Szegmens Auto Align X eltolás közelítő", Math.abs(solved.offsetX - expected.offsetX) < 0.025, `got=${solved.offsetX.toFixed(4)}`);
check("Szegmens Auto Align Y eltolás közelítő", Math.abs(solved.offsetY - expected.offsetY) < 0.025, `got=${solved.offsetY.toFixed(4)}`);

const tooFew = buildDriveAutoAlignmentPairProposals(analysis(leftBase.slice(0, 2)), analysis(rightBase.slice(0, 2)));
check("Két nyitott vonal nem elég automatikus proposalhoz", !tooFew.some((item) => item.source === "VECTOR_SEGMENTS"));

const closedOnly = rightBase.slice(0, 6).map((item, index) => ({ ...item, source: "closedPath", pathIndex: index }));
const closedLeft = closedOnly.map((item, index) => segment(transformPoint(item.a, expected), transformPoint(item.b, expected), index, "closedPath"));
const closedProposals = buildDriveAutoAlignmentPairProposals(analysis(closedLeft), analysis(closedOnly));
check("VECTOR_SEGMENTS nem használ zárt path vonalakat", !closedProposals.some((item) => item.source === "VECTOR_SEGMENTS"));

console.log(`SUMMARY ${pass}/${pass} PASS`);
