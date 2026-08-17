"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

export type CameraLauncherHandle = { openCamera: () => void; openGallery: () => void };

const CameraLauncher = forwardRef<CameraLauncherHandle, { onFiles: (files: File[]) => void }>(function CameraLauncher({ onFiles }, ref) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({ openCamera: () => cameraRef.current?.click(), openGallery: () => galleryRef.current?.click() }), []);

  const handle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) onFiles(files);
  };

  return (
    <>
      <input ref={cameraRef} data-field-capture-camera-input type="file" accept="image/*,.heic,.heif" capture="environment" onChange={handle} className="hidden" />
      <input ref={galleryRef} data-field-capture-gallery-input type="file" accept="image/*,.heic,.heif" multiple onChange={handle} className="hidden" />
    </>
  );
});

export default CameraLauncher;
