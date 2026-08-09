import { type NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { projectCoreErrorResponse } from "@/app/lib/project-core/api";
import { createProject, listAccessibleProjects } from "@/app/lib/project-core/store";

export async function GET(request: NextRequest) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }
  try {
    const projects = await listAccessibleProjects(authResult.actor.userAliases);
    return NextResponse.json({ ok: true, projects });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await resolveProjectCoreAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ ok: false, error: authResult.error }, { status: authResult.status });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    const result = await createProject(input, {
      userId: authResult.actor.userId,
      displayName: authResult.actor.displayName,
    });
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return projectCoreErrorResponse(error);
  }
}
