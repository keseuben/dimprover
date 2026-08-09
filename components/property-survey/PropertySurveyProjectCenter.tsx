"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  FileImage,
  FolderKanban,
  FolderPlus,
  MapPin,
  Plus,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  PropertySurveyMode,
  PropertySurveyStartMode,
  PropertySurveyWorkspace,
} from "@/components/property-survey/propertySurveyWorkspaceTypes";
import { surveySourceModeLabels, type PropertySurveySourceMode } from "@/components/property-survey/propertySurveyPlanDocumentTypes";

type PropertySurveyProjectCenterProps = {
  workspace: PropertySurveyWorkspace;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (input: { name: string; code?: string; location?: string; clientName?: string; note?: string }) => void;
  onCreateSurvey: (input: { projectId: string; name: string; surveyMode: PropertySurveyMode; startMode: PropertySurveyStartMode; sourceMode: PropertySurveySourceMode }) => void;
  onOpenSurvey: (surveyId: string) => void;
};

const surveyModes: PropertySurveyMode[] = [
  "Energetikai felmérés",
  "Épület- és csarnokfelmérés",
  "Térbeton- és burkolatfelmérés",
  "Felújítási felmérés",
  "Műszaki állapotfelmérés",
  "Gyors alaprajz",
];

const startModes: Array<{
  id: PropertySurveyStartMode;
  title: string;
  description: string;
  icon: typeof ScanLine;
  ready: boolean;
}> = [
  { id: "blank", title: "Üres alaprajz", description: "Kézi helyiségrajzolás tiszta munkalapon.", icon: Plus, ready: true },
  { id: "sample", title: "Mintafelmérés", description: "Kitöltött családi ház mintával kipróbálható.", icon: Sparkles, ready: true },
  { id: "lidar", title: "LiDAR / RoomPlan", description: "Natív iPad kapcsolat előkészítve, még nem aktív.", icon: ScanLine, ready: false },
  { id: "import", title: "PDF tervdokumentáció", description: "Többoldalas PDF feltöltése, kivágása, kalibrálása és overlay-geometria.", icon: Upload, ready: true },
];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function PropertySurveyProjectCenter({
  workspace,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onCreateSurvey,
  onOpenSurvey,
}: PropertySurveyProjectCenterProps) {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", code: "", location: "", clientName: "", note: "" });
  const [surveyForm, setSurveyForm] = useState<{ name: string; surveyMode: PropertySurveyMode; startMode: PropertySurveyStartMode; sourceMode: PropertySurveySourceMode }>({
    name: "Új energetikai ingatlanfelmérés",
    surveyMode: "Energetikai felmérés",
    startMode: "blank",
    sourceMode: "site",
  });

  const selectedProject = workspace.projects.find((project) => project.id === selectedProjectId) || workspace.projects[0] || null;
  const selectedSurveys = useMemo(
    () => workspace.surveys.filter((survey) => survey.projectId === selectedProject?.id).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [selectedProject?.id, workspace.surveys],
  );

  function submitProject() {
    if (!projectForm.name.trim()) return;
    onCreateProject(projectForm);
    setProjectForm({ name: "", code: "", location: "", clientName: "", note: "" });
    setProjectModalOpen(false);
  }

  function submitSurvey() {
    if (!selectedProject || !surveyForm.name.trim()) return;
    const selectedStart = startModes.find((item) => item.id === surveyForm.startMode);
    if (!selectedStart?.ready) return;
    if (surveyForm.sourceMode !== "site" && surveyForm.startMode !== "import") return;
    if (surveyForm.sourceMode === "site" && surveyForm.startMode === "import") return;
    onCreateSurvey({ projectId: selectedProject.id, ...surveyForm });
    setSurveyModalOpen(false);
  }

  const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-6">
      <section className="rounded-[2rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800"><FolderKanban size={14} /> Projektközpont</div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[var(--survey-text)]">Felmérési projektek</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--survey-muted)]">Először hozz létre egy projektet, majd azon belül egy vagy több külön ingatlanfelmérést. Egy projekthez energetikai, épület- és csarnok-, térbeton-, felújítási és műszaki állapotfelmérés is kapcsolható.</p>
          </div>
          <button type="button" onClick={() => setProjectModalOpen(true)} className="survey-action-primary shrink-0"><FolderPlus size={18} /> Új projekt</button>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <div><div className="text-xs font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]">Projektek</div><div className="mt-1 text-[11px] font-bold text-[var(--survey-muted)]">{workspace.projects.length} db</div></div>
              <button type="button" onClick={() => setProjectModalOpen(true)} className="survey-icon-button" aria-label="Új projekt"><Plus size={17} /></button>
            </div>
            <div className="grid max-h-[540px] gap-2 overflow-y-auto pr-1">
              {workspace.projects.length ? workspace.projects.map((project) => {
                const active = project.id === selectedProject?.id;
                const count = workspace.surveys.filter((survey) => survey.projectId === project.id).length;
                return (
                  <button key={project.id} type="button" onClick={() => onSelectProject(project.id)} className={`rounded-2xl border p-3 text-left transition ${active ? "border-cyan-400 bg-cyan-50 text-slate-950 shadow-sm" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-text)] hover:border-cyan-300"}`}>
                    <div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-cyan-100 text-cyan-800" : "bg-[var(--survey-panel-strong)] text-[var(--survey-muted)]"}`}><Building2 size={19} /></span><div className="min-w-0 flex-1"><div className="truncate text-sm font-black">{project.name}</div><div className={`mt-1 truncate text-[10px] font-bold uppercase ${active ? "text-slate-600" : "text-[var(--survey-muted)]"}`}>{project.code} · {count} felmérés</div>{project.location ? <div className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${active ? "text-slate-600" : "text-[var(--survey-muted)]"}`}><MapPin size={11} /> {project.location}</div> : null}</div></div>
                  </button>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-[var(--survey-border)] bg-[var(--survey-panel)] p-5 text-center"><FolderKanban className="mx-auto text-cyan-600" size={30} /><div className="mt-3 text-sm font-black text-[var(--survey-text)]">Még nincs projekt</div><div className="mt-1 text-xs font-semibold leading-5 text-[var(--survey-muted)]">Az első energetikai, épület- vagy műszaki felmérés előtt hozz létre egy projektet.</div><button type="button" onClick={() => setProjectModalOpen(true)} className="survey-action-primary mt-4 w-full"><FolderPlus size={17} /> Első projekt</button></div>
              )}
            </div>
          </aside>

          <section className="min-w-0 rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-4 sm:p-5">
            {selectedProject ? (
              <>
                <div className="flex flex-col gap-4 border-b border-[var(--survey-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">{selectedProject.code}</div><h2 className="mt-1 text-2xl font-black text-[var(--survey-text)]">{selectedProject.name}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[var(--survey-muted)]">{selectedProject.location ? <span className="inline-flex items-center gap-1"><MapPin size={13} /> {selectedProject.location}</span> : null}{selectedProject.clientName ? <span>Megrendelő: {selectedProject.clientName}</span> : null}</div></div>
                  <button type="button" onClick={() => setSurveyModalOpen(true)} className="survey-action-primary shrink-0"><Plus size={18} /> Új felmérés</button>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-black text-[var(--survey-text)]">Kapcsolódó felmérések</div><div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">{selectedSurveys.length} felmérés a projekten belül</div></div></div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedSurveys.length ? selectedSurveys.map((survey) => (
                      <button key={survey.id} type="button" onClick={() => onOpenSurvey(survey.id)} className="group rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-lg">
                        <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">{survey.startMode === "sample" ? <Sparkles size={20} /> : <FileImage size={20} />}</span><span className="rounded-full border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-2 py-1 text-[9px] font-black uppercase text-[var(--survey-muted)]">{survey.status === "completed" ? "Lezárt" : "Folyamatban"}</span></div>
                        <div className="mt-4 text-base font-black text-[var(--survey-text)]">{survey.name}</div>
                        <div className="mt-1 text-xs font-semibold text-[var(--survey-muted)]">{survey.surveyMode}</div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--survey-border)] pt-3 text-[10px] font-bold text-[var(--survey-muted)]"><span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {formatDate(survey.updatedAt)}</span><span className="inline-flex items-center gap-1 font-black text-cyan-700">Megnyitás <ArrowRight size={13} /></span></div>
                      </button>
                    )) : (
                      <div className="col-span-full rounded-2xl border border-dashed border-cyan-300 bg-cyan-50 p-6 text-center text-slate-950"><ScanLine className="mx-auto text-cyan-700" size={34} /><div className="mt-3 text-base font-black">Még nincs felmérés</div><div className="mt-1 text-sm font-semibold text-slate-600">Hozd létre az első felmérést, majd válassz üres alaprajzot vagy mintafelmérést.</div><button type="button" onClick={() => setSurveyModalOpen(true)} className="survey-action-primary mt-4"><Plus size={17} /> Első felmérés létrehozása</button></div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="grid min-h-[420px] place-items-center text-center"><div><FolderKanban className="mx-auto text-cyan-600" size={46} /><div className="mt-4 text-xl font-black text-[var(--survey-text)]">Kezdd egy projekttel</div><p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--survey-muted)]">A projekt fogja össze az ugyanahhoz az ingatlanhoz, csarnokhoz vagy beruházáshoz tartozó energetikai, épület-, térbeton-, felújítási és műszaki felméréseket.</p><button type="button" onClick={() => setProjectModalOpen(true)} className="survey-action-primary mt-5"><FolderPlus size={18} /> Új projekt létrehozása</button></div></div>
            )}
          </section>
        </div>
      </section>

      {projectModalOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Új felmérési projekt">
          <div className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start gap-4 border-b border-slate-200 p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-100 text-cyan-800"><FolderPlus size={23} /></span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950">Új projekt létrehozása</h2><p className="mt-1 text-sm font-semibold text-slate-500">A projekten belül több külön ingatlanfelmérés készíthető.</p></div><button type="button" onClick={() => setProjectModalOpen(false)} className="survey-icon-button text-slate-700"><X size={18} /></button></header>
            <div className="grid gap-4 p-5"><input className={inputClass} value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} placeholder="Projekt neve *" autoFocus /><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} value={projectForm.code} onChange={(event) => setProjectForm((current) => ({ ...current, code: event.target.value }))} placeholder="Projektkód" /><input className={inputClass} value={projectForm.location} onChange={(event) => setProjectForm((current) => ({ ...current, location: event.target.value }))} placeholder="Település / helyszín" /></div><input className={inputClass} value={projectForm.clientName} onChange={(event) => setProjectForm((current) => ({ ...current, clientName: event.target.value }))} placeholder="Megrendelő / tulajdonos" /><textarea className="min-h-24 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500" value={projectForm.note} onChange={(event) => setProjectForm((current) => ({ ...current, note: event.target.value }))} placeholder="Projekt megjegyzés" /></div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={() => setProjectModalOpen(false)} className="survey-action-secondary text-slate-700">Mégse</button><button type="button" onClick={submitProject} disabled={!projectForm.name.trim()} className="survey-action-primary disabled:opacity-40"><FolderPlus size={17} /> Projekt létrehozása</button></footer>
          </div>
        </div>
      ) : null}

      {surveyModalOpen && selectedProject ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Új felmérés">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start gap-4 border-b border-slate-200 p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-100 text-teal-800"><ScanLine size={23} /></span><div className="min-w-0 flex-1"><h2 className="text-xl font-black text-slate-950">Új felmérés</h2><p className="mt-1 text-sm font-semibold text-slate-500">Projekt: {selectedProject.name}</p></div><button type="button" onClick={() => setSurveyModalOpen(false)} className="survey-icon-button text-slate-700"><X size={18} /></button></header>
            <div className="grid gap-5 p-5"><div><div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Felmérés megnevezése</div><input className={inputClass} value={surveyForm.name} onChange={(event) => setSurveyForm((current) => ({ ...current, name: event.target.value }))} /></div><div><div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Felmérési mód</div><select className={inputClass} value={surveyForm.surveyMode} onChange={(event) => { const surveyMode = event.target.value as PropertySurveyMode; setSurveyForm((current) => ({ ...current, surveyMode, name: current.name.startsWith("Új ") ? (surveyMode === "Épület- és csarnokfelmérés" ? "Új épület- és csarnokfelmérés" : surveyMode === "Térbeton- és burkolatfelmérés" ? "Új térbeton- és burkolatfelmérés" : surveyMode === "Energetikai felmérés" ? "Új energetikai ingatlanfelmérés" : `Új ${surveyMode.toLocaleLowerCase("hu-HU")}`) : current.name })); }}>{surveyModes.map((mode) => <option key={mode}>{mode}</option>)}</select></div><div><div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Felmérés forrása / projektmód</div><div className="grid gap-3 lg:grid-cols-3">{(Object.entries(surveySourceModeLabels) as Array<[PropertySurveySourceMode, string]>).map(([sourceMode, label]) => { const selected = surveyForm.sourceMode === sourceMode; const descriptions: Record<PropertySurveySourceMode, string> = { site: "Helyszíni bejárás, mérés és kézi alaprajz.", designPlan: "Új építés vagy tervből feldolgozható ingatlan PDF-tervlap alapján.", asBuiltPlan: "Megvalósulási PDF-dokumentáció alapján, korábbi modellek megtartásával." }; return <button key={sourceMode} type="button" onClick={() => setSurveyForm((current) => ({ ...current, sourceMode, startMode: sourceMode === "site" ? "blank" : "import", name: current.name.startsWith("Új ") ? (sourceMode === "site" ? "Új energetikai ingatlanfelmérés" : sourceMode === "designPlan" ? "Új tervdokumentáció alapú felmérés" : "Új megvalósulási dokumentáció alapú felmérés") : current.name }))} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200" : "border-slate-200 bg-white hover:border-cyan-300"}`}><div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600"}`}>{sourceMode === "site" ? <ScanLine size={19} /> : <FileImage size={19} />}</span>{selected ? <span className="rounded-full bg-cyan-700 px-2 py-1 text-[9px] font-black uppercase text-white">Kiválasztva</span> : null}</div><div className="mt-3 text-sm font-black text-slate-950">{label}</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{descriptions[sourceMode]}</div></button>; })}</div></div><div><div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Hogyan induljon az alaprajz?</div><div className="grid gap-3 sm:grid-cols-2">{startModes.map((mode) => { const Icon = mode.icon; const selected = surveyForm.startMode === mode.id; const available = mode.ready && (surveyForm.sourceMode === "site" ? mode.id !== "import" : mode.id === "import"); return <button key={mode.id} type="button" disabled={!available} onClick={() => setSurveyForm((current) => ({ ...current, startMode: mode.id }))} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200" : "border-slate-200 bg-white hover:border-cyan-300"} disabled:cursor-not-allowed disabled:opacity-55`}><div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${selected ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600"}`}><Icon size={19} /></span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${mode.ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{available ? "Használható" : mode.ready ? "Más projektmód" : "Előkészítve"}</span></div><div className="mt-3 text-sm font-black text-slate-950">{mode.title}</div><div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{mode.description}</div></button>; })}</div></div></div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4"><button type="button" onClick={() => setSurveyModalOpen(false)} className="survey-action-secondary text-slate-700">Mégse</button><button type="button" onClick={submitSurvey} disabled={!surveyForm.name.trim() || !startModes.find((item) => item.id === surveyForm.startMode)?.ready || (surveyForm.sourceMode !== "site" ? surveyForm.startMode !== "import" : surveyForm.startMode === "import")} className="survey-action-primary disabled:opacity-40"><Plus size={17} /> Felmérés létrehozása</button></footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
