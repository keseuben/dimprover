import { NextRequest, NextResponse } from "next/server";
import {
  createReleaseRecord,
  getReleaseCenterResponse,
  getReleaseCenterStorageFile,
  getReleaseOptions,
  setReleaseStatus,
  toggleReleaseChecklistItem,
  updateReleaseRecord,
  type ReleaseDraft,
  type ReleaseStatus,
} from "@/app/lib/license/release-center";
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
      error: "Nincs jogosultság a Release Központ API használatához.",
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

async function buildResponse() {
  const response = await getReleaseCenterResponse();
  return {
    ...response,
    options: getReleaseOptions(),
    storage: {
      file: getReleaseCenterStorageFile(),
    },
  };
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  return jsonResponse(await buildResponse());
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  try {
    const body = (await request.json()) as {
      action?: string;
      releaseId?: string;
      draft?: ReleaseDraft;
      status?: ReleaseStatus;
      itemId?: string;
      checked?: boolean;
      note?: string;
    };

    const action = body.action ?? "";
    const releaseId = body.releaseId ?? "";
    let result;

    if (action === "create") {
      result = await createReleaseRecord(body.draft ?? {});
    } else if (action === "update") {
      if (!releaseId) return jsonResponse({ ok: false, error: "Hiányzik a release azonosítója." }, 400);
      result = await updateReleaseRecord(releaseId, body.draft ?? {});
    } else if (action === "setStatus") {
      if (!releaseId) return jsonResponse({ ok: false, error: "Hiányzik a release azonosítója." }, 400);
      if (!body.status) return jsonResponse({ ok: false, error: "Hiányzik az új release státusz." }, 400);
      result = await setReleaseStatus(releaseId, body.status);
    } else if (action === "toggleChecklist") {
      if (!releaseId) return jsonResponse({ ok: false, error: "Hiányzik a release azonosítója." }, 400);
      if (!body.itemId) return jsonResponse({ ok: false, error: "Hiányzik a checklist elem azonosítója." }, 400);
      result = await toggleReleaseChecklistItem(releaseId, body.itemId, Boolean(body.checked), body.note ?? "");
    } else {
      return jsonResponse({ ok: false, error: "Ismeretlen Release Központ művelet." }, 400);
    }

    const response = await buildResponse();
    return jsonResponse({ ...response, affectedRelease: result.release });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen Release Központ hiba.",
      },
      500,
    );
  }
}
