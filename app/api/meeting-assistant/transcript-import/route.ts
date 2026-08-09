import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import { parseManualTranscript } from "@/app/lib/meeting-assistant/manual-transcript";
import { sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function organizerAllowed(auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Az átiratimport űrlapja nem olvasható." }, { status: 400 });
  const meetingId = sanitizeMeetingId(String(form.get("meetingId") || ""));
  const accessToken = String(form.get("accessToken") || "");
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "Átiratfájlt csak a szervező importálhat." }, { status: 403 });
  const file = form.get("file");
  const pastedText = String(form.get("pastedText") || "").slice(0, 5_000_000);
  const mode = String(form.get("mode") || "append") === "replace" ? "replace" : "append";
  let source: "vtt" | "docx" | "txt" | "paste" = pastedText.trim() ? "paste" : "txt";
  let fileName = pastedText.trim() ? "Beillesztett átirat" : "";
  let buffer: Buffer | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Az átiratfájl legfeljebb 25 MB lehet." }, { status: 413 });
    fileName = file.name.slice(0, 240);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["vtt", "docx", "txt"].includes(extension)) return NextResponse.json({ ok: false, error: "Támogatott átiratformátumok: VTT, DOCX és TXT." }, { status: 400 });
    source = extension as typeof source;
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (!pastedText.trim()) {
    return NextResponse.json({ ok: false, error: "Válassz átiratfájlt vagy illeszd be az átirat szövegét." }, { status: 400 });
  }
  try {
    const parsed = await parseManualTranscript({ buffer, text: pastedText, source });
    const updated = await updateMeetingWorkspace(meetingId, (current) => {
      const existing = mode === "replace" ? [] : current.transcript;
      const ids = new Set(existing.map((item) => item.id));
      const newLines = parsed.lines.filter((item) => !ids.has(item.id));
      return {
        ...current,
        transcript: [...existing, ...newLines].slice(-10000),
        teamsTranscript: {
          ...current.teamsTranscript,
          status: "available",
          lastSyncAt: new Date().toISOString(),
          lastError: "",
          importedLineCount: (mode === "replace" ? 0 : current.teamsTranscript.importedLineCount) + newLines.length,
          speakerAttribution: parsed.speakerCount > 0,
          manualImportCount: current.teamsTranscript.manualImportCount + 1,
          lastImportFileName: fileName,
          lastImportSource: source,
        },
      };
    });
    return NextResponse.json({ ok: true, importedNow: parsed.lines.length, speakerCount: parsed.speakerCount, speakers: parsed.speakers, integration: updated.teamsTranscript });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Az átirat importálása sikertelen." }, { status: 400 });
  }
}
