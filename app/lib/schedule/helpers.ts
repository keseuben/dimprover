import { ScheduleLocation, ScheduleTask } from "@/app/lib/schedule/types";

export function updateTaskInSchedule(
  schedule: ScheduleLocation[],
  taskId: number,
  updater: (task: ScheduleTask) => ScheduleTask
) {
  return schedule.map((location) => ({
    ...location,
    buildings: location.buildings.map((building) => ({
      ...building,
      categories: building.categories.map((category) => ({
        ...category,
        tasks: category.tasks.map((task) =>
          task.id === taskId ? updater(task) : task
        ),
      })),
    })),
  }));
}

export function deleteTaskFromSchedule(
  schedule: ScheduleLocation[],
  taskId: number
) {
  return schedule.map((location) => ({
    ...location,
    buildings: location.buildings.map((building) => ({
      ...building,
      categories: building.categories.map((category) => ({
        ...category,
        tasks: category.tasks.filter((task) => task.id !== taskId),
      })),
    })),
  }));
}

export function addTaskToFirstCategory(
  schedule: ScheduleLocation[],
  task: ScheduleTask
) {
  return addTaskToCategory(schedule, task, task.category);
}

export function addTaskToCategory(
  schedule: ScheduleLocation[],
  task: ScheduleTask,
  categoryName: string
) {
  let inserted = false;

  const nextSchedule = schedule.map((location, locationIndex) => ({
    ...location,
    buildings: location.buildings.map((building, buildingIndex) => ({
      ...building,
      categories: building.categories.map((category, categoryIndex) => {
        const shouldAdd =
          !inserted &&
          (category.name === categoryName ||
            (locationIndex === 0 && buildingIndex === 0 && categoryIndex === 0));

        if (!shouldAdd) return category;

        inserted = true;

        return {
          ...category,
          tasks: [...category.tasks, task],
        };
      }),
    })),
  }));

  return nextSchedule;
}

export function getAllTasks(schedule: ScheduleLocation[]) {
  return schedule.flatMap((location) =>
    location.buildings.flatMap((building) =>
      building.categories.flatMap((category) => category.tasks)
    )
  );
}

export function createEmptySchedule(): ScheduleLocation[] {
  return [
    {
      id: "location-1",
      name: "I. ütem / Fő munkaterület",
      type: "location",
      buildings: [
        {
          id: "building-1",
          name: "Épület / munkaterület",
          type: "building",
          categories: [
            {
              id: "category-1",
              name: "Előkészítés",
              color: "bg-slate-600",
              lightColor: "bg-slate-200",
              tasks: [],
            },
            {
              id: "category-2",
              name: "Földmunka",
              color: "bg-amber-600",
              lightColor: "bg-amber-200",
              tasks: [],
            },
            {
              id: "category-3",
              name: "Szerkezetépítés",
              color: "bg-orange-600",
              lightColor: "bg-orange-200",
              tasks: [],
            },
            {
              id: "category-4",
              name: "Közmű",
              color: "bg-emerald-600",
              lightColor: "bg-emerald-200",
              tasks: [],
            },
            {
              id: "category-5",
              name: "Átadás",
              color: "bg-purple-600",
              lightColor: "bg-purple-200",
              tasks: [],
            },
          ],
        },
      ],
    },
  ];
}
