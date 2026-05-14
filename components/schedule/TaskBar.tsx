"use client";

import React, { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";

import {
  getXFromDate,
  getWidthFromDates,
} from "@/app/lib/schedule/timelineEngine";

type TaskBarProps = {
  task: ScheduleTask;
  color: string;
  lightColor: string;
  weekWidth: number;
  timelineStartDate: Date;
  features: ScheduleFeatureState;
  onClick: () => void;
  onResizeMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
};

function formatTimelineStartDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function TaskBar({
  task,
  color,
  lightColor,
  weekWidth,
  timelineStartDate,
  features,
  onClick,
  onResizeMouseDown,
}: TaskBarProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, 0, 0)` }
    : undefined;

  const dayWidth = weekWidth / 7;
  const timelineStartIso = formatTimelineStartDate(timelineStartDate);

  const contractLeft =
    getXFromDate(task.contractStartDate, timelineStartIso) *
    (dayWidth / 28);

  const contractWidth =
    getWidthFromDates(task.contractStartDate, task.contractEndDate) *
    (dayWidth / 28);

  const actualLeft =
    getXFromDate(task.actualStartDate, timelineStartIso) *
    (dayWidth / 28);

  const actualWidth =
    getWidthFromDates(task.actualStartDate, task.actualEndDate) *
    (dayWidth / 28);

  return (
    <div className="absolute left-0 top-1/2 z-10 h-7 w-full -translate-y-1/2">
      {features.showContractBars && (
        <div
          className={`absolute top-1 h-5 rounded ${lightColor}`}
          style={{
            left: `${contractLeft}px`,
            width: `${contractWidth}px`,
          }}
        />
      )}

      {features.showActualBars && (
        <div
          ref={setNodeRef}
          data-task-id={task.id}
          {...listeners}
          {...attributes}
          onClick={onClick}
          className="absolute flex h-7 cursor-pointer items-center rounded-md bg-transparent transition-all duration-150 hover:z-30 hover:scale-[1.02] hover:drop-shadow-lg active:cursor-grabbing"
          style={{
            left: `${actualLeft}px`,
            width: `${actualWidth}px`,
            ...dragStyle,
          }}
        >
          <div
            className={`absolute left-0 top-1.5 flex h-4 w-full items-center rounded ${color} px-2 shadow-sm`}
          >
            <span className="relative z-10 truncate text-[10px] font-semibold text-white">
              {task.name}
            </span>

            {features.showProgressOverlay && (
              <div
                className="h-full rounded bg-white/25"
                style={{ width: `${task.progress ?? 0}%` }}
              />
            )}
          </div>

          <div
            onMouseDown={onResizeMouseDown}
            className="absolute right-0 top-0 z-20 h-full w-3 cursor-ew-resize rounded-r-md bg-black/0 transition-all hover:bg-white/30"
          />
        </div>
      )}
    </div>
  );
}
export default memo(TaskBar);