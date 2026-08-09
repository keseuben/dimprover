import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getReleaseByToken, registerDownloadedRelease } from "@/app/lib/downloads/releaseDownloads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await getReleaseByToken(token);

  if (!lookup.ok) return jsonError(lookup.message, lookup.status);

  const fileBuffer = await readFile(lookup.absolutePath);
  await registerDownloadedRelease(lookup.record.token);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(fileBuffer.length),
      "content-disposition": `attachment; filename="${encodeURIComponent(lookup.record.fileName)}"`,
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
      "x-dimpro-release-token": lookup.record.token,
      "x-dimpro-release-sha256": lookup.record.sha256,
    },
  });
}
