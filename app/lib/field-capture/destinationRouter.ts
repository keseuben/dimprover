import type { CaptureDestination, PreCaptureOptions } from "./types";

export function fieldCaptureDestinations(options: PreCaptureOptions): CaptureDestination[] {
  return [
    { target: "CAPTURE", enabled: true, ready: true, detail: "A terepi capture rekord mindig létrejön." },
    { target: "DEVICE", enabled: options.saveToDevice, ready: true, detail: "Az eredeti kép közvetlen eszközletöltéssel menthető." },
    { target: "USER_DRIVE", enabled: options.saveToUserDrive, ready: true, detail: "Saját DIMPRO Drive P8 aktív: USER_ROOT ownership és független retention." },
    { target: "PROJECT_DRIVE", enabled: options.saveToProjectDrive, ready: false, detail: "Projektkapu Drive ACL/binding a P9 fázisban aktiválódik." },
  ];
}
