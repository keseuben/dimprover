import { NextResponse } from "next/server";
import { getStorefrontTrackingStatus, StorefrontTrackingError } from "@/app/lib/aruter/storefrontTracking";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { trackingToken?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, code: "STOREFRONT_TRACKING_JSON_INVALID", error: "Érvénytelen JSON kérés." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const data = await getStorefrontTrackingStatus(body.trackingToken);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store, private, max-age=0" } });
  } catch (error) {
    if (error instanceof StorefrontTrackingError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[ARUTER_STOREFRONT_TRACKING]", { event: "STATUS_FAILED", code: error instanceof Error ? error.name : "UNKNOWN" });
    return NextResponse.json({ ok: false, code: "STOREFRONT_TRACKING_FAILED", error: "A rendelés állapota átmenetileg nem olvasható." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
