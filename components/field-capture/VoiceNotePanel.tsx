"use client";

import { Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";
import { DimproBrowserVoiceSession, dimproBrowserVoiceSupported } from "@/components/drop/dropBrowserVoiceSession";
import { requestDropMicrophonePermission } from "@/components/drop/dropVoicePermission";

export default function VoiceNotePanel({ value, onCommit, autoSuggested = false }: { value: string; onCommit: (text: string) => void; autoSuggested?: boolean }) {
  const sessionRef = useRef<DimproBrowserVoiceSession | null>(null);
  const [listening, setListening] = useState(false);
  const [preview, setPreview] = useState("");
  const [detail, setDetail] = useState(autoSuggested ? "A képhez hangos megjegyzést kért." : "");

  const start = async () => {
    if (!dimproBrowserVoiceSupported()) { setDetail("Ezen a böngészőn a közvetlen beszédfelismerés nem érhető el."); return; }
    try {
      await requestDropMicrophonePermission();
      const base = value.trim();
      const session = new DimproBrowserVoiceSession({
        onTranscript: (text) => setPreview(text),
        onState: (_state, stateDetail) => setDetail(stateDetail),
        onEnd: ({ text, commit }) => {
          sessionRef.current = null;
          setListening(false);
          setPreview("");
          if (commit && text.trim()) onCommit([base, text.trim()].filter(Boolean).join(base ? " " : ""));
          setDetail(commit ? "Átirat elkészült. Mentés előtt még szerkeszthető." : "A diktálás megszakítva.");
        },
      });
      sessionRef.current = session;
      setListening(true);
      setPreview("");
      session.start();
    } catch (error) {
      setListening(false);
      setDetail(error instanceof Error ? error.message : "A mikrofon nem indítható.");
    }
  };

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={listening ? () => sessionRef.current?.stop(true) : () => void start()} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black ${listening ? "bg-rose-700 text-white" : "bg-white text-violet-800"}`}>
          {listening ? <MicOff size={16} /> : <Mic size={16} />}{listening ? "Leállítás" : "Diktálás"}
        </button>
        <span className="text-[11px] font-semibold leading-5 text-violet-900">{detail}</span>
      </div>
      {preview ? <p className="mt-2 rounded-xl bg-white p-2 text-xs leading-5 text-slate-700"><strong>Élő átirat:</strong> {preview}</p> : null}
    </div>
  );
}
