import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function resolveProjectRoot() {
  const cwd = process.cwd();
  const marker = `${path.sep}.next${path.sep}standalone`;
  const index = cwd.lastIndexOf(marker);
  return index >= 0 ? cwd.slice(0, index) : cwd;
}

const PROJECT_ROOT = process.env.DIMPRO_PROJECT_ROOT?.trim() || resolveProjectRoot();
import { spawn } from "node:child_process";

export const NATIVE_TRANSCRIPTION_ROOT = path.join(PROJECT_ROOT, ".dimprover", "data", "meeting-assistant", "native-transcription");
export const NATIVE_TRANSCRIPTION_WORKER = path.join(PROJECT_ROOT, "scripts", "process-meeting-transcription-job.cjs");

export const NATIVE_TRANSCRIPTION_EXTENSIONS = new Set([
  "mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "flac", "mov", "mkv", "avi", "aac",
]);

export type NativeTranscriptionJob = {
  version: 1;
  jobId: string;
  meetingId: string;
  status: "queued" | "converting" | "transcribing" | "completed" | "error" | "cancelled";
  sourcePath: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceSizeBytes: number;
  sourceOrigin: "upload" | "browser_recording";
  language: string;
  model: string;
  mode: "append" | "replace";
  keepSourceFile: boolean;
  estimatedAudioSeconds: number;
  estimatedCostHuf: number;
  voiceProfileIds: string[];
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string;
  progress: number;
  stageLabel: string;
  workerPid: number;
  cancelRequested: boolean;
  lastError: string;
};

function safePart(value: string, fallback = "item") {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || fallback;
}

export function nativeTranscriptionJobDir(meetingId: string, jobId: string) {
  return path.join(NATIVE_TRANSCRIPTION_ROOT, safePart(meetingId, "meeting"), safePart(jobId, "job"));
}

export function nativeTranscriptionJobFile(meetingId: string, jobId: string) {
  return path.join(nativeTranscriptionJobDir(meetingId, jobId), "job.json");
}

export async function atomicWriteNativeJob(filePath: string, value: NativeTranscriptionJob) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

export async function readNativeTranscriptionJob(meetingId: string, jobId: string) {
  return JSON.parse(await readFile(nativeTranscriptionJobFile(meetingId, jobId), "utf8")) as NativeTranscriptionJob;
}

export async function createNativeTranscriptionJob(input: {
  meetingId: string;
  sourceFileName: string;
  sourceMimeType: string;
  sourceSizeBytes: number;
  sourceOrigin: "upload" | "browser_recording";
  extension: string;
  language: string;
  mode: "append" | "replace";
  keepSourceFile: boolean;
  estimatedAudioSeconds?: number;
  voiceProfileIds?: string[];
  buffer?: Buffer;
  sourceTempPath?: string;
}) {
  const now = new Date().toISOString();
  const jobId = `audio-${randomUUID()}`;
  const directory = nativeTranscriptionJobDir(input.meetingId, jobId);
  await mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, `source.${safePart(input.extension.toLowerCase(), "webm")}`);
  if (input.sourceTempPath) await rename(input.sourceTempPath, sourcePath);
  else if (input.buffer) await writeFile(sourcePath, input.buffer);
  else throw new Error("Hiányzik a feltöltött hang- vagy videófájl.");
  const job: NativeTranscriptionJob = {
    version: 1,
    jobId,
    meetingId: input.meetingId,
    status: "queued",
    sourcePath,
    sourceFileName: input.sourceFileName.slice(0, 240),
    sourceMimeType: input.sourceMimeType.slice(0, 160),
    sourceSizeBytes: input.sourceSizeBytes,
    sourceOrigin: input.sourceOrigin,
    language: input.language.slice(0, 12) || "hu",
    model: process.env.MEETING_AUDIO_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe-diarize",
    mode: input.mode,
    keepSourceFile: input.keepSourceFile,
    estimatedAudioSeconds: Math.max(0, Number(input.estimatedAudioSeconds || 0)),
    estimatedCostHuf: estimateNativeTranscriptionCostHuf(input.estimatedAudioSeconds || 0),
    voiceProfileIds: [...new Set((input.voiceProfileIds || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 4),
    createdAt: now,
    updatedAt: now,
    heartbeatAt: "",
    progress: 0,
    stageLabel: "Feldolgozási sorban",
    workerPid: 0,
    cancelRequested: false,
    lastError: "",
  };
  await atomicWriteNativeJob(nativeTranscriptionJobFile(input.meetingId, jobId), job);
  return job;
}

export function startNativeTranscriptionWorker(jobFile: string) {
  const child = spawn(process.execPath, [NATIVE_TRANSCRIPTION_WORKER, "--job", jobFile], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return child.pid || 0;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getNativeTranscriptionPricing() {
  return {
    inputUsdPerMillion: positiveNumber(process.env.MEETING_AUDIO_INPUT_USD_PER_MILLION, 2.5),
    outputUsdPerMillion: positiveNumber(process.env.MEETING_AUDIO_OUTPUT_USD_PER_MILLION, 10),
    estimatedUsdPerMinute: positiveNumber(process.env.MEETING_AUDIO_ESTIMATED_USD_PER_MINUTE, 0.025),
    usdHufRate: positiveNumber(process.env.MEETING_AUDIO_USD_HUF_RATE, 319),
  };
}

export function estimateNativeTranscriptionCostHuf(durationSeconds: number) {
  const pricing = getNativeTranscriptionPricing();
  return Math.max(0, Number(durationSeconds || 0)) / 60 * pricing.estimatedUsdPerMinute * pricing.usdHufRate;
}

export function getNativeTranscriptionConfig() {
  const maxMb = Math.min(2048, Math.max(25, Number(process.env.MEETING_AUDIO_MAX_MB || 500)));
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.MEETING_AUDIO_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-transcribe-diarize",
    maxFileSizeBytes: Math.round(maxMb * 1024 * 1024),
    maxFileSizeMb: maxMb,
    supportedExtensions: [...NATIVE_TRANSCRIPTION_EXTENSIONS],
    browserRecordingSupported: true,
    speakerDiarization: true,
    pricing: getNativeTranscriptionPricing(),
  };
}
