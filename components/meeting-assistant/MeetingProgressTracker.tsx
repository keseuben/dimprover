"use client";

import { AlertTriangle, Check, ChevronDown, ChevronUp, Circle, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateMeetingProgress, type MeetingProgressStatus } from "@/app/lib/meeting-assistant/progress";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

const STATUS_CLASS: Record<MeetingProgressStatus, string> = {
  not_started: "bg-slate-300 text-slate-600",
  in_progress: "bg-teal-500 text-white",
  complete: "bg-emerald-500 text-white",
  warning: "bg-amber-400 text-amber-950",
};

function StepIcon({ status }: { status: MeetingProgressStatus }) {
  if (status === "complete") return <Check size={11} />;
  if (status === "warning") return <AlertTriangle size={10} />;
  if (status === "in_progress") return <LoaderCircle size={11} />;
  return <Circle size={8} />;
}

export default function MeetingProgressTracker({ workspace, role }: { workspace: MeetingWorkspace; role: MeetingViewRole }) {
  const [expanded, setExpanded] = useState(false);
  const progress = useMemo(() => calculateMeetingProgress(workspace), [workspace]);

  function openSection(sectionId: string) {
    const targetSectionId = role === "participant" && sectionId === "meeting-closure" ? "meeting-live-minutes" : sectionId;
    window.dispatchEvent(new CustomEvent("dimpro-meeting-section", { detail: { id: targetSectionId, scope: role } }));
    window.setTimeout(() => {
      const panels = Array.from(document.querySelectorAll<HTMLElement>(`[data-meeting-panel-role="${role}"]`));
      const panel = panels.find((item) => item.offsetParent !== null) || panels[0];
      const target = panel?.querySelector<HTMLElement>(`#${targetSectionId}`);
      const container = panel?.querySelector<HTMLElement>("[data-meeting-scroll-container]");
      if (!target || !container) return;
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({ top: Math.max(0, container.scrollTop + targetRect.top - containerRect.top), behavior: "smooth" });
    }, 90);
  }

  return (
    <div className="border-b border-slate-200 bg-white px-2 py-2">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 text-left" aria-expanded={expanded}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">{progress.label}</span>
            <span className="text-[11px] font-black text-slate-900">{progress.percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-all duration-500 ${progress.status === "complete" ? "bg-emerald-500" : progress.status === "warning" ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="shrink-0 text-slate-400" /> : <ChevronDown size={14} className="shrink-0 text-slate-400" />}
      </button>

      <div className="mt-2 flex items-start gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {progress.steps.map((step, index) => (
          <div key={step.id} className="flex min-w-0 flex-1 items-start">
            <button type="button" onClick={() => openSection(step.sectionId)} title={`${step.label}: ${step.percent}%`} className="group flex min-w-[52px] flex-1 flex-col items-center text-center">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${STATUS_CLASS[step.status]}`}><StepIcon status={step.status} /></span>
              <span className="mt-1 max-w-[74px] text-[7px] font-bold leading-3 text-slate-500 group-hover:text-teal-700">{step.shortLabel}</span>
            </button>
            {index < progress.steps.length - 1 && <span className={`mt-2 h-0.5 min-w-2 flex-1 ${step.status === "complete" ? "bg-emerald-400" : step.status === "warning" ? "bg-amber-300" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      {expanded && role === "organizer" && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Következő teendők</div>
          {progress.issues.length === 0 ? (
            <div className="mt-1 text-[9px] font-bold text-emerald-700">Minden ellenőrzött terület elkészült.</div>
          ) : (
            <div className="mt-1 space-y-1">
              {progress.issues.slice(0, 6).map((issue, index) => <div key={`${index}-${issue}`} className="flex gap-1.5 text-[9px] leading-4 text-slate-600"><AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-500" /><span>{issue}</span></div>)}
              {progress.issues.length > 6 && <div className="text-[8px] font-bold text-slate-400">+ {progress.issues.length - 6} további ellenőrzési pont</div>}
            </div>
          )}
        </div>
      )}

      {expanded && role === "participant" && (
        <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50 p-2 text-[9px] font-semibold leading-4 text-teal-900">
          {workspace.status === "published" || workspace.status === "archived"
            ? "Az értekezleti összefoglaló elkészült és közzétett állapotban van."
            : workspace.activePublishedSummaryId
              ? "Az összefoglaló közzétéve; az értekezlet lezárása folyamatban van."
              : "Az értekezlet folyamatban van. A közzétett összefoglaló itt jelenik meg."}
        </div>
      )}
    </div>
  );
}
