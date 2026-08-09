"use client";

import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_DURATION_MS = 3000;

export default function MeetingDeleteConfirmModal({
  kind,
  name,
  description,
  deleting,
  errorMessage,
  onClose,
  onConfirm,
}: {
  kind: "project" | "meeting";
  name: string;
  description: string;
  deleting: boolean;
  errorMessage?: string;
  onClose: () => void;
  onConfirm: (confirmationName: string) => void | Promise<void>;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const completedRef = useRef(false);

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const cancelHold = useCallback(() => {
    if (completedRef.current || deleting) return;
    stopAnimation();
    startedAtRef.current = 0;
    setHolding(false);
    setProgress(0);
  }, [deleting, stopAnimation]);

  const finishHold = useCallback(() => {
    if (completedRef.current || deleting) return;
    completedRef.current = true;
    stopAnimation();
    setHolding(false);
    setProgress(1);
    void onConfirm(name);
  }, [deleting, name, onConfirm, stopAnimation]);

  const startHold = useCallback(() => {
    if (deleting || completedRef.current || holding || startedAtRef.current > 0) return;
    setHolding(true);
    setProgress(0);
    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAtRef.current;
      const nextProgress = Math.min(1, elapsed / HOLD_DURATION_MS);
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        finishHold();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [deleting, finishHold, holding]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  useEffect(() => {
    if (!deleting && completedRef.current && errorMessage) {
      completedRef.current = false;
      setProgress(0);
    }
  }, [deleting, errorMessage]);

  const remainingSeconds = Math.max(0, (HOLD_DURATION_MS * (1 - progress)) / 1000);
  const buttonLabel = deleting
    ? "Törlés folyamatban..."
    : holding
      ? `Tartsd még nyomva: ${remainingSeconds.toFixed(1)} mp`
      : "Tartsd nyomva 3 másodpercig";

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={kind === "project" ? "Projekt törlése" : "Értekezlet törlése"}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-2xl">
        <header className="flex items-start gap-4 border-b border-rose-100 p-5 sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700"><AlertTriangle size={24} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-950">{kind === "project" ? "Projekt végleges törlése" : "Értekezlet végleges törlése"}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={deleting || holding} title="Bezárás" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40"><X size={20} /></button>
        </header>

        <div className="p-5 sm:p-6">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-900">
            Biztosan törölni szeretnéd? A művelet nem vonható vissza. A végleges törléshez tartsd nyomva a piros gombot 3 másodpercig.
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-950">{name}</div>
          <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">Ha idő előtt felengeded az egeret, elhúzod a kurzort, vagy felengeded az Enter/Space billentyűt, a törlés megszakad.</div>
          {errorMessage && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800">{errorMessage}</div>}
        </div>

        <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={deleting || holding} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">Mégse</button>
          <button
            type="button"
            autoFocus
            disabled={deleting}
            data-hold-delete-button
            aria-label="Tartsd nyomva 3 másodpercig a végleges törléshez"
            onPointerDown={(event) => {
              event.preventDefault();
              startHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                startHold();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                cancelHold();
              }
            }}
            onBlur={cancelHold}
            onClick={(event) => event.preventDefault()}
            className="relative isolate inline-flex min-h-12 touch-none min-w-[250px] select-none items-center justify-center gap-2 overflow-hidden rounded-xl bg-rose-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-800 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="absolute inset-y-0 left-0 -z-10 bg-rose-950/45 transition-[width] duration-75 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
            {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
            <span>{buttonLabel}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
