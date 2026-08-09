"use client";

import { CalendarPlus, Loader2, MonitorUp, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { MeetingMode, MeetingProjectProfile } from "@/app/lib/meeting-assistant/types";

export type MeetingCreateDraft = {
  meetingMode: MeetingMode;
  title: string;
  meetingType: string;
  meetingTypeCode: string;
  documentKind: "reminder" | "minutes" | "meeting_note";
  documentLabel: string;
  scheduledStart: string;
  meetingLocation: string;
  chairpersonName: string;
  minuteTakerName: string;
  agendaTemplateKey: string;
};

const TYPES = [
  { value: "Általános egyeztetés", code: "ÁLT" },
  { value: "Kooperációs értekezlet", code: "KOOP" },
  { value: "Tervezői egyeztetés", code: "TERV" },
  { value: "Megrendelői egyeztetés", code: "MEGR" },
  { value: "Műszaki egyeztetés", code: "MŰSZ" },
  { value: "Helyszíni bejárás", code: "HELY" },
];

const DOCUMENTS = [
  { kind: "reminder" as const, label: "Egyeztetési emlékeztető" },
  { kind: "minutes" as const, label: "Értekezleti jegyzőkönyv" },
  { kind: "meeting_note" as const, label: "Értekezleti feljegyzés" },
];

export default function MeetingCreateModal({
  project,
  creating,
  errorMessage,
  onClose,
  onCreate,
}: {
  project: { id: string; code: string; name: string; location: string; profile?: MeetingProjectProfile };
  creating: boolean;
  errorMessage?: string;
  onClose: () => void;
  onCreate: (draft: MeetingCreateDraft) => void | Promise<void>;
}) {
  const [meetingMode, setMeetingMode] = useState<MeetingMode | "">("");
  const [title, setTitle] = useState(`${project.name} – egyeztetés`);
  const [meetingType, setMeetingType] = useState(project.profile?.defaultMeetingType || "Általános egyeztetés");
  const [documentKind, setDocumentKind] = useState<MeetingCreateDraft["documentKind"]>("reminder");
  const [scheduledStart, setScheduledStart] = useState("");
  const [meetingLocation, setMeetingLocation] = useState(project.location || "");
  const [chairpersonName, setChairpersonName] = useState(project.profile?.projectManager || "");
  const [minuteTakerName, setMinuteTakerName] = useState("Szervező");
  const [agendaTemplateKey, setAgendaTemplateKey] = useState("quick_general");

  const valid = useMemo(
    () => Boolean(meetingMode) && title.trim().length >= 3 && meetingType.trim().length >= 2,
    [meetingMode, meetingType, title],
  );

  function selectMode(mode: MeetingMode) {
    setMeetingMode(mode);
    setMeetingLocation((current) => {
      if (mode === "teams" && (!current.trim() || current === project.location)) return "Microsoft Teams";
      if (mode === "in_person" && (!current.trim() || current === "Microsoft Teams")) return project.location || "";
      return current;
    });
  }

  function submit() {
    if (!meetingMode) return;
    const selectedType = TYPES.find((item) => item.value === meetingType) || { value: meetingType, code: "EGY" };
    const selectedDocument = DOCUMENTS.find((item) => item.kind === documentKind) || DOCUMENTS[0];
    void onCreate({
      meetingMode,
      title: title.trim(),
      meetingType: selectedType.value,
      meetingTypeCode: selectedType.code,
      documentKind,
      documentLabel: selectedDocument.label,
      scheduledStart,
      meetingLocation: meetingLocation.trim(),
      chairpersonName: chairpersonName.trim(),
      minuteTakerName: minuteTakerName.trim(),
      agendaTemplateKey,
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Új értekezlet létrehozása">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-200 p-5 sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800"><CalendarPlus size={24} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-950">Új értekezlet létrehozása</h2>
            <p className="mt-1 text-sm text-slate-500">{project.code} · {project.name}</p>
          </div>
          <button type="button" onClick={onClose} title="Bezárás" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {errorMessage && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800">{errorMessage}</div>}

          <section>
            <div className="text-sm font-black text-slate-900">1. Válaszd ki az értekezlet módját</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectMode("teams")}
                className={`rounded-2xl border p-4 text-left transition ${meetingMode === "teams" ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-sky-300"}`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800"><MonitorUp size={20} /></span>
                <span className="mt-3 block text-sm font-black text-slate-950">Microsoft Teams értekezlet</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">Teams-kapcsolat, Graph átiratimport, meghívottak, jelenléti jelentés és Teams-stage funkciók.</span>
              </button>
              <button
                type="button"
                onClick={() => selectMode("in_person")}
                className={`rounded-2xl border p-4 text-left transition ${meetingMode === "in_person" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-300"}`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><UsersRound size={20} /></span>
                <span className="mt-3 block text-sm font-black text-slate-950">Személyes értekezlet</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">DIMPRO mikrofonrögzítés, médiafeltöltés, beszélőkre bontott átírás és kézi résztvevőkezelés.</span>
              </button>
            </div>
          </section>

          {meetingMode && (
            <section className="mt-6 border-t border-slate-200 pt-5">
              <div className="mb-4 text-sm font-black text-slate-900">2. Add meg az értekezlet alapadatait</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-700 sm:col-span-2">Értekezlet címe *<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-indigo-500" /></label>
                <label className="text-sm font-black text-slate-700">Értekezlet típusa<select value={meetingType} onChange={(event) => setMeetingType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500">{TYPES.map((item) => <option key={item.code} value={item.value}>{item.value}</option>)}</select></label>
                <label className="text-sm font-black text-slate-700">Dokumentumforma<select value={documentKind} onChange={(event) => setDocumentKind(event.target.value as MeetingCreateDraft["documentKind"])} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500">{DOCUMENTS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label>
                <label className="text-sm font-black text-slate-700">Tervezett időpont<input type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500" /></label>
                <label className="text-sm font-black text-slate-700">{meetingMode === "teams" ? "Teams-kapcsolat / helyszín" : "Helyszín / tárgyaló"}<input value={meetingLocation} onChange={(event) => setMeetingLocation(event.target.value)} maxLength={240} placeholder={meetingMode === "teams" ? "Microsoft Teams" : "Tárgyaló vagy helyszín"} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500" /></label>
                <label className="text-sm font-black text-slate-700">Értekezletvezető<input value={chairpersonName} onChange={(event) => setChairpersonName(event.target.value)} maxLength={180} placeholder="Név" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500" /></label>
                <label className="text-sm font-black text-slate-700">Jegyzőkönyvvezető<input value={minuteTakerName} onChange={(event) => setMinuteTakerName(event.target.value)} maxLength={180} placeholder="Név" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500" /></label>
                <label className="text-sm font-black text-slate-700 sm:col-span-2">Kezdő napirendi sablon<select value={agendaTemplateKey} onChange={(event) => setAgendaTemplateKey(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500"><option value="quick_general">Gyors általános egyeztetés – egy rugalmas napirendi pont</option><option value="weekly_coordination">Építési kooperáció – előkészített témakörök</option><option value="design_coordination">Tervezői egyeztetés</option><option value="blank">Üres napirend</option></select></label>
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">Mégse</button>
          <button type="button" onClick={submit} disabled={!valid || creating} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{creating ? <Loader2 size={17} className="animate-spin" /> : <CalendarPlus size={17} />} Értekezlet létrehozása és megnyitása</button>
        </footer>
      </div>
    </div>
  );
}
