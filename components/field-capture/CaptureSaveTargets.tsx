"use client";

import { Cloud, FolderKanban } from "lucide-react";
import CaptureToggleRow from "./CaptureToggleRow";
import type { PreCaptureOptions } from "@/app/lib/field-capture/types";

export default function CaptureSaveTargets({ value, onChange }: { value: PreCaptureOptions; onChange: (next: PreCaptureOptions) => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-emerald-700" />
          <strong className="text-sm text-slate-950">Terepi Gyorsrögzítő</strong>
          <span className="ml-auto rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-emerald-800">mindig</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600">A kép először a helyi terepi munkamenetbe kerül, hálózat nélkül is.</p>
      </div>
      <CaptureToggleRow title="Mentés a telefonra is" description="Az eredeti kameraképet külön letöltési művelettel megőrzi ezen az eszközön." checked={value.saveToDevice} onChange={(checked) => onChange({ ...value, saveToDevice: checked })} />
      <CaptureToggleRow title="Saját DIMPRO Drive" description="A külön felhasználói ownership és célmappa a P8 fázisban aktiválódik." checked={value.saveToUserDrive} onChange={(checked) => onChange({ ...value, saveToUserDrive: checked })} disabled badge="P8" />
      <CaptureToggleRow title="Projektkapu Drive" description="Projekt ACL-lel és külön lifecycle-lal a P9 fázisban aktiválódik." checked={value.saveToProjectDrive} onChange={(checked) => onChange({ ...value, saveToProjectDrive: checked })} disabled badge="P9" />
      <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
        <Cloud size={16} className="mt-0.5 shrink-0" />
        A Drive-célok külön referenciát kapnak majd; egyik cél törlése nem törölheti a másik példányát.
      </div>
    </div>
  );
}
