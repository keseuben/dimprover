import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { createExportWorkspace } from "@/app/lib/meeting-assistant/export";
import { renderLiveMinutesText } from "@/app/lib/meeting-assistant/live-minutes";
import { deleteMeetingWorkspace, listMeetingArchive, readMeetingWorkspace, readMeetingWorkspaceIfExists, sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentMeetingId = sanitizeMeetingId(url.searchParams.get("currentMeetingId"));
  const selectedMeetingId = url.searchParams.get("selectedMeetingId");
  const auth = await authorizeMeetingRequest(request, currentMeetingId, url.searchParams.get("accessToken") || undefined);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  const current = await readMeetingWorkspace(currentMeetingId);

  if (selectedMeetingId) {
    const target = await readMeetingWorkspace(sanitizeMeetingId(selectedMeetingId));
    const sameProject = Boolean(current.projectId && target.projectId && current.projectId === target.projectId);
    if (auth.mode === "token" && target.meetingId !== current.meetingId && !sameProject) {
      return NextResponse.json({ ok: false, error: "A kiválasztott dokumentum nem az aktuális projekthez tartozik." }, { status: 403 });
    }
    if (!organizerAuthorized && target.status !== "published" && target.status !== "archived") {
      return NextResponse.json({ ok: false, error: "A dokumentum még nincs közzétéve." }, { status: 403 });
    }
    const workspace = organizerAuthorized ? target : createExportWorkspace(target, false);
    return NextResponse.json({
      ok: true,
      workspace,
      continuousText: renderLiveMinutesText(workspace, organizerAuthorized),
      accessRole: organizerAuthorized ? "organizer" : "participant",
    });
  }

  const archive = await listMeetingArchive();
  const rows = archive.filter((item) => {
    if (auth.mode === "token" && current.projectId) {
      if (item.projectId !== current.projectId) return false;
    }
    if (!organizerAuthorized && item.status !== "published" && item.status !== "archived") return false;
    return true;
  });
  return NextResponse.json({ ok: true, meetings: rows, accessRole: organizerAuthorized ? "organizer" : "participant" });
}


export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as null | {
    currentMeetingId?: string;
    selectedMeetingId?: string;
    accessToken?: string;
    confirmationTitle?: string;
    actorName?: string;
  };
  const currentMeetingId = sanitizeMeetingId(body?.currentMeetingId);
  const selectedMeetingId = sanitizeMeetingId(body?.selectedMeetingId);
  const auth = await authorizeMeetingRequest(request, currentMeetingId, body?.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) return NextResponse.json({ ok: false, error: "Az értekezletet csak a szervező törölheti." }, { status: 403 });
  if (["meeting-assistant-home", "demo-meeting"].includes(selectedMeetingId)) return NextResponse.json({ ok: false, error: "A rendszer munkaterülete nem törölhető." }, { status: 400 });
  const target = await readMeetingWorkspaceIfExists(selectedMeetingId);
  if (!target) return NextResponse.json({ ok: false, error: "Az értekezlet nem található vagy már törölték." }, { status: 404 });
  if (auth.mode === "token" && currentMeetingId !== "meeting-assistant-home") {
    const current = await readMeetingWorkspace(currentMeetingId);
    if (!current.projectId || current.projectId !== target.projectId) return NextResponse.json({ ok: false, error: "Csak az aktuális projekt értekezlete törölhető." }, { status: 403 });
  }
  if (String(body?.confirmationTitle || "").trim() !== target.title) return NextResponse.json({ ok: false, error: "A törlés megerősítéséhez pontosan írd be az értekezlet címét." }, { status: 400 });
  try {
    const deleted = await deleteMeetingWorkspace(selectedMeetingId, String(body?.actorName || target.organizerName || "Szervező").trim() || "Szervező");
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az értekezlet törlése sikertelen." }, { status: 400 });
  }
}
