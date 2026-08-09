import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";
import { sendLicenseEmail } from "@/app/lib/license/email";
import { readLicenseStore, writeLicenseStore } from "@/app/lib/license/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a licenc e-mail küldéséhez.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const payload: unknown = await request.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.licenseId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Hiányzó licencazonosító." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const store = await readLicenseStore();
  const index = store.licenses.findIndex((license) => license.id === payload.licenseId);
  if (index === -1) {
    return NextResponse.json(
      { ok: false, error: "A licenc nem található." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const result = await sendLicenseEmail(store.licenses[index]);
  if (!result.ok) {
    return NextResponse.json(result, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  store.licenses[index] = {
    ...store.licenses[index],
    licenseEmailSentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeLicenseStore(store);

  return NextResponse.json(
    {
      ok: true,
      licenseEmailSentAt: store.licenses[index].licenseEmailSentAt,
      recipients: "recipients" in result ? result.recipients : [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
