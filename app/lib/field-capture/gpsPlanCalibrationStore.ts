"use client";

import type { GpsPlanAnchor } from "./gpsPlanCalibration";

const DB_NAME = "dimpro-field-gps-plan-v1";
const DB_VERSION = 1;
const STORE_NAME = "planCalibrations";
export const GPS_PLAN_CALIBRATION_CHANGED_EVENT = "dimpro:gps-plan-calibration-changed";

export type GpsPlanCalibrationRecord = {
  sessionId: string;
  fileName: string;
  mimeType: string;
  pdfBlob: Blob;
  pageNumber: number;
  pageCount: number;
  anchors: GpsPlanAnchor[];
  createdAt: string;
  updatedAt: string;
};

function supported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function emitChanged(sessionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GPS_PLAN_CALIBRATION_CHANGED_EVENT, { detail: { sessionId } }));
}

function openDatabase(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("Az IndexedDB nem támogatott ezen az eszközön."));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("A GPS tervlap helyi tár nem nyitható meg."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function getRecord(sessionId: string) {
  const database = await openDatabase();
  return new Promise<GpsPlanCalibrationRecord | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(sessionId);
    request.onsuccess = () => resolve((request.result as GpsPlanCalibrationRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("A GPS tervlap rekord nem olvasható."));
    transaction.oncomplete = () => database.close();
  });
}

async function putRecord(record: GpsPlanCalibrationRecord) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("A GPS tervlap rekord nem menthető.")); };
  });
  emitChanged(record.sessionId);
}

export async function loadGpsPlanCalibrationRecord(sessionId: string | null | undefined) {
  if (!sessionId || !supported()) return null;
  return getRecord(sessionId);
}

export async function saveGpsPlanDocument(input: { sessionId: string; file: File; pageCount: number; pageNumber?: number }) {
  const now = new Date().toISOString();
  const record: GpsPlanCalibrationRecord = {
    sessionId: input.sessionId,
    fileName: input.file.name.slice(0, 180),
    mimeType: input.file.type || "application/pdf",
    pdfBlob: input.file,
    pageNumber: Math.min(Math.max(1, input.pageNumber || 1), Math.max(1, input.pageCount)),
    pageCount: Math.max(1, input.pageCount),
    anchors: [],
    createdAt: now,
    updatedAt: now,
  };
  await putRecord(record);
  return record;
}

export async function saveGpsPlanAnchors(sessionId: string, anchors: GpsPlanAnchor[]) {
  const current = await getRecord(sessionId);
  if (!current) throw new Error("Előbb válassz PDF tervlapot.");
  const next: GpsPlanCalibrationRecord = { ...current, anchors, updatedAt: new Date().toISOString() };
  await putRecord(next);
  return next;
}

export async function setGpsPlanPage(sessionId: string, pageNumber: number) {
  const current = await getRecord(sessionId);
  if (!current) throw new Error("Nincs aktív GPS tervlap.");
  const normalized = Math.min(Math.max(1, Math.round(pageNumber)), current.pageCount);
  const next: GpsPlanCalibrationRecord = { ...current, pageNumber: normalized, anchors: [], updatedAt: new Date().toISOString() };
  await putRecord(next);
  return next;
}

export async function clearGpsPlanCalibration(sessionId: string | null | undefined) {
  if (!sessionId || !supported()) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(sessionId);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("A GPS tervlap nem törölhető.")); };
  });
  emitChanged(sessionId);
}

export async function loadGpsPlanCalibrationForReport(sessionId: string | null | undefined) {
  const record = await loadGpsPlanCalibrationRecord(sessionId);
  if (!record) return null;
  return {
    fileName: record.fileName,
    pageNumber: record.pageNumber,
    pageCount: record.pageCount,
    anchors: record.anchors,
    pdfBytes: new Uint8Array(await record.pdfBlob.arrayBuffer()),
    updatedAt: record.updatedAt,
  };
}
