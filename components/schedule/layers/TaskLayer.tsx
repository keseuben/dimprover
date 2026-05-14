"use client";

import React, { memo } from "react";
import TaskRow from "@/components/schedule/rows/TaskRow";
import { TaskVisibleRowLayout } from "@/app/lib/schedule/selectors";
import { ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";

type Props = {
  taskRows: TaskVisibleRowLayout[];
  features: ScheduleFeatureState;
  weekWidth: number;
  timelineStartDate: Date;
  stickyFirstCol: string;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  onTaskClick: (task: ScheduleTask) => void;
  onResizeMouseDown: (
    event: React.MouseEvent<HTMLDivElement>,
    task: ScheduleTask
  ) => void;
};

function TaskLayer({
  taskRows,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onTaskClick,
  onResizeMouseDown,
}: Props) {
  return (
    <>
      {taskRows.map((row) => {
        if (row.rowType !== "task") return null;

        return (
          <div
            key={row.id}
            className="absolute left-0 right-0"
            style={{ top: `${row.top}px`, height: `${row.height}px` }}
          >
            <TaskRow
              task={row.task}
              categoryColor={row.task.color || row.category.color}
              categoryLightColor={row.category.lightColor}
              weekWidth={weekWidth}
              timelineStartDate={timelineStartDate}
              features={features}
              stickyFirstCol={stickyFirstCol}
              stickySecondCol={stickySecondCol}
              leftColWidth={leftColWidth}
              typeColWidth={typeColWidth}
              onClick={() => onTaskClick(row.task)}
              onResizeMouseDown={(event) => onResizeMouseDown(event, row.task)}
            />
          </div>
        );
      })}
    </>
  );
}

export default memo(TaskLayer);
