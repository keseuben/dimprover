"use client";

import { CheckCircle2, MessageSquareText, Send, Star, X } from "lucide-react";
import { useState } from "react";
import type { MeetingFeedbackType, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

export default function MeetingFeedbackModal({ workspace, postWorkspace, onClose, setStatus }: { workspace: MeetingWorkspace; postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>; onClose: () => void; setStatus: (value: string) => void }) {
  const [type, setType] = useState<MeetingFeedbackType>("acknowledged");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agendaItemId, setAgendaItemId] = useState("");
  const [comment, setComment] = useState("");
  const [ratingUseful, setRatingUseful] = useState(5);
  const [ratingPrepared, setRatingPrepared] = useState(5);
  const [ratingClarity, setRatingClarity] = useState(5);
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await postWorkspace("submit_feedback", { participantName: name || "Résztvevő", participantEmail: email, type, agendaItemId, comment, ratingUseful, ratingPrepared, ratingClarity, anonymous });
      setStatus(type === "acknowledged" ? "A visszaigazolás rögzítve. Köszönjük." : "A visszajelzés rögzítve és továbbítva a szervezőnek.");
      onClose();
    } catch (error) { setStatus(error instanceof Error ? error.message : "A visszajelzés mentése sikertelen."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800"><MessageSquareText size={18} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-black">Résztvevői visszaigazolás és vélemény</h2><p className="text-[10px] text-slate-500">A hivatalos dokumentumot nem írod át közvetlenül; követhető észrevételt küldesz a szervezőnek.</p></div><button type="button" onClick={onClose}><X size={17} /></button></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["acknowledged", "Tudomásul vettem", CheckCircle2], ["comment", "Észrevétel", MessageSquareText], ["addition", "Kiegészítés", Send], ["rating", "Értékelés", Star]].map(([value, label, Icon]) => { const I = Icon as typeof Star; return <button key={String(value)} type="button" onClick={() => setType(value as MeetingFeedbackType)} className={`rounded-lg border p-2 text-[9px] font-black ${type === value ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}><I size={14} className="mx-auto mb-1" />{String(label)}</button>; })}</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Név" className="rounded-lg border px-3 py-2 text-[10px]" /><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="rounded-lg border px-3 py-2 text-[10px]" /></div>
        {type !== "acknowledged" && type !== "rating" && <><select value={agendaItemId} onChange={(e) => setAgendaItemId(e.target.value)} className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-[10px]"><option value="">Általános észrevétel</option>{workspace.agenda.map((item) => <option key={item.id} value={item.id}>{item.order}. {item.title}</option>)}</select><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} placeholder="Írd le pontosan az észrevételt vagy a javasolt kiegészítést..." className="mt-2 w-full rounded-lg border p-3 text-[10px] leading-5" /></>}
        {type === "rating" && <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">{[["Hasznosság", ratingUseful, setRatingUseful], ["Előkészítettség", ratingPrepared, setRatingPrepared], ["Döntések és feladatok egyértelműsége", ratingClarity, setRatingClarity]].map(([label, value, setter]) => <label key={String(label)} className="grid grid-cols-[1fr_90px] items-center gap-2 text-[10px] font-bold"><span>{String(label)}</span><select value={Number(value)} onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))} className="rounded-md border bg-white p-2">{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label>)}</div>}
        <label className="mt-3 flex items-center gap-2 text-[10px] font-semibold"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Az értekezletértékelés név nélkül jelenjen meg</label>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-[10px] font-black">Mégse</button><button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-4 py-2 text-[10px] font-black text-white disabled:opacity-40"><Send size={13} /> Küldés</button></div>
      </div>
    </div>
  );
}
