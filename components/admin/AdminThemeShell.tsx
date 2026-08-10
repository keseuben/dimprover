"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Boxes,
  Code2,
  GitBranch,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  ServerCog,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { DEV_RING_STORAGE_KEY, playDimproDevBell } from "./devBell";
import BenjadminBrandScreen from "./BenjadminBrandScreen";

type AdminTheme = "light" | "dark";
type AccessState = "checking" | "guest" | "authorized";

const STORAGE_KEY = "dimpro-admin-theme";
const ADMIN_AUTH_EVENT = "dimpro-admin-auth-changed";

const navigationItems = [
  { id: "overview", label: "Áttekintés", href: "/admin", icon: LayoutDashboard, note: "BENJADMIN indítópult és összkép" },
  { id: "development", label: "Fejlesztés", href: "/admin/dev", icon: Code2, note: "Verziók, időmérés és fejlesztési állapot" },
  { id: "environments", label: "Környezetek", href: "/admin/release-kozpont", icon: GitBranch, note: "DEV, STAGING és PROD kiadási útvonal" },
  { id: "infrastructure", label: "Infrastruktúra", href: "/admin/szerver", icon: ServerCog, note: "VPS, szolgáltatások és rendszerállapot" },
  { id: "licenses", label: "Licencek", href: "/admin/licenckozpont", icon: KeyRound, note: "Licenc-, eszköz- és jogosultságkezelés" },
  { id: "audit", label: "Audit", href: "/admin/dimpro-belepesek", icon: History, note: "Belépési és biztonsági események" },
] as const;

const utilityLinks = [
  { label: "Rendszerstruktúra", href: "/admin/dev/rendszerstruktura", icon: Network },
  { label: "Release feltöltő", href: "/admin/releases", icon: Boxes },
  { label: "Értesítések", href: "/admin/dev#ertesitesek", icon: Bell },
] as const;

function matchesPath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminThemeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<AdminTheme>("dark");
  const [themeReady, setThemeReady] = useState(false);
  const [accessState, setAccessState] = useState<AccessState>("checking");
  const [boardOpen, setBoardOpen] = useState(false);
  const [privacyCover, setPrivacyCover] = useState(false);

  const activeItem = useMemo(
    () => navigationItems.find((item) => matchesPath(pathname, item.href)) || navigationItems[0],
    [pathname],
  );

  const verifyStoredAdminKey = useCallback(async () => {
    const sessionActive = window.sessionStorage.getItem("dimproBenjadminSession") === "active";
    const key = window.localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!sessionActive || !key) {
      setAccessState("guest");
      return false;
    }

    try {
      const response = await fetch("/api/license/admin", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      if (!response.ok) {
        window.localStorage.removeItem("dimproLicenseAdminKey");
        window.sessionStorage.removeItem("dimproBenjadminSession");
        setAccessState("guest");
        return false;
      }
      setAccessState("authorized");
      return true;
    } catch {
      setAccessState("guest");
      return false;
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" ? "light" : "dark");
    setThemeReady(true);
    void verifyStoredAdminKey();

    const onAuthChanged = () => void verifyStoredAdminKey();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "dimproLicenseAdminKey") void verifyStoredAdminKey();
    };
    window.addEventListener(ADMIN_AUTH_EVENT, onAuthChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ADMIN_AUTH_EVENT, onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [verifyStoredAdminKey]);

  useEffect(() => {
    if (!themeReady) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.adminTheme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [themeReady, theme]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== "DIMPRO_DEV_PUSH") return;
      if (localStorage.getItem(DEV_RING_STORAGE_KEY) === "true") void playDimproDevBell();
    };
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
  }, []);

  const restoreFromPrivacyCover = useCallback(async () => {
    const authorized = await verifyStoredAdminKey();
    if (authorized) {
      setPrivacyCover(false);
      return;
    }
    setPrivacyCover(false);
    router.replace("/admin");
  }, [router, verifyStoredAdminKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.altKey && event.code === "Space")) return;
      if (accessState !== "authorized") return;
      event.preventDefault();
      if (privacyCover) void restoreFromPrivacyCover();
      else {
        setBoardOpen(false);
        setPrivacyCover(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accessState, privacyCover, restoreFromPrivacyCover]);

  useEffect(() => {
    if (accessState === "guest" && pathname !== "/admin") router.replace("/admin");
  }, [accessState, pathname, router]);

  function logout() {
    window.localStorage.removeItem("dimproLicenseAdminKey");
    window.sessionStorage.removeItem("dimproBenjadminSession");
    window.dispatchEvent(new Event(ADMIN_AUTH_EVENT));
    setAccessState("guest");
    setBoardOpen(false);
    setPrivacyCover(false);
    router.replace("/admin");
  }

  if (accessState === "checking") {
    return <BenjadminBrandScreen mode="entry" />;
  }

  if (accessState === "guest") {
    return <div className="benjadmin-public-slot">{children}</div>;
  }

  if (privacyCover) {
    return <BenjadminBrandScreen mode="privacy" onActivate={restoreFromPrivacyCover} />;
  }

  return (
    <div className={`dimpro-admin-shell admin-theme-${theme} benjadmin-shell`} data-theme={theme}>
      <aside className="benjadmin-rail" aria-label="BENJADMIN fő navigáció">
        <div className="benjadmin-rail__top">
          <Link href="/admin" className="benjadmin-rail__brand" aria-label="BENJADMIN áttekintés" title="BENJADMIN">
            D
          </Link>
          <button
            type="button"
            className={`benjadmin-rail__button ${boardOpen ? "is-active" : ""}`}
            onClick={() => setBoardOpen((current) => !current)}
            aria-expanded={boardOpen}
            aria-controls="benjadmin-floating-board"
            title={boardOpen ? "Navigáció bezárása" : "Navigáció megnyitása"}
          >
            {boardOpen ? <PanelLeftClose size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="benjadmin-rail__nav" aria-label="BENJADMIN nézetek">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = matchesPath(pathname, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`benjadmin-rail__button ${active ? "is-active" : ""}`}
                aria-label={item.label}
                title={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setBoardOpen(false)}
              >
                <Icon size={20} />
              </Link>
            );
          })}
        </nav>

        <div className="benjadmin-rail__bottom">
          <button
            type="button"
            className="benjadmin-rail__button"
            onClick={() => setPrivacyCover(true)}
            title="Adatvédelmi takaró"
            aria-label="Adatvédelmi takaró"
          >
            <ShieldCheck size={20} />
          </button>
          <button
            type="button"
            className="benjadmin-rail__button"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Sötét mód" : "Világos mód"}
            aria-label={theme === "light" ? "Sötét mód" : "Világos mód"}
          >
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>
      </aside>

      <aside
        id="benjadmin-floating-board"
        className={`benjadmin-floating-board ${boardOpen ? "is-open" : ""}`}
        aria-hidden={!boardOpen}
      >
        <div className="benjadmin-floating-board__header">
          <div>
            <p>DIMPRO</p>
            <h2>BENJADMIN</h2>
            <span>AI Fejlesztési és Üzemeltetési Központ</span>
          </div>
          <button type="button" className="benjadmin-board-close" onClick={() => setBoardOpen(false)} aria-label="Navigáció bezárása">
            <X size={18} />
          </button>
        </div>

        <nav className="benjadmin-board-nav" aria-label="BENJADMIN részletes navigáció">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = matchesPath(pathname, item.href);
            return (
              <Link key={item.id} href={item.href} className={`benjadmin-board-link ${active ? "is-active" : ""}`} onClick={() => setBoardOpen(false)}>
                <span className="benjadmin-board-link__icon"><Icon size={19} /></span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="benjadmin-board-section">
          <p className="benjadmin-board-section__label">Gyors elérés</p>
          {utilityLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="benjadmin-board-utility" onClick={() => setBoardOpen(false)}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="benjadmin-board-section benjadmin-board-ai">
          <p className="benjadmin-board-section__label">Belső AI struktúra</p>
          <strong>BenjAdmin → BenAI</strong>
          <span>ÁrminAI · JázminAI · OutminAI</span>
        </div>

        <div className="benjadmin-board-actions">
          <button type="button" onClick={() => setPrivacyCover(true)}><ShieldCheck size={17} /> Takaróképernyő</button>
          <button type="button" onClick={logout}><LogOut size={17} /> Kijelentkezés</button>
        </div>
      </aside>

      {boardOpen ? <button type="button" className="benjadmin-board-backdrop" aria-label="Navigáció bezárása" onClick={() => setBoardOpen(false)} /> : null}

      <div className="benjadmin-workspace">
        <header className="benjadmin-shell-topbar">
          <div className="benjadmin-shell-topbar__title">
            <span>BENJADMIN</span>
            <strong>{activeItem.label}</strong>
          </div>
          <div className="benjadmin-shell-topbar__actions">
            <span className="benjadmin-environment-badge">DEV</span>
            <button type="button" onClick={() => setPrivacyCover(true)} title="Takaróképernyő: Ctrl+Alt+Space" aria-label="Takaróképernyő">
              <ShieldCheck size={18} />
            </button>
          </div>
        </header>
        <div className="dimpro-admin-content benjadmin-shell-content">{children}</div>
      </div>
    </div>
  );
}
