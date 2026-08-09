import { createReadStream } from "node:fs";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  findMeetingAttachment,
  getMeetingFilePath,
  sanitizeMeetingId,
} from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const auth = await authorizeMeetingRequest(request, meetingId);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const attachment = await findMeetingAttachment(meetingId, fileId);
  const organizerAuthorized = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!attachment || attachment.status === "rejected" || (!organizerAuthorized && attachment.status !== "shared")) {
    return NextResponse.json({ ok: false, error: "A fájl nem található vagy nem elérhető." }, { status: 404 });
  }

  const filePath = getMeetingFilePath(meetingId, attachment.storedName);
  try {
    const fileStat = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    const inline = attachment.mimeType.startsWith("image/") || attachment.mimeType === "application/pdf";
    return new Response(stream, {
      headers: {
        "content-type": attachment.mimeType || "application/octet-stream",
        "content-length": String(fileStat.size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        "cache-control": "private, max-age=60",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "A fájl fizikailag nem érhető el." }, { status: 404 });
  }
}
