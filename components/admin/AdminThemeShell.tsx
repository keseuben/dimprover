"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  GitBranch,
  History,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Moon,
  PanelLeftClose,
  ServerCog,
  ShieldCheck,
  Sun,
  UsersRound,
} from "lucide-react";
import { DEV_RING_STORAGE_KEY, playDimproDevBell } from "./devBell";
import BenjadminBrandScreen from "./BenjadminBrandScreen";
import BenjadminExplorerPanel from "./BenjadminExplorerPanel";
import BenjadminTeamScreen from "./BenjadminTeamScreen";
import BenjadminPersonProfileHost from "./BenjadminPersonProfileHost";

type AdminTheme = "light" | "dark";
type AccessState = "checking" | "guest" | "authorized";

const STORAGE_KEY = "dimpro-admin-theme";
const BOARD_PIN_STORAGE_KEY = "dimpro-benjadmin-board-pinned";
const ADMIN_AUTH_EVENT = "dimpro-admin-auth-changed";

const navigationItems = [
  { id: "overview", label: "Áttekintés", href: "/admin", icon: LayoutDashboard, note: "BENJADMIN indítópult és összkép" },
  { id: "development", label: "Fejlesztés", href: "/admin/dev", icon: Code2, note: "Verziók, időmérés és fejlesztési állapot" },
  { id: "environments", label: "Környezetek", href: "/admin/release-kozpont", icon: GitBranch, note: "DEV, STAGING és PROD kiadási útvonal" },
  { id: "infrastructure", label: "Infrastruktúra", href: "/admin/szerver", icon: ServerCog, note: "VPS, szolgáltatások és rendszerállapot" },
  { id: "licenses", label: "Licencek", href: "/admin/licenckozpont", icon: KeyRound, note: "Licenc-, eszköz- és jogosultságkezelés" },
  { id: "audit", label: "Audit", href: "/admin/dimpro-belepesek", icon: History, note: "Belépési és biztonsági események" },
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
  const [boardPinned, setBoardPinned] = useState(false);
  const [privacyCover, setPrivacyCover] = useState(false);
  const [teamScreen, setTeamScreen] = useState(false);

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
    const storedBoardPinned = window.localStorage.getItem(BOARD_PIN_STORAGE_KEY) === "true";
    setTheme(stored === "light" ? "light" : "dark");
    setBoardPinned(storedBoardPinned);
    setBoardOpen(storedBoardPinned);
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
    window.localStorage.setItem(BOARD_PIN_STORAGE_KEY, String(boardPinned));
    document.documentElement.dataset.adminTheme = theme;
    document.documentElement.style.colorScheme = theme;
    if (boardPinned) setBoardOpen(true);
  }, [boardPinned, themeReady, theme]);

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
        if (!boardPinned) setBoardOpen(false);
        setTeamScreen(false);
        setPrivacyCover(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [accessState, boardPinned, privacyCover, restoreFromPrivacyCover]);

  useEffect(() => {
    const onTeamShortcut = (event: KeyboardEvent) => {
      if (accessState !== "authorized" || privacyCover) return;
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
      const ctrlAltZero = event.ctrlKey && event.altKey && !event.metaKey && (event.code === "Digit0" || event.code === "Numpad0");
      const plainD = !typing && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === "d";
      if (!ctrlAltZero && !plainD) return;
      event.preventDefault();
      if (!boardPinned) setBoardOpen(false);
      setTeamScreen((current) => !current);
    };
    window.addEventListener("keydown", onTeamShortcut);
    return () => window.removeEventListener("keydown", onTeamShortcut);
  }, [accessState, boardPinned, privacyCover]);

  useEffect(() => {
    if (accessState === "guest" && pathname !== "/admin") router.replace("/admin");
  }, [accessState, pathname, router]);

  useEffect(() => {
    const onPrivacyRequest = () => {
      if (accessState !== "authorized") return;
      if (!boardPinned) setBoardOpen(false);
      setTeamScreen(false);
      setPrivacyCover(true);
    };
    window.addEventListener("benjadmin:privacy-cover", onPrivacyRequest);
    return () => window.removeEventListener("benjadmin:privacy-cover", onPrivacyRequest);
  }, [accessState, boardPinned]);

  const openDeveloperConsole = useCallback(() => {
    const target = "/admin/dev-console";
    const popup = window.open(target, "benjadmin-developer-console", "popup=yes,resizable=yes,scrollbars=no");
    if (!popup) router.push(target);
    else popup.focus();
  }, [router]);


  if (accessState === "checking") {
    return <BenjadminBrandScreen mode="entry" />;
  }

  if (accessState === "guest") {
    return <div className="benjadmin-public-slot">{children}</div>;
  }

  if (privacyCover) {
    return <BenjadminBrandScreen mode="privacy" onActivate={restoreFromPrivacyCover} />;
  }

  if (teamScreen) {
    return (
      <BenjadminTeamScreen
        theme={theme}
        onThemeToggle={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        onClose={() => setTeamScreen(false)}
      />
    );
  }

  if (pathname === "/admin/dev-console") {
    return <div className="benjadmin-developer-console-host">{children}<BenjadminPersonProfileHost /></div>;
  }

  return (
    <div className={`dimpro-admin-shell admin-theme-${theme} benjadmin-shell ${boardPinned && boardOpen ? "is-board-pinned" : ""}`} data-theme={theme}>
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
                onClick={() => { if (!boardPinned) setBoardOpen(false); }}
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
        className={`benjadmin-floating-board benjadmin-explorer-board ${boardOpen ? "is-open" : ""} ${boardPinned ? "is-pinned" : ""}`}
        aria-hidden={!boardOpen}
      >
        <BenjadminExplorerPanel
          pinned={boardPinned}
          onPinnedChange={(value) => {
            setBoardPinned(value);
            if (value) setBoardOpen(true);
          }}
          onClose={() => setBoardOpen(false)}
          onNavigate={() => {
            if (!boardPinned) setBoardOpen(false);
          }}
        />
      </aside>

      {boardOpen && !boardPinned ? <button type="button" className="benjadmin-board-backdrop" aria-label="Explorer bezárása" onClick={() => setBoardOpen(false)} /> : null}

      <div className="benjadmin-workspace">
        <header className="benjadmin-shell-topbar">
          <div className="benjadmin-shell-topbar__title">
            <span>BENJADMIN</span>
            <strong>{activeItem.label}</strong>
          </div>
          <div className="benjadmin-shell-topbar__actions">
            <span className="benjadmin-canonical-badge">CANONICAL</span>
            <span className="benjadmin-environment-badge">DEV</span>
            <button
              type="button"
              data-testid="benjadmin-developer-console-button"
              onClick={openDeveloperConsole}
              title="BENJADMIN Fejlesztői Konzol megnyitása külön ablakban"
              aria-label="Fejlesztői Konzol megnyitása"
            >
              <MessagesSquare size={18} />
            </button>
            <button
              type="button"
              data-testid="benjadmin-topbar-theme-toggle"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              title={theme === "light" ? "Sötét mód" : "Világos mód"}
              aria-label={theme === "light" ? "Sötét mód" : "Világos mód"}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button type="button" data-testid="benjadmin-team-screen-button" onClick={() => setTeamScreen(true)} title="BENJADMIN csapat: D vagy Ctrl+Alt+0" aria-label="BENJADMIN csapatképernyő">
              <UsersRound size={18} />
            </button>
            <button type="button" onClick={() => { setTeamScreen(false); setPrivacyCover(true); }} title="Takaróképernyő: Ctrl+Alt+Space" aria-label="Takaróképernyő">
              <ShieldCheck size={18} />
            </button>
          </div>
        </header>
        <div className="dimpro-admin-content benjadmin-shell-content">{children}</div>
      </div>
      <BenjadminPersonProfileHost />
    </div>
  );
}
