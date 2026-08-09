"use client";

import { CheckCircle2, Clock3, FileImage, FileText, MessageSquareText, Users, X } from "lucide-react";
import type { MeetingAttachment, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return [hours ? `${hours} ó` : "", minutes ? `${minutes} p` : ""].filter(Boolean).join(" ") || "-";
}

function AttachmentCard({ file, meetingId, accessToken }: { file: MeetingAttachment; meetingId: string; accessToken: string }) {
  const url = `/api/meeting-assistant/files/${encodeURIComponent(file.id)}?meetingId=${encodeURIComponent(meetingId)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`;
  const image = file.mimeType.startsWith("image/");
  return (
    <figure data-live-document-attachment={file.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {image ? <a href={url} target="_blank" rel="noreferrer" className="block bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={file.title || file.originalName} className="max-h-[520px] w-full object-contain" />
      </a> : <a href={url} target="_blank" rel="noreferrer" className="flex min-h-28 items-center justify-center gap-3 bg-slate-50 text-slate-600"><FileText size={30} /><span className="font-black">{file.title || file.originalName}</span></a>}
      <figcaption className="p-4"><div className="text-base font-black text-slate-950">{file.title || file.originalName}</div>{(file.description || file.caption) && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{file.description || file.caption}</p>}<div className="mt-3 text-xs font-semibold text-slate-500">Feltöltötte: {file.uploadedBy || "-"}</div></figcaption>
    </figure>
  );
}

export default function MeetingLiveDocumentView({ workspace, meetingId, accessToken, onClose, compact = false }: { workspace: MeetingWorkspace; meetingId: string; accessToken: string; onClose?: () => void; compact?: boolean }) {
  const attendees = workspace.attendees.filter((item) => item.status !== "invited_absent");
  const entries = workspace.sharedMessages.filter((item) => item.status === "shared" && (item.includeInDocument ?? true));
  const attachments = workspace.attachments.filter((item) => item.status === "shared");
  const generalEntries = entries.filter((item) => !item.agendaItemId);
  const generalAttachments = attachments.filter((item) => !item.agendaItemId);
  const actions = workspace.actionItems.filter((item) => item.shared);
  const shell = compact ? "min-h-full bg-white" : "min-h-screen bg-[#eef3f7] p-3 sm:p-6";
  return (
    <main data-live-document-view className={shell}>
      <article className={`mx-auto bg-white ${compact ? "max-w-none" : "max-w-5xl rounded-3xl border border-slate-200 shadow-xl"}`}>
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800"><FileText size={23} /></span>
          <div className="min-w-0 flex-1"><div className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Élő, összefüggő értekezleti dokumentum</div><h1 className="mt-1 truncate text-xl font-black text-slate-950 sm:text-2xl">{workspace.minuteNumber || workspace.title}</h1><p className="mt-1 truncate text-sm text-slate-500">{workspace.projectName} · {workspace.documentLabel}</p></div>
          {onClose && <button type="button" onClick={onClose} title="Teljes képernyős dokumentum bezárása" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><X size={20} /></button>}
        </header>

        <div className="space-y-8 px-4 py-6 text-[15px] leading-7 text-slate-700 sm:px-8 sm:py-9 sm:text-base sm:leading-8">
          <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5"><div className="grid gap-x-8 gap-y-2 sm:grid-cols-2"><div><b>Értekezlet:</b> {workspace.title}</div><div><b>Típus:</b> {workspace.meetingType}</div><div><b>Helyszín:</b> {workspace.meetingLocation || "-"}</div><div><b>Időpont:</b> {workspace.scheduledStart ? new Date(workspace.scheduledStart).toLocaleString("hu-HU") : "-"}</div><div><b>Értekezletvezető:</b> {workspace.chairpersonName || workspace.organizerName || "-"}</div><div><b>Jegyzőkönyvvezető:</b> {workspace.minuteTakerName || "-"}</div></div></section>

          {attendees.length > 0 && <section data-live-document-section="attendance"><h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xl font-black text-slate-950"><Users size={21} className="text-teal-700" /> Jelenlévők</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{attendees.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="font-black text-slate-900">{item.name}</div><div className="text-sm text-slate-500">{[item.organization, item.functionTitle].filter(Boolean).join(" · ") || (item.participationMode === "online" ? "Online / Teams" : "Személyes")}</div>{Boolean(item.totalAttendanceSeconds) && <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><Clock3 size={12} /> {duration(item.totalAttendanceSeconds || 0)}</div>}</div>)}</div></section>}

          {workspace.sharedNote && <section data-live-document-section="shared-note"><h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xl font-black text-slate-950"><MessageSquareText size={21} className="text-sky-700" /> Megosztott jegyzet</h2><p className="mt-4 whitespace-pre-wrap rounded-2xl border border-sky-100 bg-sky-50/50 p-5">{workspace.sharedNote}</p></section>}

          {workspace.agenda.filter((item) => item.shared).sort((a, b) => a.order - b.order).map((item) => {
            const itemEntries = entries.filter((entry) => entry.agendaItemId === item.id);
            const itemAttachments = attachments.filter((file) => file.agendaItemId === item.id);
            const itemActions = actions.filter((action) => action.agendaItemId === item.id);
            return <section key={item.id} id={`live-agenda-${item.id}`} data-live-document-agenda={item.id} className={`scroll-mt-28 rounded-2xl border p-5 sm:p-6 ${workspace.currentAgendaItemId === item.id ? "border-teal-400 bg-teal-50/30 ring-2 ring-teal-100" : "border-slate-200"}`}><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">{item.order}</span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950 sm:text-2xl">{item.title}</h2>{item.description && <p className="mt-2 italic text-slate-600">{item.description}</p>}</div></div>{item.discussionNotes && <div className="mt-5"><h3 className="font-black text-slate-900">Egyeztetés tartalma</h3><p className="mt-1 whitespace-pre-wrap">{item.discussionNotes}</p></div>}{item.decisionSummary && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-black text-emerald-950">Döntés / eredmény</h3><p className="mt-1 whitespace-pre-wrap text-emerald-900">{item.decisionSummary}</p></div>}{item.openQuestions && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-amber-950">Nyitott kérdések</h3><p className="mt-1 whitespace-pre-wrap text-amber-900">{item.openQuestions}</p></div>}{item.topicBlocks.filter((topic) => topic.shared).sort((a, b) => a.order - b.order).map((topic) => <div key={topic.id} className="mt-5 border-l-4 border-indigo-300 pl-4"><h3 className="text-lg font-black text-slate-900">{topic.order}. {topic.title}</h3>{topic.discussion && <p className="mt-2 whitespace-pre-wrap">{topic.discussion}</p>}{topic.decision && <p className="mt-2 whitespace-pre-wrap"><b>Döntés:</b> {topic.decision}</p>}{topic.openQuestions && <p className="mt-2 whitespace-pre-wrap"><b>Nyitott kérdés:</b> {topic.openQuestions}</p>}</div>)}{itemEntries.length > 0 && <div className="mt-6"><h3 className="font-black text-slate-900">Szöveges bejegyzések</h3><div className="mt-2 space-y-2">{itemEntries.map((entry) => <blockquote key={entry.id} className="rounded-xl border border-cyan-100 bg-cyan-50/50 px-4 py-3"><p className="whitespace-pre-wrap">{entry.text}</p><footer className="mt-2 text-xs font-bold text-cyan-900">{entry.submittedBy} · {new Date(entry.submittedAt).toLocaleString("hu-HU")}</footer></blockquote>)}</div></div>}{itemActions.length > 0 && <div className="mt-6"><h3 className="font-black text-slate-900">Döntések és feladatok</h3><div className="mt-2 space-y-2">{itemActions.map((action) => <div key={action.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-600" /><div><b>{action.title}</b>{(action.owner || action.dueDate) && <div className="text-sm text-slate-500">{action.owner ? `Felelős: ${action.owner}` : ""}{action.owner && action.dueDate ? " · " : ""}{action.dueDate ? `Határidő: ${action.dueDate}` : ""}</div>}</div></div>)}</div></div>}{itemAttachments.length > 0 && <div className="mt-6 grid gap-4">{itemAttachments.map((file) => <AttachmentCard key={file.id} file={file} meetingId={meetingId} accessToken={accessToken} />)}</div>}</section>;
          })}

          {generalEntries.length > 0 && <section data-live-document-section="general-entries"><h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xl font-black text-slate-950"><MessageSquareText size={21} className="text-cyan-700" /> Általános szöveges bejegyzések</h2><div className="mt-4 space-y-3">{generalEntries.map((entry) => <blockquote key={entry.id} className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4"><p className="whitespace-pre-wrap">{entry.text}</p><footer className="mt-2 text-xs font-bold text-cyan-900">{entry.submittedBy} · {new Date(entry.submittedAt).toLocaleString("hu-HU")}</footer></blockquote>)}</div></section>}
          {generalAttachments.length > 0 && <section data-live-document-section="general-attachments"><h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xl font-black text-slate-950"><FileImage size={21} className="text-violet-700" /> Általános értekezleti mellékletek</h2><div className="mt-4 grid gap-4">{generalAttachments.map((file) => <AttachmentCard key={file.id} file={file} meetingId={meetingId} accessToken={accessToken} />)}</div></section>}

          {actions.filter((item) => !item.agendaItemId).length > 0 && <section><h2 className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xl font-black text-slate-950"><CheckCircle2 size={21} className="text-emerald-700" /> Általános döntések és feladatok</h2><div className="mt-4 space-y-2">{actions.filter((item) => !item.agendaItemId).map((action) => <div key={action.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><b>{action.title}</b><div className="mt-1 text-sm text-slate-500">{[action.owner ? `Felelős: ${action.owner}` : "", action.dueDate ? `Határidő: ${action.dueDate}` : ""].filter(Boolean).join(" · ")}</div></div>)}</div></section>}
        </div>
      </article>
    </main>
  );
}
