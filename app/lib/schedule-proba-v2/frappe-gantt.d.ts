declare module "frappe-gantt" {
  export type GanttTask = {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
    custom_class?: string;
  };

  export type GanttOptions = Record<string, unknown>;

  export default class Gantt {
    constructor(element: HTMLElement, tasks: GanttTask[], options?: GanttOptions);
    change_view_mode(mode: string): void;
    refresh(tasks: GanttTask[]): void;
  }
}
