"use client";

import React, { memo } from "react";
import TaskBar from "@/components/schedule/TaskBar";
import { ScheduleBarInteractionMode, ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";

type TaskRowProps = {
  task: ScheduleTask;
  categoryColor: string;
  categoryLightColor: string;
  weekWidth: number;
  timelineStartDate: Date;
  features: ScheduleFeatureState;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  rowNumber: string;
  onClick: () => void;
  onTaskBarChange: (taskId: number, mode: ScheduleBarInteractionMode, originalStartDate: string, originalEndDate: string, deltaDays: number) => void;
  onInteractionStart: (mode: ScheduleBarInteractionMode) => void;
  onInteractionEnd: () => void;
};

function TaskRow({ task, categoryColor, categoryLightColor, weekWidth, timelineStartDate, features, stickySecondCol, leftColWidth, typeColWidth, rowNumber, onClick, onTaskBarChange, onInteractionStart, onInteractionEnd }: TaskRowProps) {
  const dayWidth = weekWidth / 7;

  return (
    <div className="group relative z-[120] grid h-full border-b border-slate-200 bg-transparent" style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}>
      <div className="sticky left-0 z-[240] isolate flex h-full items-center border-r border-slate-300 bg-white shadow-[8px_0_0_#ffffff] pl-16 pr-3 text-sm transition-colors group-hover:bg-blue-50">
        <div className="flex min-w-0 items-start gap-2 rounded-none bg-transparent leading-tight"><span className="mt-0.5 min-w-12 font-mono text-xs font-semibold text-slate-500">{rowNumber}</span><div className="min-w-0"><p className="truncate rounded-none bg-transparent text-sm font-normal text-slate-900">{task.name}</p><p className="truncate rounded-none bg-transparent text-xs font-normal text-slate-500">{task.contractor}</p></div></div>
      </div>
      <div className={`${stickySecondCol} z-[230] isolate flex h-full items-center bg-white px-2 text-sm text-slate-600 shadow-[8px_0_0_#ffffff] transition-colors group-hover:bg-blue-50`} style={{ left: `${leftColWidth}px` }}>{task.taskType || "Feladat"}</div>
      <div
        data-gantt-empty-area="true"
        className="relative h-full overflow-hidden bg-white"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(100,116,139,0.26) 0 1px, transparent 1px), linear-gradient(to right, rgba(203,213,225,0.50) 1px, transparent 1px)`,
          backgroundSize: `${weekWidth}px 100%, ${dayWidth}px 100%`,
        }}
      >
        <TaskBar task={task} color={task.color || categoryColor} lightColor={categoryLightColor} weekWidth={weekWidth} timelineStartDate={timelineStartDate} features={features} onClick={onClick} onTaskBarChange={onTaskBarChange} onInteractionStart={onInteractionStart} onInteractionEnd={onInteractionEnd} />
      </div>
    </div>
  );
}
export default memo(TaskRow);