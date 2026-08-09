import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

export type GeometryRectangle = { x1: number; y1: number; x2: number; y2: number };

export function roomRectangle(room: SurveyRoom): GeometryRectangle {
  return { x1: room.x, y1: room.y, x2: room.x + room.width, y2: room.y + room.depth };
}

export function rectangleArea(rectangle: GeometryRectangle) {
  return Math.max(0, rectangle.x2 - rectangle.x1) * Math.max(0, rectangle.y2 - rectangle.y1);
}

export function rectangleIntersection(first: GeometryRectangle, second: GeometryRectangle): GeometryRectangle | null {
  const intersection = {
    x1: Math.max(first.x1, second.x1),
    y1: Math.max(first.y1, second.y1),
    x2: Math.min(first.x2, second.x2),
    y2: Math.min(first.y2, second.y2),
  };
  return rectangleArea(intersection) > 0 ? intersection : null;
}

export function unionRectangleArea(rectangles: GeometryRectangle[]) {
  if (!rectangles.length) return 0;
  const xValues = [...new Set(rectangles.flatMap((rectangle) => [rectangle.x1, rectangle.x2]))].sort((left, right) => left - right);
  let area = 0;
  for (let index = 0; index < xValues.length - 1; index += 1) {
    const x1 = xValues[index];
    const x2 = xValues[index + 1];
    if (x2 <= x1) continue;
    const intervals = rectangles
      .filter((rectangle) => rectangle.x1 < x2 && rectangle.x2 > x1)
      .map((rectangle) => [rectangle.y1, rectangle.y2] as const)
      .sort((left, right) => left[0] - right[0]);
    if (!intervals.length) continue;
    let covered = 0;
    let start = intervals[0][0];
    let end = intervals[0][1];
    for (const [nextStart, nextEnd] of intervals.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd);
      else {
        covered += Math.max(0, end - start);
        start = nextStart;
        end = nextEnd;
      }
    }
    covered += Math.max(0, end - start);
    area += (x2 - x1) * covered;
  }
  return area;
}

export function roomProjectedOverlapRatio(room: SurveyRoom, adjacentRooms: SurveyRoom[]) {
  const base = roomRectangle(room);
  const baseArea = rectangleArea(base);
  if (baseArea <= 0) return 0;
  const intersections = adjacentRooms.map((candidate) => rectangleIntersection(base, roomRectangle(candidate))).filter((value): value is GeometryRectangle => Boolean(value));
  return Math.min(1, Math.max(0, unionRectangleArea(intersections) / baseArea));
}
