import { type NextRequest, NextResponse } from "next/server";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { assertDropFeatureEnabled } from "@/app/lib/drop/dropFeatureFlags";
import { requestDropSpaceRecovery } from "@/app/lib/drop/dropSpaceRecovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const genericMessage = "Ha a térkód és az e-mail-cím jogosult, a belépési linket elküldtük. A link 15 percig használható.";

export async function POST(request: NextRequest) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    await requestDropSpaceRecovery({ spaceCode: body?.spaceCode, email: body?.email });
  } catch (error) {
    console.error("DROP space recovery failed:", error instanceof Error ? error.message : "unknown error");
  }
  return NextResponse.json(
    { ok: true, version: "DROP 1.2.13", message: genericMessage },
    { status: 202, headers: dropNoStoreHeaders() },
  );
}
