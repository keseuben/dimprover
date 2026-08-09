import { NextRequest, NextResponse } from "next/server";
import {
  getDevNotesAiMeta,
  runDevNotesAiAction,
} from "@/app/lib/license/dev-notes-ai";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a Fejlesztési Napló AI használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  const meta = await getDevNotesAiMeta();
  return jsonResponse({ ok: true, ...meta });
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    const body = (await request.json()) as {
      actionId?: string;
      note?: unknown;
    };

    if (!body.actionId) return jsonResponse({ ok: false, error: "Hiányzik az AI művelet azonosítója." }, 400);
    const result = await runDevNotesAiAction({ actionId: body.actionId, note: body.note ?? {} });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen Fejlesztési Napló AI hiba.",
        meta: await getDevNotesAiMeta().catch(() => undefined),
      },
      500,
    );
  }
}
