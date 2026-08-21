"use client";

import { Download, FileText, LoaderCircle, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FieldCaptureItem, FieldCaptureLocalSession } from "@/app/lib/field-capture/types";
import {
  DEFAULT_FIELD_CAPTURE_REPORT_METADATA,
  FIELD_CAPTURE_SURVEY_NATURES,
  loadFieldCaptureReportMetadata,
  saveFieldCaptureReportMetadata,
  type FieldCaptureReportMetadata,
  type FieldCaptureSurveyNature,
} from "@/app/lib/field-capture/reportMetadata";
import {
  downloadFieldCaptureSummaryPdf,
  FIELD_CAPTURE_REPORT_DISCLAIMER,
  summarizeFieldCaptureReport,
} from "@/app/lib/field-capture/fieldCaptureSummaryPdf";

export default function FieldCaptureReportPanel({
  items,
  session,
  recorderName,
  organizationName,
}: {
  items: FieldCaptureItem[];
  session: FieldCaptureLocalSession | null;
  recorderName?: string | null;
  organizationName?: string | null;
}) {
  const [metadata, setMetadata] = useState<FieldCaptureReportMetadata>({ ...DEFAULT_FIELD_CAPTURE_REPORT_METADATA });
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const summary = useMemo(() => summarizeFieldCaptureReport(items), [items]);

  useEffect(() => {
    setMetadata(loadFieldCaptureReportMetadata(session?.id));
    setMessage("");
  }, [session?.id]);

  function updateMetadata(patch: Partial<FieldCaptureReportMetadata>) {
    const next = { ...metadata, ...patch };
    const saved = saveFieldCaptureReportMetadata(session?.id, next);
    setMetadata(saved);
  }

  async function exportPdf() {
    if (!session || !items.length || exporting) return;
    setExporting(true);
    setMessage("");
    try {
      const result = await downloadFieldCaptureSummaryPdf({
        items,
        session,
        metadata,
        recorderName,
        organizationName,
        includePhotoAnnex: true,
      });
      setMessage(`PDF elkészült · ${result.pageCount} oldal · ${result.photoCount} fotó`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A terepi összesítő PDF exportja nem sikerült.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section data-terep-summary-report="true" className="mt-3 overflow-hidden rounded-[1.6rem] border border-cyan-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-cyan-100 bg-cyan-50/70 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-800 text-white"><FileText size={19} /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-800">F4 · Terepi összesítő / PDF riport</p>
          <h3 className="mt-1 text-base font-black text-slate-950">Munkamenet-összesítő és fotómelléklet</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">A riport a jelen munkamenet rögzített tételeit dokumentálja. A rögzítés jellege és a felmérési lefedettség külön megadható.</p>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Riport címe</span>
            <input
              data-terep-report-title
              value={metadata.reportTitle}
              onChange={(event) => updateMetadata({ reportTitle: event.target.value })}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[16px] font-bold text-slate-800 outline-none focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Rögzítés jellege</span>
            <select
              data-terep-report-survey-nature
              value={metadata.surveyNature}
              onChange={(event) => updateMetadata({ surveyNature: event.target.value as FieldCaptureSurveyNature })}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-bold text-slate-800 outline-none focus:border-cyan-500"
            >
              {FIELD_CAPTURE_SURVEY_NATURES.map((nature) => <option key={nature} value={nature}>{nature}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Felmérési lefedettség</span>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                data-terep-report-coverage
                type="range"
                min={0}
                max={100}
                step={5}
                value={metadata.coveragePercent}
                onChange={(event) => updateMetadata({ coveragePercent: Number(event.target.value) })}
                className="w-full accent-cyan-700"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500"><span>0%</span><strong className="text-sm text-cyan-800">kb. {metadata.coveragePercent}%</strong><span>100%</span></div>
            </div>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={summary.itemCount} label="rögzített kép" />
          <Metric value={summary.noteCount} label="megjegyzés" />
          <Metric value={summary.gpsCount} label="GPS-pont" />
          <Metric value={summary.editedCount} label="szerkesztett" />
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-5 text-amber-950">
          <div className="flex items-start gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" /><div><strong className="block">Felmérési érvényesség</strong><span>{FIELD_CAPTURE_REPORT_DISCLAIMER}</span></div></div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] font-semibold leading-5 text-slate-600">
          <strong className="text-slate-800">A PDF tartalma:</strong> munkamenet-adatok, rögzítési jelleg, lefedettség, tárolási státuszok, tétellista, GPS/kamerairány, képjelölési állapot, megjegyzések és sorszámozott fotómelléklet.
        </div>

        <button
          data-terep-summary-pdf-export
          type="button"
          disabled={!session || !items.length || exporting}
          onClick={() => void exportPdf()}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {exporting ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
          {exporting ? "PDF készítése…" : "Terepi összesítő PDF letöltése"}
        </button>
        {message ? <p data-terep-summary-pdf-message className="mt-2 text-center text-[10px] font-bold text-slate-600">{message}</p> : null}
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-2.5 text-center"><strong className="block text-lg text-cyan-900">{value}</strong><span className="text-[9px] font-black uppercase tracking-[.05em] text-slate-500">{label}</span></div>;
}
