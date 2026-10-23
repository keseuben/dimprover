"use client";

import { PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES } from "@/app/lib/content-core/personalUploadPolicy";

/** Shared Transfer Center transport: bounded, single POST, deliberately NO auto-retry. */
export type PersonalUploadResponse = {
  ok?: boolean; saved?: boolean; error?: string; code?: string;
  scanStatus?: "CLEAN" | "INFECTED"; contentRefId?: string;
  placedInFolder?: boolean; alreadyCompleted?: boolean;
};
export class PersonalUploadHttpError extends Error {
  readonly status: number;
  readonly uncertain: boolean;
  constructor(message: string, status: number, uncertain: boolean) {
    super(message);
    this.name = "PersonalUploadHttpError";
    this.status = status;
    this.uncertain = uncertain;
  }
}
export function uploadPersonalFormWithProgress(input: {
  file: File; folderId: string; requestId: string;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
  onNetworkSent: () => void;
}): Promise<PersonalUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let networkSent = false;
    const abort = () => xhr.abort();
    const finish = (error: Error | null, value?: PersonalUploadResponse) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value || {});
    };
    if (input.signal.aborted) {
      finish(new PersonalUploadHttpError("A böngészős feltöltés megszakadt.", 0, false));
      return;
    }
    const streaming = input.file.size > PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES;
    xhr.open("POST", streaming ? "/api/drive/personal/uploads/stream" : "/api/drive/personal/uploads", true);
    xhr.withCredentials = true;
    if (streaming) {
      xhr.setRequestHeader("content-type", "application/octet-stream");
      xhr.setRequestHeader("x-dimpro-request-id", input.requestId);
      xhr.setRequestHeader("x-dimpro-file-name", encodeURIComponent(input.file.name));
      xhr.setRequestHeader("x-dimpro-mime-type", input.file.type || "application/octet-stream");
      if (input.folderId) xhr.setRequestHeader("x-dimpro-folder-id", input.folderId);
    }
    xhr.upload.onprogress = (event) => {
      // Multipart framing overhead is included in loaded/total; normalize the
      // measured wire fraction onto file bytes instead of counting boundaries as file data.
      const fraction = event.lengthComputable && event.total > 0
        ? Math.min(1, Math.max(0, event.loaded / event.total)) : 0;
      input.onProgress(Math.floor(input.file.size * fraction));
      if (event.lengthComputable && event.loaded >= event.total && !networkSent) {
        networkSent = true;
        input.onNetworkSent();
      }
    };
    xhr.onload = () => {
      let payload: PersonalUploadResponse;
      try { payload = JSON.parse(xhr.responseText) as PersonalUploadResponse; }
      catch {
        finish(new PersonalUploadHttpError("A szerver válasza nem értelmezhető. Ellenőrizd a Saját Drive fájllistáját.", xhr.status, true));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.saved) {
        input.onProgress(input.file.size);
        finish(null, payload);
      } else finish(new PersonalUploadHttpError(
        payload.error || payload.code || "A Saját Drive feltöltése elutasítva.",
        xhr.status, xhr.status >= 500));
      // HTTP 5xx may follow a successful USER ref commit. The UI must classify
      // the result as uncertain and must never auto-create a second request ID.
    };
    xhr.onerror = () => finish(new PersonalUploadHttpError(
      "A feltöltés szerveroldali állapota nem igazolható. Ellenőrizd a fájllistát, mielőtt újraküldenéd.", 0, true));
    xhr.onabort = () => finish(new PersonalUploadHttpError("A feltöltés megszakadt. A szerveroldali véglegesítés állapota nem ismert.", 0, networkSent));
    // Large files use the raw File directly; never construct a second multipart
    // FormData body for a 100 MiB stream request.
    input.signal.addEventListener("abort", abort, {once: true});
    try {
      if (streaming) xhr.send(input.file);
      else {
        const form = new FormData();
        form.append("file", input.file, input.file.name);
        form.append("folderId", input.folderId);
        form.append("requestId", input.requestId);
        xhr.send(form);
      }
    } catch {
      finish(new PersonalUploadHttpError("A személyes feltöltés nem indítható.", 0, false));
    }
  });
}
