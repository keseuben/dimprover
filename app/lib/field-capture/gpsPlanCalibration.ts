import type { FieldCaptureItem } from "./types";
import { isGpsPhotoMapLocationUsable, projectWgs84ToLocalMeters, type GpsPhotoMapCalibrationPoint } from "./gpsPhotoMap";

export type GpsPlanAnchor = {
  id: string;
  calibrationPointId: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  createdAt: string;
};

export type GpsPlanCalibrationQuality = "UNVERIFIED" | "GOOD" | "ACCEPTABLE" | "WEAK";

export type GpsPlanCalibrationResidual = {
  calibrationPointId: string;
  residualMeters: number;
};

export type GpsPlanCalibrationModel = {
  pageNumber: number;
  anchorCount: number;
  referenceLatitude: number;
  referenceLongitude: number;
  xCoefficients: [number, number, number];
  yCoefficients: [number, number, number];
  determinant: number;
  northAngleDegrees: number;
  verificationAvailable: boolean;
  averageResidualMeters: number | null;
  maxResidualMeters: number | null;
  quality: GpsPlanCalibrationQuality;
  residuals: GpsPlanCalibrationResidual[];
};

export type GpsPlanProjectedPoint = {
  xPercent: number;
  yPercent: number;
  insidePlan: boolean;
};

export type GpsPlanPhotoPoint = GpsPlanProjectedPoint & {
  id: string;
  sequence: number;
  displayName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  headingPlanDegrees: number | null;
};

export type GpsPlanDistanceSegment = {
  id: string;
  fromId: string;
  toId: string;
  fromSequence: number;
  toSequence: number;
  from: GpsPlanProjectedPoint;
  to: GpsPlanProjectedPoint;
  distanceMeters: number;
  displayLabel: string;
};

const EARTH_RADIUS_METERS = 6_378_137;
const EPSILON = 1e-10;

function finitePercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function normalizeGpsPlanAnchor(anchor: GpsPlanAnchor): GpsPlanAnchor | null {
  if (!anchor.id || !anchor.calibrationPointId || !Number.isInteger(anchor.pageNumber) || anchor.pageNumber < 1) return null;
  if (!finitePercent(anchor.xPercent) || !finitePercent(anchor.yPercent)) return null;
  const createdAt = Number.isFinite(Date.parse(anchor.createdAt)) ? anchor.createdAt : new Date().toISOString();
  return {
    ...anchor,
    xPercent: Math.max(0, Math.min(100, anchor.xPercent)),
    yPercent: Math.max(0, Math.min(100, anchor.yPercent)),
    createdAt,
  };
}

function solve3x3(matrix: number[][], vector: number[]): [number, number, number] | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < EPSILON) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let c = column; c < 4; c += 1) augmented[column][c] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let c = column; c < 4; c += 1) augmented[row][c] -= factor * augmented[column][c];
    }
  }
  return [augmented[0][3], augmented[1][3], augmented[2][3]];
}

function normalEquation(samples: Array<{ east: number; north: number; target: number }>) {
  let ee = 0;
  let en = 0;
  let e = 0;
  let nn = 0;
  let n = 0;
  let et = 0;
  let nt = 0;
  let t = 0;
  for (const sample of samples) {
    ee += sample.east * sample.east;
    en += sample.east * sample.north;
    e += sample.east;
    nn += sample.north * sample.north;
    n += sample.north;
    et += sample.east * sample.target;
    nt += sample.north * sample.target;
    t += sample.target;
  }
  return solve3x3(
    [[ee, en, e], [en, nn, n], [e, n, samples.length]],
    [et, nt, t],
  );
}

function invertPlanToLocal(model: Pick<GpsPlanCalibrationModel, "xCoefficients" | "yCoefficients" | "determinant">, xPercent: number, yPercent: number) {
  const [a, b, c] = model.xCoefficients;
  const [d, e, f] = model.yCoefficients;
  const dx = xPercent - c;
  const dy = yPercent - f;
  return {
    eastMeters: (e * dx - b * dy) / model.determinant,
    northMeters: (-d * dx + a * dy) / model.determinant,
  };
}

function planAngleFromVector(dxPercent: number, dyPercent: number) {
  const degrees = Math.atan2(dxPercent, -dyPercent) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

export function buildGpsPlanCalibrationModel(input: {
  calibrationPoints: GpsPhotoMapCalibrationPoint[];
  anchors: GpsPlanAnchor[];
  pageNumber?: number;
}): GpsPlanCalibrationModel | null {
  const normalizedAnchors = input.anchors.map(normalizeGpsPlanAnchor).filter((anchor): anchor is GpsPlanAnchor => Boolean(anchor));
  const pageNumber = input.pageNumber ?? normalizedAnchors[0]?.pageNumber ?? 1;
  const anchors = normalizedAnchors.filter((anchor) => anchor.pageNumber === pageNumber);
  const pointById = new Map(input.calibrationPoints.map((point) => [point.id, point]));
  const pairs = anchors.flatMap((anchor) => {
    const point = pointById.get(anchor.calibrationPointId);
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return [];
    return [{ anchor, point }];
  });
  if (pairs.length < 3) return null;

  const referenceLatitude = pairs.reduce((sum, pair) => sum + pair.point.latitude, 0) / pairs.length;
  const referenceLongitude = pairs.reduce((sum, pair) => sum + pair.point.longitude, 0) / pairs.length;
  const projected = pairs.map((pair) => ({
    ...pair,
    ...projectWgs84ToLocalMeters({
      latitude: pair.point.latitude,
      longitude: pair.point.longitude,
      referenceLatitude,
      referenceLongitude,
    }),
  }));

  const xCoefficients = normalEquation(projected.map((pair) => ({ east: pair.eastMeters, north: pair.northMeters, target: pair.anchor.xPercent })));
  const yCoefficients = normalEquation(projected.map((pair) => ({ east: pair.eastMeters, north: pair.northMeters, target: pair.anchor.yPercent })));
  if (!xCoefficients || !yCoefficients) return null;
  const determinant = xCoefficients[0] * yCoefficients[1] - xCoefficients[1] * yCoefficients[0];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < EPSILON) return null;

  const partial = { xCoefficients, yCoefficients, determinant };
  const residuals = projected.map((pair) => {
    const back = invertPlanToLocal(partial, pair.anchor.xPercent, pair.anchor.yPercent);
    return {
      calibrationPointId: pair.point.id,
      residualMeters: Math.hypot(back.eastMeters - pair.eastMeters, back.northMeters - pair.northMeters),
    };
  });
  const verificationAvailable = pairs.length >= 4;
  const averageResidualMeters = verificationAvailable ? residuals.reduce((sum, item) => sum + item.residualMeters, 0) / residuals.length : null;
  const maxResidualMeters = verificationAvailable ? Math.max(...residuals.map((item) => item.residualMeters)) : null;
  const quality: GpsPlanCalibrationQuality = !verificationAvailable
    ? "UNVERIFIED"
    : averageResidualMeters !== null && maxResidualMeters !== null && averageResidualMeters <= 2 && maxResidualMeters <= 4
      ? "GOOD"
      : averageResidualMeters !== null && maxResidualMeters !== null && averageResidualMeters <= 5 && maxResidualMeters <= 10
        ? "ACCEPTABLE"
        : "WEAK";

  return {
    pageNumber,
    anchorCount: pairs.length,
    referenceLatitude,
    referenceLongitude,
    xCoefficients,
    yCoefficients,
    determinant,
    northAngleDegrees: planAngleFromVector(xCoefficients[1], yCoefficients[1]),
    verificationAvailable,
    averageResidualMeters,
    maxResidualMeters,
    quality,
    residuals,
  };
}

export function projectGpsCoordinateToPlan(model: GpsPlanCalibrationModel, input: { latitude: number; longitude: number }): GpsPlanProjectedPoint {
  const local = projectWgs84ToLocalMeters({
    latitude: input.latitude,
    longitude: input.longitude,
    referenceLatitude: model.referenceLatitude,
    referenceLongitude: model.referenceLongitude,
  });
  const [a, b, c] = model.xCoefficients;
  const [d, e, f] = model.yCoefficients;
  const xPercent = a * local.eastMeters + b * local.northMeters + c;
  const yPercent = d * local.eastMeters + e * local.northMeters + f;
  return { xPercent, yPercent, insidePlan: xPercent >= 0 && xPercent <= 100 && yPercent >= 0 && yPercent <= 100 };
}

export function projectGpsHeadingToPlan(model: GpsPlanCalibrationModel, headingDegrees: number | null) {
  if (headingDegrees === null || !Number.isFinite(headingDegrees)) return null;
  const radians = headingDegrees * Math.PI / 180;
  const east = Math.sin(radians);
  const north = Math.cos(radians);
  const dxPercent = model.xCoefficients[0] * east + model.xCoefficients[1] * north;
  const dyPercent = model.yCoefficients[0] * east + model.yCoefficients[1] * north;
  if (Math.hypot(dxPercent, dyPercent) < EPSILON) return null;
  return planAngleFromVector(dxPercent, dyPercent);
}

export function buildGpsPlanPhotoPoints(items: FieldCaptureItem[], model: GpsPlanCalibrationModel): GpsPlanPhotoPoint[] {
  return [...items]
    .filter(isGpsPhotoMapLocationUsable)
    .sort((left, right) => left.sequence - right.sequence)
    .map((item) => {
      const latitude = item.location.latitude!;
      const longitude = item.location.longitude!;
      const projected = projectGpsCoordinateToPlan(model, { latitude, longitude });
      return {
        id: item.id,
        sequence: item.sequence,
        displayName: item.displayName,
        latitude,
        longitude,
        accuracyMeters: item.location.accuracyMeters,
        headingDegrees: item.orientation.headingDegrees,
        headingPlanDegrees: projectGpsHeadingToPlan(model, item.orientation.headingDegrees),
        ...projected,
      };
    });
}

export function calculateGpsDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const deltaLat = (to.latitude - from.latitude) * Math.PI / 180;
  const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function formatPlanDistanceMeters(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters)) return "—";
  return `${Math.max(0, distanceMeters).toFixed(2).replace(".", ",")} m`;
}

export function buildConsecutiveGpsPlanDistanceSegments(points: GpsPlanPhotoPoint[]): GpsPlanDistanceSegment[] {
  const ordered = [...points].sort((left, right) => left.sequence - right.sequence);
  const segments: GpsPlanDistanceSegment[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    const distanceMeters = calculateGpsDistanceMeters(from, to);
    segments.push({
      id: `${from.id}:${to.id}`,
      fromId: from.id,
      toId: to.id,
      fromSequence: from.sequence,
      toSequence: to.sequence,
      from: { xPercent: from.xPercent, yPercent: from.yPercent, insidePlan: from.insidePlan },
      to: { xPercent: to.xPercent, yPercent: to.yPercent, insidePlan: to.insidePlan },
      distanceMeters,
      displayLabel: formatPlanDistanceMeters(distanceMeters),
    });
  }
  return segments;
}
