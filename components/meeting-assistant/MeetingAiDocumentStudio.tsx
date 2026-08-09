"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileArchive,
  FileCheck2,
  FileOutput,
  FilePenLine,
  FileSearch,
  FileText,
  Gauge,
  History,
  ImageIcon,
  ListChecks,
  Loader2,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  TextSearch,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  MeetingAiAction,
  MeetingAiActionDefinition,
  MeetingAiEstimate,
  MeetingAiModelDefinition,
  MeetingAiModelTier,
  MeetingAiUsageRecord,
} from "@/app/lib/meeting-assistant/ai";
import type { MeetingActionItem, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type StudioTab = "summary" | "transcript" | "decisions" | "tasks" | "attachments" | "preview" | "history";

type AiConfig = {
  configured: boolean;
  model: string;
  usdHufRate: number;
  maxSingleRequestHuf: number;
  models: MeetingAiModelDefinition[];
  budgets: {
    monthlyUserHuf: number;
    monthlyProjectHuf: number;
    monthlyOrganizationHuf: number;
    warningPercent: number;
  };
  actions: Array<MeetingAiActionDefinition & { key: MeetingAiAction }>;
};

type UsageSummary = {
  meetingActualCostHuf: number;
  monthlyActualCostHuf: number;
  successfulRuns: number;
  failedRuns: number;
  recentRuns: MeetingAiUsageRecord[];
};

type AiApiResponse = {
  ok?: boolean;
  config?: AiConfig;
  usage?: UsageSummary;
  estimate?: MeetingAiEstimate;
  result?: {
    text: string;
    provider: string;
    modelTier: MeetingAiModelTier;
    model: string;
    modelDisplayName: string;
    actualCostHuf: number;
    durationMs: number;
    usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  };
  workspace?: MeetingWorkspace;
  error?: string;
};

const TAB_ITEMS: Array<{ key: StudioTab; label: string; icon: typeof FileText }> = [
  { key: "summary", label: "Összefoglaló", icon: FilePenLine },
  { key: "transcript", label: "Átirat", icon: TextSearch },
  { key: "decisions", label: "Döntések", icon: CheckCircle2 },
  { key: "tasks", label: "Feladatok", icon: ListChecks },
  { key: "attachments", label: "Mellékletek", icon: ImageIcon },
  { key: "preview", label: "Dokumentum-előnézet", icon: FileCheck2 },
  { key: "history", label: "AI-előzmények", icon: History },
];

const CATEGORY_LABEL: Record<MeetingAiActionDefinition["category"], string> = {
  preprocess: "Előfeldolgozás",
  document: "Dokumentumkészítés",
  verification: "Ellenőrzés",
  refinement: "Finomítás",
};

const CATEGORY_ICON: Record<MeetingAiActionDefinition["category"], typeof Sparkles> = {
  preprocess: FileSearch,
  document: FileOutput,
  verification: ShieldCheck,
  refinement: WandSparkles,
};

const TIER_CLASS: Record<MeetingAiModelTier, string> = {
  fast: "border-emerald-200 bg-emerald-50 text-emerald-900",
  balanced: "border-sky-200 bg-sky-50 text-sky-900",
  premium: "border-violet-200 bg-violet-50 text-violet-900",
  audit: "border-amber-200 bg-amber-50 text-amber-900",
};

const ACTION_TYPE_LABEL: Record<MeetingActionItem["type"], string> = {
  task: "Feladat",
  decision: "Döntés",
  question: "Nyitott kérdés",
  deadline: "Határidő",
};

function formatHuf(value: number | undefined) {
  if (!Number.isFinite(value)) return "–";
  if ((value ?? 0) < 0.01) return "< 0,01 Ft";
  return `${(value ?? 0).toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ft`;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString("hu-HU")} KB`;
  return `${bytes.toLocaleString("hu-HU")} B`;
}

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formatDateTime(value: string) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU", { dateStyle: "short", timeStyle: "short" });
}

function resolveEditableAiDraft(workspace: MeetingWorkspace) {
  const savedDraft = String(workspace.aiMinutesDraft || "").trim();
  if (savedDraft) return { text: savedDraft, source: "saved" as const, recoveredAt: "" };

  const latestDraftResult = workspace.aiResults
    .filter((item) => item.action === "draft_minutes" && item.status !== "error" && String(item.text || "").trim())
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })[0];

  if (latestDraftResult) {
    return {
      text: latestDraftResult.text.trim(),
      source: "history" as const,
      recoveredAt: latestDraftResult.createdAt,
    };
  }

  return { text: "", source: "empty" as const, recoveredAt: "" };
}

function responseFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1]); } catch { return utf8Match[1]; }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallback;
}

function DocumentPreview({ workspace, draft }: { workspace: MeetingWorkspace; draft: string }) {
  const lines = draft.split("\n");
  const nodes: React.ReactNode[] = [];
  let takeawayLines: string[] = [];

  function flushTakeaways() {
    if (takeawayLines.length === 0) return;
    nodes.push(
      <div key={`takeaway-${nodes.length}`} className="my-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-800">Lényeg röviden</div>
        <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-700">
          {takeawayLines.map((line, index) => <div key={index}>– {line.replace(/^[-–•]\s*/, "")}</div>)}
        </div>
      </div>,
    );
    takeawayLines = [];
  }

  let inTakeaway = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (/^lényeg röviden[:]?$/i.test(line)) {
      flushTakeaways();
      inTakeaway = true;
      return;
    }
    if (inTakeaway && /^[-–•]\s+/.test(line)) {
      takeawayLines.push(line);
      return;
    }
    if (inTakeaway && line) {
      flushTakeaways();
      inTakeaway = false;
    }
    if (!line) {
      nodes.push(<div key={`space-${index}`} className="h-2" />);
    } else if (/^#{1,3}\s+/.test(line) || /^\d+\.\s+[A-ZÁÉÍÓÖŐÚÜŰ]/.test(line) || /^[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ\s–-]{5,}$/.test(line)) {
      nodes.push(<h3 key={index} className="mt-5 text-base font-black text-slate-950">{line.replace(/^#{1,3}\s+/, "")}</h3>);
    } else if (/^[-–•]\s+/.test(line)) {
      nodes.push(<div key={index} className="pl-3 text-sm leading-6 text-slate-700">– {line.replace(/^[-–•]\s+/, "")}</div>);
    } else {
      nodes.push(<p key={index} className="text-sm leading-7 text-slate-700">{line}</p>);
    }
  });
  flushTakeaways();

  return (
    <article className="meeting-document-preview mx-auto min-h-[760px] max-w-[820px] bg-white px-10 py-12 shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:px-14">
      <div className="border-b-2 border-teal-700 pb-6">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">DIMPRO Értekezleti Asszisztens</div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950">{workspace.documentLabel}</h1>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div><b>Értekezlet:</b> {workspace.title}</div>
          <div><b>Projekt:</b> {workspace.projectName}</div>
          <div><b>Dátum:</b> {workspace.scheduledStart ? formatDateTime(workspace.scheduledStart) : "Pontosítandó"}</div>
          <div><b>Dokumentumszám:</b> {workspace.minuteNumber || "Nincs lefoglalva"}</div>
        </div>
      </div>
      <div className="mt-8">{nodes.length ? nodes : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Még nincs szerkesztett dokumentumtervezet.</div>}</div>
      <div className="mt-10 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        AI által támogatott, emberi jóváhagyásra váró tervezet. Az eredeti Teams-átirat változatlanul, külön mellékletként őrzendő meg.
      </div>
    </article>
  );
}

export default function MeetingAiDocumentStudio({ meetingId, accessToken }: { meetingId: string; accessToken: string }) {
  const [workspace, setWorkspace] = useState<MeetingWorkspace | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<StudioTab>("summary");
  const [selectedAction, setSelectedAction] = useState<MeetingAiAction>("draft_minutes");
  const [selectedTier, setSelectedTier] = useState<MeetingAiModelTier>("balanced");
  const [estimate, setEstimate] = useState<MeetingAiEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [costAccepted, setCostAccepted] = useState(false);
  const [premiumAccepted, setPremiumAccepted] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [aiOutput, setAiOutput] = useState("");
  const [lastRunMeta, setLastRunMeta] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(390);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"docx" | "pdf" | null>(null);
  const [draftSource, setDraftSource] = useState<"saved" | "history" | "edited" | "empty">("empty");
  const [recoveredAt, setRecoveredAt] = useState("");
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const suffix = accessToken ? `&accessToken=${encodeURIComponent(accessToken)}` : "";
      const [workspaceResponse, aiResponse] = await Promise.all([
        fetch(`/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}${suffix}`, { cache: "no-store" }),
        fetch(`/api/meeting-assistant/ai?meetingId=${encodeURIComponent(meetingId)}${suffix}`, { cache: "no-store" }),
      ]);
      const workspaceData = await readJsonResponse<{ workspace?: MeetingWorkspace; error?: string }>(workspaceResponse, "A munkatér nem tölthető be.");
      const aiData = await readJsonResponse<AiApiResponse>(aiResponse, "Az AI-beállítások nem tölthetők be.");
      if (!workspaceResponse.ok || !workspaceData.workspace) throw new Error(workspaceData.error || "A munkatér nem tölthető be.");
      if (!aiResponse.ok || !aiData.config) throw new Error(aiData.error || "Az AI-beállítások nem tölthetők be.");
      const resolvedDraft = resolveEditableAiDraft(workspaceData.workspace);
      setWorkspace(workspaceData.workspace);
      setConfig(aiData.config);
      setUsage(aiData.usage || null);
      if (!draftDirty) {
        setDraft(resolvedDraft.text);
        setDraftSource(resolvedDraft.source);
        setRecoveredAt(resolvedDraft.recoveredAt);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Betöltési hiba.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, draftDirty, meetingId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const selectedActionDefinition = useMemo(
    () => config?.actions.find((item) => item.key === selectedAction) || null,
    [config, selectedAction],
  );

  useEffect(() => {
    if (!selectedActionDefinition) return;
    if (!selectedActionDefinition.allowedTiers.includes(selectedTier)) {
      setSelectedTier(selectedActionDefinition.defaultTier);
    }
  }, [selectedActionDefinition, selectedTier]);

  const transcriptText = useMemo(
    () => workspace?.transcript.map((line) => `${line.at} ${line.speaker}: ${line.text}`).join("\n") || "",
    [workspace],
  );

  const sourceStats = useMemo(() => {
    const words = countWords(transcriptText);
    const estimatedTokens = Math.ceil(Math.max(transcriptText.length, 1) / 4);
    const sourceFiles = workspace?.attachments.filter((file) => ["pdf", "docx", "txt", "zip"].includes(file.extension.toLowerCase())) || [];
    return {
      words,
      estimatedTokens,
      transcriptLines: workspace?.transcript.length || 0,
      sourceFiles,
      aiAttachments: workspace?.attachments.filter((file) => file.includeInAi) || [],
      participantCount: workspace?.attendees.length || workspace?.participants.length || 0,
    };
  }, [transcriptText, workspace]);

  const aiContext = useMemo(() => {
    if (!workspace) return {};
    return {
      meeting: {
        id: workspace.meetingId,
        title: workspace.title,
        projectId: workspace.projectId,
        projectCode: workspace.projectCode,
        projectName: workspace.projectName,
        meetingType: workspace.meetingType,
        documentKind: workspace.documentKind,
        documentLabel: workspace.documentLabel,
        scheduledStart: workspace.scheduledStart,
        scheduledEnd: workspace.scheduledEnd,
        location: workspace.meetingLocation,
        chairpersonName: workspace.chairpersonName,
        minuteTakerName: workspace.minuteTakerName,
        approverName: workspace.approverName,
      },
      participants: workspace.attendees.length ? workspace.attendees : workspace.participants,
      agenda: workspace.agenda,
      transcript: workspace.transcript,
      actionItems: workspace.actionItems,
      selectedAttachments: workspace.attachments
        .filter((item) => item.includeInAi)
        .map((item) => ({
          id: item.id,
          name: item.originalName,
          title: item.title || item.originalName,
          description: item.description || item.caption,
          sourceType: item.sourceType || "upload",
          sourcePage: item.sourcePage,
          status: item.status,
          agendaItemId: item.agendaItemId,
        })),
      sharedNote: workspace.sharedNote,
      privateOrganizerNotes: workspace.privateNotes,
      currentEditableDraft: draft,
      mandatoryDocumentRules: {
        keyTakeawayBlocks: true,
        limitedBoldFormatting: true,
        originalTranscriptSeparateAttachment: true,
        sourceBasedOnly: true,
        humanApprovalRequired: true,
      },
    };
  }, [draft, workspace]);

  useEffect(() => {
    if (!workspace || !config || !selectedActionDefinition) return;
    setEstimate(null);
    const timer = window.setTimeout(async () => {
      setEstimateLoading(true);
      try {
        const response = await fetch("/api/meeting-assistant/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            meetingId,
            operation: "estimate",
            action: selectedAction,
            modelTier: selectedTier,
            context: aiContext,
            accessToken,
          }),
        });
        const data = await readJsonResponse<AiApiResponse>(response, "A költségbecslés nem készíthető el.");
        if (!response.ok || !data.estimate) throw new Error(data.error || "A költségbecslés nem készíthető el.");
        setEstimate(data.estimate);
      } catch (error) {
        setEstimate(null);
        setStatus(error instanceof Error ? error.message : "Költségbecslési hiba.");
      } finally {
        setEstimateLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [accessToken, aiContext, config, meetingId, selectedAction, selectedActionDefinition, selectedTier, workspace]);

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = { x: event.clientX, width: rightPanelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizePanel(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeStartRef.current) return;
    const delta = resizeStartRef.current.x - event.clientX;
    setRightPanelWidth(Math.max(330, Math.min(620, resizeStartRef.current.width + delta)));
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function saveDraft() {
    if (!workspace) return;
    setStatus("");
    try {
      const response = await fetch("/api/meeting-assistant/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          role: "organizer",
          operation: "save_ai_minutes_draft",
          payload: { text: draft },
          accessToken,
        }),
      });
      const data = await readJsonResponse<{ workspace?: MeetingWorkspace; error?: string }>(response, "A tervezet mentése sikertelen.");
      if (!response.ok || !data.workspace) throw new Error(data.error || "A tervezet mentése sikertelen.");
      setWorkspace(data.workspace);
      setDraftDirty(false);
      setDraftSource("saved");
      setRecoveredAt("");
      setStatus("Az AI-dokumentumtervezet mentve.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Mentési hiba.");
    }
  }

  async function exportAiDraft(format: "docx" | "pdf") {
    if (!workspace || !draft.trim() || exportingFormat) {
      if (!draft.trim()) setStatus("Még nincs exportálható AI-dokumentumtervezet.");
      return;
    }
    setExportingFormat(format);
    setStatus("");
    try {
      const response = await fetch("/api/meeting-assistant/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId, accessToken, format, draft }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || `Az AI-tervezet ${format.toUpperCase()} exportja sikertelen.`);
      }
      const blob = await response.blob();
      const fallback = `${workspace.minuteNumber || workspace.title || meetingId}-AI-tervezet.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = responseFileName(response, fallback);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Az aktuális AI-dokumentumtervezet ${format.toUpperCase()} formátumban letöltve.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az AI-dokumentumtervezet exportja sikertelen.");
    } finally {
      setExportingFormat(null);
    }
  }

  async function runAi() {
    if (!estimate || estimate.action !== selectedAction || estimate.modelTier !== selectedTier || !costAccepted) return;
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch("/api/meeting-assistant/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          operation: "run",
          action: selectedAction,
          modelTier: selectedTier,
          context: aiContext,
          confirmedMaxHuf: estimate.maximumCostHuf,
          confirmedPremium: premiumAccepted,
          accessToken,
        }),
      });
      const data = await readJsonResponse<AiApiResponse>(response, "Az AI-futtatás sikertelen.");
      if (!response.ok || !data.result) throw new Error(data.error || "Az AI-futtatás sikertelen.");
      setAiOutput(data.result.text);
      setLastRunMeta(`${data.result.modelDisplayName} · ${formatHuf(data.result.actualCostHuf)} · ${(data.result.durationMs / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} mp`);
      if (data.workspace) setWorkspace(data.workspace);
      if (data.usage) setUsage(data.usage);
      setStatus("Az AI-javaslat elkészült. Ellenőrzés és kézi jóváhagyás után emelhető a dokumentumba.");
      setActiveTab(selectedAction === "quality_check" || selectedAction === "verify_responsibles_deadlines" ? "history" : "summary");
      setConfirmOpen(false);
      setCostAccepted(false);
      setPremiumAccepted(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az AI-futtatás sikertelen.");
    } finally {
      setRunning(false);
    }
  }

  function applyAiOutput(mode: "replace" | "append") {
    if (!aiOutput.trim()) return;
    setDraft((current) => mode === "replace" ? aiOutput : [current.trim(), aiOutput.trim()].filter(Boolean).join("\n\n"));
    setDraftDirty(true);
    setDraftSource("edited");
    setRecoveredAt("");
    setStatus(mode === "replace" ? "Az AI-javaslat a szerkeszthető tervezetbe került." : "Az AI-javaslat a tervezet végéhez került.");
  }

  if (loading && !workspace) {
    return <div className="flex min-h-[760px] items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="animate-spin text-teal-700" size={32} /></div>;
  }

  if (!workspace || !config) {
    return (
      <div className="flex min-h-[620px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-8 text-center">
        <AlertTriangle size={34} className="text-rose-600" />
        <div className="mt-3 text-lg font-black text-slate-950">Az AI dokumentumműhely nem tölthető be.</div>
        <div className="mt-2 max-w-xl text-sm text-slate-600">{status || "Ismeretlen betöltési hiba."}</div>
        <button type="button" onClick={() => void fetchData()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><RefreshCw size={16} /> Újrapróbálás</button>
      </div>
    );
  }

  const decisions = workspace.actionItems.filter((item) => item.type === "decision");
  const tasks = workspace.actionItems.filter((item) => item.type !== "decision");
  const monthlyBudget = config.budgets.monthlyUserHuf;
  const budgetUsed = usage?.monthlyActualCostHuf || 0;
  const budgetPercent = monthlyBudget > 0 ? Math.min(100, (budgetUsed / monthlyBudget) * 100) : 0;
  const groupedActions = (["preprocess", "document", "verification", "refinement"] as const).map((category) => ({
    category,
    actions: config.actions.filter((action) => action.category === category),
  }));
  const panelStyle = { "--ai-panel-width": `${rightPanelCollapsed ? 56 : rightPanelWidth}px` } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
      <header className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-teal-300"><BrainCircuit size={17} /> AI dokumentumműhely · emberi jóváhagyással</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-xl font-black">{workspace.title}</h2>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{workspace.projectName}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{workspace.documentLabel}</span>
            </div>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-300">Az AI csak kézi indításra dolgozik. Nem találhat ki felelőst vagy határidőt, és egyetlen eredményt sem küldhet ki automatikusan.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Átirat</div><div className="mt-1 text-sm font-black">{sourceStats.transcriptLines} sor</div></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Becsült token</div><div className="mt-1 text-sm font-black">{sourceStats.estimatedTokens.toLocaleString("hu-HU")}</div></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">AI-melléklet</div><div className="mt-1 text-sm font-black">{sourceStats.aiAttachments.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-[9px] font-bold uppercase text-slate-400">Eddigi költség</div><div className="mt-1 text-sm font-black text-teal-300">{formatHuf(usage?.meetingActualCostHuf || 0)}</div></div>
          </div>
        </div>
      </header>

      {status && (
        <div className="flex items-start gap-3 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
          <MessageSquareText size={17} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{status}</span>
          <button type="button" onClick={() => setStatus("")}><X size={16} /></button>
        </div>
      )}

      <div className="flex min-h-[820px] flex-col xl:flex-row" style={panelStyle}>
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white xl:w-64 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Források</div><button type="button" onClick={() => void fetchData()} title="Frissítés" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><RefreshCw size={14} /></button></div>
          </div>
          <div className="space-y-2 p-3">
            <button type="button" onClick={() => setActiveTab("transcript")} className="w-full rounded-xl border border-sky-200 bg-sky-50 p-3 text-left hover:border-sky-400">
              <div className="flex items-center gap-2"><FileText size={16} className="text-sky-700" /><span className="text-[11px] font-black text-slate-900">Microsoft Teams-átirat</span></div>
              <div className="mt-2 text-[10px] leading-4 text-slate-600">{sourceStats.transcriptLines} sor · {sourceStats.words.toLocaleString("hu-HU")} szó · ~{sourceStats.estimatedTokens.toLocaleString("hu-HU")} token</div>
            </button>
            <button type="button" onClick={() => setActiveTab("attachments")} className="w-full rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-left hover:border-indigo-400">
              <div className="flex items-center gap-2"><ImageIcon size={16} className="text-indigo-700" /><span className="text-[11px] font-black text-slate-900">Kijelölt képek és PDF-részletek</span></div>
              <div className="mt-2 text-[10px] leading-4 text-slate-600">{sourceStats.aiAttachments.length} melléklet kerülhet az AI-feldolgozásba.</div>
            </button>
            {sourceStats.sourceFiles.map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-2">{file.isZip ? <FileArchive size={15} className="mt-0.5 text-amber-600" /> : <FileText size={15} className="mt-0.5 text-slate-500" />}<div className="min-w-0"><div className="truncate text-[10px] font-black text-slate-800" title={file.originalName}>{file.originalName}</div><div className="mt-1 text-[9px] text-slate-500">{formatFileSize(file.sizeBytes)} · {file.status}</div></div></div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Résztvevők</div>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 p-3"><Users size={17} className="text-teal-700" /><div><div className="text-sm font-black text-slate-900">{sourceStats.participantCount}</div><div className="text-[9px] text-slate-500">felismert vagy rögzített személy</div></div></div>
          </div>
          <div className="border-t border-slate-200 p-3">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Korábbi változatok</div>
            <div className="mt-2 space-y-1.5">
              {workspace.publishedSummaries.slice(-4).reverse().map((item) => <div key={item.id} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[9px] text-slate-600"><b>v{item.version}</b> · {formatDateTime(item.publishedAt)}</div>)}
              {workspace.publishedSummaries.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[9px] text-slate-400">Nincs korábbi közzétett változat.</div>}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-[#f3f6f7]">
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
            <div className="flex gap-1 overflow-x-auto">
              {TAB_ITEMS.map((tab) => {
                const Icon = tab.icon;
                return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black transition ${activeTab === tab.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={14} /> {tab.label}</button>;
              })}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {activeTab === "summary" && (
              <div className="space-y-4">
                {aiOutput && (
                  <section className="rounded-2xl border border-indigo-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><div className="flex items-center gap-2 text-xs font-black text-indigo-950"><Sparkles size={15} /> Legutóbbi AI-javaslat</div><div className="mt-1 text-[10px] font-semibold text-indigo-700">{lastRunMeta}</div></div>
                      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => applyAiOutput("replace")} className="rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white">Átemelés a tervezetbe</button><button type="button" onClick={() => applyAiOutput("append")} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[10px] font-black text-indigo-800">Hozzáfűzés</button><button type="button" onClick={() => setAiOutput("")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600">Elvetés</button></div>
                    </div>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-5 text-[12px] leading-6 text-slate-700">{aiOutput}</pre>
                  </section>
                )}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><div className="text-sm font-black text-slate-950">Szerkeszthető értekezleti dokumentum</div><div className="mt-1 text-[10px] text-slate-500">Minden AI-eredmény csak javaslat. Mentés és közzététel előtt kézzel ellenőrizhető.</div></div>
                    <div className="flex gap-2"><button type="button" onClick={() => setActiveTab("preview")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-700"><FileCheck2 size={13} /> Előnézet</button><button type="button" onClick={() => void saveDraft()} disabled={!draftDirty} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Save size={13} /> Tervezet mentése</button></div>
                  </div>
                  {draftSource === "history" && !draftDirty && (
                    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold leading-5 text-amber-900">
                      A mentett tervezet üres volt, ezért a rendszer visszatöltötte a legutóbbi sikeres értekezleti összefoglalót az AI-előzményekből{recoveredAt ? ` (${formatDateTime(recoveredAt)})` : ""}. A tartalom megtekinthető és DOCX/PDF formátumban exportálható. Lezárt értekezletnél a munkatér mentéséhez előbb újra kell nyitni az értekezletet.
                    </div>
                  )}
                  <textarea value={draft} onChange={(event) => { setDraft(event.target.value); setDraftDirty(true); setDraftSource("edited"); setRecoveredAt(""); }} placeholder="Az AI által készített vagy kézzel írt szerkeszthető összefoglaló..." className="min-h-[560px] w-full resize-y border-0 p-5 text-[13px] leading-7 text-slate-800 outline-none" />
                </section>
              </div>
            )}

            {activeTab === "transcript" && (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3"><div className="text-sm font-black text-slate-950">Eredeti Teams-átirat</div><div className="mt-1 text-[10px] text-slate-500">Az eredeti forrás nem módosul. Az AI kizárólag másolatból dolgozik.</div></div>
                <div className="max-h-[680px] overflow-y-auto p-4">
                  {workspace.transcript.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Még nincs beolvasott vagy rögzített átirat.</div> : workspace.transcript.map((line) => <article key={line.id} className="grid grid-cols-[52px_150px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-3 text-[11px]"><div className="font-bold text-slate-400">{line.at}</div><div className="font-black text-slate-800">{line.speaker}</div><div className="leading-5 text-slate-600">{line.text}</div></article>)}
                </div>
              </section>
            )}

            {activeTab === "decisions" && (
              <section className="space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><b>{decisions.length} rögzített döntés.</b> Az AI által újonnan felismert döntések nem kerülnek automatikusan ebbe a listába; előbb embernek kell jóváhagynia őket.</div>
                {decisions.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">Döntés</span><div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">{item.title}</div><div className="mt-2 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3"><span><b>Felelős:</b> {item.owner || "Pontosítandó"}</span><span><b>Határidő:</b> {item.dueDate || "Pontosítandó"}</span><span><b>Napirend:</b> {workspace.agenda.find((agenda) => agenda.id === item.agendaItemId)?.title || "Nincs hozzárendelve"}</span></div></div></div></article>)}
                {decisions.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Nincs jóváhagyott döntés a munkatérben.</div>}
              </section>
            )}

            {activeTab === "tasks" && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3"><div className="text-sm font-black text-slate-950">Feladatok, határidők és nyitott kérdések</div></div>
                <div className="overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Típus</th><th className="px-4 py-3">Megfogalmazás</th><th className="px-4 py-3">Felelős</th><th className="px-4 py-3">Határidő</th><th className="px-4 py-3">Ellenőrzés</th></tr></thead><tbody>{tasks.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-black text-slate-700">{ACTION_TYPE_LABEL[item.type]}</td><td className="max-w-xl px-4 py-3 font-semibold text-slate-800">{item.title}</td><td className={`px-4 py-3 ${item.owner ? "text-slate-700" : "font-bold text-amber-700"}`}>{item.owner || "Pontosítandó"}</td><td className={`px-4 py-3 ${item.dueDate ? "text-slate-700" : "font-bold text-amber-700"}`}>{item.dueDate || "Pontosítandó"}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">Emberi ellenőrzés</span></td></tr>)}</tbody></table></div>
                {tasks.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nincs rögzített feladat vagy nyitott kérdés.</div>}
              </section>
            )}

            {activeTab === "attachments" && (
              <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {workspace.attachments.map((file) => <article key={file.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${file.includeInAi ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200"}`}><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${file.includeInAi ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{file.mimeType.startsWith("image/") ? <ImageIcon size={20} /> : file.isZip ? <FileArchive size={20} /> : <FileText size={20} />}</span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-black text-slate-900" title={file.title || file.originalName}>{file.title || file.originalName}</div><div className="mt-1 text-[9px] text-slate-500">{formatFileSize(file.sizeBytes)} · {file.status}</div></div></div><div className="mt-3 text-[10px] leading-5 text-slate-600">{file.description || file.caption || "Nincs leírás."}</div><div className="mt-3 flex flex-wrap gap-1.5">{file.includeInAi ? <span className="rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-black text-indigo-800">AI-feldolgozásba kijelölve</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">Nem kerül AI-hoz</span>}{file.sourcePage ? <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-bold text-sky-800">{file.sourcePage}. oldal</span> : null}</div></article>)}
                {workspace.attachments.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Nincs feltöltött melléklet.</div>}
              </section>
            )}

            {activeTab === "preview" && <DocumentPreview workspace={workspace} draft={draft} />}

            {activeTab === "history" && (
              <section className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-[10px] font-black uppercase text-emerald-700">Sikeres futtatás</div><div className="mt-2 text-2xl font-black text-emerald-950">{usage?.successfulRuns || 0}</div></div><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><div className="text-[10px] font-black uppercase text-rose-700">Sikertelen futtatás</div><div className="mt-2 text-2xl font-black text-rose-950">{usage?.failedRuns || 0}</div></div><div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="text-[10px] font-black uppercase text-sky-700">Értekezlet AI-költsége</div><div className="mt-2 text-2xl font-black text-sky-950">{formatHuf(usage?.meetingActualCostHuf || 0)}</div></div></div>
                {(usage?.recentRuns || []).map((run) => <article key={run.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-slate-900">{config.actions.find((action) => action.key === run.action)?.label || run.action}</div><div className="mt-1 text-[10px] text-slate-500">{run.provider} · {run.model} · {formatDateTime(run.createdAt)}</div></div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${run.status === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{run.status === "success" ? "Sikeres" : "Hiba"}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-700">{formatHuf(run.actualCostHuf)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{run.inputTokens.toLocaleString("hu-HU")} + {run.outputTokens.toLocaleString("hu-HU")} token</span></div></div>{run.errorMessage && <div className="mt-3 rounded-lg bg-rose-50 p-3 text-[10px] text-rose-800">{run.errorMessage}</div>}</article>)}
                {(usage?.recentRuns.length || 0) === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Még nincs naplózott AI-futtatás ennél az értekezletnél.</div>}
              </section>
            )}
          </div>
        </main>

        <aside className="relative w-full shrink-0 border-t border-slate-200 bg-white xl:w-[var(--ai-panel-width)] xl:border-l xl:border-t-0">
          <div onPointerDown={beginResize} onPointerMove={resizePanel} onPointerUp={endResize} onPointerCancel={endResize} className="absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize xl:block" title="AI-panel szélességének módosítása"><div className="mx-auto h-full w-px bg-slate-200" /></div>
          {rightPanelCollapsed ? (
            <div className="flex h-full flex-col items-center gap-3 py-4"><button type="button" onClick={() => setRightPanelCollapsed(false)} title="AI-panel megnyitása" className="rounded-xl bg-slate-950 p-3 text-white"><PanelRightOpen size={18} /></button><BrainCircuit size={18} className="text-teal-700" /><span className="[writing-mode:vertical-rl] text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">AI műveletek</span></div>
          ) : (
            <div className="flex h-full min-h-[820px] flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">AI-műveletek</div><div className="mt-1 text-[10px] text-slate-500">Csak kézi indítással</div></div><button type="button" onClick={() => setRightPanelCollapsed(true)} title="AI-panel összecsukása" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><PanelRightClose size={17} /></button></div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600"><Gauge size={14} /> Havi felhasználói keret</div>
                  <div className="mt-2 flex items-end justify-between gap-3"><div className="text-lg font-black text-slate-950">{formatHuf(budgetUsed)}</div><div className="text-[10px] font-bold text-slate-500">/ {formatHuf(monthlyBudget)}</div></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${budgetPercent >= 100 ? "bg-rose-500" : budgetPercent >= config.budgets.warningPercent ? "bg-amber-500" : "bg-teal-500"}`} style={{ width: `${budgetPercent}%` }} /></div>
                  <div className="mt-1 text-right text-[9px] font-bold text-slate-500">{budgetPercent.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}% felhasználva</div>
                </section>

                <section className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Modellszint</div>
                  <div className="mt-2 grid gap-2">
                    {config.models.map((model) => {
                      const allowed = selectedActionDefinition?.allowedTiers.includes(model.tier) ?? false;
                      return <button key={model.tier} type="button" onClick={() => allowed && setSelectedTier(model.tier)} disabled={!model.active || !allowed} className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${selectedTier === model.tier ? `${TIER_CLASS[model.tier]} ring-2 ring-offset-1` : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-black">{model.displayName}</span>{model.premiumApprovalRequired && <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[8px] font-black uppercase text-violet-900">külön jóváhagyás</span>}</div><div className="mt-1 text-[9px] leading-4 opacity-75">{model.description}</div><div className="mt-2 truncate font-mono text-[8px] opacity-60">{model.provider} · {model.modelKey}</div></button>;
                    })}
                  </div>
                </section>

                <section className="mt-4 space-y-4">
                  {groupedActions.map((group) => {
                    const Icon = CATEGORY_ICON[group.category];
                    return <div key={group.category}><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"><Icon size={13} /> {CATEGORY_LABEL[group.category]}</div><div className="mt-2 space-y-1.5">{group.actions.map((action) => <button key={action.key} type="button" onClick={() => { setSelectedAction(action.key); setSelectedTier(action.defaultTier); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedAction === action.key ? "border-teal-400 bg-teal-50 shadow-sm" : "border-slate-200 bg-white hover:border-teal-200"}`}><div className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${selectedAction === action.key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}><ChevronRight size={13} /></span><div className="min-w-0"><div className="text-[10px] font-black text-slate-800">{action.label}</div><div className="mt-0.5 line-clamp-2 text-[8px] leading-3.5 text-slate-500">{action.description}</div></div></div></button>)}</div></div>;
                  })}
                </section>

                <section className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700"><CircleDollarSign size={14} /> Költségbecslés</div>
                  <div className="mt-2 text-sm font-black text-indigo-950">{selectedActionDefinition?.label}</div>
                  <div className="mt-1 text-[9px] leading-4 text-indigo-700">{selectedActionDefinition?.expectedResult}</div>
                  {estimateLoading ? <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-700"><Loader2 size={14} className="animate-spin" /> Számítás...</div> : estimate ? <div className="mt-4 space-y-2"><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/70 p-2"><div className="text-[8px] font-bold uppercase text-slate-500">Minimum</div><div className="mt-1 text-[10px] font-black text-slate-900">{formatHuf(estimate.minimumCostHuf)}</div></div><div className="rounded-lg bg-white p-2 ring-1 ring-indigo-200"><div className="text-[8px] font-bold uppercase text-indigo-600">Várható</div><div className="mt-1 text-[11px] font-black text-indigo-950">{formatHuf(estimate.estimatedCostHuf)}</div></div><div className="rounded-lg bg-white/70 p-2"><div className="text-[8px] font-bold uppercase text-slate-500">Maximum</div><div className="mt-1 text-[10px] font-black text-slate-900">{formatHuf(estimate.maximumCostHuf)}</div></div></div><div className="grid grid-cols-2 gap-2 text-[9px] text-indigo-800"><div className="rounded-lg bg-white/70 p-2">Bemenet: <b>~{estimate.inputTokens.toLocaleString("hu-HU")}</b> token</div><div className="rounded-lg bg-white/70 p-2">Max. kimenet: <b>{estimate.outputTokens.toLocaleString("hu-HU")}</b> token</div></div></div> : <div className="mt-3 text-[10px] font-semibold text-rose-700">Nincs elérhető becslés.</div>}
                  <button type="button" onClick={() => { setCostAccepted(false); setPremiumAccepted(false); setConfirmOpen(true); }} disabled={!estimate || estimate.action !== selectedAction || estimate.modelTier !== selectedTier || running || !config.configured} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Futtatás jóváhagyása</button>
                  {!config.configured && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px] font-semibold text-amber-800">Az OPENAI_API_KEY nincs beállítva; a felület és a költségbecslés kipróbálható, a tényleges AI-futtatás nem.</div>}
                </section>

                <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"><Download size={14} /> AI-tervezet export</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void exportAiDraft("docx")} disabled={!draft.trim() || exportingFormat !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{exportingFormat === "docx" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} DOCX</button>
                    <button type="button" onClick={() => void exportAiDraft("pdf")} disabled={!draft.trim() || exportingFormat !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{exportingFormat === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} PDF</button>
                  </div>
                  <div className="mt-2 text-[9px] leading-4 text-slate-500">A letöltés pontosan a középen látható aktuális AI-dokumentumtervezetből készül, akkor is, ha a legutóbbi kézi módosítás még nincs külön elmentve.{draftSource === "history" ? " Jelenleg az AI-előzményből helyreállított összefoglaló kerül az exportba." : ""}</div>
                </section>
              </div>
            </div>
          )}
        </aside>
      </div>

      {confirmOpen && estimate && estimate.action === selectedAction && estimate.modelTier === selectedTier && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><BrainCircuit size={22} /></span><div className="min-w-0 flex-1"><h3 className="text-lg font-black text-slate-950">AI-futtatás és költség jóváhagyása</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">A művelet csak most, a jóváhagyó gomb megnyomása után indul el.</p></div><button type="button" onClick={() => setConfirmOpen(false)}><X size={20} /></button></div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-sm font-black text-slate-900">{selectedActionDefinition?.label}</div><div className="mt-1 text-[10px] text-slate-500">{estimate.modelDisplayName} · {estimate.provider} · {estimate.model}</div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-white p-3 text-center"><div className="text-[8px] font-bold uppercase text-slate-500">Minimum</div><div className="mt-1 text-sm font-black">{formatHuf(estimate.minimumCostHuf)}</div></div><div className="rounded-xl bg-indigo-50 p-3 text-center ring-1 ring-indigo-200"><div className="text-[8px] font-bold uppercase text-indigo-600">Várható</div><div className="mt-1 text-sm font-black text-indigo-950">{formatHuf(estimate.estimatedCostHuf)}</div></div><div className="rounded-xl bg-white p-3 text-center"><div className="text-[8px] font-bold uppercase text-slate-500">Engedélyezett maximum</div><div className="mt-1 text-sm font-black">{formatHuf(estimate.maximumCostHuf)}</div></div></div></div>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] font-semibold leading-5 text-indigo-950"><input type="checkbox" checked={costAccepted} onChange={(event) => setCostAccepted(event.target.checked)} className="mt-1" /><span>Elfogadom, hogy a futtatás legfeljebb <b>{formatHuf(estimate.maximumCostHuf)}</b> költségig végrehajtható. A tényleges token- és költségadatok naplózásra kerülnek.</span></label>
            {estimate.premiumApprovalRequired && <label className="mt-3 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[11px] font-semibold leading-5 text-violet-950"><input type="checkbox" checked={premiumAccepted} onChange={(event) => setPremiumAccepted(event.target.checked)} className="mt-1" /><span>Külön jóváhagyom a prémium / magas pontosságú modell használatát.</span></label>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[11px] font-black text-slate-600">Mégse</button><button type="button" onClick={() => void runAi()} disabled={!costAccepted || (estimate.premiumApprovalRequired && !premiumAccepted) || running} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-40">{running ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Jóváhagyás és futtatás</button></div>
          </div>
        </div>
      )}
    </div>
  );
}