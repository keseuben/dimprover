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
      number: string;
    }
  | {
      id: string;
      rowType: "building";
      building: ScheduleBuilding;
      height: number;
      number: string;
    }
  | {
      id: string;
      rowType: "category";
      category: ScheduleCategory;
      height: number;
      number: string;
    }
  | {
      id: string;
      rowType: "task";
      task: ScheduleTask;
      category: ScheduleCategory;
      height: number;
      number: string;
    };

function toAlpha(value: number) {
  let number = value;
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

export function buildVisibleRows(
  schedule: ScheduleLocation[],
  collapsedRows: Set<string>
): VisibleRow[] {
  const rows: VisibleRow[] = [];

  schedule.forEach((location) => {
    const locationNumber = "";
    rows.push({
      id: location.id,
      rowType: "location",
      location,
      height: 36,
      number: "",
    });

    const locationCollapsed = collapsedRows.has(location.id);

    if (locationCollapsed) return;

    location.buildings.forEach((building, buildingIndex) => {
      const buildingNumber = toAlpha(buildingIndex + 1);
      rows.push({
        id: building.id,
        rowType: "building",
        building,
        height: 34,
        number: buildingNumber,
      });

      const buildingCollapsed = collapsedRows.has(building.id);

      if (buildingCollapsed) return;

      building.categories.forEach((category, categoryIndex) => {
        const categoryNumber = `${buildingNumber}.${categoryIndex + 1}`;
        rows.push({
          id: category.id,
          rowType: "category",
          category,
          height: 32,
          number: categoryNumber,
        });

        const categoryCollapsed = collapsedRows.has(category.id);

        if (categoryCollapsed) return;

        category.tasks.forEach((task, taskIndex) => {
          rows.push({
            id: `task-${task.id}`,
            rowType: "task",
            task,
            category,
            height: 44,
            number: `${categoryNumber}.${taskIndex + 1}`,
          });
        });
      });
    });
  });

  return rows;
}