"use client";

import { useMemo, useState } from "react";
import { EventTextarea } from "./EventShell";
import type { EventFamilyTreeLevel, EventFamilyTreeNote, EventFamilyTreePerson, EventFamilyTreePersonDraft, EventFamilyTreeRelationType, EventFamilyTreeViewMode, EventPerson } from "./types";

type FamilyTreePanelProps = {
  people: EventFamilyTreePerson[];
  notes: EventFamilyTreeNote[];
  activePerson: EventPerson;
  onAddPerson: (draft: EventFamilyTreePersonDraft) => void;
  onMovePerson: (personId: number, level: EventFamilyTreeLevel, column: number) => void;
  onDeletePerson: (personId: number) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (noteId: number) => void;
};

const EMPTY_PERSON_DRAFT: EventFamilyTreePersonDraft = {
  name: "",
  nickname: "",
  relationType: "rokon",
  relationToMama: "",
  relationToApu: "",
  level: "descendant",
  highlightedFor: "both",
};

const relationOptions: { value: EventFamilyTreeRelationType; label: string }[] = [
  { value: "felmeno", label: "Felmenő" },
  { value: "szulo", label: "Szülő" },
  { value: "hazastars", label: "Házastárs / pár" },
  { value: "gyermek", label: "Gyermek" },
  { value: "testver", label: "Testvér" },
  { value: "unoka", label: "Unoka" },
  { value: "rokon", label: "Rokon" },
  { value: "egyeb", label: "Egyéb" },
];

function ownerLabel(note: EventFamilyTreeNote) {
  return `${note.ownerGroupName ? `${note.ownerGroupName} – ` : ""}${note.ownerFullName || note.owner}${note.ownerNickname ? ` (${note.ownerNickname})` : ""}`;
}

function creatorLabel(person: EventFamilyTreePerson) {
  return `${person.createdByGroupName ? `${person.createdByGroupName} – ` : ""}${person.createdByFullName || "Rendszer"}${person.createdByNickname ? ` (${person.createdByNickname})` : ""}`;
}

function formatDate(value?: string) {
  if (!value) return "Időpont nincs rögzítve";
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function relationLabel(value: EventFamilyTreeRelationType) {
  return relationOptions.find((option) => option.value === value)?.label ?? "Rokon";
}

function levelLabel(level: EventFamilyTreeLevel) {
  if (level === "ancestor") return "Felmenők";
  if (level === "center") return "Központi személyek";
  return "Leszármazottak / rokonágak";
}

export default function FamilyTreePanel({ people, notes, activePerson, onAddPerson, onMovePerson, onDeletePerson, onAddNote, onDeleteNote }: FamilyTreePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<EventFamilyTreeViewMode>("mama");
  const [noteText, setNoteText] = useState("");
  const [personDraft, setPersonDraft] = useState<EventFamilyTreePersonDraft>(EMPTY_PERSON_DRAFT);
  const [draggedPersonId, setDraggedPersonId] = useState<number | null>(null);

  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.column - b.column || a.name.localeCompare(b.name, "hu-HU")), [people]);

  function savePerson() {
    if (!personDraft.name.trim()) return;
    onAddPerson(personDraft);
    setPersonDraft(EMPTY_PERSON_DRAFT);
  }

  function saveNote() {
    if (!noteText.trim()) return;
    onAddNote(noteText.trim());
    setNoteText("");
  }

  function dropToLevel(level: EventFamilyTreeLevel) {
    if (!draggedPersonId) return;
    onMovePerson(draggedPersonId, level, people.filter((person) => person.level === level).length);
    setDraggedPersonId(null);
  }

  function relationText(person: EventFamilyTreePerson) {
    return viewMode === "mama" ? person.relationToMama : person.relationToApu;
  }

  return (
    <section id="csaladfa" className="rounded-[28px] border border-emerald-100 bg-white/95 p-5 shadow-md shadow-emerald-100/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-500">Közös családi extra</p>
          <h2 className="mt-1 text-xl font-black text-slate-800">Családfa készítő</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Konkrét személydobozok, kapcsolat típusa, Mama/Apu központú nézet és átrendezhető családfa-sávok.</p>
        </div>
        <button onClick={() => setIsOpen(true)} className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-500">Családfa készítő megnyitása</button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-emerald-100 bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-500">Teljes ablakos szerkesztő</p><h2 className="mt-1 text-2xl font-black text-slate-800">Családfa készítő</h2></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setViewMode("mama")} className={`rounded-2xl px-4 py-3 text-sm font-black ${viewMode === "mama" ? "bg-rose-400 text-white" : "border border-rose-100 bg-white text-rose-700"}`}>Mama központú</button>
                <button onClick={() => setViewMode("apu")} className={`rounded-2xl px-4 py-3 text-sm font-black ${viewMode === "apu" ? "bg-sky-400 text-white" : "border border-sky-100 bg-white text-sky-700"}`}>Apu központú</button>
                <button onClick={() => setIsOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">Bezárás</button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[1.35fr_0.65fr]">
              <div className="min-h-0 overflow-auto bg-emerald-50/35 p-5">
                <div className="min-w-[860px] rounded-[28px] bg-white p-6 shadow-sm">
                  <DropLevel level="ancestor" title="Felmenők / szülők / nagyszülők" people={sortedPeople.filter((p) => p.level === "ancestor")} viewMode={viewMode} draggedPersonId={draggedPersonId} onDragStart={setDraggedPersonId} onDropLevel={dropToLevel} relationText={relationText} onDeletePerson={onDeletePerson} />
                  <Connector />
                  <DropLevel level="center" title="Központi személyek" people={sortedPeople.filter((p) => p.level === "center")} viewMode={viewMode} draggedPersonId={draggedPersonId} onDragStart={setDraggedPersonId} onDropLevel={dropToLevel} relationText={relationText} onDeletePerson={onDeletePerson} />
                  <Connector />
                  <DropLevel level="descendant" title="Gyermekek / unokák / rokonágak" people={sortedPeople.filter((p) => p.level === "descendant")} viewMode={viewMode} draggedPersonId={draggedPersonId} onDragStart={setDraggedPersonId} onDropLevel={dropToLevel} relationText={relationText} onDeletePerson={onDeletePerson} />
                </div>
              </div>

              <aside className="min-h-0 overflow-auto border-t border-slate-100 bg-white p-5 xl:border-l xl:border-t-0">
                <h3 className="text-xl font-black text-slate-800">Személydoboz hozzáadása</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">Rögzítő: <strong>{activePerson.groupName} – {activePerson.fullName}</strong></p>
                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <FormInput label="Név" value={personDraft.name} onChange={(value) => setPersonDraft({ ...personDraft, name: value })} />
                  <FormInput label="Becenév" value={personDraft.nickname} onChange={(value) => setPersonDraft({ ...personDraft, nickname: value })} />
                  <SelectField label="Kapcsolat típusa" value={personDraft.relationType} onChange={(value) => setPersonDraft({ ...personDraft, relationType: value as EventFamilyTreeRelationType })} options={relationOptions} />
                  <SelectField label="Családfa sáv" value={personDraft.level} onChange={(value) => setPersonDraft({ ...personDraft, level: value as EventFamilyTreeLevel })} options={[{ value: "ancestor", label: "Felmenők" }, { value: "center", label: "Központi személyek" }, { value: "descendant", label: "Leszármazottak / rokonágak" }]} />
                  <FormInput label="Kapcsolat Mamához" value={personDraft.relationToMama} onChange={(value) => setPersonDraft({ ...personDraft, relationToMama: value })} />
                  <FormInput label="Kapcsolat Apuhoz" value={personDraft.relationToApu} onChange={(value) => setPersonDraft({ ...personDraft, relationToApu: value })} />
                  <SelectField label="Kiemelés nézetben" value={personDraft.highlightedFor} onChange={(value) => setPersonDraft({ ...personDraft, highlightedFor: value as EventFamilyTreePersonDraft["highlightedFor"] })} options={[{ value: "both", label: "Mindkettő" }, { value: "mama", label: "Mama központú" }, { value: "apu", label: "Apu központú" }]} />
                  <button onClick={savePerson} className="mt-4 w-full rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-white hover:bg-emerald-500">Személydoboz hozzáadása</button>
                </div>

                <h3 className="mt-6 text-xl font-black text-slate-800">Hozzáírás / pontosítás</h3>
                <div className="mt-3 rounded-3xl border border-amber-100 bg-amber-50/70 p-4"><EventTextarea label="Családfa információ" value={noteText} onChange={setNoteText} rows={4} /><button onClick={saveNote} className="mt-4 w-full rounded-2xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-800 hover:bg-amber-400">Családfa információ mentése</button></div>
                <div className="mt-5 space-y-3">{notes.length === 0 && <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">Még nincs családfa-hozzáírás.</p>}{notes.map((note) => <NoteCard key={note.id} note={note} onDeleteNote={onDeleteNote} />)}</div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DropLevel({ level, title, people, viewMode, draggedPersonId, onDragStart, onDropLevel, relationText, onDeletePerson }: { level: EventFamilyTreeLevel; title: string; people: EventFamilyTreePerson[]; viewMode: EventFamilyTreeViewMode; draggedPersonId: number | null; onDragStart: (id: number | null) => void; onDropLevel: (level: EventFamilyTreeLevel) => void; relationText: (person: EventFamilyTreePerson) => string; onDeletePerson: (personId: number) => void; }) {
  return <section onDragOver={(e) => e.preventDefault()} onDrop={() => onDropLevel(level)} className={`rounded-3xl border-2 border-dashed p-4 ${draggedPersonId ? "border-amber-300 bg-amber-50/60" : "border-slate-100 bg-slate-50/60"}`}><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{levelLabel(level)}</p><h3 className="mt-1 text-lg font-black text-slate-800">{title}</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 shadow-sm">{people.length} doboz</span></div><div className="grid grid-cols-3 gap-3">{people.length === 0 && <div className="col-span-3 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-400">Ide húzható személydoboz</div>}{people.map((person) => <PersonBox key={person.id} person={person} viewMode={viewMode} relation={relationText(person)} onDragStart={onDragStart} onDeletePerson={onDeletePerson} />)}</div></section>;
}

function PersonBox({ person, viewMode, relation, onDragStart, onDeletePerson }: { person: EventFamilyTreePerson; viewMode: EventFamilyTreeViewMode; relation: string; onDragStart: (id: number | null) => void; onDeletePerson: (personId: number) => void; }) {
  const highlighted = person.highlightedFor === "both" || person.highlightedFor === viewMode;
  return <div draggable={!person.locked} onDragStart={() => onDragStart(person.id)} onDragEnd={() => onDragStart(null)} className={`group relative rounded-2xl border p-4 shadow-sm ${highlighted ? "bg-white ring-2 ring-amber-200" : "bg-slate-50 opacity-75"} ${person.locked ? "cursor-default" : "cursor-grab"}`}><p className="font-black text-slate-800">{person.name}</p>{person.nickname && <p className="mt-1 text-xs font-bold text-slate-500">{person.nickname}</p>}<p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{relationLabel(person.relationType)}</p><p className="mt-2 text-xs font-semibold text-slate-600">{relation || "-"}</p>{person.locked ? <p className="mt-2 text-xs font-black text-rose-600">Központi doboz</p> : <div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-400">Húzható</p><button type="button" onClick={(event) => { event.stopPropagation(); onDeletePerson(person.id); }} className="rounded-xl border border-red-100 bg-red-50 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100">Törlés</button></div>}<div className="pointer-events-none absolute left-3 top-3 hidden w-72 rounded-2xl border border-slate-100 bg-white p-3 text-left text-xs shadow-xl group-hover:block"><p className="font-black text-slate-700">Személydoboz adatai</p><p className="mt-1 text-slate-500">Rögzítő: {creatorLabel(person)}</p><p className="text-slate-500">Rögzítés: {formatDate(person.createdAt)}</p>{person.updatedAt && <p className="text-slate-500">Utolsó rendezés: {formatDate(person.updatedAt)}</p>}<p className="mt-2 text-slate-500">Mama kapcsolat: {person.relationToMama || "-"}</p><p className="text-slate-500">Apu kapcsolat: {person.relationToApu || "-"}</p></div></div>;
}

function NoteCard({ note, onDeleteNote }: { note: EventFamilyTreeNote; onDeleteNote: (noteId: number) => void }) {
  return <div className="group relative rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm shadow-sm"><div className="flex items-start justify-between gap-2"><p className="font-bold text-emerald-700">{ownerLabel(note)}</p><button type="button" onClick={() => onDeleteNote(note.id)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100">Törlés</button></div><p className="mt-1 whitespace-pre-line text-slate-700">{note.text}</p><p className="mt-2 text-xs font-semibold text-slate-400">Részletek: vidd fölé az egeret</p><div className="pointer-events-none absolute right-3 top-3 hidden w-64 rounded-2xl border border-slate-100 bg-white p-3 text-left text-xs shadow-xl group-hover:block"><p className="font-black text-slate-700">Rögzítési adatok</p><p className="mt-1 text-slate-500">Rögzítő: {ownerLabel(note)}</p><p className="text-slate-500">Időpont: {formatDate(note.createdAt)}</p></div></div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="mt-3 block text-sm font-semibold text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-slate-800 outline-none focus:border-emerald-300">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Connector() { return <div className="mx-auto my-4 h-10 w-px bg-slate-200" />; }

function FormInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-3 block text-sm font-semibold text-slate-700">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-slate-800 outline-none focus:border-emerald-300" /></label>; }