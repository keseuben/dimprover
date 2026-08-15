"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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

export default function DriveShell() {
  const [projects, setProjects] = useState<DriveProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardPinned, setBoardPinned] = useState(false);
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
        {loading ? (
          <div className={styles.loadingState}><div><Loader2 className={styles.spin} size={28} /><strong>DIMPRO Drive indítása</strong><span>Elérhető projektek és jogosultságok betöltése…</span></div></div>
        ) : error ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>A Drive nem indítható</strong><span>{error}</span></div></div>
        ) : !selectedProject ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>Nincs elérhető projekt</strong><span>A Drive használatához legalább egy aktív projekt-hozzáférés szükséges.</span></div></div>
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
