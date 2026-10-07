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
import { projectRoleLabel } from "@/app/lib/project-core/permissions";
import DriveIdentityDialog from "@/components/drive/DriveIdentityDialog";
import { driveIdentityLabel, type DriveUserIdentitiesPayload, type DriveUserIdentity } from "@/components/drive/driveIdentityTypes";
import styles from "./ProjectListClient.module.css";

type ProjectsResponse = {
  ok: boolean;
  projects?: ProjectListItem[];
  error?: string;
};

type CreateProjectResponse = {
  ok: boolean;
  project?: ProjectListItem;
  driveProvisioning?: {
    ok?: boolean;
    ready?: boolean;
    retryRequired?: boolean;
    folderCount?: number;
    incomingDropFolder?: { id: string; name: string; path: string } | null;
    error?: string;
  };
  identityProvisioning?: {
    ok?: boolean;
    ready?: boolean;
    retryRequired?: boolean;
    dropBindingReady?: boolean;
    identityProject?: { id?: string; publicCode?: string; status?: string; projectDropEnabled?: boolean } | null;
    destination?: { driveFolderId?: string; incomingFolderName?: string; enabled?: boolean } | null;
    error?: string;
  };
  error?: string;
  message?: string;
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
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [identities, setIdentities] = useState<DriveUserIdentity[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState("");
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false);

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

  const loadIdentities = useCallback(async () => {
    try {
      const response = await fetch("/api/dimpro-auth/identities", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as DriveUserIdentitiesPayload;
      if (!response.ok || !payload.ok) return;
      const next = payload.identities || [];
      setIdentities(next);
      const verified = next.filter((identity) => identity.status === "VERIFIED");
      setSelectedIdentityId((current) => verified.some((identity) => identity.id === current) ? current : verified.find((identity) => identity.isPrimary)?.id || verified[0]?.id || "");
    } catch {
      // Project creation remains fail-closed server side when no verified identity is available.
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("dimpro-projectgate-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    void loadProjects();
    void loadIdentities();
  }, [loadIdentities, loadProjects]);

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
    setNotice("");
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
          actingIdentityId: selectedIdentityId,
        }),
      });
      const payload = await response.json() as CreateProjectResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.message || payload.error || "A projekt nem hozható létre.");
      event.currentTarget.reset();
      setShowCreate(false);
      if (payload.driveProvisioning?.ready && payload.identityProvisioning?.ready) {
        const publicCode = payload.identityProvisioning.identityProject?.publicCode;
        const lifecycleNote = payload.identityProvisioning.identityProject?.status === "draft"
          ? " A projekt Drop DRAFT állapotban zárva marad; ACTIVE állapotban nyitható meg."
          : "";
        setNotice(`A projekt, a DIMPRO Drive és a canonical projektazonosság létrejött. ${payload.driveProvisioning.folderCount || 0} mappa használható, a Beérkező Drop célmappa készen áll.${publicCode ? ` Publikus projektkód: ${publicCode}.` : ""}${lifecycleNote}`);
      } else if (payload.driveProvisioning?.ready && payload.project) {
        setNotice(`A projekt és a DIMPRO Drive létrejött, de a canonical projektazonosság szinkronja újrapróbálást igényel${payload.identityProvisioning?.error ? `: ${payload.identityProvisioning.error}` : "."}`);
      } else if (payload.project) {
        setNotice(`A projekt létrejött, de a Drive inicializálása újrapróbálást igényel${payload.driveProvisioning?.error ? `: ${payload.driveProvisioning.error}` : "."}`);
      }
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
              <label className={styles.wideField}>Projektindítási identitás
                <select required value={selectedIdentityId} onChange={(event) => setSelectedIdentityId(event.target.value)}>
                  {identities.filter((identity) => identity.status === "VERIFIED").map((identity) => <option key={identity.id} value={identity.id}>{driveIdentityLabel(identity)}</option>)}
                </select>
              </label>
              <div className={`${styles.identityHint} ${styles.wideField}`}><span>A projektgazda jogosultság a DIMPRO-fiókodhoz tartozik; itt a projektben használt e-mailt és szervezeti identitást választod.</span><button type="button" onClick={() => setIdentityDialogOpen(true)}>+ E-mail / munkahely hozzáadása</button></div>
              <label>Projekt neve<input name="name" required maxLength={120} placeholder="Például: Szekszárd szarvasmarhatelep" /></label>
              <label>Projektkód<input name="code" maxLength={40} placeholder="Például: SZEKSZ-01" /></label>
              <label>Aktuális fázis<input name="currentPhase" maxLength={80} defaultValue="Előkészítés" /></label>
              <label>Kezdés<input name="startsAt" type="date" /></label>
              <label>Tervezett befejezés<input name="endsAt" type="date" /></label>
              <label className={styles.wideField}>Rövid leírás<textarea name="description" rows={3} maxLength={800} placeholder="A projekt célja és rövid műszaki leírása" /></label>
            </div>
            <div className={styles.formActions}>
              <button type="button" onClick={() => setShowCreate(false)} className={styles.secondaryButton}>Mégsem</button>
              <button type="submit" disabled={saving || !selectedIdentityId} className={styles.primaryButton}>
                {saving ? <Loader2 size={17} className={styles.spin} /> : <Plus size={17} />}
                Projekt létrehozása
              </button>
            </div>
          </form>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}
        {!error && notice && <div className={styles.successBox}>{notice}</div>}

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
                  <span>{projectRoleLabel(project.membership.role)}</span>
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
      <DriveIdentityDialog
        open={identityDialogOpen}
        onClose={() => setIdentityDialogOpen(false)}
        onChanged={(next) => {
          setIdentities(next);
          const verified = next.filter((identity) => identity.status === "VERIFIED");
          setSelectedIdentityId((current) => verified.some((identity) => identity.id === current) ? current : verified.find((identity) => identity.isPrimary)?.id || verified[0]?.id || "");
        }}
      />
    </main>
  );
}
