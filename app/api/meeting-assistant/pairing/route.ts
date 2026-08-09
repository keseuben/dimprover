import { NextResponse } from "next/server";
import {
  createMeetingAccessToken,
  requestHasDimproSession,
  verifyMeetingAccessToken,
} from "@/app/lib/meeting-assistant/access";
import {
  consumeMeetingPairingCode,
  createMeetingPairingCode,
} from "@/app/lib/meeting-assistant/pairing";
import { sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PairingRequest = {
  operation?: "create" | "consume";
  meetingId?: string;
  pairingCode?: string;
  issuedTo?: string;
  issuerToken?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PairingRequest | null;
  if (!body?.operation) {
    return NextResponse.json({ ok: false, error: "Hiányzik a párosítási művelet." }, { status: 400 });
  }

  if (body.operation === "create") {
    const hasSession = await requestHasDimproSession();
    const issuerMeetingId = sanitizeMeetingId(body.meetingId);
    const issuerPayload = verifyMeetingAccessToken(body.issuerToken, issuerMeetingId);
    const hasProtectedWebIssuer = issuerPayload?.issuedTo === "dimpro-web-preview";

    if (!hasSession && !hasProtectedWebIssuer) {
      return NextResponse.json(
        { ok: false, error: "Csak bejelentkezett DIMPRO-szervező hozhat létre Teams-párosítókódot." },
        { status: 401 },
      );
    }

    const pairing = await createMeetingPairingCode("dimpro-web-organizer", issuerMeetingId);
    return NextResponse.json({ ok: true, ...pairing });
  }

  const meetingId = sanitizeMeetingId(body.meetingId);
  const consumed = await consumeMeetingPairingCode(body.pairingCode || "", meetingId, "teams-organizer-editor");
  if (!consumed.ok) {
    return NextResponse.json({ ok: false, error: consumed.error }, { status: 400 });
  }

  const workspaceMeetingId = sanitizeMeetingId(consumed.record.sourceMeetingId || meetingId);
  const organizerAccessToken = createMeetingAccessToken(workspaceMeetingId, "teams-organizer-editor");
  const participantAccessToken = createMeetingAccessToken(workspaceMeetingId, "teams-participant-readonly");
  return NextResponse.json({
    ok: true,
    meetingId,
    teamsMeetingId: meetingId,
    workspaceMeetingId,
    organizerAccessToken,
    participantAccessToken,
    accessToken: participantAccessToken,
    pairedAt: consumed.record.consumedAt,
    expiresInSeconds: Math.max(
      3600,
      Number(process.env.MEETING_ASSISTANT_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30),
    ),
  });
}
