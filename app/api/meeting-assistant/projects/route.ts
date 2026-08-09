import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { listDriveProjects } from "@/app/lib/drive/driveApi";
import { listDeletedMeetingProjectIds } from "@/app/lib/meeting-assistant/project-store";
import { sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return NextResponse.json({ ok: false, error: "A projektkapcsolatot csak a szervező kezelheti." }, { status: 403 });
  }
  const [projects, deletedProjectIds] = await Promise.all([listDriveProjects(), listDeletedMeetingProjectIds()]);
  const deleted = new Set(deletedProjectIds);
  return NextResponse.json({ ok: true, projects: projects.filter((project) => !deleted.has(project.id)) });
}
