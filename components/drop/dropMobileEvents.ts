"use client";

import { useEffect } from "react";

export const DROP_MOBILE_OPEN_FILE_EVENT = "dimpro-drop-mobile-open-file";
export const DROP_MOBILE_OPEN_GALLERY_EVENT = "dimpro-drop-mobile-open-gallery";
export const DROP_MOBILE_OPEN_CAMERA_EVENT = "dimpro-drop-mobile-open-camera";
export const DROP_WAKE_LOCK_EVENT = "dimpro-drop-wake-lock";
export const DROP_LOCAL_NOTIFICATION_EVENT = "dimpro-drop-local-notification";
export const DROP_UPLOAD_RESUME_EVENT = "dimpro-drop-upload-resume";
export const DROP_BACKGROUND_SYNC_TAG = "dimpro-drop-upload-resume-v098";

export type DropWakeLockEventDetail = {
  reason: string;
  active: boolean;
};

export type DropLocalNotificationDetail = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

export function dispatchDropMobileAction(action: "file" | "gallery" | "camera") {
  const eventName = action === "camera"
    ? DROP_MOBILE_OPEN_CAMERA_EVENT
    : action === "gallery"
      ? DROP_MOBILE_OPEN_GALLERY_EVENT
      : DROP_MOBILE_OPEN_FILE_EVENT;
  window.dispatchEvent(new Event(eventName));
}

export function dispatchDropWakeLock(reason: string, active: boolean) {
  window.dispatchEvent(new CustomEvent<DropWakeLockEventDetail>(DROP_WAKE_LOCK_EVENT, {
    detail: { reason, active },
  }));
}

export function dispatchDropLocalNotification(detail: DropLocalNotificationDetail) {
  window.dispatchEvent(new CustomEvent<DropLocalNotificationDetail>(DROP_LOCAL_NOTIFICATION_EVENT, { detail }));
}

export function dispatchDropUploadResume() {
  window.dispatchEvent(new Event(DROP_UPLOAD_RESUME_EVENT));
}

export async function registerDropBackgroundResume() {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready.catch(() => null) as SyncRegistration | null;
  if (!registration?.sync?.register) return false;
  await registration.sync.register(DROP_BACKGROUND_SYNC_TAG).catch(() => undefined);
  return true;
}

export function useDropAutomaticWakeLock(reason: string, active: boolean) {
  useEffect(() => {
    dispatchDropWakeLock(reason, active);
    return () => dispatchDropWakeLock(reason, false);
  }, [active, reason]);
}
