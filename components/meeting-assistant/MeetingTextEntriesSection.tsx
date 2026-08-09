"use client";

import { Check, CheckSquare2, ChevronDown, ChevronUp, MessageSquareText, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingSharedMessage, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

type PostWorkspace = (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>;

export default function MeetingTextEntriesSection({
  workspace,
  role,
  locked,
  postWorkspace,
  setStatus,
}: {
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  locked: boolean;
  postWorkspace: PostWorkspace;
  setStatus: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState({ submittedBy: "", submittedEmail: "", text: "", agendaItemId: "", includeInDocument: true });
  const canModerate = role === "organizer" || role === "editor";
  const visible = canModerate ? workspace.sharedMessages : workspace.sharedMessages.filter((item) => item.status === "shared");
  const includedCount = visible.filter((item) => item.status === "shared" && (item.includeInDocument ?? true)).length;

  useEffect(() => {
    function handleNavigation(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; scope?: MeetingViewRole }>).detail;
      if (detail?.scope && detail.scope !== role) return;
      setOpen(Boolean(detail?.id) && detail.id === "meeting-text-entries");
    }
    window.addEventListener("dimpro-meeting-section", handleNavigation as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleNavigation as EventListener);
  }, [role]);

  function toggleSection() {
    const nextId = open ? "" : "meeting-text-entries";
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: nextId, scope: role } }));
  }

  function edit(item: MeetingSharedMessage) {
    setEditingId(item.id);
    setDraft({ submittedBy: item.submittedBy, submittedEmail: item.submittedEmail || "", text: item.text, agendaItemId: item.agendaItemId || "", includeInDocument: item.includeInDocument ?? true });
  }

  async function update(item: MeetingSharedMessage, patch: Record<string, unknown>, success = "A bejegyzés módosítva.") {
    try {
      await postWorkspace("update_shared_message", {
        messageId: item.id,
        submittedBy: item.submittedBy,
        submittedEmail: item.submittedEmail || "",
        text: item.text,
        agendaItemId: item.agendaItemId || "",
        includeInDocument: item.includeInDocument ?? true,
        ...patch,
      });
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A bejegyzés módosítása sikertelen.");
    }
  }

  async function saveEdit(item: MeetingSharedMessage) {
    if (!draft.submittedBy.trim() || !draft.text.trim()) {
      setStatus("A bejegyző neve és a bejegyzés szövege kötelező.");
      return;
    }
    await update(item, draft, "A szöveges bejegyzés mentve.");
    setEditingId("");
  }

  async function review(item: MeetingSharedMessage, status: "shared" | "rejected") {
    try {
      await postWorkspace("review_shared_message", { messageId: item.id, status, agendaItemId: item.agendaItemId || "", includeInDocument: item.includeInDocument ?? true });
      setStatus(status === "shared" ? "A bejegyzés jóváhagyva és megjelent az értekezletben." : "A bejegyzés kizárva. Az auditnaplóban megmarad.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A moderálás sikertelen.");
    }
  }

  return (
    <section id="meeting-text-entries" className="scroll-mt-[92px] border-b border-slate-200 bg-white">
      <button type="button" onClick={toggleSection} className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700"><MessageSquareText size={13} /></span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-900">Szöveges bejegyzések</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{includedCount} / {visible.length}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-2">
          <div className="mb-3 rounded-lg border border-cyan-100 bg-cyan-50/60 px-2.5 py-2 text-[9px] leading-4 text-cyan-950">
            A gyorsrögzítőből érkező szövegek itt rendezhetők. A bepipált, jóváhagyott bejegyzések bekerülnek az élő dokumentumba és az exportba.
          </div>
          <div className="space-y-2">
            {visible.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-500">Még nincs szöveges bejegyzés.</div> : visible.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((item) => {
              const agenda = workspace.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId);
              const editing = editingId === item.id;
              return (
                <article key={item.id} className={`rounded-xl border p-3 ${item.status === "rejected" ? "border-rose-200 bg-rose-50/40 opacity-70" : item.status === "pending" ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
                  {editing ? (
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2"><input value={draft.submittedBy} onChange={(event) => setDraft((current) => ({ ...current, submittedBy: event.target.value }))} placeholder="Bejegyző neve *" className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px]" /><input value={draft.submittedEmail} onChange={(event) => setDraft((current) => ({ ...current, submittedEmail: event.target.value }))} placeholder="E-mail (opcionális)" className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px]" /></div>
                      <textarea value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} rows={4} className="w-full rounded-lg border border-slate-200 p-2.5 text-[10px] leading-5" />
                      <select value={draft.agendaItemId} onChange={(event) => setDraft((current) => ({ ...current, agendaItemId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[9px] font-semibold"><option value="">Nincs napirendi ponthoz rendelve</option>{workspace.agenda.slice().sort((a, b) => a.order - b.order).map((agendaItem) => <option key={agendaItem.id} value={agendaItem.id}>{agendaItem.order}. {agendaItem.title}</option>)}</select>
                      <label className="flex items-center gap-2 text-[9px] font-bold text-slate-700"><input type="checkbox" checked={draft.includeInDocument} onChange={(event) => setDraft((current) => ({ ...current, includeInDocument: event.target.checked }))} /> Kerüljön az élő dokumentumba és az exportba</label>
                      <div className="flex justify-end gap-1"><button type="button" onClick={() => setEditingId("")} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[9px] font-black">Mégse</button><button type="button" onClick={() => void saveEdit(item)} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[9px] font-black text-white"><Save size={11} /> Mentés</button></div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      {canModerate && <label className="mt-0.5 flex shrink-0 items-center" title="Bekerüljön az élő dokumentumba"><input type="checkbox" checked={item.includeInDocument ?? true} disabled={locked || item.status === "rejected"} onChange={(event) => void update(item, { includeInDocument: event.target.checked }, event.target.checked ? "A bejegyzés bekerül az élő dokumentumba." : "A bejegyzés kimarad az élő dokumentumból, de megmarad a rendszerben.")} /></label>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-black text-slate-900">{item.submittedBy}</span><span className="text-[8px] font-semibold text-slate-400">{new Date(item.submittedAt).toLocaleString("hu-HU")}</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${item.status === "shared" ? "bg-emerald-100 text-emerald-700" : item.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{item.status === "shared" ? "Jóváhagyva" : item.status === "rejected" ? "Kizárva" : "Jóváhagyásra vár"}</span></div>
                        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-5 text-slate-700">{item.text}</p>
                        <div className="mt-1 text-[8px] font-semibold text-slate-500">{agenda ? `Napirend: ${agenda.order}. ${agenda.title}` : "Nincs napirendi ponthoz rendelve"}{item.submittedEmail ? ` · ${item.submittedEmail}` : ""}</div>
                      </div>
                      {canModerate && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => edit(item)} disabled={locked} title="Szerkesztés" className="rounded-md border border-slate-200 p-1.5 text-slate-600 disabled:opacity-30"><Save size={11} /></button>{item.status === "pending" && <button type="button" onClick={() => void review(item, "shared")} disabled={locked} title="Jóváhagyás" className="rounded-md bg-emerald-600 p-1.5 text-white disabled:opacity-30"><Check size={11} /></button>}<button type="button" onClick={() => void review(item, "rejected")} disabled={locked || item.status === "rejected"} title="Kizárás" className="rounded-md border border-rose-200 p-1.5 text-rose-600 disabled:opacity-30"><X size={11} /></button></div>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {includedCount > 0 && <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[9px] font-semibold text-emerald-800"><CheckSquare2 size={13} /> {includedCount} bejegyzés kerül az élő dokumentumba.</div>}
        </div>
      )}
    </section>
  );
}
