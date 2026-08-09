"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarRange,
  Loader2,
  Moon,
  Plus,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { ProjectListItem } from "@/app/lib/project-core/types";
import styles from "./ProjectListClient.module.css";

type ProjectsResponse = {
  ok: boolean;
  projects?: ProjectListItem[];
  error?: string;
};

type CreateProjectResponse = {
  ok: boolean;
  project?: ProjectListItem;
  error?: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Előkészítés alatt",
  ACTIVE: "Aktív projekt",
  CLOSING: "Lezárás folyamatban",
  READ_ONLY: "Lezárt, csak olvasható",
  ARCHIVED: "Archivált",
  DELETION_SCHEDULED: "Törlésre ütemezve",
  DELETED: "Törölt",
};

export default function ProjectListClient() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json() as ProjectsResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projektek nem tölthetők be.");
      setProjects(payload.projects || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "A projektek nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("dimpro-projectgate-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    void loadProjects();
  }, [loadProjects]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("dimpro-projectgate-theme", next);
      return next;
    });
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          code: String(form.get("code") || ""),
          description: String(form.get("description") || ""),
          currentPhase: String(form.get("currentPhase") || "Előkészítés"),
          startsAt: String(form.get("startsAt") || ""),
          endsAt: String(form.get("endsAt") || ""),
        }),
      });
      const payload = await response.json() as CreateProjectResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projekt nem hozható létre.");
      event.currentTarget.reset();
      setShowCreate(false);
      await loadProjects();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "A projekt nem hozható létre.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page} data-theme={theme}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p>DIMPRO Projektkapu · D6 Core</p>
            <h1>Projektkörnyezetek</h1>
            <span>
              Az önálló Projektkapu egy időben egy projektet jelenít meg. A DIMPROVER ugyanezen Project Core többprojektes szervezeti felülete.
            </span>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={toggleTheme} className={styles.iconButton} aria-label={theme === "dark" ? "Világos mód" : "Sötét mód"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" onClick={() => setShowCreate((current) => !current)} className={styles.primaryButton}>
              {showCreate ? <X size={17} /> : <Plus size={17} />}
              {showCreate ? "Bezárás" : "Új projekt"}
            </button>
          </div>
        </header>

        {showCreate && (
          <form className={styles.createPanel} onSubmit={createProject}>
            <div className={styles.panelHeading}>
              <div>
                <strong>Új projektkörnyezet</strong>
                <span>A projekt létrehozója automatikusan projektgazda jogosultságot kap.</span>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label>Projekt neve<input name="name" required maxLength={120} placeholder="Például: Szekszárd szarvasmarhatelep" /></label>
              <label>Projektkód<input name="code" maxLength={40} placeholder="Például: SZEKSZ-01" /></label>
              <label>Aktuális fázis<input name="currentPhase" maxLength={80} defaultValue="Előkészítés" /></label>
              <label>Kezdés<input name="startsAt" type="date" /></label>
              <label>Tervezett befejezés<input name="endsAt" type="date" /></label>
              <label className={styles.wideField}>Rövid leírás<textarea name="description" rows={3} maxLength={800} placeholder="A projekt célja és rövid műszaki leírása" /></label>
            </div>
            <div className={styles.formActions}>
              <button type="button" onClick={() => setShowCreate(false)} className={styles.secondaryButton}>Mégsem</button>
              <button type="submit" disabled={saving} className={styles.primaryButton}>
                {saving ? <Loader2 size={17} className={styles.spin} /> : <Plus size={17} />}
                Projekt létrehozása
              </button>
            </div>
          </form>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading ? (
          <div className={styles.loading}><Loader2 size={28} className={styles.spin} /> Projektadatok betöltése…</div>
        ) : (
          <section className={styles.projectGrid}>
            {projects.map((project) => (
              <Link key={project.id} href={`/projektkapu/project/${encodeURIComponent(project.id)}/dock`} className={styles.projectCard}>
                <div className={styles.cardTop}>
                  <span className={styles.projectIcon}><Building2 size={24} /></span>
                  <span className={styles.statusBadge}>{STATUS_LABELS[project.status] || project.status}</span>
                </div>
                <small>{project.code}</small>
                <h2>{project.name}</h2>
                <p>{project.description || "Nincs projektleírás megadva."}</p>
                <div className={styles.progressLine}><i style={{ width: `${project.progressPercent}%` }} /></div>
                <div className={styles.cardFacts}>
                  <span><Users size={15} /> {project.activeMemberCount} aktív résztvevő</span>
                  <span><CalendarRange size={15} /> {project.currentPhase}</span>
                </div>
                <div className={styles.cardFooter}>
                  <span>{project.membership.role}</span>
                  <strong>Projekt megnyitása <ArrowRight size={16} /></strong>
                </div>
              </Link>
            ))}

            {!projects.length && (
              <div className={styles.emptyState}>
                <Building2 size={30} />
                <strong>Nincs elérhető projekt</strong>
                <span>Hozz létre új projektkörnyezetet, vagy kérj projektszintű meghívást.</span>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
