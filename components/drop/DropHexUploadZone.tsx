"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileUp, Images, LoaderCircle, UploadCloud } from "lucide-react";
import DropAnimatedHexLogo from "./DropAnimatedHexLogo";
import {
  DROP_MOBILE_OPEN_CAMERA_EVENT,
  DROP_MOBILE_OPEN_FILE_EVENT,
  DROP_MOBILE_OPEN_GALLERY_EVENT,
} from "./dropMobileEvents";

type DropFileSource = "file" | "gallery" | "camera" | "drop";

type Props = {
  accept: string;
  disabled?: boolean;
  busy?: boolean;
  imageMode?: boolean;
  allowCamera?: boolean;
  title?: string;
  description?: string;
  progress?: number;
  onFiles: (files: File[]) => void | Promise<void>;
};

const hexClip = "polygon(25% 2%, 75% 2%, 98% 50%, 75% 98%, 25% 98%, 2% 50%)";

export default function DropHexUploadZone({
  accept,
  disabled = false,
  busy = false,
  imageMode = false,
  allowCamera = false,
  title = "Fájlok hozzáadása",
  description = "Húzza a fájlokat a hexagon területre, vagy kattintson a tallózáshoz.",
  progress = 0,
  onFiles,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [cameraInputKey, setCameraInputKey] = useState(0);
  const [capturedPhotoCount, setCapturedPhotoCount] = useState(0);
  const inactive = disabled || busy;

  const isAvailable = useCallback(() => {
    const root = rootRef.current;
    if (!root || inactive) return false;
    const rect = root.getBoundingClientRect();
    const style = window.getComputedStyle(root);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }, [inactive]);

  const openInput = useCallback((input: HTMLInputElement | null) => {
    if (!input || !isAvailable()) return;
    // Azonos nevű vagy azonos kamera-fájl újbóli kiválasztásakor is keletkezzen change esemény.
    input.value = "";
    input.click();
  }, [isAvailable]);

  useEffect(() => {
    const openFile = () => openInput(fileRef.current);
    const openGallery = () => openInput(galleryRef.current || fileRef.current);
    const openCamera = () => openInput(cameraRef.current || galleryRef.current || fileRef.current);
    window.addEventListener(DROP_MOBILE_OPEN_FILE_EVENT, openFile);
    window.addEventListener(DROP_MOBILE_OPEN_GALLERY_EVENT, openGallery);
    window.addEventListener(DROP_MOBILE_OPEN_CAMERA_EVENT, openCamera);
    return () => {
      window.removeEventListener(DROP_MOBILE_OPEN_FILE_EVENT, openFile);
      window.removeEventListener(DROP_MOBILE_OPEN_GALLERY_EVENT, openGallery);
      window.removeEventListener(DROP_MOBILE_OPEN_CAMERA_EVENT, openCamera);
    };
  }, [openInput]);

  function handoff(files: FileList | null, source: DropFileSource, input?: HTMLInputElement | null) {
    // A FileList a böngésző inputjához kötött élő objektum lehet. Előbb készítünk
    // stabil File[] pillanatképet, és csak utána nullázzuk vagy cseréljük az inputot.
    const snapshot = Array.from(files || []);
    if (input) input.value = "";
    if (source === "camera") {
      if (snapshot.length) setCapturedPhotoCount((current) => current + snapshot.length);
      // Friss kamera-input = friss natív kamera-munkamenet iOS-en és Androidon is.
      setCameraInputKey((current) => current + 1);
    }
    if (!snapshot.length || inactive) return;
    void Promise.resolve(onFiles(snapshot));
  }

  return (
    <div
      ref={rootRef}
      data-drop-upload-zone="true"
      data-drop-camera-captures={capturedPhotoCount}
      className={`relative min-h-72 overflow-hidden rounded-[1.75rem] border p-4 transition sm:min-h-80 sm:p-6 ${dragActive ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%),linear-gradient(180deg,#f8fbfd,#ffffff)]"}`}
      onDragEnter={(event) => { event.preventDefault(); if (!inactive) setDragActive(true); }}
      onDragOver={(event) => { event.preventDefault(); if (!inactive) setDragActive(true); }}
      onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
      onDrop={(event) => { event.preventDefault(); setDragActive(false); handoff(event.dataTransfer.files, "drop"); }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <button
        type="button"
        disabled={inactive}
        onClick={() => openInput(fileRef.current)}
        onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !inactive) openInput(fileRef.current); }}
        className="relative mx-auto block h-56 w-full max-w-[25rem] border-0 bg-transparent p-0 text-left outline-none disabled:cursor-not-allowed sm:h-64"
        aria-label={`${title}. ${description}`}
      >
        <span className={`absolute inset-0 transition ${dragActive ? "scale-[1.03]" : "scale-100"}`} style={{ clipPath: hexClip, background: dragActive ? "linear-gradient(145deg,#0f766e,#0891b2)" : "linear-gradient(145deg,#083344,#0e7490 58%,#14b8a6)" }} />
        <span className="absolute inset-[5px] bg-white/95" style={{ clipPath: hexClip }} />
        <span className="absolute inset-[13px] border-2 border-dashed border-cyan-300 bg-cyan-50/70" style={{ clipPath: hexClip }} />
        {progress > 0 ? <span className="absolute bottom-4 left-1/2 h-2 w-48 -translate-x-1/2 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-cyan-700 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span> : null}
        <span className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
          <span className="relative grid place-items-center">
            <DropAnimatedHexLogo
              variant="compact"
              tone="light"
              active={dragActive || busy}
              label="DIMPRO HexaUpload animált feltöltési jel"
            />
            {busy ? (
              <span className="absolute -bottom-1 right-0 grid h-9 w-9 place-items-center rounded-full border border-cyan-200 bg-white text-cyan-800 shadow-md">
                <LoaderCircle size={19} className="animate-spin" />
              </span>
            ) : null}
          </span>
          <strong className="mt-4 text-lg text-slate-950 sm:text-xl">{dragActive ? "Engedje el a feltöltéshez" : title}</strong>
          <span className="mt-2 max-w-xs text-xs font-semibold leading-5 text-slate-600 sm:text-sm">{description}</span>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-900"><FileUp size={14} /> HexaUpload</span>
        </span>
      </button>

      <div className="relative mt-3 flex flex-wrap justify-center gap-2">
        {imageMode ? <button type="button" disabled={inactive} onClick={() => openInput(galleryRef.current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300 sm:hidden"><Images size={17} /> Galéria</button> : null}
        {imageMode && allowCamera ? <button type="button" data-drop-camera-button disabled={inactive} onClick={() => openInput(cameraRef.current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-black text-teal-900 disabled:text-slate-400 sm:hidden"><Camera size={17} /> {capturedPhotoCount ? "Újabb fotó" : "Kamera"}</button> : null}
        <button type="button" disabled={inactive} onClick={() => openInput(fileRef.current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"><UploadCloud size={17} /> Tallózás</button>
      </div>
      {capturedPhotoCount > 0 ? <p className="relative mt-2 text-center text-[11px] font-bold text-teal-800">{capturedPhotoCount} kamerakép hozzáadva · az „Újabb fotó” gombbal folytatható</p> : null}
      <input ref={fileRef} data-drop-file-input type="file" multiple accept={accept} className="hidden" onChange={(event) => handoff(event.target.files, "file", event.currentTarget)} />
      {imageMode ? <input ref={galleryRef} data-drop-gallery-input type="file" multiple accept="image/*" className="hidden" onChange={(event) => handoff(event.target.files, "gallery", event.currentTarget)} /> : null}
      {imageMode && allowCamera ? <input key={`camera-${cameraInputKey}`} ref={cameraRef} data-drop-camera-input data-drop-camera-session={cameraInputKey} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => handoff(event.target.files, "camera", event.currentTarget)} /> : null}
    </div>
  );
}
