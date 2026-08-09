import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { getDropSupabaseClient, writeDropEvent } from "@/app/lib/drop/dropRepository";
import { invalidateDropFinalReport } from "@/app/lib/drop/report/dropReportRepository";
import {
  listVisibleDropSpacePackages,
  resolveDropSpaceSession,
} from "@/app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ packageId: string }> };

function apiError(message: string, code: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { code, status });
  return error;
}

async function resolveContext(packageId: string) {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(DROP_SPACE_SESSION_COOKIE)?.value || "";
  if (!rawSession) throw apiError("A Drop tér munkamenet hiányzik.", "DROP_SPACE_SESSION_REQUIRED", 401);
  const session = await resolveDropSpaceSession(rawSession);
  const packages = await listVisibleDropSpacePackages(session);
  const packageItem = packages.find((item) => item.id === packageId);
  if (!packageItem) throw apiError("A csomag nem található vagy nem látható.", "DROP_SPACE_PACKAGE_NOT_VISIBLE", 404);
  const canComment = Boolean(
    session.permissions.includes("comment.write")
      && (
        packageItem.isOwn
        || session.permissions.includes("package.read_all")
        || packageItem.visibility === "space_members"
        || packageItem.memberAccess?.canComment
      ),
  );
  return { session, packageItem, canComment };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    assertDropFeatureEnabled("commentsEnabled");
    const { packageId } = await context.params;
    const resolved = await resolveContext(packageId);
    const client = getDropSupabaseClient();
    const [commentsResult, filesResult] = await Promise.all([
      client
        .from("drop_comments")
        .select("id,package_id,file_id,parent_comment_id,author_name,author_email,comment_text,status,created_at,updated_at")
        .eq("package_id", packageId)
        .is("deleted_at", null)
        .in("status", ["active", "edited"])
        .order("created_at", { ascending: true })
        .limit(500),
      client
        .from("drop_files")
        .select("id,display_name,original_name,upload_status,security_status")
        .eq("package_id", packageId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (commentsResult.error) throw commentsResult.error;
    if (filesResult.error) throw filesResult.error;
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.11",
        comments: commentsResult.data || [],
        files: filesResult.data || [],
        canComment: resolved.canComment,
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    assertDropFeatureEnabled("commentsEnabled");
    const { packageId } = await context.params;
    const resolved = await resolveContext(packageId);
    if (!resolved.canComment) throw apiError("Ehhez a csomaghoz nincs megjegyzési jogosultság.", "DROP_COMMENT_FORBIDDEN", 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const commentText = typeof body?.commentText === "string" ? body.commentText.trim().slice(0, 10_000) : "";
    const fileId = typeof body?.fileId === "string" && body.fileId.trim() ? body.fileId.trim() : null;
    if (!commentText) throw apiError("A megjegyzés szövege kötelező.", "DROP_COMMENT_TEXT_REQUIRED", 400);

    const client = getDropSupabaseClient();
    if (fileId) {
      const { data: file, error: fileError } = await client
        .from("drop_files")
        .select("id")
        .eq("id", fileId)
        .eq("package_id", packageId)
        .is("deleted_at", null)
        .maybeSingle();
      if (fileError) throw fileError;
      if (!file) throw apiError("A kiválasztott fájl nem ehhez a csomaghoz tartozik.", "DROP_COMMENT_FILE_INVALID", 400);
    }

    await invalidateDropFinalReport(packageId, "Új megjegyzés miatt a végleges PDF-riportot újra kell készíteni.");
    const { data: comment, error: insertError } = await client
      .from("drop_comments")
      .insert({
        package_id: packageId,
        file_id: fileId,
        parent_comment_id: null,
        author_recipient_id: null,
        author_user_id: `drop-space-membership:${resolved.session.membership.id}`,
        author_name: resolved.session.membership.displayName,
        author_email: resolved.session.membership.email,
        comment_text: commentText,
        status: "active",
      })
      .select("id,package_id,file_id,parent_comment_id,author_name,author_email,comment_text,status,created_at,updated_at")
      .single();
    if (insertError || !comment) throw insertError || apiError("A megjegyzés nem menthető.", "DROP_COMMENT_SAVE_FAILED", 500);
    await writeDropEvent({
      packageId,
      fileId,
      eventType: "comment.created",
      actorName: resolved.session.membership.displayName,
      actorEmail: resolved.session.membership.email,
      payload: { commentId: comment.id, fileId, textLength: commentText.length },
    });
    return NextResponse.json(
      { ok: true, version: "DROP 1.2.11", comment },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
