"use client";

import { useEffect, useRef } from "react";

type BenjadminBrandScreenProps = {
  mode?: "entry" | "privacy";
  onActivate?: () => void | Promise<void>;
};

const LONG_PRESS_MS = 700;

export default function BenjadminBrandScreen({ mode = "entry", onActivate }: BenjadminBrandScreenProps) {
  const longPressTimerRef = useRef<number | null>(null);

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function activate() {
    clearLongPress();
    if (onActivate) void onActivate();
  }

  function startLongPress() {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      if (onActivate) void onActivate();
    }, LONG_PRESS_MS);
  }

  useEffect(() => clearLongPress, []);

  return (
    <main className="benjadmin-protective" data-mode={mode}>
      <div className="benjadmin-protective__grid" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--a" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--b" aria-hidden="true" />
      <section className="benjadmin-protective__content" aria-label="DIMPRO BENJADMIN">
        <div className="benjadmin-protective__wordmark" aria-label="DIMPRO BENJADMIN">
          <button
            type="button"
            className="benjadmin-protective__d"
            aria-label="BENJADMIN vezérlőpont"
            onDoubleClick={activate}
            onPointerDown={startLongPress}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            onPointerLeave={clearLongPress}
            onContextMenu={(event) => event.preventDefault()}
          >
            D
          </button>
          <span>IMPRO BENJADMIN</span>
        </div>
        <p>AI Fejlesztési és Üzemeltetési Központ</p>
      </section>
    </main>
  );
}
