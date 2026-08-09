import React from "react";
import { getTimelineDays, toIsoDate } from "@/app/lib/schedule/timelineEngine";

type GridLinesProps = {
  dayWidth: number;
  timelineStartDate: Date;
  timelineEndDate: Date;
  showWeekends: boolean;
  showHolidays: boolean;
  manualHolidayDates?: string[];
};

function isHungarianHoliday(dateIso: string) {
  const [, month, day] = dateIso.split("-");
  const fixed = new Set(["01-01", "03-15", "05-01", "08-20", "10-23", "11-01", "12-25", "12-26"]);
  return fixed.has(`${month}-${day}`);
}

export default function GridLines({
  dayWidth,
  timelineStartDate,
  timelineEndDate,
  showWeekends,
  showHolidays,
  manualHolidayDates = [],
}: GridLinesProps) {
  const days = getTimelineDays(toIsoDate(timelineStartDate), toIsoDate(timelineEndDate));
  const manualHolidaySet = new Set(manualHolidayDates);

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-0 h-full"
      style={{ width: `${days.length * dayWidth}px` }}
    >
      {days.map((day, index) => {
        const isMonthStart = day.dayLabel === "1";
        const isMonday = index % 7 === 0;
        const highlightedWeekend = showWeekends && day.isWeekend;
        const highlightedHoliday = showHolidays && (isHungarianHoliday(day.date) || manualHolidaySet.has(day.date));
        const highlightedRestDay = highlightedWeekend || highlightedHoliday;

        return (
          <React.Fragment key={day.date}>
            {highlightedRestDay && (
              <div
                className={`absolute bottom-0 top-0 ${highlightedHoliday ? "bg-red-200/70" : "bg-red-100/60"}`}
                style={{ left: `${index * dayWidth}px`, width: `${dayWidth}px` }}
              />
            )}
            <div
              className={`absolute bottom-0 top-0 ${
                isMonthStart
                  ? "w-[2px] bg-slate-300"
                  : isMonday
                    ? "w-px bg-slate-400/70"
                    : "w-px bg-slate-200/70"
              }`}
              style={{ left: `${index * dayWidth}px` }}
            />
          </React.Fragment>
        );
      })}    </div>
  );
}
