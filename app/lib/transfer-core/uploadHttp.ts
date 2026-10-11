"use client";

/** Browser XHR adapter for existing Drive signed S3 and same-origin PUT routes. */
import {classifyTransferRetry,transferRetryDelayMs,waitForTransferDelay} from "./retryPolicy.mjs";

export type TransferUploadHttpOptions = {
  url: string;
  method: string;
  headers: Record<string, string>;
  file: File;
  sameOrigin: boolean;
  signal: AbortSignal;
  onProgress: (bytes: number) => void;
};

export function transferHttpUpload(input: TransferUploadHttpOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    };
    if (input.signal.aborted) {
      finish(new DOMException("A feltöltés megszakadt.", "AbortError"));
      return;
    }
    xhr.open(input.method, input.url, true);
    xhr.withCredentials = input.sameOrigin;
    for (const [key, value] of Object.entries(input.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) input.onProgress(Math.min(input.file.size, event.loaded));
    };
    xhr.onerror = () => finish(new Error("A hálózati kapcsolat megszakadt a fájlfeltöltés közben."));
    xhr.onabort = () => finish(new DOMException("A feltöltés megszakadt.", "AbortError"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(input.file.size);
        finish();
      } else {
        finish(Object.assign(new Error("Fájlfeltöltés sikertelen (HTTP " + xhr.status + ")."), {status:xhr.status}));
      }
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    try { xhr.send(input.file); } catch (error) {
      finish(error instanceof Error ? error : new Error("A fájlfeltöltés nem indítható."));
    }
  });
}

/**
 * Full-file PUT retry for existing Drive upload sessions. The same signed URL
 * is reused only for retryable transport errors. This is NOT byte-range resume;
 * the server still receives a complete object before finalize. This helper
 * must never retry a POST init or POST complete because they can create versions.
 */
export async function transferHttpUploadWithRetry(input: TransferUploadHttpOptions & {
  maxAttempts?: number;
  onRetry?: (attempt: number, delayMs: number) => void;
}): Promise<void> {
  const attempts = Math.max(1,Math.min(4,input.maxAttempts ?? 3));
  for (let attempt=1; attempt<=attempts; attempt++){
    try { await transferHttpUpload(input); return; }
    catch(error) {
      if (classifyTransferRetry(error) !== "RETRYABLE" || attempt===attempts || input.signal.aborted) throw error;
      const waitMs = transferRetryDelayMs(attempt);
      input.onRetry?.(attempt,waitMs);
      input.onProgress(0); // next full PUT starts at byte zero
      await waitForTransferDelay(waitMs,input.signal);
    }
  }
}
