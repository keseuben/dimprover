import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import {
  fetchTeamsTranscript,
  getGraphTranscriptConfig,
  GraphTranscriptError,
} from "@/app/lib/meeting-assistant/graph-transcript";
import {
  readMeetingWorkspace,
  sanitizeMeetingId,
  updateMeetingWorkspace,
} from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type TranscriptRequest = {
  meetingId?: string;
  operation?: "configure" | "sync";
  autoWatchEnabled?: boolean;
  organizerUserId?: string;
  graphOnlineMeetingId?: string;
  accessToken?: string;
};

function organizerAllowed(auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

function permissionStatus(code: string) {
  return [
    "GraphAccessToTranscriptsDisabled",
    "Authorization_RequestDenied",
    "Forbidden",
    "ErrorAccessDenied",
    "GraphNotConfigured",
  ].includes(code);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) {
    return NextResponse.json({ ok: false, error: "A Teams átirat kapcsolatát csak a szervező kezelheti." }, { status: 403 });
  }
  const workspace = await readMeetingWorkspace(meetingId);
  return NextResponse.json({
    ok: true,
    config: getGraphTranscriptConfig(),
    integration: workspace.teamsTranscript,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TranscriptRequest | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body?.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) {
    return NextResponse.json({ ok: false, error: "A Teams átiratot csak a szervező konfigurálhatja és szinkronizálhatja." }, { status: 403 });
  }

  if (body?.operation === "configure") {
    const organizerUserId = String(body.organizerUserId || "").trim().slice(0, 180);
    const graphOnlineMeetingId = String(body.graphOnlineMeetingId || "").trim().slice(0, 500);
    const workspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      teamsTranscript: {
        ...current.teamsTranscript,
        organizerUserId,
        graphOnlineMeetingId,
        status: organizerUserId && graphOnlineMeetingId ? "ready" : "not_configured",
        lastError: "",
        autoWatchEnabled: typeof body.autoWatchEnabled === "boolean" ? body.autoWatchEnabled : current.teamsTranscript.autoWatchEnabled,
      },
    }));
    return NextResponse.json({ ok: true, workspace, integration: workspace.teamsTranscript });
  }

  if (body?.operation !== "sync") {
    return NextResponse.json({ ok: false, error: "Ismeretlen átiratművelet." }, { status: 400 });
  }

  let workspace = await updateMeetingWorkspace(meetingId, (current) => ({
    ...current,
    teamsTranscript: {
      ...current.teamsTranscript,
      status: "syncing",
      lastError: "",
    },
  }));

  try {
    const result = await fetchTeamsTranscript(workspace);
    const existingIds = new Set(workspace.transcript.map((item) => item.id));
    const newLines = result.lines.filter((item) => !existingIds.has(item.id));
    workspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      transcript: [...current.transcript, ...newLines].slice(-5000),
      teamsTranscript: {
        ...current.teamsTranscript,
        status: result.transcriptIds.length > 0 ? "available" : "not_found",
        lastSyncAt: new Date().toISOString(),
        lastError: "",
        transcriptIds: result.transcriptIds,
        importedLineCount: result.lines.length,
        speakerAttribution: result.speakerAttribution,
      },
    }));
    return NextResponse.json({
      ok: true,
      workspace,
      integration: workspace.teamsTranscript,
      importedNow: newLines.length,
    });
  } catch (error) {
    const graphError = error instanceof GraphTranscriptError
      ? error
      : new GraphTranscriptError(error instanceof Error ? error.message : "A Teams átirat szinkronizálása sikertelen.");
    workspace = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      teamsTranscript: {
        ...current.teamsTranscript,
        status: permissionStatus(graphError.code) ? "permission_required" : "error",
        lastSyncAt: new Date().toISOString(),
        lastError: graphError.message.slice(0, 2000),
      },
    }));
    return NextResponse.json(
      {
        ok: false,
        error: graphError.message,
        code: graphError.code,
        integration: workspace.teamsTranscript,
      },
      { status: permissionStatus(graphError.code) ? 503 : 400 },
    );
  }
}
