"use client";

import { useId } from "react";
import { AlertTriangle, Check, Clock3, FileArchive, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import {
  DROP_UPLOAD_ALLOWED_GROUPS,
  DROP_UPLOAD_RULE_ITEMS,
  DROP_UPLOAD_RULES_EFFECTIVE_DATE,
  DROP_UPLOAD_RULES_VERSION,
} from "@/app/lib/drop/dropUploadRules";

export default function DropUploadRulesNotice({
  accepted,
  onAcceptedChange,
  resumableEnabled,
  scannerAvailable = false,
  publicDownloadReady = false,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  resumableEnabled: boolean;
  scannerAvailable?: boolean;
  publicDownloadReady?: boolean;
}) {
  const checkboxId = useId();
  return (
    <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-cyan-800" size={21} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">Feltöltési szabályok és biztonsági tájékoztató</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {resumableEnabled
              ? "Maximum 500 MB/fájl, 64 MB-os folytatható részekben."
              : "Az átmeneti egykéréses feltöltési korlát 9 MB/fájl."}
            {" "}A fájl a vírusellenőrzés végéig privát karanténban marad.
          </p>
          <p className={`mt-1 text-xs font-bold ${scannerAvailable && publicDownloadReady ? "text-emerald-800" : "text-amber-800"}`}>
            {scannerAvailable && publicDownloadReady
              ? "A ClamAV ellenőrzés aktív; a tiszta fájlok rövid feldolgozás után letölthetők."
              : "A fájl feltölthető, de letöltés csak sikeres vírusellenőrzés után engedélyezhető."}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Verzió: {DROP_UPLOAD_RULES_VERSION} · Hatályos: {DROP_UPLOAD_RULES_EFFECTIVE_DATE}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-700"><FileArchive size={14} /> Méretkorlát</p>
          <strong className="mt-2 block text-sm text-slate-950">{resumableEnabled ? "500 MB / fájl" : "9 MB / fájl"}</strong>
          <span className="mt-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-900">
            Hamarosan: akár 2 GB / fájl
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-700"><RotateCcw size={14} /> Folytathatóság</p>
          <strong className="mt-2 block text-sm text-slate-950">{resumableEnabled ? "Megszakítás után folytatható" : "Egykéréses feltöltés"}</strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-700"><LockKeyhole size={14} /> Hozzáférés</p>
          <strong className="mt-2 block text-sm text-slate-950">PIN és jogosultságvédelem</strong>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-700"><Clock3 size={14} /> Megőrzés</p>
          <strong className="mt-2 block text-sm text-slate-950">A csomag lejárata szerint</strong>
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer select-none text-xs font-black text-slate-900">Részletes feltöltési szabályok</summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-slate-700">
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3">
            <p className="flex items-center gap-2 font-black text-cyan-950"><FileArchive size={15} /> Engedélyezett fájlcsoportok</p>
            <ul className="mt-2 space-y-1 pl-4">
              {DROP_UPLOAD_ALLOWED_GROUPS.map((item) => <li key={item} className="list-disc">{item}</li>)}
            </ul>
          </div>
          <ol className="space-y-2 pl-5">
            {DROP_UPLOAD_RULE_ITEMS.map((item, index) => <li key={item} className="list-decimal"><strong>{index + 1}.</strong> {item}</li>)}
          </ol>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <p>A szabályellenes, veszélyes, sérült vagy nem ellenőrizhető fájlt a rendszer elutasíthatja, karanténban tarthatja vagy a kvóta visszaengedése mellett törölheti.</p>
          </div>
        </div>
      </details>

      <label htmlFor={checkboxId} className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${accepted ? "border-lime-300 bg-lime-50" : "border-slate-300 bg-white"}`}>
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${accepted ? "border-lime-700 bg-lime-700 text-white" : "border-slate-400 bg-white"}`}>
          {accepted ? <Check size={14} strokeWidth={3} /> : null}
        </span>
        <input id={checkboxId} type="checkbox" checked={accepted} onChange={(event) => onAcceptedChange(event.target.checked)} className="sr-only" />
        <span className="text-xs font-bold leading-5 text-slate-800">
          Elolvastam és elfogadom a feltöltési szabályokat. Kijelentem, hogy jogosult vagyok a kiválasztott fájlok továbbítására.
        </span>
      </label>
    </div>
  );
}
