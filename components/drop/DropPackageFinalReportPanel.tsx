"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileCheck2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

type ReportState = {
  ok: boolean;
  enabled: boolean;
  packageStatus: string;
  finalReportStatus: string;
  automatic: boolean;
  note: string;
  report: null | {
    id: string;
    status: string;
    pageCount: number | null;
    fileSizeBytes: number | null;
    generatedAt: string | null;
    sentAt: string | null;
    errorMessage: string | null;
    fresh: boolean;
    downloadUrl: string | null;
    downloadExpiresAt: string | null;
  };
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

function formatBytes(value: number | null) {
  const numeric = Number(value || 0);
  if (!numeric) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = numeric;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 }).format(size)} ${units[index]}`;
}

function reportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    not_requested: "A feltöltés lezárására vár",
    queued: "Sorban áll",
    generating: "PDF készül",
    generated: "Elkészült, kézbesítésre vár",
    sending: "Kézbesítés folyamatban",
    sent: "Elkészült és kiküldve",
    completed: "Elkészült",
    failed: "Hiba történt",
  };
  return labels[status] || status || "Nincs riport";
}

export default function DropPackageFinalReportPanel({ packageId }: { packageId: string }) {
  const [state, setState] = useState<ReportState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageId)}/reports`, { cache: "no-store" });
      const payload = await response.json() as ReportState;
      if (!response.ok) throw new Error(payload.error || "A végleges riport állapota nem tölthető be.");
      setState(payload);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A végleges riport állapota nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = state?.report;
  const ready = Boolean(active?.fresh && active.downloadUrl && ["generated", "sending", "sent", "completed"].includes(active.status));
  const successful = Boolean(active?.fresh && ["sent", "completed"].includes(active.status));

  return (
    <section className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-teal-800"><FileCheck2 size={16} /> Végleges PDF-riport</p>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-5 text-slate-600">{state?.note || "A csomag lezárásakor automatikus, nyomtatható A4-es összesítő készül."}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-black text-teal-900 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
      </div>

      {message ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">{message}</p> : null}

      {!state && loading ? <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-600"><LoaderCircle size={15} className="animate-spin" /> Riportállapot betöltése…</div> : null}
      {state && !state.enabled ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">Az automatikus PDF-riport jelenleg előkészített, de még nincs aktiválva.</p> : null}

      {state?.enabled ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${successful ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-800"}`}><ShieldCheck size={20} /></span>
              <div>
                <strong className="text-sm text-slate-950">{reportStatusLabel(active?.status || state.finalReportStatus)}</strong>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{active?.generatedAt ? `Készült: ${formatDate(active.generatedAt)}` : "A riport a csomag lezárása után automatikusan készül el."}</p>
              </div>
            </div>
            {ready ? <a href={active?.downloadUrl || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-black text-white"><Download size={15} /> PDF letöltése</a> : null}
          </div>
          {active ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Oldalszám</span><strong className="mt-1 block text-xs text-slate-900">{active.pageCount ?? "-"}</strong></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Fájlméret</span><strong className="mt-1 block text-xs text-slate-900">{formatBytes(active.fileSizeBytes)}</strong></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Kézbesítés</span><strong className="mt-1 block text-xs text-slate-900">{active.sentAt ? formatDate(active.sentAt) : "Folyamatban / nem szükséges"}</strong></div>
            </div>
          ) : null}
          {active?.errorMessage ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">{active.errorMessage}</p> : null}
          {active && !active.fresh ? <p className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-bold text-cyan-900">A csomag tartalma megváltozott, ezért új riport készül.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
