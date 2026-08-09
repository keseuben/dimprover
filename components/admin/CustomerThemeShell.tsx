"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const STORAGE_KEY = "dimpro-admin-theme";

export default function CustomerThemeShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "dark" ? "dark" : "light");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.adminTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [ready, theme]);

  return (
    <div className={`dimpro-admin-shell admin-theme-${theme}`} data-theme={theme}>
      <header className="dimpro-admin-topbar">
        <div className="dimpro-admin-topbar__inner">
          <div className="dimpro-admin-topbar__brand">
            <Link href="https://dimpro.hu" className="dimpro-admin-icon-button" aria-label="Vissza a DIMPRO kezdőlapra" title="Vissza a DIMPRO kezdőlapra">
              <Home size={19} aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="dimpro-admin-eyebrow">DIMPRO</p>
              <p className="dimpro-admin-title">Ügyféloldali licencportál</p>
            </div>
          </div>
          <button
            type="button"
            className="dimpro-admin-theme-toggle"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "Sötét mód bekapcsolása" : "Világos mód bekapcsolása"}
            title={theme === "light" ? "Sötét mód" : "Világos mód"}
          >
            {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
            <span>{theme === "light" ? "Sötét mód" : "Világos mód"}</span>
          </button>
        </div>
      </header>
      <div className="dimpro-admin-content">{children}</div>
    </div>
  );
}
