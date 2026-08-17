"use client";

import type {
  FieldCaptureLocationRecord,
  FieldCaptureOrientationRecord,
  FieldCaptureOrientationStatus,
} from "@/app/lib/field-capture/types";

const LOCATION_TIMEOUT_MS = 6500;
const LOW_ACCURACY_METERS = 50;
const ORIENTATION_TIMEOUT_MS = 3500;

function nowIso() {
  return new Date().toISOString();
}

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

export function fieldDirectionLabel(heading: number) {
  const labels = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"] as const;
  return labels[Math.round(normalizeHeading(heading) / 45) % 8];
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
          detail: denied ? "A GPS helyhozzáférés nincs engedélyezve." : "A GPS mérés nem sikerült vagy időtúllépés történt.",
        });
      },
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 15000 },
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

function orientationStatus(absolute: boolean, accuracy: number | null): FieldCaptureOrientationStatus {
  if (!absolute) return "UNSTABLE";
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
    const finish = (record: FieldCaptureOrientationRecord) => {
      if (done) return;
      done = true;
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
      window.clearTimeout(timer);
      resolve(record);
    };
    const onOrientation = (raw: Event) => {
      const event = raw as ExtendedOrientationEvent;
      let heading: number | null = null;
      let accuracy: number | null = null;
      let absolute = Boolean(event.absolute);
      if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading)) {
        heading = normalizeHeading(event.webkitCompassHeading);
        accuracy = typeof event.webkitCompassAccuracy === "number" && Number.isFinite(event.webkitCompassAccuracy) ? Math.max(0, event.webkitCompassAccuracy) : null;
        absolute = true;
      } else if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
        heading = normalizeHeading(360 - event.alpha);
      }
      if (heading === null) return;
      const status = orientationStatus(absolute, accuracy);
      finish({
        enabled: true,
        headingDegrees: heading,
        headingAccuracyDegrees: accuracy,
        directionLabel: fieldDirectionLabel(heading),
        capturedAt: nowIso(),
        source: "device-orientation",
        status,
        detail: status === "READY" ? "Tájolás rögzítve." : "A tájolás rendelkezésre áll, de a mérés bizonytalan lehet.",
      });
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, { passive: true });
    window.addEventListener("deviceorientation", onOrientation as EventListener, { passive: true });
    const timer = window.setTimeout(() => finish({
      enabled: true,
      headingDegrees: null,
      headingAccuracyDegrees: null,
      directionLabel: null,
      capturedAt: nowIso(),
      source: "device-orientation",
      status: "UNAVAILABLE",
      detail: "A tájolási mérés nem adott használható értéket az időkorláton belül.",
    }), ORIENTATION_TIMEOUT_MS);
  });
}

export async function captureFieldSensors(options: { gpsEnabled: boolean; orientationEnabled: boolean }) {
  const [location, orientation] = await Promise.all([
    captureFieldLocation(options.gpsEnabled),
    captureFieldOrientation(options.orientationEnabled),
  ]);
  return { location, orientation };
}
