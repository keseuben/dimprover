export type SharedPdfViewport = {
  width: number;
  height: number;
  transform?: number[];
};

export type SharedPdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

export type SharedPdfPage = {
  getViewport: (options: { scale: number; rotation?: number }) => SharedPdfViewport;
  render: (options: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: SharedPdfViewport }) => { promise: Promise<void>; cancel?: () => void };
  getTextContent: () => Promise<{ items: SharedPdfTextItem[] }>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
};

export type SharedPdfDocument = {
  numPages: number;
  fingerprints?: string[];
  getPage: (pageNumber: number) => Promise<SharedPdfPage>;
  destroy?: () => Promise<void> | void;
};

export type SharedPdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  OPS?: Record<string, number>;
  getDocument: (source: string | ArrayBuffer | Uint8Array | { url?: string; data?: ArrayBuffer | Uint8Array }) => { promise: Promise<SharedPdfDocument>; destroy?: () => void };
};

export type SharedPdfNormalizedPoint = {
  x: number;
  y: number;
};

export type SharedPdfVectorContour = {
  points: SharedPdfNormalizedPoint[];
  closed: boolean;
  source: "directPath" | "stitchedSegments";
  normalizedArea: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type SharedPdfVectorSegment = {
  a: SharedPdfNormalizedPoint;
  b: SharedPdfNormalizedPoint;
  length: number;
  angleDegrees: number;
  source: "openPath" | "closedPath";
  pathIndex: number;
  segmentIndex: number;
};

let sharedPdfModulePromise: Promise<SharedPdfJsModule> | null = null;

export async function loadSharedPdfJs(): Promise<SharedPdfJsModule> {
  if (!sharedPdfModulePromise) {
    sharedPdfModulePromise = import("pdfjs-dist").then((module) => {
      const pdfModule = module as unknown as SharedPdfJsModule;
      pdfModule.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfModule;
    });
  }
  return sharedPdfModulePromise;
}

export async function loadSharedPdfDocument(source: string | ArrayBuffer | Uint8Array) {
  const pdfJs = await loadSharedPdfJs();
  const loadingTask = typeof source === "string"
    ? pdfJs.getDocument({ url: source })
    : pdfJs.getDocument({ data: source instanceof Uint8Array ? source : new Uint8Array(source) });
  return loadingTask.promise;
}

export async function renderSharedPdfPage(input: {
  page: SharedPdfPage;
  canvas: HTMLCanvasElement;
  scale?: number;
  rotation?: number;
  maximumPixelDimension?: number;
}) {
  const baseViewport = input.page.getViewport({ scale: input.scale || 1, rotation: input.rotation || 0 });
  const maximumPixelDimension = input.maximumPixelDimension || 3200;
  const dimensionScale = Math.min(1, maximumPixelDimension / Math.max(baseViewport.width, baseViewport.height));
  const viewport = dimensionScale < 1
    ? input.page.getViewport({ scale: (input.scale || 1) * dimensionScale, rotation: input.rotation || 0 })
    : baseViewport;
  const canvas = input.canvas;
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("A PDF vászon 2D rajzolási környezete nem érhető el.");
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  const task = input.page.render({ canvasContext: context, canvas, viewport });
  await task.promise;
  return viewport;
}

export type SharedPdfPageAnalysis = {
  contentKind: "vector" | "raster" | "mixed";
  vectorPathCount: number;
  rasterImageCount: number;
  textItemCount: number;
  lineSegmentCount: number;
  closedContourCount: number;
  openContourCount: number;
  stitchedContourCount: number;
  parallelWallPairCount: number;
  vectorContours: SharedPdfVectorContour[];
  vectorSegments: SharedPdfVectorSegment[];
  textItems: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

type PdfMatrix = [number, number, number, number, number, number];
type RawVectorPath = {
  points: SharedPdfNormalizedPoint[];
  closed: boolean;
};
type VectorSegment = SharedPdfVectorSegment;

const IDENTITY_MATRIX: PdfMatrix = [1, 0, 0, 1, 0, 0];
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUADRATIC_CURVE_TO = 3;
const DRAW_CLOSE_PATH = 4;

function countOperator(fnArray: number[], candidates: Array<number | undefined>) {
  const ids = new Set(candidates.filter((value): value is number => typeof value === "number"));
  return fnArray.reduce((sum, value) => sum + (ids.has(value) ? 1 : 0), 0);
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function multiplyMatrices(left: PdfMatrix, right: PdfMatrix): PdfMatrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPoint(matrix: PdfMatrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function normalizedViewportPoint(viewport: SharedPdfViewport, currentTransform: PdfMatrix, x: number, y: number): SharedPdfNormalizedPoint {
  const pagePoint = transformPoint(currentTransform, x, y);
  const viewportTransform = Array.isArray(viewport.transform) && viewport.transform.length >= 6
    ? viewport.transform.slice(0, 6).map((value) => finiteNumber(value)) as PdfMatrix
    : [1, 0, 0, -1, 0, viewport.height] as PdfMatrix;
  const displayPoint = transformPoint(viewportTransform, pagePoint.x, pagePoint.y);
  return {
    x: clamp01(displayPoint.x / Math.max(1, viewport.width)),
    y: clamp01(displayPoint.y / Math.max(1, viewport.height)),
  };
}

function pointDistance(a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function nearlySamePoint(a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint, tolerance = 0.0002) {
  return pointDistance(a, b) <= tolerance;
}

function appendPoint(points: SharedPdfNormalizedPoint[], point: SharedPdfNormalizedPoint) {
  if (!points.length || !nearlySamePoint(points[points.length - 1], point)) points.push(point);
}

function quadraticPoint(
  start: SharedPdfNormalizedPoint,
  control: SharedPdfNormalizedPoint,
  end: SharedPdfNormalizedPoint,
  t: number,
) {
  const oneMinus = 1 - t;
  return {
    x: oneMinus * oneMinus * start.x + 2 * oneMinus * t * control.x + t * t * end.x,
    y: oneMinus * oneMinus * start.y + 2 * oneMinus * t * control.y + t * t * end.y,
  };
}

function cubicPoint(
  start: SharedPdfNormalizedPoint,
  control1: SharedPdfNormalizedPoint,
  control2: SharedPdfNormalizedPoint,
  end: SharedPdfNormalizedPoint,
  t: number,
) {
  const oneMinus = 1 - t;
  return {
    x: oneMinus ** 3 * start.x + 3 * oneMinus * oneMinus * t * control1.x + 3 * oneMinus * t * t * control2.x + t ** 3 * end.x,
    y: oneMinus ** 3 * start.y + 3 * oneMinus * oneMinus * t * control1.y + 3 * oneMinus * t * t * control2.y + t ** 3 * end.y,
  };
}

function contourArea(points: SharedPdfNormalizedPoint[]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function contourBounds(points: SharedPdfNormalizedPoint[]) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function normalizeContour(points: SharedPdfNormalizedPoint[]) {
  const normalized: SharedPdfNormalizedPoint[] = [];
  for (const point of points) appendPoint(normalized, { x: clamp01(point.x), y: clamp01(point.y) });
  if (normalized.length > 2 && nearlySamePoint(normalized[0], normalized[normalized.length - 1])) normalized.pop();
  return normalized;
}

function createContour(points: SharedPdfNormalizedPoint[], closed: boolean, source: SharedPdfVectorContour["source"]): SharedPdfVectorContour | null {
  const normalized = normalizeContour(points);
  if (normalized.length < 3) return null;
  const area = contourArea(normalized);
  const bounds = contourBounds(normalized);
  if (area < 0.000002 || bounds.width < 0.001 || bounds.height < 0.001) return null;
  if (area > 0.98 || bounds.width > 0.999 || bounds.height > 0.999) return null;
  return { points: normalized, closed, source, normalizedArea: area, bounds };
}

function extractConstructPathData(args: unknown) {
  if (!Array.isArray(args) || args.length < 2) return null;
  const dataContainer = args[1];
  if (Array.isArray(dataContainer)) {
    const first = dataContainer[0];
    if (ArrayBuffer.isView(first) || Array.isArray(first)) return Array.from(first as ArrayLike<number>).map((value) => finiteNumber(value));
  }
  if (ArrayBuffer.isView(dataContainer) || Array.isArray(dataContainer)) return Array.from(dataContainer as ArrayLike<number>).map((value) => finiteNumber(value));
  return null;
}

function extractVectorPaths(
  operatorList: { fnArray: number[]; argsArray: unknown[] },
  ops: Record<string, number>,
  viewport: SharedPdfViewport,
) {
  const paths: RawVectorPath[] = [];
  const transformStack: PdfMatrix[] = [];
  let currentTransform: PdfMatrix = [...IDENTITY_MATRIX];

  for (let operatorIndex = 0; operatorIndex < operatorList.fnArray.length; operatorIndex += 1) {
    const operator = operatorList.fnArray[operatorIndex];
    const args = operatorList.argsArray[operatorIndex];
    if (operator === ops.save) {
      transformStack.push([...currentTransform]);
      continue;
    }
    if (operator === ops.restore) {
      currentTransform = transformStack.pop() || [...IDENTITY_MATRIX];
      continue;
    }
    if (operator === ops.transform && Array.isArray(args) && args.length >= 6) {
      const transform = args.slice(0, 6).map((value) => finiteNumber(value)) as PdfMatrix;
      currentTransform = multiplyMatrices(currentTransform, transform);
      continue;
    }
    if (operator !== ops.constructPath) continue;

    const drawData = extractConstructPathData(args);
    if (!drawData?.length) continue;
    let cursor = 0;
    let activePath: SharedPdfNormalizedPoint[] = [];
    let startPoint: SharedPdfNormalizedPoint | null = null;
    let currentPoint: SharedPdfNormalizedPoint | null = null;

    const flushPath = (closed: boolean) => {
      if (activePath.length >= 2) paths.push({ points: activePath, closed });
      activePath = [];
      startPoint = null;
      currentPoint = null;
    };

    while (cursor < drawData.length) {
      const drawOperator = Math.round(drawData[cursor++]);
      if (drawOperator === DRAW_MOVE_TO) {
        if (activePath.length >= 2) flushPath(false);
        const point = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        activePath = [point];
        startPoint = point;
        currentPoint = point;
        continue;
      }
      if (drawOperator === DRAW_LINE_TO) {
        const point = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        appendPoint(activePath, point);
        currentPoint = point;
        continue;
      }
      if (drawOperator === DRAW_CURVE_TO) {
        const control1 = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        const control2 = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        const end = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        if (currentPoint) {
          for (const t of [0.25, 0.5, 0.75, 1]) appendPoint(activePath, cubicPoint(currentPoint, control1, control2, end, t));
        } else appendPoint(activePath, end);
        currentPoint = end;
        continue;
      }
      if (drawOperator === DRAW_QUADRATIC_CURVE_TO) {
        const control = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        const end = normalizedViewportPoint(viewport, currentTransform, drawData[cursor++], drawData[cursor++]);
        if (currentPoint) {
          for (const t of [0.25, 0.5, 0.75, 1]) appendPoint(activePath, quadraticPoint(currentPoint, control, end, t));
        } else appendPoint(activePath, end);
        currentPoint = end;
        continue;
      }
      if (drawOperator === DRAW_CLOSE_PATH) {
        if (startPoint) appendPoint(activePath, startPoint);
        flushPath(true);
        continue;
      }
      break;
    }
    if (activePath.length >= 2) flushPath(Boolean(startPoint && currentPoint && nearlySamePoint(startPoint, currentPoint)));
  }
  return paths;
}

function vectorSegmentAngleDegrees(a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint) {
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  while (angle < 0) angle += 180;
  while (angle >= 180) angle -= 180;
  return angle;
}

function pathsToSegments(paths: RawVectorPath[]) {
  const segments: VectorSegment[] = [];
  paths.forEach((path, pathIndex) => {
    let segmentIndex = 0;
    const pushSegment = (a: SharedPdfNormalizedPoint, b: SharedPdfNormalizedPoint) => {
      const length = pointDistance(a, b);
      if (length < 0.0004 || length > 0.75) return;
      segments.push({
        a,
        b,
        length,
        angleDegrees: vectorSegmentAngleDegrees(a, b),
        source: path.closed ? "closedPath" : "openPath",
        pathIndex,
        segmentIndex,
      });
      segmentIndex += 1;
    };
    for (let index = 1; index < path.points.length; index += 1) {
      pushSegment(path.points[index - 1], path.points[index]);
    }
    if (path.closed && path.points.length > 2 && !nearlySamePoint(path.points[0], path.points[path.points.length - 1])) {
      pushSegment(path.points[path.points.length - 1], path.points[0]);
    }
  });
  return segments;
}

function segmentPointSignature(point: SharedPdfNormalizedPoint, precision = 10000) {
  return `${Math.round(point.x * precision)}:${Math.round(point.y * precision)}`;
}

function vectorSegmentSignature(segment: VectorSegment) {
  const first = segmentPointSignature(segment.a);
  const second = segmentPointSignature(segment.b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function deduplicateVectorSegments(segments: VectorSegment[]) {
  const result: VectorSegment[] = [];
  const seen = new Set<string>();
  const ordered = [...segments].sort((left, right) => {
    if (left.source !== right.source) return left.source === "openPath" ? -1 : 1;
    return right.length - left.length;
  });
  for (const segment of ordered) {
    const signature = vectorSegmentSignature(segment);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(segment);
    if (result.length >= 12000) break;
  }
  return result;
}

function stitchSegmentsIntoContours(segments: VectorSegment[], tolerance = 0.0016) {
  const usable = segments.filter((segment) => segment.length >= tolerance * 0.7 && segment.length <= 0.45).slice(0, 16000);
  const pointSums = new Map<string, { x: number; y: number; count: number }>();
  const edges: Array<{ a: string; b: string }> = [];
  const adjacency = new Map<string, number[]>();
  const keyFor = (point: SharedPdfNormalizedPoint) => `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}`;
  const rememberPoint = (key: string, point: SharedPdfNormalizedPoint) => {
    const current = pointSums.get(key) || { x: 0, y: 0, count: 0 };
    current.x += point.x;
    current.y += point.y;
    current.count += 1;
    pointSums.set(key, current);
  };
  usable.forEach((segment) => {
    const a = keyFor(segment.a);
    const b = keyFor(segment.b);
    if (a === b) return;
    const edgeIndex = edges.length;
    edges.push({ a, b });
    rememberPoint(a, segment.a);
    rememberPoint(b, segment.b);
    adjacency.set(a, [...(adjacency.get(a) || []), edgeIndex]);
    adjacency.set(b, [...(adjacency.get(b) || []), edgeIndex]);
  });

  const visitedEdges = new Set<number>();
  const contours: SharedPdfVectorContour[] = [];
  const pointForKey = (key: string) => {
    const value = pointSums.get(key)!;
    return { x: value.x / value.count, y: value.y / value.count };
  };

  for (let seed = 0; seed < edges.length; seed += 1) {
    if (visitedEdges.has(seed)) continue;
    const componentEdges: number[] = [];
    const componentNodes = new Set<string>();
    const queue = [seed];
    while (queue.length) {
      const edgeIndex = queue.pop()!;
      if (visitedEdges.has(edgeIndex)) continue;
      visitedEdges.add(edgeIndex);
      componentEdges.push(edgeIndex);
      const edge = edges[edgeIndex];
      componentNodes.add(edge.a);
      componentNodes.add(edge.b);
      for (const node of [edge.a, edge.b]) {
        for (const nextEdge of adjacency.get(node) || []) if (!visitedEdges.has(nextEdge)) queue.push(nextEdge);
      }
      if (componentEdges.length > 512) break;
    }
    if (componentEdges.length < 3 || componentEdges.length > 512) continue;
    if ([...componentNodes].some((node) => (adjacency.get(node) || []).filter((edgeIndex) => componentEdges.includes(edgeIndex)).length !== 2)) continue;

    const componentSet = new Set(componentEdges);
    const firstEdge = edges[componentEdges[0]];
    const startNode = firstEdge.a;
    const points = [pointForKey(startNode)];
    let currentNode = startNode;
    let previousEdge = -1;
    let closed = false;
    for (let step = 0; step <= componentEdges.length + 1; step += 1) {
      const nextEdgeIndex = (adjacency.get(currentNode) || []).find((edgeIndex) => componentSet.has(edgeIndex) && edgeIndex !== previousEdge);
      if (nextEdgeIndex == null) break;
      const edge = edges[nextEdgeIndex];
      const nextNode = edge.a === currentNode ? edge.b : edge.a;
      if (nextNode === startNode) {
        closed = true;
        break;
      }
      points.push(pointForKey(nextNode));
      previousEdge = nextEdgeIndex;
      currentNode = nextNode;
    }
    if (!closed) continue;
    const contour = createContour(points, true, "stitchedSegments");
    if (contour) contours.push(contour);
  }
  return contours;
}

function contourSignature(contour: SharedPdfVectorContour) {
  const bounds = contour.bounds;
  return [
    Math.round(bounds.x * 1000),
    Math.round(bounds.y * 1000),
    Math.round(bounds.width * 1000),
    Math.round(bounds.height * 1000),
    Math.round(contour.normalizedArea * 100000),
  ].join(":");
}

function deduplicateContours(contours: SharedPdfVectorContour[]) {
  const result: SharedPdfVectorContour[] = [];
  const seen = new Set<string>();
  for (const contour of contours.sort((a, b) => a.normalizedArea - b.normalizedArea)) {
    const signature = contourSignature(contour);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(contour);
  }
  return result.slice(0, 5000);
}

function countParallelWallPairs(segments: VectorSegment[]) {
  const candidates = segments
    .filter((segment) => segment.length >= 0.008 && segment.length <= 0.45)
    .sort((a, b) => b.length - a.length)
    .slice(0, 650)
    .map((segment) => {
      const dx = segment.b.x - segment.a.x;
      const dy = segment.b.y - segment.a.y;
      const angle = Math.atan2(dy, dx);
      return {
        ...segment,
        angle: angle < 0 ? angle + Math.PI : angle,
        midX: (segment.a.x + segment.b.x) / 2,
        midY: (segment.a.y + segment.b.y) / 2,
        ux: dx / segment.length,
        uy: dy / segment.length,
      };
    });
  let pairCount = 0;
  for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
    const first = candidates[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
      const second = candidates[secondIndex];
      let angleDifference = Math.abs(first.angle - second.angle);
      angleDifference = Math.min(angleDifference, Math.PI - angleDifference);
      if (angleDifference > 0.035) continue;
      const centerDx = second.midX - first.midX;
      const centerDy = second.midY - first.midY;
      const perpendicularDistance = Math.abs(centerDx * -first.uy + centerDy * first.ux);
      if (perpendicularDistance < 0.001 || perpendicularDistance > 0.04) continue;
      const projectedOffset = Math.abs(centerDx * first.ux + centerDy * first.uy);
      const projectedOverlap = (first.length + second.length) / 2 - projectedOffset;
      if (projectedOverlap < 0.012) continue;
      pairCount += 1;
      if (pairCount >= 10000) return pairCount;
    }
  }
  return pairCount;
}

function extractVectorGeometry(
  operatorList: { fnArray: number[]; argsArray: unknown[] },
  ops: Record<string, number>,
  viewport: SharedPdfViewport,
) {
  const rawPaths = extractVectorPaths(operatorList, ops, viewport);
  const segments = deduplicateVectorSegments(pathsToSegments(rawPaths));
  const directContours = rawPaths.flatMap((path) => {
    if (!path.closed && !(path.points.length > 2 && nearlySamePoint(path.points[0], path.points[path.points.length - 1], 0.0012))) return [];
    const contour = createContour(path.points, true, "directPath");
    return contour ? [contour] : [];
  });
  const stitchedContours = stitchSegmentsIntoContours(segments);
  const vectorContours = deduplicateContours([...directContours, ...stitchedContours]);
  return {
    rawPaths,
    segments,
    vectorContours,
    stitchedContourCount: vectorContours.filter((contour) => contour.source === "stitchedSegments").length,
    parallelWallPairCount: countParallelWallPairs(segments),
  };
}

export async function analyzeSharedPdfPage(pdfJs: SharedPdfJsModule, page: SharedPdfPage): Promise<SharedPdfPageAnalysis> {
  const [operatorList, textContent] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
  const ops = pdfJs.OPS || {};
  const vectorPathCount = countOperator(operatorList.fnArray, [ops.constructPath, ops.stroke, ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke]);
  const rasterImageCount = countOperator(operatorList.fnArray, [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintSolidColorImageMask]);
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const geometry = extractVectorGeometry(operatorList, ops, viewport);
  const viewportTransform = Array.isArray(viewport.transform) && viewport.transform.length >= 6
    ? viewport.transform.slice(0, 6).map((value) => finiteNumber(value)) as PdfMatrix
    : [1, 0, 0, -1, 0, viewport.height] as PdfMatrix;
  const textItems = (textContent.items || []).flatMap((item) => {
    const text = String(item.str || "").replace(/\s+/g, " ").trim();
    const transform = Array.isArray(item.transform) ? item.transform : [];
    if (!text || transform.length < 6) return [];
    const rawX = finiteNumber(transform[4]);
    const rawY = finiteNumber(transform[5]);
    const displayPoint = transformPoint(viewportTransform, rawX, rawY);
    const width = Math.max(0, finiteNumber(item.width, Math.abs(finiteNumber(transform[0]))));
    const height = Math.max(1, finiteNumber(item.height, Math.abs(finiteNumber(transform[3]))));
    return [{
      text,
      x: viewport.width ? clamp01(displayPoint.x / viewport.width) : 0,
      y: viewport.height ? clamp01(displayPoint.y / viewport.height) : 0,
      width: viewport.width ? width / viewport.width : 0,
      height: viewport.height ? height / viewport.height : 0,
    }];
  });
  const hasVector = vectorPathCount > 0 || geometry.segments.length > 0;
  const hasRaster = rasterImageCount > 0;
  const contentKind = hasVector && hasRaster ? "mixed" : hasVector ? "vector" : "raster";
  return {
    contentKind,
    vectorPathCount,
    rasterImageCount,
    textItemCount: textItems.length,
    lineSegmentCount: geometry.segments.length,
    closedContourCount: geometry.vectorContours.length,
    openContourCount: geometry.rawPaths.filter((path) => !path.closed).length,
    stitchedContourCount: geometry.stitchedContourCount,
    parallelWallPairCount: geometry.parallelWallPairCount,
    vectorContours: geometry.vectorContours,
    vectorSegments: geometry.segments,
    textItems,
  };
}
