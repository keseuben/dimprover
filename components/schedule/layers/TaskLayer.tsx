"use client";

import React, { memo } from "react";
import TaskRow from "@/components/schedule/rows/TaskRow";
import { TaskVisibleRowLayout } from "@/app/lib/schedule/selectors";
import { ScheduleBarInteractionMode, ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";

type Props = {
  taskRows: TaskVisibleRowLayout[];
  features: ScheduleFeatureState;
  weekWidth: number;
  timelineStartDate: Date;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  onTaskClick: (task: ScheduleTask) => void;
  onTaskBarChange: (taskId: number, mode: ScheduleBarInteractionMode, originalStartDate: string, originalEndDate: string, deltaDays: number) => void;
  onInteractionStart: (mode: ScheduleBarInteractionMode) => void;
  onInteractionEnd: () => void;
};

function TaskLayer({ taskRows, features, weekWidth, timelineStartDate, stickySecondCol, leftColWidth, typeColWidth, onTaskClick, onTaskBarChange, onInteractionStart, onInteractionEnd }: Props) {
  return <>{taskRows.map((row) => row.rowType === "task" ? (
    <div key={row.id} className="absolute left-0 right-0 z-[40] pointer-events-none" style={{ top: `${row.top}px`, height: `${row.height}px` }}>
      <div className="pointer-events-auto h-full"><TaskRow task={row.task} rowNumber={row.number} categoryColor={row.task.color || row.category.color} categoryLightColor={row.category.lightColor} weekWidth={weekWidth} timelineStartDate={timelineStartDate} features={features} stickySecondCol={stickySecondCol} leftColWidth={leftColWidth} typeColWidth={typeColWidth} onClick={() => onTaskClick(row.task)} onTaskBarChange={onTaskBarChange} onInteractionStart={onInteractionStart} onInteractionEnd={onInteractionEnd} /></div>
    </div>
  ) : null)}</>;
}
export default memo(TaskLayer);
