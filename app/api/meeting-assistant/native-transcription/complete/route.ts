import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { nativeTranscriptionJobDir, NATIVE_TRANSCRIPTION_ROOT } from "@/app/lib/meeting-assistant/native-transcription";
import { sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";
import { markMeetingVoiceProfilesUsed } from "@/app/lib/meeting-assistant/voice-profile-store";
import type { MeetingNativeSpeaker, MeetingTranscriptLine } from "@/app/lib/meeting-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type WorkerResult = {
  meetingId?: string;
  jobId?: string;
  mode?: "append" | "replace";
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceSizeBytes?: number;
  sourceOrigin?: "upload" | "browser_recording";
  language?: string;
  model?: string;
  durationSeconds?: number;
  actualAudioSeconds?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualCostUsd?: number;
  actualCostHuf?: number;
  lines?: MeetingTranscriptLine[];
  speakers?: Array<MeetingNativeSpeaker & { sampleFileName?: string; sampleDurationSeconds?: number }>;
  voiceProfileIds?: string[];
  completedAt?: string;
};

function secretsMatch(expected: string, supplied: string) {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function isExpectedResultFile(meetingId: string, jobId: string, filePath: string) {
  const root = path.resolve(NATIVE_TRANSCRIPTION_ROOT) + path.sep;
  const resolved = path.resolve(filePath);
  const expectedDirectory = path.resolve(nativeTranscriptionJobDir(meetingId, jobId));
  return resolved.startsWith(root) && path.dirname(resolved) === expectedDirectory && path.basename(resolved) === "result.json";
}

export async function POST(request: Request) {
  const expectedSecret = process.env.MEETING_TRANSCRIPTION_WORKER_SECRET?.trim() || "";
  const suppliedSecret = request.headers.get("x-dimpro-worker-secret")?.trim() || "";
  if (!secretsMatch(expectedSecret, suppliedSecret)) return NextResponse.json({ ok: false, error: "Érvénytelen hangátíró worker-hitelesítés." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { meetingId?: string; jobId?: string; resultFile?: string } | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const jobId = String(body?.jobId || "").trim();
  const resultFile = String(body?.resultFile || "").trim();
  if (!jobId || !resultFile || !isExpectedResultFile(meetingId, jobId, resultFile)) return NextResponse.json({ ok: false, error: "Érvénytelen feldolgozási eredményútvonal." }, { status: 400 });
  try {
    const result = JSON.parse(await readFile(resultFile, "utf8")) as WorkerResult;
    if (sanitizeMeetingId(result.meetingId) !== meetingId || String(result.jobId || "") !== jobId) throw new Error("A feldolgozási eredmény nem ehhez az értekezlethez tartozik.");
    const lines = Array.isArray(result.lines) ? result.lines.filter((line) => line && line.text && line.id).slice(0, 20000) : [];
    const speakers = Array.isArray(result.speakers)
      ? result.speakers.filter((speaker) => speaker && speaker.id).map((speaker) => ({ id: String(speaker.id), label: String(speaker.label || speaker.name || speaker.id), name: String(speaker.name || speaker.label || speaker.id), segmentCount: Math.max(0, Number(speaker.segmentCount || 0)) })).slice(0, 100)
      : [];
    const completedAt = String(result.completedAt || new Date().toISOString());
    const workspace = await updateMeetingWorkspace(meetingId, (current) => {
      const existing = result.mode === "replace" ? [] : current.transcript;
      const ids = new Set(existing.map((line) => line.id));
      const additions = lines.filter((line) => !ids.has(line.id));
      return {
        ...current,
        transcript: [...existing, ...additions].slice(-20000),
        nativeTranscription: {
          ...current.nativeTranscription,
          jobId,
          status: "completed",
          progress: 100,
          stageLabel: "Átirat elkészült · beszélők azonosíthatók",
          sourceFileName: String(result.sourceFileName || current.nativeTranscription.sourceFileName),
          sourceMimeType: String(result.sourceMimeType || current.nativeTranscription.sourceMimeType),
          sourceSizeBytes: Math.max(0, Number(result.sourceSizeBytes || current.nativeTranscription.sourceSizeBytes)),
          sourceOrigin: result.sourceOrigin || current.nativeTranscription.sourceOrigin,
          language: String(result.language || current.nativeTranscription.language || "hu"),
          model: String(result.model || current.nativeTranscription.model),
          completedAt,
          durationSeconds: Math.max(0, Number(result.durationSeconds || 0)),
          lineCount: additions.length,
          speakerCount: speakers.length,
          speakers,
          actualAudioSeconds: Math.max(0, Number(result.actualAudioSeconds || 0)),
          actualInputTokens: Math.max(0, Number(result.actualInputTokens || 0)),
          actualOutputTokens: Math.max(0, Number(result.actualOutputTokens || 0)),
          actualCostUsd: Math.max(0, Number(result.actualCostUsd || 0)),
          actualCostHuf: Math.max(0, Number(result.actualCostHuf || 0)),
          sourceStored: Boolean(current.nativeTranscription.keepSourceFile),
          lastError: "",
        },
        auditLog: [...current.auditLog, {
          id: `audit-${randomUUID()}`,
          type: "native_transcription_completed",
          at: completedAt,
          actorName: current.organizerName || "Szervező",
          actorRole: "organizer" as const,
          message: `A DIMPRO saját hangátírása elkészült: ${additions.length} átiratsor, ${speakers.length} beszélő, tényleges becsült API-költség ${Math.max(0, Number(result.actualCostHuf || 0)).toLocaleString("hu-HU", { maximumFractionDigits: 2 })} Ft.`,
          operation: "native_transcription:complete",
        }].slice(-1000),
      };
    });
    await markMeetingVoiceProfilesUsed(Array.isArray(result.voiceProfileIds) ? result.voiceProfileIds.map(String).slice(0, 4) : []);
    return NextResponse.json({ ok: true, transcription: workspace.nativeTranscription, importedNow: lines.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A feldolgozott átirat mentése sikertelen." }, { status: 400 });
  }
}
