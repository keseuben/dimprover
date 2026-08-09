import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { fetchTeamsAttendance, fetchTeamsInvitedAttendees, graphAttendancePermissionError } from "@/app/lib/meeting-assistant/graph-attendance";
import { getGraphTranscriptConfig } from "@/app/lib/meeting-assistant/graph-transcript";
import { readMeetingWorkspace, sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";
import type { MeetingAttendee } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Operation = "configure" | "import_invited" | "import_attendance";
type Body = { meetingId?: string; accessToken?: string; operation?: Operation; organizerUserId?: string; graphOnlineMeetingId?: string; graphCalendarEventId?: string };

function organizerAllowed(auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

function mergeAttendees(current: MeetingAttendee[], incoming: MeetingAttendee[]) {
  const result = [...current];
  for (const next of incoming) {
    const index = result.findIndex((item) => (next.teamsUserId && item.teamsUserId === next.teamsUserId) || (next.email && item.email.toLowerCase() === next.email.toLowerCase()) || (!next.email && item.name.toLowerCase() === next.name.toLowerCase()));
    if (index < 0) result.push(next);
    else {
      const existing = result[index];
      result[index] = {
        ...existing,
        ...next,
        id: existing.id,
        projectMemberId: existing.projectMemberId || next.projectMemberId,
        organization: existing.organization || next.organization,
        functionTitle: next.source === "teams_attendance" ? next.functionTitle : existing.functionTitle || next.functionTitle,
        phone: existing.phone || next.phone,
        external: existing.external || next.external,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
    }
  }
  return result.slice(0, 1000);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "A Teams jelenléti kapcsolatot csak a szervező kezelheti." }, { status: 403 });
  const workspace = await readMeetingWorkspace(meetingId);
  return NextResponse.json({ ok: true, config: getGraphTranscriptConfig(), integration: workspace.teamsAttendance, transcriptIntegration: workspace.teamsTranscript });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body?.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "A Teams meghívottakat és jelenléti jelentést csak a szervező importálhatja." }, { status: 403 });
  if (body?.operation === "configure") {
    const organizerUserId = String(body.organizerUserId || "").trim().slice(0, 180);
    const graphOnlineMeetingId = String(body.graphOnlineMeetingId || "").trim().slice(0, 500);
    const graphCalendarEventId = String(body.graphCalendarEventId || "").trim().slice(0, 500);
    const workspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      teamsTranscript: { ...current.teamsTranscript, organizerUserId, graphOnlineMeetingId, status: organizerUserId && graphOnlineMeetingId ? "ready" : current.teamsTranscript.status, lastError: "" },
      teamsAttendance: { ...current.teamsAttendance, graphCalendarEventId, status: organizerUserId && (graphCalendarEventId || graphOnlineMeetingId) ? "ready" : "not_configured", lastError: "" },
    }));
    return NextResponse.json({ ok: true, workspace, integration: workspace.teamsAttendance });
  }
  if (!body?.operation || !["import_invited", "import_attendance"].includes(body.operation)) return NextResponse.json({ ok: false, error: "Ismeretlen Teams jelenléti művelet." }, { status: 400 });
  await updateMeetingWorkspace(meetingId, (current) => ({ ...current, teamsAttendance: { ...current.teamsAttendance, status: "syncing", lastError: "" } }));
  try {
    const workspace = await readMeetingWorkspace(meetingId);
    const result = body.operation === "import_invited" ? await fetchTeamsInvitedAttendees(workspace) : await fetchTeamsAttendance(workspace);
    const updated = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      attendees: mergeAttendees(current.attendees, result.attendees),
      teamsAttendance: {
        ...current.teamsAttendance,
        status: result.attendees.length > 0 ? "available" : "not_found",
        lastInviteSyncAt: body.operation === "import_invited" ? new Date().toISOString() : current.teamsAttendance.lastInviteSyncAt,
        lastAttendanceSyncAt: body.operation === "import_attendance" ? new Date().toISOString() : current.teamsAttendance.lastAttendanceSyncAt,
        lastError: "",
        attendanceReportId: "reportId" in result ? result.reportId : current.teamsAttendance.attendanceReportId,
        importedInviteCount: body.operation === "import_invited" ? result.attendees.length : current.teamsAttendance.importedInviteCount,
        importedAttendanceCount: body.operation === "import_attendance" ? result.attendees.length : current.teamsAttendance.importedAttendanceCount,
      },
    }));
    return NextResponse.json({ ok: true, workspace: updated, importedNow: result.attendees.length, integration: updated.teamsAttendance });
  } catch (error) {
    const state = graphAttendancePermissionError(error);
    const updated = await updateMeetingWorkspace(meetingId, (current) => ({ ...current, teamsAttendance: { ...current.teamsAttendance, status: state.permission ? "permission_required" : "error", lastError: state.error.message.slice(0, 2000) } }));
    return NextResponse.json({ ok: false, error: state.error.message, code: state.error.code, integration: updated.teamsAttendance }, { status: state.permission ? 503 : 400 });
  }
}
