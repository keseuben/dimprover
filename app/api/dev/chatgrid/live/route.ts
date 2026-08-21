import { NextRequest, NextResponse } from "next/server";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";
import { getDeveloperConsoleLiveStatus } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isChatGridDeviceAuthorized(request.headers))) {
    return NextResponse.json(
      { ok: false, error: "A BENJADMIN ChatGrid eszköz nincs párosítva vagy a hozzáférése vissza lett vonva." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    return NextResponse.json(
      { ok: true, live: await getDeveloperConsoleLiveStatus() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "A BENJADMIN élő ChatGrid állapot nem tölthető be." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
