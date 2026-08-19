import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleWeeklyPortfolio } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a heti fejlesztési portfólióhoz." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const week = request.nextUrl.searchParams.get("week")?.trim() || null;
    const portfolio = await getDeveloperConsoleWeeklyPortfolio(week);
    return NextResponse.json({ ok: true, portfolio }, { headers: { "cache-control": "private, no-store", "x-dimpro-production-access": "DENY" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A heti fejlesztési portfólió nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
