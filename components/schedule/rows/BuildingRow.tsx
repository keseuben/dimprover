"use client";

import React from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import SummaryBar from "@/components/schedule/SummaryBar";
import {
  ScheduleBuilding,
  ScheduleFeatureState,
  ScheduleTask,
} from "@/app/lib/schedule/types";

type BuildingRowProps = {
  building: ScheduleBuilding;
  collapsed: boolean;
  buildingTasks: ScheduleTask[];
  features: ScheduleFeatureState;
  weekWidth: number;
  timelineStartDate: Date;
  stickyFirstCol: string;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  onToggle: () => void;
};

export default function BuildingRow({
  building,
  collapsed,
  buildingTasks,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onToggle,
}: BuildingRowProps) {
  return (
    <div
      className="relative z-10 grid h-full border-b border-slate-200 bg-transparent"
      style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
    >
      <button
        onClick={onToggle}
        className={`${stickyFirstCol} shadow-[6px_0_10px_rgba(0,0,0,0.04)]`}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Building2 size={13} className="text-slate-600" />
        {building.name}
      </button>

      <div
        className={`${stickySecondCol} px-2 py-1.5 text-xs text-slate-600`}
        style={{ left: `${leftColWidth}px` }}
      >
        Épület
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
            tasks={buildingTasks}
            color="bg-slate-500"
            weekWidth={weekWidth}
            timelineStartDate={timelineStartDate}
          />
        )}
      </div>
    </div>
  );
}
