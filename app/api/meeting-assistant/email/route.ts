import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { meetingEmailStatus, sendMeetingSummaryEmail } from "@/app/lib/meeting-assistant/email";
import { readMeetingWorkspace, sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function organizerAuth(request: Request, meetingId: string, accessToken?: string) {
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: 401 }) };
  const allowed = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!allowed) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Az e-mail küldéshez szervezői jogosultság szükséges." }, { status: 403 }) };
  return { ok: true as const };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await organizerAuth(request, meetingId, url.searchParams.get("accessToken") || undefined);
  if (!auth.ok) return auth.response;
  const workspace = await readMeetingWorkspace(meetingId);
  return NextResponse.json({
    ok: true,
    status: await meetingEmailStatus(),
    suggestedRecipients: workspace.attendees.map((item) => item.email).filter(Boolean),
    emailLog: workspace.emailLog.slice(-50).reverse(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | {
    meetingId?: string;
    accessToken?: string;
    recipients?: string[];
    subject?: string;
    sentBy?: string;
    includePdf?: boolean;
    includeDocx?: boolean;
  };
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const auth = await organizerAuth(request, meetingId, body?.accessToken);
  if (!auth.ok) return auth.response;
  const workspace = await readMeetingWorkspace(meetingId);
  const sentBy = String(body?.sentBy || workspace.minuteTakerName || workspace.organizerName).slice(0, 160);
  const recipients = Array.isArray(body?.recipients) ? body.recipients.map(String) : [];
  const subject = String(body?.subject || `${workspace.documentLabel} – ${workspace.minuteNumber || workspace.title}`).slice(0, 300);
  const logId = `mail-${randomUUID()}`;

  try {
    const result = await sendMeetingSummaryEmail({ workspace, recipients, subject, sentBy, includePdf: Boolean(body?.includePdf), includeDocx: Boolean(body?.includeDocx) });
    const next = await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      emailLog: [...current.emailLog, {
        id: logId,
        sentAt: new Date().toISOString(),
        sentBy,
        recipients: result.recipients,
        subject,
        summaryVersion: current.publishedSummaries.find((item) => item.id === current.activePublishedSummaryId)?.version || 0,
        attachments: result.attachments,
        messageId: result.messageId,
        status: "sent" as const,
        error: "",
      }].slice(-500),
    }));
    return NextResponse.json({ ok: true, result, workspace: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Az e-mail küldése sikertelen.";
    await updateMeetingWorkspace(meetingId, (current) => ({
      ...current,
      emailLog: [...current.emailLog, {
        id: logId,
        sentAt: new Date().toISOString(),
        sentBy,
        recipients,
        subject,
        summaryVersion: current.publishedSummaries.find((item) => item.id === current.activePublishedSummaryId)?.version || 0,
        attachments: [],
        messageId: "",
        status: "error" as const,
        error: message,
      }].slice(-500),
    }));
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
