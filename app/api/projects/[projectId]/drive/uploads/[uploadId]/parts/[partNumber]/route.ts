import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { confirmDriveMultipartUploadPart, signDriveMultipartUploadPart } from "@/app/lib/drive-core/store";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = { params: Promise<{ projectId: string; uploadId: string; partNumber: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePartNumber(value: string) {
  const partNumber = Number(value);
  return Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= 10_000 ? partNumber : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId, partNumber: rawPartNumber } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const partNumber = parsePartNumber(rawPartNumber);
  if (!partNumber) return NextResponse.json({ ok: false, error: "Érvénytelen multipart részazonosító." }, { status: 400 });
  try {
    const result = await signDriveMultipartUploadPart({
      projectId, uploadId, partNumber, actorUserId: access.actor.userId, access: access.access,
    });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId, uploadId, partNumber: rawPartNumber } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const partNumber = parsePartNumber(rawPartNumber);
  if (!partNumber) return NextResponse.json({ ok: false, error: "Érvénytelen multipart részazonosító." }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 }); }
  try {
    const result = await confirmDriveMultipartUploadPart({
      projectId, uploadId, partNumber, actorUserId: access.actor.userId, access: access.access, body,
    });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
