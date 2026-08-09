import { type NextRequest, NextResponse } from "next/server";
import { resolveDropSpaceSession } from "@/app/lib/drop/dropSpaceRepository";
import {
  createDropSpaceSessionToken,
  DROP_SPACE_SESSION_COOKIE,
} from "@/app/lib/drop/dropSpaceSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const failureUrl = new URL("/open", request.url);
  failureUrl.searchParams.set("spaceRecovery", "invalid");
  if (!token) return NextResponse.redirect(failureUrl, 303);

  try {
    const recovered = await resolveDropSpaceSession(token);
    const sessionExpiresAt = new Date(
      Math.min(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
        new Date(recovered.effectiveAccessEndsAt).getTime(),
      ),
    ).toISOString();
    const sessionToken = createDropSpaceSessionToken({
      membershipId: recovered.membership.id,
      spaceId: recovered.space.id,
      email: recovered.membership.email,
      acceptedAt: recovered.membership.acceptedAt!,
      expiresAt: sessionExpiresAt,
    });
    const redirectUrl = new URL(`/space/${encodeURIComponent(recovered.space.publicCode)}`, request.url);
    const response = NextResponse.redirect(redirectUrl, 303);
    response.cookies.set(DROP_SPACE_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(1, Math.floor((new Date(sessionExpiresAt).getTime() - Date.now()) / 1000)),
      priority: "high",
    });
    return response;
  } catch {
    return NextResponse.redirect(failureUrl, 303);
  }
}
