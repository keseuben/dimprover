"use client";

import { Archive, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { markdownToPlainText, renderLiveMinutesText } from "@/app/lib/meeting-assistant/live-minutes";
import type { MeetingClosureMode, MeetingEmailDocumentType, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

const CLOSING_TEMPLATES = [
  { title: "Köszönjük a részvételt!", message: "Köszönöm a részvételt és az együttműködést!" },
  { title: "Köszönjük az aktív közreműködést!", message: "Köszönöm a figyelmet és az aktív közreműködést!" },
  { title: "Köszönjük a közös munkát!", message: "Köszönöm a közös munkát! A feladatokat és döntéseket az összefoglaló tartalmazza." },
  { title: "Az értekezlet lezárult", message: "Az értekezlet lezárult. Köszönöm a részvételt!" },
];

function emailNotice(type: MeetingEmailDocumentType, automatic: boolean) {
  const prefix = automatic ? "A rendszer" : "A szervező";
  if (type === "reminder") return `${prefix} az értekezleti emlékeztetőt hamarosan e-mailben is megküldi a résztvevőknek.`;
  if (type === "final_minutes") return `${prefix} a jóváhagyott jegyzőkönyvet hamarosan e-mailben is megküldi a résztvevőknek.`;
  if (type === "custom") return `${prefix} az elkészült értekezleti dokumentumot hamarosan e-mailben is megküldi a résztvevőknek.`;
  return `${prefix} a jegyzőkönyvtervezetet a feldolgozást követően e-mailben megküldi véleményezésre.`;
}

type EmailStatus = { ok: boolean; status?: { configured: boolean; from: string }; suggestedRecipients?: string[]; error?: string };

export default function MeetingPublishModal({ meetingId, accessToken, workspace, postWorkspace, onClose, setStatus }: { meetingId: string; accessToken: string; workspace: MeetingWorkspace; postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>; onClose: () => void; setStatus: (value: string) => void }) {
  const [mode, setMode] = useState<MeetingClosureMode>("publish");
  const [source, setSource] = useState<"rules" | "ai">(workspace.aiMinutesDraft ? "ai" : "rules");
  const [body, setBody] = useState(workspace.aiMinutesDraft || markdownToPlainText(renderLiveMinutesText(workspace, false)));
  const [closingIndex, setClosingIndex] = useState(2);
  const [closingTitle, setClosingTitle] = useState(CLOSING_TEMPLATES[2].title);
  const [closingMessage, setClosingMessage] = useState(CLOSING_TEMPLATES[2].message);
  const [documentType, setDocumentType] = useState<MeetingEmailDocumentType>(workspace.documentKind === "reminder" ? "reminder" : "draft_minutes");
  const [automaticEmail, setAutomaticEmail] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [recipients, setRecipients] = useState(workspace.attendees.map((item) => item.email).filter(Boolean).join("; "));
  const [includePdf, setIncludePdf] = useState(true);
  const [includeDocx, setIncludeDocx] = useState(true);
  const [reviewDeadline, setReviewDeadline] = useState(workspace.participantPermissions.reviewDeadline.slice(0, 16));
  const [acknowledgementsEnabled, setAcknowledgementsEnabled] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [ratingsEnabled, setRatingsEnabled] = useState(true);
  const [nextStatus, setNextStatus] = useState(workspace.nextMeeting.status);
  const [nextStart, setNextStart] = useState(workspace.nextMeeting.startsAt.slice(0, 16));
  const [nextEnd] = useState(workspace.nextMeeting.endsAt.slice(0, 16));
  const [nextLocation, setNextLocation] = useState(workspace.nextMeeting.location);
  const [nextNote, setNextNote] = useState(workspace.nextMeeting.note);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const notice = useMemo(() => emailNotice(documentType, automaticEmail && emailConfigured), [automaticEmail, documentType, emailConfigured]);

  useEffect(() => {
    const params = new URLSearchParams({ meetingId });
    if (accessToken) params.set("accessToken", accessToken);
    fetch(`/api/meeting-assistant/email?${params.toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<EmailStatus>(response, "Az e-mail állapot nem tölthető be."))
      .then((data) => { setEmailConfigured(Boolean(data.status?.configured)); if (data.suggestedRecipients?.length) setRecipients(data.suggestedRecipients.join("; ")); })
      .catch(() => setEmailConfigured(false));
  }, [accessToken, meetingId]);

  function selectClosing(index: number) {
    setClosingIndex(index); setClosingTitle(CLOSING_TEMPLATES[index].title); setClosingMessage(CLOSING_TEMPLATES[index].message);
  }

  async function finish() {
    setRunning(true); setError("");
    try {
      await postWorkspace("update_next_meeting", { status: nextStatus, startsAt: nextStart ? new Date(nextStart).toISOString() : "", endsAt: nextEnd ? new Date(nextEnd).toISOString() : "", location: nextLocation, note: nextNote });
      await postWorkspace("update_participant_permissions", { acknowledgementsEnabled, commentsEnabled, ratingsEnabled, reviewDeadline: reviewDeadline ? new Date(reviewDeadline).toISOString() : "" });
      if (mode === "publish") {
        await postWorkspace("publish_summary", { source, body, closingTitle, closingMessage, emailNotice: notice, emailDocumentType: documentType, emailDeliveryMode: automaticEmail && emailConfigured ? "automatic" : "organizer", reviewDeadline: reviewDeadline ? new Date(reviewDeadline).toISOString() : "", createdBy: workspace.minuteTakerName || workspace.organizerName });
      }
      const closed = await postWorkspace("close_meeting", { mode, closedBy: workspace.minuteTakerName || workspace.organizerName, closingTitle, closingMessage, emailNotice: notice, emailDocumentType: documentType, emailDeliveryMode: automaticEmail && emailConfigured ? "automatic" : "organizer", reviewDeadline: reviewDeadline ? new Date(reviewDeadline).toISOString() : "", endedAt: new Date().toISOString() });
      if (mode === "publish" && automaticEmail && emailConfigured) {
        const response = await fetch("/api/meeting-assistant/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken, recipients: recipients.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean), subject: `${closed.documentLabel} – ${closed.minuteNumber || closed.title}`, sentBy: closed.minuteTakerName || closed.organizerName, includePdf, includeDocx }) });
        const data = await readJsonResponse<{ ok: boolean; error?: string }>(response, "Az e-mail kiküldése sikertelen.");
        if (!response.ok || !data.ok) throw new Error(data.error || "Az e-mail kiküldése sikertelen.");
      }
      setStatus(mode === "publish" ? `Az értekezlet lezárult, az összefoglaló közzétéve${automaticEmail && emailConfigured ? ", az e-mail kiküldve" : ""}.` : "Az értekezlet lezárt munkapéldánya elkészült.");
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A lezárás sikertelen."); }
    finally { setRunning(false); }
  }

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm">
      <div className="flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-teal-800"><Archive size={18} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-black">Értekezlet lezárása és résztvevői közzététel</h2><p className="text-[10px] text-slate-500">Összefoglaló, köszönőüzenet, következő időpont, visszajelzés és e-mail.</p></div><button type="button" onClick={onClose}><X size={17} /></button></header>
        {error && <div className="bg-rose-50 px-4 py-2 text-[10px] font-semibold text-rose-800">{error}</div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_360px] lg:overflow-hidden">
          <main className="overflow-y-auto p-4"><div className="grid grid-cols-3 gap-2">{(["draft", "approval", "publish"] as MeetingClosureMode[]).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg border p-2 text-[9px] font-black ${mode === value ? "border-teal-500 bg-teal-50 text-teal-900" : "border-slate-200"}`}>{value === "draft" ? "Piszkozat" : value === "approval" ? "Véleményezésre" : "Közzététel"}</button>)}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setSource("rules"); setBody(markdownToPlainText(renderLiveMinutesText(workspace, false))); }} className={`rounded-md border px-3 py-2 text-[9px] font-black ${source === "rules" ? "bg-amber-50 border-amber-400" : ""}`}>Szabályalapú szöveg</button><button type="button" onClick={() => { setSource("ai"); setBody(workspace.aiMinutesDraft); }} disabled={!workspace.aiMinutesDraft} className={`rounded-md border px-3 py-2 text-[9px] font-black disabled:opacity-40 ${source === "ai" ? "bg-fuchsia-50 border-fuchsia-400" : ""}`}>AI-tervezet</button></div><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={20} className="mt-2 w-full rounded-lg border p-4 text-[11px] leading-6" />
            <h3 className="mt-4 text-[11px] font-black">Lezáró üzenet</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{CLOSING_TEMPLATES.map((item, index) => <button key={item.title} type="button" onClick={() => selectClosing(index)} className={`rounded-lg border p-2 text-left text-[9px] ${closingIndex === index ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}><b>{item.title}</b><div className="mt-1 text-slate-600">{item.message}</div></button>)}</div><input value={closingTitle} onChange={(e) => { setClosingIndex(-1); setClosingTitle(e.target.value); }} className="mt-2 w-full rounded-lg border px-3 py-2 text-[10px] font-bold" /><textarea value={closingMessage} onChange={(e) => { setClosingIndex(-1); setClosingMessage(e.target.value); }} rows={3} className="mt-2 w-full rounded-lg border p-3 text-[10px]" />
          </main>
          <aside className="overflow-y-auto border-l bg-slate-50 p-4 text-[10px]"><h3 className="font-black">Következő egyeztetés</h3><select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as typeof nextStatus)} className="mt-2 w-full rounded-md border bg-white p-2"><option value="not_defined">Még nincs meghatározva</option><option value="planned">Tervezett</option><option value="under_coordination">Egyeztetés alatt</option><option value="confirmed">Véglegesített</option></select><input type="datetime-local" value={nextStart} onChange={(e) => setNextStart(e.target.value)} className="mt-2 w-full rounded-md border p-2" /><input value={nextLocation} onChange={(e) => setNextLocation(e.target.value)} placeholder="Helyszín / Teams" className="mt-2 w-full rounded-md border p-2" /><textarea value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder="Megjegyzés" className="mt-2 w-full rounded-md border p-2" />
            <h3 className="mt-4 font-black">Résztvevői jogosultságok</h3><label className="mt-2 flex gap-2"><input type="checkbox" checked={acknowledgementsEnabled} onChange={(e) => setAcknowledgementsEnabled(e.target.checked)} /> Tudomásulvétel</label><label className="mt-2 flex gap-2"><input type="checkbox" checked={commentsEnabled} onChange={(e) => setCommentsEnabled(e.target.checked)} /> Jegyzőkönyvi észrevétel</label><label className="mt-2 flex gap-2"><input type="checkbox" checked={ratingsEnabled} onChange={(e) => setRatingsEnabled(e.target.checked)} /> Értekezlet értékelése</label><input type="datetime-local" value={reviewDeadline} onChange={(e) => setReviewDeadline(e.target.value)} className="mt-2 w-full rounded-md border p-2" />
            <h3 className="mt-4 font-black">E-mailes kiküldés</h3><select value={documentType} onChange={(e) => setDocumentType(e.target.value as MeetingEmailDocumentType)} className="mt-2 w-full rounded-md border bg-white p-2"><option value="reminder">Értekezleti emlékeztető</option><option value="draft_minutes">Jegyzőkönyvtervezet</option><option value="final_minutes">Végleges jegyzőkönyv</option><option value="custom">Egyedi dokumentum</option></select><label className="mt-2 flex gap-2"><input type="checkbox" checked={automaticEmail} disabled={!emailConfigured} onChange={(e) => setAutomaticEmail(e.target.checked)} /> Automatikus kiküldés</label><div className={`mt-2 rounded-md p-2 ${emailConfigured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{emailConfigured ? "SMTP beállítva." : "SMTP nincs beállítva; a lezáró szöveg a szervező későbbi kézi kiküldését jelzi."}</div><textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={3} placeholder="Címzettek pontosvesszővel" className="mt-2 w-full rounded-md border p-2" /><label className="mt-2 flex gap-2"><input type="checkbox" checked={includePdf} onChange={(e) => setIncludePdf(e.target.checked)} /> PDF csatolása</label><label className="mt-2 flex gap-2"><input type="checkbox" checked={includeDocx} onChange={(e) => setIncludeDocx(e.target.checked)} /> DOCX csatolása</label><div className="mt-2 rounded-md bg-white p-2 leading-5">{notice}</div>
            <button type="button" onClick={() => void finish()} disabled={running || (mode === "publish" && !body.trim())} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 font-black text-white disabled:opacity-40">{running ? <Loader2 size={14} className="animate-spin" /> : mode === "publish" ? <Send size={14} /> : <CheckCircle2 size={14} />} Lezárás végrehajtása</button>
          </aside>
        </div>
      </div>
    </div>
  );
}
