import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { renderAiDraftDocx, renderAiDraftHtml } from "@/app/lib/meeting-assistant/ai-draft-export";
import { createExportWorkspace, renderMeetingHtml } from "@/app/lib/meeting-assistant/export";
import { renderMeetingDocx } from "@/app/lib/meeting-assistant/docx-export";
import { readMeetingWorkspace, sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function safeFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120) || "dimpro-meeting";
}

function contentDisposition(fileName: string) {
  return `attachment; filename="${safeFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function renderPdf(html: string) {
  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    }));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const format = (url.searchParams.get("format") || "html").toLowerCase();
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const workspace = await readMeetingWorkspace(meetingId);
  const tokenScope = auth.mode === "token" ? String(auth.payload.issuedTo || "") : "";
  const canIncludePrivate = auth.mode === "session" || ["dimpro-web-preview", "dimpro-fajlmuhely-desktop", "teams-organizer-editor"].includes(tokenScope);
  const includePrivate = url.searchParams.get("includePrivate") === "1" && canIncludePrivate;
  const versionSuffix = workspace.closure.snapshotVersion > 0 ? `-v${workspace.closure.snapshotVersion}` : "";
  const baseName = `${safeFileName(workspace.minuteNumber || workspace.title || meetingId)}-${safeFileName(workspace.documentLabel)}${versionSuffix}`;

  if (format === "json") {
    const data = createExportWorkspace(workspace, includePrivate);
    return new NextResponse(`${JSON.stringify(data, null, 2)}\n`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition(`${baseName}.json`),
        "cache-control": "private, no-store",
      },
    });
  }

  if (format === "docx") {
    const docx = await renderMeetingDocx(workspace, includePrivate);
    return new NextResponse(docx, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": contentDisposition(`${baseName}.docx`),
        "cache-control": "private, no-store",
      },
    });
  }

  const html = renderMeetingHtml(workspace, includePrivate);
  if (format === "html") {
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": contentDisposition(`${baseName}.html`),
        "cache-control": "private, no-store",
      },
    });
  }

  if (format !== "pdf") {
    return NextResponse.json({ ok: false, error: "Támogatott exportformátumok: pdf, docx, html, json." }, { status: 400 });
  }

  try {
    const pdf = await renderPdf(html);
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(`${baseName}.pdf`),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? `A PDF export nem sikerült: ${error.message}` : "A PDF export nem sikerült." },
      { status: 500 },
    );
  }
}

type AiDraftExportRequest = {
  meetingId?: string;
  accessToken?: string;
  format?: "docx" | "pdf" | "html";
  draft?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AiDraftExportRequest | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body?.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAuthorized) {
    return NextResponse.json({ ok: false, error: "Az AI-dokumentumtervezetet csak a szervező exportálhatja." }, { status: 403 });
  }

  const workspace = await readMeetingWorkspace(meetingId);
  const draft = String(body?.draft || workspace.aiMinutesDraft || "").trim().slice(0, 80000);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Még nincs exportálható AI-dokumentumtervezet." }, { status: 400 });
  }

  const format = String(body?.format || "docx").toLowerCase();
  if (!["docx", "pdf", "html"].includes(format)) {
    return NextResponse.json({ ok: false, error: "Az AI-tervezet támogatott exportformátumai: docx, pdf, html." }, { status: 400 });
  }

  const baseName = `${safeFileName(workspace.minuteNumber || workspace.title || meetingId)}-${safeFileName(workspace.documentLabel)}-AI-tervezet`;

  if (format === "docx") {
    const docx = await renderAiDraftDocx(workspace, draft);
    return new NextResponse(docx, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": contentDisposition(`${baseName}.docx`),
        "cache-control": "private, no-store",
      },
    });
  }

  const html = renderAiDraftHtml(workspace, draft);
  if (format === "html") {
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": contentDisposition(`${baseName}.html`),
        "cache-control": "private, no-store",
      },
    });
  }

  try {
    const pdf = await renderPdf(html);
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(`${baseName}.pdf`),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? `Az AI-tervezet PDF exportja nem sikerült: ${error.message}` : "Az AI-tervezet PDF exportja nem sikerült." },
      { status: 500 },
    );
  }
}
