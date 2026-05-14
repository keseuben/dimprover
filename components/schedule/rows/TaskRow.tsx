"use client";

import React, { memo } from "react";
import TaskBar from "@/components/schedule/TaskBar";
import { ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";

type TaskRowProps = {
  task: ScheduleTask;
  categoryColor: string;
  categoryLightColor: string;
  weekWidth: number;
  timelineStartDate: Date;
  features: ScheduleFeatureState;
  stickyFirstCol: string;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  onClick: () => void;
  onResizeMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
};

function TaskRow({
  task,
  categoryColor,
  categoryLightColor,
  weekWidth,
  timelineStartDate,
  features,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onClick,
  onResizeMouseDown,
}: TaskRowProps) {
  const dayWidth = weekWidth / 7;

  return (
    <div
      className="group relative z-0 grid h-full border-b border-slate-200 bg-white transition-colors hover:bg-blue-50/40"
      style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
    >
      <div className={`${stickyFirstCol} h-full text-xs transition-colors group-hover:bg-blue-50/40`}>
        <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-slate-300" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-slate-800">{task.name}</p>
          <p className="truncate text-[10px] font-medium text-slate-500">{task.contractor}</p>
        </div>
      </div>

      <div
        className={`${stickySecondCol} flex h-full items-center px-2 text-xs text-slate-600 transition-colors group-hover:bg-blue-50/40`}
        style={{ left: `${leftColWidth}px` }}
      >
        {task.taskType || "Feladat"}
      </div>

      <div
        className="relative h-full"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(203,213,225,0.45) 1px, transparent 1px)`,
          backgroundSize: `${dayWidth}px 100%`,
        }}
      >
        <TaskBar
          task={task}
          color={task.color || categoryColor}
          lightColor={categoryLightColor}
          weekWidth={weekWidth}
          timelineStartDate={timelineStartDate}
          features={features}
          onClick={onClick}
          onResizeMouseDown={onResizeMouseDown}
        />
      </div>
    </div>
  );
}

export default memo(TaskRow);
