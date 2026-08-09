import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { createExportWorkspace, renderMeetingHtml } from "@/app/lib/meeting-assistant/export";
import { renderMeetingDocx } from "@/app/lib/meeting-assistant/docx-export";
import { readMeetingWorkspace, sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 140) || "dimpro-meeting";
}

function contentDisposition(fileName: string) {
  return `attachment; filename="${safeFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentMeetingId = sanitizeMeetingId(url.searchParams.get("currentMeetingId"));
  const targetMeetingId = sanitizeMeetingId(url.searchParams.get("targetMeetingId"));
  const format = (url.searchParams.get("format") || "pdf").toLowerCase();
  const auth = await authorizeMeetingRequest(request, currentMeetingId, url.searchParams.get("accessToken") || undefined);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  const current = await readMeetingWorkspace(currentMeetingId);
  const target = await readMeetingWorkspace(targetMeetingId);
  const sameProject = Boolean(current.projectId && target.projectId && current.projectId === target.projectId);
  if (auth.mode === "token" && target.meetingId !== current.meetingId && !sameProject) {
    return NextResponse.json({ ok: false, error: "A dokumentum nem az aktuális projekthez tartozik." }, { status: 403 });
  }
  if (!organizerAuthorized && target.status !== "published" && target.status !== "archived") {
    return NextResponse.json({ ok: false, error: "A dokumentum még nincs közzétéve." }, { status: 403 });
  }
  const includePrivate = organizerAuthorized && url.searchParams.get("includePrivate") === "1";
  const baseName = `${safeFileName(target.minuteNumber || target.title)}-${safeFileName(target.documentLabel)}`;

  if (format === "json") {
    const data = createExportWorkspace(target, includePrivate);
    return new NextResponse(`${JSON.stringify(data, null, 2)}\n`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition(`${baseName}.json`),
        "cache-control": "private, no-store",
      },
    });
  }
  if (format === "docx") {
    const docx = await renderMeetingDocx(target, includePrivate);
    return new NextResponse(docx, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": contentDisposition(`${baseName}.docx`),
        "cache-control": "private, no-store",
      },
    });
  }
  const html = renderMeetingHtml(target, includePrivate);
  if (format === "html") {
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": contentDisposition(`${baseName}.html`),
        "cache-control": "private, no-store",
      },
    });
  }
  if (format !== "pdf") return NextResponse.json({ ok: false, error: "Támogatott formátumok: pdf, docx, html, json." }, { status: 400 });

  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" } });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(`${baseName}.pdf`),
        "cache-control": "private, no-store",
      },
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
