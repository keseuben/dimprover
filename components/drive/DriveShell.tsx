"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import DriveNavigationRail from "./DriveNavigationRail";
import DriveWorkspace from "./DriveWorkspace";
import FloatingProjectBoard from "./FloatingProjectBoard";
import type { DriveProject } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type ProjectsPayload = {
  ok?: boolean;
  error?: string;
  projects?: Array<{
    id: string;
    code: string;
    name: string;
    description?: string;
    status: string;
    currentPhase?: string;
    progressPercent?: number;
    permissions?: DriveProject["permissions"];
  }>;
};

type CreateProjectPayload = {
  ok?: boolean;
  error?: string;
  project?: DriveProject;
  driveProvisioning?: {
    ready?: boolean;
    folderCount?: number;
    pilotFolder?: { id: string; name: string; path: string } | null;
  };
};

export default function DriveShell({
  pilotProjectName = "",
  pilotMode = false,
}: {
  pilotProjectName?: string;
  pilotMode?: boolean;
}) {
  const [projects, setProjects] = useState<DriveProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardPinned, setBoardPinned] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [notice, setNotice] = useState("");
  const boardOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as ProjectsPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A projektlista nem tölthető be.");
      const normalized = (payload.projects || []).map((project) => ({
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        status: project.status,
        currentPhase: project.currentPhase,
        progressPercent: project.progressPercent,
        permissions: project.permissions || [],
      }));
      setProjects(normalized);
      setSelectedProjectId((current) => normalized.some((project) => project.id === current) ? current : normalized[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A projektlista nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProject(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") || "").trim(),
          code: String(form.get("code") || "").trim(),
          description: String(form.get("description") || "").trim(),
          currentPhase: String(form.get("currentPhase") || "Előkészítés").trim(),
        }),
      });
      const payload = await response.json() as CreateProjectPayload;
      if (!response.ok || !payload.ok || !payload.project) {
        throw new Error(payload.error || "A Drive projekt nem hozható létre.");
      }
      await loadProjects();
      setSelectedProjectId(payload.project.id);
      setShowCreateProject(false);
      const pilotNote = payload.driveProvisioning?.pilotFolder ? " A PILOT mappa létrejött." : "";
      setNotice(`A Drive projekt létrejött: ${payload.project.name}.${pilotNote}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive projekt nem hozható létre.");
    } finally {
      setSavingProject(false);
    }
  }

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  useEffect(() => () => {
    if (boardOpenTimer.current) clearTimeout(boardOpenTimer.current);
    if (boardCloseTimer.current) clearTimeout(boardCloseTimer.current);
  }, []);

  const cancelBoardTimers = useCallback(() => {
    if (boardOpenTimer.current) {
      clearTimeout(boardOpenTimer.current);
      boardOpenTimer.current = null;
    }
    if (boardCloseTimer.current) {
      clearTimeout(boardCloseTimer.current);
      boardCloseTimer.current = null;
    }
  }, []);

  const openBoardSoon = useCallback(() => {
    if (boardPinned || boardOpen) return;
    if (boardCloseTimer.current) {
      clearTimeout(boardCloseTimer.current);
      boardCloseTimer.current = null;
    }
    if (boardOpenTimer.current) return;
    boardOpenTimer.current = setTimeout(() => {
      setBoardOpen(true);
      boardOpenTimer.current = null;
    }, 220);
  }, [boardOpen, boardPinned]);

  const closeBoardSoon = useCallback(() => {
    if (boardPinned || !boardOpen) return;
    if (boardOpenTimer.current) {
      clearTimeout(boardOpenTimer.current);
      boardOpenTimer.current = null;
    }
    if (boardCloseTimer.current) return;
    boardCloseTimer.current = setTimeout(() => {
      setBoardOpen(false);
      boardCloseTimer.current = null;
    }, 280);
  }, [boardOpen, boardPinned]);

  const keepBoardOpen = useCallback(() => {
    if (boardCloseTimer.current) {
      clearTimeout(boardCloseTimer.current);
      boardCloseTimer.current = null;
    }
  }, []);

  const toggleBoard = useCallback(() => {
    cancelBoardTimers();
    setBoardOpen((current) => !current);
  }, [cancelBoardTimers]);

  const toggleBoardPinned = useCallback(() => {
    cancelBoardTimers();
    setBoardPinned((current) => {
      const next = !current;
      if (next) setBoardOpen(true);
      return next;
    });
  }, [cancelBoardTimers]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  return (
    <div className={`${styles.shell} ${boardOpen ? styles.shellBoardOpen : styles.shellBoardClosed} ${boardPinned ? styles.shellBoardPinned : ""}`}>
      <DriveNavigationRail
        boardOpen={boardOpen}
        onToggleBoard={toggleBoard}
        onHoverOpen={openBoardSoon}
        onHoverLeave={closeBoardSoon}
      />
      <FloatingProjectBoard
        projects={projects}
        selectedProjectId={selectedProject?.id || ""}
        pinned={boardPinned}
        onProjectChange={setSelectedProjectId}
        onCreateProject={() => {
          cancelBoardTimers();
          setBoardPinned(true);
          setBoardOpen(true);
          setShowCreateProject(true);
        }}
        onClose={() => {
          cancelBoardTimers();
          setBoardPinned(false);
          setBoardOpen(false);
        }}
        onTogglePinned={toggleBoardPinned}
        onHoverEnter={keepBoardOpen}
        onHoverLeave={closeBoardSoon}
      />
      <main className={styles.main}>
        {showCreateProject && (
          <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Új DIMPRO Drive projekt">
            <form className={styles.projectCreatePanel} onSubmit={createProject}>
              <header>
                <div>
                  <small>{pilotMode ? "DIMPRO Drive · PILOT" : "DIMPRO Drive"}</small>
                  <strong>Új projekt létrehozása</strong>
                  <span>A projekt a közös Project Core-ban jön létre, ezért később ugyanígy beköthető a Projektkapuba.</span>
                </div>
                <button type="button" onClick={() => setShowCreateProject(false)} aria-label="Bezárás"><X size={16} /></button>
              </header>
              <label>
                Projekt neve
                <input name="name" required maxLength={120} defaultValue={pilotProjectName} placeholder="Projekt neve" />
              </label>
              <div className={styles.projectCreateGrid}>
                <label>
                  Projektkód
                  <input name="code" maxLength={40} placeholder="Üresen hagyva automatikus" />
                </label>
                <label>
                  Aktuális fázis
                  <input name="currentPhase" maxLength={80} defaultValue="Előkészítés" />
                </label>
              </div>
              <label>
                Rövid leírás
                <textarea name="description" rows={3} maxLength={800} placeholder="Opcionális projektleírás" />
              </label>
              {pilotMode && <div className={styles.projectPilotHint}>A projekt létrehozásakor a Drive automatikusan létrehozza a külön PILOT mappát.</div>}
              <footer>
                <button type="button" onClick={() => setShowCreateProject(false)}>Mégsem</button>
                <button type="submit" disabled={savingProject}>
                  {savingProject ? <Loader2 className={styles.spin} size={16} /> : <Plus size={16} />}
                  Projekt létrehozása
                </button>
              </footer>
            </form>
          </div>
        )}
        {notice && <div className={styles.shellNotice}>{notice}</div>}
        {loading ? (
          <div className={styles.loadingState}><div><Loader2 className={styles.spin} size={28} /><strong>DIMPRO Drive indítása</strong><span>Elérhető projektek és jogosultságok betöltése…</span></div></div>
        ) : error ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>A Drive nem indítható</strong><span>{error}</span></div></div>
        ) : !selectedProject ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>Nincs elérhető projekt</strong><span>Hozz létre új Drive projektet a jobb oldali board „Új projekt” gombjával.</span></div></div>
        ) : (
          <DriveWorkspace
            key={selectedProject.id}
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            projectCode={selectedProject.code}
            projectStatus={selectedProject.status}
            permissions={selectedProject.permissions}
          />
        )}
      </main>
    </div>
  );
}
