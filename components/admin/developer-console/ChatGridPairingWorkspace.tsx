"use client";

import { Check, Clipboard, KeyRound, Laptop, RefreshCw, ShieldCheck, Unplug, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WindowsBridgeReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge";
import type { WindowsBridgeDeviceSummary } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";

type PairingView = { pairingId: string; code: string; expiresAt: string; maxAttempts: number };

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function chatGridDevice(device: WindowsBridgeDeviceSummary) {
  return device.agentId.toLowerCase().startsWith("chatgrid-");
}

export default function ChatGridPairingWorkspace() {
  const [readiness, setReadiness] = useState<WindowsBridgeReadiness | null>(null);
  const [devices, setDevices] = useState<WindowsBridgeDeviceSummary[]>([]);
  const [pairing, setPairing] = useState<PairingView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [readinessResponse, devicesResponse] = await Promise.all([
        fetch("/api/dev/terminal-hub/windows-bridge/readiness", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/dev/terminal-hub/windows-bridge/devices", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const readinessPayload = await readinessResponse.json().catch(() => null) as { ok?: boolean; readiness?: WindowsBridgeReadiness; error?: string } | null;
      const devicesPayload = await devicesResponse.json().catch(() => null) as { ok?: boolean; devices?: WindowsBridgeDeviceSummary[]; error?: string } | null;
      if (!readinessResponse.ok || !readinessPayload?.ok || !readinessPayload.readiness) throw new Error(readinessPayload?.error || "A ChatGrid pairing readiness nem tölthető be.");
      if (!devicesResponse.ok || !devicesPayload?.ok) throw new Error(devicesPayload?.error || "A ChatGrid device lista nem tölthető be.");
      setReadiness(readinessPayload.readiness);
      setDevices((devicesPayload.devices || []).filter(chatGridDevice));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A BENJADMIN ChatGrid párosítás állapota nem tölthető be.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load, pairing]);

  const pairingSeconds = useMemo(
    () => pairing ? Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0,
    [now, pairing],
  );
  useEffect(() => { if (pairing && pairingSeconds === 0) setPairing(null); }, [pairing, pairingSeconds]);

  const activationCode = pairing ? `${pairing.pairingId}#${pairing.code}` : "";
  const canPair = Boolean(readiness?.bridgeEnabled && readiness?.pairingEnabled && readiness?.security.pairingSecretConfigured);

  async function createPairing() {
    setBusy(true); setError(""); setNotice(""); setCopied(false);
    try {
      const response = await fetch("/api/dev/terminal-hub/windows-bridge/pairings", { method: "POST", headers: adminHeaders(true) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; pairing?: PairingView; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.pairing) throw new Error(payload?.error || "ChatGrid párosítókód nem hozható létre.");
      setPairing(payload.pairing);
      setNotice("Az egyszer használatos kód elkészült. Másold a ChatGrid Beállítások → BENJADMIN kapcsolat mezőjébe.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ChatGrid párosítókód nem hozható létre.");
    } finally { setBusy(false); }
  }

  async function copyActivation() {
    if (!activationCode) return;
    await navigator.clipboard.writeText(activationCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function approve(deviceId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/dev/terminal-hub/windows-bridge/devices/${encodeURIComponent(deviceId)}/approve`, { method: "POST", headers: adminHeaders() });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A ChatGrid eszköz nem hagyható jóvá.");
      setNotice("ChatGrid eszköz jóváhagyva. Az alkalmazás néhány másodpercen belül automatikusan aktiválódik.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A ChatGrid eszköz nem hagyható jóvá."); }
    finally { setBusy(false); }
  }

  async function revoke(deviceId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/dev/terminal-hub/windows-bridge/devices/${encodeURIComponent(deviceId)}/revoke`, {
        method: "POST", headers: adminHeaders(true), body: JSON.stringify({ reason: "chatgrid_device_revoked" }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A ChatGrid eszköz hozzáférése nem vonható vissza.");
      setNotice("A ChatGrid eszköz hozzáférése visszavonva.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A ChatGrid eszköz hozzáférése nem vonható vissza."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-cyan-900/60 bg-slate-900 p-6 shadow-2xl shadow-black/30">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-400"><Laptop size={16}/> BENJADMIN ChatGrid</div>
            <h1 className="mt-2 text-2xl font-black">Biztonságos élő státusz párosítás</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Egyszer párosítsd ezt a Windows gépet. Utána a ChatGrid automatikusan látja a worker-státuszokat, és tud csengeni a kész, blokkolt vagy hibás fejlesztési eseményeknél. A párosítás nem ad PowerShell- vagy PROD-végrehajtási jogot.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border border-slate-700 p-3 text-slate-300 hover:bg-slate-800 disabled:opacity-40" title="Frissítés"><RefreshCw size={17}/></button>
        </header>

        {error ? <div className="rounded-2xl border border-rose-800 bg-rose-950/40 p-4 text-sm font-semibold text-rose-200">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm font-semibold text-emerald-200">{notice}</div> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><ShieldCheck className="text-cyan-400" size={20}/><div className="mt-3 text-xs uppercase tracking-wider text-slate-500">Bridge</div><strong className="mt-1 block">{readiness?.bridgeEnabled ? "ENGEDÉLYEZVE" : "KIKAPCSOLVA"}</strong></article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><KeyRound className="text-cyan-400" size={20}/><div className="mt-3 text-xs uppercase tracking-wider text-slate-500">Pairing</div><strong className="mt-1 block">{readiness?.pairingEnabled ? "ENGEDÉLYEZVE" : "KIKAPCSOLVA"}</strong></article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><Unplug className="text-emerald-400" size={20}/><div className="mt-3 text-xs uppercase tracking-wider text-slate-500">PowerShell execution</div><strong className="mt-1 block">{readiness?.executionEnabled ? "BEKAPCSOLVA" : "TILTVA"}</strong></article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">1. Egyszer használatos ChatGrid-kód</h2><p className="mt-1 text-sm text-slate-400">A kód 10 percig használható és legfeljebb {pairing?.maxAttempts || 5} hibás próbálkozást enged.</p></div><button type="button" disabled={!canPair || busy} onClick={() => void createPairing()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:opacity-40"><KeyRound size={16}/> Új ChatGrid párosítás</button></div>
          {pairing ? <div className="mt-5 rounded-2xl border border-cyan-800 bg-slate-950 p-4"><div className="text-xs font-bold uppercase tracking-wider text-cyan-400">Beillesztendő párosítási kód</div><div className="mt-3 flex flex-wrap items-center gap-3"><code className="max-w-full break-all rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-200">{activationCode}</code><button type="button" onClick={() => void copyActivation()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-black hover:bg-slate-800">{copied ? <Check size={14}/> : <Clipboard size={14}/>} {copied ? "Kimásolva" : "Másolás"}</button></div><div className="mt-3 text-xs text-slate-500">Lejárat: {pairingSeconds} mp</div></div> : null}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-black">2. ChatGrid eszköz jóváhagyása</h2>
          <p className="mt-1 text-sm text-slate-400">A kód ChatGridbe illesztése után itt megjelenik a Windows gép. A hozzáférés csak explicit jóváhagyás után aktiválódik.</p>
          <div className="mt-4 space-y-3">
            {devices.length ? devices.map((device) => <article key={device.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4"><div><strong>{device.deviceLabel}</strong><div className="mt-1 text-xs text-slate-500">{device.agentId}</div><div className="mt-1 text-xs text-slate-500">{device.osVersion || "Windows"}</div></div><div className="flex items-center gap-2"><span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black">{device.status.toUpperCase()}</span>{device.status === "pending" ? <button type="button" disabled={busy} onClick={() => void approve(device.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Check size={14}/> Jóváhagyás</button> : null}{["approved","active"].includes(device.status) ? <button type="button" disabled={busy} onClick={() => void revoke(device.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-800 px-3 py-2 text-xs font-black text-rose-300 disabled:opacity-40"><XCircle size={14}/> Visszavonás</button> : null}</div></article>) : <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">Még nincs ChatGrid-eszköz. Előbb hozz létre egy kódot, majd illeszd be a ChatGrid alkalmazásba.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
