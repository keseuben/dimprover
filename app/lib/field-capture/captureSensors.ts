"use client";

import type {
  FieldCaptureLocationRecord,
  FieldCaptureOrientationRecord,
  FieldCaptureOrientationStatus,
} from "@/app/lib/field-capture/types";

const LOCATION_TIMEOUT_MS = 6500;
const LOW_ACCURACY_METERS = 50;
const ORIENTATION_TIMEOUT_MS = 4200;
const MIN_CAMERA_HORIZONTAL_PROJECTION = 0.16;
const TARGET_ORIENTATION_SAMPLES = 5;

export type FieldLocationPermissionState = "granted" | "prompt" | "denied" | "unsupported" | "unavailable";

export async function getFieldLocationPermissionState(): Promise<FieldLocationPermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unavailable";
  if (!navigator.permissions?.query) return "unsupported";
  try {
    const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return permission.state;
  } catch {
    return "unsupported";
  }
}

export async function requestFieldLocationPermission(): Promise<{
  state: FieldLocationPermissionState;
  sample: FieldCaptureLocationRecord | null;
}> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { state: "unavailable", sample: null };
  }
  const before = await getFieldLocationPermissionState();
  if (before === "denied") return { state: "denied", sample: null };

  // Közvetlen felhasználói gombnyomásból hívandó. A böngésző így a konkrét
  // DIMPRO webhelyhez kér helyhozzáférést, nem csak a globális
  // "a webhelyek kérhetik" beállításra támaszkodunk.
  const sample = await captureFieldLocation(true);
  if (sample.status === "READY" || sample.status === "LOW_ACCURACY") {
    return { state: "granted", sample };
  }
  if (sample.status === "DENIED") return { state: "denied", sample };
  const after = await getFieldLocationPermissionState();
  return { state: after, sample };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

function degrees(value: number) {
  return value * Math.PI / 180;
}

export function fieldDirectionLabel(heading: number) {
  const labels = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"] as const;
  return labels[Math.round(normalizeHeading(heading) / 45) % 8];
}

/**
 * A W3C Device Orientation koordinátarendszerben +z a kijelzőből kifelé mutat.
 * A hátlapi kamera optikai tengelye ezért -z. A Z-X'-Y'' forgatások után a
 * kamera-vektort vízszintes síkra vetítjük; atan2(x,y) adja az Északtól
 * óramutató járásával megegyező azimutot.
 */
export function cameraHeadingFromDeviceOrientation(alpha: number, beta: number, gamma: number) {
  const a = degrees(alpha);
  const b = degrees(beta);
  const g = degrees(gamma);

  // Rz(alpha) * Rx(beta) * Ry(gamma) * [0, 0, -1]
  const east = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.cos(g) * Math.sin(b);
  const north = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.cos(g) * Math.sin(b);
  const horizontalProjection = Math.hypot(east, north);
  if (!Number.isFinite(horizontalProjection) || horizontalProjection < MIN_CAMERA_HORIZONTAL_PROJECTION) {
    return { heading: null, horizontalProjection };
  }
  return { heading: normalizeHeading(Math.atan2(east, north) * 180 / Math.PI), horizontalProjection };
}

function circularMean(values: number[]) {
  if (!values.length) return null;
  let x = 0;
  let y = 0;
  for (const value of values) {
    const angle = degrees(value);
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  if (Math.hypot(x, y) < 0.0001) return null;
  return normalizeHeading(Math.atan2(y, x) * 180 / Math.PI);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function captureFieldLocation(enabled: boolean): Promise<FieldCaptureLocationRecord> {
  if (!enabled) return { enabled: false, latitude: null, longitude: null, accuracyMeters: null, capturedAt: null, source: null, status: "OFF", detail: "GPS kikapcsolva." };
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { enabled: true, latitude: null, longitude: null, accuracyMeters: null, capturedAt: null, source: null, status: "UNAVAILABLE", detail: "A készülék vagy böngésző nem biztosít GPS helyadatot." };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.max(0, position.coords.accuracy) : null;
        resolve({
          enabled: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: accuracy,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          source: "browser-geolocation",
          status: accuracy !== null && accuracy > LOW_ACCURACY_METERS ? "LOW_ACCURACY" : "READY",
          detail: accuracy !== null && accuracy > LOW_ACCURACY_METERS ? `Gyenge GPS pontosság: ±${Math.round(accuracy)} m.` : "GPS helyadat rögzítve.",
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        resolve({
          enabled: true,
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          capturedAt: nowIso(),
          source: "browser-geolocation",
          status: denied ? "DENIED" : "UNAVAILABLE",
          detail: denied
            ? "A GPS helyhozzáférés nincs engedélyezve ehhez a webhelyhez. Chrome: webhelyinformáció → Engedélyek → Hely → Engedélyezés, majd válassza a GPS újramérést."
            : "A GPS mérés nem sikerült vagy időtúllépés történt.",
        });
      },
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 10000 },
    );
  });
}

type OrientationPermissionResult = "not-required" | "granted" | "denied" | "unavailable";

export async function requestFieldOrientationPermission(): Promise<OrientationPermissionResult> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return "unavailable";
  const eventType = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
  if (typeof eventType.requestPermission !== "function") return "not-required";
  try {
    return await eventType.requestPermission();
  } catch {
    return "denied";
  }
}

type ExtendedOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type OrientationSample = {
  heading: number;
  absolute: boolean;
  accuracy: number | null;
  projection: number;
};

function orientationStatus(absolute: boolean, accuracy: number | null, projection: number): FieldCaptureOrientationStatus {
  if (!absolute || projection < 0.35) return "UNSTABLE";
  if (accuracy !== null && accuracy > 45) return "UNSTABLE";
  return "READY";
}

export async function captureFieldOrientation(enabled: boolean): Promise<FieldCaptureOrientationRecord> {
  if (!enabled) return { enabled: false, headingDegrees: null, headingAccuracyDegrees: null, directionLabel: null, capturedAt: null, source: null, status: "OFF", detail: "Tájolás kikapcsolva." };
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return { enabled: true, headingDegrees: null, headingAccuracyDegrees: null, directionLabel: null, capturedAt: null, source: null, status: "UNAVAILABLE", detail: "A készülék vagy böngésző nem biztosít tájolási szenzort." };
  }

  return new Promise((resolve) => {
    let done = false;
    const samples: OrientationSample[] = [];

    const finish = (record: FieldCaptureOrientationRecord) => {
      if (done) return;
      done = true;
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
      window.clearTimeout(timer);
      resolve(record);
    };

    const finishFromSamples = () => {
      const absoluteSamples = samples.filter((sample) => sample.absolute);
      const usable = absoluteSamples.length ? absoluteSamples : samples;
      const heading = circularMean(usable.map((sample) => sample.heading));
      if (heading === null) return false;
      const accuracy = median(usable.flatMap((sample) => sample.accuracy === null ? [] : [sample.accuracy]));
      const projection = median(usable.map((sample) => sample.projection)) ?? 0;
      const status = orientationStatus(Boolean(absoluteSamples.length), accuracy, projection);
      finish({
        enabled: true,
        headingDegrees: heading,
        headingAccuracyDegrees: accuracy,
        directionLabel: fieldDirectionLabel(heading),
        capturedAt: nowIso(),
        source: "device-orientation",
        status,
        detail: status === "READY"
          ? `Hátlapi kamera nézeti iránya rögzítve ${usable.length} szenzormintából.`
          : `A kamera iránya becsülhető, de a mérés bizonytalan lehet (${usable.length} minta). Tartsa a telefont a fotózási helyzetben, majd mérje újra.`,
      });
      return true;
    };

    const onOrientation = (raw: Event) => {
      const event = raw as ExtendedOrientationEvent;
      if (typeof event.alpha !== "number" || typeof event.beta !== "number" || typeof event.gamma !== "number") return;
      if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;

      const hasWebkitHeading = typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading);
      const alpha = hasWebkitHeading ? normalizeHeading(360 - event.webkitCompassHeading!) : event.alpha;
      const camera = cameraHeadingFromDeviceOrientation(alpha, event.beta, event.gamma);
      if (camera.heading === null) return;

      const absolute = raw.type === "deviceorientationabsolute" || Boolean(event.absolute) || hasWebkitHeading;
      const accuracy = typeof event.webkitCompassAccuracy === "number" && Number.isFinite(event.webkitCompassAccuracy)
        ? Math.max(0, event.webkitCompassAccuracy)
        : null;
      samples.push({ heading: camera.heading, absolute, accuracy, projection: camera.horizontalProjection });

      const absoluteCount = samples.filter((sample) => sample.absolute).length;
      if (absoluteCount >= TARGET_ORIENTATION_SAMPLES || (samples.length >= TARGET_ORIENTATION_SAMPLES + 2 && absoluteCount === 0)) finishFromSamples();
    };

    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, { passive: true });
    window.addEventListener("deviceorientation", onOrientation as EventListener, { passive: true });
    const timer = window.setTimeout(() => {
      if (samples.length && finishFromSamples()) return;
      finish({
        enabled: true,
        headingDegrees: null,
        headingAccuracyDegrees: null,
        directionLabel: null,
        capturedAt: nowIso(),
        source: "device-orientation",
        status: "UNAVAILABLE",
        detail: "A hátlapi kamera iránya nem volt megbízhatóan meghatározható. Tartsa a telefont fotózási helyzetben, majd válassza a Tájolás újramérést.",
      });
    }, ORIENTATION_TIMEOUT_MS);
  });
}

export async function captureFieldSensors(options: { gpsEnabled: boolean; orientationEnabled: boolean }) {
  const [location, orientation] = await Promise.all([
    captureFieldLocation(options.gpsEnabled),
    captureFieldOrientation(options.orientationEnabled),
  ]);
  return { location, orientation };
}
