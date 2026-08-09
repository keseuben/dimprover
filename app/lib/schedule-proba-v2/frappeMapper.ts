import { ProbaV2Task } from "./types";

export type FrappeGanttTask = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  custom_class?: string;
};

export function mapProbaTasksToFrappe(tasks: ProbaV2Task[]): FrappeGanttTask[] {
  return tasks.map((task) => ({
    id: task.id,
    name: task.milestone ? `◆ ${task.name}` : task.name,
    start: task.start,
    end: task.end,
    progress: task.progress,
    dependencies: task.dependencies.join(","),
    custom_class: task.milestone ? "dimprover-milestone" : `dimprover-status-${task.status.toLowerCase()}`,
  }));
}
