"use client";

import { Clock3 } from "lucide-react";
import { useSessionTimer } from "./useSessionTimer";

export default function SessionCountdown() {
  const remainingSeconds = useSessionTimer(
    (state) => state.remainingSeconds
  );

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">
      <Clock3 className="h-4 w-4 text-blue-400" />

      <span>
        {String(minutes).padStart(2, "0")}:
        {String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}