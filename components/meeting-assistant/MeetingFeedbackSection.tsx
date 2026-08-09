"use client";

import { Check, MessageSquareText, Star, X } from "lucide-react";
import type { MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import MeetingSectionShell from "./MeetingSectionShell";

const TYPE_LABEL: Record<MeetingWorkspace["feedback"][number]["type"], string> = {
  acknowledged: "Tudomásul vette",
  comment: "Észrevétel",
  disagree: "Nem ért egyet",
  addition: "Kiegészítést javasol",
  partial_attendance: "Részleges részvétel",
  rating: "Értekezletértékelés",
};

export default function MeetingFeedbackSection({ workspace, postWorkspace, setStatus }: { workspace: MeetingWorkspace; postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>; setStatus: (value: string) => void }) {
  const feedback = workspace.feedback.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const acknowledged = feedback.filter((item) => item.type === "acknowledged").length;
  const pending = feedback.filter((item) => item.status === "pending" && item.type !== "acknowledged").length;

  async function review(feedbackId: string, status: "accepted" | "rejected") {
    try {
      await postWorkspace("review_feedback", { feedbackId, status, reviewedBy: workspace.minuteTakerName || workspace.organizerName });
      setStatus(status === "accepted" ? "A résztvevői javaslat elfogadva." : "A résztvevői javaslat elutasítva.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A visszajelzés kezelése sikertelen.");
    }
  }

  return (
    <MeetingSectionShell scope="organizer" id="meeting-feedback" title="Résztvevői visszaigazolások és vélemények" icon={MessageSquareText} defaultOpen={false} accentClass="bg-amber-100 text-amber-800" badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black text-slate-600">{acknowledged} visszaigazolás · {pending} függő</span>}>
      {feedback.length === 0 ? <div className="rounded-md border border-dashed p-3 text-center text-[9px] text-slate-500">Még nincs résztvevői visszajelzés.</div> : <div className="space-y-1.5">{feedback.map((item) => {
        const agendaTitle = workspace.agenda.find((agenda) => agenda.id === item.agendaItemId)?.title;
        const rating = item.type === "rating" ? Math.round(((item.ratingUseful + item.ratingPrepared + item.ratingClarity) / 3) * 10) / 10 : 0;
        return <article key={item.id} className="border-b border-slate-100 px-1 py-2 last:border-b-0"><div className="flex items-start gap-2"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${item.type === "rating" ? "bg-amber-100 text-amber-700" : item.type === "acknowledged" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>{item.type === "rating" ? <Star size={12} /> : item.type === "acknowledged" ? <Check size={12} /> : <MessageSquareText size={12} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-black text-slate-900">{item.anonymous ? "Névtelen résztvevő" : item.participantName}</span><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-black text-slate-600">{TYPE_LABEL[item.type]}</span><span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black ${item.status === "accepted" ? "bg-emerald-100 text-emerald-700" : item.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{item.status}</span></div>{agendaTitle && <div className="mt-1 text-[8px] font-semibold text-indigo-700">Kapcsolódó pont: {agendaTitle}</div>}{item.comment && <div className="mt-1 whitespace-pre-wrap text-[9px] leading-4 text-slate-600">{item.comment}</div>}{item.quote && <div className="mt-1 rounded-md bg-slate-50 p-2 text-[8px] italic text-slate-500">„{item.quote}”</div>}{rating > 0 && <div className="mt-1 text-[9px] font-black text-amber-700">Átlagos értékelés: {rating} / 5</div>}<div className="mt-1 text-[8px] text-slate-400">{new Date(item.createdAt).toLocaleString("hu-HU")} · összefoglaló v{item.relatedSummaryVersion || "-"}</div></div>{item.status === "pending" && item.type !== "acknowledged" && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => void review(item.id, "accepted")} title="Elfogadás" className="rounded-md bg-emerald-100 p-1.5 text-emerald-700"><Check size={11} /></button><button type="button" onClick={() => void review(item.id, "rejected")} title="Elutasítás" className="rounded-md bg-rose-100 p-1.5 text-rose-700"><X size={11} /></button></div>}</div></article>;
      })}</div>}
    </MeetingSectionShell>
  );
}
