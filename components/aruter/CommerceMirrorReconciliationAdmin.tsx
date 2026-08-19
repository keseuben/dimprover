"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Link2, Loader2, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { AruterBrand, AruterCard, AruterPageShell } from "./AruterShared";

type MirrorState = "PENDING" | "SUCCEEDED" | "FAILED";
type MirrorAttempt = {
  id: string;
  legacyOrderId: string;
  orderNumber: string;
  legacyStatus: "draft" | "sent_to_cashier" | "paid" | "issued" | "cancelled";
  commerceOrderId: string | null;
  state: MirrorState;
  attemptCount: number;
  mappedItemCount: number;
  unresolvedItemCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  succeededAt: string | null;
  updatedAt: string;
};
type Summary = Record<MirrorState, number>;
type ApiResult<T> = { ok: boolean; data?: T; summary?: Summary; error?: string; code?: string };

function stateLabel(state: MirrorState) { return state === "PENDING" ? "Folyamatban" : state === "FAILED" ? "Egyeztetendő" : "Sikeres"; }
function stateClass(state: MirrorState) { return state === "PENDING" ? "border-sky-200 bg-sky-50 text-sky-700" : state === "FAILED" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"; }
function legacyLabel(status: MirrorAttempt["legacyStatus"]) { return status === "draft" ? "Vázlat" : status === "sent_to_cashier" ? "Pénztárra küldve" : status === "paid" ? "Fizetve" : status === "issued" ? "Kiadva" : "Törölve"; }
function dateTime(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("hu-HU", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }

export function CommerceMirrorReconciliationAdmin() {
  const [attempts, setAttempts] = useState<MirrorAttempt[]>([]);
  const [summary, setSummary] = useState<Summary>({ PENDING: 0, SUCCEEDED: 0, FAILED: 0 });
  const [filter, setFilter] = useState<"ALL" | MirrorState>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/v1/commerce/mirror/reconciliation?limit=200", { cache: "no-store" });
      const result = await response.json() as ApiResult<MirrorAttempt[]>;
      if (!response.ok || !result.ok || !result.data || !result.summary) throw new Error(result.error || "A tükrözési egyeztetések nem tölthetők be.");
      setAttempts(result.data); setSummary(result.summary);
      setSelectedId(current => current && result.data!.some(item => item.id === current) ? current : result.data![0]?.id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A tükrözési egyeztetések nem tölthetők be.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filter === "ALL" ? attempts : attempts.filter(item => item.state === filter), [attempts, filter]);
  const selected = useMemo(() => attempts.find(item => item.id === selectedId) || null, [attempts, selectedId]);

  async function retryDue() {
    if (busyId) return;
    setBusyId("BULK"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/v1/commerce/mirror/reconciliation/retry-due", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }) });
      const result = await response.json() as ApiResult<{ requested: number; succeeded: number; failed: number }>;
      if (![200, 207].includes(response.status) || !result.data) throw new Error(result.error || "Az esedékes újrapróbálás sikertelen.");
      setNotice(`Kötegelt újrapróbálás: ${result.data.requested} tétel, ${result.data.succeeded} sikeres, ${result.data.failed} sikertelen.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Az esedékes újrapróbálás sikertelen.");
      await load();
    } finally { setBusyId(null); }
  }

  async function retry(attempt: MirrorAttempt) {
    if (busyId) return;
    setBusyId(attempt.id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/v1/commerce/mirror/reconciliation/${attempt.id}/retry`, { method: "POST" });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error || "Az újrapróbálás sikertelen.");
      setNotice(`${attempt.orderNumber}: a Commerce tükrözés sikeresen lefutott.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Az újrapróbálás sikertelen.");
      await load();
    } finally { setBusyId(null); }
  }

  const cards: Array<{ state: MirrorState; label: string; hint: string }> = [
    { state: "FAILED", label: "Egyeztetendő", hint: "Sikertelen mirror" },
    { state: "PENDING", label: "Folyamatban", hint: "Aktív / félbemaradt" },
    { state: "SUCCEEDED", label: "Sikeres", hint: "Commerce-hoz kapcsolva" },
  ];

  return <AruterPageShell>
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><AruterBrand compact/><span className="hidden h-10 w-px bg-slate-200 sm:block"/><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Commerce Core</p><h1 className="text-xl font-black text-slate-900">Rendelés-egyeztetés</h1></div></div><div className="flex flex-wrap gap-2"><Link href="/aruter/admin/penztar" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><ArrowLeft size={17}/> Pénztár</Link><button type="button" disabled={busyId!==null||summary.FAILED===0} onClick={()=>void retryDue()} className="hidden h-11 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 font-black text-teal-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:inline-flex">{busyId==="BULK"?<Loader2 size={17} className="animate-spin"/>:<RotateCcw size={17}/>} Esedékesek újrapróbálása</button><button type="button" onClick={()=>void load()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 font-black text-white"><RefreshCw size={17}/> Frissítés</button></div></div></header>
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="flex gap-3 text-sky-900"><ShieldCheck size={21} className="shrink-0"/><div><b>Biztonságos legacy → Commerce átmenet</b><p className="mt-1 text-sm font-semibold text-sky-800">A meglévő Árutér rendelés marad az elsődleges folyamat. A Commerce tükrözés hibája nem fordítja vissza a pénztári rendelést; az eltérések itt ellenőrizhetők és jogosultsággal újrapróbálhatók.</p></div></div></div>
      {error&&<div className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertCircle size={20}/><div><b>Egyeztetési állapot</b><p className="mt-1 text-sm font-semibold">{error}</p></div></div>}
      {notice&&<div className="mb-4 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 size={20}/><div><b>Sikeres újrapróbálás</b><p className="mt-1 text-sm font-semibold">{notice}</p></div></div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">{cards.map(card=><button key={card.state} type="button" onClick={()=>setFilter(current=>current===card.state?"ALL":card.state)} className={`rounded-2xl border p-4 text-left transition ${filter===card.state?stateClass(card.state):"border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-center justify-between"><span className="text-sm font-black">{card.label}</span><span className="text-2xl font-black">{summary[card.state]}</span></div><p className="mt-1 text-xs font-semibold opacity-70">{card.hint}</p></button>)}</div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <AruterCard className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-xl font-black">Mirror események</h2><p className="text-sm font-semibold text-slate-500">{loading?"Betöltés...":`${visible.length} megjelenített esemény`}</p></div><div className="flex flex-wrap gap-1.5">{(["ALL","FAILED","PENDING","SUCCEEDED"] as const).map(value=><button key={value} type="button" onClick={()=>setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-black ${filter===value?"bg-slate-900 text-white":"bg-slate-100 text-slate-600"}`}>{value==="ALL"?"Összes":value==="FAILED"?"Egyeztetendő":value==="PENDING"?"Folyamatban":"Sikeres"}</button>)}</div></div>
          <div className="divide-y divide-slate-100">{visible.map(attempt=><button key={attempt.id} type="button" onClick={()=>setSelectedId(attempt.id)} className={`flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50 ${selectedId===attempt.id?"bg-teal-50/60":""}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${attempt.state==="FAILED"?"bg-amber-50 text-amber-700":attempt.state==="PENDING"?"bg-sky-50 text-sky-700":"bg-emerald-50 text-emerald-700"}`}>{attempt.state==="FAILED"?<TriangleAlert size={20}/>:attempt.state==="PENDING"?<Clock3 size={20}/>:<CheckCircle2 size={20}/>}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b>{attempt.orderNumber}</b><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${stateClass(attempt.state)}`}>{stateLabel(attempt.state)}</span></span><span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{legacyLabel(attempt.legacyStatus)} · próbálkozás: {attempt.attemptCount} · {dateTime(attempt.updatedAt)}</span></span><span className="hidden text-right text-xs font-bold text-slate-500 md:block">{attempt.mappedItemCount} kapcsolt<br/>{attempt.unresolvedItemCount} nem azonosított</span></button>)}</div>
          {!loading&&!visible.length&&<div className="p-12 text-center"><CheckCircle2 className="mx-auto text-emerald-300" size={40}/><b className="mt-3 block">Nincs ilyen egyeztetési tétel.</b><p className="mt-1 text-sm font-semibold text-slate-500">A kiválasztott szűrőhöz nem tartozik aktív mirror esemény.</p></div>}
          {loading&&<div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin text-teal-700"/></div>}
        </AruterCard>

        <AruterCard className="h-fit p-5 xl:sticky xl:top-5">{selected?<div><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Legacy rendelés</p><h2 className="mt-1 text-2xl font-black">{selected.orderNumber}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{legacyLabel(selected.legacyStatus)}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${stateClass(selected.state)}`}>{stateLabel(selected.state)}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Próbálkozás</p><b className="mt-1 block text-xl">{selected.attemptCount}</b></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Tételek</p><b className="mt-1 block text-xl">{selected.mappedItemCount} / {selected.unresolvedItemCount}</b><p className="text-[10px] font-bold text-slate-400">kapcsolt / nem azonosított</p></div></div>
          <div className="mt-4 space-y-3 text-sm"><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Legacy azonosító</p><p className="mt-1 break-all font-semibold text-slate-700">{selected.legacyOrderId}</p></div><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Commerce rendelés</p><p className="mt-1 flex items-center gap-2 break-all font-semibold text-slate-700"><Link2 size={15} className="shrink-0 text-slate-400"/>{selected.commerceOrderId||"Még nincs kapcsolva"}</p></div><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Utolsó próbálkozás</p><p className="mt-1 font-semibold text-slate-700">{dateTime(selected.lastAttemptAt)}</p></div>{selected.nextRetryAt&&<div><p className="text-xs font-black uppercase tracking-wide text-slate-400">Újrapróbálható</p><p className="mt-1 font-semibold text-slate-700">{dateTime(selected.nextRetryAt)}</p></div>}</div>
          {selected.lastErrorCode&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-2 text-amber-900"><TriangleAlert size={18} className="shrink-0"/><div><b className="text-sm">{selected.lastErrorCode}</b><p className="mt-1 text-xs font-semibold">{selected.lastErrorMessage||"A Commerce tükrözés sikertelen volt."}</p></div></div></div>}
          {selected.state!=="SUCCEEDED"&&<button type="button" disabled={busyId===selected.id} onClick={()=>void retry(selected)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-black text-white disabled:bg-slate-300">{busyId===selected.id?<Loader2 size={17} className="animate-spin"/>:<RotateCcw size={17}/>} Újrapróbálás</button>}
          {selected.state==="SUCCEEDED"&&<div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><div className="flex items-center gap-2"><CheckCircle2 size={18}/><b>Sikeresen egyeztetve</b></div><p className="mt-1 text-xs font-semibold">Commerce kapcsolat: {dateTime(selected.succeededAt)}</p></div>}
        </div>:<div className="flex min-h-64 flex-col items-center justify-center text-center"><ShieldCheck className="text-slate-300" size={38}/><b className="mt-3">Válasszon egyeztetést</b><p className="mt-1 text-sm font-semibold text-slate-500">A mirror állapot és az újrapróbálás itt kezelhető.</p></div>}</AruterCard>
      </div>
    </div>
  </AruterPageShell>;
}
