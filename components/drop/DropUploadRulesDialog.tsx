"use client";

import { useState } from "react";
import { Scale, ShieldCheck, X } from "lucide-react";
import DropUploadRulesNotice from "./DropUploadRulesNotice";

export function DropRulesButton({
  accepted,
  onClick,
  label = "Szabályok",
}: {
  accepted: boolean;
  onClick: () => void;
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${accepted ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        <Scale size={14} /> {label}{accepted ? " · elfogadva" : ""}
      </button>
      {hovered ? (
        <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-[11px] font-semibold leading-5 text-slate-600 shadow-xl lg:block">
          <strong className="block text-xs text-slate-950">Feltöltési szabályok</strong>
          <span className="mt-1 block">Privát S3-tárhely, kötelező vírusellenőrzés, jogosultság- és lejáratkezelés. Kattintással megnyitható és elfogadható.</span>
        </span>
      ) : null}
    </span>
  );
}

export default function DropUploadRulesDialog({
  open,
  onClose,
  accepted,
  onAcceptedChange,
  resumableEnabled,
  scannerAvailable,
  publicDownloadReady,
}: {
  open: boolean;
  onClose: () => void;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  resumableEnabled: boolean;
  scannerAvailable: boolean;
  publicDownloadReady: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Feltöltési szabályok">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[1.5rem] border border-cyan-200 bg-white p-4 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700"><ShieldCheck size={16} /> DIMPRO Drop</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Feltöltési szabályok és biztonság</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">A rendszer külön jelzi, amikor az aktuális szabályzat elfogadása kötelező. DIMPRO Sendnél az aktuális szabályverzió első három használatakor szükséges; később a szabályzat bármikor újra megnyitható.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600" aria-label="Bezárás"><X size={18} /></button>
        </div>
        <DropUploadRulesNotice
          accepted={accepted}
          onAcceptedChange={onAcceptedChange}
          resumableEnabled={resumableEnabled}
          scannerAvailable={scannerAvailable}
          publicDownloadReady={publicDownloadReady}
        />
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} disabled={!accepted} className="rounded-xl bg-cyan-800 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {accepted ? "Elfogadva · bezárás" : "Elfogadás szükséges"}
          </button>
        </div>
      </div>
    </div>
  );
}
