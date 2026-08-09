"use client";

import { CheckCircle2, Database, Download, HardDrive, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type StoreStatus = {
  activeStore: "file" | "postgresql";
  requestedMode: "auto" | "file" | "postgresql";
  reason: string;
  failClosed: boolean;
  schemaReady: boolean;
  databaseActivated: boolean;
  migrationRequired: boolean;
  fileCounts: Record<string, number>;
  postgresCounts: Record<string, number> | null;
  sqlBootstrapPath: string;
  multiInstanceReady: boolean;
};
type Payload = { status?: StoreStatus; sqlSha256?: string; error?: string };

export default function DropPublicStoreMigrationPanel({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [sha, setSha] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const headers = useMemo(() => ({ "x-dimpro-license-admin-key": adminKey }), [adminKey]);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setBusy("load");
    try {
      const response = await fetch("/api/drop/admin/public/store-migration", { headers, cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.status) throw new Error(payload.error || "A workflow-tár állapota nem tölthető be.");
      setStatus(payload.status); setSha(payload.sqlSha256 || ""); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A workflow-tár állapota nem tölthető be."); }
    finally { setBusy(""); }
  }, [adminKey, headers]);
  useEffect(() => { void load(); }, [load]);

  async function downloadSql() {
    setBusy("download");
    try {
      const response = await fetch("/api/drop/admin/public/store-migration?download=sql", { headers, cache: "no-store" });
      if (!response.ok) throw new Error("A bootstrap SQL nem tölthető le.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql"; anchor.click(); URL.revokeObjectURL(url);
      setMessage("A DROP 0.9.5 bootstrap SQL letöltve. Futtassa egyszer a Supabase SQL Editorban.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A bootstrap SQL nem tölthető le."); }
    finally { setBusy(""); }
  }
  async function migrate() {
    if (!status?.schemaReady || busy) return;
    setBusy("migrate");
    try {
      const response = await fetch("/api/drop/admin/public/store-migration", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action: "migrate" }) });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.status) throw new Error(payload.error || "A workflow-tár migrációja sikertelen.");
      setStatus(payload.status); setMessage("A fájltár PostgreSQL-importja és a központi store aktiválása sikerült.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A workflow-tár migrációja sikertelen."); }
    finally { setBusy(""); }
  }
  const fileTotal = status ? Object.values(status.fileCounts).reduce((sum, value) => sum + value, 0) : 0;
  return <section className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${status?.multiInstanceReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{status?.multiInstanceReady ? <Database size={21}/> : <HardDrive size={21}/>}</span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-700">DROP 0.9.5 · központi workflow-tár</p><h2 className="mt-1 text-xl font-black text-slate-950">{status?.activeStore === "postgresql" ? "PostgreSQL aktív" : "Biztonságos fájltár aktív"}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{status?.reason || "Állapot betöltése…"}</p></div></div><button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">{busy === "load" ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>} Frissítés</button></div>
    {status ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Info label="Aktív store" value={status.activeStore === "postgresql" ? "PostgreSQL" : "Fájltár"}/><Info label="PostgreSQL-séma" value={status.schemaReady ? "Kész" : "Hiányzik"}/><Info label="Fájltári rekord" value={String(fileTotal)}/><Info label="Többpéldányos működés" value={status.multiInstanceReady ? "Kész" : "Még nem"}/></div> : null}
    {!status?.schemaReady ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-amber-800" size={19}/><div><strong className="text-sm text-amber-950">Egyszeri Supabase SQL-lépés szükséges</strong><p className="mt-1 text-xs leading-5 text-amber-900">Töltse le és futtassa a bootstrap SQL-t a Supabase SQL Editorban. SHA-256: <code className="break-all font-bold">{sha || "betöltés…"}</code></p></div></div><button type="button" onClick={() => void downloadSql()} disabled={Boolean(busy)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy === "download" ? <LoaderCircle size={15} className="animate-spin"/> : <Download size={15}/>} Bootstrap SQL letöltése</button></div> : null}
    {status?.schemaReady && status.activeStore === "file" ? <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><strong className="text-sm text-cyan-950">A séma kész, az import indítható</strong><p className="mt-1 text-xs leading-5 text-cyan-900">Az import atomi, darabszám-ellenőrzött, majd PostgreSQL-re zárolja a működést.</p><button type="button" onClick={() => void migrate()} disabled={Boolean(busy)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy === "migrate" ? <LoaderCircle size={15} className="animate-spin"/> : <Database size={15}/>} Import és aktiválás</button></div> : null}
    {status?.multiInstanceReady ? <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900"><CheckCircle2 size={18}/> Központi PostgreSQL-store aktív; csendes fájltári visszaesés tiltva.</div> : null}
    {message ? <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950">{message}</div> : null}
  </section>;
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">{label}</p><strong className="mt-1 block text-sm text-slate-950">{value}</strong></div>; }
