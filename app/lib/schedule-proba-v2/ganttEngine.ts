import { ProbaV2Summary, ProbaV2Task, ProbaV2TimelineItem } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDaysIso(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function diffDays(start: string | Date, end: string | Date) {
  const startDate = typeof start === "string" ? parseIsoDate(start) : start;
  const endDate = typeof end === "string" ? parseIsoDate(end) : end;
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
}

export function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeTaskDates(task: ProbaV2Task): ProbaV2Task {
  if (parseIsoDate(task.end).getTime() < parseIsoDate(task.start).getTime()) {
    return { ...task, end: task.start };
  }

  return task;
}

export function updateTaskProgress(tasks: ProbaV2Task[], taskId: string, progress: number) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, progress: clampProgress(progress), status: progress >= 100 ? "Kész" : task.status } : task,
  );
}

export function updateTaskDates(tasks: ProbaV2Task[], taskId: string, start: string, end: string) {
  return tasks.map((task) =>
    task.id === taskId ? normalizeTaskDates({ ...task, start, end }) : task,
  );
}

export function shiftTaskDays(tasks: ProbaV2Task[], taskId: string, days: number) {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          start: addDaysIso(task.start, days),
          end: addDaysIso(task.end, days),
        }
      : task,
  );
}

export function formatHuDate(value: string) {
  return new Intl.DateTimeFormat("hu-HU", {
    month: "short",
    day: "2-digit",
  }).format(parseIsoDate(value));
}

export function getTimelineBounds(tasks: ProbaV2Task[]) {
  const starts = tasks.map((task) => parseIsoDate(task.start).getTime());
  const ends = tasks.map((task) => parseIsoDate(task.end).getTime());
  const start = new Date(Math.min(...starts));
  const end = new Date(Math.max(...ends));

  return {
    start,
    end,
    totalDays: Math.max(1, diffDays(start, end) + 1),
  };
}

export function buildTimelineItems(tasks: ProbaV2Task[]): ProbaV2TimelineItem[] {
  const bounds = getTimelineBounds(tasks);

  return tasks.map((task) => {
    const offsetDays = diffDays(bounds.start, task.start);
    const durationDays = Math.max(1, diffDays(task.start, task.end) + 1);

    return {
      ...task,
      offsetDays,
      durationDays,
      leftPercent: (offsetDays / bounds.totalDays) * 100,
      widthPercent: (durationDays / bounds.totalDays) * 100,
    };
  });
}

export function buildTimelineTicks(tasks: ProbaV2Task[]) {
  const bounds = getTimelineBounds(tasks);
  const tickCount = Math.min(8, Math.max(4, Math.ceil(bounds.totalDays / 14)));

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
    const date = new Date(bounds.start.getTime() + bounds.totalDays * DAY_MS * ratio);
    const leftPercent = ratio * 100;

    return {
      id: date.toISOString(),
      label: new Intl.DateTimeFormat("hu-HU", { month: "short", day: "2-digit" }).format(date),
      leftPercent,
    };
  });
}

export function summarizeTasks(tasks: ProbaV2Task[]): ProbaV2Summary {
  return {
    taskCount: tasks.length,
    milestoneCount: tasks.filter((task) => task.milestone).length,
    averageProgress: Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / Math.max(1, tasks.length)),
    totalCostPlan: tasks.reduce((sum, task) => sum + task.costPlan, 0),
    delayedCount: tasks.filter((task) => task.status === "Késik").length,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency: "HUF",
    maximumFractionDigits: 0,
  }).format(value);
}
