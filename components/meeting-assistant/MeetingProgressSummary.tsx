"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileText,
  Flag,
  MessageSquareText,
  Paperclip,
  Settings2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { calculateMeetingProgress } from "@/app/lib/meeting-assistant/progress";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";

const STEP_ICONS = {
  meta: Settings2,
  attendance: Users,
  agenda: MessageSquareText,
  actions: FileCheck2,
  attachments: Paperclip,
  summary: FileText,
  closure: Flag,
} as const;

export default function MeetingProgressSummary({
  workspace,
  role,
}: {
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = useMemo(() => calculateMeetingProgress(workspace), [workspace]);

  return (
    <div className="border-b border-slate-200 bg-white px-2 py-2.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
              {progress.label}
            </span>
            <span className="text-xs font-black text-slate-950">{progress.percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-600 shadow-[0_0_8px_rgba(13,148,136,0.32)] transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      <div className="mt-2.5 grid grid-cols-7 gap-1.5" aria-label="Értekezleti készültségi lépések">
        {progress.steps.map((step) => {
          const Icon = STEP_ICONS[step.id as keyof typeof STEP_ICONS] || Settings2;
          const completed = step.percent >= 100;
          const started = step.percent > 0;
          return (
            <div key={step.id} className="flex min-w-0 flex-col items-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${started ? "bg-teal-600" : "bg-slate-300"}`}
                  style={{ width: `${step.percent}%` }}
                />
              </div>
              <div
                title={`${step.label}: ${step.percent}%`}
                aria-label={`${step.label}: ${step.percent}%`}
                className={`mt-1.5 flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  completed
                    ? "border-teal-600 bg-teal-600 text-white shadow-[0_0_8px_rgba(13,148,136,0.28)]"
                    : started
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-slate-300 bg-slate-100 text-slate-400"
                }`}
              >
                <Icon size={14} strokeWidth={2.2} />
              </div>
            </div>
          );
        })}
      </div>

      {expanded && role !== "participant" && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Következő teendők</div>
          {progress.issues.length === 0 ? (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 size={11} /> Minden ellenőrzött terület elkészült.
            </div>
          ) : (
            <div className="mt-1 space-y-1">
              {progress.issues.slice(0, 6).map((issue, index) => (
                <div key={`${index}-${issue}`} className="flex gap-1.5 text-[10px] leading-4 text-slate-600">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{issue}</span>
                </div>
              ))}
              {progress.issues.length > 6 && (
                <div className="text-[9px] font-bold text-slate-400">+ {progress.issues.length - 6} további ellenőrzési pont</div>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && role === "participant" && (
        <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50 p-2 text-[10px] font-semibold leading-4 text-teal-900">
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
