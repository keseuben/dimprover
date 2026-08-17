"use client";

import type { FieldCaptureItem, PreCaptureOptions } from "./types";

const DB_NAME = "dimpro-field-capture-v1";
const DB_VERSION = 1;
const STORE_NAME = "captureItems";

type PersistedFieldCaptureItem = {
  id: string;
  sessionId: string;
  sequence: number;
  capturedAt: string;
  originalName: string;
  displayName: string;
  originalSize: number;
  uploadSize: number;
  optimized: boolean;
  optimizationNote: string;
  width: number | null;
  height: number | null;
  blob: Blob;
  uploadType: string;
  uploadLastModified: number;
  note: string;
  voiceTranscript: string;
  status: FieldCaptureItem["status"];
  progress: number;
  error: string | null;
  options: PreCaptureOptions;
  locationStatus: FieldCaptureItem["locationStatus"];
  orientationStatus: FieldCaptureItem["orientationStatus"];
  createdAt: string;
  updatedAt: string;
  security: {
    rawSessionTokenStored: false;
    uploadCapabilityStored: false;
    locationStoredOnlyWhenRequested: true;
  };
};

function supported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("Az IndexedDB nem támogatott ezen az eszközön."));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("A terepi helyi tár nem nyitható meg."));
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("sessionId")) store.createIndex("sessionId", "sessionId", { unique: false });
      if (!store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request: IDBRequest<T> | void;
    try {
      request = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request ? request.result : undefined);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("A terepi helyi tár művelete sikertelen."));
    };
  });
}

export async function persistFieldCaptureItem(item: FieldCaptureItem) {
  const now = new Date().toISOString();
  const record: PersistedFieldCaptureItem = {
    id: item.id,
    sessionId: item.sessionId,
    sequence: item.sequence,
    capturedAt: item.capturedAt,
    originalName: item.originalName,
    displayName: item.displayName,
    originalSize: item.originalSize,
    uploadSize: item.uploadSize,
    optimized: item.optimized,
    optimizationNote: item.optimizationNote,
    width: item.width,
    height: item.height,
    blob: item.uploadFile,
    uploadType: item.uploadFile.type || "application/octet-stream",
    uploadLastModified: item.uploadFile.lastModified,
    note: item.note,
    voiceTranscript: item.voiceTranscript,
    status: item.status === "UPLOADING" ? "QUEUED" : item.status,
    progress: item.status === "UPLOADING" ? 0 : item.progress,
    error: item.error,
    options: item.options,
    locationStatus: item.locationStatus,
    orientationStatus: item.orientationStatus,
    createdAt: now,
    updatedAt: now,
    security: {
      rawSessionTokenStored: false,
      uploadCapabilityStored: false,
      locationStoredOnlyWhenRequested: true,
    },
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function patchFieldCaptureItem(
  id: string,
  patch: Partial<Pick<PersistedFieldCaptureItem, "note" | "voiceTranscript" | "status" | "progress" | "error">>,
) {
  const current = await withStore<PersistedFieldCaptureItem | undefined>("readonly", (store) => store.get(id));
  if (!current) return null;
  const next: PersistedFieldCaptureItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await withStore("readwrite", (store) => store.put(next));
  return next;
}

export async function removeFieldCaptureItem(id: string) {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function listFieldCaptureItems(sessionId: string): Promise<PersistedFieldCaptureItem[]> {
  if (!supported()) return [];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).index("sessionId").getAll(sessionId);
    request.onsuccess = () => resolve((request.result as PersistedFieldCaptureItem[]).sort((a, b) => a.sequence - b.sequence));
    request.onerror = () => reject(request.error || new Error("A terepi helyi sor nem olvasható."));
    transaction.oncomplete = () => database.close();
  });
}

export async function restoreFieldCaptureItems(sessionId: string): Promise<FieldCaptureItem[]> {
  const rows = await listFieldCaptureItems(sessionId);
  return rows.map((row) => {
    const uploadFile = new File([row.blob], row.displayName, { type: row.uploadType, lastModified: row.uploadLastModified });
    const originalFile = new File([row.blob], row.originalName, { type: row.uploadType, lastModified: row.uploadLastModified });
    return {
      id: row.id,
      sessionId: row.sessionId,
      sequence: row.sequence,
      capturedAt: row.capturedAt,
      originalName: row.originalName,
      displayName: row.displayName,
      originalSize: row.originalSize,
      uploadSize: row.uploadSize,
      optimized: row.optimized,
      optimizationNote: row.optimizationNote,
      width: row.width,
      height: row.height,
      previewUrl: row.uploadType.startsWith("image/") ? URL.createObjectURL(uploadFile) : null,
      uploadFile,
      originalFile,
      note: row.note,
      voiceTranscript: row.voiceTranscript,
      status: row.status === "UPLOADING" ? "QUEUED" : row.status,
      progress: row.status === "UPLOADING" ? 0 : row.progress,
      error: row.error,
      options: row.options,
      locationStatus: row.locationStatus,
      orientationStatus: row.orientationStatus,
    };
  });
}

export async function clearFieldCaptureSession(sessionId: string) {
  const rows = await listFieldCaptureItems(sessionId);
  await Promise.all(rows.map((row) => removeFieldCaptureItem(row.id)));
  return rows.length;
}

export async function requestFieldCapturePersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage) return { supported: false, persisted: false, quota: null, usage: null };
  let persisted = typeof navigator.storage.persisted === "function" ? await navigator.storage.persisted().catch(() => false) : false;
  if (!persisted && typeof navigator.storage.persist === "function") persisted = await navigator.storage.persist().catch(() => false);
  const estimate = await navigator.storage.estimate().catch(() => ({} as StorageEstimate));
  return {
    supported: true,
    persisted,
    quota: typeof estimate.quota === "number" ? estimate.quota : null,
    usage: typeof estimate.usage === "number" ? estimate.usage : null,
  };
}

export const FIELD_CAPTURE_OFFLINE_QUEUE_SECURITY = Object.freeze({
  database: DB_NAME,
  rawSessionTokenStored: false,
  uploadCapabilityStored: false,
  captureFirst: true,
});
