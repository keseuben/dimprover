import { NextResponse } from "next/server";
import {
  createMeetingAccessToken,
  requestHasDimproSession,
  verifyMeetingAccessToken,
} from "@/app/lib/meeting-assistant/access";
import { sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccessRequest = {
  meetingId?: string;
  issuedTo?: string;
  issuerToken?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AccessRequest | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const hasSession = await requestHasDimproSession();
  const issuerPayload = verifyMeetingAccessToken(body?.issuerToken, meetingId);
  const hasProtectedWebIssuer = issuerPayload?.issuedTo === "dimpro-web-preview";
  const adminKey = process.env.MEETING_ASSISTANT_ADMIN_KEY?.trim();
  const suppliedAdminKey = request.headers.get("x-dimpro-meeting-admin-key")?.trim();
  const hasAdminKey = Boolean(adminKey && suppliedAdminKey === adminKey);

  if (!hasSession && !hasProtectedWebIssuer && !hasAdminKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "A szervezői jogosultság nem igazolható. Frissítsd a DIMPRO Értekezleti Kísérő oldalt, majd próbáld újra.",
      },
      { status: 401 },
    );
  }

  const issuedTo = String(body?.issuedTo || "teams-meeting-participants").slice(0, 200);
  const accessToken = createMeetingAccessToken(meetingId, issuedTo);
  return NextResponse.json({
    ok: true,
    meetingId,
    accessToken,
    expiresInSeconds: Math.max(3600, Number(process.env.MEETING_ASSISTANT_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30)),
  });
}
