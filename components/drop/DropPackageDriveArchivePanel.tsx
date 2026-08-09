"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, Cloud, FolderOpen, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

type ArchiveState = {
  ok: boolean;
  version: string;
  enabled: boolean;
  required: boolean;
  ready: boolean;
  projectId: string | null;
  projectName: string | null;
  targetFolderId: string | null;
  expectedItems: number;
  archivedItems: number;
  pendingItems: number;
  fileCount: number;
  reportRequired: boolean;
  reportReady: boolean;
  note: string;
  error?: string;
};

export default function DropPackageDriveArchivePanel({ packageId }: { packageId: string }) {
  const [state, setState] = useState<ArchiveState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageId)}/archive`, { cache: "no-store" });
      const payload = await response.json() as ArchiveState;
      if (!response.ok) throw new Error(payload.error || "A Drive archiválás állapota nem tölthető be.");
      setState(payload);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drive archiválás állapota nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-900"><Archive size={16} /> DIMPRO Drive archívum</p>
          <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-5 text-slate-600">A tartós projektpéldány külön Hetzner Object Storage bucketbe kerül. A Drop ideiglenes példánya csak az ellenőrzött archiválás után törölhető.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-950 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
      </div>

      {message ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">{message}</p> : null}
      {!state && loading ? <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-600"><LoaderCircle size={15} className="animate-spin" /> Archívumállapot betöltése…</div> : null}

      {state ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${state.ready ? "bg-emerald-100 text-emerald-700" : state.required ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-500"}`}>
                {state.ready ? <CheckCircle2 size={20} /> : state.required ? <Cloud size={20} /> : <FolderOpen size={20} />}
              </span>
              <div>
                <strong className="text-sm text-slate-950">{state.ready ? "Tartós Drive-archívum elkészült" : state.required ? "Drive-archiválás folyamatban" : "Drive-archiválás nincs bekapcsolva"}</strong>
                <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">{state.note}</p>
              </div>
            </div>
            {state.projectId ? <Link href={`/projektkapu/project/${encodeURIComponent(state.projectId)}/drive`} className="inline-flex items-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-xs font-black text-white"><FolderOpen size={15} /> Projekt Drive</Link> : null}
          </div>

          {state.required ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Projekt</span><strong className="mt-1 block text-xs text-slate-900">{state.projectName || state.projectId || "-"}</strong></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Archivált elemek</span><strong className="mt-1 block text-xs text-slate-900">{state.archivedItems} / {state.expectedItems}</strong></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Végleges riport</span><strong className="mt-1 block text-xs text-slate-900">{state.reportReady ? "Elkészült" : "Még szükséges"}</strong></div>
            </div>
          ) : null}

          {state.required && !state.enabled ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">A projektkapcsolat archiválást kér, de a központi feature flag még zárva van.</p> : null}
          {state.ready ? <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-900"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> A Drop retention törlés már nem veszélyezteti a Drive-ban tárolt tartós projektpéldányokat.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
