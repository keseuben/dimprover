import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import { linkPersonalDriveProject, listPersonalDriveProjectLinks, unlinkPersonalDriveProject } from "@/app/lib/content-core/personalProjectLinks";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { listAccessibleProjects } from "@/app/lib/project-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function projectRecord(project: Awaited<ReturnType<typeof listAccessibleProjects>>[number]) {
  return {
    id: project.id,
    code: project.code || "",
    name: project.name,
    status: project.status,
    access: project.membership.role,
  };
}

async function context(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access;
  const projects = await listAccessibleProjects(access.actor.userAliases);
  return { ...access, projects };
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof DimproIdentityError ? error.status : 500;
  const code = error instanceof DimproIdentityError ? error.code : fallback;
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : fallback, code }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const access = await context(request);
    if (!access.ok) return access.response;
    const links = await listPersonalDriveProjectLinks(access.contentUserId);
    const linkedIds = new Set(links.map((link) => link.projectId));
    const linkedProjects = access.projects.filter((project) => linkedIds.has(project.id)).map(projectRecord);
    const availableProjects = access.projects.filter((project) => !linkedIds.has(project.id)).map(projectRecord);
    return NextResponse.json({ ok: true, linkedProjects, availableProjects }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "PERSONAL_PROJECT_LINK_LIST_FAILED");
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await context(request);
    if (!access.ok) return access.response;
    const body = await request.json().catch(() => ({})) as { projectId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const project = access.projects.find((candidate) => candidate.id === projectId);
    if (!project) return NextResponse.json({ ok: false, error: "A projekt nem elérhető vagy nincs hozzá jogosultságod.", code: "PERSONAL_PROJECT_LINK_PROJECT_FORBIDDEN" }, { status: 403, headers: { "cache-control": "no-store" } });
    const result = await linkPersonalDriveProject({ userId: access.contentUserId, projectId, actorUserId: access.actor.userId });
    return NextResponse.json({ ok: true, created: result.created, project: projectRecord(project) }, { status: result.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "PERSONAL_PROJECT_LINK_CREATE_FAILED");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await resolvePersonalDriveContentActor(request);
    if (!access.ok) return access.response;
    const body = await request.json().catch(() => ({})) as { projectId?: unknown };
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) return NextResponse.json({ ok: false, error: "A leválasztandó projekt azonosítója hiányzik.", code: "PERSONAL_PROJECT_LINK_PROJECT_REQUIRED" }, { status: 400, headers: { "cache-control": "no-store" } });
    const result = await unlinkPersonalDriveProject({ userId: access.contentUserId, projectId });
    return NextResponse.json({ ok: true, removed: result.removed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "PERSONAL_PROJECT_LINK_REMOVE_FAILED");
  }
}
