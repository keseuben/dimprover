"use client";

import { CheckCircle2, CloudOff, HardDrive, Wifi } from "lucide-react";

export default function OfflineQueueIndicator({ online, localCount, storagePersisted }: { online: boolean; localCount: number; storagePersisted: boolean | null }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={`rounded-2xl border p-2.5 text-center ${online ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        {online ? <Wifi size={17} className="mx-auto text-emerald-700" /> : <CloudOff size={17} className="mx-auto text-amber-700" />}
        <strong className="mt-1 block text-[11px] text-slate-800">{online ? "Online" : "Offline"}</strong>
      </div>
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-2.5 text-center"><HardDrive size={17} className="mx-auto text-cyan-800" /><strong className="mt-1 block text-[11px] text-slate-800">{localCount} helyi kép</strong></div>
      <div className={`rounded-2xl border p-2.5 text-center ${storagePersisted ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><CheckCircle2 size={17} className="mx-auto text-slate-700" /><strong className="mt-1 block text-[11px] text-slate-800">{storagePersisted ? "Tartós tár" : "Helyi tár"}</strong></div>
    </div>
  );
}
