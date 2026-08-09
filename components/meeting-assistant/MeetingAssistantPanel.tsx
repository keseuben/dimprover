"use client";

import {
  AlertTriangle,
  Archive,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FolderUp,
  Globe2,
  Loader2,
  LockKeyhole,
  KeyRound,
  Maximize2,
  MessageSquareText,
  Mic2,
  MonitorUp,
  Paperclip,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Power,
  SquarePen,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionItemType,
  MeetingStatus,
  MeetingViewRole,
  MeetingWorkspace,
} from "@/app/lib/meeting-assistant/types";
import type { MeetingAiAction } from "@/app/lib/meeting-assistant/ai";
import MeetingAttendanceSection from "./MeetingAttendanceSection";
import MeetingMetaSection from "./MeetingMetaSection";
import MeetingAgendaSection from "./MeetingAgendaSection";
import MeetingTeamsTranscriptSection from "./MeetingTeamsTranscriptSection";
import MeetingNativeTranscriptionSection from "./MeetingNativeTranscriptionSection";
import MeetingCompactHeader from "./MeetingCompactHeader";
import MeetingLiveMinutesSection from "./MeetingLiveMinutesSection";
import MeetingArchiveModal from "./MeetingArchiveModal";
import MeetingProjectProfileModal from "./MeetingProjectProfileModal";
import MeetingAiMinutesModal from "./MeetingAiMinutesModal";
import MeetingPublishModal from "./MeetingPublishModal";
import MeetingFeedbackModal from "./MeetingFeedbackModal";
import MeetingFeedbackSection from "./MeetingFeedbackSection";
import MeetingSectionShell from "./MeetingSectionShell";
import MeetingProgressSummary from "./MeetingProgressSummary";
import MeetingEditorAccessModal from "./MeetingEditorAccessModal";
import MeetingAttachmentEditor, { type MeetingAttachmentEditorSource } from "./MeetingAttachmentEditor";
import MeetingHelpModal from "./MeetingHelpModal";
import MeetingTextEntriesSection from "./MeetingTextEntriesSection";
import MeetingLiveDocumentView from "./MeetingLiveDocumentView";
import MeetingPresentationControlModal from "./MeetingPresentationControlModal";
import MeetingSafeCloseModal from "./MeetingSafeCloseModal";
import { readJsonResponse } from "./safeJson";

type AiEstimate = {
  action: MeetingAiAction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostHuf: number;
  estimatedCostUsd: number;
};

type AiConfig = {
  configured: boolean;
  model: string;
  usdHufRate: number;
  maxSingleRequestHuf: number;
  actions: Array<{
    key: MeetingAiAction;
    label: string;
    description: string;
    maxOutputTokens: number;
    typicalInputTokens: number;
  }>;
};

type Props = {
  meetingId: string;
  initialRole?: MeetingViewRole;
  embedded?: boolean;
  allowRoleSwitch?: boolean;
  accessToken?: string;
  onAccessRoleChange?: (role: MeetingViewRole, token: string) => void;
  onShareToStage?: () => void | Promise<void>;
  shareToStageAvailable?: boolean;
  externalStatus?: string;
  onOpenCapture?: () => void | Promise<void>;
  onStopSharing?: () => void | Promise<void>;
  initialActorName?: string;
};

const ACTION_STYLE: Record<ActionItemType, { label: string; className: string }> = {
  task: { label: "Feladat", className: "border-sky-200 bg-sky-50 text-sky-800" },
  decision: { label: "Döntés", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  question: { label: "Kérdés", className: "border-amber-200 bg-amber-50 text-amber-800" },
  deadline: { label: "Határidő", className: "border-violet-200 bg-violet-50 text-violet-800" },
};

const AI_ICON: Partial<Record<MeetingAiAction, React.ComponentType<{ size?: number; className?: string }>>> = {
  quick_summary: MessageSquareText,
  extract_actions: ClipboardCheck,
  draft_minutes: FileText,
  quality_check: ShieldCheck,
};

const COMPACT_AI_ACTIONS = new Set<MeetingAiAction>([
  "quick_summary",
  "extract_actions",
  "draft_minutes",
  "quality_check",
]);

const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  active: "Folyamatban",
  draft_closed: "Lezárt piszkozat",
  pending_approval: "Jóváhagyásra vár",
  published: "Közzétett",
  archived: "Archivált",
};

const MEETING_STATUS_CLASS: Record<MeetingStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  draft_closed: "border-slate-200 bg-slate-100 text-slate-700",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-sky-200 bg-sky-50 text-sky-800",
  archived: "border-violet-200 bg-violet-50 text-violet-800",
};

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatHuf(value: number | undefined) {
  if (!Number.isFinite(value)) return "-";
  if ((value ?? 0) < 0.01) return "< 0,01 Ft";
  return `${(value ?? 0).toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft`;
}

function nowHm() {
  return new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function editorStorageKey(meetingId: string) {
  return `dimpro:meeting-editor:${meetingId}`;
}

function presentationStorageKey(meetingId: string) {
  return `dimpro:meeting-presentation:${meetingId}`;
}

function Section({ title, icon, children, defaultOpen = false, badge, id, accentClass }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode; id?: string; accentClass?: string }) {
  return <MeetingSectionShell id={id} title={title} icon={icon} defaultOpen={defaultOpen} badge={badge} accentClass={accentClass}>{children}</MeetingSectionShell>;
}


export default function MeetingAssistantPanel({
  meetingId,
  initialRole = "organizer",
  embedded = false,
  allowRoleSwitch = true,
  accessToken: providedAccessToken = "",
  onAccessRoleChange,
  onShareToStage,
  shareToStageAvailable = false,
  externalStatus = "",
  onOpenCapture,
  onStopSharing,
  initialActorName = "",
}: Props) {
  const [accessToken, setAccessToken] = useState(providedAccessToken);
  const [role, setRole] = useState<MeetingViewRole>(initialRole);
  const [workspace, setWorkspace] = useState<MeetingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [actorName, setActorName] = useState(initialActorName || (initialRole === "organizer" ? "Szervező" : "Résztvevő"));
  const [actorEmail, setActorEmail] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [sharedNote, setSharedNote] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcriptSpeaker, setTranscriptSpeaker] = useState("Szervező");
  const [transcriptText, setTranscriptText] = useState("");
  const [actionType, setActionType] = useState<ActionItemType>("task");
  const [actionTitle, setActionTitle] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionAgendaItemId, setActionAgendaItemId] = useState("");
  const [showActionForm, setShowActionForm] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiEstimates, setAiEstimates] = useState<Partial<Record<MeetingAiAction, AiEstimate>>>({});
  const [aiConfirm, setAiConfirm] = useState<AiEstimate | null>(null);
  const [aiRunning, setAiRunning] = useState<MeetingAiAction | null>(null);
  const [aiOutput, setAiOutput] = useState("");
  const [closureOpen, setClosureOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [projectProfilesOpen, setProjectProfilesOpen] = useState(false);
  const [aiMinutesOpen, setAiMinutesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [editorAccessOpen, setEditorAccessOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareComposerOpen, setShareComposerOpen] = useState(false);
  const [presentationControlOpen, setPresentationControlOpen] = useState(false);
  const isTeamsMeeting = workspace?.meetingMode !== "in_person";
  const [liveDocumentOpen, setLiveDocumentOpen] = useState(false);
  const [safeCloseOpen, setSafeCloseOpen] = useState(false);
  const [attachmentEditorSource, setAttachmentEditorSource] = useState<MeetingAttachmentEditorSource | null>(null);
  const [capturingScreen, setCapturingScreen] = useState(false);
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [shareText, setShareText] = useState("");
  const [shareAgendaItemId, setShareAgendaItemId] = useState("");
  const [shareIncludeInDocument, setShareIncludeInDocument] = useState(true);
  const [shareSending, setShareSending] = useState(false);
  const [presentationToken, setPresentationToken] = useState("");
  const [presentationUpdating, setPresentationUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const presentationTimerRef = useRef<number | null>(null);
  const activeSectionRef = useRef("meeting-live-minutes");

  useEffect(() => {
    setAccessToken(providedAccessToken);
    setRole(initialRole);
    if (initialActorName) setActorName(initialActorName);
    try {
      setPresentationToken(window.localStorage.getItem(presentationStorageKey(meetingId)) || "");
      const storedEditorToken = window.localStorage.getItem(editorStorageKey(meetingId)) || "";
      if (initialRole === "participant" && storedEditorToken) {
        setAccessToken(storedEditorToken);
        setRole("editor");
        onAccessRoleChange?.("editor", storedEditorToken);
      }
    } catch {
      // A panel a kapott jogosultsággal működik tovább, ha a helyi tároló nem használható.
    }
  }, [initialActorName, initialRole, meetingId, onAccessRoleChange, providedAccessToken]);

  const fetchWorkspace = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch(`/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{ ok: boolean; workspace?: MeetingWorkspace; accessRole?: MeetingViewRole; error?: string }>(response, "A munkatér betöltése sikertelen.");
      if (!response.ok || !data.workspace) throw new Error(data.error || "A munkatér betöltése sikertelen.");
      if (role === "editor" && data.accessRole !== "editor") {
        try { window.localStorage.removeItem(editorStorageKey(meetingId)); } catch { /* nincs teendő */ }
        setAccessToken(providedAccessToken);
        setRole("participant");
        onAccessRoleChange?.("participant", providedAccessToken);
        setActorName("Résztvevő");
        setStatus("A jegyzőkönyv-szerkesztői jogosultság lejárt vagy a szervező visszavonta.");
      }
      setWorkspace(data.workspace);
      if (!notesDirty) {
        setPrivateNotes(data.workspace.privateNotes);
        setSharedNote(data.workspace.sharedNote);
      }
      if (actorName === "Szervező" && data.workspace.organizerName) setActorName(data.workspace.organizerName);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Betöltési hiba.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, actorName, meetingId, notesDirty, onAccessRoleChange, providedAccessToken, role]);

  const savePresentationToken = useCallback((token: string, controllerName: string) => {
    setPresentationToken(token);
    try {
      if (token) window.localStorage.setItem(presentationStorageKey(meetingId), token);
      else window.localStorage.removeItem(presentationStorageKey(meetingId));
    } catch { /* munkamenetben tovább működik */ }
    if (controllerName) setActorName(controllerName);
  }, [meetingId]);

  const updatePresentationState = useCallback(async (patch: Record<string, unknown>, silent = true) => {
    if (!workspace) return;
    const externalControllerActive = workspace.presentation.enabled && workspace.presentation.controllerRole === "participant" && Boolean(workspace.presentation.controllerGrantId);
    const mayDrive = externalControllerActive ? Boolean(presentationToken) : Boolean(presentationToken) || role === "organizer" || role === "editor";
    if (!mayDrive) return;
    if (!silent) setPresentationUpdating(true);
    try {
      const response = await fetch("/api/meeting-assistant/presentation-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, accessToken: presentationToken || accessToken, presentationToken, operation: "update_state", actorName, ...patch }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; presentation?: MeetingWorkspace["presentation"] }>(response, "A közös nézet frissítése sikertelen.");
      if (!response.ok || !data.ok) {
        if (presentationToken && [401, 403, 409].includes(response.status)) savePresentationToken("", "");
        throw new Error(data.error || "A közös nézet frissítése sikertelen.");
      }
      if (data.presentation) setWorkspace((current) => current ? { ...current, presentation: data.presentation! } : current);
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : "A közös nézet frissítése sikertelen.");
    } finally {
      if (!silent) setPresentationUpdating(false);
    }
  }, [accessToken, actorName, meetingId, presentationToken, role, savePresentationToken, workspace]);

  const schedulePresentationUpdate = useCallback((patch: Record<string, unknown>) => {
    if (presentationTimerRef.current) window.clearTimeout(presentationTimerRef.current);
    presentationTimerRef.current = window.setTimeout(() => void updatePresentationState(patch, true), 650);
  }, [updatePresentationState]);

  useEffect(() => {
    void fetchWorkspace(false);
    const interval = window.setInterval(() => void fetchWorkspace(true), 5000);
    return () => window.clearInterval(interval);
  }, [fetchWorkspace]);

  useEffect(() => {
    function handleSection(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id) return;
      activeSectionRef.current = detail.id;
      if (!workspace?.presentation.enabled || workspace.presentation.mode !== "follow") return;
      schedulePresentationUpdate({ activeSectionId: detail.id, activeAgendaItemId: workspace.currentAgendaItemId || "" });
    }
    window.addEventListener("dimpro-meeting-section", handleSection as EventListener);
    return () => window.removeEventListener("dimpro-meeting-section", handleSection as EventListener);
  }, [schedulePresentationUpdate, workspace?.currentAgendaItemId, workspace?.presentation.enabled, workspace?.presentation.mode]);

  useEffect(() => {
    const container = document.querySelector<HTMLElement>("[data-meeting-scroll-container]");
    if (!container) return;
    function handleScroll() {
      if (!workspace?.presentation.enabled || workspace.presentation.mode !== "follow") return;
      const sections = [...container!.querySelectorAll<HTMLElement>("[id^='meeting-']")];
      const top = container!.getBoundingClientRect().top + 24;
      const current = sections.filter((section) => section.getBoundingClientRect().top <= top).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
      if (current?.id) activeSectionRef.current = current.id;
      schedulePresentationUpdate({ activeSectionId: activeSectionRef.current, activeAgendaItemId: workspace.currentAgendaItemId || "", scrollTop: container!.scrollTop });
    }
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [schedulePresentationUpdate, workspace?.currentAgendaItemId, workspace?.presentation.enabled, workspace?.presentation.mode]);

  useEffect(() => {
    function handleRemoteAttachment(event: Event) {
      const detail = (event as CustomEvent<{ fileId?: string }>).detail;
      if (!detail?.fileId) return;
      setExpandedAttachmentIds((current) => new Set([...current, detail.fileId!]));
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-meeting-attachment-id="${CSS.escape(detail.fileId!)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
    window.addEventListener("dimpro-meeting-attachment", handleRemoteAttachment as EventListener);
    return () => window.removeEventListener("dimpro-meeting-attachment", handleRemoteAttachment as EventListener);
  }, []);

  useEffect(() => {
    if (!workspace?.presentation.enabled || workspace.presentation.mode !== "follow") return;
    schedulePresentationUpdate({ activeAgendaItemId: workspace.currentAgendaItemId || "", activeSectionId: activeSectionRef.current });
  }, [schedulePresentationUpdate, workspace?.currentAgendaItemId, workspace?.presentation.enabled, workspace?.presentation.mode]);

  useEffect(() => {
    fetch(`/api/meeting-assistant/ai?meetingId=${encodeURIComponent(meetingId)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ config?: AiConfig }>(response, "Az AI-beállítások nem tölthetők be."))
      .then((data) => setAiConfig(data.config || null))
      .catch(() => setAiConfig(null));
  }, [accessToken, meetingId]);

  const aiContext = useMemo(() => {
    if (!workspace) return {};
    return {
      meeting: {
        title: workspace.title,
        projectName: workspace.projectName,
        organizerName: workspace.organizerName,
      },
      agenda: workspace.agenda,
      transcript: workspace.transcript,
      actionItems: workspace.actionItems,
      attachments: workspace.attachments
        .filter((item) => Boolean(item.includeInAi))
        .map((item) => ({
          name: item.originalName,
          title: item.title || item.originalName,
          caption: item.description || item.caption,
          status: item.status,
          uploadedBy: item.uploadedBy,
          sourceType: item.sourceType || "upload",
          sourcePage: item.sourcePage,
        })),
      privateNotes,
      sharedNote,
    };
  }, [privateNotes, sharedNote, workspace]);

  useEffect(() => {
    if (!workspace || !aiConfig) return;
    const timer = window.setTimeout(() => {
      for (const action of aiConfig.actions.filter((item) => COMPACT_AI_ACTIONS.has(item.key))) {
        void fetch("/api/meeting-assistant/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meetingId, operation: "estimate", action: action.key, context: aiContext, accessToken }),
        })
          .then((response) => readJsonResponse<{ estimate?: AiEstimate }>(response, "Az AI-költségbecslés nem tölthető be."))
          .then((data) => {
            if (data.estimate) setAiEstimates((current) => ({ ...current, [action.key]: data.estimate }));
          })
          .catch(() => undefined);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [accessToken, aiConfig, aiContext, meetingId, workspace]);

  function activateEditorAccess(token: string, editorName: string) {
    try { window.localStorage.setItem(editorStorageKey(meetingId), token); } catch { /* munkamenetben tovább működik */ }
    setAccessToken(token);
    setRole("editor");
    onAccessRoleChange?.("editor", token);
    setActorName(editorName || "Jegyzőkönyv-szerkesztő");
  }

  function leaveEditorAccess() {
    try { window.localStorage.removeItem(editorStorageKey(meetingId)); } catch { /* nincs teendő */ }
    setAccessToken(providedAccessToken);
    setRole("participant");
    onAccessRoleChange?.("participant", providedAccessToken);
    setActorName("Résztvevő");
  }

  async function postWorkspace(operation: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/meeting-assistant/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId, role, operation, payload, accessToken }),
    });
    const data = await readJsonResponse<{ ok: boolean; workspace?: MeetingWorkspace; error?: string }>(response, "A mentés sikertelen.");
    if (!response.ok || !data.workspace) throw new Error(data.error || "A mentés sikertelen.");
    setWorkspace(data.workspace);
    return data.workspace;
  }

  async function saveNotes() {
    try {
      await postWorkspace("update_notes", { privateNotes, sharedNote });
      setNotesDirty(false);
      setStatus("A jegyzetek mentve.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A jegyzet mentése sikertelen.");
    }
  }

  function toggleAttachment(fileId: string) {
    schedulePresentationUpdate({ enabled: true, mode: "follow", activeSectionId: "meeting-attachments", activeAttachmentId: fileId, activeAgendaItemId: workspace?.attachments.find((item) => item.id === fileId)?.agendaItemId || "" });
    setExpandedAttachmentIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function submitSharedText() {
    const value = shareText.trim();
    const submittedBy = actorName.trim();
    if (!value || shareSending) return;
    if (!submittedBy || submittedBy.toLocaleLowerCase("hu-HU") === "résztvevő") {
      setStatus("A szöveges bejegyzés elküldéséhez add meg a nevedet.");
      return;
    }
    setShareSending(true);
    try {
      await postWorkspace("submit_shared_message", { text: value, actorName: submittedBy, actorEmail, agendaItemId: shareAgendaItemId, includeInDocument: shareIncludeInDocument });
      setShareText("");
      setShareAgendaItemId("");
      setShareIncludeInDocument(true);
      setStatus(role === "organizer" || role === "editor" ? "A szöveges bejegyzés megjelent az értekezletben." : "A szervező és a jegyzőkönyv-szerkesztő megkapta a szöveges bejegyzést.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A szöveg elküldése sikertelen.");
    } finally {
      setShareSending(false);
    }
  }

  async function toggleLiveFollow() {
    if (!workspace) return;
    const nextEnabled = !(workspace.presentation.enabled && workspace.presentation.mode === "follow");
    const externalControllerActive = workspace.presentation.enabled && workspace.presentation.controllerRole === "participant" && Boolean(workspace.presentation.controllerGrantId);
    if ((role === "participant" && !presentationToken) || (externalControllerActive && !presentationToken)) {
      setStatus(role === "organizer" ? "A közös nézetet jelenleg másik személy vezérli. A vezérléskezelőben azonnal visszaveheted." : "A közös nézet vezérléséhez aktiválj egy hatjegyű vezérlőkódot.");
      setPresentationControlOpen(true);
      return;
    }
    await updatePresentationState({ enabled: nextEnabled, mode: nextEnabled ? "follow" : "fixed", activeSectionId: activeSectionRef.current, activeAgendaItemId: workspace.currentAgendaItemId }, false);
    setStatus(nextEnabled ? "Élő követés bekapcsolva. A megosztott nézet követi a navigációdat." : "Élő követés kikapcsolva. A megosztott nézet rögzített állapotban marad.");
    await fetchWorkspace(true);
  }

  async function openLiveDocument() {
    setLiveDocumentOpen(true);
    await updatePresentationState({ enabled: true, mode: "document", activeSectionId: "meeting-live-minutes", activeAgendaItemId: workspace?.currentAgendaItemId || "" }, true);
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!workspace || files.length === 0) return;
    setUploading(true);
    setStatus("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const response = await fetch(
        `/api/meeting-assistant/upload?meetingId=${encodeURIComponent(meetingId)}&role=${role}&actorName=${encodeURIComponent(actorName)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`,
        { method: "POST", body: formData },
      );
      const data = await readJsonResponse<{ message?: string; errors?: string[]; error?: string }>(response, "A feltöltés sikertelen.");
      if (!response.ok) throw new Error(data.error || data.errors?.join(" ") || "A feltöltés sikertelen.");
      setStatus([data.message, ...(data.errors || [])].filter(Boolean).join(" "));
      await fetchWorkspace(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A feltöltés sikertelen.");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function captureScreenForMeeting() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus("A böngésző vagy a Teams-kliens nem támogatja a képernyőrészlet készítését.");
      return;
    }
    setCapturingScreen(true);
    setStatus("Válaszd ki a rögzítendő képernyőt vagy alkalmazásablakot.");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.videoWidth > 0 && video.videoHeight > 0) resolve();
        else video.onloadedmetadata = () => resolve();
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, video.videoWidth);
      canvas.height = Math.max(1, video.videoHeight);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("A képernyőkép rajzfelülete nem hozható létre.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const capturedAt = new Date();
      setAttachmentEditorSource({
        originalName: `teams_kepernyoreszlet_${capturedAt.toISOString().replace(/[:.]/g, "-")}.png`,
        mimeType: "image/png",
        uploadedBy: actorName,
        initialDataUrl: dataUrl,
        title: `Értekezleti képernyőrészlet ${capturedAt.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`,
        description: "",
        agendaItemId: workspace?.currentAgendaItemId || "",
        includeInAi: true,
        sourceType: "screen_capture",
      });
      setStatus("A képernyőrészlet elkészült. Jelöld ki, vágd meg és lásd el megjegyzésekkel.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "A képernyőrészlet készítése megszakadt.";
      setStatus(message.includes("Permission") || message.includes("NotAllowed") ? "A képernyőmegosztási engedélyt nem adtad meg vagy a Teams letiltotta." : message);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setCapturingScreen(false);
    }
  }

  async function addTranscriptLine() {
    if (!transcriptText.trim()) return;
    try {
      await postWorkspace("append_transcript", {
        at: nowHm(),
        speaker: transcriptSpeaker,
        text: transcriptText,
        shared: false,
      });
      setTranscriptText("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az átirat mentése sikertelen.");
    }
  }

  async function addActionItem() {
    if (!workspace || !actionTitle.trim()) return;
    try {
      await postWorkspace("add_action_item", {
        type: actionType,
        title: actionTitle,
        owner: actionOwner,
        dueDate: actionDueDate,
        agendaItemId: actionAgendaItemId || workspace.currentAgendaItemId,
        shared: role === "organizer",
      });
      setActionTitle("");
      setActionOwner("");
      setActionDueDate("");
      setActionAgendaItemId("");
      setShowActionForm(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az elem mentése sikertelen.");
    }
  }


  async function reopenMeeting() {
    try {
      await postWorkspace("reopen_meeting", { note: "A szervező újranyitotta az értekezletet." });
      setStatus("Az értekezlet újra folyamatban van.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az értekezlet újranyitása sikertelen.");
    }
  }

  async function archiveMeeting() {
    try {
      const next = await postWorkspace("archive_meeting", {});
      setStatus(`Az értekezlet archiválva. Snapshot v${next.closure.snapshotVersion} megőrizve.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az archiválás sikertelen.");
    }
  }

  async function runAi() {
    if (!aiConfirm) return;
    setAiRunning(aiConfirm.action);
    setAiOutput("");
    try {
      const response = await fetch("/api/meeting-assistant/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          operation: "run",
          action: aiConfirm.action,
          context: aiContext,
          confirmedMaxHuf: aiConfirm.estimatedCostHuf,
          accessToken,
        }),
      });
      const data = await readJsonResponse<{
        ok: boolean;
        error?: string;
        result?: { text: string; actualCostHuf: number };
        workspace?: MeetingWorkspace;
      }>(response, "Az AI-futtatás sikertelen.");
      if (!response.ok || !data.result) throw new Error(data.error || "Az AI-futtatás sikertelen.");
      setAiOutput(`${data.result.text}\n\nTényleges AI-költség: ${formatHuf(data.result.actualCostHuf)}`);
      if (data.workspace) setWorkspace(data.workspace);
      setStatus("Az AI-javaslat elkészült. Közzététel előtt ellenőrizd.");
    } catch (error) {
      setAiOutput(error instanceof Error ? error.message : "Az AI-futtatás sikertelen.");
    } finally {
      setAiRunning(null);
      setAiConfirm(null);
    }
  }

  if (loading && !workspace) {
    return (
      <div className="flex min-h-[420px] items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <AlertTriangle size={30} className="text-rose-600" />
        <div className="text-sm font-black text-rose-700">A DIMPRO Értekezleti Kísérő nem tölthető be.</div>
        <div className="max-w-sm text-[11px] leading-5 text-slate-600">{status || "Ismeretlen betöltési hiba történt."}</div>
        <button
          type="button"
          onClick={() => void fetchWorkspace(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white"
        >
          <RefreshCw size={13} /> Újrapróbálás
        </button>
      </div>
    );
  }

  const pendingAttachmentCount = workspace.attachments.filter((item) => item.status === "pending").length;
  const missingOwnerCount = workspace.actionItems.filter((item) => (item.type === "task" || item.type === "deadline") && !item.owner.trim()).length;
  const missingDueDateCount = workspace.actionItems.filter((item) => (item.type === "task" || item.type === "deadline") && !item.dueDate.trim()).length;
  const incompleteAgendaCount = workspace.agenda.filter((item) => !item.completed).length;
  const workspaceLocked = workspace.status === "published" || workspace.status === "archived";
  const canEditContent = role === "organizer" || role === "editor";
  const visibleAttachments = canEditContent
    ? workspace.attachments
    : workspace.attachments.filter((item) => item.status === "shared");
  const visibleActions = canEditContent
    ? workspace.actionItems
    : workspace.actionItems.filter((item) => item.shared);
  const visibleTranscript = role === "organizer"
    ? workspace.transcript
    : workspace.transcript.filter((item) => item.shared);
  const pendingSharedMessages = canEditContent ? workspace.sharedMessages.filter((item) => item.status === "pending") : [];
  const liveStatusText = status || externalStatus || (presentationUpdating
    ? "Közös nézet szinkronizálása..."
    : workspace.presentation.enabled
      ? `Élő nézet: ${workspace.presentation.mode === "follow" ? "követés" : workspace.presentation.mode === "document" ? "dokumentum" : "rögzített"} · Vezérlő: ${workspace.presentation.controllerName || "Szervező"}`
      : pendingAttachmentCount > 0 && role === "organizer"
    ? `${pendingAttachmentCount} melléklet vár jóváhagyásra.`
    : pendingSharedMessages.length > 0
      ? `${pendingSharedMessages.length} szöveges javaslat vár megjelenítésre.`
      : `Minden módosítás mentve · Élő szinkron aktív · ${workspace.sessionState.lastSavedAt ? new Date(workspace.sessionState.lastSavedAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }) : ""}`);

  return (
    <div data-meeting-panel-role={role} className={`flex h-full min-h-0 flex-col bg-[#f7f8fc] ${embedded ? "min-h-screen" : ""}`}>
      <MeetingCompactHeader
        workspace={workspace}
        role={role}
        allowRoleSwitch={allowRoleSwitch}
        refreshing={refreshing}
        onRoleChange={setRole}
        onRefresh={() => void fetchWorkspace(true)}
        onOpenArchive={() => setArchiveOpen(true)}
        onOpenAi={() => setAiMinutesOpen(true)}
        onOpenEditorAccess={() => setEditorAccessOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <MeetingProgressSummary workspace={workspace} role={role} />
      {(workspace.editorAccess.status === "active" || role === "editor") && (
        <button
          type="button"
          onClick={() => setEditorAccessOpen(true)}
          className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[10px] font-bold text-emerald-900"
        >
          <UserRoundCheck size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Aktív jegyzőkönyv-szerkesztő: <b>{workspace.editorAccess.editorName || actorName}</b></span>
          {role === "editor" && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[8px] font-black uppercase text-white">szerkesztői mód</span>}
        </button>
      )}

      <div data-meeting-scroll-container className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fc] px-1 py-1">
        {workspaceLocked && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
            <LockKeyhole size={15} className="mt-0.5 shrink-0" />
            <span>{workspace.status === "archived" ? "Az értekezlet archivált állapotban van." : "Az értekezlet közzétett, lezárt állapotban van."} Szerkesztéshez a szervezőnek újra kell nyitnia.</span>
          </div>
        )}

        <MeetingMetaSection
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          role={role}
          locked={workspaceLocked}
          postWorkspace={postWorkspace}
          setStatus={setStatus}
          onOpenProjectProfiles={() => setProjectProfilesOpen(true)}
        />

        <MeetingAttendanceSection
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          role={role}
          locked={workspaceLocked}
          postWorkspace={postWorkspace}
          setStatus={setStatus}
          refreshWorkspace={() => fetchWorkspace(true)}
        />

        <MeetingLiveMinutesSection
          workspace={workspace}
          role={role}
          onOpenAi={() => setAiMinutesOpen(true)}
          onPublish={() => setClosureOpen(true)}
          onOpenFeedback={() => setFeedbackOpen(true)}
          onOpenFullDocument={() => void openLiveDocument()}
        />

        <MeetingAgendaSection
          workspace={workspace}
          role={role}
          locked={workspaceLocked}
          postWorkspace={postWorkspace}
          setStatus={setStatus}
        />

        {role === "organizer" && (
          <Section id="meeting-transcript" title={isTeamsMeeting ? "Teams és DIMPRO átiratkezelés" : "DIMPRO személyes értekezlet hangátírás"} icon={Mic2} badge={<span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-700">{isTeamsMeeting ? "GRAPH + KÉZI + SAJÁT" : "MIKROFON + FÁJL + KÉZI"}</span>}>
            <MeetingNativeTranscriptionSection
              meetingId={meetingId}
              accessToken={accessToken}
              workspace={workspace}
              meetingMode={workspace.meetingMode}
              locked={workspaceLocked}
              refreshWorkspace={() => fetchWorkspace(true)}
              setStatus={setStatus}
              onOpenAi={() => setAiMinutesOpen(true)}
            />
            <MeetingTeamsTranscriptSection
              meetingId={meetingId}
              accessToken={accessToken}
              workspace={workspace}
              locked={workspaceLocked}
              teamsGraphEnabled={isTeamsMeeting}
              refreshWorkspace={() => fetchWorkspace(true)}
              setStatus={setStatus}
            />
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {visibleTranscript.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-500">
                  {isTeamsMeeting ? "Még nincs átirat. Szinkronizáld a Teams-átiratot, importálj VTT/DOCX/TXT fájlt, vagy használd a DIMPRO tartalék hangátírást." : "Még nincs átirat. Indíts DIMPRO mikrofonfelvételt, tölts fel hang- vagy videófájlt, vagy adj hozzá kézi sort."}
                </div>
              ) : visibleTranscript.map((line) => (
                <div key={line.id} className="grid grid-cols-[38px_1fr] gap-2 text-[11px]">
                  <span className="font-bold text-slate-400">{line.at}</span>
                  <div><span className="font-black text-slate-800">{line.speaker}:</span> <span className="text-slate-600">{line.text}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-[110px_1fr_auto] gap-2">
              <input value={transcriptSpeaker} onChange={(event) => setTranscriptSpeaker(event.target.value)} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[11px] outline-none focus:border-indigo-400" placeholder="Beszélő" />
              <input value={transcriptText} onChange={(event) => setTranscriptText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addTranscriptLine(); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[11px] outline-none focus:border-indigo-400" placeholder="Átiratmondat..." />
              <button type="button" onClick={() => void addTranscriptLine()} className="rounded-lg bg-indigo-600 px-3 text-white"><Plus size={15} /></button>
            </div>
            {workspace.transcript.length === 0 && (
              <button type="button" onClick={() => void postWorkspace("load_demo_transcript", {})} className="mt-2 text-[10px] font-black text-indigo-700 hover:underline">Tesztátirat betöltése</button>
            )}
          </Section>
        )}

        {role === "organizer" && (
          <Section id="meeting-shared-notes" title="Privát és megosztott jegyzet" icon={SquarePen}>
            <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">Privát - csak neked</label>
            <textarea
              value={privateNotes}
              onChange={(event) => { setPrivateNotes(event.target.value); setNotesDirty(true); }}
              rows={4}
              className="mt-1 w-full resize-y rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-[11px] leading-5 text-slate-700 outline-none focus:border-violet-400"
              placeholder="Belső megjegyzések, AI-javaslat ellenőrzése..."
            />
            <label className="mt-3 block text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">Megosztható jegyzet</label>
            <textarea
              value={sharedNote}
              onChange={(event) => { setSharedNote(event.target.value); setNotesDirty(true); }}
              rows={3}
              className="mt-1 w-full resize-y rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-[11px] leading-5 text-slate-700 outline-none focus:border-sky-400"
              placeholder="Ezt láthatják a résztvevők..."
            />
            <button type="button" onClick={() => void saveNotes()} disabled={!notesDirty} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
              <Check size={13} /> Jegyzetek mentése
            </button>
          </Section>
        )}

        {role === "editor" && (
          <Section id="meeting-shared-notes" title="Megosztott jegyzet szerkesztése" icon={SquarePen}>
            <textarea
              value={sharedNote}
              onChange={(event) => { setSharedNote(event.target.value); setNotesDirty(true); }}
              rows={5}
              disabled={workspaceLocked}
              className="w-full resize-y rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-[11px] leading-5 text-slate-700 outline-none focus:border-teal-500 disabled:opacity-50"
              placeholder="A résztvevőkkel megosztott közös jegyzet..."
            />
            <button type="button" onClick={() => void saveNotes()} disabled={!notesDirty || workspaceLocked} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40">
              <Check size={13} /> Megosztott jegyzet mentése
            </button>
          </Section>
        )}

        {role === "participant" && (
          <Section id="meeting-shared-notes" title="Megosztott jegyzet" icon={MessageSquareText}>
            <p className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{workspace.sharedNote || "A szervező még nem tett közzé közös jegyzetet."}</p>
          </Section>
        )}

        <MeetingTextEntriesSection workspace={workspace} role={role} locked={workspaceLocked} postWorkspace={postWorkspace} setStatus={setStatus} />

        <Section id="meeting-attachments" title="Képek és mellékletek" icon={Paperclip} badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{visibleAttachments.length}</span>}>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-semibold text-amber-900">
            <AlertTriangle size={13} className="shrink-0" />
            ZIP fájl nem csomagolódik ki automatikusan; először az értekezleti bejövőbe kerül.
          </div>
          <input
            value={actorName}
            onChange={(event) => setActorName(event.target.value)}
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] outline-none focus:border-indigo-400"
            placeholder="Feltöltő neve"
          />
          {role === "organizer" && !workspaceLocked && (
            <button
              type="button"
              onClick={() => void (onOpenCapture ? onOpenCapture() : captureScreenForMeeting())}
              disabled={capturingScreen}
              className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-[10px] font-black text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
            >
              {capturingScreen ? <Loader2 size={15} className="animate-spin" /> : <MonitorUp size={15} />}
              Képernyő vagy alkalmazásablak rögzítése és szerkesztése
            </button>
          )}
          <div
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragActive(false); }}
            onDrop={(event) => { event.preventDefault(); setDragActive(false); void uploadFiles(event.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50"}`}
          >
            {uploading ? <Loader2 className="mx-auto animate-spin text-indigo-600" size={24} /> : <FolderUp className="mx-auto text-indigo-600" size={24} />}
            <div className="mt-2 text-[12px] font-black text-slate-800">Kép vagy fájl behúzása ide</div>
            <div className="mt-1 text-[10px] font-semibold text-slate-500">vagy kattints a tallózáshoz</div>
            <div className="mt-2 text-[9px] font-bold leading-4 text-slate-500">
              {workspace.settings.allowedExtensions.map((item) => item.toUpperCase()).join(", ")}<br />
              Maximális méret: {formatFileSize(workspace.settings.maxFileSizeBytes)} / fájl · egyszerre max. 10 fájl
            </div>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />

          <div className="mt-3 space-y-2">
            {visibleAttachments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-500">Nincs megjeleníthető melléklet.</div>
            ) : visibleAttachments.map((file) => {
              const fileUrl = `/api/meeting-assistant/files/${encodeURIComponent(file.id)}?meetingId=${encodeURIComponent(meetingId)}${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`;
              const isImage = file.mimeType.startsWith("image/");
              const isPdfFile = file.mimeType === "application/pdf" || file.originalName.toLowerCase().endsWith(".pdf");
              const mediaFile = isImage || isPdfFile;
              const expanded = expandedAttachmentIds.has(file.id);
              const description = file.description || file.caption || "";
              const collaborativeTextEdit = !workspaceLocked && (canEditContent || file.status === "shared");
              const canOpenEditor = mediaFile && (role === "organizer" || file.status === "shared" || canEditContent);
              const sourceLabel = file.sourceType === "screen_capture"
                ? "Képernyőrészlet"
                : file.sourceType === "pdf_crop"
                  ? `PDF-részlet${file.sourcePage ? ` · ${file.sourcePage}. oldal` : ""}`
                  : file.sourceType === "image_edit"
                    ? "Szerkesztett kép"
                    : "Feltöltött fájl";
              const statusLabel = file.status === "shared" ? "Megosztva" : file.status === "approved" ? "Jóváhagyva" : file.status === "rejected" ? "Elutasítva" : "A szervező megkapta";
              return (
                <article key={file.id} data-meeting-attachment-id={file.id} className={`overflow-hidden rounded-xl border bg-white ${file.includeInAi ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}>
                  <button type="button" onClick={() => toggleAttachment(file.id)} className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-slate-50" aria-expanded={expanded}>
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl} alt={file.title || description || file.originalName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-400">{file.isZip ? <FileArchive size={25} /> : isPdfFile ? <FileText size={25} /> : <FileImage size={25} />}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-black text-slate-900">{file.title || file.originalName}</div>
                      <div className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-600">{description || "Nincs még képaláírás vagy közös megjegyzés."}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[8px] font-bold">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">{sourceLabel}</span>
                        <span className={`rounded-full px-1.5 py-0.5 ${file.status === "shared" ? "bg-emerald-100 text-emerald-700" : file.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{statusLabel}</span>
                      </div>
                    </div>
                    {expanded ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-200 p-3">
                      {isImage && (
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="mb-3 block overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileUrl} alt={file.title || description || file.originalName} className="max-h-72 w-full object-contain" />
                        </a>
                      )}
                      <div className="flex flex-wrap items-center gap-1 text-[8px] font-bold text-slate-500">
                        <span>{formatFileSize(file.sizeBytes)} · feltöltötte: {file.uploadedBy}</span>
                        {file.includeInAi && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-700">AI-összefoglaló</span>}
                        {file.editedBy && <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-cyan-800">Szerkesztette: {file.editedBy}</span>}
                      </div>

                      {canEditContent && (
                        <input
                          key={`${file.id}:title:${file.title || ""}`}
                          defaultValue={file.title || ""}
                          onBlur={(event) => void postWorkspace("update_attachment", { fileId: file.id, title: event.target.value, description, caption: description, includeInAi: Boolean(file.includeInAi), agendaItemId: file.agendaItemId || "", actorName })}
                          placeholder="Rövid cím..."
                          className="mt-2 w-full rounded-md border border-slate-200 px-2 py-2 text-[10px] font-semibold text-slate-800"
                        />
                      )}
                      <label className="mt-2 block text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">Kép alatti közös szöveg</label>
                      {collaborativeTextEdit ? (
                        <textarea
                          key={`${file.id}:description:${description}`}
                          defaultValue={description}
                          onBlur={(event) => void postWorkspace("update_attachment", { fileId: file.id, title: file.title || "", description: event.target.value, caption: event.target.value, includeInAi: Boolean(file.includeInAi), agendaItemId: file.agendaItemId || "", actorName })}
                          rows={3}
                          placeholder="Írd ide, mit kell a képről közösen látni vagy rögzíteni..."
                          className="mt-1 w-full resize-y rounded-md border border-teal-200 bg-teal-50/40 px-2 py-2 text-[10px] leading-5 text-slate-700"
                        />
                      ) : (
                        <div className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[10px] leading-5 text-slate-600">{description || "Nincs rögzített szöveg."}</div>
                      )}

                      {canEditContent && (
                        <div className="mt-2 space-y-2">
                          <select value={file.agendaItemId || ""} onChange={(event) => void postWorkspace("update_attachment", { fileId: file.id, title: file.title || "", description, caption: description, includeInAi: Boolean(file.includeInAi), agendaItemId: event.target.value, actorName })} className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-[9px] font-semibold text-slate-700">
                            <option value="">Nincs napirendi ponthoz rendelve</option>
                            {workspace.agenda.slice().sort((a, b) => a.order - b.order).map((agendaItem) => <option key={agendaItem.id} value={agendaItem.id}>{agendaItem.order}. {agendaItem.title}</option>)}
                          </select>
                          {mediaFile && <label className="flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-2 text-[9px] font-bold text-indigo-900"><input type="checkbox" checked={Boolean(file.includeInAi)} onChange={(event) => void postWorkspace("update_attachment", { fileId: file.id, title: file.title || "", description, caption: description, includeInAi: event.target.checked, agendaItemId: file.agendaItemId || "", actorName })} /> Kerüljön bele az AI-összefoglalóba</label>}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1">
                        <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-black text-slate-600"><Eye size={11} /> Megnyitás</a>
                        <a href={fileUrl} download className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[9px] font-black text-slate-600"><Download size={11} /> Letöltés</a>
                        {canOpenEditor && (
                          <button type="button" onClick={() => setAttachmentEditorSource({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, uploadedBy: file.uploadedBy, fileUrl, title: file.title, description, caption: file.caption, agendaItemId: file.agendaItemId, includeInAi: file.includeInAi, sourceType: file.sourceType || "upload", status: file.status })} className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2 py-1.5 text-[9px] font-black text-white">
                            <SquarePen size={11} /> {role === "organizer" ? "Megnyitás és rajzolás" : "Közös szerkesztő megnyitása"}
                          </button>
                        )}
                        {role === "organizer" && file.status === "pending" && <button type="button" onClick={() => void postWorkspace("set_attachment_status", { fileId: file.id, status: "shared" })} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[9px] font-black text-white">Jóváhagyás és megosztás</button>}
                        {role === "organizer" && file.status === "approved" && <button type="button" onClick={() => void postWorkspace("set_attachment_status", { fileId: file.id, status: "shared" })} className="rounded-md bg-emerald-600 px-2 py-1.5 text-[9px] font-black text-white">Megosztás a résztvevőkkel</button>}
                        {role === "organizer" && file.status === "shared" && <button type="button" onClick={() => void postWorkspace("set_attachment_status", { fileId: file.id, status: "approved" })} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] font-black text-amber-800">Megosztás visszavonása</button>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </Section>


        <Section id="meeting-actions" title="Döntések, feladatok és kérdések" icon={CheckCircle2} badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{visibleActions.length}</span>}>
          {canEditContent && (
            <div className="mb-3 grid grid-cols-4 gap-1">
              {(Object.keys(ACTION_STYLE) as ActionItemType[]).map((type) => (
                <button key={type} type="button" onClick={() => { setActionType(type); setActionAgendaItemId(workspace.currentAgendaItemId); setShowActionForm(true); }} className={`rounded-lg border px-1 py-2 text-[9px] font-black ${ACTION_STYLE[type].className}`}>{ACTION_STYLE[type].label}</button>
              ))}
            </div>
          )}
          {showActionForm && canEditContent && (
            <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <div className="flex items-center justify-between"><span className="text-[10px] font-black text-indigo-800">Új {ACTION_STYLE[actionType].label.toLowerCase()}</span><button type="button" onClick={() => setShowActionForm(false)}><X size={14} /></button></div>
              <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-indigo-200 px-2 py-2 text-[11px]" placeholder="Megfogalmazás" />
              <select value={actionAgendaItemId} onChange={(event) => setActionAgendaItemId(event.target.value)} className="mt-2 w-full rounded-lg border border-indigo-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700">
                <option value="">Nincs napirendi ponthoz rendelve</option>
                {workspace.agenda.slice().sort((a, b) => a.order - b.order).map((agendaItem) => <option key={agendaItem.id} value={agendaItem.id}>{agendaItem.order}. {agendaItem.title}</option>)}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={actionOwner} onChange={(event) => setActionOwner(event.target.value)} className="min-w-0 rounded-lg border border-indigo-200 px-2 py-2 text-[11px]" placeholder="Felelős" />
                <input type="date" value={actionDueDate} onChange={(event) => setActionDueDate(event.target.value)} className="min-w-0 rounded-lg border border-indigo-200 px-2 py-2 text-[11px]" />
              </div>
              <button type="button" onClick={() => void addActionItem()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white"><Plus size={12} /> Mentés</button>
            </div>
          )}
          <div className="space-y-2">
            {visibleActions.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-500">Még nincs rögzített közös elem.</div> : visibleActions.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${ACTION_STYLE[item.type].className}`}>{ACTION_STYLE[item.type].label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-black text-slate-800">{item.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold text-slate-500">
                      <span>Felelős: {item.owner || "nincs megadva"}</span>
                      <span>Határidő: {item.dueDate || "nincs megadva"}</span>
                      <span>Napirend: {workspace.agenda.find((agendaItem) => agendaItem.id === item.agendaItemId)?.title || "nincs hozzárendelve"}</span>
                    </div>
                  </div>
                  {role === "organizer" && (
                    <button type="button" onClick={() => void postWorkspace("toggle_action_shared", { actionId: item.id, shared: !item.shared })} className={`rounded-lg p-1.5 ${item.shared ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`} title={item.shared ? "Közzétett" : "Privát"}>{item.shared ? <Eye size={13} /> : <LockKeyhole size={13} />}</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </Section>

        {role === "organizer" && (
          <MeetingFeedbackSection workspace={workspace} postWorkspace={postWorkspace} setStatus={setStatus} />
        )}

        {role === "organizer" && (
          <Section
            id="meeting-closure"
            title="Értekezlet lezárása és archiválása"
            icon={Archive}
            defaultOpen={false}
            badge={<span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${MEETING_STATUS_CLASS[workspace.status]}`}>{MEETING_STATUS_LABEL[workspace.status]}</span>}
          >
            <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
              <div className={`rounded-lg border p-2.5 ${pendingAttachmentCount ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><b>{pendingAttachmentCount}</b><div>jóváhagyásra váró melléklet</div></div>
              <div className={`rounded-lg border p-2.5 ${missingOwnerCount ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><b>{missingOwnerCount}</b><div>hiányzó felelős</div></div>
              <div className={`rounded-lg border p-2.5 ${missingDueDateCount ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><b>{missingDueDateCount}</b><div>hiányzó határidő</div></div>
              <div className={`rounded-lg border p-2.5 ${incompleteAgendaCount ? "border-slate-200 bg-slate-50 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}><b>{incompleteAgendaCount}</b><div>nyitott napirendi pont</div></div>
            </div>

            {workspace.closure.closedAt && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
                <div><b>Lezárta:</b> {workspace.closure.closedBy || "-"}</div>
                <div><b>Lezárás ideje:</b> {new Date(workspace.closure.closedAt).toLocaleString("hu-HU")}</div>
                <div><b>Pillanatkép:</b> v{workspace.closure.snapshotVersion}</div>
                {workspace.closure.note && <div className="mt-1 whitespace-pre-wrap"><b>Megjegyzés:</b> {workspace.closure.note}</div>}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {workspace.status === "active" || workspace.status === "draft_closed" || workspace.status === "pending_approval" ? (
                <button type="button" onClick={() => setClosureOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white hover:bg-teal-600"><Archive size={13} /> Értekezlet lezárása</button>
              ) : (
                <button type="button" onClick={() => void reopenMeeting()} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black text-sky-800"><RotateCcw size={13} /> Újranyitás szerkesztéshez</button>
              )}
              {workspace.status !== "active" && workspace.status !== "archived" && (
                <button type="button" onClick={() => void archiveMeeting()} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-black text-violet-800"><Archive size={13} /> Archiválás</button>
              )}
              <a href="/ertekezletek" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700"><FileText size={13} /> Archívum megnyitása</a>
            </div>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Jegyzőkönyvi export</div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=pdf&includePrivate=1${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-black text-white"><FileText size={13} /> PDF</a>
                <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=docx&includePrivate=1${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-black text-white"><FileText size={13} /> Szerkeszthető DOCX</a>
                <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=html&includePrivate=1${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black text-sky-800"><Download size={13} /> Szerkeszthető HTML</a>
                <a href={`/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=json&includePrivate=1${accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : ""}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-700"><Download size={13} /> JSON adatcsomag</a>
              </div>
            </div>
          </Section>
        )}

        {role === "organizer" && (
          <Section id="meeting-ai-tools" title="AI segédfunkciók - csak gombnyomásra" icon={Bot} defaultOpen={false} badge={<span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${aiConfig?.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{aiConfig?.configured ? "API aktív" : "API kulcs szükséges"}</span>}>
            <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 text-[10px] leading-4 text-indigo-900">
              Az AI nem fut automatikusan. Minden gombon látszik a becsült költség; futtatás előtt külön jóváhagyás szükséges.
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {aiConfig?.actions.filter((item) => COMPACT_AI_ACTIONS.has(item.key)).map((action) => {
                const Icon = AI_ICON[action.key] || Sparkles;
                const estimate = aiEstimates[action.key];
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => estimate && setAiConfirm(estimate)}
                    disabled={!estimate || aiRunning !== null}
                    className="group rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:shadow-md disabled:opacity-50"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Icon size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-black text-slate-800">{action.label}</div>
                        <div className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-500">{action.description}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-[9px] font-black">
                      <span className="text-slate-500">Becsült költség</span>
                      <span className="text-indigo-700">{estimate ? formatHuf(estimate.estimatedCostHuf) : "számítás..."}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {aiOutput && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-950 p-3 text-[10px] leading-5 text-slate-100">{aiOutput}</pre>}
          </Section>
        )}

        {role === "organizer" && isTeamsMeeting && (
          <Section id="meeting-ai-interpreter" title="AI tolmács - tervezett első verzió" icon={Globe2} defaultOpen={false} badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase text-slate-600">előkészítve</span>}>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] font-black text-slate-500">Forrásnyelv<select disabled className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[10px]"><option>Automatikus felismerés</option></select></label>
              <label className="text-[9px] font-black text-slate-500">Célnyelv<select disabled className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[10px]"><option>Magyar</option></select></label>
            </div>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px] leading-4 text-slate-600">
              Az első verzió fordított feliratot, kézi indítást/leállítást és futás közbeni költségmérőt kap. Valós hangkapcsolathoz Azure Speech kulcs és Teams audioforrás szükséges.
            </div>
            <button type="button" disabled className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-200 px-3 py-2 text-[10px] font-black text-slate-500"><Play size={13} /> Tolmácsolás indítása</button>
          </Section>
        )}
      </div>

      <div className="relative shrink-0 border-t border-slate-200 bg-white px-2 py-1.5 shadow-[0_-4px_14px_rgba(15,23,42,0.06)]">
        {shareComposerOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-40 max-h-[68vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-slate-950">Szöveges gyorsrögzítés</div><div className="mt-1 text-[10px] leading-4 text-slate-500">A név kötelező, a kapcsolódó napirendi pont opcionális.</div></div><button type="button" onClick={() => setShareComposerOpen(false)} title="Bezárás" className="rounded-lg border border-slate-200 p-1.5 text-slate-500"><X size={15} /></button></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={actorName} onChange={(event) => setActorName(event.target.value)} placeholder="Bejegyző neve *" className="rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /><input value={actorEmail} onChange={(event) => setActorEmail(event.target.value)} placeholder="E-mail (opcionális)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></div>
            <select value={shareAgendaItemId} onChange={(event) => setShareAgendaItemId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-semibold"><option value="">Nincs napirendi ponthoz rendelve</option>{workspace.agenda.slice().sort((a, b) => a.order - b.order).map((item) => <option key={item.id} value={item.id}>{item.order}. {item.title}</option>)}</select>
            <textarea value={shareText} onChange={(event) => setShareText(event.target.value)} rows={5} placeholder="Írd vagy illeszd be a szöveges bejegyzést..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-[12px] leading-5 outline-none focus:border-teal-500" />
            <label className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[9px] font-bold text-slate-700"><input type="checkbox" checked={shareIncludeInDocument} onChange={(event) => setShareIncludeInDocument(event.target.checked)} /> Kerüljön az élő dokumentumba és az exportba</label>
            <button type="button" onClick={() => void submitSharedText()} disabled={!shareText.trim() || !actorName.trim() || actorName.trim().toLocaleLowerCase("hu-HU") === "résztvevő" || shareSending} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-[11px] font-black text-white disabled:opacity-40">{shareSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {role === "organizer" || role === "editor" ? "Bejegyzés rögzítése az értekezletbe" : "Küldés a szervezőnek vagy szerkesztőnek"}</button>
          </div>
        )}
        <div className="flex h-9 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => void openLiveDocument()} title="Teljes képernyős élő dokumentum" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white"><Maximize2 size={15} /></button>
          <button type="button" onClick={() => void toggleLiveFollow()} title={workspace.presentation.enabled && workspace.presentation.mode === "follow" ? "Élő követés kikapcsolása" : "Élő követés bekapcsolása"} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${workspace.presentation.enabled && workspace.presentation.mode === "follow" ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800"}`}><RadioTower size={15} /></button>
          <button type="button" onClick={() => setPresentationControlOpen(true)} title="Közös nézet vezérlőkód és vezérléskezelés" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-800"><KeyRound size={15} />{workspace.presentationControl.status === "pending" && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />}</button>
          <button type="button" onClick={() => setShareComposerOpen((current) => !current)} data-meeting-text-button title="Szöveges gyorsrögzítés" aria-expanded={shareComposerOpen} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white"><MessageSquareText size={15} />{pendingSharedMessages.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-black text-white">{pendingSharedMessages.length}</span>}</button>
          {isTeamsMeeting && onShareToStage && <button type="button" data-meeting-share-button aria-label="DIMPRO Értekezleti Kísérő megosztása" onClick={() => void onShareToStage()} disabled={!shareToStageAvailable} title={shareToStageAvailable ? "DIMPRO Értekezleti Kísérő megosztása" : "A Teams-szerepkör nem engedélyezi a megosztást"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white disabled:opacity-35"><Share2 size={15} /></button>}
          {(role === "organizer" || role === "editor") && <button type="button" onClick={() => setSafeCloseOpen(true)} title="Minden mentése és munkamenet biztonságos bezárása" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700"><Power size={15} /></button>}
        </div>
        <div className="mt-1 flex h-7 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 text-[8px] font-semibold text-sky-900" title={liveStatusText}><span className={`h-2 w-2 shrink-0 rounded-full ${status.toLocaleLowerCase("hu-HU").includes("hiba") ? "bg-rose-500" : presentationUpdating ? "bg-sky-500" : "bg-emerald-500"}`} /><span className="min-w-0 flex-1 truncate">{liveStatusText}</span></div>
      </div>

      {liveDocumentOpen && <div className="fixed inset-0 z-[9000] overflow-y-auto bg-[#eef3f7]"><MeetingLiveDocumentView workspace={workspace} meetingId={meetingId} accessToken={accessToken} onClose={() => { setLiveDocumentOpen(false); void updatePresentationState({ enabled: true, mode: "follow", activeSectionId: activeSectionRef.current }, true); }} /></div>}
      {presentationControlOpen && <MeetingPresentationControlModal meetingId={meetingId} accessToken={accessToken} presentationToken={presentationToken} workspace={workspace} role={role} actorName={actorName} onTokenChange={savePresentationToken} onRefresh={() => fetchWorkspace(true)} onClose={() => setPresentationControlOpen(false)} setStatus={setStatus} />}
      {safeCloseOpen && <MeetingSafeCloseModal workspace={workspace} role={role} actorName={actorName} postWorkspace={postWorkspace} onStopSharing={onStopSharing} onClose={() => setSafeCloseOpen(false)} setStatus={setStatus} />}

      {helpOpen && <MeetingHelpModal meetingId={meetingId} role={role} onClose={() => setHelpOpen(false)} />}

      {closureOpen && (
        <MeetingPublishModal
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          postWorkspace={postWorkspace}
          onClose={() => setClosureOpen(false)}
          setStatus={setStatus}
        />
      )}

      {archiveOpen && (
        <MeetingArchiveModal
          meetingId={meetingId}
          accessToken={accessToken}
          role={role}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {projectProfilesOpen && role === "organizer" && (
        <MeetingProjectProfileModal
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          postWorkspace={postWorkspace}
          onClose={() => setProjectProfilesOpen(false)}
          setStatus={setStatus}
        />
      )}

      {aiMinutesOpen && role === "organizer" && (
        <MeetingAiMinutesModal
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          postWorkspace={postWorkspace}
          onClose={() => setAiMinutesOpen(false)}
          setStatus={setStatus}
        />
      )}

      {feedbackOpen && role === "participant" && (
        <MeetingFeedbackModal
          workspace={workspace}
          postWorkspace={postWorkspace}
          onClose={() => setFeedbackOpen(false)}
          setStatus={setStatus}
        />
      )}

      {editorAccessOpen && (
        <MeetingEditorAccessModal
          meetingId={meetingId}
          accessToken={accessToken}
          workspace={workspace}
          role={role}
          actorName={actorName}
          onClose={() => setEditorAccessOpen(false)}
          onWorkspaceRefresh={() => fetchWorkspace(true)}
          onEditorActivated={activateEditorAccess}
          onEditorLeft={leaveEditorAccess}
          setStatus={setStatus}
        />
      )}

      {attachmentEditorSource && (
        <MeetingAttachmentEditor
          meetingId={meetingId}
          accessToken={accessToken}
          role={role}
          actorName={actorName}
          agenda={workspace.agenda}
          source={attachmentEditorSource}
          onClose={() => setAttachmentEditorSource(null)}
          onSaved={() => fetchWorkspace(true)}
          compact={embedded}
        />
      )}

      {aiConfirm && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Sparkles size={20} /></span>
              <div className="min-w-0 flex-1"><h3 className="text-base font-black text-slate-950">AI-futtatás jóváhagyása</h3><p className="mt-1 text-[11px] text-slate-500">A művelet csak a gomb megnyomása után indul.</p></div>
              <button type="button" onClick={() => setAiConfirm(null)}><X size={18} /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Modell</dt><dd className="mt-1 font-black text-slate-900">{aiConfirm.model}</dd></div>
              <div className="rounded-xl bg-indigo-50 p-3"><dt className="font-bold text-indigo-600">Becsült költség</dt><dd className="mt-1 text-lg font-black text-indigo-800">{formatHuf(aiConfirm.estimatedCostHuf)}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Bemenet</dt><dd className="mt-1 font-black text-slate-900">~{aiConfirm.inputTokens.toLocaleString("hu-HU")} token</dd></div>
              <div className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">Max. kimenet</dt><dd className="mt-1 font-black text-slate-900">{aiConfirm.outputTokens.toLocaleString("hu-HU")} token</dd></div>
            </dl>
            {!aiConfig?.configured && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">Az OPENAI_API_KEY még nincs beállítva. A költségbecslés működik, a tényleges futtatás kulcs nélkül hibát jelez.</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAiConfirm(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-black text-slate-600">Mégse</button>
              <button type="button" onClick={() => void runAi()} disabled={aiRunning !== null} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50">{aiRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Futtatás - max. {formatHuf(aiConfirm.estimatedCostHuf)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
