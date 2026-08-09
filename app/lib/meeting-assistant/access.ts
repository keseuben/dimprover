import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@/app/lib/supabase/server";
import { sanitizeMeetingId } from "./store";

export type MeetingAccessTokenPayload = {
  v?: number;
  meetingId?: string;
  issuedTo?: string;
  iat?: number;
  exp?: number;
  grantId?: string;
  subjectName?: string;
  subjectEmail?: string;
};

const TOKEN_TTL_SECONDS = Math.max(3600, Number(process.env.MEETING_ASSISTANT_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30));

function secret() {
  const value = process.env.MEETING_ASSISTANT_SIGNING_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("A MEETING_ASSISTANT_SIGNING_SECRET nincs megfelelően beállítva.");
  }
  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createMeetingAccessToken(
  meetingId: string,
  issuedTo: string,
  options?: { ttlSeconds?: number; grantId?: string; subjectName?: string; subjectEmail?: string },
) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(300, Math.min(30 * 24 * 3600, Number(options?.ttlSeconds || TOKEN_TTL_SECONDS)));
  const payload: MeetingAccessTokenPayload = {
    v: 1,
    meetingId: sanitizeMeetingId(meetingId),
    issuedTo: String(issuedTo || "teams-participant").slice(0, 200),
    iat: now,
    exp: now + ttlSeconds,
    grantId: String(options?.grantId || "").slice(0, 200),
    subjectName: String(options?.subjectName || "").slice(0, 160),
    subjectEmail: String(options?.subjectEmail || "").trim().toLowerCase().slice(0, 240),
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyMeetingAccessToken(token: string | null | undefined, meetingId: string) {
  if (!token) return null;
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MeetingAccessTokenPayload;
    if (payload.v !== 1) return null;
    if (sanitizeMeetingId(payload.meetingId) !== sanitizeMeetingId(meetingId)) return null;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function meetingTokenAllowsOrganizer(payload: { issuedTo?: string } | null | undefined) {
  return ["dimpro-web-preview", "dimpro-fajlmuhely-desktop", "teams-organizer-editor"].includes(String(payload?.issuedTo || ""));
}

export function meetingTokenIsParticipantOnly(payload: { issuedTo?: string } | null | undefined) {
  return ["dimpro-web-participant-preview", "teams-participant-readonly", "teams-meeting-participants", "teams-participant"].includes(String(payload?.issuedTo || ""));
}

export function meetingTokenIsEditor(payload: { issuedTo?: string; grantId?: string } | null | undefined) {
  return payload?.issuedTo === "teams-meeting-editor" && Boolean(payload.grantId);
}

export function meetingTokenIsPresentationController(payload: { issuedTo?: string; grantId?: string } | null | undefined) {
  return payload?.issuedTo === "teams-presentation-controller" && Boolean(payload.grantId);
}

export async function requestHasDimproSession() {
  try {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export async function authorizeMeetingRequest(request: Request, meetingId: string, explicitToken?: string | null) {
  const url = new URL(request.url);
  const token = explicitToken || request.headers.get("x-dimpro-meeting-token") || url.searchParams.get("accessToken");
  const payload = verifyMeetingAccessToken(token, meetingId);
  if (payload) return { ok: true as const, mode: "token" as const, payload };
  if (await requestHasDimproSession()) return { ok: true as const, mode: "session" as const };
  return { ok: false as const, error: "Nincs érvényes DIMPRO session vagy értekezleti hozzáférési token." };
}
