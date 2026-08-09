import { type NextRequest, NextResponse } from "next/server";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  buildDropEmailValidationPreview,
  DROP_EMAIL_VALIDATION_CLIENTS,
  getDropEmailValidationSafety,
  listDropEmailValidationHistory,
  reviewDropEmailValidation,
  sendDropEmailValidationTest,
} from "@/app/lib/drop/validation/dropEmailClientValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: dropNoStoreHeaders() });
}

function unauthorized() {
  return response({ ok: false, error: "Nincs jogosultság a Drop e-mail kliensvalidációhoz.", code: "DROP_EMAIL_VALIDATION_UNAUTHORIZED" }, 401);
}

function errorResponse(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "DROP_EMAIL_VALIDATION_FAILED") : "DROP_EMAIL_VALIDATION_FAILED";
  const message = error instanceof Error ? error.message : "Az e-mail kliensvalidációs művelet sikertelen.";
  const status = code.endsWith("NOT_FOUND") ? 404 : code.includes("RATE_LIMIT") || code.includes("DAILY_LIMIT") ? 429 : code.includes("SEND_FAILED") ? 502 : 400;
  return response({ ok: false, error: message, code }, status);
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const clientId = request.nextUrl.searchParams.get("client") || "gmail_web";
    const [preview, history] = await Promise.all([
      buildDropEmailValidationPreview(clientId as never),
      listDropEmailValidationHistory(50),
    ]);
    return response({
      ok: true,
      version: "DROP 1.2.11",
      clients: DROP_EMAIL_VALIDATION_CLIENTS,
      preview: {
        subject: preview.subject,
        browserHtml: preview.browserHtml,
        files: preview.files,
        previewCount: preview.previewCount,
        previewBytes: preview.previewBytes,
        client: preview.client,
      },
      history,
      safety: getDropEmailValidationSafety(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return response({ ok: false, error: "Érvénytelen tesztküldési kérés.", code: "DROP_EMAIL_VALIDATION_INPUT_INVALID" }, 400);
    const record = await sendDropEmailValidationTest({
      recipientEmail: body.recipientEmail,
      clientId: body.clientId,
      notes: body.notes,
      confirmation: body.confirmation,
    });
    return response({ ok: true, version: "DROP 1.2.11", record, message: "A DIMPRO Drop kliensvalidációs tesztlevele elküldve." }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return response({ ok: false, error: "Érvénytelen validációs értékelés.", code: "DROP_EMAIL_VALIDATION_REVIEW_INVALID" }, 400);
    const record = await reviewDropEmailValidation({
      id: body.id,
      reviewStatus: body.reviewStatus,
      reviewNotes: body.reviewNotes,
    });
    return response({ ok: true, version: "DROP 1.2.11", record });
  } catch (error) {
    return errorResponse(error);
  }
}
