"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Bell,
  Building2,
  HelpCircle,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import BoxShelf from "./BoxShelf";
import BottomInspectorResizeHandle from "./BottomInspectorResizeHandle";
import CommanderPanel from "./CommanderPanel";
import CompareWorkspace from "./CompareWorkspace";
import DetailsPanel from "./DetailsPanel";
import DrivePremiumLoader from "./DrivePremiumLoader";
import DriveToolbar from "./DriveToolbar";
import FileGridPanel from "./FileGridPanel";
import FolderTreePanel from "./FolderTreePanel";
import TableFullscreenBar from "./TableFullscreenBar";
import HeaderLogoutIconButton from "@/components/auth/HeaderLogoutIconButton";
import ProjectAccessMenu from "@/components/project-gate/ProjectAccessMenu";
import { projectRoleLabel } from "@/app/lib/project-core/permissions";
import type { ProjectMembership } from "@/app/lib/project-core/types";
import { hasExternalDriveFiles, prepareDroppedDriveUpload } from "./externalFileDrop";
import type {
  DriveBox,
  DriveBoxLifecycleStatus,
  DriveBoxPurpose,
  DriveCompareSeed,
  DriveDocument,
  DriveDocumentDetails,
  DriveDocumentGovernance,
  DriveHealth,
  DriveEngineeringMetadata,
  DriveIssueAccessLink,
  DriveFolder,
  DriveLayoutMode,
  DriveMetadataOptions,
  DrivePermission,
  DriveProjectSettings,
  DriveStorageQuota,
  DriveTree,
  DriveViewMode,
} from "./driveTypes";
import type { DriveNavigationRequest } from "./driveBuildInfo";
import styles from "./DriveWorkspace.module.css";

type DriveWorkspaceOption = {
  id: string;
  label: string;
  code?: string | null;
  kind: "PROJECT";
};

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  projectStatus?: string;
  permissions?: DrivePermission[];
  workspaceOptions?: DriveWorkspaceOption[];
  selectedWorkspaceId?: string;
  onWorkspaceChange?: (workspaceId: string) => void;
  navigationRequest?: DriveNavigationRequest;
  onStorageQuotaChange?: (quota: DriveStorageQuota | null) => void;
};

type ProjectMembershipRole = "OWNER" | "PROJECT_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "VIEWER";

type TreePayload = {
  ok?: boolean;
  error?: string;
  tree?: DriveTree;
  permissions?: DrivePermission[];
  membershipRole?: ProjectMembershipRole;
  membershipDisplayName?: string;
};

type FolderPasswordGateStatus = {
  folderId: string;
  passwordProtected: boolean;
  passwordUnlocked: boolean;
  unlockExpiresAt: number | null;
  unlockTtlMinutes: number | null;
  locked: boolean;
  gateFolderId: string | null;
  inheritedLock: boolean;
};

type FolderPasswordPublicConfig = {
  projectId: string;
  folderId: string;
  passwordVersion: number;
  unlockTtlMinutes: number;
  maxAttempts: number;
  lockoutMinutes: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

type FolderRenameDialogState = {
  folderId: string;
  originalName: string;
  displayName: string;
  error: string;
  busy: boolean;
};

type TrashDialogState = {
  kind: "documents" | "folder";
  documentIds: string[];
  folderId: string | null;
  title: string;
  message: string;
  folderCount: number;
  documentCount: number;
  busy: boolean;
  error: string;
};

type FolderPasswordDialogState = {
  mode: "unlock" | "manage";
  targetFolderId: string;
  gateFolderId: string;
  folderName: string;
  password: string;
  confirmPassword: string;
  unlockTtlMinutes: number;
  protected: boolean;
  passwordUnlocked: boolean;
  inheritedLock: boolean;
  error: string;
  busy: boolean;
};

type UploadInitPayload = {
  ok?: boolean;
  error?: string;
  signedUpload?: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
  browserUpload?: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
  completeUrl?: string;
  abortUrl?: string;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function localIsoDateValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}


function parseExternalIssueRecipients(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [emailPart = "", namePart = "", organizationPart = ""] = line.split("|").map((part) => part.trim());
      const email = emailPart.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(`A(z) ${index + 1}. külső címzett e-mail-címe érvénytelen.`);
      }
      return {
        type: "EMAIL" as const,
        userId: null,
        email,
        name: namePart.slice(0, 240),
        organization: organizationPart.slice(0, 240),
      };
    });
}

const browserPreviewExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

function nativeOfficeProtocol(extension: string) {
  const ext = extension.toLowerCase();
  if (["doc", "docx", "docm", "dot", "dotx"].includes(ext)) return "ms-word";
  if (["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "csv"].includes(ext)) return "ms-excel";
  if (["ppt", "pptx", "pptm", "pps", "ppsx"].includes(ext)) return "ms-powerpoint";
  return "";
}

function isPotentiallyReadableVersion(document: DriveDocument | null) {
  const status = document?.currentVersion?.status || "";
  return Boolean(document?.currentVersion) && !["REJECTED", "STAGED", "METADATA_ONLY"].includes(status);
}

export default function DriveWorkspace({
  projectId,
  projectName,
  projectCode,
  projectStatus = "ACTIVE",
  permissions = [],
  workspaceOptions = [],
  selectedWorkspaceId = "",
  onWorkspaceChange,
  navigationRequest,
  onStorageQuotaChange,
}: Props) {
  const [tree, setTree] = useState<DriveTree | null>(null);
  const [health, setHealth] = useState<DriveHealth | null>(null);
  const [storageQuota, setStorageQuota] = useState<DriveStorageQuota | null>(null);
  const [boxes, setBoxes] = useState<DriveBox[]>([]);
  const [apiPermissions, setApiPermissions] = useState<DrivePermission[]>([]);
  const [membershipRole, setMembershipRole] = useState<ProjectMembershipRole | "">("");
  const [membershipDisplayName, setMembershipDisplayName] = useState("");
  const [bootLoaderVisible, setBootLoaderVisible] = useState(true);
  const [bootLoaderComplete, setBootLoaderComplete] = useState(false);
  const bootLoaderVisibleRef = useRef(true);
  const bootLoaderHoldTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [allFilesInFolderMode, setAllFilesInFolderMode] = useState(false);
  const [newFolderEditorOpen, setNewFolderEditorOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("Új mappa");
  const [newFolderSaving, setNewFolderSaving] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [details, setDetails] = useState<DriveDocumentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [layoutMode, setLayoutMode] = useState<DriveLayoutMode>("two");
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [fullTableInspectorOpen, setFullTableInspectorOpen] = useState(false);
  const [fullTableInspectorLayout, setFullTableInspectorLayout] = useState<"side" | "bottom">("side");
  const [tableZoom, setTableZoom] = useState(100);
  const [splitDetailsHeight, setSplitDetailsHeight] = useState(390);
  const [boxShelfHeight, setBoxShelfHeight] = useState(154);
  const [viewMode, setViewMode] = useState<DriveViewMode>("engineering");
  const [metadataByDocument, setMetadataByDocument] = useState<Record<string, DriveEngineeringMetadata>>({});
  const [projectSettings, setProjectSettings] = useState<DriveProjectSettings | null>(null);
  const [reviewFocus, setReviewFocus] = useState("");
  const [detailsFocus, setDetailsFocus] = useState<{ documentId: string; field: "planNo" | "planTitle" | "scales" | "numbering" } | null>(null);
  const [boxShelfOpen, setBoxShelfOpen] = useState(false);
  const [favoriteDocumentIds, setFavoriteDocumentIds] = useState<string[]>([]);
  const [favoriteBusyDocumentIds, setFavoriteBusyDocumentIds] = useState<string[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [compareSeedItems, setCompareSeedItems] = useState<DriveCompareSeed[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const versionFileInputRef = useRef<HTMLInputElement>(null);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionDate, setRevisionDate] = useState(localIsoDateValue());
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueMembers, setIssueMembers] = useState<ProjectMembership[]>([]);
  const [issueSelectedMemberIds, setIssueSelectedMemberIds] = useState<string[]>([]);
  const [issueExternalRecipients, setIssueExternalRecipients] = useState("");
  const [issuePurpose, setIssuePurpose] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [issueGovernance, setIssueGovernance] = useState<DriveDocumentGovernance | null>(null);
  const [issueResult, setIssueResult] = useState<{
    issueNumber: string;
    recipientCount: number;
    accessLinks: DriveIssueAccessLink[];
    accessExpiresAt: string | null;
    accessLinkError: string | null;
  } | null>(null);
  const [folderRenameDialog, setFolderRenameDialog] = useState<FolderRenameDialogState | null>(null);
  const [trashDialog, setTrashDialog] = useState<TrashDialogState | null>(null);
  const [folderPasswordDialog, setFolderPasswordDialog] = useState<FolderPasswordDialogState | null>(null);
  const previousSelectedFolderIdRef = useRef(selectedFolderId);
  const browserRef = useRef<HTMLDivElement>(null);
  const splitDetailsInitializedRef = useRef(false);
  const [externalDragActive, setExternalDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const effectivePermissions = useMemo(() => [...new Set([...permissions, ...apiPermissions])], [permissions, apiPermissions]);
  const canWrite = effectivePermissions.includes("document.write");
  const canDelete = effectivePermissions.includes("document.delete");
  const canDeleteFolder = effectivePermissions.includes("folder.delete");
  const canComment = effectivePermissions.includes("document.comment");
  const canApprove = effectivePermissions.includes("document.approve");
  const canIssue = effectivePermissions.includes("document.issue");
  const canConfigureDataLists = effectivePermissions.includes("project.update");
  const canManageFolderPassword = effectivePermissions.includes("project.update");
  const securityReady = Boolean(health?.security?.ready);

  const closeTableFullscreen = useCallback(() => {
    setTableFullscreen(false);
    setFullTableInspectorOpen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const toggleTableFullscreen = useCallback(() => {
    if (tableFullscreen) {
      closeTableFullscreen();
      return;
    }
    setTableFullscreen(true);
    setFullTableInspectorOpen(false);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, [closeTableFullscreen, tableFullscreen]);

  useEffect(() => {
    return () => {
      if (bootLoaderHoldTimerRef.current !== null) {
        window.clearTimeout(bootLoaderHoldTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (layoutMode !== "split" || splitDetailsInitializedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const measuredHeight = browserRef.current?.getBoundingClientRect().height || 0;
      const workspaceHeight = measuredHeight > 0 ? measuredHeight : Math.max(500, window.innerHeight - 260);
      const minDetailsHeight = 250;
      const minMainHeight = 220;
      const resizeHandleHeight = 10;
      const maxDetailsHeight = Math.max(minDetailsHeight, workspaceHeight - minMainHeight - resizeHandleHeight);
      const halfDetailsHeight = Math.round((workspaceHeight - resizeHandleHeight) / 2);
      setSplitDetailsHeight(Math.max(minDetailsHeight, Math.min(maxDetailsHeight, halfDetailsHeight)));
      splitDetailsInitializedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [layoutMode]);

  useEffect(() => {
    if (!tableFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) closeTableFullscreen();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setTableFullscreen(false);
        setFullTableInspectorOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [closeTableFullscreen, tableFullscreen]);

  const loadBoxes = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; boxes?: DriveBox[] };
      if (!response.ok || !payload.ok) {
        if (response.status === 503) { setBoxes([]); return; }
        throw new Error(payload.error || "A CsomagBOX lista nem tölthető be.");
      }
      setBoxes(payload.boxes || []);
    } catch (caught) {
      setBoxes([]);
      setError(caught instanceof Error ? caught.message : "A CsomagBOX lista nem tölthető be.");
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [healthResponse, treeResponse, metadataResponse, storageResponse, settingsResponse, favoritesResponse] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/health`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/tree`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/metadata`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/storage`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/settings`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/favorites`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      const healthPayload = await healthResponse.json() as DriveHealth;
      const treePayload = await treeResponse.json() as TreePayload;
      const metadataPayload = await metadataResponse.json() as { ok?: boolean; metadata?: DriveEngineeringMetadata[] };
      const storagePayload = await storageResponse.json().catch(() => ({})) as { ok?: boolean; storage?: DriveStorageQuota };
      const settingsPayload = await settingsResponse.json().catch(() => ({})) as { ok?: boolean; settings?: DriveProjectSettings };
      const favoritesPayload = await favoritesResponse.json().catch(() => ({})) as { ok?: boolean; documentIds?: string[] };
      if (!healthResponse.ok || !healthPayload.ok) throw new Error(healthPayload.error || "A Drive rendszerállapot nem tölthető be.");
      if (!treeResponse.ok || !treePayload.ok || !treePayload.tree) throw new Error(treePayload.error || "A projekt dokumentumtára nem tölthető be.");
      setHealth(healthPayload);
      const nextStorageQuota = storageResponse.ok && storagePayload.ok && storagePayload.storage ? storagePayload.storage : null;
      setStorageQuota(nextStorageQuota);
      onStorageQuotaChange?.(nextStorageQuota);
      setTree(treePayload.tree);
      setApiPermissions(treePayload.permissions || []);
      setMembershipRole(treePayload.membershipRole || "");
      setMembershipDisplayName(treePayload.membershipDisplayName || "");
      setMetadataByDocument(Object.fromEntries((metadataPayload.ok ? metadataPayload.metadata || [] : []).map((item) => [item.documentId, item])));
      setProjectSettings(settingsResponse.ok && settingsPayload.ok && settingsPayload.settings ? settingsPayload.settings : null);
      setFavoriteDocumentIds(favoritesResponse.ok && favoritesPayload.ok ? favoritesPayload.documentIds || [] : []);
      if (healthPayload.workspace?.databaseReady) await loadBoxes(); else setBoxes([]);
      setSelectedFolderId((current) => current === "all" || treePayload.tree?.folders.some((folder) => folder.id === current) ? current : "all");
      setSelectedDocumentId((current) => {
        if (current && treePayload.tree?.documents.some((document) => document.id === current)) return current;
        return treePayload.tree?.documents[0]?.id || "";
      });
      if (bootLoaderVisibleRef.current) {
        setBootLoaderComplete(true);
        if (bootLoaderHoldTimerRef.current !== null) {
          window.clearTimeout(bootLoaderHoldTimerRef.current);
        }
        bootLoaderHoldTimerRef.current = window.setTimeout(() => {
          bootLoaderVisibleRef.current = false;
          setBootLoaderVisible(false);
          bootLoaderHoldTimerRef.current = null;
        }, 1800);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive betöltése sikertelen.");
      if (bootLoaderVisibleRef.current) {
        bootLoaderVisibleRef.current = false;
        setBootLoaderVisible(false);
        setBootLoaderComplete(false);
      }
    } finally {
    }
  }, [loadBoxes, onStorageQuotaChange, projectId]);

  useEffect(() => {
    if (bootLoaderHoldTimerRef.current !== null) {
      window.clearTimeout(bootLoaderHoldTimerRef.current);
      bootLoaderHoldTimerRef.current = null;
    }
    bootLoaderVisibleRef.current = true;
    setBootLoaderVisible(true);
    setBootLoaderComplete(false);
    setTree(null);
    setHealth(null);
    setStorageQuota(null);
    onStorageQuotaChange?.(null);
    setBoxes([]);
    setDetails(null);
    setMetadataByDocument({});
    setProjectSettings(null);
    setFavoriteDocumentIds([]);
    setFavoriteBusyDocumentIds([]);
    setFavoriteOnly(false);
    setMembershipRole("");
    setMembershipDisplayName("");
    setReviewFocus("");
    setSelectedFolderId("all");
    setAllFilesInFolderMode(false);
    setSelectedDocumentId("");
    void load();
  }, [load, onStorageQuotaChange, projectId]);

  const loadDetails = useCallback(async (documentId: string) => {
    if (!documentId) {
      setDetails(null);
      return;
    }
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(documentId)}/details`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; details?: DriveDocumentDetails };
      if (!response.ok || !payload.ok || !payload.details) throw new Error(payload.error || "A dokumentum részletei nem tölthetők be.");
      setDetails(payload.details);
    } catch (caught) {
      setDetails(null);
      setError(caught instanceof Error ? caught.message : "A dokumentum részletei nem tölthetők be.");
    } finally {
      setDetailsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadDetails(selectedDocumentId); }, [loadDetails, selectedDocumentId]);

  const selectedFolder = tree?.folders.find((folder) => folder.id === selectedFolderId) || null;
  const selectedDocument = tree?.documents.find((document) => document.id === selectedDocumentId) || null;

  const folderDocumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!tree) return counts;
    for (const folder of tree.folders) {
      const ids = new Set<string>([folder.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const child of tree.folders) {
          if (child.parentId && ids.has(child.parentId) && !ids.has(child.id)) {
            ids.add(child.id);
            changed = true;
          }
        }
      }
      counts.set(folder.id, tree.documents.filter((document) => ids.has(document.folderId)).length);
    }
    return counts;
  }, [tree]);

  const selectedFolderScopeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!tree || selectedFolderId === "all") return ids;
    ids.add(selectedFolderId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of tree.folders) {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [selectedFolderId, tree]);

  const visibleDocuments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("hu-HU");
    return (tree?.documents || []).filter((document) => {
      const folderMatch = favoriteOnly
        ? true
        : selectedFolderId === "all"
          ? !document.folderId
          : allFilesInFolderMode
            ? selectedFolderScopeIds.has(document.folderId)
            : document.folderId === selectedFolderId;
      const queryMatch = !normalized || [document.name, document.description, document.extension, document.source, document.currentVersion?.revisionCode || ""]
        .join(" ")
        .toLocaleLowerCase("hu-HU")
        .includes(normalized);
      const favoriteMatch = !favoriteOnly || favoriteDocumentIds.includes(document.id);
      return folderMatch && queryMatch && favoriteMatch;
    });
  }, [allFilesInFolderMode, favoriteDocumentIds, favoriteOnly, query, selectedFolderId, selectedFolderScopeIds, tree]);

  const visibleFolderCount = useMemo(() => {
    if (!tree || allFilesInFolderMode || favoriteOnly) return 0;
    const parentId = selectedFolderId === "all" ? null : selectedFolderId;
    return tree.folders.filter((folder) => folder.parentId === parentId).length;
  }, [allFilesInFolderMode, favoriteOnly, selectedFolderId, tree]);

  const fileGridSubtitle = favoriteOnly
    ? `${visibleDocuments.length} kedvenc fájl`
    : `${visibleDocuments.length} fájl · ${visibleFolderCount} mappa${allFilesInFolderMode ? " · almappákkal együtt" : ""}`;

  useEffect(() => {
    if (selectedFolderId === "all" && allFilesInFolderMode) setAllFilesInFolderMode(false);
  }, [allFilesInFolderMode, selectedFolderId]);

  useEffect(() => {
    if (previousSelectedFolderIdRef.current === selectedFolderId) return;
    previousSelectedFolderIdRef.current = selectedFolderId;
    if (newFolderSaving) return;
    setNewFolderEditorOpen(false);
    setNewFolderName("Új mappa");
  }, [selectedFolderId, newFolderSaving]);

  useEffect(() => {
    if (!navigationRequest?.id) return;
    if (navigationRequest.target === "favorites") {
      setFavoriteOnly(true);
      setSelectedFolderId("all");
      setAllFilesInFolderMode(false);
      setQuery("");
      return;
    }
    setFavoriteOnly(false);
    if (navigationRequest.target === "incoming" && navigationRequest.folderId) {
      setSelectedFolderId(navigationRequest.folderId);
      setAllFilesInFolderMode(false);
      setQuery("");
      return;
    }
    if (navigationRequest.target === "boxes") {
      setBoxShelfOpen(true);
      return;
    }
    if (navigationRequest.target === "documents") {
      setSelectedFolderId("all");
      setAllFilesInFolderMode(false);
      setQuery("");
    }
  }, [navigationRequest]);

  async function toggleFavorite(document: DriveDocument) {
    if (favoriteBusyDocumentIds.includes(document.id)) return;
    const nextFavorite = !favoriteDocumentIds.includes(document.id);
    setFavoriteBusyDocumentIds((current) => [...current, document.id]);
    setFavoriteDocumentIds((current) => nextFavorite ? [document.id, ...current.filter((id) => id !== document.id)] : current.filter((id) => id !== document.id));
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/favorites`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ documentId: document.id, favorite: nextFavorite }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; documentIds?: string[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A kedvenc állapot nem menthető.");
      if (payload.documentIds) setFavoriteDocumentIds(payload.documentIds);
    } catch (caught) {
      setFavoriteDocumentIds((current) => nextFavorite ? current.filter((id) => id !== document.id) : [document.id, ...current.filter((id) => id !== document.id)]);
      setError(caught instanceof Error ? caught.message : "A kedvenc állapot nem menthető.");
    } finally {
      setFavoriteBusyDocumentIds((current) => current.filter((id) => id !== document.id));
    }
  }

  function openNewFolderEditor() {
    if (!canWrite || newFolderSaving) return;
    setAllFilesInFolderMode(false);
    setError("");
    setNotice("");
    setNewFolderName("Új mappa");
    setNewFolderEditorOpen(true);
  }

  function cancelNewFolderEditor() {
    if (newFolderSaving) return;
    setNewFolderEditorOpen(false);
    setNewFolderName("Új mappa");
  }

  async function saveNewFolder() {
    if (!canWrite || newFolderSaving) return;
    const name = newFolderName.trim();
    if (!name) {
      setError("A mappa neve kötelező.");
      return;
    }

    setNewFolderSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/folders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: selectedFolderId === "all" ? null : selectedFolderId }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.message || "A mappa létrehozása nem sikerült.");
      }
      setNewFolderEditorOpen(false);
      setNewFolderName("Új mappa");
      setNotice("Mappa létrehozva: " + name);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "A mappa létrehozása nem sikerült.");
    } finally {
      setNewFolderSaving(false);
    }
  }

  function renameSelectedFolder() {
    if (!selectedFolder || !canWrite) return;
    const currentName = selectedFolder.displayName || selectedFolder.name;
    setFolderRenameDialog({
      folderId: selectedFolder.id,
      originalName: currentName,
      displayName: currentName,
      error: "",
      busy: false,
    });
  }

  async function submitFolderRename() {
    const dialog = folderRenameDialog;
    if (!dialog || dialog.busy) return;

    const displayName = dialog.displayName.trim();
    if (!displayName) {
      setFolderRenameDialog((current) => current ? { ...current, error: "A mappa neve kötelező." } : current);
      return;
    }
    if (displayName === dialog.originalName) {
      setFolderRenameDialog(null);
      return;
    }

    setFolderRenameDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(dialog.folderId)}/display-name`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A mappa átnevezése sikertelen.");

      setFolderRenameDialog(null);
      setNotice(`Mappa átnevezve: ${displayName}`);
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A mappa átnevezése sikertelen.";
      setFolderRenameDialog((current) => current ? { ...current, busy: false, error: message } : current);
    }
  }

  async function getFolderPasswordInfo(folderId: string) {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(folderId)}/password`,
      { credentials: "same-origin", cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      error?: string;
      status?: FolderPasswordGateStatus;
      config?: FolderPasswordPublicConfig | null;
    };
    if (!response.ok || !payload.ok || !payload.status) {
      throw new Error(payload.error || "A mappavédelem állapota nem tölthető be.");
    }
    return { status: payload.status, config: payload.config || null };
  }

  async function openFolderPasswordManageDialog(folder: DriveFolder) {
    if (!canManageFolderPassword) return;
    setBusy(true);
    setError("");
    try {
      const info = await getFolderPasswordInfo(folder.id);
      setFolderPasswordDialog({
        mode: "manage",
        targetFolderId: folder.id,
        gateFolderId: info.status.gateFolderId || folder.id,
        folderName: folder.displayName || folder.name,
        password: "",
        confirmPassword: "",
        unlockTtlMinutes: info.config?.unlockTtlMinutes || 120,
        protected: info.status.passwordProtected,
        passwordUnlocked: info.status.passwordUnlocked,
        inheritedLock: info.status.inheritedLock,
        error: "",
        busy: false,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A mappavédelem állapota nem tölthető be.");
    } finally {
      setBusy(false);
    }
  }

  async function openFolderPasswordUnlockDialog(folder: DriveFolder, targetFolderId = folder.id) {
    setBusy(true);
    setError("");
    try {
      const info = await getFolderPasswordInfo(targetFolderId);
      if (!info.status.locked) {
        setSelectedDocumentId("");
        setAllFilesInFolderMode(false);
        setSelectedFolderId(targetFolderId);
        return;
      }
      const gateFolder = tree?.folders.find((item) => item.id === info.status.gateFolderId) || folder;
      setFolderPasswordDialog({
        mode: "unlock",
        targetFolderId,
        gateFolderId: info.status.gateFolderId || folder.id,
        folderName: gateFolder.displayName || gateFolder.name,
        password: "",
        confirmPassword: "",
        unlockTtlMinutes: info.config?.unlockTtlMinutes || info.status.unlockTtlMinutes || 120,
        protected: true,
        passwordUnlocked: false,
        inheritedLock: info.status.inheritedLock,
        error: "",
        busy: false,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A mappavédelem állapota nem tölthető be.");
    } finally {
      setBusy(false);
    }
  }

  async function submitFolderUnlock() {
    const dialog = folderPasswordDialog;
    if (!dialog || dialog.mode !== "unlock" || dialog.busy) return;
    if (dialog.password.length < 8) {
      setFolderPasswordDialog((current) => current ? { ...current, error: "Add meg a mappajelszót." } : current);
      return;
    }
    setFolderPasswordDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(dialog.targetFolderId)}/password/unlock`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: dialog.password }),
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        attemptsRemaining?: number;
        lockedUntil?: string | null;
      };
      if (!response.ok || !payload.ok) {
        const suffix = typeof payload.attemptsRemaining === "number" && payload.attemptsRemaining > 0
          ? ` · Még ${payload.attemptsRemaining} próbálkozás`
          : payload.lockedUntil
            ? ` · Zárolva: ${new Date(payload.lockedUntil).toLocaleString("hu-HU")}`
            : "";
        throw new Error((payload.error || "A mappa feloldása sikertelen.") + suffix);
      }
      setFolderPasswordDialog(null);
      await load();
      setSelectedDocumentId("");
      setAllFilesInFolderMode(false);
      setSelectedFolderId(dialog.targetFolderId);
      setNotice("Jelszóvédett mappa feloldva.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A mappa feloldása sikertelen.";
      setFolderPasswordDialog((current) => current ? { ...current, busy: false, error: message, password: "" } : current);
    }
  }

  async function saveFolderPasswordProtection() {
    const dialog = folderPasswordDialog;
    if (!dialog || dialog.mode !== "manage" || dialog.busy) return;
    if (dialog.password.length < 8 || dialog.password.length > 128) {
      setFolderPasswordDialog((current) => current ? { ...current, error: "A jelszó 8–128 karakter hosszú legyen." } : current);
      return;
    }
    if (dialog.password !== dialog.confirmPassword) {
      setFolderPasswordDialog((current) => current ? { ...current, error: "A két jelszó nem egyezik." } : current);
      return;
    }
    setFolderPasswordDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(dialog.targetFolderId)}/password`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            password: dialog.password,
            unlockTtlMinutes: dialog.unlockTtlMinutes,
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        code?: string;
        status?: FolderPasswordGateStatus;
      };
      if (!response.ok || !payload.ok) {
        const codeSuffix = payload.code ? ` · ${payload.code}` : "";
        throw new Error((payload.error || "A mappavédelem mentése sikertelen.") + codeSuffix);
      }
      if (!payload.status?.passwordProtected || !payload.status.locked || payload.status.gateFolderId !== dialog.targetFolderId) {
        throw new Error("A szerver nem igazolta vissza a mappajelszó-védelem aktiválását.");
      }
      setFolderPasswordDialog(null);
      setSelectedFolderId("all");
      setSelectedDocumentId("");
      await load();
      setNotice("Mappajelszó-védelem mentve. A korábbi feloldások érvénytelenítve.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A mappavédelem mentése sikertelen.";
      setFolderPasswordDialog((current) => current ? { ...current, busy: false, error: message } : current);
    }
  }

  async function clearFolderPasswordProtection() {
    const dialog = folderPasswordDialog;
    if (!dialog || dialog.mode !== "manage" || !dialog.protected || dialog.busy) return;
    setFolderPasswordDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(dialog.targetFolderId)}/password`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; code?: string };
      if (!response.ok || !payload.ok) {
        const codeSuffix = payload.code ? ` · ${payload.code}` : "";
        throw new Error((payload.error || "A mappavédelem törlése sikertelen.") + codeSuffix);
      }
      setFolderPasswordDialog(null);
      await load();
      setNotice("Mappajelszó-védelem törölve.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A mappavédelem törlése sikertelen.";
      setFolderPasswordDialog((current) => current ? { ...current, busy: false, error: message } : current);
    }
  }

  function isExternalFileDrag(event: DragEvent<HTMLElement>) {
    return hasExternalDriveFiles(event.dataTransfer);
  }

  function handleExternalDragEnter(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event) || !canWrite) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setExternalDragActive(true);
  }

  function handleExternalDragOver(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event) || !canWrite) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleExternalDragLeave(event: DragEvent<HTMLElement>) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setExternalDragActive(false);
  }

  async function handleExternalDrop(event: DragEvent<HTMLElement>) {
    const hasExternalFiles = hasExternalDriveFiles(event.dataTransfer);
    if (!hasExternalFiles) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setExternalDragActive(false);

    if (!canWrite) {
      setError("Nincs jogosultságod fájl feltöltésére ebbe a mappába.");
      return;
    }

    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("A behúzott fájl- és mappastruktúra feldolgozása…");
    try {
      const prepared = await prepareDroppedDriveUpload({
        projectId,
        dataTransfer: event.dataTransfer,
        selectedFolderId,
        selectedFolder,
        existingFolders: tree?.folders || [],
      });

      const preparedFileCount = prepared.groups.reduce((sum, group) => sum + group.files.length, 0);
      if (preparedFileCount === 0) {
        await load();
        setError("A behúzott elem nem tartalmaz feltölthető fájlt.");
        setNotice("");
        return;
      }

      setBusy(false);
      for (const group of prepared.groups) {
        await uploadFiles(group.files, group.folder, group.originalRelativePaths);
      }
      await load();
      setNotice(
        `${preparedFileCount} fájl feldolgozva${prepared.createdFolderCount ? ` · ${prepared.createdFolderCount} mappa létrehozva.` : "."}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A behúzott fájlok vagy mappák feldolgozása sikertelen.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  function requestUpload() {
    if (!canWrite) return;
    if (selectedFolderId === "all") {
      setError("Feltöltés előtt válassz ki egy célmappát a bal oldali mappafában.");
      return;
    }
    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    fileInputRef.current?.click();
  }

  function requestSelectedVersionUpload() {
    if (!canWrite || !selectedDocument?.currentVersion) {
      setError("Új verzió feltöltéséhez jelölj ki egy írható dokumentumot.");
      return;
    }
    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    setError("");
    versionFileInputRef.current?.click();
  }

  function openRevisionUploadDialog() {
    if (!canWrite || !selectedDocument?.currentVersion) {
      setError("Új revízió létrehozásához jelölj ki egy írható dokumentumot.");
      return;
    }
    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    setRevisionFile(null);
    setRevisionReason("");
    setRevisionDate(localIsoDateValue());
    setError("");
    setRevisionDialogOpen(true);
  }

  function closeRevisionUploadDialog() {
    if (busy) return;
    setRevisionDialogOpen(false);
    setRevisionFile(null);
    setRevisionReason("");
    setRevisionDate(localIsoDateValue());
  }

  async function uploadSelectedDocumentFile(
    file: File,
    versionKind: "VERSION" | "REVISION",
    revision?: { reason: string; date: string },
  ) {
    const document = selectedDocument;
    const currentVersion = document?.currentVersion;
    if (!document || !currentVersion || !canWrite) {
      setError("A kijelölt dokumentum már nem érhető el verziófeltöltéshez.");
      return;
    }
    if (!health?.storage?.realObjectWriteEnabled) {
      setError(health?.storage?.warning || "A privát Drive feltöltés jelenleg nem aktív.");
      return;
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "" : "";
    if (document.extension && extension !== document.extension.toLowerCase()) {
      setError(`A kiválasztott fájl kiterjesztése .${extension || "—"}, a dokumentumé .${document.extension}. Verzió/revízió csak azonos fájltípusból készíthető.`);
      return;
    }
    const reason = revision?.reason.trim() || "";
    const date = revision?.date.trim() || "";
    if (versionKind === "REVISION" && !reason) {
      setError("Hivatalos revízióhoz a revízió oka kötelező.");
      return;
    }
    if (versionKind === "REVISION" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Hivatalos revízióhoz érvényes revíziódátum szükséges.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice(versionKind === "REVISION" ? "Új hivatalos revízió feltöltésének előkészítése…" : "Új fájlverzió feltöltésének előkészítése…");
    let abortUrl = "";
    try {
      const initResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/uploads/init`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          documentName: document.name,
          originalName: file.name,
          originalRelativePath: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          expectedCurrentVersion: currentVersion.versionNumber,
          versionKind,
          revisionReason: versionKind === "REVISION" ? reason : "",
          revisionDate: versionKind === "REVISION" ? date : "",
          changeNote: versionKind === "REVISION" ? `Hivatalos revízió: ${reason}` : "Új fájlverzió feltöltve.",
          source: "WEB",
        }),
      });
      const initPayload = await initResponse.json() as UploadInitPayload;
      const uploadTarget = initPayload.browserUpload || initPayload.signedUpload;
      if (!initResponse.ok || !initPayload.ok || !uploadTarget || !initPayload.completeUrl) {
        throw new Error(initPayload.error || "A verziófeltöltési munkamenet nem hozható létre.");
      }

      abortUrl = initPayload.abortUrl || "";
      setNotice(versionKind === "REVISION" ? "Revízió feltöltése a privát tárhelyre…" : "Verzió feltöltése a privát tárhelyre…");
      const objectResponse = await fetch(uploadTarget.url, {
        method: uploadTarget.method,
        credentials: initPayload.browserUpload ? "same-origin" : "omit",
        headers: uploadTarget.headers,
        body: file,
      });
      if (!objectResponse.ok) throw new Error(`A privát tárhely feltöltése sikertelen (${objectResponse.status}).`);

      setNotice("SHA-256 és biztonsági ellenőrzés…");
      const completeResponse = await fetch(initPayload.completeUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const completePayload = await completeResponse.json() as {
        ok?: boolean;
        error?: string;
        version?: {
          versionNumber?: number;
          revisionNumber?: number;
          revisionCode?: string;
          versionKind?: "INITIAL" | "VERSION" | "REVISION";
          status?: string;
        };
        securityScan?: { scan?: { status?: string } };
      };
      if (!completeResponse.ok || !completePayload.ok) {
        throw new Error(completePayload.error || "A verzió feltöltésének véglegesítése sikertelen.");
      }

      await load();
      setSelectedDocumentId(document.id);
      await loadDetails(document.id);
      const created = completePayload.version;
      const versionLabel = created?.versionNumber ? `V${created.versionNumber}` : `V${currentVersion.versionNumber + 1}`;
      const revisionLabel = created?.revisionCode || `R${String(versionKind === "REVISION" ? currentVersion.revisionNumber + 1 : currentVersion.revisionNumber).padStart(2, "0")}`;
      const securityLabel = completePayload.securityScan?.scan?.status === "CLEAN"
        ? " · Biztonsági ellenőrzés rendben."
        : " · Biztonsági ellenőrzés folyamatban.";
      setNotice(`${versionKind === "REVISION" ? "Új revízió" : "Új verzió"} létrejött: ${versionLabel} · ${revisionLabel}${securityLabel}`);

      if (versionKind === "REVISION") {
        setRevisionDialogOpen(false);
        setRevisionFile(null);
        setRevisionReason("");
        setRevisionDate(localIsoDateValue());
      }
    } catch (caught) {
      if (abortUrl) {
        await fetch(abortUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Web Drive verzió/revízió feltöltés megszakadt." }),
        }).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "A verzió vagy revízió feltöltése sikertelen.");
      setNotice("");
    } finally {
      setBusy(false);
      if (versionFileInputRef.current) versionFileInputRef.current.value = "";
    }
  }

  async function uploadFiles(files: File[], targetFolderOverride?: DriveFolder | null, originalRelativePaths?: string[]) {
    const targetFolder = targetFolderOverride || selectedFolder;
    if (!files.length) return;
    if (!canWrite) {
      setError("Nincs jogosultságod fájl feltöltésére ebbe a mappába.");
      return;
    }
    if (!targetFolder) {
      setError("A feltöltés célmappája nem található. Válassz ki egy célmappát, majd próbáld újra.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");

    let uploadedCount = 0;
    let cleanCount = 0;
    let lastDocumentId = "";
    const failures: string[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        let abortUrl = "";
        try {
          const progressLabel = files.length > 1 ? `${index + 1}/${files.length} · ` : "";
          setNotice(`${progressLabel}Feltöltés előkészítése: ${file.name}`);

          const initResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/uploads/init`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              folderId: targetFolder.id,
              documentName: file.name,
              originalName: file.name,
              originalRelativePath: originalRelativePaths?.[index] || file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              versionKind: "INITIAL",
              description: "Webes feltöltés a DIMPRO Drive Workspace felületéről.",
              changeNote: files.length > 1 ? "Web Drive tömeges feltöltés." : "Web Drive feltöltés.",
              source: "WEB",
            }),
          });
          const initPayload = await initResponse.json() as UploadInitPayload;
          const uploadTarget = initPayload.browserUpload || initPayload.signedUpload;
          if (!initResponse.ok || !initPayload.ok || !uploadTarget || !initPayload.completeUrl) {
            throw new Error(initPayload.error || "A feltöltési munkamenet nem hozható létre.");
          }

          abortUrl = initPayload.abortUrl || "";
          setNotice(`${progressLabel}Feltöltés a privát tárhelyre: ${file.name}`);
          const objectResponse = await fetch(uploadTarget.url, {
            method: uploadTarget.method,
            credentials: initPayload.browserUpload ? "same-origin" : "omit",
            headers: uploadTarget.headers,
            body: file,
          });
          if (!objectResponse.ok) {
            throw new Error(`A privát tárhely feltöltése sikertelen (${objectResponse.status}).`);
          }

          setNotice(`${progressLabel}SHA-256 és biztonsági ellenőrzés: ${file.name}`);
          const completeResponse = await fetch(initPayload.completeUrl, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          const completePayload = await completeResponse.json() as {
            ok?: boolean;
            error?: string;
            session?: { finalVersionStatus?: string };
            document?: { id?: string };
            securityScan?: {
              ok?: boolean;
              error?: string;
              code?: string;
              scan?: { status?: string; engine?: string | null; engineVersion?: string | null };
            };
          };
          if (!completeResponse.ok || !completePayload.ok) {
            throw new Error(completePayload.error || "A feltöltés véglegesítése sikertelen.");
          }

          uploadedCount += 1;
          if (completePayload.securityScan?.scan?.status === "CLEAN") cleanCount += 1;
          if (completePayload.document?.id) lastDocumentId = completePayload.document.id;
        } catch (caught) {
          if (abortUrl) {
            await fetch(abortUrl, {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason: "Web Drive kliensoldali feltöltés megszakadt." }),
            }).catch(() => undefined);
          }
          const message = caught instanceof Error ? caught.message : "A fájlfeltöltés sikertelen.";
          failures.push(`${file.name}: ${message}`);
        }
      }

      await load();
      if (lastDocumentId) setSelectedDocumentId(lastDocumentId);

      if (failures.length) {
        setNotice(uploadedCount ? `${uploadedCount}/${files.length} fájl sikeresen feltöltve.` : "");
        setError(`${failures.length}/${files.length} fájl feltöltése sikertelen. ${failures.slice(0, 3).join(" · ")}${failures.length > 3 ? ` · +${failures.length - 3} további hiba` : ""}`);
      } else if (files.length > 1) {
        setError("");
        setNotice(cleanCount === uploadedCount
          ? uploadedCount + "/" + files.length + " fájl feltöltve · Biztonsági ellenőrzés rendben. Jóváhagyásig karanténban maradnak."
          : uploadedCount + "/" + files.length + " fájl feltöltve. Jóváhagyásig karanténban maradnak.");
      } else if (cleanCount === 1) {
        setError("");
        setNotice("Feltöltés kész · Biztonsági ellenőrzés rendben. Jóváhagyásig karanténban marad.");
      } else {
        setError("");
        setNotice("A fájl feltöltődött és biztonsági ellenőrzésre vár. Jóváhagyásig karanténban marad.");
      }
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function scanSelectedVersion() {
    const version = selectedDocument?.currentVersion;
    if (!selectedDocument || !version || !canApprove) return;
    setBusy(true); setError(""); setNotice("Biztonsági ellenőrzés folyamatban…");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/versions/${encodeURIComponent(version.id)}/security-scan`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        scan?: { status?: string; engine?: string | null; engineVersion?: string | null; signatureName?: string | null };
        autoRejected?: boolean;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A biztonsági ellenőrzés sikertelen.");
      if (payload.scan?.status === "CLEAN") {
        setNotice("Biztonsági ellenőrzés rendben · A verzió jóváhagyható.");
      } else if (payload.scan?.status === "INFECTED" || payload.autoRejected) {
        setError("Biztonsági kockázat észlelve; a verzió automatikusan elutasításra került.");
      } else {
        setNotice("Biztonsági ellenőrzés állapota: " + (payload.scan?.status || "ismeretlen") + ".");
      }
      await load();
      await loadDetails(selectedDocument.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A biztonsági ellenőrzés sikertelen.");
      setNotice("");
    } finally { setBusy(false); }
  }

  async function reviewSelectedVersion(action: "APPROVE" | "REJECT") {
    const version = selectedDocument?.currentVersion;
    if (!selectedDocument || !version || !canApprove) return;
    const promptText = action === "APPROVE" ? "Jóváhagyási megjegyzés:" : "Elutasítás indoka:";
    const note = window.prompt(promptText, action === "APPROVE" ? "Biztonsági ellenőrzés rendben, kiadható." : "");
    if (note === null) return;
    if (action === "REJECT" && note.trim().length < 3) {
      setError("Elutasításkor legalább rövid indoklás szükséges.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/versions/${encodeURIComponent(version.id)}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; cleanup?: { deleted?: boolean; error?: string | null } };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A karanténdöntés sikertelen.");
      setNotice(action === "APPROVE"
        ? "A biztonságilag ellenőrzött verzió jóváhagyva és AVAILABLE állapotba került."
        : payload.cleanup?.deleted ? "A verzió elutasítva és az objektum törölve." : `A verzió elutasítva. ${payload.cleanup?.error || "Objektumtörlés függőben."}`);
      await load();
      await loadDetails(selectedDocument.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A karanténdöntés sikertelen.");
    } finally { setBusy(false); }
  }

  async function saveMetadata(input: Record<string, unknown>) {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/metadata`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A metaadat mentése sikertelen.");
      setNotice("Mérnöki és tervellenőrzési metaadatok mentve és auditálva.");
      await Promise.all([loadDetails(selectedDocument.id), load()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A metaadat mentése sikertelen."); }
    finally { setBusy(false); }
  }

  async function saveVersionNumbering(input: {
    mode: "IMPORT" | "CORRECT";
    versionNumber: number;
    revisionNumber: number;
    reason: string;
  }) {
    const document = selectedDocument;
    const version = document?.currentVersion;
    if (!document || !version || !canWrite) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/versions/${encodeURIComponent(version.id)}/numbering`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A verzió-/revíziószámozás mentése sikertelen.");
      setNotice(input.mode === "IMPORT"
        ? "A hozott dokumentum kezdő verzió-/revíziószámozása mentve és auditálva."
        : "A verzió-/revíziószámozás korrekciója mentve és auditálva.");
      await Promise.all([load(), loadDetails(document.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A verzió-/revíziószámozás mentése sikertelen.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function saveProjectSettings(metadataOptions: DriveMetadataOptions) {
    if (!canConfigureDataLists) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/settings`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadataOptions }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; settings?: DriveProjectSettings };
      if (!response.ok || !payload.ok || !payload.settings) throw new Error(payload.error || "A Drive adatlisták mentése sikertelen.");
      setProjectSettings(payload.settings);
      setNotice("A Drive metaadat-listák mentve és auditálva.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Drive adatlisták mentése sikertelen.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(note: string) {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/note`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, versionId: selectedDocument.currentVersion?.id || "" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A megjegyzés mentése sikertelen.");
      setNotice("Fájlmegjegyzés mentve és auditálva.");
      await loadDetails(selectedDocument.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A megjegyzés mentése sikertelen."); }
    finally { setBusy(false); }
  }

  async function ensureQr() {
    if (!selectedDocument || !canWrite) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(selectedDocument.id)}/qr`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selectedDocument.currentVersion?.id || "" }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A QR azonosító létrehozása sikertelen.");
      setNotice(payload.idempotent ? "Ehhez a fájlverzióhoz már tartozik aktív QR azonosító." : "QR azonosító létrehozva és auditálva.");
      await loadDetails(selectedDocument.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A QR azonosító létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function requestDownloadLink(document: DriveDocument) {
    const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/documents/" + encodeURIComponent(document.id) + "/download", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId: document.currentVersion?.id || null }),
    });
    const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string; fileName?: string } };
    if (!response.ok || !payload.ok || !payload.download?.url) {
      throw new Error(payload.error || "A letöltési link nem hozható létre.");
    }
    return payload.download as { url: string; fileName?: string };
  }

  async function openDocumentInBrowser(document: DriveDocument) {
    if (!document.currentVersion) return;
    const extension = (document.extension || "").toLowerCase();
    if (!browserPreviewExtensions.has(extension)) {
      setError("Ehhez a fájltípushoz nincs böngészős előnézet.");
      return;
    }

    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/documents/" + encodeURIComponent(document.id) + "/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: document.currentVersion.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; preview?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.preview?.url) throw new Error(payload.error || "Az előnézet nem nyitható meg.");
      if (previewWindow) previewWindow.location.href = payload.preview.url;
      else window.open(payload.preview.url, "_blank", "noopener,noreferrer");
      setNotice("Megnyitva böngészőben: " + document.name);
    } catch (caught) {
      previewWindow?.close();
      setError(caught instanceof Error ? caught.message : "A böngészős megnyitás sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function openDocumentInWindows(document: DriveDocument) {
    if (!document.currentVersion) return;
    const extension = (document.extension || "").toLowerCase();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const download = await requestDownloadLink(document);
      const protocol = nativeOfficeProtocol(extension);
      if (protocol) {
        window.location.assign(protocol + ":ofe|u|" + download.url);
        setNotice("Megnyitás Windows alkalmazásban: " + (download.fileName || document.name));
        return;
      }

      const anchor = window.document.createElement("a");
      anchor.href = download.url;
      anchor.download = download.fileName || document.name;
      anchor.rel = "noopener";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice(
        extension === "pdf"
          ? "PDF letöltve Windows alkalmazásos megnyitáshoz. A közvetlen PDF→Windows átadás a DIMPRO Drive Desktop/Bridge protokoll bekötése után lesz egykattintásos."
          : "Fájl letöltve Windows alkalmazásos megnyitáshoz: " + (download.fileName || document.name),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Windows alkalmazásos megnyitás sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadDocument(document: DriveDocument) {
    setBusy(true);
    setError("");
    try {
      const download = await requestDownloadLink(document);
      const anchor = window.document.createElement("a");
      anchor.href = download.url;
      anchor.download = download.fileName || document.name;
      anchor.rel = "noopener";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice("Letöltés indítva: " + (download.fileName || document.name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A letöltés sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  function openDocumentBox(document: DriveDocument) {
    setSelectedDocumentId(document.id);
    setBoxShelfOpen(true);
    if (fullTableInspectorOpen && fullTableInspectorLayout === "side") setFullTableInspectorOpen(false);
  }

  async function openDocument(document: DriveDocument | null = selectedDocument) {
    if (!document?.currentVersion) return;
    const extension = (document.extension || "").toLowerCase();
    setBusy(true);
    setError("");
    setNotice("");

    let previewWindow: Window | null = null;
    if (browserPreviewExtensions.has(extension)) {
      previewWindow = window.open("", "_blank");
      if (previewWindow) previewWindow.opener = null;
    }

    try {
      if (browserPreviewExtensions.has(extension)) {
        const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/drive/documents/" + encodeURIComponent(document.id) + "/preview", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ versionId: document.currentVersion.id }),
        });
        const payload = await response.json() as { ok?: boolean; error?: string; preview?: { url?: string } };
        if (!response.ok || !payload.ok || !payload.preview?.url) {
          throw new Error(payload.error || "Az előnézet nem nyitható meg.");
        }
        if (previewWindow) previewWindow.location.href = payload.preview.url;
        else window.open(payload.preview.url, "_blank", "noopener,noreferrer");
        setNotice("Megnyitva új lapon: " + document.name);
        return;
      }

      const download = await requestDownloadLink(document);
      const protocol = nativeOfficeProtocol(extension);
      if (protocol) {
        window.location.assign(protocol + ":ofe|u|" + download.url);
        setNotice("Megnyitás a Windows alkalmazásban: " + (download.fileName || document.name) + ". Ha az alkalmazás nem indul el, használd a Letöltés gombot.");
        return;
      }

      window.location.assign(download.url);
      setNotice("A fájltípushoz nincs böngészős előnézet; letöltés indítva: " + (download.fileName || document.name));
    } catch (caught) {
      previewWindow?.close();
      setError(caught instanceof Error ? caught.message : "A fájl megnyitása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelected() {
    if (!selectedDocument) return;
    await downloadDocument(selectedDocument);
  }

  function downloadFolder(folder: DriveFolder) {
    setError("");
    const url = "/api/projects/" + encodeURIComponent(projectId) + "/drive/folders/" + encodeURIComponent(folder.id) + "/download";
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "";
    anchor.rel = "noopener";
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setNotice("Mappa ZIP letöltés indítva: " + (folder.displayName || folder.name));
  }

  function downloadSelectedFolder() {
    if (!selectedFolder) {
      setError("ZIP letöltéshez válassz ki egy konkrét mappát.");
      return;
    }
    downloadFolder(selectedFolder);
  }

  function selectFolder(folderId: string) {
    if (folderId === "all") {
      setSelectedDocumentId("");
      setSelectedDocumentIds([]);
      setAllFilesInFolderMode(false);
      setSelectedFolderId("all");
      return;
    }
    const folder = tree?.folders.find((item) => item.id === folderId);
    if (!folder) {
      setError("A kiválasztott mappa már nem érhető el.");
      return;
    }
    if (folder.securityState === "PASSWORD" && !folder.passwordUnlocked) {
      void openFolderPasswordUnlockDialog(folder, folderId);
      return;
    }
    setSelectedDocumentId("");
    setSelectedDocumentIds([]);
    setAllFilesInFolderMode(false);
    setSelectedFolderId(folderId);
  }

  function setFolderFileScope(allFiles: boolean) {
    if (selectedFolderId === "all") {
      setAllFilesInFolderMode(false);
      return;
    }
    setSelectedDocumentId("");
    setSelectedDocumentIds([]);
    if (allFiles) {
      setNewFolderEditorOpen(false);
      setNewFolderName("Új mappa");
    }
    setAllFilesInFolderMode(allFiles);
  }

  const effectiveFolderClassification = useMemo(() => {
    const result = new Map<string, { discipline: string; topic: string }>();
    const byId = new Map((tree?.folders || []).map((folder) => [folder.id, folder]));
    for (const folder of tree?.folders || []) {
      const visited = new Set<string>();
      let discipline = "";
      let topic = "";
      let current: typeof folder | undefined = folder;
      while (current && !visited.has(current.id) && (!discipline || !topic)) {
        visited.add(current.id);
        discipline ||= String(current.discipline || "").trim();
        topic ||= String(current.topic || "").trim();
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      result.set(folder.id, { discipline, topic });
    }
    return result;
  }, [tree]);

  const openReviewDetail = useCallback((document: DriveDocument, field: string) => {
    setSelectedDocumentId(document.id);
    if (field === "planNo" || field === "planTitle" || field === "scales" || field === "numbering") {
      setDetailsFocus({ documentId: document.id, field });
      setReviewFocus("");
      if (layoutMode === "one") setLayoutMode("two");
      return;
    }
    setDetailsFocus(null);
    setReviewFocus(field);
  }, [layoutMode]);

  const bulkReview = useCallback(async (input: {
    documentIds?: string[];
    folderId?: string;
    includeDescendants?: boolean;
    fields: Record<string, unknown>;
  }) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/review/bulk`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; updated?: number };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A csoportos tervellenőrzés mentése sikertelen.");
      setNotice(`Csoportos tervellenőrzés mentve: ${payload.updated || 0} fájl frissítve.`);
      await load();
      if (selectedDocumentId) await loadDetails(selectedDocumentId);
      return payload.updated || 0;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A csoportos tervellenőrzés mentése sikertelen.";
      setError(message);
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [load, loadDetails, projectId, selectedDocumentId]);

  const saveSelectedReview = useCallback(async (fields: Record<string, unknown>) => {
    if (!selectedDocumentId) throw new Error("Nincs kijelölt dokumentum.");
    await bulkReview({ documentIds: [selectedDocumentId], fields });
  }, [bulkReview, selectedDocumentId]);


  const boxColorsByDocument = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const box of boxes) {
      for (const item of box.items) {
        const colors = result[item.documentId] || [];
        if (!colors.includes(box.colorToken)) colors.push(box.colorToken);
        result[item.documentId] = colors;
      }
    }
    return result;
  }, [boxes]);

  async function createBox(input: { name: string; purpose: DriveBoxPurpose; colorToken: string; iconKey: string; note: string }) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; box?: DriveBox };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX létrehozása sikertelen.");
      setNotice(`CsomagBOX létrehozva: ${input.name}`);
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A CsomagBOX létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function addDocumentToBox(boxId: string, document: DriveDocument) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/items`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: document.id, versionId: document.currentVersion?.id || null }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl CsomagBOX-hoz adása sikertelen.");
      const boxName = boxes.find((box) => box.id === boxId)?.name || "CsomagBOX";
      setNotice(payload.idempotent ? `${document.name} már szerepel ebben a BOX-ban.` : `${document.name} hozzáadva: ${boxName}`);
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl CsomagBOX-hoz adása sikertelen."); }
    finally { setBusy(false); }
  }

  async function createBoxFolder(boxId: string, parentId: string | null, name: string) {
    if (!canWrite || !health?.workspace?.databaseReady || !name.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/folders`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX mappa létrehozása sikertelen.");
      setNotice(`CsomagBOX mappa létrehozva: ${name.trim()}`);
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A CsomagBOX mappa létrehozása sikertelen."); }
    finally { setBusy(false); }
  }

  async function moveBoxItemToFolder(boxId: string, itemId: string, folderId: string | null) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(itemId)}/move`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX elem áthelyezése sikertelen.");
      setNotice(folderId ? "Fájl CsomagBOX mappába helyezve." : "Fájl visszahelyezve a CsomagBOX gyökerébe.");
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A CsomagBOX elem áthelyezése sikertelen."); }
    finally { setBusy(false); }
  }

  async function setBoxLifecycle(boxId: string, nextStatus: DriveBoxLifecycleStatus) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/lifecycle`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextStatus }),
        },
      );
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX állapot módosítása sikertelen.");
      const label: Record<DriveBoxLifecycleStatus, string> = {
        DRAFT: "Piszkozat",
        READY: "Elkészített",
        SENT: "Kiküldött",
        ARCHIVED: "Archivált",
      };
      setNotice(`CsomagBOX állapot: ${label[nextStatus]}`);
      await loadBoxes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A CsomagBOX állapot módosítása sikertelen.");
    } finally {
      setBusy(false);
    }
  }

  function downloadBoxArchive(box: DriveBox, archiveName: string) {
    const normalized = archiveName.trim();
    if (!normalized) return;
    const url = `/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(box.id)}/download?name=${encodeURIComponent(normalized)}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${normalized.replace(/\.zip$/i, "") || "DIMPRO_CsomagBOX"}.zip`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice(`ZIP csomag előkészítése: ${normalized}`);
  }

  async function removeBoxItem(boxId: string, itemId: string) {
    if (!canWrite || !health?.workspace?.databaseReady) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A fájl eltávolítása a BOX-ból sikertelen.");
      setNotice("Fájl eltávolítva a CsomagBOX-ból.");
      await loadBoxes();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A fájl eltávolítása a BOX-ból sikertelen."); }
    finally { setBusy(false); }
  }

  function folderTrashSummary(folderId: string) {
    const folderIds = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of tree?.folders || []) {
        if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
          folderIds.add(folder.id);
          changed = true;
        }
      }
    }
    const documentCount = (tree?.documents || []).filter((document) => folderIds.has(document.folderId)).length;
    return { folderCount: folderIds.size, documentCount };
  }

  async function deleteDocuments(documentIds: string[]) {
    if (!canDelete || !documentIds.length || busy) return;
    const uniqueIds = [...new Set(documentIds)];
    setTrashDialog({
      kind: "documents",
      documentIds: uniqueIds,
      folderId: null,
      title: uniqueIds.length === 1 ? "Dokumentum Lomtárba helyezése" : `${uniqueIds.length} dokumentum Lomtárba helyezése`,
      message: "A fájlok nem törlődnek fizikailag. A művelet auditálva lesz.",
      folderCount: 0,
      documentCount: uniqueIds.length,
      busy: false,
      error: "",
    });
  }

  function deleteFolder(folder: DriveFolder) {
    if (!canDeleteFolder || busy) return;
    const summary = folderTrashSummary(folder.id);
    setTrashDialog({
      kind: "folder",
      documentIds: [],
      folderId: folder.id,
      title: "Mappa Lomtárba helyezése",
      message: `${folder.displayName || folder.name} · a teljes almappastruktúra a Lomtárba kerül.`,
      folderCount: summary.folderCount,
      documentCount: summary.documentCount,
      busy: false,
      error: "",
    });
  }

  async function confirmTrashDialog() {
    const dialog = trashDialog;
    if (!dialog || dialog.busy) return;
    setTrashDialog((current) => current ? { ...current, busy: true, error: "" } : current);
    setError("");
    setNotice("");

    try {
      if (dialog.kind === "documents") {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/bulk-delete`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentIds: dialog.documentIds }),
        });
        const payload = await response.json() as { ok?: boolean; error?: string; deletedIds?: string[]; deletedCount?: number; blockedCount?: number };
        if (!response.ok || !payload.ok) throw new Error(payload.error || "A dokumentumok törlése sikertelen.");
        const deletedIds = payload.deletedIds || [];
        setSelectedDocumentIds((current) => current.filter((id) => !deletedIds.includes(id)));
        if (deletedIds.includes(selectedDocumentId)) { setSelectedDocumentId(""); setDetails(null); }
        const blocked = Number(payload.blockedCount || 0);
        setNotice(`${payload.deletedCount || 0} dokumentum Lomtárba helyezve.${blocked ? ` ${blocked} formálisan kiadott dokumentum nem törölhető.` : ""}`);
      } else {
        if (!dialog.folderId) throw new Error("A mappa azonosítója hiányzik.");
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/folders/${encodeURIComponent(dialog.folderId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const payload = await response.json() as {
          ok?: boolean;
          error?: string;
          code?: string;
          archivedFolderCount?: number;
          deletedDocumentCount?: number;
        };
        if (!response.ok || !payload.ok) {
          const suffix = payload.code ? ` · ${payload.code}` : "";
          throw new Error((payload.error || "A mappa Lomtárba helyezése sikertelen.") + suffix);
        }
        if (selectedFolderId === dialog.folderId) setSelectedFolderId("all");
        setSelectedDocumentId("");
        setSelectedDocumentIds([]);
        setDetails(null);
        setNotice(`${payload.archivedFolderCount || 0} mappa és ${payload.deletedDocumentCount || 0} dokumentum Lomtárba helyezve.`);
      }

      setTrashDialog(null);
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A Lomtár művelet sikertelen.";
      setTrashDialog((current) => current ? { ...current, busy: false, error: message } : current);
    }
  }

  async function moveDocument(document: DriveDocument, targetFolderId: string) {
    if (!canWrite || !health?.workspace?.databaseReady || !targetFolderId) return;
    if (document.folderId === targetFolderId) {
      setNotice(`${document.name} már ebben a mappában található.`);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/move`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetFolderId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; idempotent?: boolean };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A dokumentum áthelyezése sikertelen.");
      const targetName = tree?.folders.find((folder) => folder.id === targetFolderId)?.name || "célmappa";
      setNotice(payload.idempotent ? `${document.name} már a kiválasztott mappában volt.` : `${document.name} áthelyezve: ${targetName}`);
      await load();
      setSelectedDocumentId(document.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A dokumentum áthelyezése sikertelen."); }
    finally { setBusy(false); }
  }

  function openCompare(seedItems?: DriveCompareSeed[]) {
    const validSeeds: DriveCompareSeed[] = [];
    for (const seed of seedItems || []) {
      if (!seed.documentId || !(tree?.documents || []).some((document) => document.id === seed.documentId)) continue;
      const key = `${seed.documentId}::${seed.versionId || "current"}`;
      if (validSeeds.some((item) => `${item.documentId}::${item.versionId || "current"}` === key)) continue;
      validSeeds.push({ documentId: seed.documentId, versionId: seed.versionId || null });
      if (validSeeds.length >= 2) break;
    }
    if (validSeeds.length >= 2) {
      setCompareSeedItems(validSeeds);
    } else {
      const selected = (tree?.documents || []).find((document) => document.id === selectedDocumentId) || null;
      const fallback = (tree?.documents || []).find((document) => document.id !== selected?.id) || null;
      setCompareSeedItems([
        selected ? { documentId: selected.id, versionId: selected.currentVersion?.id || null } : null,
        fallback ? { documentId: fallback.id, versionId: fallback.currentVersion?.id || null } : null,
      ].filter((item): item is DriveCompareSeed => Boolean(item)));
    }
    setCompareActive(true);
  }

  async function openIssueDialog() {
    const document = selectedDocument;
    const version = document?.currentVersion;
    if (!canIssue || !document || !version) {
      setError("Formális kiadáshoz jelölj ki egy dokumentumverziót, amelyhez van kiadási jogosultságod.");
      return;
    }
    if (!health?.documentFlow?.ready) {
      setError(health?.documentFlow?.nextStep || "A Document Flow kiadási motor jelenleg nem áll készen.");
      return;
    }

    setIssueDialogOpen(true);
    setIssueLoading(true);
    setIssueSelectedMemberIds([]);
    setIssueExternalRecipients("");
    setIssuePurpose("");
    setIssueNote("");
    setIssueGovernance(null);
    setIssueResult(null);
    setError("");
    try {
      const [membershipResponse, flowResponse] = await Promise.all([
        fetch(`/api/projects/${encodeURIComponent(projectId)}/memberships`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/document-flow`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ]);
      const membershipPayload = await membershipResponse.json() as {
        ok?: boolean;
        error?: string;
        memberships?: ProjectMembership[];
      };
      const flowPayload = await flowResponse.json() as {
        ok?: boolean;
        error?: string;
        governance?: DriveDocumentGovernance[];
      };
      if (!membershipResponse.ok || !membershipPayload.ok) {
        throw new Error(membershipPayload.error || "A projekt címzettlistája nem tölthető be.");
      }
      if (!flowResponse.ok || !flowPayload.ok) {
        throw new Error(flowPayload.error || "A dokumentum kiadási állapota nem tölthető be.");
      }
      setIssueMembers((membershipPayload.memberships || []).filter((member) => member.status === "ACTIVE"));
      setIssueGovernance((flowPayload.governance || []).find((item) => item.versionId === version.id) || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A formális kiadás előkészítése sikertelen.");
    } finally {
      setIssueLoading(false);
    }
  }

  function closeIssueDialog() {
    if (issueLoading) return;
    setIssueDialogOpen(false);
    setIssueResult(null);
  }

  function toggleIssueMember(memberId: string) {
    setIssueSelectedMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  async function submitFormalIssue() {
    const document = selectedDocument;
    const version = document?.currentVersion;
    if (!canIssue || !document || !version) {
      setError("A kijelölt dokumentumverzió már nem adható ki.");
      return;
    }
    if (version.status !== "AVAILABLE" || issueGovernance?.reviewDecision !== "APPROVED" || issueGovernance.businessStatus !== "ERVENYES") {
      setError("Formális kiadás csak AVAILABLE + APPROVED + ERVENYES dokumentumverzióból készíthető.");
      return;
    }
    const purpose = issuePurpose.trim();
    if (!purpose) {
      setError("A formális kiadás célja kötelező.");
      return;
    }

    let externalRecipients: ReturnType<typeof parseExternalIssueRecipients>;
    try {
      externalRecipients = parseExternalIssueRecipients(issueExternalRecipients);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A külső címzettek listája érvénytelen.");
      return;
    }

    const memberRecipients = issueMembers
      .filter((member) => issueSelectedMemberIds.includes(member.id))
      .map((member) => ({
        type: "PROJECT_MEMBER" as const,
        userId: member.userId,
        email: member.email || null,
        name: member.displayName || member.email || member.userId,
        organization: member.organizationName || "",
      }));
    const seen = new Set<string>();
    const recipients = [...memberRecipients, ...externalRecipients].filter((recipient) => {
      const key = recipient.type === "PROJECT_MEMBER"
        ? `user:${recipient.userId || ""}`
        : `email:${recipient.email || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!recipients.length) {
      setError("A formális kiadáshoz legalább egy címzettet válassz ki vagy adj meg.");
      return;
    }

    setIssueLoading(true);
    setError("");
    setNotice("Formális dokumentumkiadás létrehozása…");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/versions/${encodeURIComponent(version.id)}/issue`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            purpose,
            note: issueNote.trim(),
            recipients,
          }),
        },
      );
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        issue?: { issueNumber?: string };
        governance?: DriveDocumentGovernance;
        recipientCount?: number;
        accessLinks?: DriveIssueAccessLink[];
        accessExpiresAt?: string | null;
        accessLinkError?: string | null;
      };
      if (!response.ok || !payload.ok || !payload.issue?.issueNumber) {
        throw new Error(payload.error || "A dokumentum formális kiadása sikertelen.");
      }
      if (payload.governance) setIssueGovernance(payload.governance);
      setIssueResult({
        issueNumber: payload.issue.issueNumber,
        recipientCount: Number(payload.recipientCount || recipients.length),
        accessLinks: payload.accessLinks || [],
        accessExpiresAt: payload.accessExpiresAt || null,
        accessLinkError: payload.accessLinkError || null,
      });
      setNotice(`Dokumentum formálisan kiadva: ${payload.issue.issueNumber} · ${Number(payload.recipientCount || recipients.length)} címzett.`);
      await Promise.all([load(), loadDetails(document.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A dokumentum formális kiadása sikertelen.");
      setNotice("");
    } finally {
      setIssueLoading(false);
    }
  }

  function toggleCompare() {
    if (compareActive) {
      setCompareActive(false);
      return;
    }
    openCompare();
  }

  if (bootLoaderVisible) {
    return <DrivePremiumLoader complete={bootLoaderComplete} />;
  }

  const browserClass = [
    styles.browser,
    layoutMode === "two" ? styles.layoutTwo : "",
    layoutMode === "one" ? styles.layoutOne : "",
    layoutMode === "split" ? styles.layoutSplit : "",
    layoutMode === "commander" ? styles.layoutCommander : "",
  ].filter(Boolean).join(" ");

  const folderHidden = layoutMode !== "three";
  const detailsHidden = layoutMode === "one";
  const titleBase = favoriteOnly ? "Kedvencek" : selectedFolder?.displayName || selectedFolder?.name || "Dokumentumtár";
  const title = allFilesInFolderMode && selectedFolder ? titleBase + " · Összes fájl" : titleBase;
  const breadcrumbParts = (selectedFolder?.displayPath || selectedFolder?.path || "").split("/").filter(Boolean);

  return (

<div
  className={`${styles.workspaceWrap} ${layoutMode === "split" ? styles.workspaceWrapSplit : ""} ${boxShelfOpen ? styles.workspaceWrapShelfOpen : styles.workspaceWrapShelfCollapsed}`}
      style={boxShelfOpen ? { paddingBottom: `${boxShelfHeight + 36}px` } : undefined}
  onDragEnter={handleExternalDragEnter}
  onDragOver={handleExternalDragOver}
  onDragLeave={handleExternalDragLeave}
  onDrop={(event) => void handleExternalDrop(event)}
>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><Building2 size={18} /></div>
          <div>
            <h1>{projectName}</h1>
            <div className={styles.projectMeta}>
              <span>Projekt azonosító: {projectCode || projectId}</span>
              <span className={styles.activeBadge}>{projectStatus === "ACTIVE" ? "Aktív projekt" : projectStatus}</span>
              <span>{tree?.summary.documentCount || 0} fájl</span>
              {storageQuota && (
                <span
                  className={styles.projectStorageMeter}
                  data-level={storageQuota.usagePercent >= storageQuota.criticalPercent ? "critical" : storageQuota.usagePercent >= storageQuota.warningPercent ? "warning" : "normal"}
                  title={`Foglalt: ${formatBytes(storageQuota.usedBytes)} · Függőben: ${formatBytes(storageQuota.reservedBytes)} · Keret: ${formatBytes(storageQuota.quotaBytes)}`}
                >
                  <span className={styles.projectStorageLabel}>Tárhely {formatBytes(storageQuota.occupiedBytes)} / {formatBytes(storageQuota.quotaBytes)}</span>
                  <i><b style={{ width: `${Math.max(0, Math.min(100, storageQuota.usagePercent))}%` }} /></i>
                </span>
              )}
            </div>
          </div>
        </div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? (
          <div className={styles.workspaceSelectorWrap}>
            <label className={styles.workspaceSelectorLabel} htmlFor="drive-workspace-selector">Munkatér</label>
            <select
              id="drive-workspace-selector"
              className={styles.workspaceSelector}
              value={selectedWorkspaceId}
              onChange={(event) => onWorkspaceChange?.(event.target.value)}
              aria-label="Drive munkatér kiválasztása"
            >
              {workspaceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}{option.code ? " · " + option.code : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button>
          <button type="button" className={styles.headerAction}><HelpCircle size={14} /> Súgó</button>
          <ProjectAccessMenu projectId={projectId} compact />
          <div className={styles.userPill}>
            <span className={styles.avatar}>{(membershipDisplayName || "D").trim().charAt(0).toUpperCase() || "D"}</span>
            <div>
              <strong>{membershipDisplayName || "DIMPRO felhasználó"}</strong>
              <span>{projectRoleLabel(membershipRole)}</span>
            </div>
          </div>
          <HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} />
        </div>
      </header>

      <DriveToolbar
        query={query}
        onQueryChange={setQuery}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        tableFullscreen={tableFullscreen}
        onToggleTableFullscreen={toggleTableFullscreen}
        tableZoom={tableZoom}
        onTableZoomChange={setTableZoom}
        canWrite={canWrite}
        onCreateFolder={openNewFolderEditor}
        onUpload={requestUpload}
        canUploadSelectedVersion={Boolean(canWrite && selectedDocument?.currentVersion && health?.storage?.realObjectWriteEnabled)}
        onUploadSelectedVersion={requestSelectedVersionUpload}
        canUploadSelectedRevision={Boolean(canWrite && selectedDocument?.currentVersion && health?.storage?.realObjectWriteEnabled)}
        onUploadSelectedRevision={openRevisionUploadDialog}
        canOpenSelected={isPotentiallyReadableVersion(selectedDocument)}
        canDownloadSelected={isPotentiallyReadableVersion(selectedDocument)}
        canDownloadFolder={Boolean(selectedFolder)}
        onOpenSelected={() => void openDocument()}
        onDownloadSelected={() => void downloadSelected()}
        onDownloadFolder={downloadSelectedFolder}
        boxCount={boxes.length}
        boxShelfOpen={boxShelfOpen}
        boxReady={Boolean(health?.workspace?.databaseReady)}
        onToggleBoxShelf={() => setBoxShelfOpen((current) => !current)}
        compareActive={compareActive}
        onToggleCompare={toggleCompare}
        canIssueSelected={Boolean(canIssue && selectedDocument?.currentVersion && health?.documentFlow?.ready)}
        onIssueSelected={() => void openIssueDialog()}
      />
      <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { const files = Array.from(event.target.files || []); if (files.length) void uploadFiles(files); }} aria-label="Egy vagy több fájl feltöltése" />
      <input
        ref={versionFileInputRef}
        type="file"
        hidden
        accept={selectedDocument?.extension ? `.${selectedDocument.extension}` : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadSelectedDocumentFile(file, "VERSION");
        }}
        aria-label="Új verzió fájljának kiválasztása"
      />

      {folderRenameDialog && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Mappa átnevezése">
          <form
            className={`${styles.projectCreatePanel} ${styles.folderRenameDialogPanel}`}
            onSubmit={(event) => { event.preventDefault(); void submitFolderRename(); }}
          >
            <header>
              <div>
                <small>DIMPRO Drive · Mappa</small>
                <strong>Mappa átnevezése</strong>
                <span>Az új név azonnal megjelenik a mappafában és a fájltáblában.</span>
              </div>
              <button type="button" disabled={folderRenameDialog.busy} onClick={() => setFolderRenameDialog(null)} aria-label="Bezárás">×</button>
            </header>
            <label>
              Mappa neve
              <input
                autoFocus
                value={folderRenameDialog.displayName}
                maxLength={240}
                onChange={(event) => setFolderRenameDialog((current) => current ? { ...current, displayName: event.target.value, error: "" } : current)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            {folderRenameDialog.error && <div className={`${styles.notice} ${styles.noticeError}`}>{folderRenameDialog.error}</div>}
            <footer>
              <button type="button" disabled={folderRenameDialog.busy} onClick={() => setFolderRenameDialog(null)}>Mégsem</button>
              <button type="submit" disabled={folderRenameDialog.busy || !folderRenameDialog.displayName.trim()}>
                {folderRenameDialog.busy ? "Mentés…" : "Átnevezés"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {trashDialog && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label={trashDialog.title}>
          <form
            className={`${styles.projectCreatePanel} ${styles.trashDialogPanel}`}
            onSubmit={(event) => { event.preventDefault(); void confirmTrashDialog(); }}
          >
            <header>
              <div>
                <small>DIMPRO Drive · Lomtár</small>
                <strong>{trashDialog.title}</strong>
                <span>{trashDialog.message}</span>
              </div>
              <button type="button" disabled={trashDialog.busy} onClick={() => setTrashDialog(null)} aria-label="Bezárás">×</button>
            </header>
            <div className={styles.trashDialogSummary}>
              {trashDialog.folderCount > 0 && <span><strong>{trashDialog.folderCount}</strong> mappa</span>}
              <span><strong>{trashDialog.documentCount}</strong> dokumentum</span>
            </div>
            <div className={styles.revisionIssueHint}>
              <strong>Visszaállítható soft delete</strong>
              <span>A fizikai fájlok most nem törlődnek. Formálisan kiadott dokumentumot tartalmazó mappafa törlése blokkolva lesz.</span>
            </div>
            {trashDialog.error && <div className={`${styles.notice} ${styles.noticeError}`}>{trashDialog.error}</div>}
            <footer>
              <button type="button" disabled={trashDialog.busy} onClick={() => setTrashDialog(null)}>Mégsem</button>
              <button type="submit" className={styles.dangerButton} disabled={trashDialog.busy}>
                {trashDialog.busy ? "Áthelyezés…" : "Lomtárba helyezés"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {folderPasswordDialog && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label={folderPasswordDialog.mode === "unlock" ? "Jelszóvédett mappa feloldása" : "Mappavédelem beállítása"}>
          <form
            className={`${styles.projectCreatePanel} ${styles.folderPasswordDialogPanel}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (folderPasswordDialog.mode === "unlock") void submitFolderUnlock();
              else void saveFolderPasswordProtection();
            }}
          >
            <header>
              <div>
                <small>DIMPRO Drive · Mappavédelem</small>
                <strong>{folderPasswordDialog.mode === "unlock" ? "Jelszóvédett mappa feloldása" : "Mappavédelem"}</strong>
                <span>{folderPasswordDialog.folderName}</span>
              </div>
              <button type="button" disabled={folderPasswordDialog.busy} onClick={() => setFolderPasswordDialog(null)} aria-label="Bezárás">×</button>
            </header>

            {folderPasswordDialog.mode === "unlock" ? (
              <>
                <div className={styles.folderPasswordInfo}>
                  <Lock size={18} />
                  <div>
                    <strong>A mappa tartalma zárolt.</strong>
                    <span>{folderPasswordDialog.inheritedLock ? "A hozzáférést egy szülőmappa jelszavas védelme korlátozza." : "A tartalom megnyitásához add meg a mappajelszót."}</span>
                  </div>
                </div>
                <label>
                  Mappajelszó
                  <input
                    autoFocus
                    type="password"
                    minLength={8}
                    maxLength={128}
                    autoComplete="current-password"
                    value={folderPasswordDialog.password}
                    onChange={(event) => setFolderPasswordDialog((current) => current ? { ...current, password: event.target.value, error: "" } : current)}
                  />
                </label>
              </>
            ) : (
              <>
                <div className={styles.folderPasswordInfo}>
                  {folderPasswordDialog.protected ? <ShieldCheck size={18} /> : <Lock size={18} />}
                  <div>
                    <strong>{folderPasswordDialog.protected ? "A mappa jelenleg jelszóval védett." : "Jelszavas védelem beállítása"}</strong>
                    <span>Az ACL-jogosultságok továbbra is elsődlegesek. A jelszó csak további hozzáférési korlátozás.</span>
                  </div>
                </div>
                <div className={styles.projectCreateGrid}>
                  <label>
                    {folderPasswordDialog.protected ? "Új jelszó" : "Jelszó"}
                    <input
                      type="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={folderPasswordDialog.password}
                      onChange={(event) => setFolderPasswordDialog((current) => current ? { ...current, password: event.target.value, error: "" } : current)}
                    />
                  </label>
                  <label>
                    Jelszó ismét
                    <input
                      type="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={folderPasswordDialog.confirmPassword}
                      onChange={(event) => setFolderPasswordDialog((current) => current ? { ...current, confirmPassword: event.target.value, error: "" } : current)}
                    />
                  </label>
                  <label>
                    Feloldás érvényessége
                    <select
                      value={folderPasswordDialog.unlockTtlMinutes}
                      onChange={(event) => setFolderPasswordDialog((current) => current ? { ...current, unlockTtlMinutes: Number(event.target.value) } : current)}
                    >
                      <option value={30}>30 perc</option>
                      <option value={60}>1 óra</option>
                      <option value={120}>2 óra</option>
                      <option value={480}>8 óra</option>
                      <option value={1440}>24 óra</option>
                    </select>
                  </label>
                </div>
                <div className={styles.revisionIssueHint}>
                  <strong>Biztonsági szabály</strong>
                  <span>A jelszó nem kerül olvasható formában eltárolásra. Jelszócsere minden korábbi feloldást érvénytelenít.</span>
                </div>
              </>
            )}

            {folderPasswordDialog.error && <div className={`${styles.notice} ${styles.noticeError}`}>{folderPasswordDialog.error}</div>}

            <footer>
              {folderPasswordDialog.mode === "unlock" && canManageFolderPassword && (
                <button
                  type="button"
                  disabled={folderPasswordDialog.busy}
                  onClick={() => {
                    const folder = tree?.folders.find((item) => item.id === folderPasswordDialog.gateFolderId);
                    if (folder) void openFolderPasswordManageDialog(folder);
                  }}
                >
                  Védelem kezelése
                </button>
              )}
              {folderPasswordDialog.mode === "manage" && folderPasswordDialog.protected && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={folderPasswordDialog.busy}
                  onClick={() => void clearFolderPasswordProtection()}
                >
                  Védelem törlése
                </button>
              )}
              <button type="button" disabled={folderPasswordDialog.busy} onClick={() => setFolderPasswordDialog(null)}>Mégsem</button>
              <button
                type="submit"
                disabled={
                  folderPasswordDialog.busy
                  || folderPasswordDialog.password.length < 8
                  || (folderPasswordDialog.mode === "manage" && folderPasswordDialog.password !== folderPasswordDialog.confirmPassword)
                }
              >
                {folderPasswordDialog.busy ? <Loader2 className={styles.spin} size={16} /> : null}
                {folderPasswordDialog.mode === "unlock" ? "Mappa feloldása" : folderPasswordDialog.protected ? "Jelszó módosítása" : "Védelem bekapcsolása"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {revisionDialogOpen && selectedDocument?.currentVersion && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Új hivatalos dokumentumrevízió">
          <form
            className={styles.projectCreatePanel}
            onSubmit={(event) => {
              event.preventDefault();
              if (revisionFile) void uploadSelectedDocumentFile(revisionFile, "REVISION", { reason: revisionReason, date: revisionDate });
            }}
          >
            <header>
              <div>
                <small>DIMPRO Drive · Revíziókezelés</small>
                <strong>Új hivatalos revízió</strong>
                <span>{selectedDocument.name}</span>
              </div>
              <button type="button" disabled={busy} onClick={closeRevisionUploadDialog} aria-label="Bezárás">×</button>
            </header>

            <div className={styles.revisionUploadSummary}>
              <div>
                <span>Jelenlegi állapot</span>
                <strong>V{selectedDocument.currentVersion.versionNumber} · {selectedDocument.currentVersion.revisionCode || `R${String(selectedDocument.currentVersion.revisionNumber).padStart(2, "0")}`}</strong>
              </div>
              <div>
                <span>Létrejövő állapot</span>
                <strong>V{selectedDocument.currentVersion.versionNumber + 1} · R{String(selectedDocument.currentVersion.revisionNumber + 1).padStart(2, "0")}</strong>
              </div>
            </div>

            <label>
              Revízió oka
              <textarea
                required
                rows={3}
                maxLength={1000}
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                placeholder="Miért szükséges a hivatalos revízió?"
              />
            </label>

            <div className={styles.projectCreateGrid}>
              <label>
                Revízió dátuma
                <input type="date" required value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} />
              </label>
              <label>
                Új revízió fájlja
                <input
                  type="file"
                  required
                  accept={selectedDocument.extension ? `.${selectedDocument.extension}` : undefined}
                  onChange={(event) => setRevisionFile(event.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className={styles.revisionIssueHint}>
              <strong>Kiadási státusz: NOT_ISSUED</strong>
              <span>A revízió létrehozása nem jelent formális kiadást. Az ISSUED / KIADOTT állapot külön, címzettekkel auditált Document Flow kiadási művelet.</span>
            </div>

            <footer>
              <button type="button" disabled={busy} onClick={closeRevisionUploadDialog}>Mégsem</button>
              <button type="submit" disabled={busy || !revisionFile || !revisionReason.trim() || !revisionDate}>
                {busy ? <Loader2 className={styles.spin} size={16} /> : null}
                Revízió feltöltése
              </button>
            </footer>
          </form>
        </div>
      )}

      {issueDialogOpen && selectedDocument?.currentVersion && (
        <div className={styles.projectCreateOverlay} role="dialog" aria-modal="true" aria-label="Formális dokumentumkiadás">
          <form
            className={`${styles.projectCreatePanel} ${styles.issueDialogPanel}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (!issueResult) void submitFormalIssue();
            }}
          >
            <header>
              <div>
                <small>DIMPRO Drive · Document Flow</small>
                <strong>Formális dokumentumkiadás</strong>
                <span>{selectedDocument.name} · V{selectedDocument.currentVersion.versionNumber} · {selectedDocument.currentVersion.revisionCode}</span>
              </div>
              <button type="button" disabled={issueLoading} onClick={closeIssueDialog} aria-label="Bezárás">×</button>
            </header>

            <div className={styles.issueReadinessGrid}>
              <div data-ready={selectedDocument.currentVersion.status === "AVAILABLE" ? "true" : "false"}>
                <span>Fájlállapot</span>
                <strong>{selectedDocument.currentVersion.status}</strong>
              </div>
              <div data-ready={issueGovernance?.reviewDecision === "APPROVED" ? "true" : "false"}>
                <span>Review</span>
                <strong>{issueGovernance?.reviewDecision || "—"}</strong>
              </div>
              <div data-ready={issueGovernance?.businessStatus === "ERVENYES" ? "true" : "false"}>
                <span>Üzleti státusz</span>
                <strong>{issueGovernance?.businessStatus || "—"}</strong>
              </div>
            </div>

            {issueLoading && !issueResult ? (
              <div className={styles.issueLoading}><Loader2 className={styles.spin} size={18} /> Kiadási adatok betöltése…</div>
            ) : issueResult ? (
              <div className={styles.issueResultBox}>
                <strong>{issueResult.issueNumber} · ISSUED / KIADOTT</strong>
                <span>{issueResult.recipientCount} címzett · auditált formális kiadás</span>
                {issueResult.accessExpiresAt && <small>Hozzáférési linkek lejárata: {new Date(issueResult.accessExpiresAt).toLocaleString("hu-HU")}</small>}
                {issueResult.accessLinks.length > 0 && (
                  <div className={styles.issueAccessLinks}>
                    {issueResult.accessLinks.map((link) => (
                      <a key={link.recipientId} href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.name || link.email || link.recipientId}
                      </a>
                    ))}
                  </div>
                )}
                {issueResult.accessLinkError && <small className={styles.issueAccessWarning}>{issueResult.accessLinkError}</small>}
              </div>
            ) : (
              <>
                <label>
                  Kiadás célja
                  <input
                    required
                    maxLength={1000}
                    value={issuePurpose}
                    onChange={(event) => setIssuePurpose(event.target.value)}
                    placeholder="pl. Kivitelezésre kiadott terv"
                  />
                </label>
                <label>
                  Kiadási megjegyzés
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={issueNote}
                    onChange={(event) => setIssueNote(event.target.value)}
                    placeholder="Opcionális kiadási megjegyzés"
                  />
                </label>

                <section className={styles.issueRecipientSection}>
                  <header>
                    <strong>Projekt címzettjei</strong>
                    <span>{issueSelectedMemberIds.length} kijelölve</span>
                  </header>
                  <div className={styles.issueMemberList}>
                    {issueMembers.map((member) => (
                      <label key={member.id} className={styles.issueMemberRow}>
                        <input
                          type="checkbox"
                          checked={issueSelectedMemberIds.includes(member.id)}
                          onChange={() => toggleIssueMember(member.id)}
                        />
                        <span>
                          <strong>{member.displayName || member.email || member.userId}</strong>
                          <small>{[member.organizationName, member.email, projectRoleLabel(member.role)].filter(Boolean).join(" · ")}</small>
                        </span>
                      </label>
                    ))}
                    {!issueMembers.length && <div className={styles.issueEmptyRecipients}>Nincs aktív projekttag a címzettlistában.</div>}
                  </div>
                </section>

                <label>
                  Külső e-mail címzettek
                  <textarea
                    rows={4}
                    value={issueExternalRecipients}
                    onChange={(event) => setIssueExternalRecipients(event.target.value)}
                    placeholder={"Egy címzett soronként:\nemail@ceg.hu | Név | Szervezet"}
                  />
                </label>

                <div className={styles.revisionIssueHint}>
                  <strong>A kiadás auditált és címzetthez kötött művelet.</strong>
                  <span>Sikeres kiadás után a verzió governance állapota ISSUED / KIADOTT lesz, és a címzettekhez külön hozzáférési link készülhet.</span>
                </div>
              </>
            )}

            <footer>
              <button type="button" disabled={issueLoading} onClick={closeIssueDialog}>{issueResult ? "Bezárás" : "Mégsem"}</button>
              {!issueResult && (
                <button
                  type="submit"
                  disabled={
                    issueLoading
                    || !issuePurpose.trim()
                    || (issueSelectedMemberIds.length === 0 && !issueExternalRecipients.trim())
                    || selectedDocument.currentVersion.status !== "AVAILABLE"
                    || issueGovernance?.reviewDecision !== "APPROVED"
                    || issueGovernance?.businessStatus !== "ERVENYES"
                  }
                >
                  {issueLoading ? <Loader2 className={styles.spin} size={16} /> : null}
                  Formális kiadás
                </button>
              )}
            </footer>
          </form>
        </div>
      )}

{externalDragActive && (
  <div className={styles.externalDropOverlay} aria-live="polite">
    <div>
      <strong>Engedd el a fájlokat vagy mappákat</strong>
      <span>{selectedFolder ? "Cél: " + (selectedFolder.displayPath || selectedFolder.path) : "Mappa behúzásakor a teljes struktúra létrejön a projekt gyökerében."}</span>
    </div>
  </div>
)}

      <div className={styles.breadcrumb}>
        <span>Dokumentumtár</span>
        {breadcrumbParts.map((part, index) => <span key={`${part}-${index}`}>› <strong>{part}</strong></span>)}
        {canWrite && selectedFolder && (
          <button type="button" className={styles.folderRenameButton} onClick={() => void renameSelectedFolder()} disabled={busy}>
            Mappa átnevezése
          </button>
        )}
        {canManageFolderPassword && selectedFolder && (
          <button
            type="button"
            className={styles.folderProtectionButton}
            onClick={() => void openFolderPasswordManageDialog(selectedFolder)}
            disabled={busy}
          >
            {selectedFolder.securityState === "PASSWORD" ? <ShieldCheck size={13} /> : <Lock size={13} />}
            Mappavédelem
          </button>
        )}
      </div>

      {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
      {!error && notice && <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div>}
      {!error && !notice && health?.workspace && !health.workspace.databaseReady && <div className={`${styles.notice} ${styles.noticeInfo}`}>{health.workspace.nextStep}</div>}

      {tableFullscreen && (
        <section className={`${styles.fullTableOverlay} ${fullTableInspectorOpen && fullTableInspectorLayout === "bottom" ? styles.fullTableOverlayBottomInspector : ""}`} data-drive-full-table="0.2.0">
          <TableFullscreenBar
            title={title}
            subtitle={fileGridSubtitle}
            layoutMode={layoutMode}
            onLayoutModeChange={(next) => { setLayoutMode(next); closeTableFullscreen(); }}
            zoom={tableZoom}
            onZoomChange={setTableZoom}
            onToggleFullscreen={closeTableFullscreen}
            inspectorOpen={fullTableInspectorOpen}
            inspectorDisabled={!selectedDocument}
            inspectorLayout={fullTableInspectorLayout}
            onToggleInspector={() => {
              const next = !fullTableInspectorOpen;
              if (next && fullTableInspectorLayout === "side") setBoxShelfOpen(false);
              setFullTableInspectorOpen(next);
            }}
            onInspectorLayoutChange={(layout) => {
              setFullTableInspectorLayout(layout);
              if (layout === "side" && fullTableInspectorOpen) setBoxShelfOpen(false);
            }}
            boxPanelOpen={boxShelfOpen}
            boxCount={boxes.length}
            onToggleBoxPanel={() => {
              const next = !boxShelfOpen;
              if (next && fullTableInspectorOpen && fullTableInspectorLayout === "side") setFullTableInspectorOpen(false);
              setBoxShelfOpen(next);
            }}
          />
          <div className={styles.fullTableBody}>
            <FileGridPanel
              title={title}
              subtitle={fileGridSubtitle}
              documents={visibleDocuments}
              selectedDocumentId={selectedDocumentId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSelectDocument={(document) => setSelectedDocumentId(document.id)}
              onOpenDocument={(document) => { closeTableFullscreen(); void openDocument(document); }}
              onRefresh={() => void load()}
              boxColorsByDocument={boxColorsByDocument}
              favoriteDocumentIds={favoriteDocumentIds}
              favoriteBusyDocumentIds={favoriteBusyDocumentIds}
              onToggleFavorite={(document) => void toggleFavorite(document)}
              metadataByDocument={metadataByDocument}
              folders={favoriteOnly ? [] : tree?.folders || []}
              selectedFolderId={selectedFolderId}
              allFilesMode={allFilesInFolderMode}
              onAllFilesModeChange={setFolderFileScope}
              currentFolder={favoriteOnly ? null : selectedFolder}
              onFolderChange={(folderId) => { setFavoriteOnly(false); selectFolder(folderId); }}
              onNavigateParent={() => {
                if (!selectedFolder) return;
                selectFolder(selectedFolder.parentId || "all");
              }}
              canWrite={canWrite}
              canApprove={canApprove}
              membershipRole={membershipRole}
              busy={busy}
              onBulkReview={bulkReview}
              onOpenReviewDetail={(document, field) => { openReviewDetail(document, field); setFullTableInspectorOpen(true); }}
              tableZoom={tableZoom}
              dragPanEnabled
              selectedDocumentIds={selectedDocumentIds}
              onSelectionChange={setSelectedDocumentIds}
              canDelete={canDelete}
              canDeleteFolder={canDeleteFolder}
              onDeleteSelected={deleteDocuments}
              onDeleteFolder={deleteFolder}
              onDownloadFolder={downloadFolder}
              onOpenBrowserDocument={(document) => void openDocumentInBrowser(document)}
              onOpenWindowsDocument={(document) => void openDocumentInWindows(document)}
              onOpenBoxDocument={openDocumentBox}
              onDownloadDocument={(document) => void downloadDocument(document)}
              newFolderEditorOpen={newFolderEditorOpen}
              newFolderName={newFolderName}
              newFolderSaving={newFolderSaving}
              onNewFolderNameChange={setNewFolderName}
              onSaveNewFolder={() => void saveNewFolder()}
              onCancelNewFolder={cancelNewFolderEditor}
            />
            {boxShelfOpen && (
              <aside className={styles.fullTableBoxPanel} aria-label="CsomagBOX">
                <BoxShelf
                  projectId={projectId}
                  variant="panel"
                  open
                  onOpenChange={setBoxShelfOpen}
                  boxes={boxes}
                  documents={tree?.documents || []}
                  metadataByDocument={metadataByDocument}
                  selectedDocument={selectedDocument}
                  canWrite={canWrite}
                  databaseReady={Boolean(health?.workspace?.databaseReady)}
                  busy={busy}
                  onCreateBox={createBox}
                  onAddDocument={addDocumentToBox}
                  onRemoveItem={removeBoxItem}
                  onCreateFolder={createBoxFolder}
                  onMoveItem={moveBoxItemToFolder}
                  onDownloadBox={downloadBoxArchive}
                  onSetLifecycle={setBoxLifecycle}
                  onOpenCompareBox={(box) => openCompare(box.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })))}
                />
              </aside>
            )}
          </div>
          {fullTableInspectorOpen && (
            <aside className={`${styles.fullTableInspector} ${fullTableInspectorLayout === "bottom" ? styles.fullTableInspectorBottom : styles.fullTableInspectorSide}`} aria-label="Dokumentumadatok">
              {fullTableInspectorLayout === "bottom" && <BottomInspectorResizeHandle />}
              <button type="button" className={styles.fullTableInspectorClose} onClick={() => setFullTableInspectorOpen(false)} title="Dokumentumadatok bezárása" aria-label="Dokumentumadatok bezárása">×</button>
              <DetailsPanel
                projectId={projectId}
                document={selectedDocument}
                details={details}
                loading={detailsLoading}
                busy={busy}
                canWrite={canWrite}
                canComment={canComment}
                canApprove={canApprove}
                canConfigureDataLists={canConfigureDataLists}
                projectSettings={projectSettings}
                onSaveNumbering={saveVersionNumbering}
                onSaveProjectSettings={saveProjectSettings}
                canDelete={canDelete}
                membershipRole={membershipRole}
                membershipDisplayName={membershipDisplayName}
                securityReady={securityReady}
                securityLabel={health?.security?.ready ? "Biztonsági ellenőrzés" : health?.security?.errorCode || "Biztonsági ellenőrzés nem elérhető"}
                onScan={scanSelectedVersion}
                onReview={reviewSelectedVersion}
                onSaveMetadata={saveMetadata}
                onSaveReview={saveSelectedReview}
                onSaveNote={saveNote}
                onEnsureQr={ensureQr}
                onDownload={downloadSelected}
                onDelete={async () => { if (selectedDocument) await deleteDocuments([selectedDocument.id]); }}
                responsiveClassName={`${styles.fullTableInspectorPanel} ${fullTableInspectorLayout === "bottom" ? `${styles.detailsSplitCard} ${styles.fullTableInspectorPanelBottom}` : ""}`}
                focusTab={detailsFocus?.documentId === selectedDocument?.id ? "details" : viewMode === "review" ? "review" : undefined}
                reviewFocus={reviewFocus}
                detailsFocus={detailsFocus?.documentId === selectedDocument?.id ? detailsFocus?.field || "" : ""}
                inheritedDiscipline={selectedDocument ? effectiveFolderClassification.get(selectedDocument.folderId)?.discipline || "" : ""}
                inheritedTopic={selectedDocument ? effectiveFolderClassification.get(selectedDocument.folderId)?.topic || "" : ""}
              />
            </aside>
          )}
        </section>
      )}

      <div
        ref={browserRef}
        className={`${browserClass} ${compareActive ? styles.browserCompareActive : ""}`}
        style={layoutMode === "split" ? { gridTemplateRows: `minmax(220px,1fr) 10px ${splitDetailsHeight}px` } : undefined}
      >
        {compareActive ? (
          <CompareWorkspace
            projectId={projectId}
            documents={tree?.documents || []}
            boxes={boxes}
            seedItems={compareSeedItems}
            onClose={() => setCompareActive(false)}
          />
        ) : layoutMode === "commander" ? (
          <CommanderPanel
            folders={tree?.folders || []}
            documents={tree?.documents || []}
            selectedDocumentId={selectedDocumentId}
            canWrite={canWrite}
            moveReady={Boolean(health?.workspace?.databaseReady)}
            busy={busy}
            onSelectDocument={(document) => setSelectedDocumentId(document.id)}
            onOpenDocument={(document) => void openDocument(document)}
            onMoveDocument={moveDocument}
            tableZoom={tableZoom}
            selectedDocumentIds={selectedDocumentIds}
            onSelectionChange={setSelectedDocumentIds}
            canDelete={canDelete}
            onDeleteSelected={deleteDocuments}
          />
        ) : (
          <>
            <FolderTreePanel
              folders={tree?.folders || []}
              selectedFolderId={selectedFolderId}
              documentCounts={folderDocumentCounts}
              totalDocumentCount={tree?.summary.documentCount || 0}
              onSelectFolder={selectFolder}
              responsiveClassName={`${styles.folderPanelResponsive} ${folderHidden ? styles.hiddenPanel : ""}`}
            />
            <FileGridPanel
              title={title}
              subtitle={fileGridSubtitle}
              documents={visibleDocuments}
              selectedDocumentId={selectedDocumentId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSelectDocument={(document) => setSelectedDocumentId(document.id)}
              onOpenDocument={(document) => void openDocument(document)}
              onRefresh={() => void load()}
              boxColorsByDocument={boxColorsByDocument}
              favoriteDocumentIds={favoriteDocumentIds}
              favoriteBusyDocumentIds={favoriteBusyDocumentIds}
              onToggleFavorite={(document) => void toggleFavorite(document)}
              metadataByDocument={metadataByDocument}
              folders={favoriteOnly ? [] : tree?.folders || []}
              selectedFolderId={selectedFolderId}
              allFilesMode={allFilesInFolderMode}
              onAllFilesModeChange={setFolderFileScope}
              currentFolder={favoriteOnly ? null : selectedFolder}
              onFolderChange={(folderId) => { setFavoriteOnly(false); selectFolder(folderId); }}
              onNavigateParent={() => {
                if (!selectedFolder) return;
                selectFolder(selectedFolder.parentId || "all");
              }}
              canWrite={canWrite}
              canApprove={canApprove}
              membershipRole={membershipRole}
              busy={busy}
              onBulkReview={bulkReview}
              onOpenReviewDetail={openReviewDetail}
              tableZoom={tableZoom}
              dragPanEnabled
              selectedDocumentIds={selectedDocumentIds}
              onSelectionChange={setSelectedDocumentIds}
              canDelete={canDelete}
              canDeleteFolder={canDeleteFolder}
              onDeleteSelected={deleteDocuments}
              onDeleteFolder={deleteFolder}
              onDownloadFolder={downloadFolder}
              onOpenBrowserDocument={(document) => void openDocumentInBrowser(document)}
              onOpenWindowsDocument={(document) => void openDocumentInWindows(document)}
              onOpenBoxDocument={openDocumentBox}
              onDownloadDocument={(document) => void downloadDocument(document)}
              newFolderEditorOpen={newFolderEditorOpen}
              newFolderName={newFolderName}
              newFolderSaving={newFolderSaving}
              onNewFolderNameChange={setNewFolderName}
              onSaveNewFolder={() => void saveNewFolder()}
              onCancelNewFolder={cancelNewFolderEditor}
            />
            {layoutMode === "split" && (
              <div
                className={styles.splitResizeHandle}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Részletező panel magasságának módosítása"
                title="Húzd fel vagy le a részletező panel méretezéséhez · dupla kattintás: 50%"
                onDoubleClick={() => {
                  const measuredHeight = browserRef.current?.getBoundingClientRect().height || 0;
                  const workspaceHeight = measuredHeight > 0 ? measuredHeight : Math.max(500, window.innerHeight - 260);
                  const minDetailsHeight = 250;
                  const minMainHeight = 220;
                  const resizeHandleHeight = 10;
                  const maxDetailsHeight = Math.max(minDetailsHeight, workspaceHeight - minMainHeight - resizeHandleHeight);
                  const halfDetailsHeight = Math.round((workspaceHeight - resizeHandleHeight) / 2);
                  setSplitDetailsHeight(Math.max(minDetailsHeight, Math.min(maxDetailsHeight, halfDetailsHeight)));
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  const startY = event.clientY;
                  const startHeight = splitDetailsHeight;
                  const onMove = (moveEvent: PointerEvent) => {
                    const delta = startY - moveEvent.clientY;
                    const maxHeight = Math.max(300, window.innerHeight - 300);
                    setSplitDetailsHeight(Math.max(250, Math.min(maxHeight, startHeight + delta)));
                  };
                  const onUp = () => {
                    document.body.style.cursor = "";
                    document.body.style.userSelect = "";
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  document.body.style.cursor = "row-resize";
                  document.body.style.userSelect = "none";
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp, { once: true });
                }}
              >
                <span />
              </div>
            )}
            <DetailsPanel
              projectId={projectId}
              document={selectedDocument}
              details={details}
              loading={detailsLoading}
              busy={busy}
              canWrite={canWrite}
              canComment={canComment}
              canApprove={canApprove}
              canConfigureDataLists={canConfigureDataLists}
              projectSettings={projectSettings}
              onSaveNumbering={saveVersionNumbering}
              onSaveProjectSettings={saveProjectSettings}
              canDelete={canDelete}
              membershipRole={membershipRole}
              membershipDisplayName={membershipDisplayName}
              securityReady={securityReady}
              securityLabel={health?.security?.ready ? "Biztonsági ellenőrzés" : health?.security?.errorCode || "Biztonsági ellenőrzés nem elérhető"}
              onScan={scanSelectedVersion}
              onReview={reviewSelectedVersion}
              onSaveMetadata={saveMetadata}
              onSaveReview={saveSelectedReview}
              onSaveNote={saveNote}
              onEnsureQr={ensureQr}
              onDownload={downloadSelected}
              onDelete={async () => { if (selectedDocument) await deleteDocuments([selectedDocument.id]); }}
              responsiveClassName={`${styles.detailsResponsive} ${layoutMode === "split" ? styles.detailsSplitCard : ""} ${detailsHidden ? styles.hiddenPanel : ""}`}
              focusTab={detailsFocus?.documentId === selectedDocument?.id ? "details" : viewMode === "review" ? "review" : undefined}
              reviewFocus={reviewFocus}
              detailsFocus={detailsFocus?.documentId === selectedDocument?.id ? detailsFocus?.field || "" : ""}
              inheritedDiscipline={selectedDocument ? effectiveFolderClassification.get(selectedDocument.folderId)?.discipline || "" : ""}
              inheritedTopic={selectedDocument ? effectiveFolderClassification.get(selectedDocument.folderId)?.topic || "" : ""}
            />
          </>
        )}
      </div>

      <BoxShelf
                  projectId={projectId}
        open={boxShelfOpen}
        onOpenChange={setBoxShelfOpen}
        boxes={boxes}
        documents={tree?.documents || []}
        metadataByDocument={metadataByDocument}
        selectedDocument={selectedDocument}
        canWrite={canWrite}
        databaseReady={Boolean(health?.workspace?.databaseReady)}
        busy={busy}
        onCreateBox={createBox}
        onAddDocument={addDocumentToBox}
        onRemoveItem={removeBoxItem}
        onCreateFolder={createBoxFolder}
        onMoveItem={moveBoxItemToFolder}
        onDownloadBox={downloadBoxArchive}
        onSetLifecycle={setBoxLifecycle}
        onOpenCompareBox={(box) => openCompare(box.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })))}
        shelfHeight={boxShelfHeight}
        onShelfHeightChange={setBoxShelfHeight}
        onResetShelfHeight={() => setBoxShelfHeight(Math.max(118, Math.round(window.innerHeight * 0.5)))}
      />
    </div>
  );
}
