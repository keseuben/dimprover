"use client";

import React from "react";
import { getTimelineDays, toIsoDate } from "@/app/lib/schedule/timelineEngine";
import { ViewMode } from "@/app/lib/schedule/types";

type TimelineHeaderMarker = {
  id: string;
  left: number;
  color: string;
  label: string;
  lane?: number;
};

type TimelineHeaderProps = {
  weekWidth: number;
  leftColWidth: number;
  typeColWidth: number;
  timelineStartDate: Date;
  timelineEndDate: Date;
  viewMode: ViewMode;
  zoomControls?: React.ReactNode;
  markers?: TimelineHeaderMarker[];
};

const dayNames = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];

function parseIso(date: string) {
  return new Date(`${date}T00:00:00`);
}

function monthYearLabel(date: string) {
  return parseIso(date).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
  });
}

function shortMonthLabel(date: string) {
  return parseIso(date).toLocaleDateString("hu-HU", {
    month: "short",
  });
}

function yearLabel(date: string) {
  return parseIso(date).toLocaleDateString("hu-HU", { year: "numeric" });
}

function getIsoWeekNumber(date: Date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

type HeaderGroup = {
  key: string;
  label: string;
  width: number;
};

function buildMonthGroups(days: ReturnType<typeof getTimelineDays>, dayWidth: number): HeaderGroup[] {
  const groups: HeaderGroup[] = [];

  days.forEach((day) => {
    const date = parseIso(day.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const existing = groups.at(-1);

    if (existing?.key === key) {
      existing.width += dayWidth;
      return;
    }

    groups.push({
      key,
      label: monthYearLabel(day.date),
      width: dayWidth,
    });
  });

  return groups;
}

function buildWeekGroups(days: ReturnType<typeof getTimelineDays>, dayWidth: number): HeaderGroup[] {
  const groups: HeaderGroup[] = [];

  days.forEach((day) => {
    const date = parseIso(day.date);
    const week = getIsoWeekNumber(date);
    const weekYear = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    weekYear.setUTCDate(weekYear.getUTCDate() + 4 - (weekYear.getUTCDay() || 7));
    const key = `${weekYear.getUTCFullYear()}-${week}`;
    const existing = groups.at(-1);

    if (existing?.key === key) {
      existing.width += dayWidth;
      return;
    }

    groups.push({ key, label: `${week}.`, width: dayWidth });
  });

  return groups;
}

function buildYearGroups(days: ReturnType<typeof getTimelineDays>, dayWidth: number): HeaderGroup[] {
  const groups: HeaderGroup[] = [];

  days.forEach((day) => {
    const date = parseIso(day.date);
    const key = String(date.getFullYear());
    const existing = groups.at(-1);

    if (existing?.key === key) {
      existing.width += dayWidth;
      return;
    }

    groups.push({ key, label: yearLabel(day.date), width: dayWidth });
  });

  return groups;
}

function getSecondRowMode(viewMode: ViewMode) {
  if (viewMode === "year") return "months";
  if (viewMode === "week") return "days";
  if (viewMode === "day") return "hours";
  return "days";
}

function layoutHeaderMarkers(markers: TimelineHeaderMarker[]) {
  const lanes: number[] = [];
  return [...markers]
    .sort((a, b) => a.left - b.left)
    .map((marker) => {
      const estimatedWidth = Math.max(54, Math.min(160, marker.label.length * 7 + 24));
      let lane = lanes.findIndex((lastRight) => marker.left - estimatedWidth / 2 > lastRight + 8);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = marker.left + estimatedWidth / 2;
      return { ...marker, lane };
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
  markers = [],
}: TimelineHeaderProps) {
  const dayWidth = weekWidth / 7;
  const laidOutMarkers = layoutHeaderMarkers(markers);
  const days = getTimelineDays(toIsoDate(timelineStartDate), toIsoDate(timelineEndDate));
  const topGroups = viewMode === "year" ? buildYearGroups(days, dayWidth) : buildMonthGroups(days, dayWidth);
  const secondRowMode = getSecondRowMode(viewMode);
  const monthGroups = buildMonthGroups(days, dayWidth);
  const weekGroups = buildWeekGroups(days, dayWidth);

  return (
    <div className="sticky top-0 z-[900] border-b border-slate-800 bg-white shadow-sm">
      <div
        className="grid h-12 border-b border-slate-200 bg-white text-slate-700"
        style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
      >
        <div className="sticky left-0 z-[930] border-r border-slate-200 bg-white" />
        <div className="sticky z-[920] border-r border-slate-200 bg-white" style={{ left: `${leftColWidth}px` }} />
        <div className="relative overflow-hidden">
          {laidOutMarkers.map((marker) => (
            <div key={`label-${marker.id}`} className="pointer-events-none absolute" style={{ left: `${marker.left}px`, top: `${4 + (marker.lane || 0) * 19}px` }}>
              <div className="absolute top-[16px] h-3 w-[2px] -translate-x-1/2" style={{ backgroundColor: marker.color }} />
              <div className="-translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow" style={{ backgroundColor: marker.color }}>
                {marker.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="grid border-b border-slate-700 bg-slate-950 text-white"
        style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
      >
        <div className="sticky left-0 z-[930] flex h-24 items-center justify-between gap-2 border-r border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold">
          <span>Feladat</span>
          {zoomControls}
        </div>

        <div
          className="sticky z-[920] flex h-24 items-center border-r border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold"
          style={{ left: `${leftColWidth}px` }}
        >
          Típus
        </div>

        <div className="relative flex min-w-0 flex-col overflow-hidden">
          {markers.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[80]">
              {laidOutMarkers.map((marker) => (
                <div key={marker.id} className="absolute top-0 h-full" style={{ left: `${marker.left}px` }}>
                  <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2" style={{ backgroundColor: marker.color }} />
                </div>
              ))}
            </div>
          )}

          <div className="flex h-8 border-b border-slate-700">
            {topGroups.map((group) => (
              <div
                key={`top-${group.key}`}
                className="flex items-center justify-center overflow-hidden border-r border-slate-700 px-2 text-[11px] font-bold text-slate-100"
                style={{ width: `${group.width}px`, minWidth: `${group.width}px` }}
                title={group.label}
              >
                <span className="truncate">{group.label}</span>
              </div>
            ))}
          </div>

          {secondRowMode === "months" && (
            <div className="flex h-8 border-b border-slate-700">
              {monthGroups.map((group) => (
                <div
                  key={`month-${group.key}`}
                  className="flex items-center justify-center overflow-hidden border-r border-slate-700 bg-slate-900 px-1 text-[10px] font-semibold text-slate-200"
                  style={{ width: `${group.width}px`, minWidth: `${group.width}px` }}
                  title={group.label}
                >
                  <span className="truncate">{shortMonthLabel(`${group.key.split("-")[0]}-${String(Number(group.key.split("-")[1]) + 1).padStart(2, "0")}-01`)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex h-7 border-b border-slate-700 bg-slate-950/95">
            {weekGroups.map((group) => (
              <div
                key={`week-${group.key}`}
                className="flex items-center justify-center overflow-hidden border-r border-slate-700 px-1 text-[11px] font-extrabold text-blue-100"
                style={{ width: `${group.width}px`, minWidth: `${group.width}px` }}
                title={group.label}
              >
                <span className="truncate">{group.label}</span>
              </div>
            ))}
          </div>

          {secondRowMode === "hours" && (
            <div className="flex h-11">
              {Array.from({ length: 24 }).map((_, hour) => (
                <div
                  key={`hour-${hour}`}
                  className="flex items-center justify-center border-r border-slate-700 text-[10px] font-medium text-slate-200"
                  style={{ width: `${dayWidth / 24}px`, minWidth: `${dayWidth / 24}px` }}
                >
                  {hour}
                </div>
              ))}
            </div>
          )}

          {secondRowMode === "days" && (
            <div className="flex h-9">
              {days.map((day) => {
                const date = parseIso(day.date);
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
          )}
        </div>
      </div>
    </div>
  );
}
