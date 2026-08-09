export type ProbaV2TaskStatus = "Tervezett" | "Folyamatban" | "Kész" | "Késik";

export type ProbaV2Task = {
  id: string;
  name: string;
  owner: string;
  start: string;
  end: string;
  progress: number;
  dependencies: string[];
  milestone?: boolean;
  status: ProbaV2TaskStatus;
  costPlan: number;
};

export type ProbaV2TimelineItem = ProbaV2Task & {
  offsetDays: number;
  durationDays: number;
  leftPercent: number;
  widthPercent: number;
};

export type ProbaV2Summary = {
  taskCount: number;
  milestoneCount: number;
  averageProgress: number;
  totalCostPlan: number;
  delayedCount: number;
};
