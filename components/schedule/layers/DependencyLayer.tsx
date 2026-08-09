"use client";

import React, { memo } from "react";
import { TaskVisibleRowLayout } from "@/app/lib/schedule/selectors";
import { getXFromDate, toIsoDate } from "@/app/lib/schedule/timelineEngine";

type Props = {
  taskRows: TaskVisibleRowLayout[];
  weekWidth: number;
  offsetLeft: number;
  timelineStartDate: Date;
  totalHeight: number;
  timelineWidth: number;
};

const BAR_CLEARANCE_PX = 9;
const MIN_HORIZONTAL_LEG_PX = 18;
const FORWARD_GAP_PX = 14;
const BACKWARD_GAP_PX = 32;

function DependencyLayer({
  taskRows,
  weekWidth,
  offsetLeft,
  timelineStartDate,
  totalHeight,
  timelineWidth,
}: Props) {
  const dayWidth = weekWidth / 7;
  const timelineStartIso = toIsoDate(timelineStartDate);
  const taskRowMap = new Map(taskRows.map((row) => [row.task.id, row]));
  const lines: React.ReactNode[] = [];

  taskRows.forEach((row) => {
    const task = row.task;
    if (!task.predecessors?.length) return;

    task.predecessors.forEach((predecessorId, dependencyIndex) => {
      const predecessorRow = taskRowMap.get(predecessorId);
      if (!predecessorRow) return;

      const predecessor = predecessorRow.task;
      const rawStartX = getXFromDate(predecessor.actualEndDate, timelineStartIso) * (dayWidth / 28) + dayWidth;
      const rawEndX = getXFromDate(task.actualStartDate, timelineStartIso) * (dayWidth / 28);
      const startX = Math.max(0, rawStartX);
      const endX = Math.max(0, rawEndX);
      const predecessorCenterY = predecessorRow.top + predecessorRow.height / 2;
      const taskCenterY = row.top + row.height / 2;
      const direction = taskCenterY >= predecessorCenterY ? 1 : -1;
      const startY = predecessorCenterY + direction * BAR_CLEARANCE_PX;
      const endY = taskCenterY - direction * BAR_CLEARANCE_PX;
      const isForward = endX >= startX + MIN_HORIZONTAL_LEG_PX;
      const laneOffset = dependencyIndex * 12;
      const verticalLaneX = Math.max(
        0,
        isForward
          ? Math.min(endX - FORWARD_GAP_PX, startX + Math.max(MIN_HORIZONTAL_LEG_PX, (endX - startX) / 2))
          : Math.max(startX + BACKWARD_GAP_PX + laneOffset, endX + BACKWARD_GAP_PX + laneOffset)
      );
      const exitX = Math.min(timelineWidth, startX + 8 + laneOffset);
      const entryX = Math.max(0, endX - 8 - laneOffset);

      const path = isForward
        ? `M ${startX} ${startY} L ${exitX} ${startY} L ${verticalLaneX} ${startY} L ${verticalLaneX} ${endY} L ${entryX} ${endY} L ${endX} ${endY}`
        : `M ${startX} ${startY} L ${verticalLaneX} ${startY} L ${verticalLaneX} ${endY} L ${endX} ${endY}`;
      const markerId = `dependency-arrow-strong-${predecessor.id}-${task.id}`;

      lines.push(
        <g key={`${predecessor.id}-${task.id}-${startY}-${endY}-${dependencyIndex}`}>
          <defs>
            <marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M 1 1 L 9 4.5 L 1 8 z" fill="#2563eb" stroke="white" strokeWidth="0.85" />
            </marker>
          </defs>

          <path d={path} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
          <path
            d={path}
            fill="none"
            stroke="#2563eb"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
          />
          <circle cx={startX} cy={startY} r="2.25" fill="white" stroke="#2563eb" strokeWidth="2" />
          <circle cx={endX} cy={endY} r="2.25" fill="#2563eb" stroke="white" strokeWidth="0.85" />
        </g>
      );
    });
  });

  if (!lines.length) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 z-[380] overflow-visible"
      style={{ left: `${offsetLeft}px`, width: `${timelineWidth}px`, height: `${totalHeight}px` }}
      width={timelineWidth}
      height={totalHeight}
      viewBox={`0 0 ${timelineWidth} ${totalHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines}
    </svg>
  );
}

export default memo(DependencyLayer);
