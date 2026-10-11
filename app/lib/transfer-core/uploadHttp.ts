"use client";

/** Browser XHR adapter for existing Drive signed S3 and same-origin PUT routes. */
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
        finish(new Error("Fájlfeltöltés sikertelen (HTTP " + xhr.status + ")."));
      }
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    try { xhr.send(input.file); } catch (error) {
      finish(error instanceof Error ? error : new Error("A fájlfeltöltés nem indítható."));
    }
  });
}
