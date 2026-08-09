"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileIcon,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  createStableDropClientUploadId,
  uploadDropInitialized,
  type DropInitializedUpload,
} from "./dropMultipartClient";
import DropUploadRulesNotice from "./DropUploadRulesNotice";
import DropHexUploadZone from "./DropHexUploadZone";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import { createDropClientRandomId } from "./dropClientRandomId";
import { recommendedDropIntentBatchCount, requestDropUploadIntentBatch, type DropClientUploadIntent } from "./dropRobotGuardClient";
import { useDropAutomaticWakeLock } from "./dropMobileEvents";

type InitializedUpload = DropInitializedUpload;

type QueueStatus = "queued" | "initializing" | "uploading" | "finalizing" | "quarantined" | "failed";

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  message: string;
};

const acceptedExtensions = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".csv", ".txt", ".rtf", ".odt", ".ods", ".ppt", ".pptx",
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif", ".ico",
  ".zip", ".dwg", ".dxf", ".ifc", ".ifczip", ".bcf", ".bcfzip", ".xml", ".json", ".eml", ".msg",
].join(",");

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 }).format(current)} ${units[index]}`;
}

export default function DropCapabilityQuarantineUpload({ rawToken, resumableEnabled }: { rawToken: string; resumableEnabled: boolean }) {
  const [uploadedByName, setUploadedByName] = useState("");
  const [uploadedByEmail, setUploadedByEmail] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  useDropAutomaticWakeLock(`capability-uploader:${rawToken.slice(-12)}`, running);
  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file): QueueItem => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${createDropClientRandomId()}`,
      file,
      status: "queued",
      progress: 0,
      message: "Feltöltésre vár",
    }));
    setQueue((items) => [...items, ...next]);
  }, []);

  const updateQueue = useCallback((id: string, patch: Partial<Omit<QueueItem, "id" | "file">>) => {
    setQueue((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const abortInitialized = useCallback(async (initialized: InitializedUpload, reason: string) => {
    await fetch(initialized.abortUrl, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${initialized.uploadToken}`,
      },
      body: JSON.stringify({ reason }),
    }).catch(() => undefined);
  }, []);

  const runQueue = useCallback(async () => {
    if (running || !uploadedByName.trim() || !rulesAccepted) return;
    setRunning(true);
    setMessage("");
    const pending = queue.filter((item) => item.status === "queued" || item.status === "failed");
    let intentPool: DropClientUploadIntent[] = [];
    try {
      for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      if (!intentPool.length) {
        setMessage("Robotvédelmi ellenőrzés és biztonságos feltöltési engedély előkészítése…");
        intentPool = await requestDropUploadIntentBatch({
          endpoint: "/api/drop/access/uploads/intent",
          count: recommendedDropIntentBatchCount(pending.slice(index).map((candidate) => candidate.file.size)),
          authorization: `Bearer ${rawToken}`,
        });
        setMessage("");
      }
      const robotIntent = intentPool.shift();
      if (!robotIntent) throw new Error("A feltöltési biztonsági engedély hiányzik.");
      let initialized: InitializedUpload | null = null;
      try {
        updateQueue(item.id, { status: "initializing", progress: 0, message: "Biztonságos munkamenet létrehozása…" });
        const initResponse = await fetch("/api/drop/access/uploads/init", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${rawToken}`,
          },
          body: JSON.stringify({
            fileName: item.file.name,
            sizeBytes: item.file.size,
            mimeType: item.file.type || "application/octet-stream",
            clientUploadId: createStableDropClientUploadId("capability", item.file),
            uploadedByName: uploadedByName.trim(),
            uploadedByEmail: uploadedByEmail.trim(),
            rulesAccepted: true,
            rulesVersion: DROP_UPLOAD_RULES_VERSION,
            rulesAcceptedAt: new Date().toISOString(),
            robotGuard: { intentToken: robotIntent.token, website },
          }),
        });
        const initPayload = await initResponse.json() as { initialized?: InitializedUpload; error?: string };
        if (!initResponse.ok || !initPayload.initialized) throw new Error(initPayload.error || "A feltöltési munkamenet nem hozható létre.");
        initialized = initPayload.initialized;
        updateQueue(item.id, { status: "uploading", progress: 0, message: "Fájl küldése…" });
        await uploadDropInitialized({
          initialized,
          file: item.file,
          onProgress: (progress, detail) => updateQueue(item.id, { progress, message: detail }),
        });
        updateQueue(item.id, { status: "finalizing", progress: 100, message: "Szerkezeti ellenőrzés és karantén…" });
        const completeResponse = await fetch(initialized.completeUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${initialized.uploadToken}` },
        });
        const completePayload = await completeResponse.json() as { error?: string };
        if (!completeResponse.ok) throw new Error(completePayload.error || "A feltöltés véglegesítése sikertelen.");
        updateQueue(item.id, { status: "quarantined", progress: 100, message: "Karanténban · vírusellenőrzésre vár" });
        initialized = null;
      } catch (error) {
        const failure = error instanceof Error ? error.message : "A feltöltés sikertelen.";
        if (initialized && initialized.protocol !== "multipart") await abortInitialized(initialized, failure);
        updateQueue(item.id, {
          status: "failed",
          message: initialized?.protocol === "multipart" ? `${failure} Újrapróbáláskor a kész részek megmaradnak.` : failure,
        });
      }
      }
      setMessage("A sikeresen fogadott fájlok privát karanténba kerültek. Letöltésük még nem engedélyezett.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A robotvédelmi feltöltési előkészítés sikertelen.");
    } finally {
      setRunning(false);
    }
  }, [abortInitialized, queue, rawToken, rulesAccepted, running, updateQueue, uploadedByEmail, uploadedByName, website]);

  const totalProgress = useMemo(() => {
    const totalBytes = queue.reduce((sum, item) => sum + item.file.size, 0);
    if (!totalBytes) return 0;
    const completed = queue.reduce((sum, item) => sum + item.file.size * (item.progress / 100), 0);
    return Math.round((completed / totalBytes) * 100);
  }, [queue]);

  return (
    <section className="mt-6 rounded-[1.5rem] border border-cyan-200 bg-cyan-50/60 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-cyan-800" size={22} />
        <div>
          <h2 className="text-lg font-black text-slate-950">{resumableEnabled ? "Folytatható privát karanténfeltöltés" : "Privát karanténfeltöltés"}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{resumableEnabled
            ? "Legfeljebb 500 MB-os fájl tölthető fel 64 MB-os részekben. Megszakadás után ugyanazt a fájlt újra kiválasztva a rendszer a hiányzó részekkel folytatja. A fájl víruskereső hiányában nem tölthető le."
            : "A jelenlegi átmeneti módban legfeljebb 9 MB-os fájl tölthető fel. A feltöltés szerveridős robotvédelemmel indul. A fájl víruskereső hiányában nem tölthető le."}</p>
        </div>
      </div>

      <div className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>Weboldal<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">Feltöltő neve</span><input value={uploadedByName} onChange={(event) => setUploadedByName(event.target.value)} className={inputClass} maxLength={160} /></label>
        <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">Feltöltő e-mail-címe</span><input type="email" value={uploadedByEmail} onChange={(event) => setUploadedByEmail(event.target.value)} className={inputClass} maxLength={254} placeholder="Opcionális" /></label>
      </div>
      <DropUploadRulesNotice
        accepted={rulesAccepted}
        onAcceptedChange={setRulesAccepted}
        resumableEnabled={resumableEnabled}
      />

      <div className="mt-4">
        <DropHexUploadZone accept={acceptedExtensions} disabled={!rulesAccepted || running} busy={running} imageMode allowCamera title="Fájlok és képek hozzáadása" description="Húzza a fájlokat a DIMPRO hexagonra, vagy válasszon a galériából és a fájlrendszerből." progress={totalProgress} onFiles={(files) => addFiles(files)} />
        {!running && queue.length ? <button type="button" onClick={() => setQueue([])} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><Trash2 size={15} /> Lista ürítése</button> : null}
      </div>

      {queue.length ? (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Feltöltési sor</p><strong className="text-xs text-cyan-800">{totalProgress}%</strong></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-700 transition-[width]" style={{ width: `${totalProgress}%` }} /></div>
          <div className="mt-3 space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <StatusIcon status={item.status} />
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-950">{item.file.name}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{formatBytes(item.file.size)} · {item.message}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${item.status === "failed" ? "bg-rose-600" : item.status === "quarantined" ? "bg-amber-500" : "bg-cyan-700"}`} style={{ width: `${item.progress}%` }} /></div></div>
                  {!running && ["queued", "failed"].includes(item.status) ? <button type="button" onClick={() => setQueue((items) => items.filter((candidate) => candidate.id !== item.id))} className="rounded-lg border border-slate-300 p-2 text-slate-500"><X size={13} /></button> : null}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => void runQueue()} disabled={running || !rulesAccepted || !uploadedByName.trim() || !queue.some((item) => item.status === "queued" || item.status === "failed")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{running ? <LoaderCircle size={17} className="animate-spin" /> : <UploadCloud size={17} />} {running ? "Feltöltés folyamatban…" : "Feltöltés indítása"}</button>
        </div>
      ) : null}
      {message ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">{message}</div> : null}
    </section>
  );
}

function StatusIcon({ status }: { status: QueueStatus }) {
  if (status === "quarantined") return <CheckCircle2 className="mt-0.5 shrink-0 text-amber-600" size={17} />;
  if (status === "failed") return <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={17} />;
  if (status === "queued") return <FileIcon className="mt-0.5 shrink-0 text-slate-500" size={17} />;
  return <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-cyan-700" size={17} />;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";
