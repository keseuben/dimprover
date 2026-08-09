"use client";

import { dropFetchWithRetry, waitForDropOnline } from "./dropNetworkClient";

export type DropInitializedUpload = {
  file?: { id?: string; displayName?: string };
  session: {
    id: string;
    totalBytes?: number;
    uploadedBytes?: number;
    chunkSizeBytes?: number;
    totalParts?: number;
    completedParts?: number;
  };
  protocol?: "single" | "multipart";
  storageProvider?: "local-private" | "s3-compatible";
  completedPartNumbers?: number[];
  uploadToken: string;
  uploadUrl: string;
  partUrlTemplate?: string;
  partSignUrlTemplate?: string;
  partConfirmUrlTemplate?: string;
  stateUrl?: string;
  completeUrl: string;
  abortUrl: string;
  expiresAt?: string;
  maxBytes?: number;
};

export type DropUploadCheckpoint = {
  partNumber: number;
  completedPartNumbers: number[];
  uploadedBytes: number;
  progress: number;
};

function xhrUpload(input: {
  url: string;
  token?: string | null;
  body: Blob;
  contentType?: string;
  signal?: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
}) {
  return new Promise<{ etag: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", input.url, true);
    if (input.token) xhr.setRequestHeader("Authorization", `Bearer ${input.token}`);
    xhr.setRequestHeader("Content-Type", input.contentType || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) input.onProgress(event.loaded, event.total);
    };
    xhr.onerror = () => reject(Object.assign(new Error("A hálózati feltöltés megszakadt. A kész részek megmaradtak."), { code: "DROP_UPLOAD_NETWORK_INTERRUPTED" }));
    xhr.onabort = () => reject(new DOMException("A feltöltés megszakadt. A kész részek megmaradtak.", "AbortError"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(input.body.size, input.body.size);
        resolve({ etag: xhr.getResponseHeader("etag")?.replace(/^\"|\"$/g, "") || null });
        return;
      }
      let message = `A fájlrész feltöltése sikertelen (HTTP ${xhr.status}).`;
      try {
        const payload = JSON.parse(xhr.responseText) as { error?: string };
        if (payload.error) message = payload.error;
      } catch { /* alapértelmezett üzenet */ }
      reject(Object.assign(new Error(message), { status: xhr.status, code: "DROP_UPLOAD_PART_HTTP_FAILED" }));
    };
    if (input.signal?.aborted) { reject(new DOMException("A feltöltés megszakadt.", "AbortError")); return; }
    input.signal?.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => input.signal?.removeEventListener("abort", abort);
    xhr.send(input.body);
  });
}

function retryableUploadError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function xhrUploadWithRetry(input: Parameters<typeof xhrUpload>[0] & {
  attempts?: number;
  onRetry?: (detail: string, attempt: number) => void;
}) {
  const attempts = Math.max(1, Math.min(6, input.attempts ?? 4));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      input.onRetry?.("Nincs kapcsolat · a kész fájlrészek megmaradtak", attempt);
      await waitForDropOnline(input.signal);
    }
    try {
      return await xhrUpload(input);
    } catch (error) {
      if (!retryableUploadError(error) || attempt === attempts) throw error;
      input.onRetry?.("A fájlrész küldése megszakadt · automatikus folytatás", attempt);
      await waitForDropOnline(input.signal);
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(8_000, 1_000 * 2 ** (attempt - 1))));
    }
  }
  throw new Error("A fájlrész feltöltése az újrapróbálások után sem sikerült.");
}

async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createStableDropClientUploadId(prefix: string, file: File) {
  const normalized = `${prefix}_${file.name}_${file.size}_${file.lastModified}`
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_");
  return normalized.slice(0, 120);
}

export async function uploadDropInitialized(input: {
  initialized: DropInitializedUpload;
  file: File;
  signal?: AbortSignal;
  onProgress: (progress: number, detail: string) => void;
  onCheckpoint?: (checkpoint: DropUploadCheckpoint) => void | Promise<void>;
  onNetworkState?: (detail: string) => void;
}) {
  const protocol = input.initialized.protocol || "single";
  const storageProvider = input.initialized.storageProvider || "local-private";
  if (protocol === "single") {
    if (storageProvider === "s3-compatible") throw new Error("Az S3 feltöltéshez multipart munkamenet szükséges.");
    await xhrUploadWithRetry({
      url: input.initialized.uploadUrl,
      token: input.initialized.uploadToken,
      body: input.file,
      signal: input.signal,
      onRetry: (detail) => { input.onNetworkState?.(detail); input.onProgress(0, detail); },
      onProgress: (loaded, total) => {
        const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        input.onProgress(progress, `Feltöltés: ${progress}%`);
      },
    });
    await input.onCheckpoint?.({ partNumber: 1, completedPartNumbers: [1], uploadedBytes: input.file.size, progress: 100 });
    return { resumed: false, uploadedParts: 1, skippedParts: 0, completedPartNumbers: [1] };
  }

  const chunkSize = Number(input.initialized.session.chunkSizeBytes || 0);
  const totalParts = Number(input.initialized.session.totalParts || 0);
  if (!input.initialized.partUrlTemplate || chunkSize <= 0 || totalParts <= 0) throw new Error("A darabolt feltöltési munkamenet hiányos.");

  const completed = new Set((input.initialized.completedPartNumbers || []).map(Number));
  let completedBytes = 0;
  for (const partNumber of completed) {
    const start = (partNumber - 1) * chunkSize;
    completedBytes += Math.max(0, Math.min(chunkSize, input.file.size - start));
  }
  const skippedParts = completed.size;
  input.onProgress(Math.min(100, Math.round((completedBytes / input.file.size) * 100)), skippedParts ? `Folytatás: ${skippedParts}/${totalParts} rész már elkészült` : `Darabolt feltöltés: ${totalParts} rész`);

  let uploadedParts = 0;
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (completed.has(partNumber)) continue;
    if (input.signal?.aborted) throw new DOMException("A feltöltés megszakadt.", "AbortError");
    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(input.file.size, start + chunkSize);
    const part = input.file.slice(start, end);

    if (storageProvider === "s3-compatible") {
      const signTemplate = input.initialized.partSignUrlTemplate || input.initialized.partUrlTemplate;
      const confirmTemplate = input.initialized.partConfirmUrlTemplate || input.initialized.partUrlTemplate;
      const apiUrl = signTemplate.replace("{partNumber}", String(partNumber));
      const signResponse = await dropFetchWithRetry(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.initialized.uploadToken}` },
      }, { signal: input.signal, onRetry: (detail) => { input.onNetworkState?.(detail); input.onProgress(Math.min(99, Math.round((completedBytes / input.file.size) * 100)), detail); } });
      const signPayload = await signResponse.json() as { signed?: { alreadyCompleted?: boolean; url?: string; headers?: Record<string, string>; sizeBytes?: number }; error?: string };
      if (!signResponse.ok || !signPayload.signed) throw new Error(signPayload.error || "Az S3 part-URL nem hozható létre.");
      if (signPayload.signed.alreadyCompleted) {
        completed.add(partNumber);
        completedBytes += part.size;
        const progress = Math.min(99, Math.round((completedBytes / input.file.size) * 100));
        await input.onCheckpoint?.({ partNumber, completedPartNumbers: [...completed].sort((a, b) => a - b), uploadedBytes: completedBytes, progress });
        continue;
      }
      if (!signPayload.signed.url) throw new Error("A signed S3 part-URL hiányzik.");
      const checksum = await sha256Blob(part);
      const uploaded = await xhrUploadWithRetry({
        url: signPayload.signed.url,
        body: part,
        contentType: signPayload.signed.headers?.["content-type"] || "application/octet-stream",
        signal: input.signal,
        onRetry: (detail) => { input.onNetworkState?.(detail); input.onProgress(Math.min(99, Math.round((completedBytes / input.file.size) * 100)), detail); },
        onProgress: (loaded) => {
          const totalLoaded = Math.min(input.file.size, completedBytes + loaded);
          const progress = Math.min(99, Math.round((totalLoaded / input.file.size) * 100));
          input.onProgress(progress, `${partNumber}/${totalParts}. S3 rész · ${progress}%`);
        },
      });
      const confirmUrl = confirmTemplate.replace("{partNumber}", String(partNumber));
      const confirmResponse = await dropFetchWithRetry(confirmUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.initialized.uploadToken}` },
        body: JSON.stringify({ checksum, etag: uploaded.etag, receivedBytes: part.size }),
      }, { signal: input.signal, onRetry: (detail) => { input.onNetworkState?.(detail); input.onProgress(Math.min(99, Math.round((completedBytes / input.file.size) * 100)), detail); } });
      const confirmPayload = await confirmResponse.json() as { error?: string };
      if (!confirmResponse.ok) throw new Error(confirmPayload.error || "Az S3 fájlrész ellenőrzése sikertelen.");
    } else {
      const url = input.initialized.partUrlTemplate.replace("{partNumber}", String(partNumber));
      await xhrUploadWithRetry({
        url,
        token: input.initialized.uploadToken,
        body: part,
        signal: input.signal,
        onRetry: (detail) => { input.onNetworkState?.(detail); input.onProgress(Math.min(99, Math.round((completedBytes / input.file.size) * 100)), detail); },
        onProgress: (loaded) => {
          const totalLoaded = Math.min(input.file.size, completedBytes + loaded);
          const progress = Math.min(99, Math.round((totalLoaded / input.file.size) * 100));
          input.onProgress(progress, `${partNumber}/${totalParts}. rész · ${progress}%`);
        },
      });
    }

    completed.add(partNumber);
    completedBytes += part.size;
    uploadedParts += 1;
    const progress = Math.min(99, Math.round((completedBytes / input.file.size) * 100));
    input.onProgress(progress, `${partNumber}/${totalParts}. rész elkészült`);
    await input.onCheckpoint?.({ partNumber, completedPartNumbers: [...completed].sort((a, b) => a - b), uploadedBytes: completedBytes, progress });
  }
  input.onProgress(100, storageProvider === "s3-compatible" ? "Minden S3 rész elkészült · véglegesítés következik" : "Minden rész beérkezett · összefűzés következik");
  return { resumed: skippedParts > 0, uploadedParts, skippedParts, completedPartNumbers: [...completed].sort((a, b) => a - b) };
}
