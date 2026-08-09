const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
require('./load-next-env.cjs');

const ffmpegPath = require('ffmpeg-static');
const args = process.argv.slice(2);
const jobArgIndex = args.indexOf('--job');
const jobFile = jobArgIndex >= 0 ? String(args[jobArgIndex + 1] || '') : '';
if (!jobFile) throw new Error('Hiányzik a --job paraméter.');

const projectRoot = process.cwd();
const voiceRoot = path.join(projectRoot, '.dimprover', 'data', 'meeting-assistant', 'voice-profiles');
const internalBaseUrl = process.env.MEETING_TRANSCRIPTION_INTERNAL_URL?.trim() || 'http://127.0.0.1:3000';
const workerSecret = process.env.MEETING_TRANSCRIPTION_WORKER_SECRET?.trim() || '';
const apiKey = process.env.OPENAI_API_KEY?.trim() || '';
const transcriptionApiUrl = process.env.MEETING_TRANSCRIPTION_API_URL?.trim() || 'https://api.openai.com/v1/audio/transcriptions';

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const pricing = {
  inputUsdPerMillion: positiveNumber(process.env.MEETING_AUDIO_INPUT_USD_PER_MILLION, 2.5),
  outputUsdPerMillion: positiveNumber(process.env.MEETING_AUDIO_OUTPUT_USD_PER_MILLION, 10),
  usdHufRate: positiveNumber(process.env.MEETING_AUDIO_USD_HUF_RATE, 319),
};

function safe(value, fallback = 'item') {
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || fallback;
}

async function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, file);
}

async function readJob() {
  return JSON.parse(await fsp.readFile(jobFile, 'utf8'));
}

async function patchJob(patch) {
  const current = await readJob();
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), workerPid: process.pid };
  await atomicWrite(jobFile, updated);
  return updated;
}

async function ensureNotCancelled() {
  const current = await readJob();
  if (current.cancelRequested) {
    await patchJob({ status: 'cancelled', stageLabel: 'A feldolgozás megszakítva', progress: current.progress || 0 });
    throw new Error('__CANCELLED__');
  }
  return current;
}

function runFfmpeg(commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, commandArgs, { cwd: path.dirname(jobFile), stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); if (stderr.length > 200000) stderr = stderr.slice(-200000); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stderr) : reject(new Error(`FFmpeg hiba (${code}): ${stderr.slice(-4000)}`)));
  });
}

async function listChunkFiles(chunkDir) {
  const names = await fsp.readdir(chunkDir).catch(() => []);
  return names.filter((name) => /^chunk-\d+\.mp3$/i.test(name)).sort().map((name) => path.join(chunkDir, name));
}

function secondsToTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
}

function dataUrlForProfile(profile, filePath) {
  const bytes = fs.readFileSync(filePath);
  return `data:${profile.referenceMimeType || 'audio/wav'};base64,${bytes.toString('base64')}`;
}

async function loadVoiceProfiles(profileIds) {
  const rows = [];
  for (const profileId of (profileIds || []).slice(0, 4)) {
    try {
      const profileFile = path.join(voiceRoot, safe(profileId), 'profile.json');
      const profile = JSON.parse(await fsp.readFile(profileFile, 'utf8'));
      if (!profile.active || !profile.consentConfirmed) continue;
      const referencePath = path.join(voiceRoot, safe(profile.id), safe(profile.referenceFileName || 'reference.wav', 'reference.wav'));
      await fsp.access(referencePath);
      rows.push({
        profile,
        referencePath,
        apiLabel: `known_${rows.length + 1}`,
      });
    } catch {
      // Hiányzó vagy inaktív profilt kihagyunk.
    }
  }
  return rows;
}

async function transcribeChunk(chunkFile, job, profiles) {
  const form = new FormData();
  const bytes = await fsp.readFile(chunkFile);
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(chunkFile));
  form.append('model', job.model || 'gpt-4o-transcribe-diarize');
  form.append('response_format', 'diarized_json');
  form.append('chunking_strategy', 'auto');
  if (job.language) form.append('language', job.language);
  for (const row of profiles) {
    form.append('known_speaker_names[]', row.apiLabel);
    form.append('known_speaker_references[]', dataUrlForProfile(row.profile, row.referencePath));
  }
  const response = await fetch(transcriptionApiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 2000) } }; }
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI hangátírási hiba (${response.status}).`);
  return data;
}

async function postComplete(job, resultFile) {
  if (!workerSecret) throw new Error('A MEETING_TRANSCRIPTION_WORKER_SECRET nincs beállítva.');
  const response = await fetch(`${internalBaseUrl}/api/meeting-assistant/native-transcription/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dimpro-worker-secret': workerSecret },
    body: JSON.stringify({ meetingId: job.meetingId, jobId: job.jobId, resultFile }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || 'A feldolgozott átirat nem menthető a DIMPRO munkatérbe.');
}

(async () => {
  let job = await readJob();
  try {
    if (!apiKey) throw new Error('Az OPENAI_API_KEY nincs beállítva a DIMPRO szerveren.');
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error('A DIMPRO médiamotor nem érhető el.');
    const directory = path.dirname(jobFile);
    const normalizedFile = path.join(directory, 'normalized.mp3');
    const chunkDir = path.join(directory, 'chunks');
    const sampleDir = path.join(directory, 'speaker-samples');
    await fsp.mkdir(chunkDir, { recursive: true });
    await fsp.mkdir(sampleDir, { recursive: true });

    job = await patchJob({ status: 'converting', stageLabel: 'Hang kinyerése és optimalizálása', progress: 4, startedAt: new Date().toISOString() });
    await ensureNotCancelled();
    await runFfmpeg(['-y', '-i', job.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', normalizedFile]);
    await patchJob({ stageLabel: 'A hosszú felvétel biztonságos részekre bontása', progress: 12 });
    await runFfmpeg(['-y', '-i', normalizedFile, '-f', 'segment', '-segment_time', '900', '-reset_timestamps', '1', '-c', 'copy', path.join(chunkDir, 'chunk-%03d.mp3')]);
    const chunks = await listChunkFiles(chunkDir);
    if (!chunks.length) throw new Error('A hangfelvételből nem készült feldolgozható hangrészlet.');
    const profiles = await loadVoiceProfiles(job.voiceProfileIds || []);
    const knownByApiLabel = new Map(profiles.map((row) => [row.apiLabel, row.profile]));
    const unknownSpeakerMap = new Map();
    const speakers = new Map();
    const lines = [];
    let durationSeconds = 0;
    let usageSeconds = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let unknownIndex = 0;

    job = await patchJob({ status: 'transcribing', stageLabel: `Beszélőkre bontott átírás · 0/${chunks.length} rész`, progress: 18 });
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      await ensureNotCancelled();
      const result = await transcribeChunk(chunks[chunkIndex], job, profiles);
      const chunkOffset = chunkIndex * 900;
      const segments = Array.isArray(result.segments) ? result.segments : [];
      const segmentDuration = segments.reduce((maximum, segment) => Math.max(maximum, Math.max(0, Number(segment.end || segment.start || 0))), 0);
      const chunkDuration = Math.max(0, Number(result.duration || result.usage?.seconds || segmentDuration || 0));
      durationSeconds = Math.max(durationSeconds, chunkOffset + chunkDuration);
      usageSeconds += Math.max(0, Number(result.usage?.seconds || chunkDuration || 0));
      inputTokens += Math.max(0, Number(result.usage?.input_tokens || result.usage?.input_token_details?.audio_tokens || 0));
      outputTokens += Math.max(0, Number(result.usage?.output_tokens || 0));
      for (const segment of segments) {
        const rawSpeaker = String(segment.speaker || 'A').trim() || 'A';
        const known = knownByApiLabel.get(rawSpeaker);
        let speakerId;
        let speakerName;
        let label;
        if (known) {
          speakerId = `profile:${known.id}`;
          speakerName = known.name;
          label = known.name;
        } else {
          const technicalKey = `${chunkIndex}:${rawSpeaker}`;
          if (!unknownSpeakerMap.has(technicalKey)) {
            const letter = String.fromCharCode(65 + (unknownIndex % 26));
            const round = Math.floor(unknownIndex / 26) + 1;
            unknownSpeakerMap.set(technicalKey, `unknown-${unknownIndex + 1}`);
            speakers.set(`unknown-${unknownIndex + 1}`, { id: `unknown-${unknownIndex + 1}`, label: `Beszélő ${letter}${round > 1 ? round : ''}`, name: `Beszélő ${letter}${round > 1 ? round : ''}`, segmentCount: 0 });
            unknownIndex += 1;
          }
          speakerId = unknownSpeakerMap.get(technicalKey);
          const speaker = speakers.get(speakerId);
          speakerName = speaker.name;
          label = speaker.label;
        }
        if (!speakers.has(speakerId)) speakers.set(speakerId, { id: speakerId, label, name: speakerName, segmentCount: 0 });
        const speaker = speakers.get(speakerId);
        speaker.segmentCount += 1;
        const startSeconds = chunkOffset + Math.max(0, Number(segment.start || 0));
        const endSeconds = chunkOffset + Math.max(0, Number(segment.end || segment.start || 0));
        const text = String(segment.text || '').trim();
        if (!text) continue;
        lines.push({
          id: `tr-audio-${job.jobId}-${lines.length + 1}`,
          at: secondsToTimestamp(startSeconds),
          speaker: speaker.name,
          text,
          shared: false,
          source: 'dimpro_audio',
          startSeconds,
          endSeconds,
          speakerId,
          transcriptionJobId: job.jobId,
        });
      }
      const progress = 18 + Math.round(((chunkIndex + 1) / chunks.length) * 67);
      await patchJob({ stageLabel: `Beszélőkre bontott átírás · ${chunkIndex + 1}/${chunks.length} rész`, progress });
    }

    await patchJob({ stageLabel: 'Beszélőminták előkészítése az azonosításhoz', progress: 89 });
    for (const speaker of speakers.values()) {
      const candidates = lines.filter((line) => line.speakerId === speaker.id).sort((a, b) => (b.endSeconds - b.startSeconds) - (a.endSeconds - a.startSeconds));
      const segment = candidates.find((line) => line.endSeconds - line.startSeconds >= 2) || candidates[0];
      if (!segment) continue;
      const sampleStart = Math.max(0, segment.startSeconds);
      const sampleDuration = Math.min(8, Math.max(2, segment.endSeconds - segment.startSeconds));
      const sampleFile = path.join(sampleDir, `${safe(speaker.id)}.wav`);
      await runFfmpeg(['-y', '-ss', String(sampleStart), '-i', normalizedFile, '-t', String(sampleDuration), '-ac', '1', '-ar', '16000', sampleFile]);
      speaker.sampleFileName = path.basename(sampleFile);
      speaker.sampleDurationSeconds = sampleDuration;
    }

    const actualCostUsd = inputTokens * pricing.inputUsdPerMillion / 1_000_000 + outputTokens * pricing.outputUsdPerMillion / 1_000_000;
    const actualCostHuf = actualCostUsd * pricing.usdHufRate;
    const resultFile = path.join(directory, 'result.json');
    const result = {
      version: 1,
      meetingId: job.meetingId,
      jobId: job.jobId,
      mode: job.mode,
      sourceFileName: job.sourceFileName,
      sourceMimeType: job.sourceMimeType,
      sourceSizeBytes: job.sourceSizeBytes,
      sourceOrigin: job.sourceOrigin,
      language: job.language,
      model: job.model,
      durationSeconds,
      actualAudioSeconds: usageSeconds,
      actualInputTokens: inputTokens,
      actualOutputTokens: outputTokens,
      actualCostUsd,
      actualCostHuf,
      lines,
      speakers: [...speakers.values()],
      voiceProfileIds: profiles.map((row) => row.profile.id),
      completedAt: new Date().toISOString(),
    };
    await atomicWrite(resultFile, result);
    await patchJob({ stageLabel: 'Átirat mentése a DIMPRO értekezlethez', progress: 96 });
    await postComplete(job, resultFile);
    if (!job.keepSourceFile) {
      await fsp.rm(job.sourcePath, { force: true });
      await fsp.rm(normalizedFile, { force: true });
      await fsp.rm(chunkDir, { recursive: true, force: true });
    }
    await patchJob({ status: 'completed', stageLabel: 'Átirat elkészült · beszélők azonosíthatók', progress: 100, completedAt: new Date().toISOString(), lastError: '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== '__CANCELLED__') {
      await patchJob({ status: 'error', stageLabel: 'A hangátírás hibával leállt', lastError: message.slice(0, 4000) }).catch(() => undefined);
      console.error(message);
      process.exitCode = 1;
    }
  }
})();
