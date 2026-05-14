"use client";

import React, { memo } from "react";
import DependencyLines from "@/components/schedule/DependencyLines";
import { ScheduleTask } from "@/app/lib/schedule/types";

type Props = {
  tasks: ScheduleTask[];
  weekWidth: number;
  offsetLeft: number;
  visibleLeft: number;
  visibleRight: number;
  timelineStartDate: Date;
};

function DependencyLayer({
  tasks,
  weekWidth,
  offsetLeft,
  visibleLeft,
  visibleRight,
  timelineStartDate,
}: Props) {
  return (
    <DependencyLines
      tasks={tasks}
      weekWidth={weekWidth}
      offsetLeft={offsetLeft}
      visibleLeft={visibleLeft}
      visibleRight={visibleRight}
      timelineStartDate={timelineStartDate}
    />
  );
}

export default memo(DependencyLayer);
