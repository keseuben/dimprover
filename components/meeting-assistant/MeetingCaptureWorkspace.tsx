"use client";

import { ExternalLink, Loader2, MonitorUp, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import MeetingAttachmentEditor, { type MeetingAttachmentEditorSource } from "./MeetingAttachmentEditor";
import { readJsonResponse } from "./safeJson";

export default function MeetingCaptureWorkspace({ meetingId, accessToken }: { meetingId: string; accessToken: string }) {
  const [workspace, setWorkspace] = useState<MeetingWorkspace | null>(null);
  const [source, setSource] = useState<MeetingAttachmentEditorSource | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState("Kattints a gombra, majd válaszd ki a rögzítendő képernyőt vagy alkalmazásablakot.");
  const [actorName, setActorName] = useState("Szervező");

  const loadWorkspace = useCallback(async () => {
    const response = await fetch(`/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(accessToken)}`, { cache: "no-store" });
    const data = await readJsonResponse<{ workspace?: MeetingWorkspace; error?: string }>(response, "Az értekezleti munkatér nem tölthető be.");
    if (!response.ok || !data.workspace) throw new Error(data.error || "Az értekezleti munkatér nem tölthető be.");
    setWorkspace(data.workspace);
    setActorName(data.workspace.organizerName || data.workspace.chairpersonName || "Szervező");
  }, [accessToken, meetingId]);

  useEffect(() => {
    void loadWorkspace().catch((error) => setStatus(error instanceof Error ? error.message : "A munkatér betöltése sikertelen."));
  }, [loadWorkspace]);

  async function closeDialog(result?: object) {
    try {
      const { app, dialog } = await import("@microsoft/teams-js");
      await app.initialize();
      if (dialog.url.isSupported()) {
        dialog.url.submit(result || { closed: true });
        return;
      }
    } catch {
      // Böngészős ablakban a Teams dialog API nem érhető el.
    }
    window.close();
  }

  async function captureScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus("Ez a Teams-kliens vagy böngésző nem támogatja a képernyő vagy alkalmazásablak rögzítését. Próbáld meg a Teams asztali kliensben vagy Microsoft Edge böngészőben.");
      return;
    }
    setCapturing(true);
    setStatus("Válaszd ki a rögzítendő képernyőt, ablakot vagy böngészőlapot.");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("A kiválasztott képernyő képe nem érkezett meg időben.")), 15000);
        video.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          void video.play().then(() => resolve()).catch(reject);
        };
      });
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, video.videoWidth);
      canvas.height = Math.max(1, video.videoHeight);
      const context = canvas.getContext("2d");
      if (!context || canvas.width <= 1 || canvas.height <= 1) throw new Error("A kiválasztott képernyőről nem készült értékelhető kép.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const capturedAt = new Date();
      setSource({
        originalName: `teams_kepernyoreszlet_${capturedAt.toISOString().replace(/[:.]/g, "-")}.png`,
        mimeType: "image/png",
        uploadedBy: actorName,
        initialDataUrl: canvas.toDataURL("image/png"),
        title: `Értekezleti képernyőrészlet ${capturedAt.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`,
        description: "",
        agendaItemId: workspace?.currentAgendaItemId || "",
        includeInAi: true,
        sourceType: "screen_capture",
        status: "approved",
      });
      setStatus("A képernyőkép elkészült. Használd a Képmetszőt, a jelölőeszközöket vagy a Szöveg eszközt, majd mentsd az asszisztensbe.");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "AbortError") setStatus("A képernyő vagy alkalmazásablak kiválasztása megszakadt, illetve az engedély nem lett megadva.");
      else setStatus(error instanceof Error ? error.message : "A képernyőrögzítés sikertelen.");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setCapturing(false);
    }
  }

  if (source && workspace) {
    return (
      <div className="h-screen min-h-0 bg-slate-950">
        <MeetingAttachmentEditor
          meetingId={meetingId}
          accessToken={accessToken}
          role="organizer"
          actorName={actorName}
          agenda={workspace.agenda}
          source={source}
          onClose={() => setSource(null)}
          onSaved={async () => {
            await loadWorkspace();
            await closeDialog({ saved: true, meetingId });
          }}
        />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col rounded-3xl border border-white/15 bg-white/8 shadow-2xl backdrop-blur sm:min-h-[calc(100vh-4rem)]">
        <header className="flex items-center gap-4 border-b border-white/10 p-4 sm:p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300"><MonitorUp size={25} /></span>
          <div className="min-w-0 flex-1"><h1 className="text-xl font-black sm:text-2xl">Képernyőrögzítő és mellékletszerkesztő</h1><p className="mt-1 text-sm text-slate-300">DIMPRO Értekezleti Kísérő · {workspace?.title || meetingId}</p></div>
          <button type="button" onClick={() => void closeDialog()} title="Bezárás" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/15"><X size={20} /></button>
        </header>

        <section className="flex flex-1 items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/10 p-6 text-center shadow-xl sm:p-10">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-cyan-400/15 text-cyan-300"><MonitorUp size={38} /></span>
            <h2 className="mt-6 text-2xl font-black">Képernyő vagy alkalmazásablak kiválasztása</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-300">A Teams vagy a böngésző megmutatja a megosztható képernyőket és alkalmazásablakokat. A DIMPRO csak a kiválasztás után készít egyetlen állóképet, majd a megosztást azonnal leállítja.</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={() => void captureScreen()} disabled={capturing || !workspace} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-cyan-400 px-6 py-3 text-base font-black text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{capturing ? <Loader2 size={20} className="animate-spin" /> : <MonitorUp size={20} />} Képernyő vagy alkalmazásablak kiválasztása</button>
              <button type="button" onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15"><ExternalLink size={18} /> Megnyitás külső böngészőben</button>
            </div>
            <div className="mt-6 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-left text-sm leading-6 text-sky-100"><div className="flex items-start gap-3"><ShieldCheck size={21} className="mt-0.5 shrink-0" /><p>{status}</p></div><p className="mt-3 border-t border-sky-200/15 pt-3 text-xs text-sky-100/80">Ha a Teams beágyazott ablaka nem jeleníti meg a képernyőválasztót, használd a Megnyitás külső böngészőben gombot. A mentés ugyanabba az értekezleti munkatérbe történik.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}
