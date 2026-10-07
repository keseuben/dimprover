"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import DriveNavigationRail from "./DriveNavigationRail";
import DriveWorkspace from "./DriveWorkspace";
import PersonalDriveWorkspace from "./PersonalDriveWorkspace";
import FloatingProjectBoard from "./FloatingProjectBoard";
import DriveIdentityDialog from "./DriveIdentityDialog";
import type { DriveProject, DriveStorageQuota } from "./driveTypes";
import type { DriveWorkspaceOption, DriveWorkspaceRecord, DriveWorkspacesPayload } from "./driveWorkspaceTypes";
import { driveIdentityLabel, type DriveUserIdentitiesPayload, type DriveUserIdentity } from "./driveIdentityTypes";
import { type DriveNavigationRequest, type DriveNavigationTarget } from "./driveBuildInfo";
import { DRIVE_THEME_STORAGE_KEY, normalizeDriveTheme, type DriveTheme } from "./driveTheme";
import styles from "./DriveWorkspace.module.css";

const DRIVE_ACTIVE_WORKSPACE_STORAGE_KEY = "dimpro-drive-active-workspace-v1";

type DriveProvisioningInfo = {
  version: string;
  projectId: string;
  ready: boolean;
  folderCount: number;
  incomingDropFolder: { id: string; name?: string; path?: string } | null;
  pilotFolder: { id: string; name?: string; path?: string } | null;
};

type DriveProvisioningStatus = "checking" | "ready" | "repair-required" | "error";

type DriveProvisioningPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  provisioning?: DriveProvisioningInfo;
};

type CreateProjectPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
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
  const [workspaces, setWorkspaces] = useState<DriveWorkspaceRecord[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceUserEmail, setWorkspaceUserEmail] = useState<string | null>(null);
  const [userIdentities, setUserIdentities] = useState<DriveUserIdentity[]>([]);
  const [selectedProjectIdentityId, setSelectedProjectIdentityId] = useState("");
  const [showIdentityDialog, setShowIdentityDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardPinned, setBoardPinned] = useState(false);
  const [theme, setTheme] = useState<DriveTheme>("light");
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [notice, setNotice] = useState("");
  const [provisioning, setProvisioning] = useState<DriveProvisioningInfo | null>(null);
  const [provisioningStatus, setProvisioningStatus] = useState<DriveProvisioningStatus>("checking");
  const [provisioningError, setProvisioningError] = useState<string | null>(null);
  const [provisioningNotice, setProvisioningNotice] = useState<string | null>(null);
  const [provisioningRepairBusy, setProvisioningRepairBusy] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [storageQuota, setStorageQuota] = useState<DriveStorageQuota | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeNavigation, setActiveNavigation] = useState<DriveNavigationTarget>("documents");
  const [navigationRequest, setNavigationRequest] = useState<DriveNavigationRequest>({ id: 0, target: "documents" });
  const boardOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = normalizeDriveTheme(
      document.documentElement.dataset.driveTheme || window.localStorage.getItem(DRIVE_THEME_STORAGE_KEY),
    );
    setTheme(stored);
    document.documentElement.dataset.driveTheme = stored;
    document.documentElement.style.colorScheme = stored;
  }, []);

  const handleThemeChange = useCallback((nextTheme: DriveTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.driveTheme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    try {
      window.localStorage.setItem(DRIVE_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme persistence is best-effort; the active theme still applies for this session.
    }
  }, []);
  const boardCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/drive/workspaces", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as DriveWorkspacesPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A Drive munkaterek nem tölthetők be.");
      const normalized = (payload.workspaces || []).filter((workspace) => workspace?.id && (workspace.type === "PERSONAL" || workspace.type === "PROJECT"));
      let persistedWorkspaceId = "";
      try { persistedWorkspaceId = window.localStorage.getItem(DRIVE_ACTIVE_WORKSPACE_STORAGE_KEY) || ""; } catch {}
      setWorkspaces(normalized);
      setWorkspaceUserEmail(payload.user?.email || null);
      setSelectedWorkspaceId((current) => {
        if (normalized.some((workspace) => workspace.id === current)) return current;
        if (persistedWorkspaceId && normalized.some((workspace) => workspace.id === persistedWorkspaceId)) return persistedWorkspaceId;
        return normalized[0]?.id || "";
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive munkaterek nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserIdentities = useCallback(async () => {
    try {
      const response = await fetch("/api/dimpro-auth/identities", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as DriveUserIdentitiesPayload;
      if (!response.ok || !payload.ok) return;
      const next = payload.identities || [];
      setUserIdentities(next);
      const verified = next.filter((identity) => identity.status === "VERIFIED");
      setSelectedProjectIdentityId((current) => verified.some((identity) => identity.id === current) ? current : verified.find((identity) => identity.isPrimary)?.id || verified[0]?.id || "");
    } catch {
      // Identity management remains optional for workspace loading; project creation API still fails closed.
    }
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateProject) {
      setError("A projekt-only meghívotti hozzáférés nem jogosít új projekt létrehozására.");
      setShowCreateProject(false);
      return;
    }
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
          actingIdentityId: selectedProjectIdentityId,
        }),
      });
      const payload = await response.json() as CreateProjectPayload;
      if (!response.ok || !payload.ok || !payload.project) {
        throw new Error(payload.message || payload.error || "A Drive projekt nem hozható létre.");
      }
      await loadWorkspaces();
      setSelectedWorkspaceId(`project:${payload.project.id}`);
      setShowCreateProject(false);
      const pilotNote = payload.driveProvisioning?.pilotFolder ? " A PILOT mappa létrejött." : "";
      setNotice(`A Drive projekt létrejött: ${payload.project.name}.${pilotNote}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive projekt nem hozható létre.");
    } finally {
      setSavingProject(false);
    }
  }

  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => { void loadUserIdentities(); }, [loadUserIdentities]);
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    try { window.localStorage.setItem(DRIVE_ACTIVE_WORKSPACE_STORAGE_KEY, selectedWorkspaceId); } catch {}
  }, [selectedWorkspaceId]);

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

  const closeBoardImmediately = useCallback(() => {
    cancelBoardTimers();
    setBoardPinned(false);
    setBoardOpen(false);
  }, [cancelBoardTimers]);

  useEffect(() => {
    if (!boardOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-drive-navigation-surface="true"]')) return;
      closeBoardImmediately();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBoardImmediately();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [boardOpen, closeBoardImmediately]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || workspaces[0] || null,
    [workspaces, selectedWorkspaceId],
  );

  const projects = useMemo<DriveProject[]>(
    () => workspaces
      .filter((workspace) => workspace.type === "PROJECT" && Boolean(workspace.projectId))
      .map((workspace) => ({
        id: workspace.projectId as string,
        code: workspace.code || "",
        name: workspace.name,
        status: workspace.status,
        permissions: workspace.permissions || [],
      })),
    [workspaces],
  );

  const selectedProject = useMemo(
    () => selectedWorkspace?.type === "PROJECT" && selectedWorkspace.projectId
      ? projects.find((project) => project.id === selectedWorkspace.projectId) || null
      : null,
    [projects, selectedWorkspace],
  );

  const workspaceOptions = useMemo<DriveWorkspaceOption[]>(
    () => workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      code: workspace.code || null,
      kind: workspace.type,
    })),
    [workspaces],
  );

  const verifiedUserIdentities = userIdentities.filter((identity) => identity.status === "VERIFIED");
  const primaryUserIdentity = verifiedUserIdentities.find((identity) => identity.isPrimary) || verifiedUserIdentities.find((identity) => identity.email.toLowerCase() === (workspaceUserEmail || "").toLowerCase()) || verifiedUserIdentities[0] || null;
  const workspaceUserDisplayName = primaryUserIdentity?.displayName?.trim() || workspaceUserEmail || "DIMPRO felhasználó";
  const canCreateProject = workspaces.some((workspace) => workspace.type === "PERSONAL");
  const canRepairProvisioning = Boolean(selectedProject?.permissions?.includes("project.update"));

  const handleDriveNavigation = useCallback((target: DriveNavigationTarget) => {
    setActiveNavigation(target);
    setNavigationRequest((current) => ({
      id: current.id + 1,
      target,
      folderId: target === "incoming" ? provisioning?.incomingDropFolder?.id : undefined,
    }));
    closeBoardImmediately();
  }, [closeBoardImmediately, provisioning?.incomingDropFolder?.id]);

  const handleWorkspaceChange = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setActiveNavigation("documents");
    setNavigationRequest((current) => ({ id: current.id + 1, target: "documents" }));
    closeBoardImmediately();
  }, [closeBoardImmediately]);

  const handleStorageQuotaChange = useCallback((quota: DriveStorageQuota | null) => {
    setStorageQuota(quota);
    if (quota) setStorageError(null);
  }, []);

  useEffect(() => {
    const projectId = selectedProject?.id;
    setStorageQuota(null);
    setStorageError(null);
    if (!projectId) {
      setStorageLoading(false);
      return;
    }
    const controller = new AbortController();
    setStorageLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/storage`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; storage?: DriveStorageQuota };
        if (!response.ok || !payload.ok || !payload.storage) throw new Error(payload.error || "A tárhelyadat nem tölthető be.");
        if (!controller.signal.aborted) setStorageQuota(payload.storage);
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setStorageError(caught instanceof Error ? caught.message : "A tárhelyadat nem tölthető be.");
      } finally {
        if (!controller.signal.aborted) setStorageLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedProject?.id, workspaceRevision]);

  useEffect(() => {
    const projectId = selectedProject?.id;
    setProvisioning(null);
    setProvisioningError(null);
    setProvisioningNotice(null);
    setProvisioningRepairBusy(false);

    if (!projectId) {
      setProvisioningStatus("checking");
      return;
    }

    setProvisioningStatus("checking");
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/provision", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as DriveProvisioningPayload;
        if (!response.ok || payload.ok !== true || !payload.provisioning) {
          throw new Error(payload.error || payload.message || "A Drive projektkörnyezet állapota nem kérhető le.");
        }
        if (controller.signal.aborted) return;
        setProvisioning(payload.provisioning);
        setProvisioningStatus(payload.provisioning.ready ? "ready" : "repair-required");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setProvisioning(null);
        setProvisioningStatus("error");
        setProvisioningError(caught instanceof Error ? caught.message : "A Drive projektkörnyezet állapota nem kérhető le.");
      }
    })();

    return () => controller.abort();
  }, [selectedProject?.id]);

  async function handleRepairProvisioning() {
    if (!selectedProject || !canRepairProvisioning || provisioningRepairBusy) return;

    const projectId = selectedProject.id;
    setProvisioningRepairBusy(true);
    setProvisioningError(null);
    setProvisioningNotice(null);
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/provision", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = await response.json() as DriveProvisioningPayload;
      if (!response.ok || payload.ok !== true || !payload.provisioning) {
        throw new Error(payload.error || payload.message || "A Drive projektkörnyezet javítása sikertelen.");
      }
      setProvisioning(payload.provisioning);
      setProvisioningStatus(payload.provisioning.ready ? "ready" : "repair-required");
      setProvisioningError(null);
      setProvisioningNotice("A Drive projektkörnyezet javítása sikeresen lefutott.");
      setWorkspaceRevision((value) => value + 1);
    } catch (caught) {
      setProvisioningStatus("error");
      setProvisioningError(caught instanceof Error ? caught.message : "A Drive projektkörnyezet javítása sikertelen.");
    } finally {
      setProvisioningRepairBusy(false);
    }
  }

  return (
    <div
      className={`${styles.shell} ${boardOpen ? styles.shellBoardOpen : styles.shellBoardClosed} ${boardPinned ? styles.shellBoardPinned : ""}`}
      data-theme={theme}
    >
      <DriveNavigationRail
        boardOpen={boardOpen}
        onToggleBoard={toggleBoard}
        activeTarget={activeNavigation}
        onHoverOpen={openBoardSoon}
        onHoverLeave={closeBoardSoon}
        onNavigate={handleDriveNavigation}
        trashEnabled={selectedWorkspace?.type === "PERSONAL" || Boolean(selectedProject?.permissions?.includes("folder.restore"))}
      />
      <FloatingProjectBoard
        workspaceOptions={workspaceOptions}
        selectedWorkspaceId={selectedWorkspace?.id || ""}
        selectedWorkspaceType={selectedWorkspace?.type || "PROJECT"}
        pinned={boardPinned}
        activeTarget={activeNavigation}
        trashEnabled={selectedWorkspace?.type === "PERSONAL" || Boolean(selectedProject?.permissions?.includes("folder.restore"))}
        theme={theme}
        onThemeChange={handleThemeChange}
        onWorkspaceChange={handleWorkspaceChange}
        canCreateProject={canCreateProject}
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
        onNavigate={handleDriveNavigation}
        provisioning={provisioning}
        provisioningStatus={provisioningStatus}
        provisioningError={provisioningError}
        provisioningNotice={provisioningNotice}
        provisioningRepairBusy={provisioningRepairBusy}
        canRepairProvisioning={canRepairProvisioning}
        onRepairProvisioning={handleRepairProvisioning}
        storageQuota={storageQuota}
        storageLoading={storageLoading}
        storageError={storageError}
      />
      <main className={styles.main}>
        {showCreateProject && canCreateProject && (
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
                Projektindítási identitás
                <select value={selectedProjectIdentityId} onChange={(event) => setSelectedProjectIdentityId(event.target.value)} required>
                  {verifiedUserIdentities.map((identity) => <option key={identity.id} value={identity.id}>{driveIdentityLabel(identity)}</option>)}
                </select>
              </label>
              <div className={styles.projectIdentityHint}>
                <span>A projektgazda jogosultság a központi DIMPRO-fiókodhoz tartozik. A kiválasztott e-mail, név és szervezet lesz a projektben használt identitás.</span>
                <button type="button" onClick={() => setShowIdentityDialog(true)}>+ E-mail / munkahely hozzáadása</button>
              </div>
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
                <button type="submit" disabled={savingProject || !selectedProjectIdentityId}>
                  {savingProject ? <Loader2 className={styles.spin} size={16} /> : <Plus size={16} />}
                  Projekt létrehozása
                </button>
              </footer>
            </form>
          </div>
        )}
        {notice && <div className={styles.shellNotice}>{notice}</div>}
        {loading ? (
          <div className={styles.loadingState}><div><Loader2 className={styles.spin} size={28} /><strong>DIMPRO Drive indítása</strong><span>Saját és projekt munkaterek betöltése…</span></div></div>
        ) : error ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>A Drive nem indítható</strong><span>{error}</span></div></div>
        ) : !selectedWorkspace ? (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>Nincs elérhető Drive munkatér</strong><span>Saját Drive jogosultság vagy projektmeghívás szükséges.</span></div></div>
        ) : selectedWorkspace.type === "PERSONAL" ? (
          <PersonalDriveWorkspace
            key={selectedWorkspace.id + ":" + workspaceRevision}
            workspaceName={selectedWorkspace.name}
            userEmail={workspaceUserEmail}
            userDisplayName={workspaceUserDisplayName}
            workspaceOptions={workspaceOptions}
            selectedWorkspaceId={selectedWorkspace.id}
            onWorkspaceChange={handleWorkspaceChange}
            onManageIdentities={() => setShowIdentityDialog(true)}
            navigationRequest={navigationRequest}
            storageQuota={storageQuota}
            onStorageQuotaChange={handleStorageQuotaChange}
          />
        ) : selectedProject ? (
          <DriveWorkspace
            key={selectedProject.id + ":" + workspaceRevision}
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            projectCode={selectedProject.code}
            projectStatus={selectedProject.status}
            permissions={selectedProject.permissions}
            workspaceOptions={workspaceOptions}
            selectedWorkspaceId={selectedWorkspace.id}
            onWorkspaceChange={handleWorkspaceChange}
            navigationRequest={navigationRequest}
            userEmail={workspaceUserEmail}
            userDisplayName={workspaceUserDisplayName}
            onStorageQuotaChange={handleStorageQuotaChange}
          />
        ) : (
          <div className={styles.loadingState}><div><AlertTriangle size={28} /><strong>A projektmunkatér nem tölthető be</strong><span>A munkatér projektkapcsolata hiányos.</span></div></div>
        )}
      </main>
      <DriveIdentityDialog
        open={showIdentityDialog}
        onClose={() => setShowIdentityDialog(false)}
        onChanged={(identities) => {
          setUserIdentities(identities);
          const verified = identities.filter((identity) => identity.status === "VERIFIED");
          setSelectedProjectIdentityId((current) => verified.some((identity) => identity.id === current) ? current : verified.find((identity) => identity.isPrimary)?.id || verified[0]?.id || "");
          setWorkspaceRevision((value) => value + 1);
        }}
      />
    </div>
  );
}
