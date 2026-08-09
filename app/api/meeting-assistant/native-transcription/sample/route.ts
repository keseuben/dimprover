import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { NATIVE_TRANSCRIPTION_ROOT } from "@/app/lib/meeting-assistant/native-transcription";
import { sanitizeMeetingId } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safePart(value: string, fallback = "item") {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const accessToken = String(url.searchParams.get("accessToken") || "");
  const jobId = String(url.searchParams.get("jobId") || "").trim();
  const speakerId = String(url.searchParams.get("speakerId") || "").trim();
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  const organizerAllowed = auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload));
  if (!organizerAllowed) return NextResponse.json({ ok: false, error: "A hangminta csak a szervező számára érhető el." }, { status: 403 });
  if (!jobId || !speakerId) return NextResponse.json({ ok: false, error: "Hiányzik a hangminta azonosítója." }, { status: 400 });
  const file = path.join(NATIVE_TRANSCRIPTION_ROOT, safePart(meetingId), safePart(jobId), "speaker-samples", `${safePart(speakerId)}.wav`);
  try {
    const buffer = await readFile(file);
    return new Response(buffer, { headers: { "content-type": "audio/wav", "content-length": String(buffer.length), "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ ok: false, error: "A beszélő hangmintája nem található." }, { status: 404 });
  }
}
