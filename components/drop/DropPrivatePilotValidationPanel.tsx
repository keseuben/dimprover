"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  HardDrive,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";

type ValidationStatus = "pending" | "passed" | "failed" | "blocked" | "not_applicable";
type CategoryId = "mobile" | "email" | "zip" | "accessibility" | "operations" | "release";
type Category = { id: CategoryId; label: string };
type ValidationRecord = {
  id: string;
  status: ValidationStatus;
  notes: string;
  evidence: string;
  environment: string;
  device: string;
  reviewedAt?: string;
  updatedAt: string;
};
type ValidationCase = {
  id: string;
  categoryId: CategoryId;
  title: string;
  description: string;
  critical: boolean;
  manualOnly: boolean;
  record: ValidationRecord;
};
type Summary = {
  counts: { total: number; passed: number; pending: number; failed: number; blocked: number; notApplicable: number };
  completionPercent: number;
  releaseGate: "ready" | "pending" | "blocked";
  criticalOpenIds: string[];
  criticalFailedIds: string[];
};
type AutomatedCheck = { id: string; title: string; status: "passed" | "warning" | "failed"; detail: string; durationMs?: number };
type AutomatedReport = {
  generatedAt: string;
  overallStatus: "passed" | "warning" | "failed";
  summary: { passed: number; warning: number; failed: number; total: number };
  checks: AutomatedCheck[];
};
type ValidationPayload = {
  ok: boolean;
  version: string;
  updatedAt: string;
  categories: Category[];
  cases: ValidationCase[];
  summary: Summary;
  automatedReport: AutomatedReport | null;
  error?: string;
};
type Draft = Pick<ValidationRecord, "status" | "notes" | "evidence" | "environment" | "device">;

const statusOptions: Array<{ value: ValidationStatus; label: string }> = [
  { value: "pending", label: "Ellenőrzésre vár" },
  { value: "passed", label: "Megfelelt" },
  { value: "failed", label: "Hibás" },
  { value: "blocked", label: "Blokkolt" },
  { value: "not_applicable", label: "Nem alkalmazható" },
];

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-100";

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return "még nincs mentés";
  return date.toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}

function categoryIcon(categoryId: CategoryId) {
  if (categoryId === "mobile") return Smartphone;
  if (categoryId === "email") return MailCheck;
  if (categoryId === "zip") return Archive;
  if (categoryId === "accessibility") return Accessibility;
  if (categoryId === "operations") return HardDrive;
  return Rocket;
}

function statusStyle(status: ValidationStatus) {
  if (status === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "blocked") return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "not_applicable") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-violet-200 bg-violet-50 text-violet-900";
}

function gateLabel(gate: Summary["releaseGate"]) {
  if (gate === "ready") return "KIADÁSRA KÉSZ";
  if (gate === "blocked") return "KIADÁS BLOKKOLVA";
  return "VALIDÁCIÓ FOLYAMATBAN";
}

export default function DropPrivatePilotValidationPanel({ adminKey }: { adminKey: string }) {
  const [payload, setPayload] = useState<ValidationPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("A DROP 1.0.0 validációs központ betöltése…");
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const headers = useMemo(() => ({
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  }), [adminKey]);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setBusy((current) => current || "load");
    try {
      const response = await fetch("/api/drop/admin/private-pilot-validation", {
        headers: { "x-dimpro-license-admin-key": adminKey },
        cache: "no-store",
      });
      const data = await response.json() as ValidationPayload;
      if (!response.ok || !data.ok) throw new Error(data.error || "A private-pilot validáció nem tölthető be.");
      setPayload(data);
      setDrafts(Object.fromEntries(data.cases.map((item) => [item.id, {
        status: item.record.status,
        notes: item.record.notes,
        evidence: item.record.evidence,
        environment: item.record.environment,
        device: item.record.device,
      }])));
      setMessage("A validációs mátrix betöltve. A fizikai tesztek csak tényleges végrehajtás után jelölhetők megfelelőnek.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A private-pilot validáció nem tölthető be.");
    } finally {
      setBusy("");
    }
  }, [adminKey]);

  useEffect(() => { void load(); }, [load]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || { status: "pending", notes: "", evidence: "", environment: "", device: "" }), ...patch },
    }));
  }

  async function saveCase(item: ValidationCase) {
    const draft = drafts[item.id];
    if (!draft || busy) return;
    setBusy(`save:${item.id}`);
    try {
      const response = await fetch("/api/drop/admin/private-pilot-validation", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: item.id, ...draft }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "A validációs tétel nem menthető.");
      setMessage(`Mentve: ${item.title}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A validációs tétel mentése sikertelen.");
    } finally {
      setBusy("");
    }
  }

  const summary = payload?.summary;
  const automated = payload?.automatedReport;

  return <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-cyan-200 bg-white shadow-sm" aria-labelledby="drop-private-pilot-title">
    <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-teal-50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-100 text-cyan-900"><ShieldCheck size={24} aria-hidden="true"/></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-800">DROP 1.0.0 · private-pilot release gate</p>
            <h2 id="drop-private-pilot-title" className="mt-1 text-xl font-black text-slate-950">Fizikai és végleges kiadási validáció</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Közös napló az iPhone/Android PWA-, valódi e-mail kliens-, PIN-védett ZIP-, hozzáférhetőségi, teljesítmény-, backup- és rollback-ellenőrzésekhez.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-sm font-black text-cyan-950 disabled:opacity-50">
          {busy === "load" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true"/> : <RefreshCw size={16} aria-hidden="true"/>} Állapot frissítése
        </button>
      </div>
    </div>

    <div className="p-5 sm:p-6">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold leading-6 text-cyan-950" role="status" aria-live="polite">{message}</div>

      {summary ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Lezárva" value={`${summary.counts.passed}/${summary.counts.total}`} note={`${summary.completionPercent}%`} tone="emerald"/>
        <SummaryCard label="Függőben" value={String(summary.counts.pending)} note="ellenőrzésre vár" tone="violet"/>
        <SummaryCard label="Hibás" value={String(summary.counts.failed)} note="javítást igényel" tone="rose"/>
        <SummaryCard label="Blokkolt" value={String(summary.counts.blocked)} note="külső feltétel" tone="amber"/>
        <div className={`rounded-2xl border p-4 ${summary.releaseGate === "ready" ? "border-emerald-200 bg-emerald-50" : summary.releaseGate === "blocked" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-[11px] font-black uppercase tracking-[.12em] text-slate-600">Release gate</p>
          <p className="mt-2 text-sm font-black text-slate-950">{gateLabel(summary.releaseGate)}</p>
          <p className="mt-1 text-xs font-bold text-slate-600">{summary.criticalOpenIds.length} kritikus tétel nyitott</p>
        </div>
      </div> : null}

      {summary ? <div className="mt-4" aria-label={`Validáció készültsége ${summary.completionPercent} százalék`}>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-700 transition-[width]" style={{ width: `${summary.completionPercent}%` }}/></div>
      </div> : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby="drop-auto-preflight-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-600">Automatizált preflight</p><h3 id="drop-auto-preflight-title" className="mt-1 text-lg font-black text-slate-950">Szerver-, release- és forrásszerződés</h3><p className="mt-1 text-sm leading-6 text-slate-600">Az automatikus eredmény nem helyettesíti a fizikai eszköz- és levelezőkliens-tesztet.</p></div>
          {automated ? <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase ${automated.overallStatus === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : automated.overallStatus === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{automated.overallStatus === "passed" ? "Megfelelt" : automated.overallStatus === "failed" ? "Hibás" : "Figyelmeztetés"}</span> : <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600">Még nincs riport</span>}
        </div>
        {automated ? <div className="mt-4 grid gap-2 lg:grid-cols-2">{automated.checks.map((check) => <div key={check.id} className={`rounded-xl border px-3 py-3 ${check.status === "passed" ? "border-emerald-100 bg-white" : check.status === "failed" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-2">{check.status === "passed" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true"/> : check.status === "failed" ? <XCircle size={16} className="mt-0.5 shrink-0 text-rose-700" aria-hidden="true"/> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true"/>}<div><p className="text-xs font-black text-slate-950">{check.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{check.detail}</p></div></div>
        </div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">A preflight riport a szerveres `scripts/drop-v100-private-pilot-preflight.mjs` futtatása után jelenik meg.</div>}
        {automated ? <p className="mt-3 text-xs font-bold text-slate-500">Futtatva: {formatDate(automated.generatedAt)} · {automated.summary.passed}/{automated.summary.total} megfelelt</p> : null}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-800">Kézi és vegyes ellenőrzések</p><h3 className="mt-1 text-lg font-black text-slate-950">Validációs mátrix</h3></div>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"><input type="checkbox" checked={showOnlyOpen} onChange={(event) => setShowOnlyOpen(event.target.checked)} className="accent-cyan-700"/> Csak nyitott tételek</label>
      </div>

      <div className="mt-4 space-y-4">{payload?.categories.map((category, categoryIndex) => {
        const Icon = categoryIcon(category.id);
        const categoryCases = payload.cases.filter((item) => item.categoryId === category.id && (!showOnlyOpen || item.record.status !== "passed"));
        if (!categoryCases.length) return null;
        const passed = payload.cases.filter((item) => item.categoryId === category.id && item.record.status === "passed").length;
        const total = payload.cases.filter((item) => item.categoryId === category.id && item.record.status !== "not_applicable").length;
        return <details key={category.id} open={categoryIndex === 0 || showOnlyOpen} className="group rounded-2xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={19} aria-hidden="true"/></span><div><h4 className="text-sm font-black text-slate-950">{category.label}</h4><p className="mt-1 text-xs font-bold text-slate-500">{passed}/{total} lezárva</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{categoryCases.length} tétel</span></summary>
          <div className="border-t border-slate-100 p-4 sm:p-5"><div className="grid gap-4 xl:grid-cols-2">{categoryCases.map((item) => <ValidationCaseCard key={item.id} item={item} draft={drafts[item.id]} busy={busy === `save:${item.id}`} onChange={(patch) => updateDraft(item.id, patch)} onSave={() => void saveCase(item)}/>)}</div></div>
        </details>;
      })}</div>
    </div>
  </section>;
}

function SummaryCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: "emerald" | "violet" | "rose" | "amber" }) {
  const classes = tone === "emerald" ? "border-emerald-200 bg-emerald-50" : tone === "rose" ? "border-rose-200 bg-rose-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-violet-200 bg-violet-50";
  return <div className={`rounded-2xl border p-4 ${classes}`}><p className="text-[11px] font-black uppercase tracking-[.12em] text-slate-600">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-bold text-slate-600">{note}</p></div>;
}

function ValidationCaseCard({ item, draft, busy, onChange, onSave }: { item: ValidationCase; draft?: Draft; busy: boolean; onChange: (patch: Partial<Draft>) => void; onSave: () => void }) {
  const value = draft || { status: item.record.status, notes: item.record.notes, evidence: item.record.evidence, environment: item.record.environment, device: item.record.device };
  const dirty = value.status !== item.record.status || value.notes !== item.record.notes || value.evidence !== item.record.evidence || value.environment !== item.record.environment || value.device !== item.record.device;
  return <article className={`rounded-2xl border p-4 ${statusStyle(value.status)}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h5 className="text-sm font-black text-slate-950">{item.title}</h5>{item.critical ? <span className="rounded-full bg-slate-950 px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-white">Kritikus</span> : null}{item.manualOnly ? <span className="rounded-full border border-slate-300 bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-slate-700">Fizikai/kézi</span> : null}</div><p className="mt-2 text-xs leading-5 text-slate-700">{item.description}</p></div><StatusIcon status={value.status}/></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Állapot</span><select value={value.status} onChange={(event) => onChange({ status: event.target.value as ValidationStatus })} className={inputClass}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Eszköz / kliens</span><input value={value.device} onChange={(event) => onChange({ device: event.target.value.slice(0, 300) })} className={inputClass} placeholder="pl. iPhone 15, iOS 19"/></label>
      <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Környezet</span><input value={value.environment} onChange={(event) => onChange({ environment: event.target.value.slice(0, 300) })} className={inputClass} placeholder="pl. Safari PWA, mobilnet, sötét mód"/></label>
      <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Bizonyíték / hivatkozás</span><input value={value.evidence} onChange={(event) => onChange({ evidence: event.target.value.slice(0, 1000) })} className={inputClass} placeholder="képernyőkép, message ID, napló vagy jegyzőkönyv"/></label>
    </div>
    <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Megjegyzés</span><textarea value={value.notes} onChange={(event) => onChange({ notes: event.target.value.slice(0, 2000) })} className={`${inputClass} min-h-20 resize-y`} placeholder="Eredmény, hiba, reprodukció vagy javítási igény"/></label>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] font-bold text-slate-500">Utolsó mentés: {formatDate(item.record.updatedAt)}</p><button type="button" onClick={onSave} disabled={!dirty || busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-300">{busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true"/> : <Save size={14} aria-hidden="true"/>} Mentés</button></div>
  </article>;
}

function StatusIcon({ status }: { status: ValidationStatus }) {
  if (status === "passed") return <CheckCircle2 size={21} className="shrink-0 text-emerald-700" aria-label="Megfelelt"/>;
  if (status === "failed") return <XCircle size={21} className="shrink-0 text-rose-700" aria-label="Hibás"/>;
  if (status === "blocked") return <AlertTriangle size={21} className="shrink-0 text-amber-700" aria-label="Blokkolt"/>;
  return <Clock3 size={21} className="shrink-0 text-violet-700" aria-label={status === "not_applicable" ? "Nem alkalmazható" : "Ellenőrzésre vár"}/>;
}
