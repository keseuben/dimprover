import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchTeamsAttendance } from "@/app/lib/meeting-assistant/graph-attendance";
import { fetchTeamsTranscript, GraphTranscriptError } from "@/app/lib/meeting-assistant/graph-transcript";
import { listMeetingWorkspaces, readMeetingWorkspace, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";
import type { MeetingAttendee, MeetingTranscriptLine } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = String(process.env.MEETING_TRANSCRIPT_WATCH_KEY || process.env.DIMPRO_SERVER_MONITOR_KEY || "").trim();
  const received = String(request.headers.get("x-dimpro-meeting-watch-key") || "").trim();
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mergeTranscript(current: MeetingTranscriptLine[], incoming: MeetingTranscriptLine[]) {
  const signatures = new Set(current.map((item) => `${item.at}|${item.speaker}|${item.text}`));
  return [...current, ...incoming.filter((item) => !signatures.has(`${item.at}|${item.speaker}|${item.text}`))].slice(-10000);
}

function mergeAttendance(current: MeetingAttendee[], incoming: MeetingAttendee[]) {
  const result = [...current];
  for (const next of incoming) {
    const index = result.findIndex((item) => (next.teamsUserId && item.teamsUserId === next.teamsUserId) || (next.email && item.email.toLowerCase() === next.email.toLowerCase()) || (!next.email && item.name.toLowerCase() === next.name.toLowerCase()));
    if (index < 0) result.push(next);
    else result[index] = { ...result[index], ...next, id: result[index].id, projectMemberId: result[index].projectMemberId || next.projectMemberId, organization: result[index].organization || next.organization, phone: result[index].phone || next.phone, createdAt: result[index].createdAt, updatedAt: new Date().toISOString() };
  }
  return result.slice(0, 1000);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Érvénytelen meeting-artifact figyelő kulcs." }, { status: 401 });
  const all = await listMeetingWorkspaces();
  const watchCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const candidates = all.filter((workspace) => {
    if (!workspace.sessionState.autoTranscriptWatch && !workspace.teamsTranscript.autoWatchEnabled) return false;
    const startedAt = new Date(workspace.sessionState.lastSafeCloseAt || workspace.updatedAt).getTime();
    return Number.isFinite(startedAt) && startedAt >= watchCutoff;
  }).slice(0, 30);
  const results: Array<{ meetingId: string; transcript: string; attendance: string; importedLines: number; importedAttendees: number; error?: string }> = [];

  for (const workspace of candidates) {
    let transcriptState = "skipped";
    let attendanceState = "skipped";
    let importedLines = 0;
    let importedAttendees = 0;
    let lastError = "";
    try {
      if (workspace.teamsTranscript.organizerUserId && workspace.teamsTranscript.graphOnlineMeetingId && workspace.teamsTranscript.status !== "available") {
        const transcript = await fetchTeamsTranscript(workspace);
        if (transcript.lines.length > 0) {
          const before = workspace.transcript.length;
          const nextTranscript = mergeTranscript(workspace.transcript, transcript.lines);
          importedLines = Math.max(0, nextTranscript.length - before);
          await updateMeetingWorkspace(workspace.meetingId, (current) => ({
            ...current,
            transcript: mergeTranscript(current.transcript, transcript.lines),
            teamsTranscript: { ...current.teamsTranscript, status: "available", lastSyncAt: new Date().toISOString(), lastError: "", transcriptIds: transcript.transcriptIds, importedLineCount: current.teamsTranscript.importedLineCount + importedLines, speakerAttribution: transcript.speakerAttribution },
          }));
          transcriptState = "imported";
        } else transcriptState = "not_found";
      }
    } catch (error) {
      const graphError = error instanceof GraphTranscriptError ? error : new GraphTranscriptError(error instanceof Error ? error.message : "A Teams átirat importja sikertelen.");
      const permission = ["Authorization_RequestDenied", "Forbidden", "ErrorAccessDenied", "GraphNotConfigured", "ApplicationAccessPolicyNotGranted"].includes(graphError.code);
      transcriptState = permission ? "permission_required" : "error";
      lastError = graphError.message;
      await updateMeetingWorkspace(workspace.meetingId, (current) => ({ ...current, teamsTranscript: { ...current.teamsTranscript, status: permission ? "permission_required" : "error", lastError: graphError.message.slice(0, 2000), lastSyncAt: new Date().toISOString() } }));
    }

    try {
      const latest = await readMeetingWorkspace(workspace.meetingId);
      if (latest.teamsTranscript.organizerUserId && latest.teamsTranscript.graphOnlineMeetingId && !latest.teamsAttendance.lastAttendanceSyncAt) {
        const attendance = await fetchTeamsAttendance(latest);
        if (attendance.attendees.length > 0) {
          importedAttendees = attendance.attendees.length;
          await updateMeetingWorkspace(workspace.meetingId, (current) => ({
            ...current,
            attendees: mergeAttendance(current.attendees, attendance.attendees),
            teamsAttendance: { ...current.teamsAttendance, status: "available", attendanceReportId: attendance.reportId, lastAttendanceSyncAt: new Date().toISOString(), lastError: "", importedAttendanceCount: attendance.attendees.length },
            teamsTranscript: current.teamsTranscript.status === "available" ? { ...current.teamsTranscript, autoWatchEnabled: false } : current.teamsTranscript,
            sessionState: current.teamsTranscript.status === "available" ? { ...current.sessionState, autoTranscriptWatch: false } : current.sessionState,
          }));
          attendanceState = "imported";
        } else attendanceState = "not_found";
      }
    } catch (error) {
      attendanceState = "error";
      lastError = lastError || (error instanceof Error ? error.message : "A jelenléti jelentés importja sikertelen.");
    }
    results.push({ meetingId: workspace.meetingId, transcript: transcriptState, attendance: attendanceState, importedLines, importedAttendees, error: lastError || undefined });
  }
  return NextResponse.json({ ok: true, checked: candidates.length, results, ranAt: new Date().toISOString() });
}
