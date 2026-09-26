import { type NextRequest, NextResponse } from "next/server";
import { driveCoreErrorResponse } from "@/app/lib/drive-core/api";
import { issueDriveDocumentVersion } from "@/app/lib/drive-core/documentFlowRepository";
import { createDriveIssueAccessLinks } from "@/app/lib/drive-core/issueAccess";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

type RouteContext = {
  params: Promise<{ projectId: string; documentId: string; versionId: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RecipientInput = {
  type?: unknown;
  userId?: unknown;
  email?: unknown;
  name?: unknown;
  organization?: unknown;
};

type NormalizedRecipient = {
  type: "PROJECT_MEMBER" | "EMAIL";
  userId: string | null;
  email: string | null;
  name: string;
  organization: string;
};

function normalizeRecipients(value: unknown): NormalizedRecipient[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as RecipientInput;
    const type: NormalizedRecipient["type"] | null = row.type === "PROJECT_MEMBER" ? "PROJECT_MEMBER" : row.type === "EMAIL" ? "EMAIL" : null;
    if (!type) return [];
    return [{
      type,
      userId: typeof row.userId === "string" ? row.userId.trim().slice(0, 240) : null,
      email: typeof row.email === "string" ? row.email.trim().toLowerCase().slice(0, 320) : null,
      name: typeof row.name === "string" ? row.name.trim().slice(0, 240) : "",
      organization: typeof row.organization === "string" ? row.organization.trim().slice(0, 240) : "",
    }];
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, documentId, versionId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Érvénytelen JSON kérés." }, { status: 400 });
  }

  try {
    const result = await issueDriveDocumentVersion({
      projectId,
      documentId,
      versionId,
      purpose: typeof body.purpose === "string" ? body.purpose : "",
      note: typeof body.note === "string" ? body.note : "",
      recipients: normalizeRecipients(body.recipients),
      actorUserId: access.actor.userId,
    });
    let accessLinks: Awaited<ReturnType<typeof createDriveIssueAccessLinks>>["links"] = [];
    let accessExpiresAt: string | null = null;
    let accessLinkError: string | null = null;
    try {
      const accessResult = await createDriveIssueAccessLinks({
        projectId,
        issueId: result.issue.id,
        origin: request.nextUrl.origin,
      });
      accessLinks = accessResult.links;
      accessExpiresAt = accessResult.expiresAt;
    } catch (accessError) {
      accessLinkError = accessError instanceof Error
        ? accessError.message
        : "A kiadás sikeres, de a címzetti letöltési linkek nem készültek el.";
    }
    return NextResponse.json({
      ok: true,
      ...result,
      accessLinks,
      accessExpiresAt,
      accessLinkError,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return driveCoreErrorResponse(error);
  }
}
