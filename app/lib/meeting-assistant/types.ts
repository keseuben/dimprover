export type MeetingViewRole = "organizer" | "editor" | "participant";
export type MeetingMode = "teams" | "in_person";
export type AttachmentStatus = "pending" | "approved" | "shared" | "rejected";
export type ActionItemType = "task" | "decision" | "question" | "deadline";
export type MeetingStatus = "active" | "draft_closed" | "pending_approval" | "published" | "archived";
export type MeetingClosureMode = "draft" | "approval" | "publish";
export type AttendanceStatus = "present" | "late" | "left_early" | "invited_absent";
export type ParticipationMode = "online" | "in_person";
export type MeetingAttendanceSource = "manual" | "project" | "teams_invite" | "teams_attendance";
export type MeetingPresentationMode = "follow" | "document" | "fixed";
export type MeetingPresentationControlStatus = "inactive" | "pending" | "active" | "revoked" | "expired";
export type MeetingAgendaTemplateKey =
  | "general"
  | "quick_general"
  | "weekly_coordination"
  | "design_coordination"
  | "technical_inspection"
  | "defect_review"
  | "handover";
export type MeetingSummarySource = "rules" | "ai";
export type MeetingEmailDocumentType = "reminder" | "draft_minutes" | "final_minutes" | "custom";
export type MeetingDocumentKind = "reminder" | "minutes" | "meeting_note";
export type MeetingEmailDeliveryMode = "automatic" | "organizer";
export type MeetingFeedbackType = "acknowledged" | "comment" | "disagree" | "addition" | "partial_attendance" | "rating";
export type MeetingFeedbackStatus = "pending" | "accepted" | "rejected";
export type MeetingSharedMessageStatus = "pending" | "shared" | "rejected";
export type NextMeetingStatus = "not_defined" | "planned" | "under_coordination" | "confirmed";


export type MeetingEditorAccessStatus = "inactive" | "pending" | "active" | "revoked" | "expired";

export type MeetingEditorAccess = {
  status: MeetingEditorAccessStatus;
  grantId: string;
  editorName: string;
  editorEmail: string;
  issuedBy: string;
  issuedAt: string;
  pairingExpiresAt: string;
  activatedAt: string;
  accessExpiresAt: string;
  revokedAt: string;
  revokedBy: string;
};

export type MeetingAuditEvent = {
  id: string;
  type: string;
  at: string;
  actorName: string;
  actorRole: MeetingViewRole | "system";
  message: string;
  operation: string;
};

export type TeamsTranscriptSyncStatus =
  | "not_configured"
  | "ready"
  | "syncing"
  | "available"
  | "not_found"
  | "permission_required"
  | "error";

export type TeamsTranscriptIntegration = {
  graphOnlineMeetingId: string;
  organizerUserId: string;
  status: TeamsTranscriptSyncStatus;
  lastSyncAt: string;
  lastError: string;
  transcriptIds: string[];
  importedLineCount: number;
  speakerAttribution: boolean;
  autoWatchEnabled: boolean;
  manualImportCount: number;
  lastImportFileName: string;
  lastImportSource: "" | "graph" | "vtt" | "docx" | "txt" | "paste";
};

export type MeetingTranscriptLine = {
  id: string;
  at: string;
  speaker: string;
  text: string;
  shared: boolean;
  source?: "manual" | "graph" | "vtt" | "docx" | "txt" | "paste" | "dimpro_audio";
  startSeconds?: number;
  endSeconds?: number;
  speakerId?: string;
  transcriptionJobId?: string;
};

export type MeetingNativeTranscriptionStatus =
  | "idle"
  | "uploading"
  | "queued"
  | "converting"
  | "transcribing"
  | "completed"
  | "error"
  | "cancelled";

export type MeetingNativeSpeaker = {
  id: string;
  label: string;
  name: string;
  segmentCount: number;
};

export type MeetingNativeTranscription = {
  jobId: string;
  status: MeetingNativeTranscriptionStatus;
  progress: number;
  stageLabel: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceSizeBytes: number;
  sourceOrigin: "" | "upload" | "browser_recording";
  language: string;
  model: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  lineCount: number;
  speakerCount: number;
  speakers: MeetingNativeSpeaker[];
  mode: "append" | "replace";
  keepSourceFile: boolean;
  sourceStored: boolean;
  estimatedAudioSeconds: number;
  actualAudioSeconds: number;
  estimatedCostHuf: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualCostUsd: number;
  actualCostHuf: number;
  lastError: string;
};

export type MeetingAttachment = {
  id: string;
  meetingId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
  isZip: boolean;
  uploadedAt: string;
  uploadedBy: string;
  status: AttachmentStatus;
  caption: string;
  title?: string;
  description?: string;
  includeInAi?: boolean;
  sourceType?: "upload" | "screen_capture" | "pdf_crop" | "image_edit";
  parentAttachmentId?: string;
  sourcePage?: number;
  editedBy?: string;
  editedAt?: string;
  editorVersion?: string;
  markupStoredName?: string;
  agendaItemId?: string;
  topicBlockId?: string;
};

export type MeetingAttendanceInterval = {
  joinDateTime: string;
  leaveDateTime: string;
  durationSeconds: number;
};

export type MeetingAttendee = {
  id: string;
  projectMemberId: string;
  name: string;
  organization: string;
  functionTitle: string;
  email: string;
  phone: string;
  status: AttendanceStatus;
  participationMode: ParticipationMode;
  arrivalTime: string;
  departureTime: string;
  external: boolean;
  source?: MeetingAttendanceSource;
  teamsUserId?: string;
  teamsRole?: string;
  responseStatus?: string;
  totalAttendanceSeconds?: number;
  attendanceIntervals?: MeetingAttendanceInterval[];
  createdAt: string;
  updatedAt: string;
};

export type MeetingTopicBlock = {
  id: string;
  order: number;
  title: string;
  background: string;
  discussion: string;
  decision: string;
  openQuestions: string;
  clientOpinion: string;
  designerOpinion: string;
  contractorOpinion: string;
  owner: string;
  dueDate: string;
  attachmentIds: string[];
  privateNotes: string;
  shared: boolean;
  previousMeetingId: string;
  previousAgendaItemId: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type MeetingAgendaItem = {
  id: string;
  order: number;
  title: string;
  description: string;
  discussionNotes: string;
  decisionSummary: string;
  openQuestions: string;
  privateNotes: string;
  completed: boolean;
  shared: boolean;
  isJoker: boolean;
  topicBlocks: MeetingTopicBlock[];
  updatedAt: string;
  updatedBy: string;
};

export type MeetingActionItem = {
  id: string;
  agendaItemId: string;
  topicBlockId: string;
  type: ActionItemType;
  title: string;
  detail: string;
  owner: string;
  dueDate: string;
  shared: boolean;
  createdAt: string;
};

export type MeetingAiResult = {
  id: string;
  action: string;
  label: string;
  text: string;
  provider?: string;
  modelTier?: "fast" | "balanced" | "premium" | "audit";
  model: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  estimatedCostHuf: number;
  approvedMaxCostHuf?: number;
  actualCostHuf: number;
  durationMs?: number;
  status?: "success" | "error";
  createdAt: string;
};

export type MeetingPublishedSummary = {
  id: string;
  version: number;
  source: MeetingSummarySource;
  title: string;
  body: string;
  closingTitle: string;
  closingMessage: string;
  emailNotice: string;
  emailDocumentType: MeetingEmailDocumentType;
  emailDeliveryMode: MeetingEmailDeliveryMode;
  reviewDeadline: string;
  nextMeetingAt: string;
  nextMeetingLocation: string;
  createdAt: string;
  createdBy: string;
  publishedAt: string;
  revokedAt: string;
};

export type MeetingFeedback = {
  id: string;
  participantName: string;
  participantEmail: string;
  type: MeetingFeedbackType;
  agendaItemId: string;
  topicBlockId: string;
  quote: string;
  comment: string;
  ratingUseful: number;
  ratingPrepared: number;
  ratingClarity: number;
  anonymous: boolean;
  status: MeetingFeedbackStatus;
  relatedSummaryVersion: number;
  createdAt: string;
  reviewedAt: string;
  reviewedBy: string;
};


export type MeetingSharedMessage = {
  id: string;
  text: string;
  submittedBy: string;
  submittedEmail?: string;
  agendaItemId?: string;
  includeInDocument?: boolean;
  submittedAt: string;
  status: MeetingSharedMessageStatus;
  reviewedBy: string;
  reviewedAt: string;
};


export type TeamsAttendanceSyncStatus =
  | "not_configured"
  | "ready"
  | "syncing"
  | "available"
  | "not_found"
  | "permission_required"
  | "error";

export type TeamsAttendanceIntegration = {
  graphCalendarEventId: string;
  status: TeamsAttendanceSyncStatus;
  lastInviteSyncAt: string;
  lastAttendanceSyncAt: string;
  lastError: string;
  attendanceReportId: string;
  importedInviteCount: number;
  importedAttendanceCount: number;
};

export type MeetingPresentationControl = {
  status: MeetingPresentationControlStatus;
  grantId: string;
  controllerName: string;
  controllerEmail: string;
  controllerRole: MeetingViewRole;
  issuedBy: string;
  issuedAt: string;
  pairingExpiresAt: string;
  activatedAt: string;
  accessExpiresAt: string;
  revokedAt: string;
  revokedBy: string;
};

export type MeetingPresentationState = {
  enabled: boolean;
  mode: MeetingPresentationMode;
  activeSectionId: string;
  activeAgendaItemId: string;
  activeAttachmentId: string;
  documentAnchor: string;
  scrollTop: number;
  controllerName: string;
  controllerRole: MeetingViewRole;
  controllerGrantId: string;
  controllerLastSeenAt: string;
  sequence: number;
  updatedAt: string;
};

export type MeetingSessionState = {
  lastSafeCloseAt: string;
  lastSafeClosedBy: string;
  autoTranscriptWatch: boolean;
  lastSavedAt: string;
};

export type MeetingNextMeeting = {
  status: NextMeetingStatus;
  startsAt: string;
  endsAt: string;
  location: string;
  note: string;
};

export type MeetingParticipantPermissions = {
  acknowledgementsEnabled: boolean;
  commentsEnabled: boolean;
  ratingsEnabled: boolean;
  reviewDeadline: string;
};

export type MeetingEmailLog = {
  id: string;
  sentAt: string;
  sentBy: string;
  recipients: string[];
  subject: string;
  summaryVersion: number;
  attachments: string[];
  messageId: string;
  status: "sent" | "error";
  error: string;
};

export type MeetingClosure = {
  mode: MeetingClosureMode | "";
  closedAt: string;
  closedBy: string;
  note: string;
  snapshotVersion: number;
  lastPublishedAt: string;
  closingTitle: string;
  closingMessage: string;
  emailNotice: string;
  emailDocumentType: MeetingEmailDocumentType;
  emailDeliveryMode: MeetingEmailDeliveryMode;
  reviewDeadline: string;
};

export type MeetingProjectMember = {
  id: string;
  name: string;
  organization: string;
  functionTitle: string;
  email: string;
  phone: string;
  external: boolean;
  active: boolean;
  defaultInvite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MeetingProjectProfile = {
  projectId: string;
  code: string;
  name: string;
  location: string;
  clientName: string;
  projectManager: string;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  defaultMeetingType: string;
  members: MeetingProjectMember[];
  createdAt: string;
  updatedAt: string;
};

export type MeetingWorkspace = {
  version: 8;
  meetingId: string;
  meetingMode: MeetingMode;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  meetingLocation: string;
  meetingType: string;
  meetingTypeCode: string;
  documentKind: MeetingDocumentKind;
  documentLabel: string;
  minuteNumber: string;
  minuteSequence: number;
  documentId: string;
  previousMeetingId: string;
  nextMeetingAt: string;
  chairpersonName: string;
  minuteTakerName: string;
  approverName: string;
  createdAt: string;
  updatedAt: string;
  scheduledStart: string;
  scheduledEnd: string;
  endedAt: string;
  organizerName: string;
  participants: string[];
  attendees: MeetingAttendee[];
  teamsAttendance: TeamsAttendanceIntegration;
  status: MeetingStatus;
  closure: MeetingClosure;
  nextMeeting: MeetingNextMeeting;
  participantPermissions: MeetingParticipantPermissions;
  agendaTemplateKey: MeetingAgendaTemplateKey;
  currentAgendaItemId: string;
  privateNotes: string;
  sharedNote: string;
  sharedMessages: MeetingSharedMessage[];
  presentation: MeetingPresentationState;
  presentationControl: MeetingPresentationControl;
  sessionState: MeetingSessionState;
  transcript: MeetingTranscriptLine[];
  nativeTranscription: MeetingNativeTranscription;
  teamsTranscript: TeamsTranscriptIntegration;
  agenda: MeetingAgendaItem[];
  attachments: MeetingAttachment[];
  actionItems: MeetingActionItem[];
  aiResults: MeetingAiResult[];
  aiMinutesDraft: string;
  publishedSummaries: MeetingPublishedSummary[];
  activePublishedSummaryId: string;
  feedback: MeetingFeedback[];
  emailLog: MeetingEmailLog[];
  editorAccess: MeetingEditorAccess;
  auditLog: MeetingAuditEvent[];
  settings: {
    maxFileSizeBytes: number;
    allowedExtensions: string[];
    participantUploadsEnabled: boolean;
    requireOrganizerApproval: boolean;
    zipUploadEnabled: boolean;
  };
};

export type MeetingArchiveItem = {
  meetingId: string;
  title: string;
  meetingMode: MeetingMode;
  projectId: string;
  projectCode: string;
  projectName: string;
  meetingType: string;
  meetingTypeCode: string;
  documentKind: MeetingDocumentKind;
  documentLabel: string;
  meetingLocation: string;
  minuteNumber: string;
  documentId: string;
  previousMeetingId: string;
  nextMeetingAt: string;
  chairpersonName: string;
  minuteTakerName: string;
  approverName: string;
  organizerName: string;
  participants: string[];
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
  scheduledStart: string;
  scheduledEnd: string;
  endedAt: string;
  closedAt: string;
  closureMode: MeetingClosureMode | "";
  snapshotVersion: number;
  attachmentCount: number;
  actionCount: number;
  openTaskCount: number;
  decisionCount: number;
  transcriptCount: number;
  feedbackCount: number;
  publishedSummaryVersion: number;
  searchText: string;
};

export const DEFAULT_ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "txt",
  "zip",
];

export const DEFAULT_MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;

export function createEmptyTopicBlock(title = "Új témakör", updatedBy = "Rendszer"): MeetingTopicBlock {
  const now = new Date().toISOString();
  return {
    id: `topic-${Math.random().toString(36).slice(2, 10)}`,
    order: 1,
    title,
    background: "",
    discussion: "",
    decision: "",
    openQuestions: "",
    clientOpinion: "",
    designerOpinion: "",
    contractorOpinion: "",
    owner: "",
    dueDate: "",
    attachmentIds: [],
    privateNotes: "",
    shared: true,
    previousMeetingId: "",
    previousAgendaItemId: "",
    createdAt: now,
    updatedAt: now,
    updatedBy,
  };
}

export function createDefaultMeetingWorkspace(meetingId: string): MeetingWorkspace {
  const now = new Date().toISOString();
  const agendaSeed = [
    ["attendance", "Jelenlévők"],
    ["previous", "Előzmények / előző értekezlet"],
    ["open-tasks", "Nyitott feladatok"],
    ["design", "Tervkérdések"],
    ["deadlines", "Határidők és felelősök"],
    ["next", "Következő lépések"],
    ["joker", "Egyéb felmerülő témák / Joker pont"],
  ] as const;
  const agenda: MeetingAgendaItem[] = agendaSeed.map(([id, title], index) => ({
    id,
    order: index + 1,
    title,
    description: `${title} témakör rövid előkészítése és céljának rögzítése.`,
    discussionNotes: "Az egyeztetés során az alábbiak kerültek megtárgyalásra:\n",
    decisionSummary: "Döntés / megállapodás:\n",
    openQuestions: "Nyitott kérdések:\n",
    privateNotes: "",
    completed: false,
    shared: true,
    isJoker: id === "joker",
    topicBlocks: [],
    updatedAt: now,
    updatedBy: "Rendszer",
  }));

  return {
    version: 8,
    meetingId,
    meetingMode: "teams",
    title: "DIMPRO értekezlet",
    projectId: "",
    projectCode: "",
    projectName: "Nincs projekthez kapcsolva",
    meetingLocation: "",
    meetingType: "Általános egyeztetés",
    meetingTypeCode: "ÁLT",
    documentKind: "reminder",
    documentLabel: "Egyeztetési emlékeztető",
    minuteNumber: "",
    minuteSequence: 0,
    documentId: "",
    previousMeetingId: "",
    nextMeetingAt: "",
    chairpersonName: "",
    minuteTakerName: "Szervező",
    approverName: "",
    createdAt: now,
    updatedAt: now,
    scheduledStart: "",
    scheduledEnd: "",
    endedAt: "",
    organizerName: "Szervező",
    participants: [],
    attendees: [],
    teamsAttendance: {
      graphCalendarEventId: "",
      status: "not_configured",
      lastInviteSyncAt: "",
      lastAttendanceSyncAt: "",
      lastError: "",
      attendanceReportId: "",
      importedInviteCount: 0,
      importedAttendanceCount: 0,
    },
    status: "active",
    closure: {
      mode: "",
      closedAt: "",
      closedBy: "",
      note: "",
      snapshotVersion: 0,
      lastPublishedAt: "",
      closingTitle: "Köszönjük a részvételt!",
      closingMessage: "Köszönöm a közös munkát! A feladatokat és döntéseket az összefoglaló tartalmazza.",
      emailNotice: "Az értekezlet emlékeztetőjét vagy jegyzőkönyvét a feldolgozást és jóváhagyást követően hamarosan e-mailben is megküldjük a résztvevőknek.",
      emailDocumentType: "draft_minutes",
      emailDeliveryMode: "organizer",
      reviewDeadline: "",
    },
    nextMeeting: {
      status: "not_defined",
      startsAt: "",
      endsAt: "",
      location: "",
      note: "",
    },
    participantPermissions: {
      acknowledgementsEnabled: true,
      commentsEnabled: true,
      ratingsEnabled: true,
      reviewDeadline: "",
    },
    agendaTemplateKey: "general",
    currentAgendaItemId: agenda[0].id,
    privateNotes: "",
    sharedNote: "",
    sharedMessages: [],
    presentation: {
      enabled: false,
      mode: "fixed",
      activeSectionId: "meeting-live-minutes",
      activeAgendaItemId: agenda[0].id,
      activeAttachmentId: "",
      documentAnchor: "",
      scrollTop: 0,
      controllerName: "Szervező",
      controllerRole: "organizer",
      controllerGrantId: "",
      controllerLastSeenAt: now,
      sequence: 0,
      updatedAt: now,
    },
    presentationControl: {
      status: "inactive",
      grantId: "",
      controllerName: "",
      controllerEmail: "",
      controllerRole: "participant",
      issuedBy: "",
      issuedAt: "",
      pairingExpiresAt: "",
      activatedAt: "",
      accessExpiresAt: "",
      revokedAt: "",
      revokedBy: "",
    },
    sessionState: {
      lastSafeCloseAt: "",
      lastSafeClosedBy: "",
      autoTranscriptWatch: false,
      lastSavedAt: now,
    },
    transcript: [],
    nativeTranscription: {
      jobId: "",
      status: "idle",
      progress: 0,
      stageLabel: "Nincs aktív hangátírás",
      sourceFileName: "",
      sourceMimeType: "",
      sourceSizeBytes: 0,
      sourceOrigin: "",
      language: "hu",
      model: "gpt-4o-transcribe-diarize",
      createdAt: "",
      startedAt: "",
      completedAt: "",
      durationSeconds: 0,
      lineCount: 0,
      speakerCount: 0,
      speakers: [],
      mode: "append",
      keepSourceFile: false,
      sourceStored: false,
      estimatedAudioSeconds: 0,
      actualAudioSeconds: 0,
      estimatedCostHuf: 0,
      actualInputTokens: 0,
      actualOutputTokens: 0,
      actualCostUsd: 0,
      actualCostHuf: 0,
      lastError: "",
    },
    teamsTranscript: {
      graphOnlineMeetingId: "",
      organizerUserId: "",
      status: "not_configured",
      lastSyncAt: "",
      lastError: "",
      transcriptIds: [],
      importedLineCount: 0,
      speakerAttribution: true,
      autoWatchEnabled: false,
      manualImportCount: 0,
      lastImportFileName: "",
      lastImportSource: "",
    },
    agenda,
    attachments: [],
    actionItems: [],
    aiResults: [],
    aiMinutesDraft: "",
    publishedSummaries: [],
    activePublishedSummaryId: "",
    feedback: [],
    emailLog: [],
    editorAccess: {
      status: "inactive",
      grantId: "",
      editorName: "",
      editorEmail: "",
      issuedBy: "",
      issuedAt: "",
      pairingExpiresAt: "",
      activatedAt: "",
      accessExpiresAt: "",
      revokedAt: "",
      revokedBy: "",
    },
    auditLog: [],
    settings: {
      maxFileSizeBytes: Math.max(
        1,
        Number(process.env.MEETING_ASSISTANT_MAX_FILE_MB || 250),
      ) * 1024 * 1024,
      allowedExtensions: DEFAULT_ALLOWED_EXTENSIONS,
      participantUploadsEnabled: true,
      requireOrganizerApproval: true,
      zipUploadEnabled: true,
    },
  };
}
