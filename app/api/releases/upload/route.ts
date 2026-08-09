import { NextRequest, NextResponse } from "next/server";
import { registerReleasePackage } from "@/app/lib/downloads/releaseDownloads";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".zip", ".7z"]);

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a release feltöltő API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function jsonError(error: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function getFileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function parseChanges(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/\r?\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parseExpiresInDays(value: FormDataEntryValue | null) {
  const rawValue = String(value || "7").trim().toLowerCase();
  if (rawValue === "never") return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(parsed, 90));
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const formData = await request.formData();
  const rawFile = formData.get("file");

  if (!(rawFile instanceof File)) {
    return jsonError("Hiányzik a feltöltendő ZIP / 7Z fájl.");
  }

  const extension = getFileExtension(rawFile.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return jsonError("Csak .zip vagy .7z release csomag tölthető fel.");
  }

  if (rawFile.size <= 0) {
    return jsonError("A feltöltött fájl üres.");
  }

  if (rawFile.size > MAX_UPLOAD_BYTES) {
    return jsonError("A feltöltött fájl túl nagy. Jelenlegi limit: 150 MB.", 413);
  }

  const buffer = Buffer.from(await rawFile.arrayBuffer());
  const project = String(formData.get("project") || "DIMPRO_Fajlmuhely").trim() || "DIMPRO_Fajlmuhely";
  const version = String(formData.get("version") || "unversioned").trim() || "unversioned";
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const uploadedBy = String(formData.get("uploadedBy") || "admin-release-upload").trim() || "admin-release-upload";
  const changes = parseChanges(formData.get("changes"));
  const expiresInDays = parseExpiresInDays(formData.get("expiresInDays"));

  const result = await registerReleasePackage({
    buffer,
    fileName: rawFile.name,
    project,
    version,
    uploadedBy,
    expiresInDays,
    title,
    description,
    note,
    changes,
  });

  return NextResponse.json(
    {
      ok: true,
      release: {
        token: result.record.token,
        project: result.record.project,
        version: result.record.version,
        fileName: result.record.fileName,
        sizeBytes: result.record.sizeBytes,
        sha256: result.record.sha256,
        expiresAt: result.record.expiresAt,
        downloadPageUrl: result.downloadUrl,
        apiDownloadUrl: result.apiDownloadUrl,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
