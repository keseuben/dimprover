import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { getDropSupabaseClient, writeDropEvent } from "@/app/lib/drop/dropRepository";
import { getDropPackageWorkflow, resolveDropPublicSession } from "@/app/lib/drop/public/dropPublicRepository";
import { DROP_PUBLIC_SESSION_COOKIE } from "@/app/lib/drop/public/dropPublicSession";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
type Context = { params: Promise<{ packageId: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    const { packageId } = await context.params;
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    const session = await resolveDropPublicSession(rawSession, request.headers);
    if (session.packageId !== packageId) return NextResponse.json({ ok: false, error: "A megjegyzés nem ehhez a küldeményhez tartozik.", code: "DROP_PUBLIC_PACKAGE_SESSION_MISMATCH" }, { status: 403, headers: dropNoStoreHeaders() });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const commentText = typeof body?.commentText === "string" ? body.commentText.trim().slice(0, 10_000) : "";
    const fileId = typeof body?.fileId === "string" && /^[0-9a-f-]{36}$/i.test(body.fileId) ? body.fileId : null;
    if (!commentText) return NextResponse.json({ ok: false, error: "A megjegyzés szövege kötelező.", code: "DROP_PUBLIC_COMMENT_REQUIRED" }, { status: 400, headers: dropNoStoreHeaders() });
    const workflow = await getDropPackageWorkflow(packageId);
    if (!workflow) return NextResponse.json({ ok: false, error: "A workflow nem található.", code: "DROP_PUBLIC_WORKFLOW_NOT_FOUND" }, { status: 404, headers: dropNoStoreHeaders() });
    if (fileId && workflow.workflowType === "submission_gate" && workflow.gateId) {
      const { getDropSubmissionGateById } = await import("@/app/lib/drop/public/dropPublicRepository");
      const gate = await getDropSubmissionGateById(workflow.gateId);
      if (!gate.allowFileComments) return NextResponse.json({ ok: false, error: "Ez a Beküldőkapu nem enged fájlonkénti megjegyzést.", code: "DROP_PUBLIC_FILE_COMMENT_DISABLED" }, { status: 403, headers: dropNoStoreHeaders() });
    }
    const client = getDropSupabaseClient();
    if (fileId) {
      const file = await client.from("drop_files").select("id").eq("id", fileId).eq("package_id", packageId).maybeSingle();
      if (file.error) throw file.error;
      if (!file.data) return NextResponse.json({ ok: false, error: "A fájl nem tartozik ehhez a küldeményhez.", code: "DROP_PUBLIC_FILE_NOT_FOUND" }, { status: 404, headers: dropNoStoreHeaders() });
    }
    const packageRow = await client.from("drop_packages").select("uploader_name,uploader_email").eq("id", packageId).single();
    if (packageRow.error) throw packageRow.error;
    const inserted = await client.from("drop_comments").insert({ package_id: packageId, file_id: fileId, parent_comment_id: null, author_recipient_id: null, author_user_id: "drop-public-sender", author_name: packageRow.data.uploader_name, author_email: packageRow.data.uploader_email, comment_text: commentText, status: "active" }).select("id,file_id,comment_text,created_at").single();
    if (inserted.error) throw inserted.error;
    await writeDropEvent({ packageId, fileId, eventType: "public.comment.created", actorName: packageRow.data.uploader_name, actorEmail: packageRow.data.uploader_email, payload: { workflowType: workflow.workflowType, scope: fileId ? "file" : "package" } });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", comment: inserted.data }, { status: 201, headers: dropNoStoreHeaders() });
  } catch (error) { return dropErrorResponse(error); }
}


export async function PUT(request: NextRequest, context: Context) {
  try {
    const { packageId } = await context.params;
    const rawSession = request.cookies.get(DROP_PUBLIC_SESSION_COOKIE)?.value?.trim() || "";
    const session = await resolveDropPublicSession(rawSession, request.headers, undefined, true);
    if (session.packageId !== packageId) {
      return NextResponse.json({ ok: false, error: "A megjegyzés nem ehhez a küldeményhez tartozik.", code: "DROP_PUBLIC_PACKAGE_SESSION_MISMATCH" }, { status: 403, headers: dropNoStoreHeaders() });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const commentText = typeof body?.commentText === "string" ? body.commentText.trim().slice(0, 10_000) : "";
    const fileId = typeof body?.fileId === "string" && /^[0-9a-f-]{36}$/i.test(body.fileId) ? body.fileId : null;
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "A fájlazonosító kötelező.", code: "DROP_PUBLIC_FILE_REQUIRED" }, { status: 400, headers: dropNoStoreHeaders() });
    }
    const workflow = await getDropPackageWorkflow(packageId);
    if (!workflow) return NextResponse.json({ ok: false, error: "A workflow nem található.", code: "DROP_PUBLIC_WORKFLOW_NOT_FOUND" }, { status: 404, headers: dropNoStoreHeaders() });
    if (workflow.workflowType === "submission_gate" && workflow.gateId) {
      const { getDropSubmissionGateById } = await import("@/app/lib/drop/public/dropPublicRepository");
      const gate = await getDropSubmissionGateById(workflow.gateId);
      if (!gate.allowFileComments) return NextResponse.json({ ok: false, error: "Ez a Beküldőkapu nem enged fájlonkénti megjegyzést.", code: "DROP_PUBLIC_FILE_COMMENT_DISABLED" }, { status: 403, headers: dropNoStoreHeaders() });
    }
    const client = getDropSupabaseClient();
    const file = await client.from("drop_files").select("id").eq("id", fileId).eq("package_id", packageId).maybeSingle();
    if (file.error) throw file.error;
    if (!file.data) return NextResponse.json({ ok: false, error: "A fájl nem tartozik ehhez a küldeményhez.", code: "DROP_PUBLIC_FILE_NOT_FOUND" }, { status: 404, headers: dropNoStoreHeaders() });
    const existing = await client.from("drop_comments")
      .select("id,comment_text,status,created_at")
      .eq("package_id", packageId)
      .eq("file_id", fileId)
      .eq("author_user_id", "drop-public-sender")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!commentText) {
      if (existing.data?.id) {
        const removed = await client.from("drop_comments").update({ status: "deleted" }).eq("id", existing.data.id);
        if (removed.error) throw removed.error;
        await writeDropEvent({ packageId, fileId, eventType: "public.comment.updated", payload: { scope: "file", action: "cleared" } });
      }
      return NextResponse.json({ ok: true, version: "DROP 1.2.13", comment: null }, { headers: dropNoStoreHeaders() });
    }
    const packageRow = await client.from("drop_packages").select("uploader_name,uploader_email").eq("id", packageId).single();
    if (packageRow.error) throw packageRow.error;
    let comment;
    if (existing.data?.id) {
      const updated = await client.from("drop_comments").update({ comment_text: commentText }).eq("id", existing.data.id).select("id,file_id,comment_text,created_at").single();
      if (updated.error) throw updated.error;
      comment = updated.data;
    } else {
      const inserted = await client.from("drop_comments").insert({ package_id: packageId, file_id: fileId, parent_comment_id: null, author_recipient_id: null, author_user_id: "drop-public-sender", author_name: packageRow.data.uploader_name, author_email: packageRow.data.uploader_email, comment_text: commentText, status: "active" }).select("id,file_id,comment_text,created_at").single();
      if (inserted.error) throw inserted.error;
      comment = inserted.data;
    }
    await writeDropEvent({ packageId, fileId, eventType: "public.comment.updated", actorName: packageRow.data.uploader_name, actorEmail: packageRow.data.uploader_email, payload: { workflowType: workflow.workflowType, scope: "file", textLength: commentText.length } });
    return NextResponse.json({ ok: true, version: "DROP 1.2.13", comment }, { headers: dropNoStoreHeaders() });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
