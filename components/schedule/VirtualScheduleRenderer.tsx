"use client";

import React, { memo } from "react";
import { selectTaskRows } from "@/app/lib/schedule/selectors";
import { VisibleRowLayout } from "@/app/lib/schedule/rowLayoutEngine";
import { ScheduleBarInteractionMode, ScheduleFeatureState, ScheduleTask } from "@/app/lib/schedule/types";
import LocationRow from "@/components/schedule/rows/LocationRow";
import BuildingRow from "@/components/schedule/rows/BuildingRow";
import CategoryRow from "@/components/schedule/rows/CategoryRow";
import TaskLayer from "@/components/schedule/layers/TaskLayer";

type Props = {
  rows: VisibleRowLayout[];
  totalHeight: number;
  features: ScheduleFeatureState;
  weekWidth: number;
  timelineStartDate: Date;
  stickyFirstCol: string;
  stickySecondCol: string;
  leftColWidth: number;
  typeColWidth: number;
  collapsedRows: Set<string>;
  onToggle: (id: string) => void;
  onTaskClick: (task: ScheduleTask) => void;
  onTaskBarChange: (taskId: number, mode: ScheduleBarInteractionMode, originalStartDate: string, originalEndDate: string, deltaDays: number) => void;
  onInteractionStart: (mode: ScheduleBarInteractionMode) => void;
  onInteractionEnd: () => void;
};

function VirtualRowWrapper({ row, children }: { row: VisibleRowLayout; children: React.ReactNode }) {
  return (
    <div className="absolute left-0 right-0" style={{ top: `${row.top}px`, height: `${row.height}px` }}>
      {children}
    </div>
  );
}

function VirtualScheduleRenderer({
  rows,
  totalHeight,
  features,
  weekWidth,
  timelineStartDate,
  stickyFirstCol,
  stickySecondCol,
  leftColWidth,
  typeColWidth,
  collapsedRows,
  onToggle,
  onTaskClick,
  onTaskBarChange,
  onInteractionStart,
  onInteractionEnd,
}: Props) {
  const taskRows = selectTaskRows(rows);

  return (
    <div className="relative z-[300]" style={{ height: `${totalHeight}px` }}>
      {rows.map((row) => {
        switch (row.rowType) {
          case "location": {
            const locationTasks = row.location.buildings.flatMap((building) => building.categories.flatMap((category) => category.tasks));
            return (
              <VirtualRowWrapper key={row.id} row={row}>
                <LocationRow locationId={row.location.id} locationName={row.location.name} rowNumber={row.number} collapsed={collapsedRows.has(row.location.id)} tasks={locationTasks} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickyFirstCol={stickyFirstCol} stickySecondCol={stickySecondCol} leftColWidth={leftColWidth} typeColWidth={typeColWidth} onToggle={() => onToggle(row.location.id)} />
              </VirtualRowWrapper>
            );
          }
          case "building": {
            const buildingTasks = row.building.categories.flatMap((category) => category.tasks);
            return (
              <VirtualRowWrapper key={row.id} row={row}>
                <BuildingRow building={row.building} rowNumber={row.number} collapsed={collapsedRows.has(row.building.id)} buildingTasks={buildingTasks} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickyFirstCol={stickyFirstCol} stickySecondCol={stickySecondCol} leftColWidth={leftColWidth} typeColWidth={typeColWidth} onToggle={() => onToggle(row.building.id)} />
              </VirtualRowWrapper>
            );
          }
          case "category":
            return (
              <VirtualRowWrapper key={row.id} row={row}>
                <CategoryRow category={row.category} rowNumber={row.number} collapsed={collapsedRows.has(row.category.id)} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickyFirstCol={stickyFirstCol} stickySecondCol={stickySecondCol} leftColWidth={leftColWidth} typeColWidth={typeColWidth} onToggle={() => onToggle(row.category.id)} />
              </VirtualRowWrapper>
            );
          case "task":
            return null;
          default:
            return null;
        }
      })}

      <TaskLayer taskRows={taskRows} features={features} weekWidth={weekWidth} timelineStartDate={timelineStartDate} stickySecondCol={stickySecondCol} leftColWidth={leftColWidth} typeColWidth={typeColWidth} onTaskClick={onTaskClick} onTaskBarChange={onTaskBarChange} onInteractionStart={onInteractionStart} onInteractionEnd={onInteractionEnd} />
    </div>
  );
}

export default memo(VirtualScheduleRenderer);
