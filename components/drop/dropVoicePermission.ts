export class DropMicrophonePermissionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "DropMicrophonePermissionError";
  }
}

function permissionMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "A mikrofon használata nincs engedélyezve ehhez a webhelyhez. Engedélyezze a mikrofont a böngésző webhelyengedélyeinél, majd próbálja újra.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "A böngésző nem talál használható mikrofont ezen az eszközön.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A mikrofont jelenleg más alkalmazás használja, vagy a böngésző nem tud hozzáférni.";
  }
  return error instanceof Error && error.message ? error.message : "A mikrofonengedély ellenőrzése sikertelen.";
}

/**
 * Explicit webhely-mikrofonengedélyt kér a SpeechRecognition indítása előtt.
 * A kapott MediaStreamet nem rögzítjük és nem tároljuk; a trackeket azonnal leállítjuk.
 * Ha a böngészőn nincs getUserMedia API, a SpeechRecognition saját engedélykérésére hagyatkozunk.
 */
export async function requestDropMicrophonePermission() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return { requested: false } as const;
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { requested: true } as const;
  } catch (error) {
    throw new DropMicrophonePermissionError(permissionMessage(error), error instanceof Error ? error.name || "MICROPHONE_PERMISSION_FAILED" : "MICROPHONE_PERMISSION_FAILED");
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
