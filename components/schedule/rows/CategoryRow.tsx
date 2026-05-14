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
  onToggle: () => void;
};

export default function CategoryRow({
  category,
  collapsed,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  onToggle,
}: CategoryRowProps) {
  return (
    <div
      className="relative z-10 grid h-full border-b border-slate-200 bg-transparent"
      style={{ gridTemplateColumns: `${leftColWidth}px ${typeColWidth}px 1fr` }}
    >
      <button
        onClick={onToggle}
        className={`${stickyFirstCol} flex items-center gap-1.5 px-8 py-1.5 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50`}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <span className={`h-2.5 w-2.5 rounded ${category.color}`} />
        {category.name}
      </button>

      <div
        className={`${stickySecondCol} px-2 py-1.5 text-xs text-slate-600`}
        style={{ left: `${leftColWidth}px` }}
      >
        Munkanem
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
