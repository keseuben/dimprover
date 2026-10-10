import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { authQuery } from "@/app/lib/dimpro-auth/db";
import { getAppSessionByToken } from "@/app/lib/dimpro-auth/repository";
import { validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const maxUpload = 4 * 1024 * 1024;

async function profileUser(request: NextRequest) {
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  const token = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
  return config && token ? getAppSessionByToken(token, config.clientId, true).catch(() => null) : null;
}

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStore });
}

export async function GET(request: NextRequest) {
  const session = await profileUser(request);
  if (!session) return fail("AUTH_REQUIRED", 401);
  try {
    const result = await authQuery<{image_data: Buffer; content_type: string; sha256: string}>(
      "SELECT image_data,content_type,sha256 FROM public.auth_read_profile_photo($1::uuid)",
      [session.user.id],
    );
    const row = result.rows[0];
    if (!row) return fail("PROFILE_PHOTO_NOT_FOUND", 404);
    return new NextResponse(new Uint8Array(row.image_data), {
      status: 200, headers: { ...noStore, "content-type": row.content_type, etag: `"${row.sha256}"` },
    });
  } catch {
    return fail("PROFILE_PHOTO_UNAVAILABLE", 503);
  }
}

export async function POST(request: NextRequest) {
  if (!validateSameOriginMutation(request.headers)) return fail("ORIGIN_DENIED", 403);
  const session = await profileUser(request);
  if (!session) return fail("AUTH_REQUIRED", 401);
  const sizeHeader = Number(request.headers.get("content-length") || 0);
  if (sizeHeader > maxUpload + 100_000) return fail("PROFILE_PHOTO_TOO_LARGE", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/jpeg","image/png","image/webp"].includes(file.type)) {
      return fail("PROFILE_PHOTO_FORMAT_INVALID", 400);
    }
    if (file.size === 0 || file.size > maxUpload) return fail("PROFILE_PHOTO_TOO_LARGE", 413);
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
    if (!metadata.width || !metadata.height || !["jpeg","png","webp"].includes(metadata.format)) {
      return fail("PROFILE_PHOTO_CONTENT_INVALID", 400);
    }
    const optimized = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate().resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 78, effort: 4 }).toBuffer();
    if (optimized.byteLength > 150_000) return fail("PROFILE_PHOTO_OPTIMIZED_TOO_LARGE", 413);
    const hash = createHash("sha256").update(optimized).digest("hex");
    await authQuery("SELECT public.auth_upsert_self_profile_photo($1::uuid,$2::bytea,$3::text)",
      [session.user.id, optimized, hash]);
    return NextResponse.json({ ok: true, sha256: hash }, { headers: noStore });
  } catch {
    return fail("PROFILE_PHOTO_SAVE_UNAVAILABLE", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateSameOriginMutation(request.headers)) return fail("ORIGIN_DENIED", 403);
  const session = await profileUser(request);
  if (!session) return fail("AUTH_REQUIRED", 401);
  try {
    await authQuery("SELECT public.auth_delete_self_profile_photo($1::uuid)", [session.user.id]);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return fail("PROFILE_PHOTO_DELETE_UNAVAILABLE", 503);
  }
}
