"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DevNotesAiAssistant from "@/components/admin/DevNotesAiAssistant";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";
import {
  Archive,
  ClipboardCopy,
  FileText,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  X,
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

function noteStatusTone(status: DevNoteStatus): "default" | "ok" | "warning" | "danger" | "info" {
  if (status === "done") return "ok";
  if (status === "in_progress" || status === "testing") return "info";
  if (status === "ready_for_coding") return "ok";
  if (status === "deferred") return "warning";
  if (status === "withdrawn") return "danger";
  return "default";
}

function notePriorityTone(priority: DevNotePriority): "default" | "ok" | "warning" | "danger" | "info" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "default";
  return "info";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId) ?? null, [notes, selectedId]);

  const tagText = useMemo(() => draft.tags.join(", "), [draft.tags]);
  const pageCount = Math.max(1, Math.ceil(notes.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedNotes = notes.slice((safePage - 1) * pageSize, safePage * pageSize);

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
        setDrawerOpen(false);
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
    setDrawerOpen(true);
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
    setDrawerOpen(true);
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
    setPage(1);
    void loadNotes(nextFilters);
  }

  if (!authorized && !loading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <FileText size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>{message || "A Fejlesztési Napló / AI Kontextustár csak aktív BENJADMIN munkamenettel érhető el."}</p>
          <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · FEJLESZTÉSI TUDÁSTÁR"
        title="Fejlesztési Napló / AI Kontextustár"
        description="Ötletek, döntések, feladatok, hibák, kódolási utasítások és AI-átadók kereshető, szűrhető fejlesztési nyilvántartása."
        actions={(
          <>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadNotes()} disabled={loading}>{loading ? <Loader2 className="is-spinning" size={16} /> : <RefreshCcw size={16} />} Frissítés</button>
            <button type="button" className="benjadmin-data-primary-action" onClick={createNewDraft}><Plus size={16} /> Új bejegyzés</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Összes bejegyzés" value={counts.all} />
            <BenjadminMetric label="Aktív" value={counts.active} tone="ok" />
            <BenjadminMetric label="Szűrt találat" value={counts.filtered} />
            <BenjadminMetric label="Archivált" value={counts.archived} />
            <BenjadminMetric label="Kapcsolt rekord" value={allNotes.filter((note) => note.epic || note.surfaces.length).length} />
          </>
        )}
        toolbar={(
          <>
            <label className="benjadmin-data-search"><Search size={16} /><input value={filters.search} onChange={(event) => applyFilters({ ...filters, search: event.target.value })} placeholder="Keresés cím, modul, leírás, AI kontextus vagy címke alapján" /></label>
            <div className="benjadmin-data-toolbar-selects">
              <select aria-label="Modul" value={filters.module} onChange={(event) => applyFilters({ ...filters, module: event.target.value })}><option value="all">Minden modul</option>{options.modules.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select aria-label="Epic" value={filters.epic} onChange={(event) => applyFilters({ ...filters, epic: event.target.value })}><option value="all">Minden fejlesztési csomag</option>{options.epics.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <select aria-label="Típus" value={filters.type} onChange={(event) => applyFilters({ ...filters, type: event.target.value })}><option value="all">Minden típus</option>{options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <select aria-label="Státusz" value={filters.status} onChange={(event) => applyFilters({ ...filters, status: event.target.value })}><option value="all">Minden státusz</option>{options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <select aria-label="Prioritás" value={filters.priority} onChange={(event) => applyFilters({ ...filters, priority: event.target.value })}><option value="all">Minden prioritás</option>{options.priorities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <select aria-label="Felület" value={filters.surface} onChange={(event) => applyFilters({ ...filters, surface: event.target.value })}><option value="all">Minden felület</option>{options.surfaces.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              <label className="benjadmin-data-archive-toggle"><input type="checkbox" checked={filters.includeArchived} onChange={(event) => applyFilters({ ...filters, includeArchived: event.target.checked })} /> Archiváltak</label>
            </div>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message || `Tárolás: ${storageFile || ".dimprover/dev-notes/dev-notes.json"}`}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={notes.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-dev-notes-table" data-testid="benjadmin-dev-notes-table">
            <thead><tr><th>Cím</th><th>Modul</th><th>Fejlesztési csomag</th><th>Típus</th><th>Státusz</th><th>Prioritás</th><th>Felületek</th><th>Kapcsolatok</th><th>Frissítve</th><th>Művelet</th></tr></thead>
            <tbody>
              {pagedNotes.length ? pagedNotes.map((note) => (
                <tr key={note.id}>
                  <td className="is-wide"><strong>{note.title}</strong><br /><small>{note.summary || note.description || note.aiContext || "Nincs rövid leírás."}</small></td>
                  <td>{note.module}</td>
                  <td>{note.epic || "—"}</td>
                  <td>{optionLabel(options.types, note.type)}</td>
                  <td><BenjadminStatusPill tone={noteStatusTone(note.status)}>{optionLabel(options.statuses, note.status)}</BenjadminStatusPill></td>
                  <td><BenjadminStatusPill tone={notePriorityTone(note.priority)}>{optionLabel(options.priorities, note.priority)}</BenjadminStatusPill></td>
                  <td>{note.surfaces?.length || 0}</td>
                  <td>{note.relatedNoteIds?.length || 0}</td>
                  <td className="is-nowrap">{formatDateTime(note.updatedAt)}</td>
                  <td><button type="button" className="benjadmin-data-row-action" onClick={() => selectNote(note)}>Részletek</button></td>
                </tr>
              )) : <tr><td colSpan={10} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő fejlesztési bejegyzés.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {drawerOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Fejlesztési bejegyzés bezárása" onClick={() => setDrawerOpen(false)} /> : null}
      {drawerOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-dev-note-drawer" data-testid="benjadmin-dev-note-drawer">
          <header><div><span>{isNew ? "ÚJ FEJLESZTÉSI BEJEGYZÉS" : "FEJLESZTÉSI BEJEGYZÉS"}</span><strong>{draft.title || "Cím nélküli bejegyzés"}</strong></div><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Bezárás"><X size={18} /></button></header>
          <form onSubmit={saveNote} className="benjadmin-data-drawer__body benjadmin-dev-note-form">
            {!isNew && selectedNote ? <div className="benjadmin-dev-note-meta">Létrehozva: {formatDateTime(selectedNote.createdAt)} · Frissítve: {formatDateTime(selectedNote.updatedAt)}</div> : null}

            <div className="benjadmin-data-form-grid">
              <Field label="Cím"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Modul"><select value={draft.module} onChange={(event) => setDraft((current) => ({ ...current, module: event.target.value }))} className={textInputClass()}>{options.modules.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
              <Field label="Fejlesztési csomag / Epic"><input value={draft.epic} onChange={(event) => setDraft((current) => ({ ...current, epic: event.target.value }))} className={textInputClass()} list="dev-note-epics" /><datalist id="dev-note-epics">{options.epics.map((item) => <option key={item} value={item} />)}</datalist></Field>
              <Field label="Prioritás"><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as DevNotePriority }))} className={textInputClass()}>{options.priorities.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Típus"><select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as DevNoteType }))} className={textInputClass()}>{options.types.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Státusz"><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as DevNoteStatus }))} className={textInputClass()}>{options.statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            </div>

            <section className="benjadmin-data-form-section"><header><strong>Érintett felületek</strong><span>{draft.surfaces.length} kiválasztva</span></header><div className="benjadmin-data-chip-grid">{options.surfaces.map((item) => <button key={item} type="button" className={draft.surfaces.includes(item) ? "is-active" : ""} onClick={() => setDraft((current) => ({ ...current, surfaces: toggleArrayValue(current.surfaces, item) }))}>{draft.surfaces.includes(item) ? "✓ " : "+ "}{item}</button>)}</div></section>

            <Field label="Címkék"><input value={tagText} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} className={textInputClass()} placeholder="Drive, szerver, AI, MVP" /></Field>
            <Field label="Rövid összefoglaló"><textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} className={textAreaClass("min-h-20")} /></Field>

            <div className="benjadmin-dev-note-form__two">
              <Field label="Részletes leírás"><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className={textAreaClass("min-h-48")} /></Field>
              <Field label="Kódolási utasítás"><textarea value={draft.codingInstruction} onChange={(event) => setDraft((current) => ({ ...current, codingInstruction: event.target.value }))} className={textAreaClass("min-h-48")} /></Field>
            </div>

            <Field label="AI kontextus / új csevegőbe másolható szöveg"><textarea value={draft.aiContext} onChange={(event) => setDraft((current) => ({ ...current, aiContext: event.target.value }))} className={textAreaClass("min-h-52")} /></Field>

            <section className="benjadmin-data-form-section">
              <header><strong>Kapcsolódó fejlesztések</strong><span>{draft.relatedNoteIds.length} kapcsolat</span></header>
              <select value="" onChange={(event) => { const value = event.target.value; if (!value) return; setDraft((current) => ({ ...current, relatedNoteIds: current.relatedNoteIds.includes(value) ? current.relatedNoteIds : [...current.relatedNoteIds, value] })); }} className={textInputClass()}><option value="">Kapcsolódó bejegyzés hozzáadása...</option>{allNotes.filter((item) => item.id !== selectedId && !draft.relatedNoteIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.module} · {item.status}</option>)}</select>
              <div className="benjadmin-dev-note-links">{draft.relatedNoteIds.length ? draft.relatedNoteIds.map((id) => { const item = allNotes.find((note) => note.id === id); return <button key={id} type="button" onClick={() => setDraft((current) => ({ ...current, relatedNoteIds: current.relatedNoteIds.filter((noteId) => noteId !== id) }))}>{item?.title ?? id} ×</button>; }) : <span>Nincs kapcsolódó bejegyzés.</span>}</div>
            </section>

            <div className="benjadmin-dev-note-form__two">
              <Field label="Forrás / előzmény"><textarea value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Kapcsolódó fájlok / route-ok"><textarea value={draft.relatedFiles} onChange={(event) => setDraft((current) => ({ ...current, relatedFiles: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Következő lépés"><textarea value={draft.nextStep} onChange={(event) => setDraft((current) => ({ ...current, nextStep: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Függőségek"><textarea value={draft.dependencies} onChange={(event) => setDraft((current) => ({ ...current, dependencies: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Blokkoló tényezők"><textarea value={draft.blockers} onChange={(event) => setDraft((current) => ({ ...current, blockers: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Párhuzamos fejlesztés állapota"><textarea value={draft.crossChatStatus} onChange={(event) => setDraft((current) => ({ ...current, crossChatStatus: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Külső AI / reviewer megjegyzés"><textarea value={draft.externalAiNote} onChange={(event) => setDraft((current) => ({ ...current, externalAiNote: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
              <Field label="Utolsó átadó összefoglaló"><textarea value={draft.handoffSummary} onChange={(event) => setDraft((current) => ({ ...current, handoffSummary: event.target.value }))} className={textAreaClass("min-h-24")} /></Field>
            </div>

            <DevNotesAiAssistant adminKey={adminKey} note={draft} noteId={selectedId} allNotes={allNotes} onApplyToField={(field, value) => setDraft((current) => ({ ...current, [field]: value }))} />

            <section className="benjadmin-data-form-section benjadmin-dev-note-handoff"><header><strong>Másolható AI átadó blokk</strong><button type="button" onClick={() => void copyText(buildAiContext(draft, allNotes), "Teljes AI átadó blokk vágólapra másolva.")}><ClipboardCopy size={14} /> Másolás</button></header><pre>{buildAiContext(draft, allNotes)}</pre></section>

            <div className="benjadmin-dev-note-actions">
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void copyText(buildAiContext(draft, allNotes), "AI kontextus vágólapra másolva.")}><ClipboardCopy size={15} /> AI átadó másolása</button>
              {!isNew && selectedId && draft.status !== "archived" ? <button type="button" className="benjadmin-data-warning-action" onClick={() => void runAction("archive", { noteId: selectedId })}><Archive size={15} /> Archiválás</button> : null}
              {!isNew && selectedId && draft.status === "archived" ? <button type="button" className="benjadmin-data-secondary-action" onClick={() => void runAction("restore", { noteId: selectedId })}><Archive size={15} /> Visszaállítás</button> : null}
              {!isNew && selectedId ? <button type="button" className="benjadmin-data-danger-action" onClick={() => { if (window.confirm("Biztosan végleg törlöd ezt a fejlesztési naplóbejegyzést? Biztonságosabb az archiválás.")) void runAction("remove", { noteId: selectedId }); }}><Trash2 size={15} /> Törlés</button> : null}
              <button type="submit" className="benjadmin-data-primary-action" disabled={saving}>{saving ? <Loader2 className="is-spinning" size={15} /> : <Save size={15} />}{isNew ? "Új bejegyzés mentése" : "Módosítás mentése"}</button>
            </div>
          </form>
        </aside>
      ) : null}
    </>
  );
}
