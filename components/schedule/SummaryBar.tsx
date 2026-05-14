import React from "react";
import { ScheduleTask } from "@/app/lib/schedule/types";
import { getSummaryRange } from "@/app/lib/schedule/timeline";

type SummaryBarProps = {
  tasks: ScheduleTask[];
  color: string;
  weekWidth: number;
  timelineStartDate: Date;
};

export default function SummaryBar({
  tasks,
  color,
  weekWidth,
  timelineStartDate,
}: SummaryBarProps) {
  const range = getSummaryRange(tasks, timelineStartDate);

  if (!range) return null;

  const dayWidth = weekWidth / 7;

  return (
    <div
      className={`absolute top-1/2 z-10 h-2 -translate-y-1/2 rounded-full opacity-30 ${color}`}
      style={{
        left: `${range.startDay * dayWidth}px`,
        width: `${range.durationDays * dayWidth}px`,
      }}
    />
  );
}