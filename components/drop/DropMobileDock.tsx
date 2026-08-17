"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  Camera,
  Download,
  FileUp,
  FolderInput,
  Home,
  Images,
  KeyRound,
  MapPinned,
  Menu,
  MoonStar,
  RefreshCw,
  Send,
  Share2,
  Smartphone,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { dispatchDropMobileAction } from "./dropMobileEvents";
import type { DropNetworkState } from "./dropNetworkClient";

export type DropWakeUiState = {
  supported: boolean;
  requested: boolean;
  active: boolean;
  manualEnabled: boolean;
  status: "unsupported" | "idle" | "requesting" | "active" | "denied";
  message: string;
};

export type DropNotificationUiState = {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission;
  message: string;
};

export type DropInstallState = "available" | "ios" | "installed" | "none";

export type DropPwaAppInfo = {
  version: string;
  versionLabel: string;
  releasedOn: string;
  releasedOnLabel: string;
  appType: string;
  appTypeLabel: string;
};

type Props = {
  wake: DropWakeUiState;
  network: DropNetworkState;
  notifications: DropNotificationUiState;
  updateAvailable: boolean;
  updateChecking: boolean;
  appInfo: DropPwaAppInfo;
  installState: DropInstallState;
  onToggleWake: () => void;
  onToggleNotifications: () => void;
  onApplyUpdate: () => void;
  onCheckForUpdate: () => void;
  onInstall: () => void | Promise<void>;
};

type Sheet = "upload" | "menu" | null;

const hexClip = "polygon(25% 2%,75% 2%,98% 50%,75% 98%,25% 98%,2% 50%)";

function normalizedPath(pathname: string) {
  if (pathname === "/drop") return "/";
  return pathname.startsWith("/drop/") ? pathname.slice(5) || "/" : pathname;
}

export function dropMobileDockAllowed(pathname: string) {
  const path = normalizedPath(pathname);
  return !["/d/", "/u/", "/p/", "/report/", "/join/", "/unavailable"].some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

function isActive(pathname: string, href: string) {
  const path = normalizedPath(pathname);
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

function availableUploadTarget() {
  return Boolean(document.querySelector<HTMLElement>("[data-drop-upload-zone='true'][data-drop-upload-available='true']"));
}

export default function DropMobileDock({
  wake,
  network,
  notifications,
  updateAvailable,
  updateChecking,
  appInfo,
  installState,
  onToggleWake,
  onToggleNotifications,
  onApplyUpdate,
  onCheckForUpdate,
  onInstall,
}: Props) {
  const pathname = usePathname() || "/";
  const [sheet, setSheet] = useState<Sheet>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [hasUploadZone, setHasUploadZone] = useState(false);
  const allowed = dropMobileDockAllowed(pathname);

  useEffect(() => setSheet(null), [pathname]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateKeyboard = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      setKeyboardOpen(window.innerHeight - viewportHeight - viewportTop > 180);
    };
    updateKeyboard();
    viewport?.addEventListener("resize", updateKeyboard);
    viewport?.addEventListener("scroll", updateKeyboard);
    window.addEventListener("resize", updateKeyboard);
    return () => {
      viewport?.removeEventListener("resize", updateKeyboard);
      viewport?.removeEventListener("scroll", updateKeyboard);
      window.removeEventListener("resize", updateKeyboard);
    };
  }, []);

  useEffect(() => {
    const updateModal = () => setExternalModalOpen(Boolean(document.querySelector("[role='dialog'][aria-modal='true']:not([data-drop-mobile-sheet])")));
    updateModal();
    const observer = new MutationObserver(updateModal);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sheet) return;
    setHasUploadZone(availableUploadTarget());
  }, [sheet, pathname]);

  const hideDock = !allowed || keyboardOpen || externalModalOpen;
  const menuBadge = installState === "available" || installState === "ios" || updateAvailable || !network.online;
  const wakeTone = wake.active ? "text-emerald-700" : wake.status === "denied" ? "text-amber-700" : "text-slate-500";
  const appStatus = updateAvailable ? "Frissítés elérhető" : updateChecking ? "Ellenőrzés…" : network.online ? "Naprakész" : "Offline";
  const appStatusClass = updateAvailable ? "bg-cyan-100 text-cyan-900" : updateChecking ? "bg-slate-100 text-slate-700" : network.online ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900";
  const items = useMemo(() => [
    { href: "/", label: "Kezdőlap", icon: Home },
    { href: "/open", label: "Megnyitás", icon: KeyRound },
    { href: "/send", label: "Send", icon: Send },
  ], []);

  function trigger(action: "file" | "gallery" | "camera") {
    dispatchDropMobileAction(action);
    setSheet(null);
  }

  if (hideDock) return null;

  return (
    <>
      {sheet ? (
        <div className="fixed inset-0 z-[145] bg-slate-950/35 px-3 backdrop-blur-sm md:hidden" onClick={() => setSheet(null)}>
          <section
            data-drop-mobile-sheet
            role="dialog"
            aria-modal="true"
            aria-label={sheet === "upload" ? "Mobil feltöltési gyorsmenü" : "DIMPRO Drop mobilmenü"}
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-3 mx-auto max-h-[calc(100dvh-120px)] max-w-md overflow-y-auto rounded-[1.75rem] border border-cyan-200 bg-white p-4 shadow-[0_28px_90px_rgba(15,23,42,.28)]"
            style={{ bottom: "calc(max(8px, env(safe-area-inset-bottom)) + 78px)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-700">{appInfo.versionLabel} · mobil</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{sheet === "upload" ? "Feltöltés és küldés" : "Alkalmazásmenü"}</h2>
              </div>
              <button type="button" aria-label="Menü bezárása" onClick={() => setSheet(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><X size={18}/></button>
            </div>

            {sheet === "upload" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" disabled={!hasUploadZone} onClick={() => trigger("gallery")} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 p-3 text-sm font-black text-teal-900 disabled:opacity-40"><Images size={24}/> Galéria</button>
                <button type="button" disabled={!hasUploadZone} onClick={() => trigger("camera")} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-black text-cyan-900 disabled:opacity-40"><Camera size={24}/> Kamera</button>
                <button type="button" disabled={!hasUploadZone} onClick={() => trigger("file")} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-800 disabled:opacity-40"><FileUp size={24}/> Fájl tallózása</button>
                <Link href="/send" onClick={() => setSheet(null)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-950 p-3 text-sm font-black text-white"><Send size={24}/> DIMPRO Send</Link>
                <Link href="/bekuldes" onClick={() => setSheet(null)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900"><FolderInput size={20}/> Beküldőkapu</Link>
                <Link href="/terep" onClick={() => setSheet(null)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 text-sm font-black text-cyan-950"><MapPinned size={20}/> Terep</Link>
                {!hasUploadZone ? <p className="col-span-2 text-center text-xs font-semibold leading-5 text-slate-500">A Galéria, Kamera és Fájl gomb akkor aktív, amikor van folytatható feltöltési munkamenet.</p> : null}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div data-drop-network-card className={`flex items-center gap-3 rounded-2xl border p-4 ${network.online ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ${network.online ? "text-emerald-700" : "text-amber-700"}`}>{network.online ? <Wifi size={21}/> : <WifiOff size={21}/>}</span>
                  <span><strong className={`block text-sm ${network.online ? "text-emerald-950" : "text-amber-950"}`}>{network.online ? "Online kapcsolat" : "Kapcsolat nélkül"}</strong><span className={`mt-1 block text-xs leading-5 ${network.online ? "text-emerald-800" : "text-amber-800"}`}>{network.online ? "A DIMPRO Drop szerver elérhető." : "A helyi sor megmarad; visszatéréskor automatikusan folytatódik."}</span></span>
                </div>

                <div data-drop-app-info className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-cyan-800"><Smartphone size={21}/></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-slate-950">DIMPRO Drop · v<span data-drop-app-version>{appInfo.version}</span></strong>
                        <span data-drop-app-status className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[.08em] ${appStatusClass}`}>{appStatus}</span>
                      </div>
                      <p data-drop-app-release-date className="mt-1 text-xs leading-5 text-slate-600">Frissítve: {appInfo.releasedOnLabel} · {appInfo.appTypeLabel}</p>
                    </div>
                  </div>
                  <button data-drop-check-update type="button" onClick={onCheckForUpdate} disabled={!network.online || updateChecking} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-white px-3 text-xs font-black text-cyan-900 disabled:cursor-not-allowed disabled:opacity-50">
                    <RefreshCw size={16} className={updateChecking ? "animate-spin" : ""}/>{updateChecking ? "Frissítés ellenőrzése…" : "Frissítés keresése"}
                  </button>
                </div>

                <button type="button" onClick={onToggleWake} disabled={!wake.supported} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left disabled:opacity-50">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ${wakeTone}`}>{wake.active ? <Zap size={21}/> : <MoonStar size={21}/>}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">Képernyő maradjon bekapcsolva</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{wake.message}</span></span>
                  <span className={`h-7 w-12 rounded-full p-1 transition ${wake.manualEnabled ? "bg-emerald-600" : "bg-slate-300"}`}><span className={`block h-5 w-5 rounded-full bg-white shadow transition ${wake.manualEnabled ? "translate-x-5" : "translate-x-0"}`}/></span>
                </button>

                <button type="button" onClick={onToggleNotifications} disabled={!notifications.supported || notifications.permission === "denied"} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left disabled:opacity-50">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ${notifications.enabled ? "text-cyan-700" : "text-slate-500"}`}>{notifications.enabled ? <Bell size={21}/> : <BellOff size={21}/>}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">Feltöltés elkészült értesítés</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{notifications.message}</span></span>
                  <span className={`h-7 w-12 rounded-full p-1 transition ${notifications.enabled ? "bg-cyan-700" : "bg-slate-300"}`}><span className={`block h-5 w-5 rounded-full bg-white shadow transition ${notifications.enabled ? "translate-x-5" : "translate-x-0"}`}/></span>
                </button>

                {updateAvailable ? <button type="button" onClick={onApplyUpdate} className="flex w-full items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-left"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-cyan-800"><RefreshCw size={21}/></span><span><strong className="block text-sm text-cyan-950">Új Drop-verzió elérhető</strong><span className="mt-1 block text-xs text-cyan-800">A frissítés után az alkalmazás újratöltődik; a helyi feltöltési sor megmarad.</span></span></button> : null}

                {installState !== "installed" && installState !== "none" ? (
                  <button type="button" onClick={() => void onInstall()} className="flex w-full items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-left">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-teal-800">{installState === "ios" ? <Share2 size={21}/> : <Download size={21}/>}</span>
                    <span><strong className="block text-sm text-teal-950">DIMPRO Drop telepítése</strong><span className="mt-1 block text-xs leading-5 text-teal-800">{installState === "ios" ? "Megosztás → Főképernyőhöz adás" : "Telepítés a kezdőképernyőre."}</span></span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><Smartphone className="text-emerald-700"/><div><strong className="block text-sm text-emerald-950">Alkalmazásmód</strong><span className="text-xs text-emerald-800">A DIMPRO Drop telepített vagy teljes képernyős módban fut.</span></div></div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/bekuldes" onClick={() => setSheet(null)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-xs font-black text-teal-900"><FolderInput size={17}/> Beküldőkapu</Link>
                  <Link href="/terep" onClick={() => setSheet(null)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-3 text-xs font-black text-cyan-900"><MapPinned size={17}/> Terep</Link>
                  <Link href="/open" onClick={() => setSheet(null)} className="col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800"><KeyRound size={17}/> Csomag / Tér</Link>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      <nav
        data-drop-mobile-dock
        aria-label="DIMPRO Drop mobil alsó navigáció"
        className="fixed z-[140] grid h-[76px] grid-cols-5 items-center gap-1 rounded-[1.4rem] border border-slate-200 bg-white px-2 py-2 shadow-[0_18px_55px_rgba(15,23,42,.24)] md:hidden"
        style={{ left: "max(8px, env(safe-area-inset-left))", right: "max(8px, env(safe-area-inset-right))", bottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        {items.slice(0, 2).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-black ${isActive(pathname, href) ? "bg-cyan-50 text-cyan-800" : "text-slate-600"}`}><Icon size={19}/><span>{label}</span></Link>)}
        <button type="button" onClick={() => setSheet((current) => current === "upload" ? null : "upload")} aria-label="Feltöltési gyorsmenü" className="relative -top-3 mx-auto flex h-[66px] w-[66px] flex-col items-center justify-center text-white drop-shadow-[0_12px_18px_rgba(8,145,178,.32)]" style={{ clipPath: hexClip, background: "linear-gradient(145deg,#083344,#0891b2 56%,#14b8a6)" }}><FileUp size={25}/><span className="mt-0.5 text-[8px] font-black uppercase tracking-[.08em]">Feltöltés</span></button>
        {items.slice(2).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-black ${isActive(pathname, href) ? "bg-cyan-50 text-cyan-800" : "text-slate-600"}`}><Icon size={19}/><span>{label}</span></Link>)}
        <button type="button" onClick={() => setSheet((current) => current === "menu" ? null : "menu")} className={`relative flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-black ${sheet === "menu" ? "bg-cyan-50 text-cyan-800" : "text-slate-600"}`}><Menu size={19}/><span>Menü</span>{menuBadge ? <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-white ${!network.online ? "bg-amber-500" : updateAvailable ? "bg-cyan-500" : "bg-emerald-500"}`}/> : null}</button>
      </nav>
    </>
  );
}
