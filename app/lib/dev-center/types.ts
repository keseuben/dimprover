export type DevProjectStatus = "active" | "paused" | "completed" | "archived" | "unassigned";
export type DevVersionStatus = "planned" | "in_progress" | "testing" | "blocked" | "completed" | "released";
export type DevWorkSessionSource = "automatic" | "manual" | "chatgpt" | "system";
export type DevWorkCategory = "active_development" | "build_test" | "waiting_blocked" | "documentation_release";

export type DevWorkTimeSegment = {
  id: string;
  category: DevWorkCategory;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
};

export type DevProject = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  status: DevProjectStatus;
  accent: "cyan" | "lime" | "blue" | "amber" | "slate";
  startedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DevVersion = {
  id: string;
  projectId: string;
  version: string;
  moduleName: string;
  title: string;
  summary: string;
  status: DevVersionStatus;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  chatTitle?: string;
  chatUrl?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  testSummary?: string;
  nextStep?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
};

export type DevWorkSession = {
  id: string;
  versionId: string;
  projectId: string;
  moduleName: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  timeSegments?: DevWorkTimeSegment[];
  currentCategory?: DevWorkCategory | null;
  source: DevWorkSessionSource;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type DevCenterState = {
  projects: DevProject[];
  versions: DevVersion[];
  workSessions: DevWorkSession[];
  updatedAt: string;
};
