"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Home, Moon, ShieldCheck, Sun } from "lucide-react";
import { DEV_RING_STORAGE_KEY, playDimproDevBell } from "./devBell";

type AdminTheme = "light" | "dark";

const STORAGE_KEY = "dimpro-admin-theme";

export default function AdminThemeShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const resolved: AdminTheme = stored === "dark" ? "dark" : "light";
    setTheme(resolved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.adminTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [ready, theme]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== "DIMPRO_DEV_PUSH") return;
      if (localStorage.getItem(DEV_RING_STORAGE_KEY) === "true") void playDimproDevBell();
    };
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
  }, []);

  return (
    <div className={`dimpro-admin-shell admin-theme-${theme}`} data-theme={theme}>
      <header className="dimpro-admin-topbar">
        <div className="dimpro-admin-topbar__inner">
          <div className="dimpro-admin-topbar__brand">
            <Link href="/admin/dev" className="dimpro-admin-icon-button" aria-label="Vissza a Fejlesztési Központba" title="Vissza a Fejlesztési Központba">
              <Home size={19} aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="dimpro-admin-eyebrow">DIMPRO</p>
              <p className="dimpro-admin-title">Fejlesztési és Licencközpont</p>
            </div>
          </div>

          <nav className="dimpro-admin-topbar__actions" aria-label="Admin gyorsműveletek">
            <Link href="/admin/dev#ertesitesek" className="dimpro-admin-icon-button" aria-label="Fejlesztési értesítések" title="Fejlesztési értesítések">
              <Bell size={18} aria-hidden="true" />
            </Link>
            <Link href="/admin" className="dimpro-admin-nav-link">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>Licencadmin</span>
            </Link>
            <button
              type="button"
              className="dimpro-admin-theme-toggle"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              aria-label={theme === "light" ? "Sötét mód bekapcsolása" : "Világos mód bekapcsolása"}
              title={theme === "light" ? "Sötét mód" : "Világos mód"}
            >
              {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
              <span>{theme === "light" ? "Sötét mód" : "Világos mód"}</span>
            </button>
          </nav>
        </div>
      </header>
      <div className="dimpro-admin-content">{children}</div>
    </div>
  );
}
