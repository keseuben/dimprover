"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type HoldActionTone = "success" | "warning" | "danger";

type HoldActionButtonProps = {
  tone: HoldActionTone;
  label: string;
  holdingLabel?: string;
  runningLabel?: string;
  completedLabel?: string;
  durationMs?: number;
  icon?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  onComplete: () => void | Promise<void>;
};

export function HoldActionButton({
  tone,
  label,
  holdingLabel,
  runningLabel,
  completedLabel,
  durationMs = 2000,
  icon,
  disabled = false,
  compact = false,
  className = "",
  ariaLabel,
  onComplete,
}: HoldActionButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopAnimation();
    startedAtRef.current = 0;
    pointerIdRef.current = null;
    completedRef.current = false;
    setHolding(false);
    setRunning(false);
    setCompleted(false);
    setProgress(0);
  }, [stopAnimation]);

  const cancelHold = useCallback(() => {
    if (completedRef.current || running) return;
    stopAnimation();
    startedAtRef.current = 0;
    pointerIdRef.current = null;
    setHolding(false);
    setProgress(0);
  }, [running, stopAnimation]);

  const finishHold = useCallback(async () => {
    if (completedRef.current || running || disabled) return;
    completedRef.current = true;
    stopAnimation();
    setHolding(false);
    setProgress(1);
    setRunning(true);
    try {
      await onComplete();
      setCompleted(true);
      window.setTimeout(() => reset(), 900);
    } catch {
      reset();
    } finally {
      setRunning(false);
    }
  }, [disabled, onComplete, reset, running, stopAnimation]);

  const startHold = useCallback(() => {
    if (disabled || running || holding || completedRef.current || startedAtRef.current > 0) return;
    setHolding(true);
    setCompleted(false);
    setProgress(0);
    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAtRef.current) / durationMs);
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        void finishHold();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [disabled, durationMs, finishHold, holding, running]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);
  useEffect(() => {
    // A szülő komponens a futó művelet elején gyakran disabled=true állapotot ad.
    // Ilyenkor nem szabad lenullázni a folyamatjelzőt vagy a befejezési védelmet.
    if (disabled && !running && !completedRef.current) reset();
  }, [disabled, reset, running]);

  const remainingSeconds = Math.max(0, (durationMs * (1 - progress)) / 1000);
  const defaultRunningLabel = tone === "success" ? "Mentés..." : tone === "danger" ? "Művelet..." : "Megerősítés...";
  const defaultCompletedLabel = tone === "success" ? "Mentve" : tone === "danger" ? "Elvégezve" : "Megerősítve";
  const currentLabel = completed
    ? (completedLabel || defaultCompletedLabel)
    : running
      ? (runningLabel || defaultRunningLabel)
      : holding
        ? `${holdingLabel || "Tartsd nyomva"} ${remainingSeconds.toFixed(1)} mp`
        : label;

  const toneClass = tone === "success"
    ? "border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-200"
    : tone === "warning"
      ? "border-amber-700 bg-amber-500 text-slate-950 hover:bg-amber-600 focus:ring-amber-200"
      : "border-rose-800 bg-rose-700 text-white hover:bg-rose-800 focus:ring-rose-200";
  const progressClass = tone === "success"
    ? "bg-emerald-950/45"
    : tone === "warning"
      ? "bg-amber-900/30"
      : "bg-rose-950/45";

  return (
    <button
      type="button"
      disabled={disabled || running}
      data-hold-action={tone}
      data-hold-progress={Math.round(progress * 100)}
      aria-label={ariaLabel || `${label}. Tartsd nyomva ${(durationMs / 1000).toFixed(0)} másodpercig.`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled || running) return;
        event.preventDefault();
        pointerIdRef.current = event.pointerId;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* böngészőfüggő */ }
        startHold();
      }}
      onPointerUp={(event) => {
        if (pointerIdRef.current === event.pointerId) {
          try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* már megszűnhetett */ }
        }
        cancelHold();
      }}
      onPointerCancel={cancelHold}
      onLostPointerCapture={cancelHold}
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
      className={`relative isolate inline-flex touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-xl border font-black shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "min-h-10 px-3 py-2 text-[10px]" : "min-h-12 px-4 py-3 text-sm"} ${toneClass} ${className}`}
    >
      <span className={`absolute inset-y-0 left-0 -z-10 overflow-hidden transition-[width] duration-75 ease-linear ${progressClass}`} style={{ width: `${Math.round(progress * 100)}%` }}>
        <span className="absolute inset-y-0 right-[-28px] w-14 -skew-x-12 animate-pulse bg-white/20" />
      </span>
      <span className={holding ? "animate-pulse" : ""}>{icon}</span>
      <span className="whitespace-nowrap">{currentLabel}</span>
    </button>
  );
}
