"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [boardOpen, setBoardOpen] = useState(true);

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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId],
  );

  return (
    <div className={`${styles.shell} ${boardOpen ? "" : styles.shellBoardClosed}`}>
      <DriveNavigationRail boardOpen={boardOpen} onToggleBoard={() => setBoardOpen((current) => !current)} />
      <FloatingProjectBoard
        projects={projects}
        selectedProjectId={selectedProject?.id || ""}
        onProjectChange={setSelectedProjectId}
        onClose={() => setBoardOpen(false)}
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
