import { ScheduleTask } from "@/app/lib/schedule/types";
import { NormalizedSchedule } from "@/app/lib/schedule/normalizer";
import { isDateRangeVisible } from "@/app/lib/schedule/viewportEngine";
import { VisibleRowLayout } from "@/app/lib/schedule/rowLayoutEngine";

export type TaskVisibleRowLayout = Extract<
  VisibleRowLayout,
  { rowType: "task" }
>;

export function selectTaskRows(rows: VisibleRowLayout[]): TaskVisibleRowLayout[] {
  return rows.filter(
    (row): row is TaskVisibleRowLayout => row.rowType === "task"
  );
}

export function selectAllTasks(normalized: NormalizedSchedule): ScheduleTask[] {
  return normalized.taskIds.map((taskId) => normalized.tasksById[taskId]);
}

export function selectTaskById(
  normalized: NormalizedSchedule,
  taskId: number
): ScheduleTask | undefined {
  return normalized.tasksById[taskId];
}

export function selectTasksWithDependencies(
  normalized: NormalizedSchedule
): ScheduleTask[] {
  return selectAllTasks(normalized).filter(
    (task) => task.predecessors && task.predecessors.length > 0
  );
}

export function selectTasksInDateRange(
  normalized: NormalizedSchedule,
  startDate: string,
  endDate: string
): ScheduleTask[] {
  return selectAllTasks(normalized).filter((task) =>
    isDateRangeVisible(
      task.actualStartDate,
      task.actualEndDate,
      startDate,
      endDate
    )
  );
}

export function selectVisibleDependencies(tasks: ScheduleTask[]): ScheduleTask[] {
  return tasks.filter(
    (task) => task.predecessors && task.predecessors.length > 0
  );
}
