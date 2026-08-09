import { NextResponse } from "next/server";
import { getServerPublicKeyBase64 } from "@/app/lib/license/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      algorithm: "Ed25519",
      serverPublicKeyBase64: await getServerPublicKeyBase64(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
