import React from "react";
import { getTimelineDays, toIsoDate } from "@/app/lib/schedule/timelineEngine";

type GridLinesProps = {
  dayWidth: number;
  timelineStartDate: Date;
  timelineEndDate: Date;
};

export default function GridLines({
  dayWidth,
  timelineStartDate,
  timelineEndDate,
}: GridLinesProps) {
  const days = getTimelineDays(toIsoDate(timelineStartDate), toIsoDate(timelineEndDate));

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-0 h-full"
      style={{ width: `${days.length * dayWidth}px` }}
    >
      {days.map((day, index) => {
        const isMonthStart = day.dayLabel === "1";
        const isMonday = index % 7 === 0;

        return (
          <div
            key={day.date}
            className={`absolute bottom-0 top-0 ${
              isMonthStart
                ? "w-[2px] bg-slate-300"
                : isMonday
                  ? "w-px bg-slate-300/80"
                  : "w-px bg-slate-200/70"
            }`}
            style={{ left: `${index * dayWidth}px` }}
          />
        );
      })}
    </div>
  );
}
