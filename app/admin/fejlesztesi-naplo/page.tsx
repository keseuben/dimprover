"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DevNotesAiAssistant from "@/components/admin/DevNotesAiAssistant";
import {
  Archive,
  ArrowLeft,
  ClipboardCopy,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

type DevNoteType =
  | "idea"
  | "decision"
  | "task"
  | "bug"
  | "fix"
  | "module_plan"
  | "ai_context"
  | "coding_instruction"
  | "release_note"
  | "saved_for_later";

type DevNoteStatus =
  | "new"
  | "reviewing"
  | "ready_for_coding"
  | "in_progress"
  | "testing"
  | "done"
  | "deferred"
  | "withdrawn"
  | "archived";

type DevNotePriority = "low" | "normal" | "high" | "critical";

type DevNote = {
  id: string;
  title: string;
  type: DevNoteType;
  status: DevNoteStatus;
  module: string;
  priority: DevNotePriority;
  summary: string;
  description: string;
  codingInstruction: string;
  aiContext: string;
  source: string;
  tags: string[];
  relatedFiles: string;
  nextStep: string;
  surfaces: string[];
  epic: string;
  relatedNoteIds: string[];
  dependencies: string;
  blockers: string;
  crossChatStatus: string;
  externalAiNote: string;
  handoffSummary: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

type Option<T extends string = string> = {
  id: T;
  label: string;
};

type DevNoteLite = Pick<
  DevNote,
  "id" | "title" | "module" | "type" | "status" | "priority" | "epic" | "surfaces" | "updatedAt"
>;

type DevNoteOptions = {
  types: Option<DevNoteType>[];
  statuses: Option<DevNoteStatus>[];
  priorities: Option<DevNotePriority>[];
  modules: string[];
  surfaces: string[];
  epics: string[];
};

type DevNotesResponse = {
  ok: boolean;
  error?: string;
  store?: {
    version: 1;
    updatedAt: string;
    notes: DevNote[];
  };
  allCount?: number;
  filteredCount?: number;
  activeCount?: number;
  archivedCount?: number;
  affectedNote?: DevNote;
  allNotes?: DevNoteLite[];
  options?: DevNoteOptions;
  storage?: {
    file: string;
  };
};

type Filters = {
  search: string;
  type: string;
  status: string;
  module: string;
  priority: string;
  surface: string;
  epic: string;
  includeArchived: boolean;
};

type Draft = Omit<DevNote, "id" | "createdAt" | "updatedAt" | "archivedAt">;

const defaultOptions: DevNoteOptions = {
  types: [
    { id: "idea", label: "Ötlet" },
    { id: "decision", label: "Fejlesztési döntés" },
    { id: "task", label: "Feladat" },
    { id: "bug", label: "Hiba" },
    { id: "fix", label: "Javítás" },
    { id: "module_plan", label: "Modulterv" },
    { id: "ai_context", label: "AI kontextus" },
    { id: "coding_instruction", label: "Kódolási utasítás" },
    { id: "release_note", label: "Release megjegyzés" },
    { id: "saved_for_later", label: "Későbbre mentve" },
  ],
  statuses: [
    { id: "new", label: "Új" },
    { id: "reviewing", label: "Átgondolás alatt" },
    { id: "ready_for_coding", label: "Kódolásra vár" },
    { id: "in_progress", label: "Folyamatban" },
    { id: "testing", label: "Tesztelés alatt" },
    { id: "done", label: "Kész" },
    { id: "deferred", label: "Elhalasztva" },
    { id: "withdrawn", label: "Visszavonva" },
    { id: "archived", label: "Archiválva" },
  ],
  priorities: [
    { id: "low", label: "Alacsony" },
    { id: "normal", label: "Normál" },
    { id: "high", label: "Magas" },
    { id: "critical", label: "Kritikus" },
  ],
  modules: [
    "Közös rendszerlogika",
    "Közös Értesítési Motor",
    "Webes Értesítési Központ",
    "Drive Desktop Értesítések",
    "E-mail / SMTP értesítések",
    "DIMPROVER web",
    "Webes DIMPROVER / Projektkapu",
    "DIMPRO Drive Web",
    "DIMPRO Drive Desktop",
    "DIMPRO Drive",
    "DIMPRO Fájlműhely",
    "Szerver API / közös backend",
    "Object Storage / fájltár",
    "Licenc rendszer",
    "DIMPRO Account",
    "Projektkapu",
    "Szerverőr / monitoring",
    "Fejlesztési Napló / AI Kontextustár",
    "DokuBOX",
    "KépBOX",
    "Költségvetés Műhely",
    "Szakági Mennyiségmérő",
    "Terepi hibafelvétel",
    "Terepi állapotrögzítés",
    "Ütemterv",
    "Jegyzőkönyvek",
    "Építési napló / e-napló",
    "Árutér",
    "GazdaSegéd",
    "Felújítási Gyorskalkulátor",
    "Admin / üzemeltetés",
    "Dokumentáció / termékanyag",
    "Általános rendszer",
  ],
  surfaces: [
    "Webes felület",
    "Asztali szoftver",
    "Mobil / PWA",
    "Szerver API",
    "Közös rendszerlogika",
    "Adatmodell / adatbázis",
    "Dokumentáció",
    "Üzemeltetés",
    "AI / külső reviewer",
  ],
  epics: [
    "DIMPRO közös értesítési rendszer",
    "DIMPROVER webes platform",
    "DIMPRO Drive / Projektkapu",
    "DIMPRO Drive Desktop",
    "DIMPRO Fájlműhely fejlesztés",
    "DIMPRO licenc és release rendszer",
    "DIMPRO üzemeltetés / Szerverőr",
    "DIMPRO Fejlesztési Napló / AI Kontextustár",
    "DIMPRO KépBOX / DokuBOX",
    "DIMPRO Költségvetés Műhely",
    "DIMPRO Szakági Mennyiségmérő",
    "DIMPROVER terepi jegyzőkönyvek",
    "DIMPRO GazdaSegéd",
    "DIMPRO Árutér",
    "DIMPRO Felújítási Gyorskalkulátor",
  ],
};

const emptyDraft: Draft = {
  title: "",
  type: "idea",
  status: "new",
  module: "Általános rendszer",
  priority: "normal",
  summary: "",
  description: "",
  codingInstruction: "",
  aiContext: "",
  source: "",
  tags: [],
  relatedFiles: "",
  nextStep: "",
  surfaces: [],
  epic: "",
  relatedNoteIds: [],
  dependencies: "",
  blockers: "",
  crossChatStatus: "",
  externalAiNote: "",
  handoffSummary: "",
};

const initialFilters: Filters = {
  search: "",
  type: "all",
  status: "all",
  module: "all",
  priority: "all",
  surface: "all",
  epic: "all",
  includeArchived: false,
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function optionLabel<T extends string>(options: Option<T>[], id: string) {
  return options.find((item) => item.id === id)?.label ?? id;
}

function priorityClass(priority: DevNotePriority) {
  if (priority === "critical") return "border-red-300/35 bg-red-400/10 text-red-100";
  if (priority === "high") return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  if (priority === "low") return "border-slate-500/35 bg-slate-400/10 text-slate-200";
  return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
}

function statusClass(status: DevNoteStatus) {
  if (status === "done") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-100";
  if (status === "in_progress" || status === "testing") return "border-cyan-300/35 bg-cyan-400/10 text-cyan-100";
  if (status === "ready_for_coding") return "border-lime-300/35 bg-lime-400/10 text-lime-100";
  if (status === "archived" || status === "withdrawn") return "border-slate-500/35 bg-slate-500/10 text-slate-300";
  if (status === "deferred") return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/[0.05] text-slate-200";
}

function textInputClass() {
  return "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10";
}

function textAreaClass(extra = "") {
  return `${textInputClass()} min-h-28 resize-y leading-6 ${extra}`;
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-[0.17em] text-cyan-200/75">{label}</span>
      <div className="mt-2">{children}</div>
      {helper && <span className="mt-2 block text-xs font-semibold leading-5 text-slate-500">{helper}</span>}
    </label>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{helper}</p>
    </div>
  );
}

function toggleArrayValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getRelatedNoteTitles(relatedIds: string[], allNotes: DevNoteLite[]) {
  return relatedIds
    .map((id) => {
      const note = allNotes.find((item) => item.id === id);
      return note ? `${note.title} [${note.module} / ${note.status}]` : id;
    })
    .filter(Boolean);
}

function buildAiContext(note: Draft | DevNote, allNotes: DevNoteLite[] = []) {
  const relatedTitles = getRelatedNoteTitles(note.relatedNoteIds ?? [], allNotes);

  return [
    `# DIMPRO fejlesztési átadó / AI kontextus`,
    "",
    `## Cím`,
    note.title || "-",
    "",
    `## Modul`,
    note.module || "-",
    "",
    `## Fejlesztési csomag / Epic`,
    note.epic || "-",
    "",
    `## Érintett felületek`,
    note.surfaces?.length ? note.surfaces.join(", ") : "-",
    "",
    `## Típus / státusz / prioritás`,
    `${note.type} / ${note.status} / ${note.priority}`,
    "",
    `## Rövid összefoglaló`,
    note.summary || "-",
    "",
    `## Részletes leírás`,
    note.description || "-",
    "",
    `## Kódolási utasítás`,
    note.codingInstruction || "-",
    "",
    `## AI-nak átadható kontextus`,
    note.aiContext || "-",
    "",
    `## Forrás / előzmény`,
    note.source || "-",
    "",
    `## Kapcsolódó fájlok`,
    note.relatedFiles || "-",
    "",
    `## Kapcsolódó fejlesztési bejegyzések`,
    relatedTitles.length ? relatedTitles.map((title) => `- ${title}`).join("\n") : "-",
    "",
    `## Függőségek`,
    note.dependencies || "-",
    "",
    `## Blokkoló tényezők`,
    note.blockers || "-",
    "",
    `## Másik csevegő / párhuzamos fejlesztés állapota`,
    note.crossChatStatus || "-",
    "",
    `## Külső AI / Codex / reviewer megjegyzés`,
    note.externalAiNote || "-",
    "",
    `## Utolsó átadó összefoglaló`,
    note.handoffSummary || "-",
    "",
    `## Következő lépés`,
    note.nextStep || "-",
    "",
    `## Címkék`,
    note.tags.length ? note.tags.join(", ") : "-",
  ].join("\n");
}

function draftFromNote(note: DevNote): Draft {
  return {
    title: note.title,
    type: note.type,
    status: note.status,
    module: note.module,
    priority: note.priority,
    summary: note.summary,
    description: note.description,
    codingInstruction: note.codingInstruction,
    aiContext: note.aiContext,
    source: note.source,
    tags: note.tags,
    relatedFiles: note.relatedFiles,
    nextStep: note.nextStep,
    surfaces: note.surfaces ?? [],
    epic: note.epic ?? "",
    relatedNoteIds: note.relatedNoteIds ?? [],
    dependencies: note.dependencies ?? "",
    blockers: note.blockers ?? "",
    crossChatStatus: note.crossChatStatus ?? "",
    externalAiNote: note.externalAiNote ?? "",
    handoffSummary: note.handoffSummary ?? "",
  };
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.module !== "all") params.set("module", filters.module);
  if (filters.priority !== "all") params.set("priority", filters.priority);
  if (filters.surface !== "all") params.set("surface", filters.surface);
  if (filters.epic !== "all") params.set("epic", filters.epic);
  if (filters.includeArchived) params.set("includeArchived", "1");
  return params.toString();
}

export default function DevelopmentNotesPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [allNotes, setAllNotes] = useState<DevNoteLite[]>([]);
  const [options, setOptions] = useState<DevNoteOptions>(defaultOptions);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isNew, setIsNew] = useState(true);
  const [storageFile, setStorageFile] = useState("");
  const [counts, setCounts] = useState({ all: 0, filtered: 0, active: 0, archived: 0 });

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) ?? null, [notes, selectedId]);

  const tagText = useMemo(() => draft.tags.join(", "), [draft.tags]);

  async function loadNotes(nextFilters = filters, keyOverride = adminKey) {
    const key = keyOverride.trim();
    if (!key) {
      setAuthorized(false);
      setLoading(false);
      setMessage("Licencadmin belépés szükséges. Előbb nyisd meg az /admin felületet.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const query = buildQuery(nextFilters);
      const response = await fetch(`/api/license/dev-notes${query ? `?${query}` : ""}`, {
        headers: {
          "x-dimpro-license-admin-key": key,
          "accept": "application/json",
        },
        cache: "no-store",
      });
      const data = (await response.json()) as DevNotesResponse;
      if (!response.ok || !data.ok || !data.store) {
        setAuthorized(false);
        setNotes([]);
        setMessage(data.error ?? "Nem sikerült betölteni a fejlesztési naplót.");
        return;
      }

      setAuthorized(true);
      setOptions(data.options ?? defaultOptions);
      setAllNotes(data.allNotes ?? data.store.notes.map((note) => ({
        id: note.id,
        title: note.title,
        module: note.module,
        type: note.type,
        status: note.status,
        priority: note.priority,
        epic: note.epic,
        surfaces: note.surfaces,
        updatedAt: note.updatedAt,
      })));
      setStorageFile(data.storage?.file ?? "");
      setNotes(data.store.notes);
      setAllNotes(data.allNotes ?? data.store.notes.map((note) => ({
        id: note.id,
        title: note.title,
        module: note.module,
        type: note.type,
        status: note.status,
        priority: note.priority,
        epic: note.epic,
        surfaces: note.surfaces,
        updatedAt: note.updatedAt,
      })));
      setCounts({
        all: data.allCount ?? data.store.notes.length,
        filtered: data.filteredCount ?? data.store.notes.length,
        active: data.activeCount ?? data.store.notes.length,
        archived: data.archivedCount ?? 0,
      });

      if (data.store.notes.length > 0) {
        const nextSelected = data.store.notes.find((note) => note.id === selectedId) ?? data.store.notes[0];
        setSelectedId(nextSelected.id);
        setDraft(draftFromNote(nextSelected));
        setIsNew(false);
      } else {
        setSelectedId(null);
        setDraft(emptyDraft);
        setIsNew(true);
      }
    } catch (error) {
      setAuthorized(false);
      setMessage(error instanceof Error ? error.message : "Ismeretlen fejlesztési napló hiba.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() ?? "";
    setAdminKey(storedKey);
    void loadNotes(initialFilters, storedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(action: string, payload: { noteId?: string; draft?: Draft } = {}) {
    const key = adminKey.trim();
    if (!key) {
      setMessage("Hiányzik a licencadmin kulcs.");
      return null;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/dev-notes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = (await response.json()) as DevNotesResponse;
      if (!response.ok || !data.ok || !data.store) {
        setMessage(data.error ?? "A művelet sikertelen.");
        return null;
      }

      setNotes(data.store.notes);
      setCounts({
        all: data.allCount ?? data.store.notes.length,
        filtered: data.filteredCount ?? data.store.notes.length,
        active: data.activeCount ?? data.store.notes.length,
        archived: data.archivedCount ?? 0,
      });
      if (data.affectedNote && action !== "remove") {
        setSelectedId(data.affectedNote.id);
        setDraft(draftFromNote(data.affectedNote));
        setIsNew(false);
      }
      if (action === "remove") {
        const first = data.store.notes[0];
        setSelectedId(first?.id ?? null);
        setDraft(first ? draftFromNote(first) : emptyDraft);
        setIsNew(!first);
      }
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen műveleti hiba.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft.title.trim()) {
      setMessage("A cím megadása kötelező.");
      return;
    }

    const action = isNew ? "create" : "update";
    const payload = isNew ? { draft } : { noteId: selectedId ?? "", draft };
    const result = await runAction(action, payload);
    if (result?.ok) setMessage(isNew ? "Új fejlesztési bejegyzés mentve." : "Fejlesztési bejegyzés frissítve.");
  }

  function selectNote(note: DevNote) {
    setSelectedId(note.id);
    setDraft(draftFromNote(note));
    setIsNew(false);
    setMessage("");
  }

  function createNewDraft() {
    setSelectedId(null);
    setDraft({
      ...emptyDraft,
      module: filters.module !== "all" ? filters.module : "Általános rendszer",
      epic: filters.epic !== "all" ? filters.epic : "",
      surfaces: filters.surface !== "all" ? [filters.surface] : [],
    });
    setIsNew(true);
    setMessage("");
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage("Nem sikerült vágólapra másolni. Jelöld ki és másold kézzel a szöveget.");
    }
  }

  function applyFilters(nextFilters: Filters) {
    setFilters(nextFilters);
    void loadNotes(nextFilters);
  }

  if (!authorized && !loading) {
    return (
      <main className="min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-amber-300/25 bg-slate-950/85 p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/75">Védett fejlesztési napló</p>
            <h1 className="mt-4 text-3xl font-black text-white">Licencadmin belépés szükséges</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">A Fejlesztési Napló / AI Kontextustár csak a licencadmin belépés után érhető el. A napló fejlesztési döntéseket, ötleteket és más AI-nak átadható kontextust tárol.</p>
            {message && <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</p>}
            <Link href="/admin" className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950">Licencadmin belépés →</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.16)_1px,transparent_1px)] [background-size:54px_54px]" />
      <div className="relative mx-auto max-w-[1780px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link href="/admin/dev" className="mb-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-white">
                <ArrowLeft size={18} /> Vissza a fejlesztői kezdőlapra
              </Link>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300/80">DIMPRO belső fejlesztési tudástár</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">Fejlesztési Napló / AI Kontextustár</h1>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
                Ötletek, döntések, feladatok, hibák, kódolási utasítások és más AI-nak átadható fejlesztési kontextus egy helyen. A tárolás szerveroldali JSON fájlban történik, később adatbázisba vihető.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <button type="button" onClick={createNewDraft} className="inline-flex items-center justify-center gap-3 rounded-2xl bg-lime-300 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-lime-200">
                <Plus size={18} /> Új bejegyzés
              </button>
              <button type="button" onClick={() => void loadNotes()} disabled={loading} className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 hover:text-white disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />} Frissítés
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <StatCard label="Összes bejegyzés" value={counts.all} helper="Minden fejlesztési naplóelem a szerveren." />
            <StatCard label="Aktív" value={counts.active} helper="Nem archivált bejegyzések." />
            <StatCard label="Szűrt találat" value={counts.filtered} helper="A jelenlegi keresésnek megfelelő lista." />
            <StatCard label="Archivált" value={counts.archived} helper="Lezárt vagy régi kontextusok." />
          </div>

          {message && <p className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p>}
        </header>

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
              <div className="mb-4 flex items-center gap-2">
                <Filter size={20} className="text-cyan-200" />
                <h2 className="text-xl font-black text-white">Keresés és szűrés</h2>
              </div>
              <div className="space-y-4">
                <Field label="Keresés">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-3.5 text-slate-500" size={18} />
                    <input value={filters.search} onChange={(event) => applyFilters({ ...filters, search: event.target.value })} className={`${textInputClass()} pl-11`} placeholder="cím, modul, leírás, AI kontextus..." />
                  </div>
                </Field>
                <Field label="Modul">
                  <select value={filters.module} onChange={(event) => applyFilters({ ...filters, module: event.target.value })} className={textInputClass()}>
                    <option value="all">Minden modul</option>
                    {options.modules.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Fejlesztési csomag / Epic">
                  <select value={filters.epic} onChange={(event) => applyFilters({ ...filters, epic: event.target.value })} className={textInputClass()}>
                    <option value="all">Minden fejlesztési csomag</option>
                    {options.epics.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Érintett felület">
                  <select value={filters.surface} onChange={(event) => applyFilters({ ...filters, surface: event.target.value })} className={textInputClass()}>
                    <option value="all">Minden felület</option>
                    {options.surfaces.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Field label="Típus">
                    <select value={filters.type} onChange={(event) => applyFilters({ ...filters, type: event.target.value })} className={textInputClass()}>
                      <option value="all">Minden típus</option>
                      {options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Státusz">
                    <select value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value })} className={textInputClass()}>
                      <option value="all">Minden státusz</option>
                      {options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Prioritás">
                    <select value={filters.priority} onChange={(event) => applyFilters({ ...filters, priority: event.target.value })} className={textInputClass()}>
                      <option value="all">Minden prioritás</option>
                      {options.priorities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm font-bold text-slate-200">
                  <input type="checkbox" checked={filters.includeArchived} onChange={(event) => applyFilters({ ...filters, includeArchived: event.target.checked })} className="h-4 w-4 accent-cyan-300" />
                  Archivált bejegyzések mutatása
                </label>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">Bejegyzések</h2>
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{notes.length} db</span>
              </div>
              <div className="max-h-[920px] space-y-3 overflow-auto pr-1">
                {loading ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-bold text-slate-400">Betöltés...</div>
                ) : notes.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm font-bold text-slate-400">Nincs bejegyzés. Hozz létre egy új fejlesztési naplóelemet.</div>
                ) : notes.map((note) => (
                  <button key={note.id} type="button" onClick={() => selectNote(note)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === note.id ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-slate-950/35 hover:border-cyan-300/30 hover:bg-white/[0.07]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-white">{note.title}</p>
                        <p className="mt-1 truncate text-xs font-bold text-cyan-100/80">{note.module}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${priorityClass(note.priority)}`}>{optionLabel(options.priorities, note.priority)}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-slate-400">{note.summary || note.description || note.aiContext || "Nincs rövid leírás."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(note.status)}`}>{optionLabel(options.statuses, note.status)}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-slate-300">{optionLabel(options.types, note.type)}</span>
                    </div>
                    <p className="mt-3 text-[11px] font-bold text-slate-500">Frissítve: {formatDateTime(note.updatedAt)}</p>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.18)]">
            <form onSubmit={saveNote} className="grid gap-5">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300/80">{isNew ? "Új fejlesztési bejegyzés" : "Bejegyzés szerkesztése"}</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{draft.title || "Cím nélküli bejegyzés"}</h2>
                  {!isNew && selectedNote && <p className="mt-2 text-xs font-semibold text-slate-500">Létrehozva: {formatDateTime(selectedNote.createdAt)} · Frissítve: {formatDateTime(selectedNote.updatedAt)}</p>}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void copyText(buildAiContext(draft, allNotes), "AI kontextus vágólapra másolva.")} className="inline-flex items-center gap-2 rounded-2xl border border-lime-300/35 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100 hover:bg-lime-300/15">
                    <ClipboardCopy size={17} /> AI átadó másolása
                  </button>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Mentés
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <Field label="Cím">
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={textInputClass()} placeholder="pl. Fejlesztési Napló / AI Kontextustár MVP" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Modul">
                    <select value={draft.module} onChange={(event) => setDraft((current) => ({ ...current, module: event.target.value }))} className={textInputClass()}>
                      {options.modules.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </Field>
                  <Field label="Prioritás">
                    <select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as DevNotePriority }))} className={textInputClass()}>
                      {options.priorities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Field label="Fejlesztési csomag / Epic" helper="Közös fejlesztéseknél ez fogja össze a webes, desktopos és szerveroldali részfeladatokat.">
                  <input
                    value={draft.epic}
                    onChange={(event) => setDraft((current) => ({ ...current, epic: event.target.value }))}
                    className={textInputClass()}
                    list="dev-note-epics"
                    placeholder="pl. DIMPRO közös értesítési rendszer"
                  />
                  <datalist id="dev-note-epics">
                    {options.epics.map((item) => <option key={item} value={item} />)}
                  </datalist>
                </Field>
                <Field label="Érintett felületek" helper="Több is választható. Így látszik, hogy a bejegyzés webet, desktopot, szerver API-t vagy közös logikát érint.">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {options.surfaces.map((item) => (
                      <label key={item} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-300/30">
                        <input
                          type="checkbox"
                          checked={draft.surfaces.includes(item)}
                          onChange={() => setDraft((current) => ({ ...current, surfaces: toggleArrayValue(current.surfaces, item) }))}
                          className="h-4 w-4 accent-cyan-300"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Típus">
                  <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as DevNoteType }))} className={textInputClass()}>
                    {options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Státusz">
                  <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as DevNoteStatus }))} className={textInputClass()}>
                    {options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Címkék" helper="Vesszővel elválasztva. Keresésnél is működik.">
                  <input value={tagText} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} className={textInputClass()} placeholder="Drive, szerver, AI, MVP" />
                </Field>
              </div>

              <Field label="Rövid összefoglaló">
                <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} className={textAreaClass("min-h-20")} placeholder="1-3 mondatos rövid tartalom, hogy később gyorsan áttekinthető legyen." />
              </Field>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Részletes leírás">
                  <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={textAreaClass("min-h-56")} placeholder="Ide jöhet a kiinduló ötlet, üzleti logika, működési elv, fejlesztési döntés vagy probléma részletes leírása." />
                </Field>
                <Field label="Kódolási utasítás">
                  <textarea value={draft.codingInstruction} onChange={(event) => setDraft((current) => ({ ...current, codingInstruction: event.target.value }))} className={textAreaClass("min-h-56")} placeholder="Ide jöhet pontos fejlesztői utasítás: fájlok, módosítási sorrend, elvárt működés, tesztelési szabály." />
                </Field>
              </div>

              <Field label="AI kontextus / új csevegőbe másolható szöveg" helper="Ez a legfontosabb mező: másik ChatGPT, Codex Cloud, Claude vagy fejlesztő részére közvetlenül átadható kontextus.">
                <textarea value={draft.aiContext} onChange={(event) => setDraft((current) => ({ ...current, aiContext: event.target.value }))} className={textAreaClass("min-h-64 border-lime-300/25 bg-lime-300/5 focus:border-lime-300 focus:ring-lime-300/10")} placeholder="Írd ide úgy, mintha egy új AI-csevegőnek adnád át a teljes szükséges előzményt." />
              </Field>

              <section className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/5 p-4">
                <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                  <Field label="Kapcsolódó bejegyzés hozzáadása" helper="Ezzel lehet összekötni például a webes értesítési központot és az asztali Drive értesítéseket.">
                    <select
                      value=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) return;
                        setDraft((current) => ({ ...current, relatedNoteIds: current.relatedNoteIds.includes(value) ? current.relatedNoteIds : [...current.relatedNoteIds, value] }));
                      }}
                      className={textInputClass()}
                    >
                      <option value="">Válassz kapcsolódó bejegyzést...</option>
                      {allNotes.filter((item) => item.id !== selectedId && !draft.relatedNoteIds.includes(item.id)).map((item) => (
                        <option key={item.id} value={item.id}>{item.title} · {item.module} · {item.status}</option>
                      ))}
                    </select>
                  </Field>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.17em] text-cyan-200/75">Kapcsolódó fejlesztések</p>
                    <div className="mt-2 flex min-h-[52px] flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                      {draft.relatedNoteIds.length === 0 ? (
                        <span className="text-xs font-semibold text-slate-500">Nincs kapcsolódó bejegyzés.</span>
                      ) : draft.relatedNoteIds.map((id) => {
                        const item = allNotes.find((note) => note.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, relatedNoteIds: current.relatedNoteIds.filter((noteId) => noteId !== id) }))}
                            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100 hover:bg-red-300/15 hover:text-red-100"
                            title="Eltávolítás a kapcsolatokból"
                          >
                            {item?.title ?? id} ×
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-3">
                <Field label="Forrás / előzmény">
                  <textarea value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Pl. melyik csevegő, PDF, döntés, ügyfélkérés vagy szerveres fejlesztési kör alapján készült." />
                </Field>
                <Field label="Kapcsolódó fájlok / route-ok">
                  <textarea value={draft.relatedFiles} onChange={(event) => setDraft((current) => ({ ...current, relatedFiles: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Pl. app/admin/..., components/..., DIMPROVER_PRODUCT_DOCS/..." />
                </Field>
                <Field label="Következő lépés">
                  <textarea value={draft.nextStep} onChange={(event) => setDraft((current) => ({ ...current, nextStep: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Mi legyen a következő konkrét fejlesztési vagy ellenőrzési lépés?" />
                </Field>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Field label="Függőségek">
                  <textarea value={draft.dependencies} onChange={(event) => setDraft((current) => ({ ...current, dependencies: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Pl. webes API elkészülése, desktop kliens módosítása, SMTP adat, adatmodell döntés." />
                </Field>
                <Field label="Blokkoló tényezők">
                  <textarea value={draft.blockers} onChange={(event) => setDraft((current) => ({ ...current, blockers: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Mi akadályozza a folytatást? Pl. kézi adat, teszt, külső hozzáférés, döntés hiánya." />
                </Field>
                <Field label="Másik csevegő / párhuzamos fejlesztés állapota">
                  <textarea value={draft.crossChatStatus} onChange={(event) => setDraft((current) => ({ ...current, crossChatStatus: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Például: webes rész másik csevegőben készül, desktop rész itt; közös API MVP kész, e-mail bekötés hátra van." />
                </Field>
                <Field label="Külső AI / Codex / reviewer megjegyzés">
                  <textarea value={draft.externalAiNote} onChange={(event) => setDraft((current) => ({ ...current, externalAiNote: event.target.value }))} className={textAreaClass("min-h-32")} placeholder="Ide jöhet később Codex Cloud, Claude vagy más AI review összefoglalója." />
                </Field>
              </div>

              <Field label="Utolsó átadó összefoglaló" helper="Rövid, naprakész állapot arról, hogy másik csevegő vagy AI innen tudja folytatni.">
                <textarea value={draft.handoffSummary} onChange={(event) => setDraft((current) => ({ ...current, handoffSummary: event.target.value }))} className={textAreaClass("min-h-36 border-cyan-300/25 bg-cyan-300/5")} placeholder="Például: Webes értesítési központ MVP kész. Desktop értesítések v5.12-ig tartanak. Következő: közös SMTP és státusz-szinkron teszt." />
              </Field>

              <DevNotesAiAssistant
                adminKey={adminKey}
                note={draft}
                noteId={selectedId}
                allNotes={allNotes}
                onApplyToField={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
              />

              <section className="rounded-[1.5rem] border border-lime-300/20 bg-lime-300/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200/80">Másolható AI átadó blokk</p>
                    <p className="mt-1 text-sm font-semibold text-slate-400">Ezt tudod új csevegőbe vagy másik AI-nak beilleszteni.</p>
                  </div>
                  <button type="button" onClick={() => void copyText(buildAiContext(draft, allNotes), "Teljes AI átadó blokk vágólapra másolva.")} className="rounded-2xl border border-lime-300/35 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-100 hover:bg-lime-300/15">
                    Másolás
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs font-semibold leading-6 text-slate-300">{buildAiContext(draft, allNotes)}</pre>
              </section>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} {isNew ? "Új bejegyzés mentése" : "Módosítás mentése"}
                  </button>
                  {!isNew && selectedId && draft.status !== "archived" && (
                    <button type="button" onClick={() => void runAction("archive", { noteId: selectedId })} className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-5 py-3 text-sm font-black text-amber-100 hover:bg-amber-300/15">
                      <Archive size={17} /> Archiválás
                    </button>
                  )}
                  {!isNew && selectedId && draft.status === "archived" && (
                    <button type="button" onClick={() => void runAction("restore", { noteId: selectedId })} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/35 bg-emerald-300/10 px-5 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-300/15">
                      <Archive size={17} /> Visszaállítás
                    </button>
                  )}
                  {!isNew && selectedId && (
                    <button type="button" onClick={() => { if (window.confirm("Biztosan végleg törlöd ezt a fejlesztési naplóbejegyzést? Biztonságosabb az archiválás.")) void runAction("remove", { noteId: selectedId }); }} className="inline-flex items-center gap-2 rounded-2xl border border-red-300/35 bg-red-300/10 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-300/15">
                      <Trash2 size={17} /> Törlés
                    </button>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                  <FileText className="mr-2 inline text-cyan-200" size={15} />
                  Tárolás: <span className="font-mono text-slate-300">{storageFile || ".dimprover/dev-notes/dev-notes.json"}</span>
                </div>
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
