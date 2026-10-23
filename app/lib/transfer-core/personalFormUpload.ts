"use client";

/** Shared Transfer Center transport: bounded, single POST, deliberately NO auto-retry. */
export type PersonalUploadResponse = {
  ok?: boolean; saved?: boolean; error?: string; code?: string;
  scanStatus?: "CLEAN" | "INFECTED"; contentRefId?: string;
  placedInFolder?: boolean; alreadyCompleted?: boolean;
};
export class PersonalUploadHttpError extends Error {
  constructor(message: string, public readonly status: number, public readonly uncertain: boolean) {
    super(message);
    this.name = "PersonalUploadHttpError";
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
    xhr.open("POST", "/api/drive/personal/uploads", true);
    xhr.withCredentials = true;
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
        payload.error || payload.code || "A Saját Drive feltöltése elutasítva.", xhr.status, false));
    };
    xhr.onerror = () => finish(new PersonalUploadHttpError(
      "A feltöltés szerveroldali állapota nem igazolható. Ellenőrizd a fájllistát, mielőtt újraküldenéd.", 0, true));
    xhr.onabort = () => finish(new PersonalUploadHttpError("A feltöltés megszakadt. A szerveroldali véglegesítés állapota nem ismert.", 0, networkSent));
    const form = new FormData();
    form.append("file", input.file, input.file.name);
    form.append("folderId", input.folderId);
    form.append("requestId", input.requestId);
    input.signal.addEventListener("abort", abort, {once: true});
    try { xhr.send(form); }
    catch { finish(new PersonalUploadHttpError("A személyes feltöltés nem indítható.", 0, false)); }
  });
}
