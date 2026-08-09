"use client";

import { Bot, Check, Loader2, Save, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type Estimate = { model: string; inputTokens: number; outputTokens: number; estimatedCostHuf: number };
type AiResponse = { ok: boolean; estimate?: Estimate; result?: { text: string; actualCostHuf: number }; error?: string };

function formatHuf(value: number) {
  if (value < 0.01) return "< 0,01 Ft";
  return `${value.toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft`;
}

export default function MeetingAiMinutesModal({ meetingId, accessToken, workspace, postWorkspace, onClose, setStatus }: { meetingId: string; accessToken: string; workspace: MeetingWorkspace; postWorkspace: (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>; onClose: () => void; setStatus: (value: string) => void }) {
  const [includeAgenda, setIncludeAgenda] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeSharedNote, setIncludeSharedNote] = useState(true);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [style, setStyle] = useState("hivatalos");
  const [length, setLength] = useState("részletes");
  const [phase, setPhase] = useState("előzetes");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [draft, setDraft] = useState(workspace.aiMinutesDraft || "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const context = useMemo(() => ({
    document: { label: workspace.documentLabel, category: workspace.meetingType, code: workspace.meetingTypeCode, number: workspace.minuteNumber, phase, style, length },
    meeting: { title: workspace.title, projectName: workspace.projectName, projectCode: workspace.projectCode, location: workspace.meetingLocation, chairperson: workspace.chairpersonName, minuteTaker: workspace.minuteTakerName, approver: workspace.approverName, start: workspace.scheduledStart, nextMeeting: workspace.nextMeeting },
    attendees: workspace.attendees,
    agenda: includeAgenda ? workspace.agenda : [],
    actionItems: includeActions ? workspace.actionItems : [],
    transcript: includeTranscript ? workspace.transcript : [],
    sharedNote: includeSharedNote ? workspace.sharedNote : "",
    privateNotes: includePrivate ? workspace.privateNotes : "",
    instruction: "Írj bevezető, jól tagolt törzs- és lezáró részt. Az ÁLT kód általános egyeztetési kategória; a dokumentum megnevezését a document.label mezőből vedd. Ne találj ki tényt.",
  }), [includeActions, includeAgenda, includePrivate, includeSharedNote, includeTranscript, length, phase, style, workspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch("/api/meeting-assistant/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken, operation: "estimate", action: "draft_minutes", context }) })
        .then((response) => readJsonResponse<AiResponse>(response, "Az AI-költség nem számítható ki."))
        .then((data) => setEstimate(data.estimate || null))
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Becslési hiba."));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [accessToken, context, meetingId]);

  async function runAi() {
    if (!estimate) return;
    setRunning(true); setError("");
    try {
      const response = await fetch("/api/meeting-assistant/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken, operation: "run", action: "draft_minutes", context, confirmedMaxHuf: estimate.estimatedCostHuf }) });
      const data = await readJsonResponse<AiResponse>(response, "Az AI-futtatás sikertelen.");
      if (!response.ok || !data.result) throw new Error(data.error || "Az AI-futtatás sikertelen.");
      setDraft(data.result.text);
      await postWorkspace("save_ai_minutes_draft", { text: data.result.text });
      setStatus(`Az AI-tervezet elkészült. Tényleges költség: ${formatHuf(data.result.actualCostHuf)}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "AI-hiba."); }
    finally { setRunning(false); }
  }

  async function saveDraft() {
    await postWorkspace("save_ai_minutes_draft", { text: draft });
    setStatus("Az AI-tervezet piszkozatként mentve.");
  }

  async function publish() {
    if (!draft.trim()) return;
    await postWorkspace("save_ai_minutes_draft", { text: draft });
    await postWorkspace("publish_summary", { source: "ai", body: draft, title: `${workspace.documentLabel} – ${workspace.minuteNumber || workspace.title}`, createdBy: workspace.minuteTakerName || workspace.organizerName });
    setStatus("Az ellenőrzött AI-tervezet közzétéve a résztvevőknek.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-800"><Bot size={18} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-black">AI {workspace.documentLabel.toLowerCase()} megfogalmazása</h2><p className="text-[10px] text-slate-500">Bevezető, törzsrész, lezárás és opcionális Teams-átirat összefoglalása.</p></div><button type="button" onClick={onClose} className="rounded-md border p-2"><X size={16} /></button></header>
        {error && <div className="bg-rose-50 px-4 py-2 text-[10px] font-semibold text-rose-800">{error}</div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <aside className="overflow-y-auto border-r bg-slate-50 p-4 text-[10px]"><h3 className="font-black">Források</h3>{[["Napirendi tartalom", includeAgenda, setIncludeAgenda], ["Döntések és feladatok", includeActions, setIncludeActions], ["Teams-átirat", includeTranscript, setIncludeTranscript], ["Megosztott jegyzet", includeSharedNote, setIncludeSharedNote], ["Privát szervezői jegyzetek", includePrivate, setIncludePrivate]].map(([label, checked, setter]) => <label key={String(label)} className="mt-2 flex items-center gap-2 rounded-md border bg-white p-2"><input type="checkbox" checked={Boolean(checked)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} /> {String(label)}</label>)}<h3 className="mt-4 font-black">Megfogalmazás</h3><select value={style} onChange={(e) => setStyle(e.target.value)} className="mt-2 w-full rounded-md border bg-white p-2"><option value="hivatalos">Hivatalos szakmai</option><option value="tömör">Tömör emlékeztető</option><option value="közérthető">Közérthető</option></select><select value={length} onChange={(e) => setLength(e.target.value)} className="mt-2 w-full rounded-md border bg-white p-2"><option value="részletes">Részletes</option><option value="rövid">Rövid</option></select><select value={phase} onChange={(e) => setPhase(e.target.value)} className="mt-2 w-full rounded-md border bg-white p-2"><option value="előzetes">Előzetes tervezet</option><option value="végleges">Véglegesítésre előkészített</option></select><div className="mt-4 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3"><div className="font-bold text-fuchsia-700">Becsült költség</div><div className="mt-1 text-lg font-black text-fuchsia-900">{estimate ? formatHuf(estimate.estimatedCostHuf) : "számítás..."}</div><div className="mt-1 text-[8px] text-fuchsia-700">{estimate?.model || "-"} · ~{estimate?.inputTokens || 0} bemeneti token</div></div><button type="button" onClick={() => void runAi()} disabled={!estimate || running} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-700 px-3 py-2.5 font-black text-white disabled:opacity-40">{running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI-tervezet elkészítése</button></aside>
          <main className="flex min-h-0 flex-col p-4"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Szerkeszthető előnézet</div><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Az AI-tervezet itt jelenik meg, és közzététel előtt szabadon szerkeszthető." className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 p-4 text-[12px] leading-6 outline-none focus:border-fuchsia-400" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void saveDraft()} disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-[10px] font-black"><Save size={13} /> Piszkozat mentése</button><button type="button" onClick={() => void publish()} disabled={!draft.trim()} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-2 text-[10px] font-black text-white"><Send size={13} /> Jóváhagyás és közzététel</button><button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-[10px] font-black text-white"><Check size={13} /> Bezárás</button></div></main>
        </div>
      </div>
    </div>
  );
}
