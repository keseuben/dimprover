"use client";

import React from "react";
import { ScheduleTask } from "@/app/lib/schedule/types";
import { getXFromDate, toIsoDate } from "@/app/lib/schedule/timelineEngine";
import {
  getCachedDependencyPath,
  setCachedDependencyPath,
} from "@/app/lib/schedule/dependencyPathCache";

type Props = {
  tasks: ScheduleTask[];
  weekWidth: number;
  offsetLeft: number;
  visibleLeft: number;
  visibleRight: number;
  timelineStartDate: Date;
};

const TASK_ROW_HEIGHT = 32;
const TASK_ROWS_TOP_OFFSET = 114;

export default function DependencyLines({
  tasks,
  weekWidth,
  offsetLeft,
  visibleLeft,
  visibleRight,
  timelineStartDate,
}: Props) {
  const lines: React.ReactNode[] = [];
  const dayWidth = weekWidth / 7;
  const timelineStartIso = toIsoDate(timelineStartDate);

  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const taskIndexMap = new Map(tasks.map((task, index) => [task.id, index]));

  tasks.forEach((task, taskIndex) => {
    if (!task.predecessors?.length) return;

    task.predecessors.forEach((predecessorId) => {
      const predecessor = taskMap.get(predecessorId);
      const predecessorIndex = taskIndexMap.get(predecessorId) ?? -1;

      if (!predecessor || predecessorIndex === -1) return;

      const predecessorEndX =
        getXFromDate(predecessor.actualEndDate, timelineStartIso) * (dayWidth / 28) + dayWidth;
      const taskStartX = getXFromDate(task.actualStartDate, timelineStartIso) * (dayWidth / 28);

      const startX = offsetLeft + predecessorEndX;
      const endX = offsetLeft + taskStartX;

      if (endX < visibleLeft - 400 || startX > visibleRight + 400) return;

      const startY = TASK_ROWS_TOP_OFFSET + predecessorIndex * TASK_ROW_HEIGHT + 16;
      const endY = TASK_ROWS_TOP_OFFSET + taskIndex * TASK_ROW_HEIGHT + 16;
      const cacheKey = `${predecessor.id}-${task.id}-${startX}-${startY}-${endX}-${endY}`;

      let path = getCachedDependencyPath(cacheKey);

      if (!path) {
        path = `
          M ${startX} ${startY}
          C ${startX + 30} ${startY},
            ${endX - 30} ${endY},
            ${endX} ${endY}
        `;
        setCachedDependencyPath(cacheKey, path);
      }

      lines.push(
        <svg
          key={cacheKey}
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <marker
              id={`arrowhead-${predecessor.id}-${task.id}`}
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(59,130,246,0.45)" />
            </marker>
          </defs>

          <path
            d={path}
            fill="none"
            stroke="rgba(59,130,246,0.45)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            markerEnd={`url(#arrowhead-${predecessor.id}-${task.id})`}
          />
        </svg>
      );
    });
  });

  return <>{lines}</>;
}
