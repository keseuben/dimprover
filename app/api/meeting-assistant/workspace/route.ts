import { randomUUID } from "node:crypto";
import { authorizeMeetingRequest, createMeetingAccessToken, meetingTokenAllowsOrganizer, meetingTokenIsEditor, verifyMeetingAccessToken } from "@/app/lib/meeting-assistant/access";
import { NextResponse } from "next/server";
import { createExportWorkspace } from "@/app/lib/meeting-assistant/export";
import { requireMeetingAssistantEntitlement } from "@/app/lib/meeting-assistant/entitlements";
import { renderLiveMinutesText } from "@/app/lib/meeting-assistant/live-minutes";
import { reserveProjectMeetingNumber } from "@/app/lib/meeting-assistant/numbering";
import { readMeetingProjectProfile } from "@/app/lib/meeting-assistant/project-store";
import { createAgendaContentDefaults, createAgendaFromTemplate, getMeetingAgendaTemplate } from "@/app/lib/meeting-assistant/templates";
import {
  readMeetingWorkspace,
  sanitizeMeetingId,
  updateMeetingWorkspace,
  writeMeetingSnapshot,
} from "@/app/lib/meeting-assistant/store";
import type {
  ActionItemType,
  AttachmentStatus,
  AttendanceStatus,
  MeetingAgendaTemplateKey,
  MeetingClosureMode,
  MeetingDocumentKind,
  MeetingMode,
  MeetingEmailDeliveryMode,
  MeetingEmailDocumentType,
  MeetingFeedbackStatus,
  MeetingFeedbackType,
  MeetingStatus,
  MeetingTranscriptLine,
  MeetingViewRole,
  ParticipationMode,
} from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type WorkspaceOperation =
  | "update_meta"
  | "reserve_meeting_number"
  | "update_notes"
  | "submit_shared_message"
  | "review_shared_message"
  | "update_shared_message"
  | "upsert_attendee"
  | "remove_attendee"
  | "import_project_members"
  | "toggle_agenda"
  | "set_current_agenda"
  | "apply_agenda_template"
  | "add_agenda_item"
  | "update_agenda_item"
  | "update_agenda_content"
  | "remove_agenda_item"
  | "move_agenda_item"
  | "toggle_agenda_shared"
  | "upsert_topic_block"
  | "remove_topic_block"
  | "move_topic_block"
  | "promote_topic_blocks"
  | "append_transcript"
  | "add_action_item"
  | "toggle_action_shared"
  | "set_attachment_status"
  | "update_attachment"
  | "update_next_meeting"
  | "update_participant_permissions"
  | "save_ai_minutes_draft"
  | "publish_summary"
  | "revoke_summary"
  | "submit_feedback"
  | "review_feedback"
  | "load_demo_transcript"
  | "close_meeting"
  | "reopen_meeting"
  | "archive_meeting"
  | "safe_close_session";

type WorkspaceRequest = {
  meetingId?: string;
  role?: MeetingViewRole;
  operation?: WorkspaceOperation;
  payload?: Record<string, unknown>;
  accessToken?: string;
};

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function roleAllowsOrganizerActions(role: MeetingViewRole | undefined) {
  return role === "organizer";
}

function roleAllowsContentEditing(role: MeetingViewRole | undefined) {
  return role === "organizer" || role === "editor";
}

const EDITOR_ALLOWED_OPERATIONS = new Set<WorkspaceOperation>([
  "update_notes",
  "review_shared_message",
  "update_shared_message",
  "toggle_agenda",
  "set_current_agenda",
  "add_agenda_item",
  "update_agenda_item",
  "update_agenda_content",
  "remove_agenda_item",
  "upsert_topic_block",
  "remove_topic_block",
  "promote_topic_blocks",
  "add_action_item",
  "update_attachment",
  "safe_close_session",
]);

function editorOperationAllowed(operation: WorkspaceOperation) {
  return EDITOR_ALLOWED_OPERATIONS.has(operation);
}

function editorTokenAuthorized(
  payload: { issuedTo?: string; grantId?: string } | null | undefined,
  workspace: Awaited<ReturnType<typeof readMeetingWorkspace>>,
) {
  if (!meetingTokenIsEditor(payload)) return false;
  if (workspace.editorAccess.status !== "active") return false;
  if (!workspace.editorAccess.grantId || workspace.editorAccess.grantId !== payload?.grantId) return false;
  if (!workspace.editorAccess.accessExpiresAt) return false;
  return new Date(workspace.editorAccess.accessExpiresAt).getTime() > Date.now();
}

function documentLabel(kind: MeetingDocumentKind) {
  if (kind === "minutes") return "Jegyzőkönyv";
  if (kind === "meeting_note") return "Egyeztetési feljegyzés";
  return "Egyeztetési emlékeztető";
}

function participantOperationAllowed(operation: WorkspaceOperation) {
  return operation === "submit_feedback" || operation === "update_attachment" || operation === "submit_shared_message";
}

export async function GET(request: Request) {
  try {
    await requireMeetingAssistantEntitlement();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A modul nem érhető el." }, { status: 403 });
  }
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const workspace = await readMeetingWorkspace(meetingId);
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  const editorAuthorized = auth.mode === "token" && editorTokenAuthorized(auth.payload, workspace);
  const accessRole: MeetingViewRole = organizerAuthorized ? "organizer" : editorAuthorized ? "editor" : "participant";
  return NextResponse.json({
    ok: true,
    workspace: accessRole === "organizer" ? workspace : createExportWorkspace(workspace, false),
    accessRole,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as WorkspaceRequest | null;
  if (!body?.operation) {
    return NextResponse.json({ ok: false, error: "Hiányzik a művelet." }, { status: 400 });
  }

  try {
    await requireMeetingAssistantEntitlement();
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A modul nem érhető el." }, { status: 403 });
  }

  const operation: WorkspaceOperation = body.operation;
  const meetingId = sanitizeMeetingId(body.meetingId);
  let auth = await authorizeMeetingRequest(request, meetingId, body.accessToken);
  let bootstrapAccessToken = "";
  if (!auth.ok && operation === "update_meta") {
    const homePayload = verifyMeetingAccessToken(body.accessToken, "meeting-assistant-home");
    if (homePayload && meetingTokenAllowsOrganizer(homePayload)) {
      auth = { ok: true as const, mode: "token" as const, payload: homePayload };
      bootstrapAccessToken = createMeetingAccessToken(meetingId, "dimpro-web-preview", {
        subjectName: String((body.payload || {}).chairpersonName || (body.payload || {}).organizerName || "Szervező").slice(0, 160),
      });
    }
  }
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const authorizationWorkspace = await readMeetingWorkspace(meetingId);
  const organizerAuthorized = Boolean(bootstrapAccessToken) || auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  const editorAuthorized = auth.mode === "token" && editorTokenAuthorized(auth.payload, authorizationWorkspace);
  const requestedRole: MeetingViewRole = body.role === "participant" ? "participant" : body.role === "editor" ? "editor" : "organizer";
  if (requestedRole === "organizer" && !organizerAuthorized) {
    return NextResponse.json(
      { ok: false, error: "A művelethez szervezői jogosultság szükséges." },
      { status: 403 },
    );
  }
  if (requestedRole === "editor" && !editorAuthorized) {
    return NextResponse.json(
      { ok: false, error: "A jegyzőkönyv-szerkesztői jogosultság lejárt vagy visszavonták." },
      { status: 403 },
    );
  }
  const role: MeetingViewRole = requestedRole === "organizer" && organizerAuthorized
    ? "organizer"
    : requestedRole === "editor" && editorAuthorized
      ? "editor"
      : "participant";
  if (role === "participant" && !participantOperationAllowed(operation)) {
    return NextResponse.json({ ok: false, error: "A művelethez szervezői vagy szerkesztői jogosultság szükséges." }, { status: 403 });
  }
  if (role === "editor" && !editorOperationAllowed(operation)) {
    return NextResponse.json({ ok: false, error: "Ezt a műveletet csak az értekezlet szervezője végezheti el." }, { status: 403 });
  }
  const payload = body.payload || {};

  try {
    let workspace = await updateMeetingWorkspace(meetingId, async (current) => {
      const locked = current.status === "published" || current.status === "archived";
      const allowedWhenLocked: WorkspaceOperation[] = ["reopen_meeting", "archive_meeting", "submit_feedback", "review_feedback", "safe_close_session"];
      if (locked && !allowedWhenLocked.includes(operation)) {
        throw new Error("A közzétett vagy archivált értekezlet csak újranyitás után módosítható.");
      }

      switch (operation) {
        case "update_meta": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező módosíthatja az értekezlet alapadatait.");
          const meetingModeValue = text(payload.meetingMode, 40) as MeetingMode;
          const meetingMode: MeetingMode = ["teams", "in_person"].includes(meetingModeValue) ? meetingModeValue : current.meetingMode;
          const kindValue = text(payload.documentKind, 40) as MeetingDocumentKind;
          const kind: MeetingDocumentKind = ["reminder", "minutes", "meeting_note"].includes(kindValue) ? kindValue : current.documentKind;
          const projectCode = text(payload.projectCode, 120);
          const typeCode = text(payload.meetingTypeCode, 40) || current.meetingTypeCode || "ÁLT";
          let minuteNumber = current.minuteNumber;
          let minuteSequence = current.minuteSequence;
          if (!minuteNumber && bool(payload.reserveNumber, true) && projectCode) {
            const reserved = await reserveProjectMeetingNumber({ projectCode, meetingTypeCode: typeCode });
            minuteNumber = reserved.minuteNumber;
            minuteSequence = reserved.sequence;
          }
          return {
            ...current,
            title: text(payload.title, 180) || current.title,
            meetingMode,
            projectId: text(payload.projectId, 180),
            projectCode,
            projectName: text(payload.projectName, 180) || current.projectName,
            meetingLocation: text(payload.meetingLocation, 240),
            meetingType: text(payload.meetingType, 160) || current.meetingType,
            meetingTypeCode: typeCode,
            documentKind: kind,
            documentLabel: documentLabel(kind),
            minuteNumber: text(payload.minuteNumber, 160) || minuteNumber,
            minuteSequence,
            documentId: text(payload.documentId, 160),
            previousMeetingId: text(payload.previousMeetingId, 180),
            nextMeetingAt: text(payload.nextMeetingAt, 40),
            chairpersonName: text(payload.chairpersonName, 160),
            minuteTakerName: text(payload.minuteTakerName, 160) || current.minuteTakerName,
            approverName: text(payload.approverName, 160),
            organizerName: text(payload.organizerName, 160) || current.organizerName,
            scheduledStart: text(payload.scheduledStart, 40),
            scheduledEnd: text(payload.scheduledEnd, 40),
            participants: Array.isArray(payload.participants)
              ? [...new Set(payload.participants.map((item) => text(item, 160)).filter(Boolean))].slice(0, 300)
              : current.participants,
          };
        }
        case "reserve_meeting_number": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező foglalhat sorszámot.");
          if (current.minuteNumber) return current;
          if (!current.projectCode) throw new Error("A számozáshoz előbb válassz projektet és projektkódot.");
          const reserved = await reserveProjectMeetingNumber({ projectCode: current.projectCode, meetingTypeCode: current.meetingTypeCode || "ÁLT" });
          return { ...current, minuteNumber: reserved.minuteNumber, minuteSequence: reserved.sequence };
        }
        case "update_notes": {
          if (!roleAllowsContentEditing(role)) throw new Error("A jegyzetek módosításához szervezői vagy szerkesztői jogosultság szükséges.");
          return { ...current, privateNotes: role === "organizer" ? text(payload.privateNotes, 30000) : current.privateNotes, sharedNote: text(payload.sharedNote, 30000) };
        }
        case "submit_shared_message": {
          const messageText = text(payload.text, 6000);
          if (!messageText) throw new Error("A szöveges bejegyzés nem lehet üres.");
          const submittedBy = text(payload.actorName, 160) || (role === "organizer" ? current.organizerName : role === "editor" ? current.editorAccess.editorName : "");
          if (!submittedBy || submittedBy.toLocaleLowerCase("hu-HU") === "résztvevő") throw new Error("A szöveges bejegyzéshez add meg a nevedet.");
          const status = role === "organizer" || role === "editor" ? "shared" as const : "pending" as const;
          const now = new Date().toISOString();
          return {
            ...current,
            sharedMessages: [...current.sharedMessages, {
              id: `shared-message-${randomUUID()}`,
              text: messageText,
              submittedBy,
              submittedEmail: text(payload.actorEmail, 240).toLowerCase(),
              agendaItemId: text(payload.agendaItemId, 180),
              includeInDocument: typeof payload.includeInDocument === "boolean" ? payload.includeInDocument : true,
              submittedAt: now,
              status,
              reviewedBy: status === "shared" ? submittedBy : "",
              reviewedAt: status === "shared" ? now : "",
            }].slice(-1000),
          };
        }
        case "review_shared_message": {
          if (!roleAllowsContentEditing(role)) throw new Error("A szöveges bejegyzés kezeléséhez szerkesztési jogosultság szükséges.");
          const messageId = text(payload.messageId, 180);
          const nextStatus = text(payload.status, 30);
          if (!["shared", "rejected"].includes(nextStatus)) throw new Error("Ismeretlen bejegyzési állapot.");
          const reviewer = role === "organizer" ? current.organizerName || "Szervező" : current.editorAccess.editorName || "Jegyzőkönyv-szerkesztő";
          const now = new Date().toISOString();
          return { ...current, sharedMessages: current.sharedMessages.map((item) => item.id === messageId ? { ...item, status: nextStatus as "shared" | "rejected", includeInDocument: typeof payload.includeInDocument === "boolean" ? payload.includeInDocument : item.includeInDocument ?? true, agendaItemId: text(payload.agendaItemId, 180) || item.agendaItemId, reviewedBy: reviewer, reviewedAt: now } : item) };
        }
        case "update_shared_message": {
          if (!roleAllowsContentEditing(role)) throw new Error("A szöveges bejegyzést csak a szervező vagy szerkesztő módosíthatja.");
          const messageId = text(payload.messageId, 180);
          return {
            ...current,
            sharedMessages: current.sharedMessages.map((item) => item.id === messageId ? {
              ...item,
              text: text(payload.text ?? item.text, 6000) || item.text,
              submittedBy: text(payload.submittedBy ?? item.submittedBy, 160) || item.submittedBy,
              submittedEmail: text(payload.submittedEmail ?? item.submittedEmail, 240).toLowerCase(),
              agendaItemId: text(payload.agendaItemId, 180),
              includeInDocument: typeof payload.includeInDocument === "boolean" ? payload.includeInDocument : item.includeInDocument ?? true,
            } : item),
          };
        }
        case "upsert_attendee": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező kezelheti a jelenléti ívet.");
          const name = text(payload.name, 160);
          if (!name) throw new Error("A jelenlévő neve kötelező.");
          const attendeeId = text(payload.id, 180) || `attendee-${randomUUID()}`;
          const allowedStatuses: AttendanceStatus[] = ["present", "late", "left_early", "invited_absent"];
          const allowedModes: ParticipationMode[] = ["online", "in_person"];
          const statusValue = text(payload.status, 40) as AttendanceStatus;
          const modeValue = text(payload.participationMode, 40) as ParticipationMode;
          const now = new Date().toISOString();
          const existing = current.attendees.find((item) => item.id === attendeeId);
          const attendee = {
            id: attendeeId,
            projectMemberId: text(payload.projectMemberId, 180),
            name,
            organization: text(payload.organization, 180),
            functionTitle: text(payload.functionTitle, 180),
            email: text(payload.email, 240),
            phone: text(payload.phone, 80),
            status: allowedStatuses.includes(statusValue) ? statusValue : "present" as AttendanceStatus,
            participationMode: allowedModes.includes(modeValue) ? modeValue : "online" as ParticipationMode,
            arrivalTime: text(payload.arrivalTime, 20),
            departureTime: text(payload.departureTime, 20),
            external: Boolean(payload.external),
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          const attendees = existing
            ? current.attendees.map((item) => item.id === attendeeId ? attendee : item)
            : [...current.attendees, attendee].slice(-300);
          return { ...current, attendees, participants: [...new Set(attendees.map((item) => item.name).filter(Boolean))] };
        }
        case "remove_attendee": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező kezelheti a jelenléti ívet.");
          const attendeeId = text(payload.id, 180);
          const attendees = current.attendees.filter((item) => item.id !== attendeeId);
          return { ...current, attendees, participants: [...new Set(attendees.map((item) => item.name).filter(Boolean))] };
        }
        case "import_project_members": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező tölthet be projekttagokat.");
          const projectId = text(payload.projectId, 180) || current.projectId;
          const profile = await readMeetingProjectProfile(projectId);
          if (!profile) throw new Error("A projektadatlap nem található.");
          const selectedIds = Array.isArray(payload.memberIds) ? new Set(payload.memberIds.map((item) => text(item, 180))) : new Set<string>();
          const selected = profile.members.filter((item) => item.active && (selectedIds.size === 0 ? item.defaultInvite : selectedIds.has(item.id)));
          const now = new Date().toISOString();
          const attendees = [...current.attendees];
          for (const member of selected) {
            const existingIndex = attendees.findIndex((item) => item.projectMemberId === member.id || (member.email && item.email.toLowerCase() === member.email.toLowerCase()));
            const attendee = {
              id: existingIndex >= 0 ? attendees[existingIndex].id : `attendee-${randomUUID()}`,
              projectMemberId: member.id,
              name: member.name,
              organization: member.organization,
              functionTitle: member.functionTitle,
              email: member.email,
              phone: member.phone,
              status: "present" as AttendanceStatus,
              participationMode: "online" as ParticipationMode,
              arrivalTime: "",
              departureTime: "",
              external: member.external,
              createdAt: existingIndex >= 0 ? attendees[existingIndex].createdAt : now,
              updatedAt: now,
            };
            if (existingIndex >= 0) attendees[existingIndex] = attendee;
            else attendees.push(attendee);
          }
          return {
            ...current,
            projectId: profile.projectId,
            projectCode: profile.code,
            projectName: profile.name,
            meetingLocation: current.meetingLocation || profile.location,
            attendees: attendees.slice(0, 300),
            participants: [...new Set(attendees.map((item) => item.name).filter(Boolean))],
          };
        }
        case "toggle_agenda": {
          if (!roleAllowsContentEditing(role)) throw new Error("A napirend módosításához szervezői vagy szerkesztői jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          if (role === "editor" && !current.agenda.some((item) => item.id === agendaItemId && item.shared)) throw new Error("A szerkesztő csak megosztott napirendi pontot módosíthat.");
          return { ...current, agenda: current.agenda.map((item) => item.id === agendaItemId ? { ...item, completed: typeof payload.completed === "boolean" ? payload.completed : !item.completed } : item) };
        }
        case "set_current_agenda": {
          if (!roleAllowsContentEditing(role)) throw new Error("A napirendi pont kiválasztásához szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          if (role === "editor" && !current.agenda.some((item) => item.id === agendaItemId && item.shared)) throw new Error("A szerkesztő csak megosztott napirendi pontot választhat ki.");
          return current.agenda.some((item) => item.id === agendaItemId) ? { ...current, currentAgendaItemId: agendaItemId } : current;
        }
        case "apply_agenda_template": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező tölthet be értekezletsablont.");
          const allowedTemplates: MeetingAgendaTemplateKey[] = ["general", "quick_general", "weekly_coordination", "design_coordination", "technical_inspection", "defect_review", "handover"];
          const templateKeyValue = text(payload.templateKey, 60) as MeetingAgendaTemplateKey;
          const templateKey = allowedTemplates.includes(templateKeyValue) ? templateKeyValue : "general";
          const template = getMeetingAgendaTemplate(templateKey);
          const agenda = createAgendaFromTemplate(templateKey, () => `agenda-${randomUUID()}`);
          return {
            ...current,
            agendaTemplateKey: templateKey,
            agenda,
            currentAgendaItemId: agenda[0]?.id || "",
            meetingType: current.minuteNumber ? current.meetingType : template.meetingType,
            meetingTypeCode: current.minuteNumber ? current.meetingTypeCode : template.meetingTypeCode,
          };
        }
        case "add_agenda_item": {
          if (!roleAllowsContentEditing(role)) throw new Error("Napirendi pont hozzáadásához szerkesztési jogosultság szükséges.");
          const title = text(payload.title, 300);
          if (!title) throw new Error("A napirendi pont megnevezése kötelező.");
          const now = new Date().toISOString();
          return {
            ...current,
            agenda: [...current.agenda, {
              id: `agenda-${randomUUID()}`,
              order: current.agenda.length + 1,
              title,
              ...createAgendaContentDefaults(title, now),
              completed: false,
              shared: role === "editor" ? true : typeof payload.shared === "boolean" ? payload.shared : true,
              isJoker: Boolean(payload.isJoker),
              topicBlocks: [],
            }],
          };
        }
        case "update_agenda_item": {
          if (!roleAllowsContentEditing(role)) throw new Error("A napirend szerkesztéséhez szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const title = text(payload.title, 300);
          if (role === "editor" && !current.agenda.some((item) => item.id === agendaItemId && item.shared)) throw new Error("A szerkesztő csak megosztott napirendi pontot módosíthat.");
          return { ...current, agenda: current.agenda.map((item) => item.id === agendaItemId ? { ...item, title: title || item.title, shared: role === "editor" ? true : typeof payload.shared === "boolean" ? payload.shared : item.shared } : item) };
        }
        case "update_agenda_content": {
          if (!roleAllowsContentEditing(role)) throw new Error("A napirendi tartalom módosításához szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          if (!current.agenda.some((item) => item.id === agendaItemId)) throw new Error("A napirendi pont nem található.");
          if (role === "editor" && !current.agenda.some((item) => item.id === agendaItemId && item.shared)) throw new Error("A szerkesztő csak megosztott napirendi pontot módosíthat.");
          const now = new Date().toISOString();
          return {
            ...current,
            agenda: current.agenda.map((item) => item.id === agendaItemId ? {
              ...item,
              description: text(payload.description, 4000),
              discussionNotes: text(payload.discussionNotes, 30000),
              decisionSummary: text(payload.decisionSummary, 12000),
              openQuestions: text(payload.openQuestions, 12000),
              privateNotes: role === "organizer" ? text(payload.privateNotes, 20000) : item.privateNotes,
              updatedAt: now,
              updatedBy: role === "editor" ? current.editorAccess.editorName || "Jegyzőkönyv-szerkesztő" : text(payload.updatedBy, 160) || current.minuteTakerName || current.organizerName || "Szervező",
            } : item),
          };
        }
        case "remove_agenda_item": {
          if (!roleAllowsContentEditing(role)) throw new Error("Napirendi pont törléséhez szerkesztési jogosultság szükséges.");
          if (current.agenda.length <= 1) throw new Error("Legalább egy napirendi pontnak maradnia kell.");
          const agendaItemId = text(payload.agendaItemId, 180);
          if (role === "editor" && !current.agenda.some((item) => item.id === agendaItemId && item.shared)) throw new Error("A szerkesztő csak megosztott napirendi pontot törölhet.");
          const agenda = current.agenda.filter((item) => item.id !== agendaItemId).map((item, index) => ({ ...item, order: index + 1 }));
          return { ...current, agenda, currentAgendaItemId: current.currentAgendaItemId === agendaItemId ? agenda[0]?.id || "" : current.currentAgendaItemId };
        }
        case "move_agenda_item": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("A napirend sorrendjét csak a szervező módosíthatja.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const direction = text(payload.direction, 20);
          const agenda = current.agenda.slice().sort((a, b) => a.order - b.order);
          const index = agenda.findIndex((item) => item.id === agendaItemId);
          const target = direction === "up" ? index - 1 : direction === "down" ? index + 1 : index;
          if (index < 0 || target < 0 || target >= agenda.length || target === index) return current;
          [agenda[index], agenda[target]] = [agenda[target], agenda[index]];
          return { ...current, agenda: agenda.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) };
        }
        case "toggle_agenda_shared": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező módosíthatja a napirendi pont láthatóságát.");
          const agendaItemId = text(payload.agendaItemId, 180);
          return { ...current, agenda: current.agenda.map((item) => item.id === agendaItemId ? { ...item, shared: typeof payload.shared === "boolean" ? payload.shared : !item.shared } : item) };
        }
        case "upsert_topic_block": {
          if (!roleAllowsContentEditing(role)) throw new Error("A témablokkok szerkesztéséhez szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const agendaItem = current.agenda.find((item) => item.id === agendaItemId);
          if (!agendaItem) throw new Error("A napirendi pont nem található.");
          if (role === "editor" && !agendaItem.shared) throw new Error("A szerkesztő csak megosztott napirendi pont témáit módosíthatja.");
          const topicBlockId = text(payload.id, 180) || `topic-${randomUUID()}`;
          const existing = agendaItem.topicBlocks.find((item) => item.id === topicBlockId);
          if (role === "editor" && existing && !existing.shared) throw new Error("A szerkesztő csak megosztott témablokkot módosíthat.");
          const now = new Date().toISOString();
          const block = {
            id: topicBlockId,
            order: existing?.order || agendaItem.topicBlocks.length + 1,
            title: text(payload.title, 300) || existing?.title || "Új témakör",
            background: text(payload.background, 8000),
            discussion: text(payload.discussion, 30000),
            decision: text(payload.decision, 12000),
            openQuestions: text(payload.openQuestions, 12000),
            clientOpinion: text(payload.clientOpinion, 12000),
            designerOpinion: text(payload.designerOpinion, 12000),
            contractorOpinion: text(payload.contractorOpinion, 12000),
            owner: text(payload.owner, 180),
            dueDate: text(payload.dueDate, 40),
            attachmentIds: Array.isArray(payload.attachmentIds) ? [...new Set(payload.attachmentIds.map((item) => text(item, 180)).filter(Boolean))] : existing?.attachmentIds || [],
            privateNotes: role === "organizer" ? text(payload.privateNotes, 20000) : existing?.privateNotes || "",
            shared: role === "editor" ? true : typeof payload.shared === "boolean" ? payload.shared : existing?.shared ?? true,
            previousMeetingId: text(payload.previousMeetingId, 180),
            previousAgendaItemId: text(payload.previousAgendaItemId, 180),
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            updatedBy: role === "editor" ? current.editorAccess.editorName || "Jegyzőkönyv-szerkesztő" : text(payload.updatedBy, 160) || current.minuteTakerName || current.organizerName || "Szervező",
          };
          return {
            ...current,
            agenda: current.agenda.map((item) => item.id === agendaItemId ? {
              ...item,
              isJoker: true,
              topicBlocks: existing ? item.topicBlocks.map((topic) => topic.id === topicBlockId ? block : topic) : [...item.topicBlocks, block],
              updatedAt: now,
              updatedBy: block.updatedBy,
            } : item),
          };
        }
        case "remove_topic_block": {
          if (!roleAllowsContentEditing(role)) throw new Error("Témablokk törléséhez szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const topicBlockId = text(payload.topicBlockId, 180);
          const sourceAgenda = current.agenda.find((item) => item.id === agendaItemId);
          if (role === "editor" && (!sourceAgenda?.shared || !sourceAgenda.topicBlocks.some((topic) => topic.id === topicBlockId && topic.shared))) throw new Error("A szerkesztő csak megosztott témablokkot törölhet.");
          return { ...current, agenda: current.agenda.map((item) => item.id === agendaItemId ? { ...item, topicBlocks: item.topicBlocks.filter((topic) => topic.id !== topicBlockId).map((topic, index) => ({ ...topic, order: index + 1 })) } : item) };
        }
        case "move_topic_block": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("A témablokkok sorrendjét csak a szervező módosíthatja.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const topicBlockId = text(payload.topicBlockId, 180);
          const direction = text(payload.direction, 20);
          return {
            ...current,
            agenda: current.agenda.map((item) => {
              if (item.id !== agendaItemId) return item;
              const blocks = item.topicBlocks.slice().sort((a, b) => a.order - b.order);
              const index = blocks.findIndex((topic) => topic.id === topicBlockId);
              const target = direction === "up" ? index - 1 : direction === "down" ? index + 1 : index;
              if (index < 0 || target < 0 || target >= blocks.length || target === index) return item;
              [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
              return { ...item, topicBlocks: blocks.map((topic, itemIndex) => ({ ...topic, order: itemIndex + 1 })) };
            }),
          };
        }
        case "promote_topic_blocks": {
          if (!roleAllowsContentEditing(role)) throw new Error("A témablokkok átalakításához szerkesztési jogosultság szükséges.");
          const agendaItemId = text(payload.agendaItemId, 180);
          const source = current.agenda.find((item) => item.id === agendaItemId);
          if (!source || source.topicBlocks.length === 0) return current;
          if (role === "editor" && !source.shared) throw new Error("A szerkesztő csak megosztott napirendi pont témáit alakíthatja át.");
          const sourceTopics = role === "editor" ? source.topicBlocks.filter((topic) => topic.shared) : source.topicBlocks;
          if (sourceTopics.length === 0) return current;
          const now = new Date().toISOString();
          const appended = sourceTopics.map((topic, index) => ({
            id: `agenda-${randomUUID()}`,
            order: current.agenda.length + index + 1,
            title: topic.title,
            description: topic.background,
            discussionNotes: topic.discussion,
            decisionSummary: topic.decision,
            openQuestions: topic.openQuestions,
            privateNotes: role === "editor" ? "" : topic.privateNotes,
            completed: false,
            shared: role === "editor" ? true : topic.shared,
            isJoker: false,
            topicBlocks: [],
            updatedAt: now,
            updatedBy: topic.updatedBy,
          }));
          return { ...current, agenda: [...current.agenda, ...appended] };
        }
        case "append_transcript": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Az átiratot csak a szervezői nézet kezelheti.");
          const line: MeetingTranscriptLine = {
            id: `tr-${randomUUID()}`,
            at: text(payload.at, 12) || new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" }),
            speaker: text(payload.speaker, 120) || "Ismeretlen beszélő",
            text: text(payload.text, 6000),
            shared: Boolean(payload.shared),
            source: "manual",
          };
          return line.text ? { ...current, transcript: [...current.transcript, line].slice(-5000) } : current;
        }
        case "add_action_item": {
          if (!roleAllowsContentEditing(role)) throw new Error("Feladat vagy döntés rögzítéséhez szerkesztési jogosultság szükséges.");
          const typeValue = text(payload.type, 30) as ActionItemType;
          const allowedTypes: ActionItemType[] = ["task", "decision", "question", "deadline"];
          const title = text(payload.title, 500);
          if (!title) return current;
          return {
            ...current,
            actionItems: [...current.actionItems, {
              id: `action-${randomUUID()}`,
              agendaItemId: text(payload.agendaItemId, 180),
              topicBlockId: text(payload.topicBlockId, 180),
              type: allowedTypes.includes(typeValue) ? typeValue : "task",
              title,
              detail: text(payload.detail, 4000),
              owner: text(payload.owner, 160),
              dueDate: text(payload.dueDate, 30),
              shared: role === "editor" ? true : Boolean(payload.shared),
              createdAt: new Date().toISOString(),
            }].slice(-1000),
          };
        }
        case "toggle_action_shared": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező tehet közzé feladatot vagy döntést.");
          const actionId = text(payload.actionId, 160);
          return { ...current, actionItems: current.actionItems.map((item) => item.id === actionId ? { ...item, shared: typeof payload.shared === "boolean" ? payload.shared : !item.shared } : item) };
        }
        case "set_attachment_status": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező hagyhat jóvá vagy oszthat meg mellékletet.");
          const fileId = text(payload.fileId, 160);
          const status = text(payload.status, 40) as AttachmentStatus;
          const allowedStatuses: AttachmentStatus[] = ["pending", "approved", "shared", "rejected"];
          if (!allowedStatuses.includes(status)) throw new Error("Ismeretlen melléklet státusz.");
          return { ...current, attachments: current.attachments.map((item) => item.id === fileId ? { ...item, status } : item) };
        }
        case "update_attachment": {
          const fileId = text(payload.fileId, 160);
          return {
            ...current,
            attachments: current.attachments.map((item) => {
              if (item.id !== fileId) return item;
              const isOwner = text(payload.actorName, 160) === item.uploadedBy;
              const sharedCollaboration = item.status === "shared" && (role === "editor" || role === "participant");
              if (!roleAllowsOrganizerActions(role) && !sharedCollaboration && !isOwner) return item;
              const participantSharedEdit = role === "participant" && item.status === "shared";
              const nextDescription = text(payload.description ?? payload.caption, 2000);
              return {
                ...item,
                caption: nextDescription.slice(0, 1000),
                title: participantSharedEdit ? item.title : text(payload.title ?? item.title, 180) || undefined,
                description: nextDescription || undefined,
                includeInAi: participantSharedEdit ? Boolean(item.includeInAi) : typeof payload.includeInAi === "boolean" ? payload.includeInAi : Boolean(item.includeInAi),
                agendaItemId: participantSharedEdit ? item.agendaItemId : text(payload.agendaItemId, 180) || undefined,
                topicBlockId: participantSharedEdit ? item.topicBlockId : text(payload.topicBlockId, 180) || undefined,
              };
            }),
          };
        }
        case "update_next_meeting": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező állíthatja be a következő egyeztetést.");
          const statusValue = text(payload.status, 40);
          const status = ["not_defined", "planned", "under_coordination", "confirmed"].includes(statusValue) ? statusValue as typeof current.nextMeeting.status : current.nextMeeting.status;
          const startsAt = text(payload.startsAt, 40);
          return {
            ...current,
            nextMeetingAt: startsAt,
            nextMeeting: {
              status,
              startsAt,
              endsAt: text(payload.endsAt, 40),
              location: text(payload.location, 240),
              note: text(payload.note, 4000),
            },
          };
        }
        case "update_participant_permissions": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező kezelheti a résztvevői jogosultságokat.");
          return {
            ...current,
            participantPermissions: {
              acknowledgementsEnabled: bool(payload.acknowledgementsEnabled, current.participantPermissions.acknowledgementsEnabled),
              commentsEnabled: bool(payload.commentsEnabled, current.participantPermissions.commentsEnabled),
              ratingsEnabled: bool(payload.ratingsEnabled, current.participantPermissions.ratingsEnabled),
              reviewDeadline: text(payload.reviewDeadline, 40),
            },
          };
        }
        case "save_ai_minutes_draft": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező menthet AI-jegyzőkönyvtervezetet.");
          return { ...current, aiMinutesDraft: text(payload.text, 80000) };
        }
        case "publish_summary": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező tehet közzé összefoglalót.");
          const now = new Date().toISOString();
          const version = Math.max(0, ...current.publishedSummaries.map((item) => item.version)) + 1;
          const summaryId = `summary-${randomUUID()}`;
          const source: "ai" | "rules" = payload.source === "ai" ? "ai" : "rules";
          const bodyText = text(payload.body, 80000) || (source === "ai" ? current.aiMinutesDraft : renderLiveMinutesText(current, false));
          if (!bodyText) throw new Error("Nincs közzétehető összefoglaló tartalom.");
          const emailDocumentTypeValue = text(payload.emailDocumentType, 40) as MeetingEmailDocumentType;
          const emailDocumentType: MeetingEmailDocumentType = ["reminder", "draft_minutes", "final_minutes", "custom"].includes(emailDocumentTypeValue) ? emailDocumentTypeValue : current.closure.emailDocumentType;
          const emailDeliveryModeValue = text(payload.emailDeliveryMode, 40) as MeetingEmailDeliveryMode;
          const emailDeliveryMode: MeetingEmailDeliveryMode = emailDeliveryModeValue === "automatic" ? "automatic" : "organizer";
          const summary = {
            id: summaryId,
            version,
            source,
            title: text(payload.title, 300) || `${current.documentLabel} – ${current.minuteNumber || current.title}`,
            body: bodyText,
            closingTitle: text(payload.closingTitle, 300) || current.closure.closingTitle,
            closingMessage: text(payload.closingMessage, 5000) || current.closure.closingMessage,
            emailNotice: text(payload.emailNotice, 5000) || current.closure.emailNotice,
            emailDocumentType,
            emailDeliveryMode,
            reviewDeadline: text(payload.reviewDeadline, 40) || current.participantPermissions.reviewDeadline,
            nextMeetingAt: current.nextMeeting.startsAt,
            nextMeetingLocation: current.nextMeeting.location,
            createdAt: now,
            createdBy: text(payload.createdBy, 160) || current.minuteTakerName || current.organizerName,
            publishedAt: now,
            revokedAt: "",
          };
          return {
            ...current,
            publishedSummaries: [...current.publishedSummaries, summary].slice(-200),
            activePublishedSummaryId: summaryId,
            closure: {
              ...current.closure,
              lastPublishedAt: now,
              closingTitle: summary.closingTitle,
              closingMessage: summary.closingMessage,
              emailNotice: summary.emailNotice,
              emailDocumentType,
              emailDeliveryMode,
              reviewDeadline: summary.reviewDeadline,
            },
          };
        }
        case "revoke_summary": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező vonhat vissza összefoglalót.");
          const summaryId = text(payload.summaryId, 180) || current.activePublishedSummaryId;
          const now = new Date().toISOString();
          const summaries = current.publishedSummaries.map((item) => item.id === summaryId ? { ...item, revokedAt: now } : item);
          const nextActive = summaries.filter((item) => item.publishedAt && !item.revokedAt).at(-1)?.id || "";
          return { ...current, publishedSummaries: summaries, activePublishedSummaryId: nextActive };
        }
        case "submit_feedback": {
          const typeValue = text(payload.type, 40) as MeetingFeedbackType;
          const allowedTypes: MeetingFeedbackType[] = ["acknowledged", "comment", "disagree", "addition", "partial_attendance", "rating"];
          const type = allowedTypes.includes(typeValue) ? typeValue : "comment";
          if (type === "acknowledged" && !current.participantPermissions.acknowledgementsEnabled) throw new Error("A visszaigazolás jelenleg nincs engedélyezve.");
          if (["comment", "disagree", "addition", "partial_attendance"].includes(type) && !current.participantPermissions.commentsEnabled) throw new Error("A jegyzőkönyvi észrevételek jelenleg nincsenek engedélyezve.");
          if (type === "rating" && !current.participantPermissions.ratingsEnabled) throw new Error("Az értekezlet értékelése jelenleg nincs engedélyezve.");
          const participantName = text(payload.participantName, 160) || "Résztvevő";
          const activeSummary = current.publishedSummaries.find((item) => item.id === current.activePublishedSummaryId);
          const feedback = {
            id: `feedback-${randomUUID()}`,
            participantName,
            participantEmail: text(payload.participantEmail, 240),
            type,
            agendaItemId: text(payload.agendaItemId, 180),
            topicBlockId: text(payload.topicBlockId, 180),
            quote: text(payload.quote, 5000),
            comment: text(payload.comment, 12000),
            ratingUseful: Math.max(0, Math.min(5, Number(payload.ratingUseful || 0))),
            ratingPrepared: Math.max(0, Math.min(5, Number(payload.ratingPrepared || 0))),
            ratingClarity: Math.max(0, Math.min(5, Number(payload.ratingClarity || 0))),
            anonymous: Boolean(payload.anonymous),
            status: "pending" as MeetingFeedbackStatus,
            relatedSummaryVersion: activeSummary?.version || 0,
            createdAt: new Date().toISOString(),
            reviewedAt: "",
            reviewedBy: "",
          };
          return { ...current, feedback: [...current.feedback, feedback].slice(-1000) };
        }
        case "review_feedback": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező kezelheti a visszajelzéseket.");
          const feedbackId = text(payload.feedbackId, 180);
          const statusValue = text(payload.status, 40) as MeetingFeedbackStatus;
          const status: MeetingFeedbackStatus = ["pending", "accepted", "rejected"].includes(statusValue) ? statusValue : "pending";
          const now = new Date().toISOString();
          return { ...current, feedback: current.feedback.map((item) => item.id === feedbackId ? { ...item, status, reviewedAt: now, reviewedBy: text(payload.reviewedBy, 160) || current.organizerName } : item) };
        }
        case "safe_close_session": {
          if (!roleAllowsContentEditing(role)) throw new Error("A munkamenetet csak a szervező vagy a jegyzőkönyv-szerkesztő zárhatja biztonságosan.");
          const actorName = text(payload.actorName, 160) || (role === "organizer" ? current.organizerName : current.editorAccess.editorName) || "Szervező";
          const now = new Date().toISOString();
          const autoTranscriptWatch = typeof payload.autoTranscriptWatch === "boolean" ? payload.autoTranscriptWatch : current.sessionState.autoTranscriptWatch;
          return {
            ...current,
            presentation: { ...current.presentation, enabled: false, mode: "fixed", controllerGrantId: "", controllerLastSeenAt: now, sequence: current.presentation.sequence + 1, updatedAt: now },
            presentationControl: { ...current.presentationControl, status: "revoked", grantId: "", revokedAt: now, revokedBy: actorName },
            teamsTranscript: { ...current.teamsTranscript, autoWatchEnabled: autoTranscriptWatch },
            sessionState: { ...current.sessionState, lastSafeCloseAt: now, lastSafeClosedBy: actorName, autoTranscriptWatch, lastSavedAt: now },
            auditLog: [...current.auditLog, { id: `audit-${randomUUID()}`, type: "meeting_session_safe_closed", at: now, actorName, actorRole: role, message: `${actorName} biztonságosan lezárta a DIMPRO munkamenetet.`, operation: "safe_close_session" }].slice(-1000),
          };
        }
        case "close_meeting": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező zárhatja le az értekezletet.");
          const mode = text(payload.mode, 30) as MeetingClosureMode;
          const allowedModes: MeetingClosureMode[] = ["draft", "approval", "publish"];
          if (!allowedModes.includes(mode)) throw new Error("Ismeretlen lezárási mód.");
          const statusByMode: Record<MeetingClosureMode, MeetingStatus> = { draft: "draft_closed", approval: "pending_approval", publish: "published" };
          const now = new Date().toISOString();
          const nextVersion = Math.max(0, Number(current.closure.snapshotVersion || 0)) + 1;
          return {
            ...current,
            status: statusByMode[mode],
            endedAt: text(payload.endedAt, 40) || current.endedAt || now,
            closure: {
              ...current.closure,
              mode,
              closedAt: now,
              closedBy: text(payload.closedBy, 160) || current.organizerName || "Szervező",
              note: text(payload.note, 6000),
              snapshotVersion: nextVersion,
              lastPublishedAt: mode === "publish" ? now : current.closure.lastPublishedAt,
              closingTitle: text(payload.closingTitle, 300) || current.closure.closingTitle,
              closingMessage: text(payload.closingMessage, 5000) || current.closure.closingMessage,
              emailNotice: text(payload.emailNotice, 5000) || current.closure.emailNotice,
              emailDocumentType: (text(payload.emailDocumentType, 40) as MeetingEmailDocumentType) || current.closure.emailDocumentType,
              emailDeliveryMode: payload.emailDeliveryMode === "automatic" ? "automatic" : current.closure.emailDeliveryMode,
              reviewDeadline: text(payload.reviewDeadline, 40) || current.closure.reviewDeadline,
            },
          };
        }
        case "reopen_meeting": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező nyithatja újra az értekezletet.");
          return { ...current, status: "active", closure: { ...current.closure, note: text(payload.note, 6000) || current.closure.note } };
        }
        case "archive_meeting": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("Csak a szervező archiválhatja az értekezletet.");
          if (current.status === "active") throw new Error("Aktív értekezlet nem archiválható. Előbb zárd le.");
          return { ...current, status: "archived", closure: { ...current.closure, snapshotVersion: Math.max(0, Number(current.closure.snapshotVersion || 0)) + 1 } };
        }
        case "load_demo_transcript": {
          if (!roleAllowsOrganizerActions(role)) throw new Error("A tesztátiratot csak a szervező töltheti be.");
          if (current.transcript.length > 0) return current;
          const samples = [
            ["09:12", "Kovács Péter", "A mai egyeztetés célja a homlokzati kialakítás véglegesítése."],
            ["09:13", "Tóth Anna", "A tervmódosítások a költségvetéshez igazodnak."],
            ["09:14", "Nagy László", "Kérem az acél rögzítések részleteinek tisztázását."],
            ["09:15", "Szabó Dániel", "A beszállítás üteme tartható, nincs akadály."],
          ];
          return { ...current, transcript: samples.map(([at, speaker, lineText]) => ({ id: `tr-${randomUUID()}`, at, speaker, text: lineText, shared: false })) };
        }
        default:
          return current;
      }
    });

    if (operation === "close_meeting" || operation === "archive_meeting") {
      await writeMeetingSnapshot(workspace);
    }

    if (role === "editor") {
      const editorName = authorizationWorkspace.editorAccess.editorName || "Jegyzőkönyv-szerkesztő";
      workspace = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        auditLog: [...current.auditLog, {
          id: `audit-${randomUUID()}`,
          type: "editor_content_changed",
          at: new Date().toISOString(),
          actorName: editorName,
          actorRole: "editor" as const,
          message: `${editorName} szerkesztési műveletet végzett: ${operation}.`,
          operation,
        }].slice(-1000),
      }));
    }

    const responseWorkspace = role === "organizer" ? workspace : createExportWorkspace(workspace, false);
    return NextResponse.json({ ok: true, workspace: responseWorkspace, accessToken: bootstrapAccessToken || undefined });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "A művelet nem sikerült." },
      { status: 400 },
    );
  }
}
