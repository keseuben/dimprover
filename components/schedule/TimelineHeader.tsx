"use client";

import React from "react";
import { getTimelineDays, toIsoDate } from "@/app/lib/schedule/timelineEngine";
import { ViewMode } from "@/app/lib/schedule/types";

type TimelineHeaderProps = {
  weekWidth: number;
  leftColWidth: number;
  typeColWidth: number;
  timelineStartDate: Date;
  timelineEndDate: Date;
  viewMode: ViewMode;
  zoomControls?: React.ReactNode;
};

const dayNames = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];

function monthYearLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "short",
  });
}

function yearLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("hu-HU", {
    year: "numeric",
  });
}

export default function TimelineHeader({
  weekWidth,
  leftColWidth,
  typeColWidth,
  timelineStartDate,
  timelineEndDate,
  viewMode,
  zoomControls,
}: TimelineHeaderProps) {
  const dayWidth = weekWidth / 7;
  const days = getTimelineDays(toIsoDate(timelineStartDate), toIsoDate(timelineEndDate));

  return (
    <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 text-white backdrop-blur-md">
      <div
        className="grid border-b border-slate-700"
        style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
      >
        <div className="sticky left-0 z-50 flex h-20 items-center justify-between gap-2 border-r border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold">
          <span>Feladat</span>
          {zoomControls}
        </div>

        <div
          className="sticky z-50 flex h-20 items-center border-r border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold"
          style={{ left: `${leftColWidth}px` }}
        >
          Típus
        </div>

        <div className="flex flex-col">
          <div className="flex h-9 border-b border-slate-700">
            {days.map((day, index) => {
              const date = new Date(`${day.date}T00:00:00`);
              const isFirst = index === 0;
              const isMonthStart = date.getDate() === 1;
              const isYearStart = date.getMonth() === 0 && date.getDate() === 1;
              const showMajorLabel =
                isFirst ||
                (viewMode === "day") ||
                (viewMode === "week" && date.getDay() === 1) ||
                ((viewMode === "month" || viewMode === "fourMonth") && isMonthStart) ||
                (viewMode === "year" && isYearStart);

              let label = "";
              if (showMajorLabel) {
                if (viewMode === "year") label = isYearStart || isFirst ? yearLabel(day.date) : "";
                else if (viewMode === "day") label = `${monthYearLabel(day.date)} · H${day.weekNumber}`;
                else if (viewMode === "week") label = `${monthYearLabel(day.date)} · H${day.weekNumber}`;
                else label = monthYearLabel(day.date);
              }

              return (
                <div
                  key={`top-${day.date}`}
                  className={`flex items-center justify-center overflow-hidden border-r border-slate-700 px-1 text-[10px] font-semibold ${
                    day.isWeekend ? "bg-slate-900 text-slate-500" : "text-slate-200"
                  }`}
                  style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                  title={day.date}
                >
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex h-11">
            {days.map((day) => {
              const date = new Date(`${day.date}T00:00:00`);
              const dayName = dayNames[date.getDay()];

              return (
                <div
                  key={day.date}
                  className={`flex flex-col items-center justify-center border-r border-slate-700 text-[10px] font-medium ${
                    day.isWeekend ? "bg-slate-800 text-slate-400" : "text-slate-200"
                  }`}
                  style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px` }}
                  title={day.date}
                >
                  <span className="font-bold">{day.dayLabel}</span>
                  <span className="text-[9px] text-slate-400">{dayName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
