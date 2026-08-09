"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileUp, Loader2, RefreshCw, Save, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import { readJsonResponse } from "./safeJson";

type Props = {
  meetingId: string;
  accessToken: string;
  workspace: MeetingWorkspace;
  locked: boolean;
  teamsGraphEnabled?: boolean;
  refreshWorkspace: () => Promise<void>;
  setStatus: (message: string) => void;
};

type GraphConfig = {
  configured: boolean;
  tenantIdConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
};

const STATUS_LABEL: Record<MeetingWorkspace["teamsTranscript"]["status"], string> = {
  not_configured: "Nincs összekapcsolva",
  ready: "Kapcsolat mentve",
  syncing: "Szinkronizálás folyamatban",
  available: "Átirat elérhető",
  not_found: "Még nincs elérhető átirat",
  permission_required: "Microsoft jogosultság szükséges",
  error: "Szinkronizálási hiba",
};

export default function MeetingTeamsTranscriptSection({
  meetingId,
  accessToken,
  workspace,
  locked,
  teamsGraphEnabled = true,
  refreshWorkspace,
  setStatus,
}: Props) {
  const [graphConfig, setGraphConfig] = useState<GraphConfig | null>(null);
  const [organizerUserId, setOrganizerUserId] = useState(workspace.teamsTranscript.organizerUserId || "");
  const [graphOnlineMeetingId, setGraphOnlineMeetingId] = useState(workspace.teamsTranscript.graphOnlineMeetingId || "");
  const [working, setWorking] = useState(false);
  const [autoWatchEnabled, setAutoWatchEnabled] = useState(Boolean(workspace.teamsTranscript.autoWatchEnabled));
  const [manualOpen, setManualOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importing, setImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOrganizerUserId(workspace.teamsTranscript.organizerUserId || "");
    setGraphOnlineMeetingId(workspace.teamsTranscript.graphOnlineMeetingId || "");
    setAutoWatchEnabled(Boolean(workspace.teamsTranscript.autoWatchEnabled));
  }, [workspace.teamsTranscript.autoWatchEnabled, workspace.teamsTranscript.graphOnlineMeetingId, workspace.teamsTranscript.organizerUserId]);

  useEffect(() => {
    if (!teamsGraphEnabled) {
      setGraphConfig(null);
      return;
    }
    const query = new URLSearchParams({ meetingId });
    if (accessToken) query.set("accessToken", accessToken);
    fetch(`/api/meeting-assistant/transcript?${query.toString()}`, { cache: "no-store" })
      .then((response) => readJsonResponse<{ config?: GraphConfig }>(response, "A Microsoft Graph állapota nem tölthető be."))
      .then((data) => setGraphConfig(data.config || null))
      .catch(() => setGraphConfig(null));
  }, [accessToken, meetingId, teamsGraphEnabled]);

  async function request(operation: "configure" | "sync") {
    if (!teamsGraphEnabled) return;
    setWorking(true);
    try {
      const response = await fetch("/api/meeting-assistant/transcript", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          operation,
          organizerUserId,
          graphOnlineMeetingId,
          autoWatchEnabled,
          accessToken,
        }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; importedNow?: number }>(response, "A Teams átiratművelet sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "A Teams átiratművelet sikertelen.");
      await refreshWorkspace();
      setStatus(operation === "configure"
        ? "A Microsoft Teams átiratkapcsolat adatai mentve."
        : `${data.importedNow || 0} új Teams átiratsor beolvasva.`);
    } catch (error) {
      await refreshWorkspace().catch(() => undefined);
      setStatus(error instanceof Error ? error.message : "A Teams átiratművelet sikertelen.");
    } finally {
      setWorking(false);
    }
  }

  async function importManualTranscript() {
    const file = fileRef.current?.files?.[0];
    if (!file && !pastedText.trim()) {
      setStatus("Válassz VTT, DOCX vagy TXT fájlt, illetve illeszd be az átirat szövegét.");
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.set("meetingId", meetingId);
      form.set("accessToken", accessToken);
      form.set("mode", importMode);
      form.set("pastedText", pastedText);
      if (file) form.set("file", file);
      const response = await fetch("/api/meeting-assistant/transcript-import", { method: "POST", body: form });
      const data = await readJsonResponse<{ ok?: boolean; error?: string; importedNow?: number; speakerCount?: number; speakers?: string[] }>(response, "Az átirat importálása sikertelen.");
      if (!response.ok || !data.ok) throw new Error(data.error || "Az átirat importálása sikertelen.");
      await refreshWorkspace();
      setStatus(`${data.importedNow || 0} átiratsor importálva · ${data.speakerCount || 0} azonosított beszélő. Az anyag AI-feldolgozásra kész.`);
      setPastedText("");
      setSelectedFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Az átirat importálása sikertelen.");
    } finally {
      setImporting(false);
    }
  }

  const integration = workspace.teamsTranscript;
  const graphReady = Boolean(graphConfig?.configured);
  const frameClass = teamsGraphEnabled ? "border-sky-200 bg-sky-50/60" : "border-violet-200 bg-violet-50/50";
  const headerClass = teamsGraphEnabled ? "border-sky-200" : "border-violet-200";

  return (
    <div className={`mb-3 overflow-hidden rounded-xl border ${frameClass}`}>
      <div className={`flex items-start gap-2 border-b px-3 py-2.5 ${headerClass}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${teamsGraphEnabled ? "bg-sky-600" : "bg-violet-700"}`}>
          {teamsGraphEnabled ? <RefreshCw size={15} className={working ? "animate-spin" : ""} /> : <FileUp size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black text-slate-900">{teamsGraphEnabled ? "Microsoft Teams és kézi átiratimport" : "Kézi átiratimport"}</div>
          <div className="mt-0.5 text-[9px] leading-4 text-slate-600">
            {teamsGraphEnabled
              ? "A Teams által elkészített átirat Graph-kapcsolattal vagy kézi VTT/DOCX/TXT importtal tölthető be."
              : "Korábban elkészített VTT, DOCX vagy TXT átirat, illetve beillesztett szöveg tölthető be a személyes értekezlethez."}
          </div>
        </div>
        {teamsGraphEnabled && (
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${integration.status === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : integration.status === "error" || integration.status === "permission_required" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-200 bg-white text-sky-700"}`}>
            {STATUS_LABEL[integration.status]}
          </span>
        )}
      </div>

      <div className="space-y-3 p-3">
        {teamsGraphEnabled && (
          <>
            {!graphReady && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[9px] leading-4 text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>A szerveroldali Microsoft Graph kapcsolat még nincs teljesen beállítva. Szükséges a tenant ID, kliens ID, kliens titok, az <b>OnlineMeetingTranscript.Read.All</b> jogosultság és a Teams Admin Center Transcript API hozzáférésének engedélyezése.</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                Szervező Entra felhasználóazonosító
                <input value={organizerUserId} onChange={(event) => setOrganizerUserId(event.target.value)} disabled={locked || working} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-sky-400 disabled:opacity-50" />
              </label>
              <label className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                Graph onlineMeeting azonosító
                <input value={graphOnlineMeetingId} onChange={(event) => setGraphOnlineMeetingId(event.target.value)} disabled={locked || working} placeholder="MS... onlineMeeting ID" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-sky-400 disabled:opacity-50" />
              </label>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2 text-[9px] font-semibold leading-4 text-cyan-950">
              <input type="checkbox" checked={autoWatchEnabled} onChange={(event) => setAutoWatchEnabled(event.target.checked)} disabled={locked || working} className="mt-0.5" />
              <span><b>Automatikus átiratfigyelés az értekezlet után.</b> A munkamenet bezárható; a DIMPRO később újra megpróbálhatja a Graph-importot, amikor a Teams átirat elérhetővé válik.</span>
            </label>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[9px] leading-4 text-slate-600">
              <div><b>Teams panel meeting ID:</b> {meetingId}</div>
              <div><b>Utolsó szinkron:</b> {integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString("hu-HU") : "még nem történt"}</div>
              <div><b>Beolvasott sor:</b> {integration.importedLineCount} · <b>Beszélők azonosítása:</b> {integration.speakerAttribution ? "engedélyezett" : "nem elérhető"}</div>
            </div>

            {integration.lastError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[9px] leading-4 text-rose-800">{integration.lastError}</div>}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void request("configure")} disabled={locked || working} className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-[9px] font-black text-sky-800 disabled:opacity-40">
                {working ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Kapcsolat mentése
              </button>
              <button type="button" onClick={() => void request("sync")} disabled={locked || working || !organizerUserId.trim() || !graphOnlineMeetingId.trim()} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-[9px] font-black text-white disabled:opacity-40">
                {working ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Teams átirat szinkronizálása
              </button>
            </div>
          </>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setManualOpen((current) => !current)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-800"><FileUp size={14} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black text-slate-900">{teamsGraphEnabled ? "Átirat kézi importálása" : "Személyes értekezlet átiratának importálása"}</span>
              <span className="block text-[8px] text-slate-500">VTT, DOCX, TXT vagy beillesztett szöveg</span>
            </span>
            {manualOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {manualOpen && (
            <div className="space-y-3 border-t border-slate-200 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={locked || importing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[9px] font-black text-violet-900 disabled:opacity-40"><Upload size={13} /> {selectedFileName || "VTT / DOCX / TXT fájl kiválasztása"}</button>
                <select value={importMode} onChange={(event) => setImportMode(event.target.value as "append" | "replace")} disabled={locked || importing} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-bold"><option value="append">Meglévő átirat kiegészítése</option><option value="replace">Meglévő átirat teljes cseréje</option></select>
              </div>
              <input ref={fileRef} type="file" accept=".vtt,.docx,.txt,text/vtt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name || "")} />
              <textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} disabled={locked || importing} rows={5} placeholder={teamsGraphEnabled ? "Vagy illeszd be ide a Teamsből letöltött vagy kimásolt átirat szövegét..." : "Vagy illeszd be ide a személyes értekezlet korábban elkészített átiratát..."} className="w-full resize-y rounded-lg border border-slate-200 p-2.5 text-[10px] leading-5 outline-none focus:border-violet-400 disabled:opacity-50" />
              <button type="button" onClick={() => void importManualTranscript()} disabled={locked || importing || (!selectedFileName && !pastedText.trim())} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2.5 text-[9px] font-black text-white disabled:opacity-40">{importing ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Átirat importálása a DIMPRO-ba</button>
              <div className="text-[8px] leading-4 text-slate-500">Az eredeti fájlt a DIMPRO alapértelmezetten nem tárolja el; csak a feldolgozott átiratsorok kerülnek az értekezlethez. Az import után az AI Dokumentumműhely használható.</div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 text-[9px] leading-4 text-slate-500">
          {teamsGraphEnabled && integration.status === "available" ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" /> : <ShieldCheck size={13} className="mt-0.5 shrink-0 text-violet-600" />}
          <span>A beolvasott sorok alapértelmezetten privát szervezői átiratként kerülnek be. Közzététel és AI-jegyzőkönyv előtt ellenőrizni kell őket.</span>
        </div>
      </div>
    </div>
  );
}
