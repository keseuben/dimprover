"use client";

import type { GpsPhotoMapCalibrationPoint, GpsPhotoMapCalibrationPointType } from "@/app/lib/field-capture/gpsPhotoMap";

export type GpsCalibrationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

export type GpsCalibrationProgress = {
  sampleCount: number;
  elapsedMs: number;
  targetDurationMs: number;
  latestAccuracyMeters: number | null;
};

function clampDuration(durationMs: number) {
  return Math.min(10_000, Math.max(5_000, Math.round(durationMs)));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function averageGpsCalibrationSamples(input: {
  id: string;
  label: string;
  type: GpsPhotoMapCalibrationPointType;
  note?: string;
  samples: GpsCalibrationSample[];
  samplingDurationMs: number;
}): GpsPhotoMapCalibrationPoint {
  const usable = input.samples.filter((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude) && Number.isFinite(sample.accuracyMeters) && sample.latitude >= -90 && sample.latitude <= 90 && sample.longitude >= -180 && sample.longitude <= 180);
  if (!usable.length) throw new Error("Nem érkezett használható GPS-minta a kalibrációs ponthoz.");
  const weighted = usable.map((sample) => ({ sample, weight: 1 / Math.pow(Math.max(3, sample.accuracyMeters), 2) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const latitude = weighted.reduce((sum, entry) => sum + entry.sample.latitude * entry.weight, 0) / totalWeight;
  const longitude = weighted.reduce((sum, entry) => sum + entry.sample.longitude * entry.weight, 0) / totalWeight;
  return {
    id: input.id,
    label: input.label.trim() || `Kalibrációs pont ${input.id.slice(-4)}`,
    type: input.type,
    latitude,
    longitude,
    accuracyMeters: median(usable.map((sample) => sample.accuracyMeters)),
    capturedAt: usable[usable.length - 1].capturedAt,
    sampleCount: usable.length,
    samplingDurationMs: clampDuration(input.samplingDurationMs),
    note: input.note?.trim() || "",
  };
}

export async function captureGpsCalibrationPoint(input: {
  id: string;
  label: string;
  type: GpsPhotoMapCalibrationPointType;
  note?: string;
  durationMs?: number;
  onProgress?: (progress: GpsCalibrationProgress) => void;
}) {
  if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("A készülék vagy böngésző nem biztosít GPS helyadatot.");
  const targetDurationMs = clampDuration(input.durationMs ?? 8_000);
  const startedAt = Date.now();
  const samples: GpsCalibrationSample[] = [];

  return await new Promise<GpsPhotoMapCalibrationPoint>((resolve, reject) => {
    let settled = false;
    let watchId = -1;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      try {
        resolve(averageGpsCalibrationSamples({ ...input, samples, samplingDurationMs: Date.now() - startedAt }));
      } catch (error) {
        reject(error);
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      reject(new Error(message));
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.max(0, position.coords.accuracy) : 9999;
        samples.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: accuracy, capturedAt: new Date(position.timestamp || Date.now()).toISOString() });
        input.onProgress?.({ sampleCount: samples.length, elapsedMs: Date.now() - startedAt, targetDurationMs, latestAccuracyMeters: accuracy });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) fail("A GPS helyhozzáférés nincs engedélyezve ehhez a webhelyhez.");
        else if (!samples.length) fail("A GPS mintagyűjtés nem indult el. Próbálja újra nyíltabb helyen.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: Math.min(targetDurationMs, 6_000) },
    );

    const timer = window.setTimeout(finish, targetDurationMs);
  });
}

export function getGpsCalibrationReadiness(points: GpsPhotoMapCalibrationPoint[]) {
  const count = points.length;
  const accuracies = points.flatMap((point) => point.accuracyMeters === null ? [] : [point.accuracyMeters]);
  return {
    count,
    readyForPlanAlignment: count >= 3,
    averageAccuracyMeters: accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : null,
  };
}

export const GPS_CALIBRATION_POINT_LABELS: Record<GpsPhotoMapCalibrationPointType, string> = {
  CORNER: "Sarokpont",
  SETTING_OUT: "Kitűzési pont",
  CUSTOM_REFERENCE: "Egyedi referencia",
};
