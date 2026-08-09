"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ClipboardCheck,
  Eye,
  FileText,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MEETING_AGENDA_TEMPLATES } from "@/app/lib/meeting-assistant/templates";
import MeetingTopicBlocksEditor from "./MeetingTopicBlocksEditor";
import type {
  MeetingAgendaTemplateKey,
  MeetingViewRole,
  MeetingWorkspace,
} from "@/app/lib/meeting-assistant/types";

type PostWorkspace = (operation: string, payload: Record<string, unknown>) => Promise<MeetingWorkspace>;

type Props = {
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  locked: boolean;
  postWorkspace: PostWorkspace;
  setStatus: (message: string) => void;
};

function contentExists(value: string) {
  return value.trim().length > 0;
}

export default function MeetingAgendaSection({ workspace, role, locked, postWorkspace, setStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState<MeetingAgendaTemplateKey>(workspace.agendaTemplateKey || "general");
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [working, setWorking] = useState(false);
  const [contentItemId, setContentItemId] = useState("");
  const [remoteAgendaItemId, setRemoteAgendaItemId] = useState("");
  const [description, setDescription] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [decisionSummary, setDecisionSummary] = useState("");
  const [openQuestions, setOpenQuestions] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [contentDirty, setContentDirty] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const autoSaveSequence = useRef(0);

  const agenda = useMemo(
    () => workspace.agenda.slice().sort((a, b) => a.order - b.order),
    [workspace.agenda],
  );
  const canEdit = role === "organizer" || role === "editor";
  const visibleAgenda = canEdit ? agenda : agenda.filter((item) => item.shared);
  const effectiveAgendaItemId = role === "participant" && remoteAgendaItemId ? remoteAgendaItemId : workspace.currentAgendaItemId;
  const currentItem = visibleAgenda.find((item) => item.id === effectiveAgendaItemId) || visibleAgenda[0] || null;
  const currentTemplate = MEETING_AGENDA_TEMPLATES.find((item) => item.key === templateKey) || MEETING_AGENDA_TEMPLATES[0];


  useEffect(() => {
    function handleRemoteAgenda(event: Event) {
      const detail = (event as CustomEvent<{ agendaItemId?: string }>).detail;
      if (!detail?.agendaItemId) return;
      setRemoteAgendaItemId(detail.agendaItemId);
      setOpen(true);
    }
    window.addEventListener("dimpro-meeting-agenda", handleRemoteAgenda as EventListener);
    return () => window.removeEventListener("dimpro-meeting-agenda", handleRemoteAgenda as EventListener);
  }, []);

  useEffect(() => {
    function handleNavigation(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; scope?: MeetingViewRole }>).detail;
      if (detail?.scope && detail.scope !== role) return;
      setOpen(Boolean(detail?.id) && detail.id === "meeting-agenda");
    }
    window.addEventListener("dimpro-meeting-section", handleNavigation as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleNavigation as EventListener);
  }, [role]);

  useEffect(() => {
    if (!currentItem) return;
    if (contentDirty && contentItemId === currentItem.id) return;
    setContentItemId(currentItem.id);
    setDescription(currentItem.description || "");
    setDiscussionNotes(currentItem.discussionNotes || "");
    setDecisionSummary(currentItem.decisionSummary || "");
    setOpenQuestions(currentItem.openQuestions || "");
    setPrivateNotes(currentItem.privateNotes || "");
    setContentDirty(false);
  }, [contentDirty, contentItemId, currentItem]);

  useEffect(() => {
    if (!canEdit || locked || !contentDirty || !currentItem) return;
    const sequence = ++autoSaveSequence.current;
    const timer = window.setTimeout(() => {
      setContentSaving(true);
      void postWorkspace("update_agenda_content", {
        agendaItemId: currentItem.id,
        description,
        discussionNotes,
        decisionSummary,
        openQuestions,
        privateNotes,
        updatedBy: role === "editor" ? workspace.editorAccess.editorName || "Jegyzőkönyv-szerkesztő" : workspace.organizerName || "Szervező",
      })
        .then(() => {
          if (autoSaveSequence.current === sequence) setContentDirty(false);
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "Az automatikus napirendmentés sikertelen.");
        })
        .finally(() => {
          if (autoSaveSequence.current === sequence) setContentSaving(false);
        });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [
    canEdit,
    contentDirty,
    currentItem,
    decisionSummary,
    description,
    discussionNotes,
    locked,
    openQuestions,
    postWorkspace,
    privateNotes,
    role,
    setStatus,
    workspace.editorAccess.editorName,
    workspace.organizerName,
  ]);

  function toggleAgendaSection() {
    const nextId = open ? "" : "meeting-agenda";
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: nextId, scope: role } }));
    if (!nextId) return;
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>(`[data-meeting-panel-role="${role}"]`);
      const target = panel?.querySelector<HTMLElement>(`#${nextId}`);
      const container = panel?.querySelector<HTMLElement>("[data-meeting-scroll-container]");
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({ top: Math.max(0, container.scrollTop + targetRect.top - containerRect.top), behavior: "smooth" });
    }, 90);
  }

  async function run(operation: string, payload: Record<string, unknown>, success: string) {
    setWorking(true);
    try {
      await postWorkspace(operation, payload);
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A művelet sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  async function applyTemplate() {
    const confirmed = window.confirm(
      `A(z) „${currentTemplate.label}” sablon betöltése lecseréli a jelenlegi napirendi listát és annak kidolgozott tartalmát. Folytatod?`,
    );
    if (!confirmed) return;
    setContentDirty(false);
    await run("apply_agenda_template", { templateKey }, `${currentTemplate.label} sablon betöltve.`);
  }

  async function addItem() {
    if (!newTitle.trim()) {
      setStatus("Add meg az új napirendi pont megnevezését.");
      return;
    }
    await run("add_agenda_item", { title: newTitle, shared: true }, "Az új napirendi pont hozzáadva.");
    setNewTitle("");
  }

  async function selectItem(itemId: string) {
    if (itemId === workspace.currentAgendaItemId) return;
    if (contentDirty) {
      const confirmed = window.confirm("Az aktuális napirendi pont módosításai még nincsenek elmentve. Elveted őket és másik pontra lépsz?");
      if (!confirmed) return;
      setContentDirty(false);
    }
    await run("set_current_agenda", { agendaItemId: itemId }, "A napirendi pont kiválasztva; a kidolgozó mezők lent megjelentek.");
  }

  async function saveEdit() {
    if (!editingId || !editingTitle.trim()) return;
    await run("update_agenda_item", { agendaItemId: editingId, title: editingTitle }, "A napirendi pont neve módosítva.");
    setEditingId("");
    setEditingTitle("");
  }

  async function saveContent() {
    if (!currentItem) return;
    autoSaveSequence.current += 1;
    setContentSaving(true);
    try {
      await postWorkspace("update_agenda_content", {
        agendaItemId: currentItem.id,
        description,
        discussionNotes,
        decisionSummary,
        openQuestions,
        privateNotes,
        updatedBy: role === "editor" ? workspace.editorAccess.editorName || "Jegyzőkönyv-szerkesztő" : workspace.organizerName || "Szervező",
      });
      setContentDirty(false);
      setStatus(`A(z) „${currentItem.title}” napirendi pont részletes tartalma mentve.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A napirendi tartalom mentése sikertelen.");
    } finally {
      setContentSaving(false);
    }
  }

  async function removeItem(id: string, title: string) {
    if (!window.confirm(`Biztosan törlöd ezt a napirendi pontot és annak teljes kidolgozott tartalmát: ${title}?`)) return;
    setContentDirty(false);
    await run("remove_agenda_item", { agendaItemId: id }, "A napirendi pont törölve.");
  }

  function changeContent(setter: (value: string) => void, value: string) {
    setter(value);
    setContentDirty(true);
  }

  return (
    <section id="meeting-agenda" className="scroll-mt-[92px] border-b border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggleAgendaSection}
        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700"><ClipboardCheck size={13} /></span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-900">Napirend és jegyzőkönyvi tartalom</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{visibleAgenda.length}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-2">
          {role === "organizer" && (
            <>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-800">Értekezletsablon</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value as MeetingAgendaTemplateKey)} disabled={locked || working} className="min-w-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:border-indigo-500">
                    {MEETING_AGENDA_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
                  </select>
                  <button type="button" onClick={() => void applyTemplate()} disabled={locked || working} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><RefreshCw size={13} className={working ? "animate-spin" : ""} /> Sablon betöltése</button>
                </div>
                <div className="mt-2 text-[9px] leading-4 text-indigo-900">{currentTemplate.description}</div>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} disabled={locked} placeholder="Új napirendi pont..." className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-[11px] outline-none focus:border-indigo-400 disabled:opacity-40" />
                <button type="button" onClick={() => void addItem()} disabled={locked || working} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Plus size={13} /> Hozzáadás</button>
              </div>
            </>
          )}

          {role === "editor" && (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} disabled={locked} placeholder="Új megosztott napirendi pont..." className="min-w-0 rounded-lg border border-teal-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-teal-500 disabled:opacity-40" />
              <button type="button" onClick={() => void addItem()} disabled={locked || working} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Plus size={13} /> Hozzáadás</button>
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {visibleAgenda.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[10px] text-slate-500">Nincs megosztott napirendi pont.</div>
            ) : visibleAgenda.map((item, index) => (
              <div key={item.id} className={`rounded-lg border px-2.5 py-2 ${effectiveAgendaItemId === item.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`}>
                {editingId === item.id && canEdit ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveEdit(); if (event.key === "Escape") setEditingId(""); }} className="min-w-0 flex-1 rounded-lg border border-indigo-200 px-2 py-1.5 text-[11px]" />
                    <button type="button" onClick={() => void saveEdit()} className="rounded-lg bg-indigo-600 p-1.5 text-white"><Check size={12} /></button>
                    <button type="button" onClick={() => setEditingId("")} className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><X size={12} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <button type="button" onClick={() => void run("toggle_agenda", { agendaItemId: item.id }, item.completed ? "A napirendi pont újranyitva." : "A napirendi pont teljesítve.")} disabled={locked} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check size={12} /></button>
                    ) : (
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${item.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check size={12} /></span>
                    )}
                    <button type="button" onClick={() => canEdit && void selectItem(item.id)} className={`min-w-0 flex-1 truncate text-left text-[11px] font-bold ${item.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.order}. {item.title}</button>
                    {(contentExists(item.discussionNotes) || contentExists(item.decisionSummary)) && <FileText size={12} className="shrink-0 text-indigo-500" aria-label="Van részletes tartalom" />}
                    {effectiveAgendaItemId === item.id && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-white">aktuális</span>}
                    {canEdit && (
                      <div className="flex shrink-0 gap-1">
                        {role === "organizer" && <button type="button" onClick={() => void run("toggle_agenda_shared", { agendaItemId: item.id, shared: !item.shared }, item.shared ? "A napirendi pont privát lett." : "A napirendi pont megosztva.")} disabled={locked} title={item.shared ? "Megosztott" : "Privát"} className={`rounded-lg p-1.5 ${item.shared ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.shared ? <Eye size={12} /> : <LockKeyhole size={12} />}</button>}
                        {role === "organizer" && <>
                          <button type="button" onClick={() => void run("move_agenda_item", { agendaItemId: item.id, direction: "up" }, "A sorrend módosítva.")} disabled={locked || index === 0} title="Fel" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-25"><ArrowUp size={12} /></button>
                          <button type="button" onClick={() => void run("move_agenda_item", { agendaItemId: item.id, direction: "down" }, "A sorrend módosítva.")} disabled={locked || index === visibleAgenda.length - 1} title="Le" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-25"><ArrowDown size={12} /></button>
                        </>}
                        <button type="button" onClick={() => { setEditingId(item.id); setEditingTitle(item.title); }} disabled={locked} title="Napirendi pont nevének szerkesztése" className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><Pencil size={12} /></button>
                        <button type="button" onClick={() => void removeItem(item.id, item.title)} disabled={locked || agenda.length <= 1} title="Törlés" className="rounded-lg border border-rose-200 p-1.5 text-rose-600 disabled:opacity-25"><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {currentItem && canEdit && (
            <div className="mt-3 overflow-hidden rounded-lg border border-indigo-300 bg-white">
              <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-indigo-700">Aktuális napirendi pont kidolgozása</div>
                    <div className="mt-1 text-[13px] font-black text-slate-950">{currentItem.order}. {currentItem.title}</div>
                    <div className="mt-1 text-[9px] leading-4 text-slate-600">Itt kell rögzíteni az adott pont előzményeit, a megbeszélés tartalmát, a döntést és a nyitott kérdéseket.</div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${contentDirty ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{contentSaving ? "Mentés..." : contentDirty ? "Automatikus mentésre vár" : "Mentve"}</span>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <label className="block">
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-700"><FileText size={13} /> Téma leírása / előkészítés</span>
                  <textarea value={description} onChange={(event) => changeContent(setDescription, event.target.value)} disabled={locked} rows={3} className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-800 outline-none focus:border-indigo-400 disabled:opacity-50" />
                </label>

                <label className="block">
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-sky-700"><MessageSquareText size={13} /> Egyeztetés részletes tartalma</span>
                  <textarea value={discussionNotes} onChange={(event) => changeContent(setDiscussionNotes, event.target.value)} disabled={locked} rows={7} className="mt-1 w-full resize-y rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-[11px] leading-5 text-slate-800 outline-none focus:border-sky-500 disabled:opacity-50" />
                </label>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <label className="block">
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700"><CheckCircle2 size={13} /> Döntés / eredmény</span>
                    <textarea value={decisionSummary} onChange={(event) => changeContent(setDecisionSummary, event.target.value)} disabled={locked} rows={5} className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-5 text-slate-800 outline-none focus:border-emerald-500 disabled:opacity-50" />
                  </label>
                  <label className="block">
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700"><CircleHelp size={13} /> Nyitott kérdések</span>
                    <textarea value={openQuestions} onChange={(event) => changeContent(setOpenQuestions, event.target.value)} disabled={locked} rows={5} className="mt-1 w-full resize-y rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] leading-5 text-slate-800 outline-none focus:border-amber-500 disabled:opacity-50" />
                  </label>
                </div>

                {role === "organizer" && (
                  <label className="block">
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-violet-700"><LockKeyhole size={13} /> Privát szervezői megjegyzés</span>
                    <textarea value={privateNotes} onChange={(event) => changeContent(setPrivateNotes, event.target.value)} disabled={locked} rows={3} placeholder="Belső ellenőrzési megjegyzés; a résztvevők és a nyilvános export nem látják." className="mt-1 w-full resize-y rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-[11px] leading-5 text-slate-800 outline-none focus:border-violet-500 disabled:opacity-50" />
                  </label>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="text-[9px] font-semibold text-slate-500">
                    Utolsó mentés: {currentItem.updatedAt ? new Date(currentItem.updatedAt).toLocaleString("hu-HU") : "-"} · {currentItem.updatedBy || "-"}
                  </div>
                  <button type="button" onClick={() => void saveContent()} disabled={locked || contentSaving || !contentDirty} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"><Save size={14} /> Mentés most</button>
                </div>
              </div>
            </div>
          )}

          {currentItem && canEdit && currentItem.isJoker && (
            <MeetingTopicBlocksEditor
              agendaItem={currentItem}
              workspace={workspace}
              role={role}
              locked={locked}
              postWorkspace={postWorkspace}
              setStatus={setStatus}
            />
          )}

          {currentItem && role === "participant" && (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-sky-700">Aktuális pont részletes tartalma</div>
              <div className="mt-1 text-[13px] font-black text-slate-950">{currentItem.order}. {currentItem.title}</div>
              {contentExists(currentItem.description) && <div className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{currentItem.description}</div>}
              {contentExists(currentItem.discussionNotes) && <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3"><div className="text-[9px] font-black uppercase text-sky-700">Egyeztetés tartalma</div><div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{currentItem.discussionNotes}</div></div>}
              {contentExists(currentItem.decisionSummary) && <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[9px] font-black uppercase text-emerald-700">Döntés / eredmény</div><div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{currentItem.decisionSummary}</div></div>}
              {contentExists(currentItem.openQuestions) && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-[9px] font-black uppercase text-amber-700">Nyitott kérdések</div><div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{currentItem.openQuestions}</div></div>}
              {currentItem.topicBlocks.length > 0 && <div className="mt-3 space-y-2">{currentItem.topicBlocks.slice().sort((a, b) => a.order - b.order).map((topic) => <div key={topic.id} className="rounded-lg border border-indigo-200 bg-white p-3"><div className="text-[10px] font-black text-indigo-800">{topic.order}. {topic.title}</div>{topic.background && <div className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-600"><b>Előzmény:</b> {topic.background}</div>}{topic.discussion && <div className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-700"><b>Egyeztetés:</b> {topic.discussion}</div>}{topic.decision && <div className="mt-2 rounded-md bg-emerald-50 p-2 text-[10px] leading-5 text-emerald-900"><b>Döntés:</b> {topic.decision}</div>}{topic.openQuestions && <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px] leading-5 text-amber-900"><b>Nyitott kérdés:</b> {topic.openQuestions}</div>}{topic.clientOpinion && <div className="mt-2 rounded-md bg-sky-50 p-2 text-[10px] leading-5 text-sky-900"><b>Megrendelői vélemény / jóváhagyás:</b> {topic.clientOpinion}</div>}</div>)}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
