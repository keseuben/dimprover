"use client";

import { useEffect, useState } from "react";
import { BellRing, Download, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Volume2, VolumeX } from "lucide-react";
import { DEV_RING_STORAGE_KEY, playDimproDevBell } from "./devBell";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PushConfigResponse = {
  ok?: boolean;
  publicKey?: string;
  configured?: boolean;
  subscriptionCount?: number;
  error?: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function adminHeaders(includeJson = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return {
    ...(includeJson ? { "content-type": "application/json" } : {}),
    "x-dimpro-license-admin-key": key,
  };
}

export default function DevPwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [ringEnabled, setRingEnabled] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [serverReady, setServerReady] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState("");

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(isStandalone);
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    setRingEnabled(localStorage.getItem(DEV_RING_STORAGE_KEY) === "true");

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("A DIMPRO Dev alkalmazás telepítve lett.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    void refreshPushState(false);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function refreshPushState(showMessage = true) {
    const browserSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(browserSupported);
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    setBusy(showMessage ? "refresh" : "");
    try {
      let localSubscribed = false;
      if (browserSupported) {
        const registration = await navigator.serviceWorker.register("/dimpro-dev-sw.js", { scope: "/admin/" });
        const existing = await registration.pushManager.getSubscription();
        localSubscribed = Boolean(existing);
      }
      setSubscribed(localSubscribed);
      const response = await fetch("/api/dev/push/public-key", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as PushConfigResponse | null;
      const ready = Boolean(response.ok && payload?.ok && payload.publicKey);
      setServerReady(ready);
      setSubscriptionCount(payload?.subscriptionCount || 0);
      setLastCheckedAt(new Date().toISOString());
      if (showMessage) {
        if (!browserSupported) setMessage("Ez a böngésző nem támogatja a PWA push értesítést.");
        else if (!ready) setMessage("A BENJADMIN push szerver még nincs teljesen konfigurálva.");
        else if (Notification.permission === "denied") setMessage("A böngésző blokkolja az értesítéseket. A webhely engedélyeinél állítsa az Értesítések jogosultságot Engedélyezve értékre.");
        else if (localSubscribed) setMessage("Ez az eszköz aktív push-feliratkozással rendelkezik.");
        else setMessage("A push szerver kész. Ezen az eszközön még engedélyezni kell az értesítéseket.");
      }
    } catch (error) {
      setServerReady(false);
      if (showMessage) setMessage(error instanceof Error ? error.message : "A PWA push állapot ellenőrzése sikertelen.");
    } finally {
      if (showMessage) setBusy("");
    }
  }

  async function installApp() {
    if (!installPrompt) {
      setMessage(installed
        ? "A DIMPRO Dev már telepített alkalmazásként fut."
        : "Mobilon nyissa meg a Chrome menüt, majd válassza a „Telepítés” vagy „Kezdőképernyőhöz adás” lehetőséget.");
      return;
    }
    setBusy("install");
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "A telepítés elindult." : "A telepítés megszakadt.");
    setBusy("");
  }

  async function enablePush() {
    if (!supported) {
      setMessage("Ez a böngésző nem támogatja a PWA push értesítést.");
      return;
    }
    if (!serverReady) {
      setMessage("A BENJADMIN push szerver nincs kész. Frissítse az állapotot, majd próbálja újra.");
      return;
    }
    if (Notification.permission === "denied") {
      setMessage("A böngészőben az értesítés blokkolva van. A webhely engedélyeinél előbb engedélyezze az Értesítéseket.");
      return;
    }
    setBusy("push");
    setMessage("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error("Az értesítési engedély nem lett megadva.");

      const registration = await navigator.serviceWorker.register("/dimpro-dev-sw.js", { scope: "/admin/" });
      await navigator.serviceWorker.ready;
      const keyResponse = await fetch("/api/dev/push/public-key", { headers: adminHeaders(), cache: "no-store" });
      const keyPayload = await keyResponse.json().catch(() => null) as PushConfigResponse | null;
      if (!keyResponse.ok || !keyPayload?.publicKey) throw new Error(keyPayload?.error || "A push nyilvános kulcs nem érhető el.");

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey),
      });

      const response = await fetch("/api/dev/push/subscribe", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceLabel: `${navigator.platform || "Mobil eszköz"} – DIMPRO Dev`,
        }),
      });
      const payload = await response.json().catch(() => null) as PushConfigResponse | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A push feliratkozás sikertelen.");

      setSubscribed(true);
      setSubscriptionCount(payload.subscriptionCount || 1);
      setMessage("A rendszerértesítés engedélyezve lett ezen az eszközön.");
      setLastCheckedAt(new Date().toISOString());
      await registration.showNotification("DIMPRO Dev értesítések engedélyezve", {
        body: "A fejlesztések elkészüléséről ez az eszköz rendszerértesítést kap.",
        icon: "/pwa/dimpro-dev-192.png",
        badge: "/pwa/dimpro-dev-192.png",
        tag: "dimpro-dev-enabled",
        data: { url: "/admin/dev#ertesitesek" },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az értesítés bekapcsolása sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function disablePush() {
    setBusy("push");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/dev/push/unsubscribe", {
          method: "POST",
          headers: adminHeaders(true),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setSubscriptionCount((count) => Math.max(0, count - 1));
      setMessage("A push értesítés ki lett kapcsolva ezen az eszközön.");
      setLastCheckedAt(new Date().toISOString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A leiratkozás sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function toggleRing() {
    const next = !ringEnabled;
    localStorage.setItem(DEV_RING_STORAGE_KEY, String(next));
    setRingEnabled(next);
    setMessage(next
      ? "Az egyedi DIMPRO jelzőhang bekapcsolva. A Hangteszt gombbal azonnal meghallgatható."
      : "Az egyedi DIMPRO jelzőhang kikapcsolva. A telefon rendszerhangja továbbra is működhet.");
  }

  async function testStrongRing() {
    localStorage.setItem(DEV_RING_STORAGE_KEY, "true");
    setRingEnabled(true);
    const played = await playDimproDevBell();
    setMessage(played
      ? "Az erős, egyedi DIMPRO jelzőhang megszólalt. A tényleges hangerőt a telefon médiahangereje szabályozza."
      : "A böngésző ezen az eszközön nem tudta lejátszani az egyedi hangot.");
  }

  async function sendTestPush() {
    setBusy("test");
    setMessage("");
    try {
      if (!subscribed) throw new Error("Előbb engedélyezze a push értesítést ezen az eszközön.");
      const liveResponse = await fetch("/api/dev/console/live", { headers: adminHeaders(), cache: "no-store" });
      const livePayload = await liveResponse.json().catch(() => null) as { live?: { tasks?: Array<{ id?: string }> } } | null;
      const taskId = livePayload?.live?.tasks?.find((task) => typeof task.id === "string" && task.id)?.id || "";
      const response = await fetch("/api/dev/push/test", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ taskId }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; sent?: number; failed?: number; targetTaskId?: string | null; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A tesztértesítés sikertelen.");
      setMessage(payload.sent
        ? payload.targetTaskId
          ? `Task deep-link teszt elküldve ${payload.sent} eszközre. Az értesítés a ${payload.targetTaskId} feladatra nyit.`
          : `Tesztértesítés elküldve ${payload.sent} eszközre.`
        : "Nincs aktív push eszköz. Engedélyezze a push értesítést ezen az eszközön.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A tesztértesítés sikertelen.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="dev-pwa-controls" aria-label="PWA és hangos értesítések">
      <div className="dev-pwa-status-row">
        <span className={installed ? "is-active" : ""}><Smartphone size={15} /> {installed ? "PWA telepítve" : "PWA böngészőben"}</span>
        <span className={subscribed ? "is-active" : ""}><BellRing size={15} /> {subscribed ? "Push aktív" : "Push kikapcsolva"}</span>
        <span className={serverReady ? "is-active" : ""}>{serverReady ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} {serverReady ? "Push szerver kész" : "Push szerver nem kész"}</span>
        <span className={ringEnabled ? "is-active" : ""}>{ringEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} {ringEnabled ? "Egyedi hang aktív" : "Egyedi hang kikapcsolva"}</span>
      </div>

      <div className="dev-pwa-actions">
        <button type="button" onClick={installApp} disabled={busy === "install"}>
          {busy === "install" ? <LoaderCircle className="dev-spin" size={17} /> : <Download size={17} />}
          {installed ? "Telepítve" : "Telepítés mobilra"}
        </button>
        <button type="button" onClick={subscribed ? disablePush : enablePush} disabled={busy === "push" || permission === "denied" || !serverReady}>
          {busy === "push" ? <LoaderCircle className="dev-spin" size={17} /> : <BellRing size={17} />}
          {subscribed ? "Push kikapcsolása" : permission === "denied" ? "Push blokkolva" : "Push engedélyezése"}
        </button>
        <button type="button" onClick={() => void refreshPushState(true)} disabled={busy === "refresh"}>
          {busy === "refresh" ? <LoaderCircle className="dev-spin" size={17} /> : <RefreshCw size={17} />}
          Állapot frissítése
        </button>
        <button type="button" onClick={toggleRing}>
          {ringEnabled ? <VolumeX size={17} /> : <Volume2 size={17} />}
          {ringEnabled ? "Egyedi hang kikapcsolása" : "Egyedi hang bekapcsolása"}
        </button>
        <button type="button" className="is-strong-sound" onClick={() => void testStrongRing()}>
          <Volume2 size={17} />
          Erős DIMPRO hang teszt
        </button>
        <button type="button" onClick={sendTestPush} disabled={busy === "test" || !subscribed}>
          {busy === "test" ? <LoaderCircle className="dev-spin" size={17} /> : <BellRing size={17} />}
          Task push teszt
        </button>
      </div>

      <p className="dev-pwa-note">
        Böngésző: <strong>{supported ? "támogatott" : "nem támogatott"}</strong> · Engedély: <strong>{permission}</strong> · Ezen az eszközön: <strong>{subscribed ? "aktív" : "inaktív"}</strong> · Szerveren: <strong>{subscriptionCount} eszköz</strong>
      </p>
      <p className="dev-pwa-device-note" data-testid="benjadmin-push-device-state">
        {serverReady && supported && permission !== "denied"
          ? subscribed
            ? "KÉSZ: ez az eszköz fogadhat BENJADMIN rendszerértesítéseket."
            : "TEENDŐ: nyomja meg a Push engedélyezése gombot ezen az eszközön."
          : permission === "denied"
            ? "TEENDŐ: a böngésző webhely-beállításainál engedélyezze az Értesítések jogosultságot."
            : "ELLENŐRZÉS SZÜKSÉGES: a push támogatás vagy a szerverkonfiguráció hiányos."}
        {lastCheckedAt ? ` · Ellenőrizve: ${new Date(lastCheckedAt).toLocaleString("hu-HU")}` : ""}
      </p>
      <p className="dev-pwa-sound-note">
        Az egyedi DIMPRO hang a megnyitott PWA-ban szól. Háttérben vagy lezárt képernyőn az Android saját értesítési hangja és rezgése működik.
      </p>
      <p className="dev-pwa-sound-note" data-testid="benjadmin-push-alert-types">
        Push események: feladat elkészült · fejlesztési hiba · ETA 15 percen belül · ETA lejárt. Az ETA értesítés csak aktív push-feliratkozás esetén kerül kiküldésre.
      </p>
      {message ? <p className="dev-pwa-message">{message}</p> : null}
    </section>
  );
}
