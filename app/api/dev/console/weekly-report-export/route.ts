import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleWeeklySummary } from "@/app/lib/dev-center/developer-console";
import { renderWeeklyManagementReportHtml, safeWeeklyReportFileName, weeklyReportBaseName, weeklyReportJson } from "@/app/lib/dev-center/weekly-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const ascii = safeWeeklyReportFileName(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function renderPdf(html: string) {
  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" } }));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a heti vezetői riport exportjához." }, { status: 401, headers: { "cache-control": "no-store" } });
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
  const week = request.nextUrl.searchParams.get("week")?.trim() || null;
  const format = (request.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (!new Set(["pdf", "html", "json"]).has(format)) return NextResponse.json({ ok: false, error: "Támogatott formátumok: pdf, html, json." }, { status: 400, headers: { "cache-control": "no-store" } });

  try {
    const summary = await getDeveloperConsoleWeeklySummary(projectId, week);
    const baseName = weeklyReportBaseName(summary);
    const common = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-dimpro-production-access": "DENY" };
    if (format === "json") return new NextResponse(`${JSON.stringify(weeklyReportJson(summary), null, 2)}\n`, { headers: { ...common, "content-type": "application/json; charset=utf-8", "content-disposition": contentDisposition(`${baseName}.json`) } });
    const html = renderWeeklyManagementReportHtml(summary);
    if (format === "html") return new NextResponse(html, { headers: { ...common, "content-type": "text/html; charset=utf-8", "content-disposition": contentDisposition(`${baseName}.html`) } });
    const pdf = await renderPdf(html);
    return new NextResponse(new Uint8Array(pdf), { headers: { ...common, "content-type": "application/pdf", "content-disposition": contentDisposition(`${baseName}.pdf`) } });
  } catch {
    return NextResponse.json({ ok: false, error: "A heti vezetői riport exportja nem sikerült." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
