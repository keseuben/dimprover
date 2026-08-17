"use client";

import { useEffect, useState } from "react";

export default function FieldCapturePwaShell({ children }: { children: React.ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    const devHost = window.location.hostname === "dev.dimpro.hu" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!devHost || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    void navigator.serviceWorker.register("/field-capture-sw.js", { scope: "/field-capture/", updateViaCache: "none" }).then((next) => {
      registration = next;
      if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration?.installing;
        worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true); });
      });
    }).catch(() => undefined);
    return () => { registration = null; };
  }, []);
  return <>{updateAvailable ? <button type="button" onClick={() => window.location.reload()} className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-xl">Új Terepi DEV verzió · frissítés</button> : null}{children}</>;
}
