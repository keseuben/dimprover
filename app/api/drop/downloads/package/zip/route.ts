import { Readable as NodeReadable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { issueDropPackageZipDownload } from "@/app/lib/drop/download/dropDownloadService";
import type { DropReportImagesPerPage } from "@/app/lib/drop/report/dropFinalReportRenderer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

const ALLOWED_HOSTS = new Set(["drop.dimpro.hu", "www.drop.dimpro.hu", "localhost", "127.0.0.1"]);
const ZIP_READY_COOKIE = "dimpro_drop_zip_ready";

function requestHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("host") || "").replace(/:\d+$/, "").toLocaleLowerCase("en-US");
}

function hidden() {
  return NextResponse.json(
    { ok: false, error: "Az útvonal nem található.", code: "DROP_ROUTE_NOT_FOUND" },
    { status: 404, headers: dropNoStoreHeaders() },
  );
}

function safeContentDisposition(filename: string) {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_").slice(0, 160) || "dimpro-drop-csomag.zip";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function cleanRequestId(value: unknown) {
  const requestId = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9_-]{8,80}$/i.test(requestId) ? requestId : "";
}

function readyCookie(requestId: string) {
  return `${ZIP_READY_COOKIE}=${encodeURIComponent(requestId)}; Max-Age=120; Path=/; Secure; SameSite=Strict`;
}

export async function POST(request: NextRequest) {
  if (!ALLOWED_HOSTS.has(requestHost(request))) return hidden();
  try {
    const contentType = request.headers.get("content-type") || "";
    let rawToken = "";
    let requestId = "";
    let brandPrefix = false;
    let includePdf = false;
    let includeTxt = true;
    let pdfImagesPerPage: DropReportImagesPerPage = 1;
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      rawToken = String(body?.token || "").trim();
      requestId = cleanRequestId(body?.requestId);
      brandPrefix = body?.brandPrefix === true || body?.brandPrefix === "true" || body?.brandPrefix === "1";
      includePdf = body?.includePdf === true || body?.includePdf === "true" || body?.includePdf === "1";
      includeTxt = body?.includeTxt !== false && body?.includeTxt !== "false" && body?.includeTxt !== "0";
      const layout = Number(body?.pdfImagesPerPage);
      pdfImagesPerPage = layout === 2 || layout === 4 || layout === 6 ? layout : 1;
    } else {
      const form = await request.formData();
      rawToken = String(form.get("token") || "").trim();
      requestId = cleanRequestId(form.get("requestId"));
      const brandValue = String(form.get("brandPrefix") || "").toLowerCase();
      brandPrefix = brandValue === "true" || brandValue === "1" || brandValue === "on";
      const pdfValue = String(form.get("includePdf") || "").toLowerCase();
      const txtValue = String(form.get("includeTxt") ?? "true").toLowerCase();
      includePdf = pdfValue === "true" || pdfValue === "1" || pdfValue === "on";
      includeTxt = txtValue !== "false" && txtValue !== "0" && txtValue !== "off";
      const layout = Number(form.get("pdfImagesPerPage"));
      pdfImagesPerPage = layout === 2 || layout === 4 || layout === 6 ? layout : 1;
    }
    if (!rawToken || rawToken.length > 180) {
      return NextResponse.json(
        { ok: false, error: "Hiányzó vagy hibás letöltési token.", code: "DROP_INVALID_TOKEN_INPUT" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const prepared = await issueDropPackageZipDownload({ rawToken, headers: request.headers, brandPrefix, includePdf, includeTxt, pdfImagesPerPage });
    const headers: Record<string, string> = {
      "content-type": "application/zip",
      "content-disposition": safeContentDisposition(prepared.filename),
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
      expires: "0",
      "x-content-type-options": "nosniff",
      "x-dimpro-drop-version": "DROP 1.2.13",
      "x-dimpro-drop-file-count": String(prepared.fileCount),
      "x-dimpro-drop-source-bytes": String(prepared.totalBytes),
      "x-dimpro-drop-persistent-archive": "false",
      "x-dimpro-drop-zip-stage": "streaming",
    };
    if (requestId) headers["set-cookie"] = readyCookie(requestId);
    return new Response(NodeReadable.toWeb(prepared.stream as NodeReadable) as ReadableStream<Uint8Array>, {
      status: 200,
      headers,
    });
  } catch (error) {
    return dropErrorResponse(error);
  }
}
