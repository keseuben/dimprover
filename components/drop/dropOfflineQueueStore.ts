"use client";

import type { PreparedDropFile } from "./dropUploadPreparation";

const DB_NAME = "dimpro-drop-offline-v098";
const DB_VERSION = 1;
const STORE_NAME = "uploadQueue";
const MAX_RECORD_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type DropPersistedQueueStatus = "queued" | "paused" | "uploading" | "quarantined" | "failed";

export type DropPersistedQueueItem = {
  key: string;
  packageId: string;
  itemId: string;
  clientUploadId: string;
  blob: Blob;
  uploadName: string;
  uploadType: string;
  uploadLastModified: number;
  originalName: string;
  originalType: string;
  originalSize: number;
  displayName: string;
  capturedAt: string;
  capturedAtSource: "exif" | "file_last_modified" | "upload_time";
  uploadedAt: string;
  sequenceNumber: number;
  customLabel: string;
  uploadSize: number;
  optimized: boolean;
  optimizationNote: string;
  width: number | null;
  height: number | null;
  comment: string;
  groupId: string | null;
  groupName: string | null;
  status: DropPersistedQueueStatus;
  progress: number;
  message: string;
  fileId: string | null;
  autoResume: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  security: {
    containsRawToken: false;
    containsPin: false;
    containsSendCode: false;
  };
};

export type DropRestoredPreparedFile = PreparedDropFile & {
  itemId: string;
  clientUploadId: string;
  comment: string;
  groupId: string | null;
  groupName: string | null;
  status: DropPersistedQueueStatus;
  progress: number;
  message: string;
  fileId: string | null;
  autoResume: boolean;
};

function supported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!supported()) return Promise.reject(new Error("Az IndexedDB nem támogatott."));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("A helyi feltöltési tár nem nyitható meg."));
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "key" });
      if (!store.indexNames.contains("packageId")) store.createIndex("packageId", "packageId", { unique: false });
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
    try { request = action(store); } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(request ? request.result : undefined); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("A helyi feltöltési tár művelete sikertelen.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("A helyi feltöltési tár művelete megszakadt.")); };
  });
}

function safeStatus(status: DropPersistedQueueStatus): DropPersistedQueueStatus {
  return status === "uploading" ? "paused" : status;
}

export async function persistDropQueueItem(input: Omit<DropPersistedQueueItem, "key" | "updatedAt" | "security">) {
  const record: DropPersistedQueueItem = {
    ...input,
    key: `${input.packageId}:${input.itemId}`,
    status: safeStatus(input.status),
    updatedAt: new Date().toISOString(),
    security: { containsRawToken: false, containsPin: false, containsSendCode: false },
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function patchDropQueueItem(packageId: string, itemId: string, patch: Partial<Omit<DropPersistedQueueItem, "key" | "packageId" | "itemId" | "blob" | "security">>) {
  const key = `${packageId}:${itemId}`;
  const current = await withStore<DropPersistedQueueItem | undefined>("readonly", (store) => store.get(key));
  if (!current) return null;
  const next: DropPersistedQueueItem = {
    ...current,
    ...patch,
    status: patch.status ? safeStatus(patch.status) : current.status,
    updatedAt: new Date().toISOString(),
    security: { containsRawToken: false, containsPin: false, containsSendCode: false },
  };
  await withStore("readwrite", (store) => store.put(next));
  return next;
}

export async function removeDropQueueItem(packageId: string, itemId: string) {
  await withStore("readwrite", (store) => store.delete(`${packageId}:${itemId}`));
}

export async function clearDropQueuePackage(packageId: string) {
  const rows = await listDropQueueItems(packageId);
  if (!rows.length) return 0;
  const database = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    rows.forEach((row) => store.delete(row.key));
    transaction.oncomplete = () => { database.close(); resolve(rows.length); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("A helyi feltöltési sor nem törölhető.")); };
  });
}

export async function listDropQueueItems(packageId: string): Promise<DropPersistedQueueItem[]> {
  if (!supported()) return [];
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).index("packageId").getAll(packageId);
    request.onsuccess = () => resolve((request.result as DropPersistedQueueItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error || new Error("A helyi feltöltési sor nem olvasható."));
    transaction.oncomplete = () => database.close();
  });
}

export async function restoreDropQueue(packageId: string): Promise<DropRestoredPreparedFile[]> {
  const rows = await listDropQueueItems(packageId);
  return rows.filter((row) => Date.parse(row.expiresAt) > Date.now()).map((row) => {
    const uploadFile = new File([row.blob], row.uploadName, { type: row.uploadType || "application/octet-stream", lastModified: row.uploadLastModified });
    const originalFile = new File([row.blob], row.originalName, { type: row.originalType || row.uploadType || "application/octet-stream", lastModified: row.uploadLastModified });
    const previewUrl = (row.uploadType || "").startsWith("image/") ? URL.createObjectURL(uploadFile) : null;
    return {
      itemId: row.itemId,
      clientUploadId: row.clientUploadId,
      originalFile,
      uploadFile,
      originalName: row.originalName,
      displayName: row.displayName,
      capturedAt: row.capturedAt || new Date(row.uploadLastModified || Date.now()).toISOString(),
      capturedAtSource: row.capturedAtSource || "file_last_modified",
      uploadedAt: row.uploadedAt || row.createdAt || new Date().toISOString(),
      sequenceNumber: Number(row.sequenceNumber || 1),
      customLabel: row.customLabel || "",
      originalSize: row.originalSize,
      uploadSize: row.uploadSize,
      optimized: row.optimized,
      optimizationNote: row.optimizationNote,
      width: row.width,
      height: row.height,
      previewUrl,
      comment: row.comment || "",
      groupId: row.groupId || null,
      groupName: row.groupName || null,
      status: safeStatus(row.status),
      progress: row.status === "quarantined" ? 100 : Math.max(0, Math.min(99, row.progress || 0)),
      message: row.status === "uploading" ? "Megszakadt feltöltés · folytatásra vár" : row.message,
      fileId: row.fileId,
      autoResume: row.autoResume,
    };
  });
}

export async function pruneDropQueueStore() {
  if (!supported()) return 0;
  const database = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    let removed = 0;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const row = cursor.value as DropPersistedQueueItem;
      if (Date.parse(row.expiresAt) <= Date.now() || Date.parse(row.updatedAt) < Date.now() - MAX_RECORD_AGE_MS) {
        cursor.delete(); removed += 1;
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("A helyi feltöltési tár takarítása sikertelen."));
    transaction.oncomplete = () => { database.close(); resolve(removed); };
  });
}

export async function requestDropPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage) return { supported: false, persisted: false, quota: null, usage: null };
  let persisted = typeof navigator.storage.persisted === "function" ? await navigator.storage.persisted().catch(() => false) : false;
  if (!persisted && typeof navigator.storage.persist === "function") persisted = await navigator.storage.persist().catch(() => false);
  const estimate: StorageEstimate = await navigator.storage.estimate().catch(() => ({} as StorageEstimate));
  return {
    supported: true,
    persisted,
    quota: typeof estimate.quota === "number" ? estimate.quota : null,
    usage: typeof estimate.usage === "number" ? estimate.usage : null,
  };
}

export const DROP_OFFLINE_QUEUE_SECURITY = Object.freeze({
  version: "DROP 1.2.11",
  database: DB_NAME,
  rawUploadCapabilityStored: false,
  rawSessionTokenStored: false,
  sendCodeStored: false,
  pinStored: false,
});
