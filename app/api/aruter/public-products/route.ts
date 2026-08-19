import { NextResponse } from "next/server";
import { getStorefrontPilotCatalog } from "@/app/lib/aruter/storefrontPilot";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessSlug = searchParams.get("businessSlug")?.trim() || "";
  if (!businessSlug) {
    return NextResponse.json({ ok: false, error: "Hiányzik az üzlet azonosítója." }, { status: 400 });
  }
  const catalog = await getStorefrontPilotCatalog(businessSlug);
  return NextResponse.json({ ok: true, data: catalog });
}
