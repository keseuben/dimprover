import { NextRequest, NextResponse } from "next/server";
import {
  getMailProfilesSafeConfig,
  loadMailProfileTestHistory,
  saveMailProfileSettings,
  sendAllEnabledMailProfileTests,
  sendMailProfileTestEmail,
  type MailProfileId,
  type MailProfileSettingsInput,
} from "@/app/lib/license/mail-profiles";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedProfileIds: MailProfileId[] = ["system", "notifications", "drive", "noreply", "billing", "admin", "info"];

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság az e-mail beállítások API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

async function createPayload() {
  const [config, tests] = await Promise.all([
    getMailProfilesSafeConfig(),
    loadMailProfileTestHistory(40),
  ]);
  return { ...config, tests };
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();
  const payload = await createPayload();
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  let body: { action?: string; profileId?: MailProfileId; settings?: MailProfileSettingsInput } = {};
  try {
    body = await request.json() as { action?: string; profileId?: MailProfileId; settings?: MailProfileSettingsInput };
  } catch {
    body = {};
  }

  if (body.action === "saveSettings") {
    await saveMailProfileSettings(body.settings ?? {});
    const payload = await createPayload();
    return NextResponse.json({ ...payload, saved: true }, { headers: { "cache-control": "no-store" } });
  }

  if (body.action === "testAll") {
    const testResults = await sendAllEnabledMailProfileTests();
    const payload = await createPayload();
    return NextResponse.json({ ...payload, testResults }, { headers: { "cache-control": "no-store" } });
  }

  if (body.action === "testProfile") {
    const profileId = body.profileId;
    if (!profileId || !allowedProfileIds.includes(profileId)) {
      return NextResponse.json(
        { ok: false, error: "Ismeretlen e-mail profil." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const testResult = await sendMailProfileTestEmail(profileId);
    const payload = await createPayload();
    return NextResponse.json({ ...payload, testResult }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    { ok: false, error: "Ismeretlen e-mail beállítás művelet." },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}
