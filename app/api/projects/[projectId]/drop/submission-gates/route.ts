import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { getDropRuntimeHealth } from "@/app/lib/drop/dropRuntime";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  createDropSubmissionGate,
  getDropSubmissionGateById,
  listDropSubmissionGates,
  setDropSubmissionGateStatus,
} from "@/app/lib/drop/public/dropPublicRepository";
import { getDriveDocumentFlowHealth } from "@/app/lib/drive-core/documentFlowRepository";
import { getDriveObjectStorageHealth } from "@/app/lib/drive-core/storageService";
import { getDriveQuarantineReviewHealth } from "@/app/lib/drive-core/reviewService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

function publicUrl(slug: string) {
  const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
  return `${base}/bekuldes/${encodeURIComponent(slug)}`;
}

async function assertProjectIncomingGateReady(projectId: string) {
  assertDropFeatureEnabled("submissionGateEnabled");
  assertDropFeatureEnabled("driveIncomingEnabled");
  const [drop, flow, storage, review] = await Promise.all([
    getDropRuntimeHealth(),
    getDriveDocumentFlowHealth(),
    getDriveObjectStorageHealth(),
    getDriveQuarantineReviewHealth(projectId),
  ]);
  const blockers: string[] = [];
  if (!drop.readiness.submissionGate) blockers.push("DROP_SUBMISSION_GATE_NOT_READY");
  if (!drop.readiness.publicUpload) blockers.push("DROP_PUBLIC_UPLOAD_NOT_READY");
  if (!drop.readiness.virusScanner) blockers.push("DROP_VIRUS_SCANNER_NOT_READY");
  if (!drop.readiness.objectStorage) blockers.push("DROP_OBJECT_STORAGE_NOT_READY");
  if (!flow.ready) blockers.push("DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY");
  if (!storage.uploadReady) blockers.push("DRIVE_OBJECT_STORAGE_NOT_READY");
  if (!review.ready) blockers.push("DRIVE_REVIEW_NOT_READY");
  if (blockers.length) {
    const error = new Error("A projekt Beküldőkapu még nem aktiválható, mert a DROP → DRIVE fogadási lánc nem kész.");
    Object.assign(error, { code: "PROJECT_DROP_GATE_NOT_READY", status: 503, details: { blockers } });
    throw error;
  }
}

function serializeGate(gate: Awaited<ReturnType<typeof getDropSubmissionGateById>>) {
  return {
    id: gate.id,
    slug: gate.slug,
    type: gate.type,
    title: gate.title,
    description: gate.description,
    status: gate.status,
    recipients: gate.recipients,
    projectId: gate.projectId || null,
    projectName: gate.projectName || null,
    targetFolder: gate.targetFolder || null,
    retentionDays: gate.retentionDays,
    expiresAt: gate.expiresAt,
    createdBy: gate.createdBy,
    createdAt: gate.createdAt,
    updatedAt: gate.updatedAt,
    publicUrl: publicUrl(gate.slug),
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, code: access.code }, { status: access.status, headers: dropNoStoreHeaders() });
  try {
    const gates = (await listDropSubmissionGates())
      .filter((gate) => gate.type === "project" && gate.projectId === projectId)
      .map(serializeGate);
    return NextResponse.json({
      ok: true,
      version: "PROJECT_DROP_GATE 0.1.0",
      project: { id: access.access.project.id, code: access.access.project.code, name: access.access.project.name },
      gates,
    }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, code: access.code }, { status: access.status, headers: dropNoStoreHeaders() });
  try {
    await assertProjectIncomingGateReady(projectId);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Érvénytelen projekt Beküldőkapu kérés.", code: "PROJECT_DROP_GATE_INPUT_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    }
    const recipient = body.recipient && typeof body.recipient === "object" && !Array.isArray(body.recipient)
      ? body.recipient as Record<string, unknown>
      : null;
    if (!recipient) {
      return NextResponse.json({ ok: false, error: "A Beküldőkapu belső címzettje kötelező.", code: "PROJECT_DROP_GATE_RECIPIENT_REQUIRED" }, { status: 400, headers: dropNoStoreHeaders() });
    }

    const gate = await createDropSubmissionGate({
      type: "project",
      title: body.title,
      description: body.description,
      recipients: [recipient],
      projectId,
      projectName: access.access.project.name,
      targetFolder: "Beérkező Drop",
      retentionDays: body.retentionDays,
      expiresAt: body.expiresAt,
      allowPackageComment: body.allowPackageComment !== false,
      allowFileComments: body.allowFileComments !== false,
      downloadProtection: "link_pin",
    }, `${access.actor.displayName || access.actor.email || access.actor.userId} · Projektkapu`);

    return NextResponse.json({
      ok: true,
      version: "PROJECT_DROP_GATE 0.1.0",
      gate: serializeGate(gate),
      publicUrl: publicUrl(gate.slug),
    }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.write");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, code: access.code }, { status: access.status, headers: dropNoStoreHeaders() });
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const status = body?.status === "active" ? "active" : body?.status === "revoked" ? "revoked" : null;
    if (!id || !status) {
      return NextResponse.json({ ok: false, error: "A projektkapu-azonosító és az állapot kötelező.", code: "PROJECT_DROP_GATE_UPDATE_INVALID" }, { status: 400, headers: dropNoStoreHeaders() });
    }
    const current = await getDropSubmissionGateById(id);
    if (current.type !== "project" || current.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "A Beküldőkapu nem ehhez a projekthez tartozik.", code: "PROJECT_DROP_GATE_SCOPE_MISMATCH" }, { status: 404, headers: dropNoStoreHeaders() });
    }
    if (status === "active") await assertProjectIncomingGateReady(projectId);
    const gate = await setDropSubmissionGateStatus(id, status);
    return NextResponse.json({ ok: true, version: "PROJECT_DROP_GATE 0.1.0", gate: serializeGate(gate) }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
