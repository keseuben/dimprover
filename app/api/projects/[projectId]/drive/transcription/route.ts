import { type NextRequest, NextResponse } from "next/server";
import { requireProjectPermission } from "@/app/lib/project-core/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    browserFallback: true,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const access = await requireProjectPermission(request, projectId, "document.approve");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ ok: false, error: "Hiányzik a hangfelvétel." }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: "A hangfelvétel legfeljebb 25 MB lehet." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
    if (!apiKey) return NextResponse.json({ ok: false, error: "A DIMPRO hangátíró motor nincs konfigurálva." }, { status: 503 });

    const model = process.env.DRIVE_AUDIO_TRANSCRIPTION_MODEL?.trim()
      || process.env.MEETING_AUDIO_TRANSCRIPTION_MODEL?.trim()
      || "gpt-4o-transcribe-diarize";
    const endpoint = process.env.MEETING_TRANSCRIPTION_API_URL?.trim()
      || "https://api.openai.com/v1/audio/transcriptions";

    const outbound = new FormData();
    outbound.append("file", file, file.name || "drive-observation.webm");
    outbound.append("model", model);
    outbound.append("language", "hu");
    if (model.includes("diarize")) {
      outbound.append("response_format", "diarized_json");
      outbound.append("chunking_strategy", "auto");
    } else {
      outbound.append("response_format", "json");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: outbound,
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = {}; }

    if (!response.ok) {
      const message = typeof (data.error as Record<string, unknown> | undefined)?.message === "string"
        ? String((data.error as Record<string, unknown>).message)
        : `A DIMPRO hangátírás sikertelen (${response.status}).`;
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }

    const directText = typeof data.text === "string" ? data.text.trim() : "";
    const segmentText = Array.isArray(data.segments)
      ? data.segments.map((item) => {
          const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return typeof value.text === "string" ? value.text.trim() : "";
        }).filter(Boolean).join(" ")
      : "";
    const text = directText || segmentText;
    if (!text) return NextResponse.json({ ok: false, error: "A hangfelvételből nem készült feldolgozható szöveg." }, { status: 422 });

    return NextResponse.json({
      ok: true,
      text: text.slice(0, 12000),
      model,
      source: "dimpro_audio",
      actor: access.actor.displayName || access.actor.userId,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "A DIMPRO hangátírás sikertelen.",
    }, { status: 500 });
  }
}
