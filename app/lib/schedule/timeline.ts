import { ScheduleTask } from "./types";

export const TOTAL_WEEKS = 16;
export const LEFT_COL_WIDTH = 320;
export const TYPE_COL_WIDTH = 86;
export const VIEW_MONTH_COUNT = 4;

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getISOWeek(date: Date) {
  const tempDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );

  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));

  return Math.ceil(
    ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

export function diffInDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function getTaskOffsetDays(timelineStart: Date, taskDate?: string) {
  if (!taskDate) return 0;
  return diffInDays(timelineStart, new Date(taskDate));
}

export function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

export function getDateFromWeekOffset(timelineStart: Date, week: number) {
  const date = new Date(timelineStart);
  date.setDate(date.getDate() + (week - 1) * 7);
  return formatDate(date);
}

export function getEndDateFromWeekDuration(
  timelineStart: Date,
  week: number,
  duration: number
) {
  const date = new Date(timelineStart);
  date.setDate(date.getDate() + (week - 1) * 7 + duration * 7 - 1);
  return formatDate(date);
}

export function generateTimeline(startDate: Date) {
  const generatedMonths: { name: string; span: number }[] = [];
  const generatedWeeks: number[] = [];

  for (let monthIndex = 0; monthIndex < VIEW_MONTH_COUNT; monthIndex++) {
    const currentMonth = addMonths(startDate, monthIndex);

    generatedMonths.push({
      name: currentMonth
        .toLocaleDateString("hu-HU", {
          month: "long",
        })
        .toUpperCase(),
      span: 4,
    });

    for (let weekIndex = 0; weekIndex < 4; weekIndex++) {
      const weekDate = new Date(currentMonth);
      weekDate.setDate(weekDate.getDate() + weekIndex * 7);
      generatedWeeks.push(getISOWeek(weekDate));
    }
  }

  return {
    months: generatedMonths,
    weeks: generatedWeeks,
  };
}

export function getCurrentIsoWeek() {
  const date = new Date();
  const tempDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNumber = tempDate.getUTCDay() || 7;

  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNumber);

  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));

  return Math.ceil(
    ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

export function getTaskActualStartDate(
  task: ScheduleTask,
  timelineStartDate: Date
) {
  return (
    task.actualStartDate ??
    getDateFromWeekOffset(timelineStartDate, task.actualStartWeek)
  );
}

export function getTaskActualEndDate(
  task: ScheduleTask,
  timelineStartDate: Date
) {
  return (
    task.actualEndDate ??
    getEndDateFromWeekDuration(
      timelineStartDate,
      task.actualStartWeek,
      task.actualDuration
    )
  );
}

export function getSummaryRange(
  tasks: ScheduleTask[],
  timelineStartDate: Date
) {
  if (tasks.length === 0) return null;

  const ranges = tasks.map((task) => {
    const startDate = getTaskActualStartDate(task, timelineStartDate);
    const endDate = getTaskActualEndDate(task, timelineStartDate);

    return {
      startOffset: getTaskOffsetDays(timelineStartDate, startDate),
      endOffset: getTaskOffsetDays(timelineStartDate, endDate),
    };
  });

  const minOffset = Math.min(...ranges.map((range) => range.startOffset));
  const maxOffset = Math.max(...ranges.map((range) => range.endOffset));

  return {
    startDay: minOffset,
    durationDays: maxOffset - minOffset + 1,
  };
}