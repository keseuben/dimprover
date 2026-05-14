import {
  ScheduleBuilding,
  ScheduleCategory,
  ScheduleLocation,
  ScheduleTask,
} from "@/app/lib/schedule/types";

export type VisibleRow =
  | {
      id: string;
      rowType: "location";
      location: ScheduleLocation;
      height: number;
    }
  | {
      id: string;
      rowType: "building";
      building: ScheduleBuilding;
      height: number;
    }
  | {
      id: string;
      rowType: "category";
      category: ScheduleCategory;
      height: number;
    }
  | {
      id: string;
      rowType: "task";
      task: ScheduleTask;
      category: ScheduleCategory;
      height: number;
    };

export function buildVisibleRows(
  schedule: ScheduleLocation[],
  collapsedRows: Set<string>
): VisibleRow[] {
  const rows: VisibleRow[] = [];

  schedule.forEach((location) => {
    rows.push({
      id: location.id,
      rowType: "location",
      location,
      height: 55,
    });

    const locationCollapsed = collapsedRows.has(location.id);

    if (locationCollapsed) return;

    location.buildings.forEach((building) => {
      rows.push({
        id: building.id,
        rowType: "building",
        building,
        height: 50,
      });

      const buildingCollapsed = collapsedRows.has(building.id);

      if (buildingCollapsed) return;

      building.categories.forEach((category) => {
        rows.push({
          id: category.id,
          rowType: "category",
          category,
          height: 44,
        });

        const categoryCollapsed = collapsedRows.has(category.id);

        if (categoryCollapsed) return;

        category.tasks.forEach((task) => {
          rows.push({
            id: `task-${task.id}`,
            rowType: "task",
            task,
            category,
            height: 42,
          });
        });
      });
    });
  });

  return rows;
}