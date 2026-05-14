import {
  ScheduleBuilding,
  ScheduleCategory,
  ScheduleLocation,
  ScheduleTask,
} from "@/app/lib/schedule/types";

export type NormalizedSchedule = {
  locationsById: Record<string, ScheduleLocation>;
  buildingsById: Record<string, ScheduleBuilding>;
  categoriesById: Record<string, ScheduleCategory>;
  tasksById: Record<number, ScheduleTask>;

  locationIds: string[];
  buildingIds: string[];
  categoryIds: string[];
  taskIds: number[];
};

export function normalizeSchedule(
  schedule: ScheduleLocation[]
): NormalizedSchedule {
  const locationsById: Record<string, ScheduleLocation> = {};
  const buildingsById: Record<string, ScheduleBuilding> = {};
  const categoriesById: Record<string, ScheduleCategory> = {};
  const tasksById: Record<number, ScheduleTask> = {};

  const locationIds: string[] = [];
  const buildingIds: string[] = [];
  const categoryIds: string[] = [];
  const taskIds: number[] = [];

  schedule.forEach((location) => {
    locationsById[location.id] = location;
    locationIds.push(location.id);

    location.buildings.forEach((building) => {
      buildingsById[building.id] = building;
      buildingIds.push(building.id);

      building.categories.forEach((category) => {
        categoriesById[category.id] = category;
        categoryIds.push(category.id);

        category.tasks.forEach((task) => {
          tasksById[task.id] = task;
          taskIds.push(task.id);
        });
      });
    });
  });

  return {
    locationsById,
    buildingsById,
    categoriesById,
    tasksById,
    locationIds,
    buildingIds,
    categoryIds,
    taskIds,
  };
}

export function getNormalizedTasks(
  normalized: NormalizedSchedule
): ScheduleTask[] {
  return normalized.taskIds.map((taskId) => normalized.tasksById[taskId]);
}

export function getTaskById(
  normalized: NormalizedSchedule,
  taskId: number
): ScheduleTask | undefined {
  return normalized.tasksById[taskId];
}