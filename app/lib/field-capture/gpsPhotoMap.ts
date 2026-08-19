export const GPS_PHOTO_MAP_DISCLAIMER =
  "Telefonos GPS alapján készült tájékoztató helyszíni fotóazonosító térkép, nem geodéziai kitűzési vagy felmérési dokumentum.";

const EARTH_RADIUS_METERS = 6_378_137;

export type GpsPhotoMapCalibrationPointType = "CORNER" | "SETTING_OUT" | "CUSTOM_REFERENCE";

export type GpsPhotoMapCalibrationPoint = {
  id: string;
  label: string;
  type: GpsPhotoMapCalibrationPointType;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  sampleCount: number;
  samplingDurationMs: number;
  note: string;
};

export type GpsPhotoMapSourceItem = {
  id: string;
  sequence: number;
  displayName: string;
  capturedAt: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    status: string;
  };
  orientation: {
    headingDegrees: number | null;
    headingAccuracyDegrees: number | null;
    directionLabel: string | null;
    status: string;
  };
};

export type GpsPhotoMapPoint = {
  id: string;
  sequence: number;
  displayName: string;
  capturedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  headingAccuracyDegrees: number | null;
  directionLabel: string | null;
  eastMeters: number;
  northMeters: number;
};

export type GpsPhotoMapBounds = {
  minEastMeters: number;
  maxEastMeters: number;
  minNorthMeters: number;
  maxNorthMeters: number;
  widthMeters: number;
  heightMeters: number;
};

export type GpsPhotoMapModel = {
  referenceLatitude: number;
  referenceLongitude: number;
  points: GpsPhotoMapPoint[];
  bounds: GpsPhotoMapBounds;
  sequenceSegments: Array<{ fromId: string; toId: string }>;
  disclaimer: string;
};

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

export function normalizeGpsPhotoHeading(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function isGpsPhotoMapLocationUsable(item: GpsPhotoMapSourceItem) {
  const { latitude, longitude, status } = item.location;
  return (status === "READY" || status === "LOW_ACCURACY")
    && latitude !== null
    && longitude !== null
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function projectWgs84ToLocalMeters(input: {
  latitude: number;
  longitude: number;
  referenceLatitude: number;
  referenceLongitude: number;
}) {
  const referenceLatRadians = degreesToRadians(input.referenceLatitude);
  const deltaLat = degreesToRadians(input.latitude - input.referenceLatitude);
  const deltaLon = degreesToRadians(input.longitude - input.referenceLongitude);
  return {
    eastMeters: EARTH_RADIUS_METERS * deltaLon * Math.cos(referenceLatRadians),
    northMeters: EARTH_RADIUS_METERS * deltaLat,
  };
}

export function calculateGpsPhotoMapBounds(points: Array<Pick<GpsPhotoMapPoint, "eastMeters" | "northMeters">>): GpsPhotoMapBounds {
  if (!points.length) {
    return { minEastMeters: 0, maxEastMeters: 0, minNorthMeters: 0, maxNorthMeters: 0, widthMeters: 0, heightMeters: 0 };
  }
  const east = points.map((point) => point.eastMeters);
  const north = points.map((point) => point.northMeters);
  const minEastMeters = Math.min(...east);
  const maxEastMeters = Math.max(...east);
  const minNorthMeters = Math.min(...north);
  const maxNorthMeters = Math.max(...north);
  return {
    minEastMeters,
    maxEastMeters,
    minNorthMeters,
    maxNorthMeters,
    widthMeters: maxEastMeters - minEastMeters,
    heightMeters: maxNorthMeters - minNorthMeters,
  };
}

export function buildGpsPhotoMapModel(items: GpsPhotoMapSourceItem[]): GpsPhotoMapModel | null {
  const usable = items.filter(isGpsPhotoMapLocationUsable).sort((a, b) => a.sequence - b.sequence || a.capturedAt.localeCompare(b.capturedAt));
  if (!usable.length) return null;

  const referenceLatitude = usable.reduce((sum, item) => sum + (item.location.latitude as number), 0) / usable.length;
  const referenceLongitude = usable.reduce((sum, item) => sum + (item.location.longitude as number), 0) / usable.length;

  const points: GpsPhotoMapPoint[] = usable.map((item) => {
    const latitude = item.location.latitude as number;
    const longitude = item.location.longitude as number;
    const projected = projectWgs84ToLocalMeters({ latitude, longitude, referenceLatitude, referenceLongitude });
    return {
      id: item.id,
      sequence: item.sequence,
      displayName: item.displayName,
      capturedAt: item.capturedAt,
      latitude,
      longitude,
      accuracyMeters: item.location.accuracyMeters,
      headingDegrees: normalizeGpsPhotoHeading(item.orientation.headingDegrees),
      headingAccuracyDegrees: item.orientation.headingAccuracyDegrees,
      directionLabel: item.orientation.directionLabel,
      ...projected,
    };
  });

  return {
    referenceLatitude,
    referenceLongitude,
    points,
    bounds: calculateGpsPhotoMapBounds(points),
    sequenceSegments: points.slice(1).map((point, index) => ({ fromId: points[index].id, toId: point.id })),
    disclaimer: GPS_PHOTO_MAP_DISCLAIMER,
  };
}

export function fitGpsPhotoMapToViewport(model: GpsPhotoMapModel, viewport: { width: number; height: number; padding?: number }) {
  const padding = Math.max(0, viewport.padding ?? 24);
  const innerWidth = Math.max(1, viewport.width - padding * 2);
  const innerHeight = Math.max(1, viewport.height - padding * 2);
  const sourceWidth = Math.max(model.bounds.widthMeters, 1);
  const sourceHeight = Math.max(model.bounds.heightMeters, 1);
  const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const contentWidth = model.bounds.widthMeters * scale;
  const contentHeight = model.bounds.heightMeters * scale;
  const offsetX = padding + (innerWidth - contentWidth) / 2;
  const offsetY = padding + (innerHeight - contentHeight) / 2;

  return model.points.map((point) => ({
    ...point,
    x: offsetX + (point.eastMeters - model.bounds.minEastMeters) * scale,
    y: viewport.height - (offsetY + (point.northMeters - model.bounds.minNorthMeters) * scale),
  }));
}
