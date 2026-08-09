"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import DropMobileDock, {
  dropMobileDockAllowed,
  type DropInstallState,
  type DropNotificationUiState,
  type DropWakeUiState,
} from "./DropMobileDock";
import {
  DROP_LOCAL_NOTIFICATION_EVENT,
  DROP_UPLOAD_RESUME_EVENT,
  DROP_WAKE_LOCK_EVENT,
  dispatchDropUploadResume,
  type DropLocalNotificationDetail,
  type DropWakeLockEventDetail,
} from "./dropMobileEvents";
import { DROP_PWA_RELEASE_INFO } from "./dropPwaReleaseInfo";
import {
  initializeDropNetworkMonitor,
  subscribeDropNetworkState,
  type DropNetworkState,
} from "./dropNetworkClient";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  standalone?: boolean;
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

const WAKE_PREFERENCE_KEY = "dimpro_drop_keep_awake_v097";
const NOTIFICATION_PREFERENCE_KEY = "dimpro_drop_notifications_v098";
const INITIAL_NETWORK_STATE: DropNetworkState = {
  browserOnline: true,
  serverReachable: true,
  online: true,
  checking: false,
  checkedAt: null,
  reason: "online",
};

export default function DropPwaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const requestInFlightRef = useRef(false);
  const shouldWakeRef = useRef(false);
  const requestWakeLockRef = useRef<() => void>(() => undefined);
  const updateApplyingRef = useRef(false);
  const serviceWorkerUpdateCheckRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);
  const lastServiceWorkerUpdateCheckRef = useRef(0);
  const previousOnlineRef = useRef(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  const [wakeManual, setWakeManual] = useState(false);
  const [wakeReasons, setWakeReasons] = useState<string[]>([]);
  const [wakeStatus, setWakeStatus] = useState<DropWakeUiState["status"]>("idle");
  const [wakeActive, setWakeActive] = useState(false);
  const [network, setNetwork] = useState<DropNetworkState>(INITIAL_NETWORK_STATE);
  const [reconnected, setReconnected] = useState(false);
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const dockAllowed = dropMobileDockAllowed(pathname);
  const wakeRequested = wakeManual || wakeReasons.length > 0;

  const requestWakeLock = useCallback(async () => {
    const wakeNavigator = navigator as WakeLockNavigator;
    if (!shouldWakeRef.current || document.visibilityState !== "visible" || !wakeNavigator.wakeLock?.request || sentinelRef.current || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setWakeStatus("requesting");
    try {
      const sentinel = await wakeNavigator.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setWakeActive(true);
      setWakeStatus("active");
      document.documentElement.dataset.dropWakeLock = "active";
      sentinel.addEventListener("release", () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null;
        setWakeActive(false);
        document.documentElement.dataset.dropWakeLock = "released";
        if (shouldWakeRef.current && document.visibilityState === "visible") window.setTimeout(() => requestWakeLockRef.current(), 350);
        else setWakeStatus(wakeSupported ? "idle" : "unsupported");
      }, { once: true });
    } catch {
      sentinelRef.current = null;
      setWakeActive(false);
      setWakeStatus("denied");
      document.documentElement.dataset.dropWakeLock = "denied";
    } finally { requestInFlightRef.current = false; }
  }, [wakeSupported]);

  useEffect(() => { requestWakeLockRef.current = () => void requestWakeLock(); }, [requestWakeLock]);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel && !sentinel.released) await sentinel.release().catch(() => undefined);
    setWakeActive(false);
    setWakeStatus(wakeSupported ? "idle" : "unsupported");
    document.documentElement.dataset.dropWakeLock = wakeSupported ? "idle" : "unsupported";
  }, [wakeSupported]);

  useEffect(() => {
    const stopMonitor = initializeDropNetworkMonitor();
    const unsubscribe = subscribeDropNetworkState((next) => {
      setNetwork(next);
      document.documentElement.dataset.dropNetwork = next.online ? "online" : "offline";
      document.documentElement.dataset.dropServerReachable = next.serverReachable ? "true" : "false";
      if (!previousOnlineRef.current && next.online) {
        setReconnected(true);
        window.setTimeout(() => setReconnected(false), 4_000);
        dispatchDropUploadResume();
        window.setTimeout(() => void serviceWorkerUpdateCheckRef.current(false), 1_800);
      }
      previousOnlineRef.current = next.online;
    });
    return () => { unsubscribe(); stopMonitor(); };
  }, []);

  useEffect(() => {
    const dropHost = window.location.hostname === "drop.dimpro.hu" || window.location.hostname === "localhost";
    let controllerReloaded = false;
    const onControllerChange = () => {
      if (!updateApplyingRef.current || controllerReloaded) return;
      controllerReloaded = true;
      window.location.reload();
    };
    const onWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "DROP_UPLOAD_RESUME_REQUESTED") window.dispatchEvent(new Event(DROP_UPLOAD_RESUME_EVENT));
      if (event.data?.type === "DROP_SW_READY") setUpdateAvailable(false);
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    let activeRegistration: ServiceWorkerRegistration | null = null;
    const requestUpdateCheck = async (force = false) => {
      if (!activeRegistration || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (!force && now - lastServiceWorkerUpdateCheckRef.current < 60_000) return;
      lastServiceWorkerUpdateCheckRef.current = now;
      setUpdateChecking(true);
      try {
        await activeRegistration.update();
        if (activeRegistration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
      } catch {
        // A következő foreground/online esemény újra megpróbálja az ellenőrzést.
      } finally {
        setUpdateChecking(false);
      }
    };
    serviceWorkerUpdateCheckRef.current = requestUpdateCheck;
    const onForeground = () => { if (document.visibilityState === "visible") void requestUpdateCheck(false); };
    if (dropHost && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/drop-sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
        activeRegistration = registration;
        setServiceWorkerRegistration(registration);
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
          });
        });
        void requestUpdateCheck(true);
      }).catch(() => undefined);
      document.addEventListener("visibilitychange", onForeground);
      window.addEventListener("pageshow", onForeground);
      window.addEventListener("online", onForeground);
    }
    return () => {
      serviceWorkerUpdateCheckRef.current = async () => undefined;
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onForeground);
      window.removeEventListener("online", onForeground);
    };
  }, []);

  useEffect(() => {
    const wakeNavigator = navigator as WakeLockNavigator;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean(wakeNavigator.standalone);
    const supported = Boolean(wakeNavigator.wakeLock?.request);
    const storedPreference = window.localStorage.getItem(WAKE_PREFERENCE_KEY);
    const defaultManual = storedPreference === null ? isStandalone : storedPreference === "true";
    const notificationApiSupported = "Notification" in window && "serviceWorker" in navigator;
    const permission = notificationApiSupported ? Notification.permission : "denied";
    const storedNotifications = window.localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) === "true";
    setStandalone(isStandalone);
    setShowIosInstall(isIos && !isStandalone);
    setWakeSupported(supported);
    setWakeManual(defaultManual);
    setWakeStatus(supported ? "idle" : "unsupported");
    setNotificationSupported(notificationApiSupported);
    setNotificationPermission(permission);
    setNotificationsEnabled(notificationApiSupported && permission === "granted" && storedNotifications);
    document.documentElement.dataset.dropWakeLockSupported = supported ? "true" : "false";
    document.documentElement.dataset.dropStandalone = isStandalone ? "true" : "false";
    document.documentElement.dataset.dropNotifications = permission === "granted" && storedNotifications ? "enabled" : "disabled";

    const onPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const onInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
      document.documentElement.dataset.dropStandalone = "true";
      if (window.localStorage.getItem(WAKE_PREFERENCE_KEY) === null) setWakeManual(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<DropLocalNotificationDetail>).detail;
      if (!detail?.title || !notificationsEnabled || Notification.permission !== "granted") return;
      void navigator.serviceWorker.ready.then((registration) => registration.showNotification(detail.title, {
        body: detail.body,
        tag: detail.tag,
        icon: "/drop-app-icon-v099-192.png",
        badge: "/drop-app-icon-v099-192.png",
        data: { url: detail.url || pathname },
      })).catch(() => undefined);
    };
    window.addEventListener(DROP_LOCAL_NOTIFICATION_EVENT, onNotification);
    return () => window.removeEventListener(DROP_LOCAL_NOTIFICATION_EVENT, onNotification);
  }, [notificationsEnabled, pathname]);

  useEffect(() => {
    const onWakeRequest = (event: Event) => {
      const detail = (event as CustomEvent<DropWakeLockEventDetail>).detail;
      if (!detail?.reason) return;
      setWakeReasons((current) => {
        const next = new Set(current);
        if (detail.active) next.add(detail.reason); else next.delete(detail.reason);
        return Array.from(next).sort();
      });
    };
    window.addEventListener(DROP_WAKE_LOCK_EVENT, onWakeRequest);
    return () => window.removeEventListener(DROP_WAKE_LOCK_EVENT, onWakeRequest);
  }, []);

  useEffect(() => {
    shouldWakeRef.current = wakeRequested;
    document.documentElement.dataset.dropWakeRequested = wakeRequested ? "true" : "false";
    if (wakeRequested) void requestWakeLock(); else void releaseWakeLock();
  }, [releaseWakeLock, requestWakeLock, wakeRequested]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible" && shouldWakeRef.current) void requestWakeLock(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      void releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  }

  function toggleWake() {
    if (!wakeSupported) return;
    setWakeManual((current) => {
      const next = !current;
      window.localStorage.setItem(WAKE_PREFERENCE_KEY, String(next));
      return next;
    });
  }

  async function toggleNotifications() {
    if (!notificationSupported) return;
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, "false");
      document.documentElement.dataset.dropNotifications = "disabled";
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setNotificationPermission(permission);
    const enabled = permission === "granted";
    setNotificationsEnabled(enabled);
    window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, String(enabled));
    document.documentElement.dataset.dropNotifications = enabled ? "enabled" : "disabled";
  }

  function applyUpdate() {
    const waiting = serviceWorkerRegistration?.waiting;
    if (!waiting) return;
    updateApplyingRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  async function checkForUpdate() {
    await serviceWorkerUpdateCheckRef.current(true);
  }

  const installState: DropInstallState = standalone ? "installed" : installPrompt ? "available" : showIosInstall ? "ios" : "none";
  const wakeMessage = useMemo(() => {
    if (!wakeSupported) return "Ezen a készüléken a böngésző nem támogatja a képernyő-ébrentartást.";
    if (wakeStatus === "denied") return "A rendszer vagy az energiatakarékos mód nem engedte az ébrentartást.";
    if (wakeStatus === "requesting") return "A képernyő-ébrentartás bekapcsolása folyamatban van…";
    if (wakeActive) return wakeReasons.length ? "Aktív a folyamatban lévő feltöltés vagy képfeldolgozás miatt." : "Aktív, amíg a DIMPRO Drop előtérben van.";
    if (wakeReasons.length) return "A feltöltés miatt automatikusan aktiválódik, amint a böngésző engedi.";
    return wakeManual ? "Bekapcsolva; látható alkalmazásnál automatikusan újraaktiválódik." : "Kikapcsolva; feltöltés közben automatikusan bekapcsol.";
  }, [wakeActive, wakeManual, wakeReasons.length, wakeStatus, wakeSupported]);

  const wake: DropWakeUiState = { supported: wakeSupported, requested: wakeRequested, active: wakeActive, manualEnabled: wakeManual, status: wakeStatus, message: wakeMessage };
  const notifications: DropNotificationUiState = {
    supported: notificationSupported,
    enabled: notificationsEnabled,
    permission: notificationPermission,
    message: !notificationSupported
      ? "A böngésző nem támogatja a helyi értesítést."
      : notificationPermission === "denied"
        ? "Az értesítés a böngésző beállításaiban le van tiltva."
        : notificationsEnabled
          ? "A feltöltés és kézbesítés elkészültéről helyi értesítés érkezik."
          : "Bekapcsolható a feltöltés elkészültének jelzéséhez.",
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-3 top-[max(10px,env(safe-area-inset-top))] z-[160] mx-auto flex max-w-xl flex-col gap-2 md:inset-x-auto md:right-5 md:top-5 md:w-[420px]">
        {!network.online ? <div data-drop-network-banner="offline" className="pointer-events-auto rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 shadow-xl">Nincs kapcsolat. A kész fájlrészek és a helyi feltöltési sor megmaradt; a folytatás automatikus.</div> : null}
        {reconnected ? <div data-drop-network-banner="reconnected" className="pointer-events-auto rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950 shadow-xl">A kapcsolat helyreállt. A függő feltöltések folytatódnak.</div> : null}
        {updateAvailable ? <div data-drop-update-banner className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950 shadow-xl"><span>Új DIMPRO Drop verzió érhető el.</span><button type="button" onClick={applyUpdate} className="rounded-xl bg-cyan-800 px-3 py-2 text-xs font-black text-white">Frissítés</button></div> : null}
      </div>
      <div className={dockAllowed ? "min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0" : undefined}>{children}</div>
      <DropMobileDock
        wake={wake}
        network={network}
        notifications={notifications}
        updateAvailable={updateAvailable}
        updateChecking={updateChecking}
        appInfo={DROP_PWA_RELEASE_INFO}
        installState={installState}
        onToggleWake={toggleWake}
        onToggleNotifications={() => void toggleNotifications()}
        onApplyUpdate={applyUpdate}
        onCheckForUpdate={() => void checkForUpdate()}
        onInstall={install}
      />
    </>
  );
}
