import { VisibleRow } from "@/app/lib/schedule/rowBuilder";

import {
  getCachedRowLayout,
  setCachedRowLayout,
} from "@/app/lib/schedule/rowLayoutCache";

export type VisibleRowLayout = VisibleRow & {
  top: number;
  bottom: number;
};

export function calculateVisibleRowLayout(
  rows: VisibleRow[]
): VisibleRowLayout[] {
  const cacheKey = rows
    .map((row) => {
      if (row.rowType === "task") {
        const task = row.task;
        return [
          row.rowType,
          row.id,
          task.name,
          task.actualStartDate,
          task.actualEndDate,
          task.contractStartDate,
          task.contractEndDate,
          task.progress,
          task.color,
          task.taskType,
          task.contractor,
        ].join(":");
      }

      return `${row.rowType}-${row.id}-${row.height}`;
    })
    .join("|");

  const cached = getCachedRowLayout(cacheKey);

  if (cached) {
    return cached;
  }

  let currentTop = 0;

  const layouts = rows.map((row) => {
    const layoutRow: VisibleRowLayout = {
      ...row,
      top: currentTop,
      bottom: currentTop + row.height,
    };

    currentTop += row.height;

    return layoutRow;
  });

  setCachedRowLayout(cacheKey, layouts);

  return layouts;
}

export function getVisibleRowRange(
  rows: VisibleRowLayout[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 300
): VisibleRowLayout[] {
  if (rows.length === 0) return [];

  const visibleTop = scrollTop - overscan;
  const visibleBottom = scrollTop + viewportHeight + overscan;

  let startIndex = 0;
  let endIndex = rows.length - 1;

  let low = 0;
  let high = rows.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (rows[mid].bottom < visibleTop) {
      low = mid + 1;
    } else {
      startIndex = mid;
      high = mid - 1;
    }
  }

  low = startIndex;
  high = rows.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (rows[mid].top > visibleBottom) {
      high = mid - 1;
    } else {
      endIndex = mid;
      low = mid + 1;
    }
  }

  return rows.slice(startIndex, endIndex + 1);
}
