export type ViewMode =
  | "year"
  | "fourMonth"
  | "month"
  | "week"
  | "day";

export type ZoomMode =
  | "compact"
  | "normal"
  | "wide";

export type ScheduleSource =
  | "sample"
  | "project-1"
  | "project-2";

export type ScheduleFeatureState = {
  showContractBars: boolean;
  showActualBars: boolean;
  showProgressOverlay: boolean;
  showTodayLine: boolean;
  showLegend: boolean;
  showCollapsedSummaryBars: boolean;
  showFilters: boolean;
  showPdfExport: boolean;
  showViewSwitcher: boolean;
  showFloatingToolbar: boolean;
};

export type ScheduleTask = {
  id: number;
  order: number;

  name: string;
  contractor: string;
  category: string;

  startWeek: number;
  duration: number;

  contractStartWeek: number;
  contractDuration: number;

  actualStartWeek: number;
  actualDuration: number;

  startDate: string;
  endDate: string;

  contractStartDate: string;
  contractEndDate: string;

  actualStartDate: string;
  actualEndDate: string;

  color?: string;
  taskType?: string;
  workType?: string;

  progress?: number;

predecessors?: number[];
};

export type ScheduleCategory = {
  id: string;
  name: string;
  color: string;
  lightColor: string;
  tasks: ScheduleTask[];
};

export type ScheduleBuilding = {
  id: string;
  name: string;
  type: "building";
  categories: ScheduleCategory[];
};

export type ScheduleLocation = {
  id: string;
  name: string;
  type: "location";
  buildings: ScheduleBuilding[];
};

export type ResizeState = {
  taskId: number;
  startX: number;
  originalEndDate: string;
};