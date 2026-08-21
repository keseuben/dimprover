"use client";

import { ChevronDown, ChevronUp, Download, FileText, LoaderCircle, Mail, Send, ShieldAlert } from "lucide-react";
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
  createFieldCaptureSummaryPdf,
  downloadFieldCaptureSummaryPdf,
  FIELD_CAPTURE_REPORT_DISCLAIMER,
  summarizeFieldCaptureReport,
} from "@/app/lib/field-capture/fieldCaptureSummaryPdf";

type ReportEmailStatus = {
  configured: boolean;
  from: string;
  profileId: string;
  recipientMode: "locked_default" | "approved_list" | "free_entry";
  maxRecipients: number;
  suggestedRecipients: string[];
};

type ReportEmailResponse = {
  ok?: boolean;
  error?: string;
  status?: ReportEmailStatus;
  result?: { messageId?: string | null; recipients?: string[]; attachmentName?: string; subject?: string };
};

export default function FieldCaptureReportPanel({
  items,
  session,
  recorderName,
  organizationName,
  sessionToken,
}: {
  items: FieldCaptureItem[];
  session: FieldCaptureLocalSession | null;
  recorderName?: string | null;
  organizationName?: string | null;
  sessionToken?: string | null;
}) {
  const [metadata, setMetadata] = useState<FieldCaptureReportMetadata>({ ...DEFAULT_FIELD_CAPTURE_REPORT_METADATA });
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<ReportEmailStatus | null>(null);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("Csatoltan küldöm a DIMPRO Terepi Gyorsrögzítő összesítő riportját.");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const summary = useMemo(() => summarizeFieldCaptureReport(items), [items]);

  useEffect(() => {
    const loaded = loadFieldCaptureReportMetadata(session?.id);
    setMetadata(loaded);
    setMessage("");
    setEmailOpen(false);
    setEmailStatus(null);
    setEmailRecipients("");
    setEmailSubject(`DIMPRO Terepi összesítő – ${session?.projectName || loaded.reportTitle}`);
    setEmailBody("Csatoltan küldöm a DIMPRO Terepi Gyorsrögzítő összesítő riportját.");
    setEmailMessage("");
  }, [session?.id, session?.projectName]);

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

  async function loadEmailStatus() {
    if (!session?.serverSessionId || !sessionToken) {
      setEmailStatus(null);
      setEmailMessage("E-mail küldés előtt legalább egyszer mentsd/szinkronizáld a munkamenetet a DIMPRO szerverre.");
      return;
    }
    setEmailLoading(true);
    setEmailMessage("");
    try {
      const response = await fetch(`/api/field-capture/sessions/${encodeURIComponent(session.serverSessionId)}/report-email`, {
        headers: { authorization: `Bearer ${sessionToken}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as ReportEmailResponse;
      if (!response.ok || !payload.ok || !payload.status) throw new Error(payload.error || "Az e-mail küldési állapot nem kérdezhető le.");
      setEmailStatus(payload.status);
      setEmailRecipients((current) => current.trim() ? current : payload.status!.suggestedRecipients.join(", "));
      if (!payload.status.configured) setEmailMessage("A DIMPRO Drop SMTP-profil nincs teljesen beállítva.");
    } catch (error) {
      setEmailStatus(null);
      setEmailMessage(error instanceof Error ? error.message : "Az e-mail küldési állapot lekérése sikertelen.");
    } finally {
      setEmailLoading(false);
    }
  }

  function toggleEmail() {
    const next = !emailOpen;
    setEmailOpen(next);
    if (next) void loadEmailStatus();
  }

  async function sendEmail() {
    if (!session?.serverSessionId || !sessionToken || !items.length || emailSending) return;
    if (!emailStatus?.configured) {
      setEmailMessage("A DIMPRO Drop SMTP-profil nem használható.");
      return;
    }
    setEmailSending(true);
    setEmailMessage("Terepi összesítő PDF készítése és e-mail előkészítése…");
    try {
      const pdf = await createFieldCaptureSummaryPdf({ items, session, metadata, recorderName, organizationName, includePhotoAnnex: true });
      const bytes = Uint8Array.from(pdf.bytes);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const form = new FormData();
      form.append("recipients", JSON.stringify(emailRecipients.split(/[;,\n]+/g).map((value) => value.trim()).filter(Boolean)));
      form.append("subject", emailSubject);
      form.append("message", emailBody);
      form.append("reportTitle", metadata.reportTitle);
      form.append("report", new Blob([buffer], { type: "application/pdf" }), pdf.fileName);
      const response = await fetch(`/api/field-capture/sessions/${encodeURIComponent(session.serverSessionId)}/report-email`, {
        method: "POST",
        headers: { authorization: `Bearer ${sessionToken}` },
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as ReportEmailResponse;
      if (!response.ok || !payload.ok || !payload.result) throw new Error(payload.error || "A Terepi összesítő e-mail küldése sikertelen.");
      const count = payload.result.recipients?.length || 0;
      setEmailMessage(`E-mail elküldve · ${count} címzett · ${payload.result.attachmentName || pdf.fileName}`);
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "A Terepi összesítő e-mail küldése sikertelen.");
    } finally {
      setEmailSending(false);
    }
  }

  const recipientPolicy = emailStatus?.recipientMode === "locked_default"
    ? "Rögzített alapértelmezett címzett"
    : emailStatus?.recipientMode === "approved_list"
      ? "Csak jóváhagyott Send-címzettek"
      : "Szabad címzettbevitel";

  return (
    <section data-terep-summary-report="true" className="mt-3 overflow-hidden rounded-[1.6rem] border border-cyan-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-cyan-100 bg-cyan-50/70 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-800 text-white"><FileText size={19} /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-800">F5 · Terepi összesítő / PDF + e-mail</p>
          <h3 className="mt-1 text-base font-black text-slate-950">Munkamenet-összesítő és fotómelléklet</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">A riport a jelen munkamenet rögzített tételeit dokumentálja. A PDF letölthető, illetve külön jóváhagyással e-mailben is elküldhető.</p>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Riport címe</span>
            <input data-terep-report-title value={metadata.reportTitle} onChange={(event) => updateMetadata({ reportTitle: event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[16px] font-bold text-slate-800 outline-none focus:border-cyan-500" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Rögzítés jellege</span>
            <select data-terep-report-survey-nature value={metadata.surveyNature} onChange={(event) => updateMetadata({ surveyNature: event.target.value as FieldCaptureSurveyNature })} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-bold text-slate-800 outline-none focus:border-cyan-500">
              {FIELD_CAPTURE_SURVEY_NATURES.map((nature) => <option key={nature} value={nature}>{nature}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Felmérési lefedettség</span>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input data-terep-report-coverage type="range" min={0} max={100} step={5} value={metadata.coveragePercent} onChange={(event) => updateMetadata({ coveragePercent: Number(event.target.value) })} className="w-full accent-cyan-700" />
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

        <button data-terep-summary-pdf-export type="button" disabled={!session || !items.length || exporting} onClick={() => void exportPdf()} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          {exporting ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
          {exporting ? "PDF készítése…" : "Terepi összesítő PDF letöltése"}
        </button>
        {message ? <p data-terep-summary-pdf-message className="mt-2 text-center text-[10px] font-bold text-slate-600">{message}</p> : null}

        <button data-terep-report-email-toggle type="button" disabled={!session || !items.length || !sessionToken} onClick={toggleEmail} className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 text-sm font-black text-cyan-900 disabled:border-slate-200 disabled:text-slate-400">
          <Mail size={17} /> PDF elküldése e-mailben {emailOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {emailOpen ? <div data-terep-report-email-panel className="mt-2 rounded-2xl border border-cyan-200 bg-cyan-50/40 p-3">
          <div className="rounded-xl border border-cyan-100 bg-white p-3 text-[10px] font-semibold leading-5 text-slate-600">
            <strong className="block text-xs text-slate-800">Kézi e-mail küldés</strong>
            <span>Nem automatikus. A rendszer csak az alábbi külön küldés gomb megnyomásakor készíti el és küldi el a PDF-et.</span>
            {emailLoading ? <span className="mt-1 flex items-center gap-1 font-bold text-cyan-800"><LoaderCircle size={12} className="animate-spin" /> E-mail profil ellenőrzése…</span> : null}
            {emailStatus ? <span data-terep-report-email-status className="mt-1 block">Feladó: <strong>{emailStatus.from || "—"}</strong> · {recipientPolicy} · max. {emailStatus.maxRecipients} címzett</span> : null}
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-slate-500">Címzett(ek)</span>
            <textarea data-terep-report-email-recipients rows={2} value={emailRecipients} disabled={emailStatus?.recipientMode === "locked_default"} onChange={(event) => setEmailRecipients(event.target.value)} placeholder="nev@ceg.hu, masik@ceg.hu" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] font-semibold text-slate-800 outline-none focus:border-cyan-500 disabled:bg-slate-100" />
          </label>

          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-slate-500">Tárgy</span>
            <input data-terep-report-email-subject value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-semibold text-slate-800 outline-none focus:border-cyan-500" />
          </label>

          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[.08em] text-slate-500">Kísérőszöveg</span>
            <textarea data-terep-report-email-body rows={4} maxLength={5000} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] font-medium leading-5 text-slate-800 outline-none focus:border-cyan-500" />
          </label>

          <button data-terep-report-email-send type="button" disabled={emailSending || emailLoading || !emailStatus?.configured || !session?.serverSessionId} onClick={() => void sendEmail()} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-black text-white disabled:bg-slate-300">
            {emailSending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
            {emailSending ? "PDF készítése és küldése…" : "PDF elkészítése és e-mail küldése"}
          </button>
          {!session?.serverSessionId ? <p className="mt-2 text-[10px] font-bold leading-5 text-amber-800">Előbb mentsd/szinkronizáld a munkamenetet a DIMPRO szerverre. A PDF letöltése ettől függetlenül működik.</p> : null}
          {emailMessage ? <p data-terep-report-email-message className="mt-2 text-center text-[10px] font-bold leading-5 text-slate-700">{emailMessage}</p> : null}
        </div> : null}
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-2.5 text-center"><strong className="block text-lg text-cyan-900">{value}</strong><span className="text-[9px] font-black uppercase tracking-[.05em] text-slate-500">{label}</span></div>;
}
