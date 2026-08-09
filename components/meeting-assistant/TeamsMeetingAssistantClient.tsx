"use client";

import { Loader2, PauseCircle, PlayCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MeetingAssistantPanel from "./MeetingAssistantPanel";
import MeetingLiveDocumentView from "./MeetingLiveDocumentView";
import "./teams-meeting-theme.css";
import type { MeetingPresentationState, MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

type TokenPayload = {
  meetingId?: string;
  issuedTo?: string;
  exp?: number;
  grantId?: string;
};

function normalizeMeetingId(value: string) {
  return String(value || "demo-meeting")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "demo-meeting";
}

function organizerStorageKey(meetingId: string) {
  return `dimpro:teams-organizer:${meetingId}`;
}

function editorStorageKey(meetingId: string) {
  return `dimpro:meeting-editor:${meetingId}`;
}

function parseTokenPayload(token: string): TokenPayload | null {
  try {
    const [encoded] = token.split(".");
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as TokenPayload;
  } catch {
    return null;
  }
}

function usableOrganizerToken(token: string, meetingId: string) {
  const payload = parseTokenPayload(token);
  if (!payload) return false;
  if (payload.issuedTo !== "teams-organizer-editor") return false;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return false;
  return normalizeMeetingId(String(payload.meetingId || "")) === normalizeMeetingId(meetingId);
}

function usableEditorToken(token: string, meetingId: string) {
  const payload = parseTokenPayload(token);
  if (!payload) return false;
  if (payload.issuedTo !== "teams-meeting-editor" || !payload.grantId) return false;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return false;
  return normalizeMeetingId(String(payload.meetingId || "")) === normalizeMeetingId(meetingId);
}

function usableParticipantToken(token: string, meetingId: string) {
  const payload = parseTokenPayload(token);
  if (!payload) return false;
  if (!["teams-participant-readonly", "teams-meeting-participants", "teams-participant"].includes(String(payload.issuedTo || ""))) return false;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return false;
  return normalizeMeetingId(String(payload.meetingId || "")) === normalizeMeetingId(meetingId);
}

export default function TeamsMeetingAssistantClient({
  fallbackMeetingId,
  initialRole = "participant",
  stage = false,
  accessToken = "",
}: {
  fallbackMeetingId: string;
  initialRole?: MeetingViewRole;
  stage?: boolean;
  accessToken?: string;
}) {
  const [meetingId, setMeetingId] = useState(fallbackMeetingId);
  const [teamsReady, setTeamsReady] = useState(false);
  const [teamsTheme, setTeamsTheme] = useState("default");
  const [effectiveRole, setEffectiveRole] = useState<MeetingViewRole>(initialRole);
  const [effectiveToken, setEffectiveToken] = useState(accessToken);
  const [shareToStageAvailable, setShareToStageAvailable] = useState(false);
  const [stageStatus, setStageStatus] = useState("");
  const [stageSharing, setStageSharing] = useState(stage);
  const [stoppingStageShare, setStoppingStageShare] = useState(false);
  const [teamsDisplayName, setTeamsDisplayName] = useState("");
  const [stagePresentation, setStagePresentation] = useState<MeetingPresentationState | null>(null);
  const [stageWorkspace, setStageWorkspace] = useState<MeetingWorkspace | null>(null);
  const [followPaused, setFollowPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("@microsoft/teams-js")
      .then(async ({ app, meeting }) => {
        await app.initialize();
        const context = await app.getContext();
        if (cancelled) return;

        const contextMeetingId = context.meeting?.id || context.chat?.id || context.page?.id || fallbackMeetingId;
        const mappedWorkspaceMeetingId = window.localStorage.getItem(`dimpro:teams-workspace:${contextMeetingId}`) || "";
        const workspaceMeetingId = normalizeMeetingId(mappedWorkspaceMeetingId || fallbackMeetingId || contextMeetingId);
        setMeetingId(workspaceMeetingId);
        setTeamsTheme(context.app?.theme || "default");
        setTeamsDisplayName(String((context.user as { displayName?: string } | undefined)?.displayName || ""));
        app.registerOnThemeChangeHandler((theme) => {
          if (!cancelled) setTeamsTheme(theme || "default");
        });

        if (stage) {
          try {
            meeting.getAppContentStageSharingState((error, sharingState) => {
              if (!cancelled && !error) setStageSharing(Boolean(sharingState?.isAppSharing));
            });
          } catch {
            if (!cancelled) setStageSharing(true);
          }
        }

        const storedOrganizerToken = window.localStorage.getItem(organizerStorageKey(workspaceMeetingId)) || "";
        const storedEditorToken = window.localStorage.getItem(editorStorageKey(workspaceMeetingId)) || "";
        if (usableOrganizerToken(storedOrganizerToken, workspaceMeetingId)) {
          setEffectiveRole("organizer");
          setEffectiveToken(storedOrganizerToken);
        } else if (usableEditorToken(storedEditorToken, workspaceMeetingId)) {
          if (storedOrganizerToken) window.localStorage.removeItem(organizerStorageKey(workspaceMeetingId));
          setEffectiveRole("editor");
          setEffectiveToken(storedEditorToken);
        } else {
          if (storedOrganizerToken) window.localStorage.removeItem(organizerStorageKey(workspaceMeetingId));
          if (storedEditorToken) window.localStorage.removeItem(editorStorageKey(workspaceMeetingId));
          setEffectiveRole("participant");
          setEffectiveToken(accessToken);
          setShareToStageAvailable(false);
        }

        if (usableParticipantToken(accessToken, workspaceMeetingId)) {
          try {
            meeting.getAppContentStageSharingCapabilities((error, capabilities) => {
              if (!cancelled) setShareToStageAvailable(!error && Boolean(capabilities?.doesAppHaveSharePermission));
            });
          } catch {
            setShareToStageAvailable(false);
          }
        } else {
          setShareToStageAvailable(false);
        }

        setTeamsReady(true);
        app.notifySuccess();
      })
      .catch(() => {
        if (!cancelled) {
          setTeamsReady(false);
          const browserRole: MeetingViewRole = usableOrganizerToken(accessToken, fallbackMeetingId)
            ? "organizer"
            : usableEditorToken(accessToken, fallbackMeetingId)
              ? "editor"
              : initialRole;
          setMeetingId(normalizeMeetingId(fallbackMeetingId));
          setEffectiveRole(browserRole);
          setEffectiveToken(accessToken);
          setShareToStageAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, fallbackMeetingId, initialRole, stage]);

  useEffect(() => {
    if (!stage || !meetingId || !accessToken) return;
    let cancelled = false;
    let lastSequence = -1;
    async function syncStage() {
      try {
        const controlQuery = new URLSearchParams({ meetingId, accessToken });
        const [controlResponse, workspaceResponse] = await Promise.all([
          fetch(`/api/meeting-assistant/presentation-control?${controlQuery.toString()}`, { cache: "no-store" }),
          fetch(`/api/meeting-assistant/workspace?${controlQuery.toString()}`, { cache: "no-store" }),
        ]);
        const controlData = await controlResponse.json().catch(() => null) as { ok?: boolean; presentation?: MeetingPresentationState } | null;
        const workspaceData = await workspaceResponse.json().catch(() => null) as { workspace?: MeetingWorkspace } | null;
        if (cancelled) return;
        if (workspaceData?.workspace) setStageWorkspace(workspaceData.workspace);
        const presentation = controlData?.presentation;
        if (!controlResponse.ok || !presentation) return;
        setStagePresentation(presentation);
        if (presentation.sequence === lastSequence || followPaused || !presentation.enabled) return;
        lastSequence = presentation.sequence;
        if (presentation.mode === "follow") {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: presentation.activeSectionId, scope: "participant", remote: true } }));
            if (presentation.activeAgendaItemId) window.dispatchEvent(new CustomEvent("dimpro-meeting-agenda", { detail: { agendaItemId: presentation.activeAgendaItemId } }));
            if (presentation.activeAttachmentId) window.dispatchEvent(new CustomEvent("dimpro-meeting-attachment", { detail: { fileId: presentation.activeAttachmentId } }));
            const container = document.querySelector<HTMLElement>("[data-meeting-scroll-container]");
            if (container && Number.isFinite(presentation.scrollTop)) container.scrollTo({ top: presentation.scrollTop, behavior: "smooth" });
          }, 120);
        } else if (presentation.mode === "document" && presentation.activeAgendaItemId) {
          window.setTimeout(() => document.getElementById(`live-agenda-${presentation.activeAgendaItemId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
        }
      } catch {
        // A következő rövid szinkronkör újrapróbálja.
      }
    }
    void syncStage();
    const interval = window.setInterval(() => void syncStage(), 900);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [accessToken, followPaused, meetingId, stage]);

  useEffect(() => {
    if (!stage) return;
    function pauseOnManualRead() {
      if (stagePresentation?.enabled && stagePresentation.mode === "follow") setFollowPaused(true);
    }
    window.addEventListener("wheel", pauseOnManualRead, { passive: true });
    window.addEventListener("touchstart", pauseOnManualRead, { passive: true });
    return () => { window.removeEventListener("wheel", pauseOnManualRead); window.removeEventListener("touchstart", pauseOnManualRead); };
  }, [stage, stagePresentation?.enabled, stagePresentation?.mode]);

  async function openCaptureDialog() {
    const captureUrl = `${window.location.origin}/teams/meeting-assistant/capture?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(effectiveToken)}`;
    try {
      const { dialog, DialogDimension } = await import("@microsoft/teams-js");
      if (dialog.url.isSupported()) {
        dialog.url.open({
          url: captureUrl,
          title: "DIMPRO képernyőrögzítő és mellékletszerkesztő",
          size: { height: DialogDimension.Large, width: DialogDimension.Large },
        }, (result) => {
          if (result?.err) setStageStatus(result.err);
          else setStageStatus("A képernyőrögzítő ablak bezárult. A mentett melléklet rövidesen megjelenik.");
        });
        return;
      }
    } catch {
      // Böngészős előnézetben külön ablakot nyitunk.
    }
    const popup = window.open(captureUrl, "dimpro-meeting-capture", "popup=yes,width=1440,height=900,resizable=yes,scrollbars=yes");
    if (!popup) setStageStatus("A böngésző letiltotta a képernyőrögzítő felugró ablakát. Engedélyezd a felugró ablakokat az app.dimpro.hu oldalon.");
  }

  async function shareToMeetingStage() {
    if (!shareToStageAvailable || !usableParticipantToken(accessToken, meetingId)) {
      setStageStatus("A közös Teams-megosztás nem érhető el ebben a nézetben vagy az alkalmazáscsomag frissítése szükséges.");
      return;
    }
    setStageStatus("A DIMPRO közös értekezleti felület megosztása folyamatban...");
    try {
      const { meeting } = await import("@microsoft/teams-js");
      const stageUrl = `${window.location.origin}/teams/meeting-assistant/stage?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(accessToken)}`;
      await new Promise<void>((resolve, reject) => {
        meeting.shareAppContentToStage((error, result) => {
          if (error || !result) reject(new Error(error?.message || "A Teams nem engedélyezte a közös megosztást."));
          else resolve();
        }, stageUrl);
      });
      setStageSharing(true);
      setStageStatus("A DIMPRO Értekezleti Kísérő megjelent az értekezlet közös nagy felületén.");
    } catch (error) {
      setStageStatus(error instanceof Error ? error.message : "A közös Teams-megosztás sikertelen.");
    }
  }

  async function stopMeetingStageShare() {
    if (stoppingStageShare) return;
    setStoppingStageShare(true);
    setStageStatus("A megosztott DIMPRO tartalom leállítása folyamatban...");
    try {
      const { meeting } = await import("@microsoft/teams-js");
      await new Promise<void>((resolve, reject) => {
        meeting.stopSharingAppContentToStage((error, result) => {
          if (error || !result) reject(new Error(error?.message || "A Teams nem engedélyezte a megosztás leállítását."));
          else resolve();
        });
      });
      setStageSharing(false);
      setStageStatus("A DIMPRO megosztott tartalom leállt.");
    } catch (error) {
      setStageStatus(error instanceof Error ? error.message : "A megosztás leállítása sikertelen.");
    } finally {
      setStoppingStageShare(false);
    }
  }

  const roleLabel = useMemo(
    () => effectiveRole === "organizer" ? "Szervezői szerkesztő" : effectiveRole === "editor" ? "Jegyzőkönyv-szerkesztői mód" : "Résztvevői, csak olvasható nézet",
    [effectiveRole],
  );

  return (
    <div className="dimpro-meeting-theme min-h-screen" data-theme={teamsTheme}>
      {!teamsReady && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-900">
          Böngészős előnézet. Teamsben a meeting azonosító automatikusan érkezik a TeamsJS kontextusból.
        </div>
      )}
      {teamsReady && (
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
          {roleLabel}
        </div>
      )}
      {stage && stagePresentation?.enabled && stagePresentation.mode === "document" && stageWorkspace ? (
        <MeetingLiveDocumentView workspace={stageWorkspace} meetingId={meetingId} accessToken={accessToken} compact />
      ) : (
        <MeetingAssistantPanel
          key={`${meetingId}:${effectiveRole}:${effectiveToken.slice(-12)}`}
          meetingId={meetingId}
          initialRole={effectiveRole}
          initialActorName={teamsDisplayName}
          embedded
          allowRoleSwitch={false}
          accessToken={effectiveToken}
          onAccessRoleChange={(nextRole, nextToken) => { setEffectiveRole(nextRole); setEffectiveToken(nextToken); }}
          onShareToStage={() => shareToMeetingStage()}
          onStopSharing={() => stopMeetingStageShare()}
          shareToStageAvailable={shareToStageAvailable}
          externalStatus={stageStatus}
          onOpenCapture={() => openCaptureDialog()}
        />
      )}
      {stage && stageSharing && (
        <div data-meeting-stage-sharing-overlay className="pointer-events-none fixed inset-0 z-[250] border-[5px] border-red-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)]">
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl bg-red-600 px-6 py-2 text-center text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-lg sm:text-sm">
            Megosztott DIMPRO tartalom{stagePresentation?.enabled ? ` · ${stagePresentation.mode === "follow" ? "Élő követés" : stagePresentation.mode === "document" ? "Élő dokumentum" : "Rögzített nézet"}` : ""}
          </div>
          <button
            type="button"
            data-stop-stage-sharing
            onClick={() => void stopMeetingStageShare()}
            disabled={stoppingStageShare}
            title="Megosztás leállítása"
            aria-label="Megosztás leállítása"
            className="pointer-events-auto absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white bg-red-600 text-white shadow-xl transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70"
          >
            {stoppingStageShare ? <Loader2 size={20} className="animate-spin" /> : <X size={24} strokeWidth={3} />}
          </button>
        </div>
      )}
      {stage && stageSharing && stagePresentation?.enabled && (
        <button type="button" onClick={() => setFollowPaused((current) => !current)} className={`fixed bottom-4 right-4 z-[265] inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black shadow-xl ${followPaused ? "border-amber-300 bg-amber-50 text-amber-900" : "border-white/50 bg-slate-950/85 text-white"}`} title={followPaused ? "Vissza az előadó élő nézetéhez" : "Élő követés szüneteltetése saját olvasáshoz"}>{followPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />} {followPaused ? "Vissza az előadóhoz" : "Saját olvasás"}</button>
      )}
      {stage && stageStatus && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[260] max-w-[min(90vw,720px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-950/90 px-4 py-2.5 text-center text-xs font-bold text-white shadow-2xl">{stageStatus}</div>
      )}
    </div>
  );
}
