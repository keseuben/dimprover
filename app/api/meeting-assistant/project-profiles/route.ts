import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import {
  deleteMeetingProjectProfile,
  listMeetingProjectProfiles,
  readMeetingProjectProfile,
  removeMeetingProjectMember,
  upsertMeetingProjectMember,
  upsertMeetingProjectProfile,
} from "@/app/lib/meeting-assistant/project-store";
import { deleteProjectMeetingWorkspaces, sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";
import { listDriveProjects } from "@/app/lib/drive/driveApi";
import type { MeetingProjectMember, MeetingProjectProfile } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectProfileRequest = {
  meetingId?: string;
  accessToken?: string;
  action?: "upsert_project" | "upsert_member" | "remove_member" | "delete_project";
  project?: Partial<MeetingProjectProfile>;
  member?: Partial<MeetingProjectMember>;
  projectId?: string;
  memberId?: string;
  projectName?: string;
  confirmationName?: string;
  actorName?: string;
};

async function authorizeOrganizer(request: Request, meetingId: string, accessToken?: string) {
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: 401 }) };
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "A projektadatlapot csak a szervező kezelheti." }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const accessToken = url.searchParams.get("accessToken") || undefined;
  const auth = await authorizeOrganizer(request, meetingId, accessToken);
  if (!auth.ok) return auth.response;
  const profiles = await listMeetingProjectProfiles();
  return NextResponse.json({ ok: true, profiles });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ProjectProfileRequest | null;
  if (!body?.action) return NextResponse.json({ ok: false, error: "Hiányzik a projektművelet." }, { status: 400 });
  const meetingId = sanitizeMeetingId(body.meetingId);
  const auth = await authorizeOrganizer(request, meetingId, body.accessToken);
  if (!auth.ok) return auth.response;

  try {
    if (body.action === "upsert_project") {
      const profile = await upsertMeetingProjectProfile(body.project || {});
      return NextResponse.json({ ok: true, profile });
    }
    if (body.action === "upsert_member") {
      const projectId = String(body.projectId || "").trim();
      if (!projectId) throw new Error("Hiányzik a projektazonosító.");
      const profile = await upsertMeetingProjectMember(projectId, body.member || {});
      return NextResponse.json({ ok: true, profile });
    }
    if (body.action === "remove_member") {
      const projectId = String(body.projectId || "").trim();
      const memberId = String(body.memberId || "").trim();
      if (!projectId || !memberId) throw new Error("Hiányzik a projekt vagy a tag azonosítója.");
      const profile = await removeMeetingProjectMember(projectId, memberId);
      return NextResponse.json({ ok: true, profile });
    }
    if (body.action === "delete_project") {
      const projectId = String(body.projectId || "").trim();
      if (!projectId) throw new Error("Hiányzik a projektazonosító.");
      const profile = await readMeetingProjectProfile(projectId);
      const driveProject = profile ? null : (await listDriveProjects()).find((item) => item.id === projectId);
      const projectName = profile?.name || driveProject?.name || String(body.projectName || "").trim();
      if (!projectName) throw new Error("A projekt nem található vagy már törölték.");
      if (String(body.confirmationName || "").trim() !== projectName) throw new Error("A törlés megerősítéséhez pontosan írd be a projekt nevét.");
      const deletedMeetings = await deleteProjectMeetingWorkspaces(projectId, String(body.actorName || "Szervező").trim() || "Szervező");
      await deleteMeetingProjectProfile(projectId);
      return NextResponse.json({ ok: true, projectId, projectName, deletedMeetingCount: deletedMeetings.length });
    }
    return NextResponse.json({ ok: false, error: "Ismeretlen projektművelet." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A projektművelet sikertelen." }, { status: 400 });
  }
}
