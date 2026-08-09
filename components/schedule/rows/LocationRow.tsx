"use client";

import React from "react";
import SummaryBar from "@/components/schedule/SummaryBar";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";

import {
  ScheduleFeatureState,
  ScheduleTask,
} from "@/app/lib/schedule/types";

type LocationRowProps = {
  locationId: string;
  locationName: string;
  collapsed: boolean;
  tasks: ScheduleTask[];
  features: ScheduleFeatureState;
  weekWidth: number;
  timelineStartDate: Date;
  stickyFirstCol: string;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  rowNumber: string;
  onToggle: () => void;
};

export default function LocationRow({
  locationName,
  collapsed,
  rowNumber,
  tasks,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onToggle,
}: LocationRowProps) {
  const dayWidth = weekWidth / 7;

  return (
    <div
      className="relative z-[120] grid h-full border-b border-slate-200 bg-transparent"
      style={{
        gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr`,
      }}
    >
      <button
        onClick={onToggle}
        className={`${stickyFirstCol} z-[240] isolate bg-slate-300 hover:bg-slate-300 text-sm font-semibold text-slate-900 shadow-[6px_0_10px_rgba(0,0,0,0.04)]`}
      >
        {collapsed ? (
          <ChevronRight size={13} />
        ) : (
          <ChevronDown size={13} />
        )}

        <MapPin size={13} className="text-purple-600" />

        {rowNumber ? <span className="min-w-8 font-mono text-xs font-black text-slate-600">{rowNumber}</span> : null}{locationName}
      </button>

      <div
        className={`${stickySecondCol} z-[230] isolate bg-slate-300 px-2 py-1.5 text-sm text-slate-600`}
        style={{
          left: `${leftColWidth}px`,
        }}
      >
        Helyszín
      </div>

      <div
        className="relative h-full overflow-hidden bg-white"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(100,116,139,0.26) 0 1px, transparent 1px), linear-gradient(to right, rgba(203,213,225,0.50) 1px, transparent 1px)`,
          backgroundSize: `${weekWidth}px 100%, ${dayWidth}px 100%`,
        }}
      >
        {collapsed && features.showCollapsedSummaryBars && (
          <SummaryBar
            tasks={tasks}
            color={"bg-purple-500"}
            weekWidth={weekWidth}
            timelineStartDate={timelineStartDate}
          />
        )}
      </div>
    </div>
  );
}