import { addDays, differenceInDays, toIsoDate } from "@/app/lib/schedule/timelineEngine";

export type TimelineViewport = {
  scrollLeft: number;
  viewportWidth: number;
  dayWidth: number;
  overscanDays: number;
};

export type VisibleDateRange = {
  visibleStartDate: string;
  visibleEndDate: string;
};

export function getVisibleDateRange(
  timelineStartDate: Date,
  viewport: TimelineViewport
): VisibleDateRange {
  const startOffsetDays = Math.max(
    0,
    Math.floor(viewport.scrollLeft / viewport.dayWidth) - viewport.overscanDays
  );

  const visibleDayCount =
    Math.ceil(viewport.viewportWidth / viewport.dayWidth) +
    viewport.overscanDays * 2;

  const startDate = addDays(timelineStartDate, startOffsetDays);
  const endDate = addDays(startDate, visibleDayCount);

  return {
    visibleStartDate: toIsoDate(startDate),
    visibleEndDate: toIsoDate(endDate),
  };
}

export function isDateRangeVisible(
  itemStartDate: string,
  itemEndDate: string,
  visibleStartDate: string,
  visibleEndDate: string
): boolean {
  return itemStartDate <= visibleEndDate && itemEndDate >= visibleStartDate;
}

export function getTimelineTotalDays(
  timelineStartDate: string,
  timelineEndDate: string
): number {
  return differenceInDays(timelineStartDate, timelineEndDate) + 1;
}