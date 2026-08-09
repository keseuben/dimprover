"use client";

import {
  AudioLines,
  CheckCircle2,
  CircleStop,
  FileAudio,
  FileVideo,
  Loader2,
  Merge,
  Mic,
  PauseCircle,
  Save,
  Sparkles,
  Trash2,
  Upload,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeetingMode, MeetingNativeSpeaker, MeetingNativeTranscription, MeetingTranscriptLine, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type VoiceProfile = {
  id: string;
  name: string;
  email: string;
  organization: string;
  active: boolean;
  referenceDurationSeconds: number;
  consentAt: string;
  consentBy: string;
  sourceMeetingId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  useCount: number;
};

type NativeConfig = {
  configured: boolean;
  model: string;
  maxFileSizeBytes: number;
  maxFileSizeMb: number;
  supportedExtensions: string[];
  browserRecordingSupported: boolean;
  speakerDiarization: boolean;
  pricing: {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
    estimatedUsdPerMinute: number;
    usdHufRate: number;
  };
};

type NativeJob = {
  jobId: string;
  status: "queued" | "converting" | "transcribing" | "completed" | "error" | "cancelled";
  progress: number;
  stageLabel: string;
  lastError?: string;
  sourceFileName?: string;
};

type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  meetingMode: MeetingMode;
  locked: boolean;
  refreshWorkspace: () => Promise<void>;
  setStatus: (message: string) => void;
  onOpenAi: () => void;
};

const ACTIVE_STATUSES = new Set(["uploading", "queued", "converting", "transcribing"]);

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs].map((part, index) => index === 0 && hours === 0 ? null : String(part).padStart(2, "0")).filter(Boolean).join(":") || "00:00";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatHuf(value: number) {
  const amount = Math.max(0, Number(value || 0));
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: amount < 10 ? 2 : 0 }).format(amount);
}

function readBrowserMediaDuration(file: File) {
  return new Promise<number>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const timeout = window.setTimeout(() => finish(0), 5000);
    media.preload = "metadata";
    media.onloadedmetadata = () => { window.clearTimeout(timeout); finish(media.duration); };
    media.onerror = () => { window.clearTimeout(timeout); finish(0); };
    media.src = objectUrl;
  });
}

function chooseRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export default function MeetingNativeTranscriptionSection({ meetingId, accessToken, workspace, meetingMode, locked, refreshWorkspace, setStatus, onOpenAi }: Props) {
  const [config, setConfig] = useState<NativeConfig | null>(null);
  const [job, setJob] = useState<NativeJob | null>(null);
  const [transcription, setTranscription] = useState<MeetingNativeTranscription>(workspace.nativeTranscription);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState(0);
  const [language, setLanguage] = useState("hu");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [keepSourceFile, setKeepSourceFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [speakerEmails, setSpeakerEmails] = useState<Record<string, string>>({});
  const [speakerOrganizations, setSpeakerOrganizations] = useState<Record<string, string>>({});
  const [speakerConsent, setSpeakerConsent] = useState<Record<string, boolean>>({});
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState("");
  const [workingSpeakerId, setWorkingSpeakerId] = useState("");
  const [editingLineId, setEditingLineId] = useState("");
  const [editingSpeaker, setEditingSpeaker] = useState("");
  const [editingText, setEditingText] = useState("");
  const [editingShared, setEditingShared] = useState(false);
  const [lineWorking, setLineWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsRef = useRef(0);
  const autoUploadRecordingRef = useRef(false);
  const completionSeenRef = useRef("");

  const nativeLines = useMemo(() => workspace.transcript.filter((line) => line.source === "dimpro_audio"), [workspace.transcript]);
  const active = uploading || ACTIVE_STATUSES.has(String(job?.status || transcription.status));
  const estimateCostHuf = (durationSeconds: number) => {
    if (!config?.pricing) return 0;
    return Math.max(0, durationSeconds) / 60 * config.pricing.estimatedUsdPerMinute * config.pricing.usdHufRate;
  };
  const selectedEstimateHuf = estimateCostHuf(selectedDurationSeconds);
  const recordingEstimateHuf = estimateCostHuf(recordingSeconds);

  const applySpeakerDrafts = useCallback((speakers: MeetingNativeSpeaker[]) => {
    setSpeakerNames((current) => {
      const next = { ...current };
      for (const speaker of speakers) if (!(speaker.id in next)) next[speaker.id] = speaker.name || speaker.label;
      return next;
    });
  }, []);

  const loadState = useCallback(async (silent = false) => {
    try {
      const query = new URLSearchParams({ meetingId, accessToken });
      const response = await fetch(`/api/meeting-assistant/native-transcription?${query.toString()}`, { cache: "no-store" });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; config?: NativeConfig; transcription?: MeetingNativeTranscription; job?: NativeJob | null; profiles?: VoiceProfile[] }>(response, "A DIMPRO hangátírás állapota nem tölthető be.");
      if (!response.ok || !data.ok) throw new Error(data.error || "A DIMPRO hangátírás állapota nem tölthető be.");
      if (data.config) setConfig(data.config);
      if (data.transcription) {
        setTranscription(data.transcription);
        applySpeakerDrafts(data.transcription.speakers || []);
      }
      setJob(data.job || null);
      if (data.profiles) {
        setProfiles(data.profiles);
        setSelectedProfileIds((current) => {
          if (current.length) return current.filter((id) => data.profiles!.some((profile) => profile.id === id && profile.active)).slice(0, 4);
          const names = new Set([...workspace.attendees.map((item) => item.name), ...workspace.participants].map((item) => item.toLocaleLowerCase("hu-HU")));
          const emails = new Set(workspace.attendees.map((item) => item.email.toLowerCase()).filter(Boolean));
          const matched = data.profiles!.filter((profile) => profile.active && (names.has(profile.name.toLocaleLowerCase("hu-HU")) || (profile.email && emails.has(profile.email))));
          return [...matched, ...data.profiles!.filter((profile) => profile.active && !matched.some((row) => row.id === profile.id))].slice(0, 4).map((profile) => profile.id);
        });
      }
      const currentStatus = data.job?.status || data.transcription?.status;
      if (currentStatus === "completed" && data.transcription?.jobId && completionSeenRef.current !== data.transcription.jobId) {
        completionSeenRef.current = data.transcription.jobId;
        await refreshWorkspace();
        if (!silent) setStatus(`${data.transcription.lineCount} átiratsor elkészült · ${data.transcription.speakerCount} beszélő azonosítható.`);
      }
      if (currentStatus === "error" && data.job?.lastError && !silent) setStatus(data.job.lastError);
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : "A DIMPRO hangátírás állapota nem tölthető be.");
    }
  }, [accessToken, applySpeakerDrafts, meetingId, refreshWorkspace, setStatus, workspace.attendees, workspace.participants]);

  useEffect(() => { void loadState(true); }, [loadState]);

  useEffect(() => {
    const currentStatus = String(job?.status || transcription.status);
    if (!ACTIVE_STATUSES.has(currentStatus)) return;
    const interval = setInterval(() => void loadState(true), 2000);
    return () => clearInterval(interval);
  }, [job?.status, loadState, transcription.status]);

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function toggleProfile(profileId: string) {
    setSelectedProfileIds((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : current.length >= 4 ? current : [...current, profileId]);
  }

  async function handleFileSelection(file: File | null) {
    setSelectedFile(file);
    setSelectedDurationSeconds(0);
    if (!file) return;
    const duration = await readBrowserMediaDuration(file);
    setSelectedDurationSeconds(duration);
  }

  async function uploadMedia(file: File, sourceOrigin: "upload" | "browser_recording", estimatedAudioSeconds = 0) {
    if (!config?.configured) {
      setStatus("Az OPENAI_API_KEY nincs beállítva a DIMPRO szerveren.");
      return;
    }
    if (file.size > config.maxFileSizeBytes) {
      setStatus(`A fájl legfeljebb ${config.maxFileSizeMb} MB lehet.`);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const uploadQuery = new URLSearchParams({ meetingId, accessToken });
      xhr.open("POST", `/api/meeting-assistant/native-transcription?${uploadQuery.toString()}`);
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100)); };
      xhr.onerror = () => { setStatus("A médiafájl feltöltése hálózati hiba miatt megszakadt."); setUploading(false); resolve(); };
      xhr.onload = async () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}") as { ok?: boolean; error?: string };
          if (xhr.status < 200 || xhr.status >= 300 || !data.ok) throw new Error(data.error || "A DIMPRO hangátírás indítása sikertelen.");
          setSelectedFile(null);
          setSelectedDurationSeconds(0);
          if (fileRef.current) fileRef.current.value = "";
          setStatus("A felvétel feltöltve. A beszélőkre bontott háttérfeldolgozás elindult.");
          await loadState(true);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "A DIMPRO hangátírás indítása sikertelen.");
        } finally {
          setUploading(false);
          resolve();
        }
      };
      const form = new FormData();
      form.append("meetingId", meetingId);
      form.append("accessToken", accessToken);
      form.append("language", language);
      form.append("mode", mode);
      form.append("keepSourceFile", keepSourceFile ? "1" : "0");
      form.append("sourceOrigin", sourceOrigin);
      form.append("estimatedAudioSeconds", String(Math.max(0, estimatedAudioSeconds)));
      form.append("voiceProfileIds", JSON.stringify(selectedProfileIds.slice(0, 4)));
      form.append("file", file, file.name);
      xhr.send(form);
    });
  }

  async function startRecording() {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Ez a böngésző nem támogatja a közvetlen mikrofonrögzítést.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      const mimeType = chooseRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaStreamRef.current = stream;
      recorderRef.current = recorder;
      recordedChunksRef.current = [];
      recordingSecondsRef.current = 0;
      autoUploadRecordingRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setRecording(false);
        const shouldUpload = autoUploadRecordingRef.current;
        const capturedDurationSeconds = recordingSecondsRef.current;
        autoUploadRecordingRef.current = false;
        if (!shouldUpload || !recordedChunksRef.current.length) {
          recordedChunksRef.current = [];
          recordingSecondsRef.current = 0;
          setRecordingSeconds(0);
          return;
        }
        const actualType = recorder.mimeType || "audio/webm";
        const extension = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: actualType });
        const file = new File([blob], `DIMPRO_felvetel_${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: actualType });
        recordedChunksRef.current = [];
        recordingSecondsRef.current = 0;
        setRecordingSeconds(0);
        void uploadMedia(file, "browser_recording", capturedDurationSeconds);
      };
      recorder.start(1000);
      setRecording(true);
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
      setStatus("A DIMPRO mikrofonrögzítés elindult.");
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "A mikrofon nem érhető el vagy az engedélyt megtagadták.");
    }
  }

  function stopAndTranscribe() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    autoUploadRecordingRef.current = true;
    recorderRef.current.stop();
    setStatus("A felvétel leállt. Feltöltés és beszélőkre bontott átírás indul.");
  }

  function discardRecording() {
    autoUploadRecordingRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    else {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
    }
    setStatus("A mikrofonfelvétel elvetve.");
  }

  async function patch(operation: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/meeting-assistant/native-transcription", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId, accessToken, operation, ...payload }),
    });
    const data = await readJsonResponse<{ ok?: boolean; error?: string; profiles?: VoiceProfile[] }>(response, "A hangátírási művelet sikertelen.");
    if (!response.ok || !data.ok) throw new Error(data.error || "A hangátírási művelet sikertelen.");
    if (data.profiles) setProfiles(data.profiles);
    await refreshWorkspace();
    await loadState(true);
  }

  async function renameSpeaker(speakerId: string) {
    const name = String(speakerNames[speakerId] || "").trim();
    if (!name) return setStatus("Adj meg valós nevet a beszélőhöz.");
    setWorkingSpeakerId(speakerId);
    try {
      await patch("rename_speaker", { speakerId, name });
      setStatus(`A beszélő minden átiratsora átnevezve: ${name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A beszélő átnevezése sikertelen.");
    } finally {
      setWorkingSpeakerId("");
    }
  }

  async function mergeSpeakers() {
    if (selectedSpeakerIds.length < 2 || !mergeName.trim()) return setStatus("Jelölj ki legalább két hangcímkét, és adj meg közös nevet.");
    setWorkingSpeakerId("merge");
    try {
      await patch("merge_speakers", { speakerIds: selectedSpeakerIds, name: mergeName.trim() });
      setSelectedSpeakerIds([]);
      setMergeName("");
      setStatus("A kijelölt hangcímkék egy valós személyhez lettek összevonva.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A beszélők összevonása sikertelen.");
    } finally {
      setWorkingSpeakerId("");
    }
  }

  async function saveVoiceProfile(speaker: MeetingNativeSpeaker) {
    const name = String(speakerNames[speaker.id] || speaker.name || speaker.label).trim();
    if (!speakerConsent[speaker.id]) return setStatus("A tartós hangprofil mentéséhez erősítsd meg az érintett személy hozzájárulását.");
    setWorkingSpeakerId(speaker.id);
    try {
      await patch("save_voice_profile", {
        speakerId: speaker.id,
        name,
        email: speakerEmails[speaker.id] || "",
        organization: speakerOrganizations[speaker.id] || "",
        consentConfirmed: true,
        consentBy: workspace.organizerName || "Szervező",
      });
      setStatus(`${name} hangprofilja elmentve. A következő értekezleteknél ismert beszélőként használható.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A hangprofil mentése sikertelen.");
    } finally {
      setWorkingSpeakerId("");
    }
  }

  async function deleteProfile(profileId: string, name: string) {
    if (!window.confirm(`Biztosan törlöd ${name} tartós hangprofilját? A későbbi automatikus felismerés megszűnik.`)) return;
    try {
      await patch("delete_voice_profile", { profileId });
      setSelectedProfileIds((current) => current.filter((id) => id !== profileId));
      setStatus(`${name} hangprofilja törölve.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "A hangprofil törlése sikertelen.");
    }
  }

  function beginLineEdit(line: MeetingTranscriptLine) {
    setEditingLineId(line.id);
    setEditingSpeaker(line.speaker);
    setEditingText(line.text);
    setEditingShared(Boolean(line.shared));
  }

  async function saveLine() {
    if (!editingLineId || !editingText.trim() || !editingSpeaker.trim()) return;
    setLineWorking(true);
    try {
      await patch("update_transcript_line", { lineId: editingLineId, lineText: editingText.trim(), lineSpeaker: editingSpeaker.trim(), lineShared: editingShared });
      setEditingLineId("");
      setStatus("Az átiratsor javítása elmentve.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az átiratsor mentése sikertelen.");
    } finally {
      setLineWorking(false);
    }
  }

  async function deleteLine(lineId: string) {
    if (!window.confirm("Biztosan törlöd ezt az átiratsort?")) return;
    setLineWorking(true);
    try {
      await patch("delete_transcript_line", { lineId });
      setStatus("Az átiratsor törölve.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az átiratsor törlése sikertelen.");
    } finally {
      setLineWorking(false);
    }
  }

  const currentProgress = uploading ? uploadProgress : Math.max(Number(job?.progress || 0), Number(transcription.progress || 0));
  const currentStage = uploading ? `Feltöltés: ${uploadProgress}%` : job?.stageLabel || transcription.stageLabel;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/60">
      <div className="flex items-start gap-2 border-b border-indigo-200 px-3 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white"><AudioLines size={17} className={active ? "animate-pulse" : ""} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black text-slate-950">DIMPRO saját hangrögzítés és beszélőkre bontott átírás</div>
          <div className="mt-0.5 text-[9px] leading-4 text-slate-600">{meetingMode === "in_person" ? "Személyes értekezlethez készült mikrofon- és médiafeldolgozás. Felvétel után Beszélő A, B, C… címkéket készít." : "Teams értekezletnél opcionális tartalék felvételi lehetőség. A Teams Graph-importtól függetlenül készít beszélőkre bontott átiratot."}</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${transcription.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : transcription.status === "error" || job?.status === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : active ? "border-indigo-200 bg-white text-indigo-800" : "border-slate-200 bg-white text-slate-600"}`}>
          {active ? "Feldolgozás" : transcription.status === "completed" ? "Elkészült" : transcription.status === "error" ? "Hiba" : "Készen áll"}
        </span>
      </div>

      <div className="space-y-4 p-3">
        {!config?.configured && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[9px] font-semibold leading-4 text-amber-900">Az OPENAI_API_KEY nincs beállítva. A felület és a mikrofonpróba látható, tényleges átírás kulcs nélkül nem indul.</div>}

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-indigo-200 bg-white p-3">
            <div className="flex items-center gap-2"><Mic size={15} className="text-rose-600" /><h4 className="text-[10px] font-black text-slate-950">Élő mikrofonfelvétel az Asszisztensben</h4></div>
            {!recording ? (
              <button type="button" onClick={() => void startRecording()} disabled={locked || active || !config?.configured} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-3 text-[10px] font-black text-white disabled:opacity-40"><Mic size={15} /> Hangrögzítés indítása</button>
            ) : (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-[10px] font-black text-rose-800"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" /> Felvétel folyamatban</span><span className="font-mono text-sm font-black text-rose-900">{formatDuration(recordingSeconds)}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={discardRecording} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-black text-slate-700"><X size={13} /> Elvetés</button><button type="button" onClick={stopAndTranscribe} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-[9px] font-black text-white"><CircleStop size={13} /> Leállítás és átírás{recordingEstimateHuf > 0 ? ` · kb. ${formatHuf(recordingEstimateHuf)} Ft` : ""}</button></div>
              </div>
            )}
            {recordingError && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[9px] font-semibold text-rose-800">{recordingError}</div>}
            <div className="mt-2 text-[8px] leading-4 text-slate-500">A böngésző mikrofonengedélyt kér. Tárgyalótermi használatnál a laptop vagy konferenciamikrofon minden hallható résztvevőt rögzít.</div>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-white p-3">
            <div className="flex items-center gap-2"><Upload size={15} className="text-indigo-700" /><h4 className="text-[10px] font-black text-slate-950">Meglévő hang- vagy videófájl feltöltése</h4></div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={locked || active} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-[9px] font-black text-indigo-900 disabled:opacity-40">{selectedFile?.type.startsWith("video/") ? <FileVideo size={14} /> : <FileAudio size={14} />} {selectedFile ? `${selectedFile.name} · ${formatBytes(selectedFile.size)}` : "Hang- vagy videófájl kiválasztása"}</button>
            <input ref={fileRef} type="file" accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac,.mov,.mkv,.avi,.aac" className="hidden" onChange={(event) => void handleFileSelection(event.target.files?.[0] || null)} />
            <button type="button" onClick={() => selectedFile && void uploadMedia(selectedFile, "upload", selectedDurationSeconds)} disabled={locked || active || !selectedFile || !config?.configured} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 py-2.5 text-[9px] font-black text-white disabled:opacity-40"><Sparkles size={13} /> Feltöltés és átírás{selectedEstimateHuf > 0 ? ` · kb. ${formatHuf(selectedEstimateHuf)} Ft` : ""}</button>
            <div className="mt-2 text-[8px] leading-4 text-slate-500">Maximum {config?.maxFileSizeMb || 500} MB. A DIMPRO a videóból automatikusan kinyeri a hangot, és a hosszú felvételt feldolgozható részekre bontja.{selectedFile && selectedDurationSeconds > 0 ? ` Becsült időtartam: ${formatDuration(selectedDurationSeconds)}.` : ""}</div>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[8px] leading-4 text-amber-950"><b>Költségbecslés:</b> az indítás előtt látható Ft-összeg tájékoztató felső becslés a média időtartama alapján. A feldolgozás után a DIMPRO az API által visszaadott input- és output-tokenekből számítja ki a tényleges költséget. A beállított árfolyam: {config?.pricing?.usdHufRate || 319} Ft/USD.</div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[8px] font-black uppercase text-slate-600">Nyelv<select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={active} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[9px] font-bold normal-case"><option value="hu">Magyar</option><option value="en">Angol</option><option value="de">Német</option><option value="ro">Román</option><option value="sk">Szlovák</option></select></label>
          <label className="text-[8px] font-black uppercase text-slate-600">Átirat kezelése<select value={mode} onChange={(event) => setMode(event.target.value as "append" | "replace")} disabled={active} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[9px] font-bold normal-case"><option value="append">Meglévő átirat kiegészítése</option><option value="replace">Meglévő átirat teljes cseréje</option></select></label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 text-[8px] font-semibold leading-4 text-slate-700"><input type="checkbox" checked={keepSourceFile} onChange={(event) => setKeepSourceFile(event.target.checked)} disabled={active} /><span>Eredeti média megtartása az értekezletnél</span></label>
        </div>

        {(active || transcription.status === "completed" || transcription.status === "error") && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[10px] font-black text-slate-900">{currentStage || "Feldolgozás"}</div><div className="mt-0.5 truncate text-[8px] text-slate-500">{job?.sourceFileName || transcription.sourceFileName || "-"}</div></div><span className="text-sm font-black text-indigo-800">{currentProgress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, currentProgress))}%` }} /></div>
            {active && !uploading && <button type="button" onClick={() => void patch("cancel").then(() => setStatus("A feldolgozás megszakítása kérve.")).catch((error) => setStatus(error.message))} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[8px] font-black text-rose-700"><PauseCircle size={12} /> Feldolgozás megszakítása</button>}
            {(job?.lastError || transcription.lastError) && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[9px] font-semibold text-rose-800">{job?.lastError || transcription.lastError}</div>}
            {transcription.status === "completed" && <div className="mt-2 flex flex-wrap gap-2 text-[8px] font-semibold text-slate-600"><span>{transcription.lineCount} sor</span><span>·</span><span>{transcription.speakerCount} beszélő</span><span>·</span><span>{formatDuration(transcription.durationSeconds)}</span><span>·</span><span>{transcription.model}</span>{transcription.actualCostHuf > 0 && <><span>·</span><span className="font-black text-emerald-700">Tényleges számított API-költség: {formatHuf(transcription.actualCostHuf)} Ft</span></>}</div>}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2"><UsersRound size={15} className="text-cyan-700" /><h4 className="text-[10px] font-black text-slate-950">Korábbi kollégák hangprofiljai · maximum 4 használható egy feldolgozásnál</h4></div>
          {profiles.length === 0 ? <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-3 text-[9px] text-slate-500">Még nincs jóváhagyott tartós hangprofil. Az első átírás után a Beszélők azonosítása résznél menthető.</div> : <div className="mt-2 grid gap-2 md:grid-cols-2">{profiles.map((profile) => <div key={profile.id} className={`flex items-center gap-2 rounded-lg border p-2 ${selectedProfileIds.includes(profile.id) ? "border-cyan-300 bg-cyan-50" : "border-slate-200"}`}><input type="checkbox" checked={selectedProfileIds.includes(profile.id)} disabled={!profile.active || active || (!selectedProfileIds.includes(profile.id) && selectedProfileIds.length >= 4)} onChange={() => toggleProfile(profile.id)} /><div className="min-w-0 flex-1"><div className="truncate text-[9px] font-black text-slate-900">{profile.name}</div><div className="truncate text-[8px] text-slate-500">{profile.email || profile.organization || "Hangprofil"} · {profile.useCount} használat</div></div><button type="button" onClick={() => void deleteProfile(profile.id, profile.name)} disabled={active} title="Hangprofil törlése" className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-700 disabled:opacity-40"><Trash2 size={12} /></button></div>)}</div>}
          <div className="mt-2 text-[8px] leading-4 text-slate-500">A kiválasztott referenciahangokat a rendszer ismert beszélőként adja át. Az API egyszerre legfeljebb négy ismert személyt támogat.</div>
        </div>

        {transcription.speakers.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-white p-3">
            <div className="flex items-center gap-2"><UserRoundCheck size={15} className="text-emerald-700" /><h4 className="text-[10px] font-black text-slate-950">Beszélők azonosítása és párosítása valós nevekkel</h4></div>
            <div className="mt-2 grid gap-3 xl:grid-cols-2">{transcription.speakers.map((speaker) => {
              const sampleQuery = new URLSearchParams({ meetingId, accessToken, jobId: transcription.jobId, speakerId: speaker.id });
              const checked = selectedSpeakerIds.includes(speaker.id);
              return <div key={speaker.id} className={`rounded-xl border p-3 ${checked ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200"}`}>
                <div className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={() => setSelectedSpeakerIds((current) => current.includes(speaker.id) ? current.filter((id) => id !== speaker.id) : [...current, speaker.id])} /><div className="min-w-0 flex-1"><div className="text-[10px] font-black text-slate-900">{speaker.label}</div><div className="text-[8px] text-slate-500">{speaker.segmentCount} megszólalás</div></div><audio controls preload="none" src={`/api/meeting-assistant/native-transcription/sample?${sampleQuery.toString()}`} className="h-8 max-w-[150px]" /></div>
                <input value={speakerNames[speaker.id] || ""} onChange={(event) => setSpeakerNames((current) => ({ ...current, [speaker.id]: event.target.value }))} placeholder="Valós név" className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-[9px] font-semibold outline-none focus:border-emerald-400" />
                <button type="button" onClick={() => void renameSpeaker(speaker.id)} disabled={workingSpeakerId === speaker.id} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-[8px] font-black text-white disabled:opacity-40">{workingSpeakerId === speaker.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Név alkalmazása minden sorra</button>
                <div className="mt-2 grid grid-cols-2 gap-2"><input value={speakerEmails[speaker.id] || ""} onChange={(event) => setSpeakerEmails((current) => ({ ...current, [speaker.id]: event.target.value }))} placeholder="E-mail (opcionális)" className="rounded-lg border border-slate-200 px-2 py-2 text-[8px]" /><input value={speakerOrganizations[speaker.id] || ""} onChange={(event) => setSpeakerOrganizations((current) => ({ ...current, [speaker.id]: event.target.value }))} placeholder="Szervezet" className="rounded-lg border border-slate-200 px-2 py-2 text-[8px]" /></div>
                <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[8px] leading-4 text-amber-950"><input type="checkbox" checked={Boolean(speakerConsent[speaker.id])} onChange={(event) => setSpeakerConsent((current) => ({ ...current, [speaker.id]: event.target.checked }))} className="mt-0.5" /><span>Az érintett személy hozzájárult, hogy rövid hangreferenciája későbbi DIMPRO beszélőazonosításhoz elmentésre kerüljön.</span></label>
                <button type="button" onClick={() => void saveVoiceProfile(speaker)} disabled={workingSpeakerId === speaker.id || !speakerConsent[speaker.id]} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-[8px] font-black text-amber-950 disabled:opacity-40"><UserRoundCheck size={12} /> Név és tartós hangprofil mentése</button>
              </div>;
            })}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><input value={mergeName} onChange={(event) => setMergeName(event.target.value)} placeholder="A kijelölt hangcímkék közös valós neve" className="rounded-lg border border-slate-200 px-3 py-2 text-[9px]" /><button type="button" onClick={() => void mergeSpeakers()} disabled={selectedSpeakerIds.length < 2 || !mergeName.trim() || workingSpeakerId === "merge"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-[8px] font-black text-white disabled:opacity-40"><Merge size={12} /> Kijelölt címkék összevonása</button></div>
          </div>
        )}

        {nativeLines.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-[10px] font-black text-slate-950">Átirat ellenőrzése és javítása</h4><div className="text-[8px] text-slate-500">Minden sort ellenőrizz az AI-összefoglaló előtt.</div></div><button type="button" onClick={onOpenAi} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-700 px-3 py-2 text-[8px] font-black text-white"><Sparkles size={12} /> AI-összefoglaló készítése</button></div>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">{nativeLines.map((line) => editingLineId === line.id ? <div key={line.id} className="rounded-lg border border-indigo-300 bg-indigo-50 p-2"><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><input value={editingSpeaker} onChange={(event) => setEditingSpeaker(event.target.value)} className="rounded-md border border-slate-200 px-2 py-2 text-[9px] font-bold" /><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} rows={3} className="rounded-md border border-slate-200 px-2 py-2 text-[9px] leading-4" /></div><div className="mt-2 flex flex-wrap items-center gap-2"><label className="flex items-center gap-1 text-[8px] font-semibold"><input type="checkbox" checked={editingShared} onChange={(event) => setEditingShared(event.target.checked)} /> Megosztható sor</label><button type="button" onClick={() => setEditingLineId("")} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[8px] font-black">Mégse</button><button type="button" onClick={() => void saveLine()} disabled={lineWorking} className="rounded-md bg-indigo-700 px-3 py-1.5 text-[8px] font-black text-white">Mentés</button></div></div> : <div key={line.id} className="grid grid-cols-[58px_1fr_auto] gap-2 rounded-lg border border-slate-100 p-2 text-[9px]"><span className="font-mono font-bold text-slate-400">{line.at}</span><button type="button" onClick={() => beginLineEdit(line)} className="min-w-0 text-left"><span className="font-black text-slate-900">{line.speaker}:</span> <span className="leading-4 text-slate-600">{line.text}</span></button><button type="button" onClick={() => void deleteLine(line.id)} disabled={lineWorking} title="Átiratsor törlése" className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-700"><Trash2 size={11} /></button></div>)}</div>
          </div>
        )}

        {transcription.status === "completed" && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[9px] leading-4 text-emerald-900"><CheckCircle2 size={14} className="mt-0.5 shrink-0" /><span>A DIMPRO átirat elkészült. Az A/B/C beszélők valós névhez rendelhetők, az átirat javítható, majd közvetlenül átadható az AI Dokumentumműhelynek.</span></div>}
      </div>
    </div>
  );
}
