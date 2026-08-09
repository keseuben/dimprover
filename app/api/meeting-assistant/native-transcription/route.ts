import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { NextResponse } from "next/server";
import { authorizeMeetingRequest, meetingTokenAllowsOrganizer } from "@/app/lib/meeting-assistant/access";
import {
  atomicWriteNativeJob,
  createNativeTranscriptionJob,
  getNativeTranscriptionConfig,
  nativeTranscriptionJobFile,
  NATIVE_TRANSCRIPTION_EXTENSIONS,
  NATIVE_TRANSCRIPTION_ROOT,
  readNativeTranscriptionJob,
  startNativeTranscriptionWorker,
} from "@/app/lib/meeting-assistant/native-transcription";
import { readMeetingWorkspace, sanitizeMeetingId, updateMeetingWorkspace } from "@/app/lib/meeting-assistant/store";
import {
  createMeetingVoiceProfile,
  deleteMeetingVoiceProfile,
  listMeetingVoiceProfiles,
  updateMeetingVoiceProfile,
  type MeetingVoiceProfile,
} from "@/app/lib/meeting-assistant/voice-profile-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function organizerAllowed(auth: Awaited<ReturnType<typeof authorizeMeetingRequest>>) {
  return auth.ok && (auth.mode === "session" || (auth.mode === "token" && meetingTokenAllowsOrganizer(auth.payload)));
}

function safeFilePart(value: string, fallback = "audio") {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || fallback;
}

function publicProfile(profile: MeetingVoiceProfile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    organization: profile.organization,
    active: profile.active,
    referenceDurationSeconds: profile.referenceDurationSeconds,
    consentAt: profile.consentAt,
    consentBy: profile.consentBy,
    sourceMeetingId: profile.sourceMeetingId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedAt: profile.lastUsedAt,
    useCount: profile.useCount,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const accessToken = String(url.searchParams.get("accessToken") || "");
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "A DIMPRO hangátírást csak a szervező kezelheti." }, { status: 403 });
  const workspace = await readMeetingWorkspace(meetingId);
  let job = null;
  if (workspace.nativeTranscription.jobId) {
    try {
      job = await readNativeTranscriptionJob(meetingId, workspace.nativeTranscription.jobId);
    } catch {
      job = null;
    }
  }
  const profiles = (await listMeetingVoiceProfiles()).map(publicProfile);
  return NextResponse.json({ ok: true, config: getNativeTranscriptionConfig(), transcription: workspace.nativeTranscription, job, profiles });
}

type UploadResult = {
  fields: Record<string, string>;
  tempPath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  truncated: boolean;
};

async function parseStreamingUpload(request: Request, maxBytes: number): Promise<UploadResult> {
  if (!request.body) throw new Error("Hiányzik a feltöltött hang- vagy videófájl.");
  const tempRoot = path.join(NATIVE_TRANSCRIPTION_ROOT, "_incoming");
  await mkdir(tempRoot, { recursive: true });
  const tempPath = path.join(tempRoot, `${Date.now()}-${Math.random().toString(36).slice(2)}.upload`);
  const fields: Record<string, string> = {};
  let fileName = "";
  let mimeType = "application/octet-stream";
  let sizeBytes = 0;
  let truncated = false;
  let fileSeen = false;
  let fileWrite: ReturnType<typeof createWriteStream> | null = null;

  const busboy = Busboy({ headers: Object.fromEntries(request.headers.entries()), limits: { files: 1, fileSize: maxBytes, fields: 20, fieldSize: 50000 } });
  busboy.on("field", (name, value) => { fields[name] = String(value || ""); });
  busboy.on("file", (_name, stream, info) => {
    fileSeen = true;
    fileName = String(info.filename || "felvetel.webm").slice(0, 240);
    mimeType = String(info.mimeType || "application/octet-stream").slice(0, 160);
    fileWrite = createWriteStream(tempPath, { flags: "wx" });
    stream.on("data", (chunk: Buffer) => { sizeBytes += chunk.length; });
    stream.on("limit", () => { truncated = true; });
    stream.pipe(fileWrite);
  });
  const nodeStream = Readable.fromWeb(request.body as never);
  const busboyDone = finished(busboy);
  nodeStream.pipe(busboy);
  await busboyDone;
  if (fileWrite) await finished(fileWrite);
  if (!fileSeen || sizeBytes <= 0) {
    await rm(tempPath, { force: true });
    throw new Error("Válassz hang- vagy videófájlt, illetve készíts mikrofonfelvételt.");
  }
  return { fields, tempPath, fileName, mimeType, sizeBytes, truncated };
}

export async function POST(request: Request) {
  const config = getNativeTranscriptionConfig();
  const url = new URL(request.url);
  const meetingId = sanitizeMeetingId(url.searchParams.get("meetingId"));
  const accessToken = String(url.searchParams.get("accessToken") || "");
  const auth = await authorizeMeetingRequest(request, meetingId, accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "Hang- vagy videófájlt csak a szervező írathat át." }, { status: 403 });
  let upload: UploadResult | null = null;
  try {
    upload = await parseStreamingUpload(request, config.maxFileSizeBytes);
    if (sanitizeMeetingId(upload.fields.meetingId) !== meetingId) throw new Error("A feltöltés értekezletazonosítója nem egyezik a hitelesített munkatérrel.");
    if (!config.configured) throw new Error("Az OPENAI_API_KEY nincs beállítva a DIMPRO szerveren.");
    if (upload.truncated || upload.sizeBytes > config.maxFileSizeBytes) throw new Error(`A fájl legfeljebb ${config.maxFileSizeMb} MB lehet.`);
    const extension = upload.fileName.split(".").pop()?.toLowerCase() || (upload.mimeType.includes("webm") ? "webm" : "bin");
    if (!NATIVE_TRANSCRIPTION_EXTENSIONS.has(extension)) throw new Error(`Nem támogatott médiaformátum. Engedélyezett: ${config.supportedExtensions.join(", ")}.`);
    const mode = upload.fields.mode === "replace" ? "replace" : "append";
    const sourceOrigin = upload.fields.sourceOrigin === "browser_recording" ? "browser_recording" : "upload";
    const keepSourceFile = upload.fields.keepSourceFile === "1" || upload.fields.keepSourceFile === "true";
    const estimatedAudioSeconds = Math.min(24 * 60 * 60, Math.max(0, Number(upload.fields.estimatedAudioSeconds || 0)));
    let voiceProfileIds: string[] = [];
    try { voiceProfileIds = JSON.parse(upload.fields.voiceProfileIds || "[]"); } catch { voiceProfileIds = []; }
    const current = await readMeetingWorkspace(meetingId);
    if (["queued", "converting", "transcribing", "uploading"].includes(current.nativeTranscription.status)) throw new Error("Már folyamatban van egy DIMPRO hangátírás ennél az értekezletnél.");
    const job = await createNativeTranscriptionJob({
      meetingId,
      sourceFileName: upload.fileName,
      sourceMimeType: upload.mimeType,
      sourceSizeBytes: upload.sizeBytes,
      sourceOrigin,
      extension,
      language: String(upload.fields.language || "hu").slice(0, 12),
      mode,
      keepSourceFile,
      estimatedAudioSeconds,
      voiceProfileIds: Array.isArray(voiceProfileIds) ? voiceProfileIds.map(String).slice(0, 4) : [],
      sourceTempPath: upload.tempPath,
    });
    upload = null;
    const workerPid = startNativeTranscriptionWorker(nativeTranscriptionJobFile(meetingId, job.jobId));
    await atomicWriteNativeJob(nativeTranscriptionJobFile(meetingId, job.jobId), { ...job, workerPid, updatedAt: new Date().toISOString() });
    const workspace = await updateMeetingWorkspace(meetingId, (value) => ({
      ...value,
      nativeTranscription: {
        ...value.nativeTranscription,
        jobId: job.jobId,
        status: "queued",
        progress: 0,
        stageLabel: "Feldolgozási sorban",
        sourceFileName: job.sourceFileName,
        sourceMimeType: job.sourceMimeType,
        sourceSizeBytes: job.sourceSizeBytes,
        sourceOrigin: job.sourceOrigin,
        language: job.language,
        model: job.model,
        createdAt: job.createdAt,
        startedAt: "",
        completedAt: "",
        durationSeconds: 0,
        lineCount: 0,
        speakerCount: 0,
        speakers: [],
        mode,
        keepSourceFile,
        sourceStored: true,
        estimatedAudioSeconds: job.estimatedAudioSeconds,
        actualAudioSeconds: 0,
        estimatedCostHuf: job.estimatedCostHuf,
        actualInputTokens: 0,
        actualOutputTokens: 0,
        actualCostUsd: 0,
        actualCostHuf: 0,
        lastError: "",
      },
    }));
    return NextResponse.json({ ok: true, job: { ...job, workerPid }, transcription: workspace.nativeTranscription });
  } catch (error) {
    if (upload?.tempPath) await rm(upload.tempPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "A DIMPRO hangátírás indítása sikertelen.";
    const status = /jogosults|szervező|token|hozzáfér/i.test(message) ? 403 : /legfeljebb|formátum|válassz|hiányzik/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

type PatchBody = {
  meetingId?: string;
  accessToken?: string;
  operation?: "cancel" | "rename_speaker" | "merge_speakers" | "save_voice_profile" | "update_voice_profile" | "delete_voice_profile" | "update_transcript_line" | "delete_transcript_line";
  speakerId?: string;
  speakerIds?: string[];
  name?: string;
  email?: string;
  organization?: string;
  consentConfirmed?: boolean;
  consentText?: string;
  consentBy?: string;
  profileId?: string;
  active?: boolean;
  lineId?: string;
  lineText?: string;
  lineSpeaker?: string;
  lineShared?: boolean;
};

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const meetingId = sanitizeMeetingId(body?.meetingId);
  const auth = await authorizeMeetingRequest(request, meetingId, body?.accessToken);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  if (!organizerAllowed(auth)) return NextResponse.json({ ok: false, error: "Ezt a műveletet csak a szervező végezheti el." }, { status: 403 });
  const operation = body?.operation;
  try {
    if (operation === "cancel") {
      const workspace = await readMeetingWorkspace(meetingId);
      if (!workspace.nativeTranscription.jobId) throw new Error("Nincs megszakítható hangátírás.");
      const job = await readNativeTranscriptionJob(meetingId, workspace.nativeTranscription.jobId);
      await atomicWriteNativeJob(nativeTranscriptionJobFile(meetingId, job.jobId), { ...job, cancelRequested: true, updatedAt: new Date().toISOString(), stageLabel: "Megszakítás kérése elküldve" });
      return NextResponse.json({ ok: true });
    }

    if (operation === "rename_speaker" || operation === "merge_speakers") {
      const speakerIds = operation === "rename_speaker" ? [String(body?.speakerId || "")] : Array.isArray(body?.speakerIds) ? body!.speakerIds!.map(String) : [];
      const validIds = [...new Set(speakerIds.map((item) => item.trim()).filter(Boolean))];
      const name = String(body?.name || "").trim().slice(0, 160);
      if (!validIds.length || !name) throw new Error("Válassz beszélőt és adj meg valós nevet.");
      const workspace = await updateMeetingWorkspace(meetingId, (current) => {
        const targetId = validIds[0];
        const count = current.transcript.filter((line) => line.speakerId && validIds.includes(line.speakerId)).length;
        const remaining = current.nativeTranscription.speakers.filter((speaker) => !validIds.includes(speaker.id));
        return {
          ...current,
          transcript: current.transcript.map((line) => line.speakerId && validIds.includes(line.speakerId) ? { ...line, speakerId: targetId, speaker: name } : line),
          nativeTranscription: {
            ...current.nativeTranscription,
            speakers: [...remaining, { id: targetId, label: current.nativeTranscription.speakers.find((speaker) => speaker.id === targetId)?.label || name, name, segmentCount: count }],
          },
        };
      });
      return NextResponse.json({ ok: true, transcription: workspace.nativeTranscription, transcript: workspace.transcript });
    }

    if (operation === "update_transcript_line") {
      const lineId = String(body?.lineId || "").trim();
      const lineText = String(body?.lineText || "").trim().slice(0, 12000);
      const lineSpeaker = String(body?.lineSpeaker || "").trim().slice(0, 160);
      if (!lineId || !lineText || !lineSpeaker) throw new Error("Hiányzik az átiratsor azonosítója, beszélője vagy szövege.");
      const workspace = await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        transcript: current.transcript.map((line) => line.id === lineId ? { ...line, text: lineText, speaker: lineSpeaker, shared: typeof body?.lineShared === "boolean" ? body.lineShared : line.shared } : line),
      }));
      return NextResponse.json({ ok: true, transcript: workspace.transcript });
    }

    if (operation === "delete_transcript_line") {
      const lineId = String(body?.lineId || "").trim();
      if (!lineId) throw new Error("Hiányzik az átiratsor azonosítója.");
      const workspace = await updateMeetingWorkspace(meetingId, (current) => ({ ...current, transcript: current.transcript.filter((line) => line.id !== lineId) }));
      return NextResponse.json({ ok: true, transcript: workspace.transcript });
    }

    if (operation === "save_voice_profile") {
      const workspace = await readMeetingWorkspace(meetingId);
      const speakerId = String(body?.speakerId || "").trim();
      const speaker = workspace.nativeTranscription.speakers.find((item) => item.id === speakerId);
      if (!speaker || !workspace.nativeTranscription.jobId) throw new Error("A beszélőhöz nem található menthető hangminta.");
      const sampleFile = path.join(NATIVE_TRANSCRIPTION_ROOT, safeFilePart(meetingId), safeFilePart(workspace.nativeTranscription.jobId), "speaker-samples", `${safeFilePart(speakerId)}.wav`);
      const sampleStat = await stat(sampleFile).catch(() => null);
      if (!sampleStat?.isFile()) throw new Error("Ehhez a beszélőhöz nem készült megfelelő 2–10 másodperces hangminta.");
      const consentBy = String(body?.consentBy || workspace.organizerName || "Szervező").trim();
      const consentText = String(body?.consentText || "Az érintett személy hozzájárult, hogy rövid hangreferenciája későbbi DIMPRO beszélőazonosításhoz elmentésre kerüljön.").slice(0, 2000);
      const profile = await createMeetingVoiceProfile({
        name: String(body?.name || speaker.name || speaker.label).trim().slice(0, 160),
        email: String(body?.email || "").trim(),
        organization: String(body?.organization || "").trim(),
        referenceSourcePath: sampleFile,
        referenceDurationSeconds: 5,
        consentConfirmed: Boolean(body?.consentConfirmed),
        consentText,
        consentBy,
        sourceMeetingId: meetingId,
        sourceJobId: workspace.nativeTranscription.jobId,
        sourceSpeakerId: speakerId,
      });
      await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        auditLog: [...current.auditLog, {
          id: `audit-${randomUUID()}`,
          type: "voice_profile_created_with_consent",
          at: profile.consentAt,
          actorName: consentBy,
          actorRole: "organizer" as const,
          message: `${profile.name} rövid hangprofilja külön hozzájárulással elmentve.`,
          operation: "native_transcription:save_voice_profile",
        }].slice(-1000),
      }));
      return NextResponse.json({ ok: true, profile: publicProfile(profile), profiles: (await listMeetingVoiceProfiles()).map(publicProfile) });
    }

    if (operation === "update_voice_profile") {
      const profileId = String(body?.profileId || "").trim();
      const workspace = await readMeetingWorkspace(meetingId);
      const actorName = workspace.organizerName || "Szervező";
      const profile = await updateMeetingVoiceProfile(profileId, {
        name: body?.name,
        email: body?.email,
        organization: body?.organization,
        active: typeof body?.active === "boolean" ? body.active : undefined,
      }, actorName, meetingId);
      return NextResponse.json({ ok: true, profile: publicProfile(profile), profiles: (await listMeetingVoiceProfiles()).map(publicProfile) });
    }

    if (operation === "delete_voice_profile") {
      const workspace = await readMeetingWorkspace(meetingId);
      const actorName = workspace.organizerName || "Szervező";
      const profile = await deleteMeetingVoiceProfile(String(body?.profileId || "").trim(), actorName, meetingId);
      await updateMeetingWorkspace(meetingId, (current) => ({
        ...current,
        auditLog: [...current.auditLog, {
          id: `audit-${randomUUID()}`,
          type: "voice_profile_deleted",
          at: new Date().toISOString(),
          actorName,
          actorRole: "organizer" as const,
          message: `${profile.name} tartós hangprofilja és referenciahangja véglegesen törölve.`,
          operation: "native_transcription:delete_voice_profile",
        }].slice(-1000),
      }));
      return NextResponse.json({ ok: true, deletedProfile: publicProfile(profile), profiles: (await listMeetingVoiceProfiles()).map(publicProfile) });
    }

    throw new Error("Ismeretlen hangátírási művelet.");
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A hangátírási művelet sikertelen." }, { status: 400 });
  }
}
