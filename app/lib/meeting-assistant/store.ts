import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgendaContentDefaults } from "./templates";
import { NATIVE_TRANSCRIPTION_ROOT } from "./native-transcription";
import {
  createDefaultMeetingWorkspace,
  type AttendanceStatus,
  type MeetingAgendaItem,
  type MeetingAgendaTemplateKey,
  type MeetingAttendanceSource,
  type MeetingPresentationMode,
  type MeetingArchiveItem,
  type MeetingAttachment,
  type MeetingAttendee,
  type MeetingDocumentKind,
  type MeetingMode,
  type MeetingFeedback,
  type MeetingFeedbackStatus,
  type MeetingFeedbackType,
  type MeetingPublishedSummary,
  type MeetingStatus,
  type MeetingTopicBlock,
  type MeetingWorkspace,
  type ParticipationMode,
} from "./types";

function resolveProjectRoot() {
  const cwd = process.cwd();
  const standaloneMarker = `${path.sep}.next${path.sep}standalone`;
  const markerIndex = cwd.lastIndexOf(standaloneMarker);
  return markerIndex >= 0 ? cwd.slice(0, markerIndex) : cwd;
}

const PROJECT_ROOT = process.env.DIMPRO_PROJECT_ROOT?.trim() || resolveProjectRoot();
export const MEETING_DATA_ROOT = process.env.DIMPRO_MEETING_DATA_ROOT?.trim() || path.join(PROJECT_ROOT, ".dimprover", "data", "meeting-assistant");
const WORKSPACE_ROOT = path.join(MEETING_DATA_ROOT, "workspaces");
const UPLOAD_ROOT = path.join(MEETING_DATA_ROOT, "uploads");
const SNAPSHOT_ROOT = path.join(MEETING_DATA_ROOT, "snapshots");

const ALLOWED_MEETING_MODES: MeetingMode[] = ["teams", "in_person"];
const ALLOWED_STATUSES: MeetingStatus[] = ["active", "draft_closed", "pending_approval", "published", "archived"];
const ALLOWED_ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "late", "left_early", "invited_absent"];
const ALLOWED_PARTICIPATION_MODES: ParticipationMode[] = ["online", "in_person"];
const ALLOWED_ATTENDANCE_SOURCES: MeetingAttendanceSource[] = ["manual", "project", "teams_invite", "teams_attendance"];
const ALLOWED_PRESENTATION_MODES: MeetingPresentationMode[] = ["follow", "document", "fixed"];
const ALLOWED_DOCUMENT_KINDS: MeetingDocumentKind[] = ["reminder", "minutes", "meeting_note"];
const ALLOWED_FEEDBACK_TYPES: MeetingFeedbackType[] = ["acknowledged", "comment", "disagree", "addition", "partial_attendance", "rating"];
const ALLOWED_FEEDBACK_STATUSES: MeetingFeedbackStatus[] = ["pending", "accepted", "rejected"];
const ALLOWED_AGENDA_TEMPLATES: MeetingAgendaTemplateKey[] = [
  "general",
  "quick_general",
  "weekly_coordination",
  "design_coordination",
  "technical_inspection",
  "defect_review",
  "handover",
];

export function sanitizeMeetingId(value: string | null | undefined) {
  const normalized = String(value || "demo-meeting")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "demo-meeting";
}

export function getMeetingUploadDir(meetingId: string) {
  return path.join(UPLOAD_ROOT, sanitizeMeetingId(meetingId));
}

export function getMeetingFilePath(meetingId: string, storedName: string) {
  return path.join(UPLOAD_ROOT, sanitizeMeetingId(meetingId), path.basename(storedName));
}

function workspaceFile(meetingId: string) {
  return path.join(WORKSPACE_ROOT, `${sanitizeMeetingId(meetingId)}.json`);
}

function snapshotDir(meetingId: string) {
  return path.join(SNAPSHOT_ROOT, sanitizeMeetingId(meetingId));
}

async function atomicWriteJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

function uniqueTextList(value: unknown, maxItems = 200) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

function asText(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeAttendees(value: unknown, legacyParticipants: unknown): MeetingAttendee[] {
  const now = new Date().toISOString();
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<MeetingAttendee>;
      const name = asText(item.name, 160);
      if (!name) return null;
      const status = ALLOWED_ATTENDANCE_STATUSES.includes(item.status as AttendanceStatus)
        ? item.status as AttendanceStatus
        : "present";
      const participationMode = ALLOWED_PARTICIPATION_MODES.includes(item.participationMode as ParticipationMode)
        ? item.participationMode as ParticipationMode
        : "online";
      return {
        id: asText(item.id || `attendee-${index + 1}`, 180),
        projectMemberId: asText(item.projectMemberId, 180),
        name,
        organization: asText(item.organization, 180),
        functionTitle: asText(item.functionTitle, 180),
        email: asText(item.email, 240),
        phone: asText(item.phone, 80),
        status,
        participationMode,
        arrivalTime: asText(item.arrivalTime, 20),
        departureTime: asText(item.departureTime, 20),
        external: Boolean(item.external),
        source: ALLOWED_ATTENDANCE_SOURCES.includes(item.source as MeetingAttendanceSource) ? item.source as MeetingAttendanceSource : "manual",
        teamsUserId: asText(item.teamsUserId, 240),
        teamsRole: asText(item.teamsRole, 120),
        responseStatus: asText(item.responseStatus, 80),
        totalAttendanceSeconds: Math.max(0, Number(item.totalAttendanceSeconds || 0)),
        attendanceIntervals: Array.isArray(item.attendanceIntervals)
          ? item.attendanceIntervals.slice(0, 100).map((interval) => ({
              joinDateTime: String(interval?.joinDateTime || ""),
              leaveDateTime: String(interval?.leaveDateTime || ""),
              durationSeconds: Math.max(0, Number(interval?.durationSeconds || 0)),
            }))
          : [],
        createdAt: String(item.createdAt || now),
        updatedAt: String(item.updatedAt || now),
      } satisfies MeetingAttendee;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (normalized.length > 0) return normalized.slice(0, 300);
  return uniqueTextList(legacyParticipants, 300).map((name, index) => ({
    id: `legacy-attendee-${index + 1}`,
    projectMemberId: "",
    name,
    organization: "",
    functionTitle: "",
    email: "",
    phone: "",
    status: "present",
    participationMode: "online",
    arrivalTime: "",
    departureTime: "",
    external: false,
    source: "manual",
    teamsUserId: "",
    teamsRole: "",
    responseStatus: "",
    totalAttendanceSeconds: 0,
    attendanceIntervals: [],
    createdAt: now,
    updatedAt: now,
  }));
}

function normalizeTopicBlocks(value: unknown): MeetingTopicBlock[] {
  const now = new Date().toISOString();
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<MeetingTopicBlock>;
      const title = asText(item.title, 300) || `Témakör ${index + 1}`;
      return {
        id: asText(item.id || `topic-${index + 1}`, 180),
        order: Number.isFinite(Number(item.order)) ? Math.max(1, Number(item.order)) : index + 1,
        title,
        background: asText(item.background, 8000),
        discussion: asText(item.discussion, 30000),
        decision: asText(item.decision, 12000),
        openQuestions: asText(item.openQuestions, 12000),
        clientOpinion: asText(item.clientOpinion, 12000),
        designerOpinion: asText(item.designerOpinion, 12000),
        contractorOpinion: asText(item.contractorOpinion, 12000),
        owner: asText(item.owner, 180),
        dueDate: asText(item.dueDate, 40),
        attachmentIds: uniqueTextList(item.attachmentIds, 200),
        privateNotes: asText(item.privateNotes, 20000),
        shared: typeof item.shared === "boolean" ? item.shared : true,
        previousMeetingId: asText(item.previousMeetingId, 180),
        previousAgendaItemId: asText(item.previousAgendaItemId, 180),
        createdAt: String(item.createdAt || now),
        updatedAt: String(item.updatedAt || now),
        updatedBy: asText(item.updatedBy || "Rendszer", 160),
      } satisfies MeetingTopicBlock;
    })
    .filter((item): item is MeetingTopicBlock => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }))
    .slice(0, 500);
}

function normalizeAgenda(value: unknown, fallback: MeetingAgendaItem[]): MeetingAgendaItem[] {
  const now = new Date().toISOString();
  const source = Array.isArray(value) ? value : fallback;
  const normalized = source
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<MeetingAgendaItem>;
      const title = asText(item.title, 300);
      if (!title) return null;
      const defaults = createAgendaContentDefaults(title, now);
      const isJoker = typeof item.isJoker === "boolean"
        ? item.isJoker
        : /joker|egyéb felmerülő témák/i.test(title);
      return {
        id: asText(item.id || `agenda-${index + 1}`, 180),
        order: Number.isFinite(Number(item.order)) ? Math.max(1, Number(item.order)) : index + 1,
        title,
        description: String(item.description ?? defaults.description).slice(0, 4000),
        discussionNotes: String(item.discussionNotes ?? defaults.discussionNotes).slice(0, 30000),
        decisionSummary: String(item.decisionSummary ?? defaults.decisionSummary).slice(0, 12000),
        openQuestions: String(item.openQuestions ?? defaults.openQuestions).slice(0, 12000),
        privateNotes: String(item.privateNotes ?? "").slice(0, 20000),
        completed: Boolean(item.completed),
        shared: typeof item.shared === "boolean" ? item.shared : true,
        isJoker,
        topicBlocks: normalizeTopicBlocks(item.topicBlocks),
        updatedAt: String(item.updatedAt || now),
        updatedBy: asText(item.updatedBy || "Rendszer", 160),
      } satisfies MeetingAgendaItem;
    })
    .filter((item): item is MeetingAgendaItem => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
  return normalized.length > 0 ? normalized.slice(0, 200) : fallback;
}

function normalizePublishedSummaries(value: unknown): MeetingPublishedSummary[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<MeetingPublishedSummary>;
      return {
        id: asText(item.id || `summary-${index + 1}`, 180),
        version: Number.isFinite(Number(item.version)) ? Math.max(1, Number(item.version)) : index + 1,
        source: item.source === "ai" ? "ai" : "rules",
        title: asText(item.title, 300),
        body: String(item.body || "").slice(0, 80000),
        closingTitle: asText(item.closingTitle, 300),
        closingMessage: String(item.closingMessage || "").slice(0, 5000),
        emailNotice: String(item.emailNotice || "").slice(0, 5000),
        emailDocumentType: item.emailDocumentType || "draft_minutes",
        emailDeliveryMode: item.emailDeliveryMode === "automatic" ? "automatic" : "organizer",
        reviewDeadline: asText(item.reviewDeadline, 40),
        nextMeetingAt: asText(item.nextMeetingAt, 40),
        nextMeetingLocation: asText(item.nextMeetingLocation, 240),
        createdAt: String(item.createdAt || new Date().toISOString()),
        createdBy: asText(item.createdBy || "Szervező", 160),
        publishedAt: String(item.publishedAt || ""),
        revokedAt: String(item.revokedAt || ""),
      } satisfies MeetingPublishedSummary;
    })
    .filter((item): item is MeetingPublishedSummary => Boolean(item))
    .sort((a, b) => a.version - b.version)
    .slice(-200);
}

function normalizeFeedback(value: unknown): MeetingFeedback[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Partial<MeetingFeedback>;
      const type = ALLOWED_FEEDBACK_TYPES.includes(item.type as MeetingFeedbackType)
        ? item.type as MeetingFeedbackType
        : "comment";
      const status = ALLOWED_FEEDBACK_STATUSES.includes(item.status as MeetingFeedbackStatus)
        ? item.status as MeetingFeedbackStatus
        : "pending";
      return {
        id: asText(item.id || `feedback-${index + 1}`, 180),
        participantName: asText(item.participantName || "Résztvevő", 160),
        participantEmail: asText(item.participantEmail, 240),
        type,
        agendaItemId: asText(item.agendaItemId, 180),
        topicBlockId: asText(item.topicBlockId, 180),
        quote: String(item.quote || "").slice(0, 5000),
        comment: String(item.comment || "").slice(0, 12000),
        ratingUseful: Math.max(0, Math.min(5, Number(item.ratingUseful || 0))),
        ratingPrepared: Math.max(0, Math.min(5, Number(item.ratingPrepared || 0))),
        ratingClarity: Math.max(0, Math.min(5, Number(item.ratingClarity || 0))),
        anonymous: Boolean(item.anonymous),
        status,
        relatedSummaryVersion: Math.max(0, Number(item.relatedSummaryVersion || 0)),
        createdAt: String(item.createdAt || new Date().toISOString()),
        reviewedAt: String(item.reviewedAt || ""),
        reviewedBy: asText(item.reviewedBy, 160),
      } satisfies MeetingFeedback;
    })
    .filter((item): item is MeetingFeedback => Boolean(item))
    .slice(-1000);
}

function normalizeWorkspace(meetingId: string, parsed?: Partial<MeetingWorkspace> | null): MeetingWorkspace {
  const safeId = sanitizeMeetingId(meetingId);
  const defaults = createDefaultMeetingWorkspace(safeId);
  const status = ALLOWED_STATUSES.includes(parsed?.status as MeetingStatus) ? parsed?.status as MeetingStatus : defaults.status;
  const attendees = normalizeAttendees(parsed?.attendees, parsed?.participants);
  const participants = attendees.length > 0
    ? uniqueTextList(attendees.map((item) => item.name), 300)
    : uniqueTextList(parsed?.participants, 300);
  const agendaTemplateKey = ALLOWED_AGENDA_TEMPLATES.includes(parsed?.agendaTemplateKey as MeetingAgendaTemplateKey)
    ? parsed?.agendaTemplateKey as MeetingAgendaTemplateKey
    : defaults.agendaTemplateKey;
  const documentKind = ALLOWED_DOCUMENT_KINDS.includes(parsed?.documentKind as MeetingDocumentKind)
    ? parsed?.documentKind as MeetingDocumentKind
    : defaults.documentKind;
  const publishedSummaries = normalizePublishedSummaries(parsed?.publishedSummaries);
  const activePublishedSummaryId = publishedSummaries.some((item) => item.id === parsed?.activePublishedSummaryId && !item.revokedAt)
    ? String(parsed?.activePublishedSummaryId)
    : publishedSummaries.filter((item) => item.publishedAt && !item.revokedAt).at(-1)?.id || "";

  return {
    ...defaults,
    ...(parsed || {}),
    version: 8,
    meetingId: safeId,
    meetingMode: ALLOWED_MEETING_MODES.includes(parsed?.meetingMode as MeetingMode) ? parsed?.meetingMode as MeetingMode : defaults.meetingMode,
    status,
    participants,
    attendees,
    agendaTemplateKey,
    documentKind,
    documentLabel: asText(parsed?.documentLabel || defaults.documentLabel, 180),
    meetingTypeCode: asText(parsed?.meetingTypeCode || defaults.meetingTypeCode, 40),
    minuteSequence: Math.max(0, Number(parsed?.minuteSequence || 0)),
    chairpersonName: asText(parsed?.chairpersonName, 160),
    minuteTakerName: asText(parsed?.minuteTakerName || parsed?.organizerName || defaults.minuteTakerName, 160),
    approverName: asText(parsed?.approverName, 160),
    closure: {
      ...defaults.closure,
      ...(parsed?.closure || {}),
    },
    nextMeeting: {
      ...defaults.nextMeeting,
      ...(parsed?.nextMeeting || {}),
    },
    participantPermissions: {
      ...defaults.participantPermissions,
      ...(parsed?.participantPermissions || {}),
    },
    settings: {
      ...defaults.settings,
      ...(parsed?.settings || {}),
    },
    sharedMessages: Array.isArray(parsed?.sharedMessages)
      ? parsed.sharedMessages
          .filter((item) => item && typeof item === "object")
          .map((item, index) => {
            const message = item as MeetingWorkspace["sharedMessages"][number];
            const status = ["pending", "shared", "rejected"].includes(String(message.status)) ? message.status : "pending";
            return {
              id: asText(message.id || `shared-message-${index + 1}`, 180),
              text: asText(message.text, 6000),
              submittedBy: asText(message.submittedBy || "Résztvevő", 160),
              submittedEmail: asText(message.submittedEmail, 240).toLowerCase(),
              agendaItemId: asText(message.agendaItemId, 180),
              includeInDocument: typeof message.includeInDocument === "boolean" ? message.includeInDocument : true,
              submittedAt: String(message.submittedAt || new Date().toISOString()),
              status,
              reviewedBy: asText(message.reviewedBy, 160),
              reviewedAt: String(message.reviewedAt || ""),
            };
          })
          .filter((item) => Boolean(item.text))
          .slice(-500)
      : [],
    transcript: Array.isArray(parsed?.transcript)
      ? parsed.transcript
          .filter((item) => item && typeof item === "object")
          .map((item, index) => ({
            id: asText(item.id || `tr-${index + 1}`, 180),
            at: asText(item.at, 40),
            speaker: asText(item.speaker || "Ismeretlen beszélő", 160),
            text: asText(item.text, 12000),
            shared: Boolean(item.shared),
            source: ["manual", "graph", "vtt", "docx", "txt", "paste", "dimpro_audio"].includes(String(item.source || "")) ? item.source : "manual",
            startSeconds: Number.isFinite(Number(item.startSeconds)) ? Math.max(0, Number(item.startSeconds)) : undefined,
            endSeconds: Number.isFinite(Number(item.endSeconds)) ? Math.max(0, Number(item.endSeconds)) : undefined,
            speakerId: asText(item.speakerId, 80) || undefined,
            transcriptionJobId: asText(item.transcriptionJobId, 180) || undefined,
          }))
          .filter((item) => Boolean(item.text))
          .slice(-10000)
      : [],
    nativeTranscription: {
      ...defaults.nativeTranscription,
      ...(parsed?.nativeTranscription || {}),
      status: ["idle", "uploading", "queued", "converting", "transcribing", "completed", "error", "cancelled"].includes(String(parsed?.nativeTranscription?.status || ""))
        ? parsed?.nativeTranscription?.status || "idle"
        : "idle",
      progress: Math.min(100, Math.max(0, Number(parsed?.nativeTranscription?.progress || 0))),
      sourceSizeBytes: Math.max(0, Number(parsed?.nativeTranscription?.sourceSizeBytes || 0)),
      sourceOrigin: ["upload", "browser_recording"].includes(String(parsed?.nativeTranscription?.sourceOrigin || ""))
        ? parsed?.nativeTranscription?.sourceOrigin || ""
        : "",
      durationSeconds: Math.max(0, Number(parsed?.nativeTranscription?.durationSeconds || 0)),
      lineCount: Math.max(0, Number(parsed?.nativeTranscription?.lineCount || 0)),
      speakerCount: Math.max(0, Number(parsed?.nativeTranscription?.speakerCount || 0)),
      speakers: Array.isArray(parsed?.nativeTranscription?.speakers)
        ? parsed.nativeTranscription.speakers
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              id: asText(item.id, 80),
              label: asText(item.label, 80),
              name: asText(item.name || item.label, 160),
              segmentCount: Math.max(0, Number(item.segmentCount || 0)),
            }))
            .filter((item) => Boolean(item.id))
            .slice(0, 100)
        : [],
      mode: parsed?.nativeTranscription?.mode === "replace" ? "replace" : "append",
      keepSourceFile: Boolean(parsed?.nativeTranscription?.keepSourceFile),
      sourceStored: Boolean(parsed?.nativeTranscription?.sourceStored),
      estimatedAudioSeconds: Math.max(0, Number(parsed?.nativeTranscription?.estimatedAudioSeconds || 0)),
      actualAudioSeconds: Math.max(0, Number(parsed?.nativeTranscription?.actualAudioSeconds || 0)),
      estimatedCostHuf: Math.max(0, Number(parsed?.nativeTranscription?.estimatedCostHuf || 0)),
      actualInputTokens: Math.max(0, Number(parsed?.nativeTranscription?.actualInputTokens || 0)),
      actualOutputTokens: Math.max(0, Number(parsed?.nativeTranscription?.actualOutputTokens || 0)),
      actualCostUsd: Math.max(0, Number(parsed?.nativeTranscription?.actualCostUsd || 0)),
      actualCostHuf: Math.max(0, Number(parsed?.nativeTranscription?.actualCostHuf || 0)),
      lastError: asText(parsed?.nativeTranscription?.lastError, 4000),
    },
    teamsTranscript: {
      ...defaults.teamsTranscript,
      ...(parsed?.teamsTranscript || {}),
      transcriptIds: Array.isArray(parsed?.teamsTranscript?.transcriptIds)
        ? uniqueTextList(parsed.teamsTranscript.transcriptIds, 200)
        : [],
      autoWatchEnabled: Boolean(parsed?.teamsTranscript?.autoWatchEnabled),
      manualImportCount: Math.max(0, Number(parsed?.teamsTranscript?.manualImportCount || 0)),
      lastImportFileName: asText(parsed?.teamsTranscript?.lastImportFileName, 240),
      lastImportSource: ["graph", "vtt", "docx", "txt", "paste"].includes(String(parsed?.teamsTranscript?.lastImportSource || ""))
        ? parsed?.teamsTranscript?.lastImportSource || ""
        : "",
    },
    teamsAttendance: {
      ...defaults.teamsAttendance,
      ...(parsed?.teamsAttendance || {}),
      graphCalendarEventId: asText(parsed?.teamsAttendance?.graphCalendarEventId, 500),
      status: ["not_configured", "ready", "syncing", "available", "not_found", "permission_required", "error"].includes(String(parsed?.teamsAttendance?.status || ""))
        ? parsed?.teamsAttendance?.status || "not_configured"
        : "not_configured",
      lastError: asText(parsed?.teamsAttendance?.lastError, 2000),
      attendanceReportId: asText(parsed?.teamsAttendance?.attendanceReportId, 500),
      importedInviteCount: Math.max(0, Number(parsed?.teamsAttendance?.importedInviteCount || 0)),
      importedAttendanceCount: Math.max(0, Number(parsed?.teamsAttendance?.importedAttendanceCount || 0)),
    },
    presentation: {
      ...defaults.presentation,
      ...(parsed?.presentation || {}),
      enabled: Boolean(parsed?.presentation?.enabled),
      mode: ALLOWED_PRESENTATION_MODES.includes(parsed?.presentation?.mode as MeetingPresentationMode) ? parsed?.presentation?.mode as MeetingPresentationMode : defaults.presentation.mode,
      activeSectionId: asText(parsed?.presentation?.activeSectionId || defaults.presentation.activeSectionId, 180),
      activeAgendaItemId: asText(parsed?.presentation?.activeAgendaItemId, 180),
      activeAttachmentId: asText(parsed?.presentation?.activeAttachmentId, 180),
      documentAnchor: asText(parsed?.presentation?.documentAnchor, 180),
      scrollTop: Math.max(0, Number(parsed?.presentation?.scrollTop || 0)),
      controllerName: asText(parsed?.presentation?.controllerName || defaults.presentation.controllerName, 160),
      controllerRole: ["organizer", "editor", "participant"].includes(String(parsed?.presentation?.controllerRole)) ? parsed?.presentation?.controllerRole || "organizer" : "organizer",
      controllerGrantId: asText(parsed?.presentation?.controllerGrantId, 200),
      controllerLastSeenAt: String(parsed?.presentation?.controllerLastSeenAt || defaults.presentation.controllerLastSeenAt),
      sequence: Math.max(0, Number(parsed?.presentation?.sequence || 0)),
      updatedAt: String(parsed?.presentation?.updatedAt || defaults.presentation.updatedAt),
    },
    presentationControl: {
      ...defaults.presentationControl,
      ...(parsed?.presentationControl || {}),
      status: ["inactive", "pending", "active", "revoked", "expired"].includes(String(parsed?.presentationControl?.status || "")) ? parsed?.presentationControl?.status || "inactive" : "inactive",
      grantId: asText(parsed?.presentationControl?.grantId, 200),
      controllerName: asText(parsed?.presentationControl?.controllerName, 160),
      controllerEmail: asText(parsed?.presentationControl?.controllerEmail, 240).toLowerCase(),
      controllerRole: ["organizer", "editor", "participant"].includes(String(parsed?.presentationControl?.controllerRole)) ? parsed?.presentationControl?.controllerRole || "participant" : "participant",
      issuedBy: asText(parsed?.presentationControl?.issuedBy, 160),
      issuedAt: String(parsed?.presentationControl?.issuedAt || ""),
      pairingExpiresAt: String(parsed?.presentationControl?.pairingExpiresAt || ""),
      activatedAt: String(parsed?.presentationControl?.activatedAt || ""),
      accessExpiresAt: String(parsed?.presentationControl?.accessExpiresAt || ""),
      revokedAt: String(parsed?.presentationControl?.revokedAt || ""),
      revokedBy: asText(parsed?.presentationControl?.revokedBy, 160),
    },
    sessionState: {
      ...defaults.sessionState,
      ...(parsed?.sessionState || {}),
      lastSafeCloseAt: String(parsed?.sessionState?.lastSafeCloseAt || ""),
      lastSafeClosedBy: asText(parsed?.sessionState?.lastSafeClosedBy, 160),
      autoTranscriptWatch: Boolean(parsed?.sessionState?.autoTranscriptWatch),
      lastSavedAt: String(parsed?.sessionState?.lastSavedAt || parsed?.updatedAt || defaults.sessionState.lastSavedAt),
    },
    agenda: normalizeAgenda(parsed?.agenda, defaults.agenda),
    attachments: Array.isArray(parsed?.attachments)
      ? parsed.attachments.map((item) => ({
          ...item,
          title: asText(item.title, 180) || undefined,
          description: asText(item.description || item.caption, 2000) || undefined,
          includeInAi: Boolean(item.includeInAi),
          sourceType: ["upload", "screen_capture", "pdf_crop", "image_edit"].includes(String(item.sourceType || ""))
            ? item.sourceType
            : "upload",
          parentAttachmentId: asText(item.parentAttachmentId, 180) || undefined,
          sourcePage: Number.isFinite(Number(item.sourcePage)) && Number(item.sourcePage) > 0
            ? Math.floor(Number(item.sourcePage))
            : undefined,
          editedBy: asText(item.editedBy, 160) || undefined,
          editedAt: asText(item.editedAt, 80) || undefined,
          editorVersion: asText(item.editorVersion, 60) || undefined,
          markupStoredName: asText(item.markupStoredName, 240) || undefined,
          agendaItemId: asText(item.agendaItemId, 180) || undefined,
          topicBlockId: asText(item.topicBlockId, 180) || undefined,
        }))
      : [],
    actionItems: Array.isArray(parsed?.actionItems)
      ? parsed.actionItems.map((item) => ({
          ...item,
          agendaItemId: asText(item.agendaItemId, 180),
          topicBlockId: asText(item.topicBlockId, 180),
        }))
      : [],
    aiResults: Array.isArray(parsed?.aiResults) ? parsed.aiResults : [],
    aiMinutesDraft: String(parsed?.aiMinutesDraft || "").slice(0, 80000),
    publishedSummaries,
    activePublishedSummaryId,
    feedback: normalizeFeedback(parsed?.feedback),
    emailLog: Array.isArray(parsed?.emailLog) ? parsed.emailLog.slice(-500) : [],
    editorAccess: {
      ...defaults.editorAccess,
      ...(parsed?.editorAccess || {}),
      status: ["inactive", "pending", "active", "revoked", "expired"].includes(String(parsed?.editorAccess?.status || ""))
        ? parsed?.editorAccess?.status || "inactive"
        : "inactive",
      grantId: asText(parsed?.editorAccess?.grantId, 200),
      editorName: asText(parsed?.editorAccess?.editorName, 160),
      editorEmail: asText(parsed?.editorAccess?.editorEmail, 240).toLowerCase(),
      issuedBy: asText(parsed?.editorAccess?.issuedBy, 160),
      issuedAt: String(parsed?.editorAccess?.issuedAt || ""),
      pairingExpiresAt: String(parsed?.editorAccess?.pairingExpiresAt || ""),
      activatedAt: String(parsed?.editorAccess?.activatedAt || ""),
      accessExpiresAt: String(parsed?.editorAccess?.accessExpiresAt || ""),
      revokedAt: String(parsed?.editorAccess?.revokedAt || ""),
      revokedBy: asText(parsed?.editorAccess?.revokedBy, 160),
    },
    auditLog: Array.isArray(parsed?.auditLog)
      ? parsed.auditLog
          .filter((item) => item && typeof item === "object")
          .map((item, index) => {
            const event = item as MeetingWorkspace["auditLog"][number];
            return {
              id: asText(event.id || `audit-${index + 1}`, 180),
              type: asText(event.type || "meeting_event", 120),
              at: String(event.at || new Date().toISOString()),
              actorName: asText(event.actorName || "Rendszer", 160),
              actorRole: ["organizer", "editor", "participant", "system"].includes(String(event.actorRole)) ? event.actorRole : "system",
              message: asText(event.message, 1000),
              operation: asText(event.operation, 120),
            };
          })
          .slice(-1000)
      : [],
  };
}

export async function readMeetingWorkspace(meetingId: string): Promise<MeetingWorkspace> {
  const safeId = sanitizeMeetingId(meetingId);
  const file = workspaceFile(safeId);
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<MeetingWorkspace>;
    return normalizeWorkspace(safeId, parsed);
  } catch {
    const created = createDefaultMeetingWorkspace(safeId);
    await atomicWriteJson(file, created);
    return created;
  }
}


export async function readMeetingWorkspaceIfExists(meetingId: string): Promise<MeetingWorkspace | null> {
  const safeId = sanitizeMeetingId(meetingId);
  try {
    const parsed = JSON.parse(await readFile(workspaceFile(safeId), "utf8")) as Partial<MeetingWorkspace>;
    return normalizeWorkspace(safeId, parsed);
  } catch {
    return null;
  }
}

async function removePairingRecordsForMeeting(meetingId: string) {
  const safeId = sanitizeMeetingId(meetingId);
  const roots = ["editor-pairings", "presentation-pairings", "pairings"].map((name) => path.join(MEETING_DATA_ROOT, name));
  let removed = 0;
  for (const root of roots) {
    let entries: import("node:fs").Dirent[] = [];
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const file = path.join(root, entry.name);
      if (entry.name === `${safeId}.json`) {
        await rm(file, { force: true });
        removed += 1;
        continue;
      }
      try {
        const parsed = JSON.parse(await readFile(file, "utf8")) as { meetingId?: string; sourceMeetingId?: string };
        if ([parsed.meetingId, parsed.sourceMeetingId].some((value) => sanitizeMeetingId(value) === safeId)) {
          await rm(file, { force: true });
          removed += 1;
        }
      } catch {
        // Hibás vagy más célú rekordot nem törlünk.
      }
    }
  }
  return removed;
}

export async function deleteMeetingWorkspace(meetingId: string, actorName = "Szervező") {
  const safeId = sanitizeMeetingId(meetingId);
  if (["meeting-assistant-home", "demo-meeting"].includes(safeId)) throw new Error("A rendszer munkaterülete nem törölhető.");
  const existing = await readMeetingWorkspaceIfExists(safeId);
  if (!existing) throw new Error("Az értekezlet nem található vagy már törölték.");
  await rm(workspaceFile(safeId), { force: true });
  await rm(getMeetingUploadDir(safeId), { recursive: true, force: true });
  await rm(snapshotDir(safeId), { recursive: true, force: true });
  await rm(path.join(NATIVE_TRANSCRIPTION_ROOT, safeId), { recursive: true, force: true });
  const pairingRecords = await removePairingRecordsForMeeting(safeId);
  await mkdir(MEETING_DATA_ROOT, { recursive: true });
  await appendFile(path.join(MEETING_DATA_ROOT, "deletion-audit.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), type: "meeting_deleted", meetingId: safeId, title: existing.title, projectId: existing.projectId, actorName })}
`, "utf8");
  return { meetingId: safeId, title: existing.title, projectId: existing.projectId, pairingRecords };
}

export async function deleteProjectMeetingWorkspaces(projectId: string, actorName = "Szervező") {
  const workspaces = await listMeetingWorkspaces();
  const targets = workspaces.filter((workspace) => workspace.projectId === projectId && !["meeting-assistant-home", "demo-meeting"].includes(workspace.meetingId));
  const deleted = [] as Awaited<ReturnType<typeof deleteMeetingWorkspace>>[];
  for (const workspace of targets) deleted.push(await deleteMeetingWorkspace(workspace.meetingId, actorName));
  return deleted;
}

export async function writeMeetingWorkspace(workspace: MeetingWorkspace) {
  const savedAt = new Date().toISOString();
  const next: MeetingWorkspace = normalizeWorkspace(workspace.meetingId, {
    ...workspace,
    updatedAt: savedAt,
    sessionState: { ...workspace.sessionState, lastSavedAt: savedAt },
  });
  await atomicWriteJson(workspaceFile(next.meetingId), next);
  return next;
}

export async function updateMeetingWorkspace(
  meetingId: string,
  updater: (current: MeetingWorkspace) => MeetingWorkspace | Promise<MeetingWorkspace>,
) {
  const current = await readMeetingWorkspace(meetingId);
  const next = await updater(current);
  return writeMeetingWorkspace(next);
}

export async function writeMeetingSnapshot(workspace: MeetingWorkspace) {
  const nextVersion = Math.max(1, Number(workspace.closure.snapshotVersion || 0));
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const file = path.join(snapshotDir(workspace.meetingId), `v${String(nextVersion).padStart(3, "0")}-${safeStamp}.json`);
  await atomicWriteJson(file, {
    snapshotVersion: nextVersion,
    createdAt,
    meetingId: workspace.meetingId,
    status: workspace.status,
    closureMode: workspace.closure.mode,
    workspace,
  });
  return file;
}

function archiveItem(workspace: MeetingWorkspace): MeetingArchiveItem {
  const openTaskCount = workspace.actionItems.filter((item) => item.type === "task" || item.type === "deadline").length;
  const decisionCount = workspace.actionItems.filter((item) => item.type === "decision").length;
  const activeSummary = workspace.publishedSummaries.find((item) => item.id === workspace.activePublishedSummaryId);
  const searchText = [
    workspace.meetingId,
    workspace.title,
    workspace.meetingMode,
    workspace.projectId,
    workspace.projectCode,
    workspace.projectName,
    workspace.meetingLocation,
    workspace.meetingType,
    workspace.meetingTypeCode,
    workspace.documentLabel,
    workspace.minuteNumber,
    workspace.documentId,
    workspace.previousMeetingId,
    workspace.nextMeetingAt,
    workspace.chairpersonName,
    workspace.minuteTakerName,
    workspace.approverName,
    workspace.organizerName,
    ...workspace.participants,
    ...workspace.attendees.flatMap((item) => [item.name, item.organization, item.functionTitle, item.email, item.phone, item.status, item.participationMode]),
    workspace.sharedNote,
    workspace.privateNotes,
    ...workspace.agenda.flatMap((item) => [
      item.title,
      item.description,
      item.discussionNotes,
      item.decisionSummary,
      item.openQuestions,
      item.privateNotes,
      item.updatedBy,
      ...item.topicBlocks.flatMap((topic) => [
        topic.title,
        topic.background,
        topic.discussion,
        topic.decision,
        topic.openQuestions,
        topic.clientOpinion,
        topic.designerOpinion,
        topic.contractorOpinion,
        topic.owner,
        topic.dueDate,
      ]),
    ]),
    ...workspace.actionItems.flatMap((item) => [item.title, item.detail, item.owner, item.dueDate]),
    ...workspace.attachments.flatMap((item) => [item.originalName, item.caption, item.uploadedBy]),
    ...workspace.transcript.flatMap((item) => [item.speaker, item.text]),
    ...workspace.publishedSummaries.flatMap((item) => [item.title, item.body, item.closingMessage, item.emailNotice]),
    ...workspace.feedback.flatMap((item) => [item.participantName, item.participantEmail, item.comment, item.quote]),
    ...workspace.emailLog.flatMap((item) => [item.subject, ...item.recipients]),
  ].join(" ").toLocaleLowerCase("hu-HU");

  return {
    meetingId: workspace.meetingId,
    title: workspace.title,
    meetingMode: workspace.meetingMode,
    projectId: workspace.projectId,
    projectCode: workspace.projectCode,
    projectName: workspace.projectName,
    meetingType: workspace.meetingType,
    meetingTypeCode: workspace.meetingTypeCode,
    documentKind: workspace.documentKind,
    documentLabel: workspace.documentLabel,
    meetingLocation: workspace.meetingLocation,
    minuteNumber: workspace.minuteNumber,
    documentId: workspace.documentId,
    previousMeetingId: workspace.previousMeetingId,
    nextMeetingAt: workspace.nextMeeting.startsAt || workspace.nextMeetingAt,
    chairpersonName: workspace.chairpersonName,
    minuteTakerName: workspace.minuteTakerName,
    approverName: workspace.approverName,
    organizerName: workspace.organizerName,
    participants: workspace.participants,
    status: workspace.status,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    scheduledStart: workspace.scheduledStart,
    scheduledEnd: workspace.scheduledEnd,
    endedAt: workspace.endedAt,
    closedAt: workspace.closure.closedAt,
    closureMode: workspace.closure.mode,
    snapshotVersion: workspace.closure.snapshotVersion,
    attachmentCount: workspace.attachments.length,
    actionCount: workspace.actionItems.length,
    openTaskCount,
    decisionCount,
    transcriptCount: workspace.transcript.length,
    feedbackCount: workspace.feedback.length,
    publishedSummaryVersion: activeSummary?.version || 0,
    searchText,
  };
}

export async function listMeetingWorkspaces(): Promise<MeetingWorkspace[]> {
  await mkdir(WORKSPACE_ROOT, { recursive: true });
  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
  const rows = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const meetingId = entry.name.replace(/\.json$/i, "");
      try { return await readMeetingWorkspace(meetingId); } catch { return null; }
    }));
  return rows.filter((row): row is MeetingWorkspace => Boolean(row));
}

export async function listMeetingArchive(): Promise<MeetingArchiveItem[]> {
  await mkdir(WORKSPACE_ROOT, { recursive: true });
  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
  const rows = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const meetingId = entry.name.replace(/\.json$/i, "");
      try {
        return archiveItem(await readMeetingWorkspace(meetingId));
      } catch {
        return null;
      }
    }));
  return rows
    .filter((row): row is MeetingArchiveItem => Boolean(row))
    .sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt));
}

export async function appendMeetingAttachments(meetingId: string, attachments: MeetingAttachment[]) {
  return updateMeetingWorkspace(meetingId, (current) => ({
    ...current,
    attachments: [...current.attachments, ...attachments],
  }));
}

export async function findMeetingAttachment(meetingId: string, fileId: string) {
  const workspace = await readMeetingWorkspace(meetingId);
  return workspace.attachments.find((item) => item.id === fileId) ?? null;
}
