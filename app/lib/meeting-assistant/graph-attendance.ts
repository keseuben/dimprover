import { createHash } from "node:crypto";
import { getGraphApplicationToken, GraphTranscriptError } from "./graph-transcript";
import type { MeetingAttendee, MeetingWorkspace } from "./types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

type GraphError = { error?: { code?: string; message?: string; innerError?: { code?: string } } };
type EventAttendee = {
  type?: string;
  status?: { response?: string; time?: string };
  emailAddress?: { name?: string; address?: string };
};
type EventResponse = GraphError & {
  subject?: string;
  attendees?: EventAttendee[];
  organizer?: { emailAddress?: { name?: string; address?: string } };
};
type AttendanceReport = { id?: string; meetingStartDateTime?: string; meetingEndDateTime?: string; totalParticipantCount?: number };
type AttendanceInterval = { joinDateTime?: string; leaveDateTime?: string; durationInSeconds?: number };
type AttendanceRecord = {
  id?: string;
  emailAddress?: string;
  role?: string;
  totalAttendanceInSeconds?: number;
  attendanceIntervals?: AttendanceInterval[];
  identity?: {
    displayName?: string;
    user?: { id?: string; displayName?: string };
    guest?: { id?: string; displayName?: string };
    phone?: { id?: string; displayName?: string };
  };
};
type ListResponse<T> = GraphError & { value?: T[]; "@odata.nextLink"?: string };

export class GraphAttendanceError extends Error {
  code: string;
  constructor(message: string, code = "GraphAttendanceError") {
    super(message);
    this.name = "GraphAttendanceError";
    this.code = code;
  }
}

function errorCode(data: GraphError | null) {
  return data?.error?.innerError?.code || data?.error?.code || "GraphRequestError";
}

function errorMessage(data: GraphError | null, fallback: string) {
  return data?.error?.message || fallback;
}

async function graphJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
  const data = (await response.json().catch(() => null)) as (T & GraphError) | null;
  if (!response.ok || !data) throw new GraphAttendanceError(errorMessage(data, `A Microsoft Graph kérés sikertelen (${response.status}).`), errorCode(data));
  return data;
}

async function graphListAll<T>(url: string, token: string) {
  const rows: T[] = [];
  let nextUrl = url;
  let guard = 0;
  while (nextUrl && guard < 20) {
    const data = await graphJson<ListResponse<T>>(nextUrl, token);
    rows.push(...(data.value || []));
    nextUrl = data["@odata.nextLink"] || "";
    guard += 1;
  }
  return rows;
}

function attendeeId(prefix: string, key: string) {
  return `${prefix}-${createHash("sha1").update(key).digest("hex").slice(0, 20)}`;
}

function hm(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

function attendanceStatus(record: AttendanceRecord, workspace: MeetingWorkspace): MeetingAttendee["status"] {
  const intervals = record.attendanceIntervals || [];
  const firstJoin = intervals.map((item) => new Date(item.joinDateTime || "").getTime()).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const lastLeave = intervals.map((item) => new Date(item.leaveDateTime || "").getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const start = new Date(workspace.scheduledStart || "").getTime();
  const end = new Date(workspace.scheduledEnd || workspace.endedAt || "").getTime();
  if (Number.isFinite(start) && Number.isFinite(firstJoin) && firstJoin > start + 10 * 60_000) return "late";
  if (Number.isFinite(end) && Number.isFinite(lastLeave) && lastLeave < end - 10 * 60_000) return "left_early";
  return "present";
}

export async function fetchTeamsInvitedAttendees(workspace: MeetingWorkspace) {
  const organizerUserId = workspace.teamsTranscript.organizerUserId.trim();
  const eventId = workspace.teamsAttendance.graphCalendarEventId.trim();
  if (!organizerUserId || !eventId) throw new GraphAttendanceError("Add meg a szervező Entra felhasználóazonosítóját és a Teams/Outlook naptáresemény Graph-azonosítóját.", "MeetingEventIdsMissing");
  const token = await getGraphApplicationToken();
  const url = `${GRAPH_ROOT}/users/${encodeURIComponent(organizerUserId)}/events/${encodeURIComponent(eventId)}?$select=subject,organizer,attendees,start,end,location`;
  const event = await graphJson<EventResponse>(url, token);
  const now = new Date().toISOString();
  const attendees: MeetingAttendee[] = [];
  const organizer = event.organizer?.emailAddress;
  if (organizer?.name || organizer?.address) {
    const key = (organizer.address || organizer.name || "organizer").toLowerCase();
    attendees.push({ id: attendeeId("teams-invite", key), projectMemberId: "", name: organizer.name || organizer.address || "Szervező", organization: "", functionTitle: "Szervező", email: organizer.address || "", phone: "", status: "present", participationMode: "online", arrivalTime: "", departureTime: "", external: false, source: "teams_invite", teamsUserId: "", teamsRole: "organizer", responseStatus: "organizer", totalAttendanceSeconds: 0, attendanceIntervals: [], createdAt: now, updatedAt: now });
  }
  for (const item of event.attendees || []) {
    const name = String(item.emailAddress?.name || item.emailAddress?.address || "").trim();
    const email = String(item.emailAddress?.address || "").trim().toLowerCase();
    if (!name && !email) continue;
    const response = String(item.status?.response || "none");
    attendees.push({
      id: attendeeId("teams-invite", email || name.toLowerCase()),
      projectMemberId: "",
      name: name || email,
      organization: "",
      functionTitle: item.type === "optional" ? "Opcionális meghívott" : "Meghívott",
      email,
      phone: "",
      status: "invited_absent",
      participationMode: "online",
      arrivalTime: "",
      departureTime: "",
      external: item.type === "resource" || false,
      source: "teams_invite",
      teamsUserId: "",
      teamsRole: item.type || "required",
      responseStatus: response,
      totalAttendanceSeconds: 0,
      attendanceIntervals: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return { attendees, subject: event.subject || "" };
}

export async function fetchTeamsAttendance(workspace: MeetingWorkspace) {
  const organizerUserId = workspace.teamsTranscript.organizerUserId.trim();
  const onlineMeetingId = workspace.teamsTranscript.graphOnlineMeetingId.trim();
  if (!organizerUserId || !onlineMeetingId) throw new GraphAttendanceError("Add meg a szervező Entra felhasználóazonosítóját és a Graph onlineMeeting azonosítót.", "MeetingGraphIdsMissing");
  const token = await getGraphApplicationToken();
  const reportsUrl = `${GRAPH_ROOT}/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/attendanceReports?$top=50`;
  const reports = await graphListAll<AttendanceReport>(reportsUrl, token);
  const report = reports.filter((item) => item.id).sort((a, b) => String(b.meetingEndDateTime || b.meetingStartDateTime || "").localeCompare(String(a.meetingEndDateTime || a.meetingStartDateTime || "")))[0];
  if (!report?.id) return { reportId: "", attendees: [] as MeetingAttendee[] };
  const recordsUrl = `${GRAPH_ROOT}/users/${encodeURIComponent(organizerUserId)}/onlineMeetings/${encodeURIComponent(onlineMeetingId)}/attendanceReports/${encodeURIComponent(report.id)}/attendanceRecords?$top=999`;
  const records = await graphListAll<AttendanceRecord>(recordsUrl, token);
  const now = new Date().toISOString();
  const attendees = records.map((record, index) => {
    const identity = record.identity;
    const name = String(identity?.displayName || identity?.user?.displayName || identity?.guest?.displayName || identity?.phone?.displayName || record.emailAddress || `Résztvevő ${index + 1}`).trim();
    const teamsUserId = String(identity?.user?.id || identity?.guest?.id || identity?.phone?.id || record.id || "");
    const email = String(record.emailAddress || "").trim().toLowerCase();
    const intervals = (record.attendanceIntervals || []).map((item) => ({ joinDateTime: String(item.joinDateTime || ""), leaveDateTime: String(item.leaveDateTime || ""), durationSeconds: Math.max(0, Number(item.durationInSeconds || 0)) }));
    const first = intervals.map((item) => item.joinDateTime).filter(Boolean).sort()[0] || "";
    const last = intervals.map((item) => item.leaveDateTime).filter(Boolean).sort().at(-1) || "";
    return {
      id: attendeeId("teams-attendance", teamsUserId || email || name.toLowerCase()),
      projectMemberId: "",
      name,
      organization: "",
      functionTitle: record.role || "Résztvevő",
      email,
      phone: "",
      status: attendanceStatus(record, workspace),
      participationMode: "online" as const,
      arrivalTime: hm(first),
      departureTime: hm(last),
      external: Boolean(identity?.guest),
      source: "teams_attendance" as const,
      teamsUserId,
      teamsRole: record.role || "attendee",
      responseStatus: "attended",
      totalAttendanceSeconds: Math.max(0, Number(record.totalAttendanceInSeconds || intervals.reduce((sum, item) => sum + item.durationSeconds, 0))),
      attendanceIntervals: intervals,
      createdAt: now,
      updatedAt: now,
    } satisfies MeetingAttendee;
  });
  return { reportId: report.id, attendees };
}

export function graphAttendancePermissionError(error: unknown) {
  const graphError = error instanceof GraphAttendanceError ? error : error instanceof GraphTranscriptError ? new GraphAttendanceError(error.message, error.code) : new GraphAttendanceError(error instanceof Error ? error.message : "A Teams jelenléti adatok beolvasása sikertelen.");
  const permission = ["Authorization_RequestDenied", "Forbidden", "ErrorAccessDenied", "GraphNotConfigured", "ApplicationAccessPolicyNotGranted"].includes(graphError.code);
  return { error: graphError, permission };
}
