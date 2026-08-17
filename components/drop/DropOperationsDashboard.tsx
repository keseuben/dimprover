"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  History,
  LoaderCircle,
  Mail,
  PackageCheck,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  Wrench,
  XCircle,
} from "lucide-react";
import type { DropOperationsCheck, DropOperationsHistoryItem, DropOperationsSnapshot, DropOperationsStatus } from "@/app/lib/drop/operations/dropOperationsTypes";

type AuthState = "checking" | "authorized" | "blocked";
type ApiResponse = { ok?: boolean; version?: string; latest?: DropOperationsHistoryItem | null; history?: DropOperationsHistoryItem[]; snapshot?: DropOperationsSnapshot; error?: string };

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} ${units[index]}`;
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "medium" });
}
function statusClass(status: DropOperationsStatus) {
  return status === "ok"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : status === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-rose-200 bg-rose-50 text-rose-950";
}
function statusIcon(status: DropOperationsStatus) {
  return status === "ok" ? <CheckCircle2 size={19}/> : status === "warning" ? <AlertTriangle size={19}/> : <XCircle size={19}/>;
}

export default function DropOperationsDashboard() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [adminKey, setAdminKey] = useState("");
  const [latest, setLatest] = useState<DropOperationsHistoryItem | DropOperationsSnapshot | null>(null);
  const [history, setHistory] = useState<DropOperationsHistoryItem[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Licencadmin jogosultság ellenőrzése…");
  const headers = useMemo(() => ({ "content-type": "application/json", "x-dimpro-license-admin-key": adminKey }), [adminKey]);

  const loadHistory = useCallback(async (key: string) => {
    const response = await fetch("/api/drop/admin/operations?limit=60", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" });
    const payload = await response.json() as ApiResponse;
    if (!response.ok) throw new Error(payload.error || "A Drop üzemeltetési előzmény nem tölthető be.");
    setLatest(payload.latest || null);
    setHistory(Array.isArray(payload.history) ? payload.history : []);
  }, []);

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) { setAuthState("blocked"); setMessage("Nincs aktív licencadmin munkamenet."); return; }
    setAdminKey(key);
    try {
      const auth = await fetch("/api/license/admin", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" });
      if (!auth.ok) { setAuthState("blocked"); setMessage("A licencadmin munkamenet lejárt vagy nem jogosult."); return; }
      await loadHistory(key);
      setAuthState("authorized");
      setMessage("A DROP 1.2.13 üzemeltetési központ használatra kész.");
    } catch (error) {
      setAuthState("blocked");
      setMessage(error instanceof Error ? error.message : "A Drop üzemeltetési központ nem tölthető be.");
    }
  }, [loadHistory]);

  useEffect(() => { void load(); }, [load]);

  async function run(deepStorageAudit: boolean) {
    if (!adminKey || busy) return;
    setBusy(deepStorageAudit ? "deep" : "quick");
    setMessage(deepStorageAudit ? "Mély Object Storage audit fut…" : "Gyors Drop ellenőrzés fut…");
    try {
      const response = await fetch("/api/drop/admin/operations", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "run", deepStorageAudit, notify: true }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.snapshot) throw new Error(payload.error || "A Drop ellenőrzés sikertelen.");
      setLatest(payload.snapshot);
      await loadHistory(adminKey);
      setMessage(`${payload.snapshot.label}. Futási idő: ${payload.snapshot.durationMs} ms. ${payload.snapshot.alert.emailReason}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drop ellenőrzés sikertelen.");
    } finally { setBusy(""); }
  }

  if (authState !== "authorized") {
    return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white"><section className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8"><ShieldCheck className="text-cyan-300" size={34}/><h1 className="mt-5 text-3xl font-black">{authState === "checking" ? "Jogosultság ellenőrzése" : "Licencadmin belépés szükséges"}</h1><p className="mt-4 text-sm leading-7 text-slate-300">{message}</p><Link href="/admin" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Licencadmin megnyitása</Link></section></main>;
  }

  const metrics = latest?.metrics;
  return <main className="min-h-screen bg-[#eef4f8] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-8"><div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div><Link href="/drive/drop" className="inline-flex items-center gap-2 text-sm font-black text-cyan-800"><ArrowLeft size={17}/> Vissza a CsomagDrophoz</Link><p className="mt-5 text-xs font-black uppercase tracking-[.24em] text-teal-700">DROP 1.2.13 · üzemeltetési felügyelet</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Drop üzemeltetési központ</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Forgalom, biztonság, vírusvizsgálat, e-mail, letöltés, worker, lejárat és Object Storage integritás egyetlen adminfelületen.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void run(false)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-950 disabled:opacity-50">{busy === "quick" ? <LoaderCircle size={17} className="animate-spin"/> : <RefreshCw size={17}/>} Gyors ellenőrzés</button><button type="button" onClick={() => void run(true)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy === "deep" ? <LoaderCircle size={17} className="animate-spin"/> : <ScanSearch size={17}/>} Mély S3-audit</button></div></div></header>

    <section className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950">{message}</div>

      {latest ? <>
        <section className={`mt-5 rounded-[1.75rem] border p-5 shadow-sm sm:p-6 ${statusClass(latest.status)}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><span className="mt-0.5">{statusIcon(latest.status)}</span><div><p className="text-xs font-black uppercase tracking-[.16em]">Aktuális állapot</p><h2 className="mt-1 text-2xl font-black">{latest.label}</h2><p className="mt-2 text-sm font-semibold opacity-80">{formatDate(latest.collectedAt)} · {latest.durationMs} ms · {latest.deepStorageAudit ? "mély S3-audit" : "gyors ellenőrzés"}</p></div></div><span className="rounded-full border border-current/20 bg-white/60 px-4 py-2 text-xs font-black uppercase tracking-[.12em]">{latest.status === "ok" ? "Rendben" : latest.status === "warning" ? "Figyelmeztetés" : "Beavatkozás"}</span></div></section>

        {metrics ? <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<PackageCheck size={20}/>} label="Csomagok" value={`${metrics.packages.active} aktív`} detail={`${metrics.packages.created24h} új / 24 óra · ${formatBytes(metrics.packages.bytesStored)}`}/>
          <Metric icon={<UploadCloud size={20}/>} label="Feltöltések" value={`${metrics.uploads.active} aktív`} detail={`${metrics.uploads.completed24h} kész · ${metrics.uploads.failed24h} hibás / 24 óra`}/>
          <Metric icon={<ShieldAlert size={20}/>} label="Biztonság" value={`${metrics.security.failedAccess24h} sikertelen`} detail={`${metrics.security.botBlocks24h} robotblokk · ${metrics.security.infectedFiles} fertőzött`}/>
          <Metric icon={<Mail size={20}/>} label="Kézbesítés" value={`${metrics.delivery.emailsSent24h} e-mail`} detail={`${metrics.delivery.emailsFailed24h} hibás · ${metrics.delivery.downloads24h} letöltés`}/>
          <Metric icon={<Wrench size={20}/>} label="Worker" value={`${metrics.worker.queued} sorban`} detail={`${metrics.worker.retry} újrapróba · ${metrics.worker.failed} hibás`}/>
          <Metric icon={<HardDrive size={20}/>} label="Takarítás" value={`${metrics.cleanup.pending} függő`} detail={`${metrics.cleanup.failed} hibás · ${metrics.cleanup.stale} elakadt`}/>
          <Metric icon={<Database size={20}/>} label="Publikus workflow" value={`${metrics.publicWorkflows.workflows} csomag`} detail={`${metrics.publicWorkflows.sendCodes} Send-kód · ${metrics.publicWorkflows.gates} kapu`}/>
          <Metric icon={<Download size={20}/>} label="Letöltés" value={`${metrics.delivery.downloads24h} / 24 óra`} detail={`${metrics.delivery.downloadedPackages24h} külön csomagból`}/>
        </section> : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><Activity className="text-cyan-700" size={22}/><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-700">Ellenőrzési pontok</p><h2 className="mt-1 text-xl font-black text-slate-950">Állapot és teendők</h2></div></div><div className="mt-5 space-y-3">{latest.checks.map((item) => <CheckRow key={item.id} item={item}/>)}</div></div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><HardDrive className="text-teal-700" size={22}/><div><p className="text-xs font-black uppercase tracking-[.15em] text-teal-700">Object Storage</p><h2 className="mt-1 text-xl font-black text-slate-950">Integritási audit</h2></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Small label="Adatbázisi objektum" value={latest.storageAudit.databaseObjectCount}/><Small label="Vizsgált S3-objektum" value={latest.storageAudit.scannedObjectCount}/><Small label="Árva objektum" value={latest.storageAudit.orphanObjectCount}/><Small label="Hiányzó objektum" value={latest.storageAudit.missingObjectCount}/><Small label="Méreteltérés" value={latest.storageAudit.sizeMismatchCount}/><Small label="Audit korlátozott" value={latest.storageAudit.truncated ? "Igen" : "Nem"}/></div>{latest.storageAudit.error ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{latest.storageAudit.error}</p> : null}{latest.storageAudit.orphanSamples.length ? <p className="mt-4 break-words text-xs font-semibold text-slate-500">Maszkolt árva minták: {latest.storageAudit.orphanSamples.join(", ")}</p> : null}</div>
        </section>
      </> : <section className="mt-5 rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center"><Activity className="mx-auto text-slate-400" size={32}/><h2 className="mt-4 text-xl font-black text-slate-900">Még nincs üzemeltetési mérés</h2><p className="mt-2 text-sm text-slate-500">Indítson gyors ellenőrzést vagy mély S3-auditot.</p></section>}

      <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><History className="text-slate-700" size={22}/><div><p className="text-xs font-black uppercase tracking-[.15em] text-slate-500">Előzmények</p><h2 className="mt-1 text-xl font-black text-slate-950">Utolsó {history.length} futás</h2></div></div></div><div className="mt-5 space-y-3">{history.length ? history.map((item, index) => <article key={`${item.collectedAt}-${index}`} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-full p-1.5 ${item.status === "ok" ? "bg-emerald-100 text-emerald-700" : item.status === "warning" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>{statusIcon(item.status)}</span><div><strong className="text-sm text-slate-950">{item.label}</strong><p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(item.collectedAt)} · {item.source} · {item.durationMs} ms</p></div></div><div className="flex flex-wrap gap-2 text-[11px] font-black text-slate-600"><span className="rounded-full bg-white px-3 py-1.5">{item.metrics.security.failedAccess24h} hibás hozzáférés</span><span className="rounded-full bg-white px-3 py-1.5">{item.metrics.worker.failed} worker hiba</span><span className="rounded-full bg-white px-3 py-1.5">{item.storageAudit.orphanObjectCount} árva objektum</span></div></article>) : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">Nincs korábbi mérés.</p>}</div></section>
    </section>
  </main>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-800">{icon}</span><div><p className="text-[10px] font-black uppercase tracking-[.13em] text-slate-500">{label}</p><strong className="mt-1 block text-lg text-slate-950">{value}</strong></div></div><p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{detail}</p></article>;
}
function Small({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">{label}</p><strong className="mt-1 block text-sm text-slate-950">{value}</strong></div>;
}
function CheckRow({ item }: { item: DropOperationsCheck }) {
  const icon = item.id === "malware" ? <Bug size={18}/> : item.id === "storage-audit" ? <HardDrive size={18}/> : item.id === "email" ? <Mail size={18}/> : item.id === "worker" ? <Wrench size={18}/> : item.id === "uploads" ? <UploadCloud size={18}/> : item.id === "postgres-store" ? <Database size={18}/> : item.status === "ok" ? <ShieldCheck size={18}/> : <ShieldAlert size={18}/>;
  return <article className={`rounded-2xl border p-4 ${statusClass(item.status)}`}><div className="flex items-start gap-3"><span className="mt-0.5 shrink-0">{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{item.label}</strong><span className="rounded-full bg-white/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em]">{item.value}</span></div><p className="mt-2 text-xs font-semibold leading-5 opacity-80">{item.detail}</p>{item.status !== "ok" && item.action ? <p className="mt-2 text-xs font-black">Teendő: {item.action}</p> : null}</div></div></article>;
}
