"use client";

import { CheckCircle2, FileUp, Loader2, Save, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

type PostWorkspace = (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>;

export default function MeetingSafeCloseModal({ workspace, role, actorName, postWorkspace, onStopSharing, onClose, setStatus }: { workspace: MeetingWorkspace; role: MeetingViewRole; actorName: string; postWorkspace: PostWorkspace; onStopSharing?: () => void | Promise<void>; onClose: () => void; setStatus: (message: string) => void }) {
  const [autoWatch, setAutoWatch] = useState(Boolean(workspace.teamsTranscript.autoWatchEnabled || workspace.sessionState.autoTranscriptWatch));
  const [working, setWorking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const transcriptReady = workspace.teamsTranscript.status === "available" || workspace.transcript.length > 0;

  async function safeClose() {
    setWorking(true);
    try {
      await postWorkspace("safe_close_session", { actorName, autoTranscriptWatch: autoWatch });
      await onStopSharing?.();
      setCompleted(true);
      setStatus("Minden DIMPRO-módosítás elmentve. A munkamenet biztonságosan bezárható.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A munkamenet biztonságos bezárása sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Munkamenet biztonságos bezárása">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-200 p-5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800"><ShieldCheck size={24} /></span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950">Munkamenet biztonságos bezárása</h2><p className="mt-1 text-sm text-slate-500">Ez nem zárja le hivatalosan az értekezletet és nem archiválja a jegyzőkönyvet.</p></div><button type="button" onClick={onClose} title="Bezárás" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><X size={20} /></button></header>
        <div className="space-y-4 p-5">
          {completed ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center"><CheckCircle2 size={42} className="mx-auto text-emerald-600" /><h3 className="mt-4 text-xl font-black text-emerald-950">Minden módosítás elmentve</h3><p className="mt-2 text-sm leading-6 text-emerald-900">A közös nézet vezérlése elengedve, a megosztás leállítása kérve. A DIMPRO Értekezleti Kísérő Teams-panelje most bezárható a Teams saját X gombjával.</p><button type="button" onClick={onClose} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Rendben</button></section> : <>
            <section className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-black text-emerald-950"><Save size={17} /> DIMPRO-adatok</div><p className="mt-2 text-sm text-emerald-900">Utolsó mentés: {workspace.sessionState.lastSavedAt ? new Date(workspace.sessionState.lastSavedAt).toLocaleString("hu-HU") : new Date(workspace.updatedAt).toLocaleString("hu-HU")}</p></div><div className={`rounded-xl border p-4 ${transcriptReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className={`flex items-center gap-2 font-black ${transcriptReady ? "text-emerald-950" : "text-amber-950"}`}><FileUp size={17} /> Teams-átirat</div><p className={`mt-2 text-sm ${transcriptReady ? "text-emerald-900" : "text-amber-900"}`}>{transcriptReady ? `${workspace.transcript.length} átiratsor elérhető, AI-feldolgozásra kész.` : "Az átirat még nem érhető el. Később Graph-importtal vagy VTT/DOCX/TXT feltöltéssel hozzáadható."}</p></div></section>
            {!transcriptReady && <label className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><input type="checkbox" checked={autoWatch} onChange={(event) => setAutoWatch(event.target.checked)} className="mt-1" /><span><b className="text-cyan-950">Bezárás és automatikus átiratfigyelés</b><span className="mt-1 block text-sm leading-6 text-cyan-900">A DIMPRO megjegyzi, hogy a Teams-átiratot az értekezlet után automatikusan be kell olvasni. Ehhez a Microsoft Graph kapcsolatnak működnie kell.</span></span></label>}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600"><b>Bezáráskor:</b> az aktuális adatok mentődnek, a közösnézet-vezérlés megszűnik, a Teams-stage megosztás leállítása elindul. Az értekezlet státusza változatlan marad; formális lezáráshoz továbbra is az „Értekezlet lezárása” funkciót kell használni.</div>
            <button type="button" onClick={() => void safeClose()} disabled={working || !["organizer", "editor"].includes(role)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white disabled:opacity-40">{working ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Minden mentése és munkamenet bezárása</button>
          </>}
        </div>
      </div>
    </div>
  );
}
