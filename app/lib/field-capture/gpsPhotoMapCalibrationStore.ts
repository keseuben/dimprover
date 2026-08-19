"use client";

import type { GpsPhotoMapCalibrationPoint } from "@/app/lib/field-capture/gpsPhotoMap";

const PREFIX = "dimpro.fieldCapture.gpsCalibration.v1.";

export function loadGpsCalibrationPoints(sessionId: string | null | undefined): GpsPhotoMapCalibrationPoint[] {
  if (!sessionId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + sessionId);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGpsCalibrationPoints(sessionId: string | null | undefined, points: GpsPhotoMapCalibrationPoint[]) {
  if (!sessionId || typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + sessionId, JSON.stringify(points));
}
