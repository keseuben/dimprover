"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SummaryBar from "@/components/schedule/SummaryBar";
import { ScheduleCategory, ScheduleFeatureState } from "@/app/lib/schedule/types";

type CategoryRowProps = {
  category: ScheduleCategory;
  collapsed: boolean;
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

export default function CategoryRow({
  category,
  collapsed,
  rowNumber,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onToggle,
}: CategoryRowProps) {
  const dayWidth = weekWidth / 7;

  return (
    <div
      className="relative z-[120] grid h-full border-b border-slate-200 bg-transparent"
      style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
    >
      <button
        onClick={onToggle}
        className={`${stickyFirstCol} z-[240] isolate bg-white hover:bg-slate-50 flex items-center gap-1.5 px-8 py-1.5 text-left text-xs font-semibold text-slate-800`}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <span className={`h-2.5 w-2.5 rounded ${category.color}`} />
        <span className="min-w-8 font-mono text-xs font-black text-slate-600">{rowNumber}</span>{category.name}
      </button>

      <div
        className={`${stickySecondCol} z-[230] isolate bg-white px-2 py-1.5 text-sm text-slate-600`}
        style={{ left: `${leftColWidth}px` }}
      >
        Munkanem
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
            tasks={category.tasks}
            color={category.color}
            weekWidth={weekWidth}
            timelineStartDate={timelineStartDate}
          />
        )}
      </div>
    </div>
  );
}
