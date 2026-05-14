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
  onToggle: () => void;
};

export default function LocationRow({
  locationName,
  collapsed,
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
  return (
    <div
      className="relative z-10 grid h-full border-b border-slate-200 bg-transparent"
      style={{
        gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr`,
      }}
    >
      <button
        onClick={onToggle}
        className={`${stickyFirstCol} shadow-[6px_0_10px_rgba(0,0,0,0.04)]`}
      >
        {collapsed ? (
          <ChevronRight size={13} />
        ) : (
          <ChevronDown size={13} />
        )}

        <MapPin size={13} className="text-purple-600" />

        {locationName}
      </button>

      <div
        className={`${stickySecondCol} bg-slate-50 px-2 py-1.5 text-xs text-slate-600`}
        style={{
          left: `${leftColWidth}px`,
        }}
      >
        Helyszín
      </div>

      <div
  className="relative h-full"
  style={{
    backgroundImage: `linear-gradient(to right, rgba(203,213,225,0.75) 1px, transparent 1px)`,
    backgroundSize: `${weekWidth / 7}px 100%`,
  }}
>
        {collapsed && features.showCollapsedSummaryBars && (
          <SummaryBar
            tasks={tasks}
            color="bg-purple-600"
            weekWidth={weekWidth}
            timelineStartDate={timelineStartDate}
          />
        )}
      </div>
    </div>
  );
}