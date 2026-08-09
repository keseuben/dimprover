import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

export const SURVEY_PLAN_UNITS_PER_METER = 60;

export type SurveyRoomDimensionTarget = "length" | "width" | "height";
export type SurveyRoomDimensionSource = "drawn" | "manual" | "bluetooth_keyboard" | "bluetooth_leica" | "bluetooth_bridge" | "lidar" | "imported";

export type ResolvedSurveyRoomDimensions = {
  lengthMeters: number;
  widthMeters: number;
  areaSquareMeters: number;
};

function positiveNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function roundSurveyMeasurement(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseSurveyMeasurement(value: string | number) {
  if (typeof value === "number") return positiveNumber(value);
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  return positiveNumber(normalized);
}

export function resolveSurveyRoomDimensions(room?: Pick<SurveyRoom, "area" | "width" | "depth" | "lengthMeters" | "widthMeters"> | null): ResolvedSurveyRoomDimensions {
  if (!room) return { lengthMeters: 0, widthMeters: 0, areaSquareMeters: 0 };

  const storedLength = positiveNumber(room.lengthMeters);
  const storedWidth = positiveNumber(room.widthMeters);
  if (storedLength && storedWidth) {
    return {
      lengthMeters: roundSurveyMeasurement(storedLength),
      widthMeters: roundSurveyMeasurement(storedWidth),
      areaSquareMeters: roundSurveyMeasurement(storedLength * storedWidth, 2),
    };
  }

  const area = positiveNumber(room.area);
  const planWidth = positiveNumber(room.width);
  const planDepth = positiveNumber(room.depth);
  if (area && planWidth && planDepth) {
    const ratio = Math.max(0.08, planWidth / planDepth);
    const lengthMeters = Math.sqrt(area * ratio);
    const widthMeters = area / Math.max(lengthMeters, 0.01);
    return {
      lengthMeters: roundSurveyMeasurement(lengthMeters),
      widthMeters: roundSurveyMeasurement(widthMeters),
      areaSquareMeters: roundSurveyMeasurement(area, 2),
    };
  }

  const lengthMeters = planWidth ? planWidth / SURVEY_PLAN_UNITS_PER_METER : 0;
  const widthMeters = planDepth ? planDepth / SURVEY_PLAN_UNITS_PER_METER : 0;
  return {
    lengthMeters: roundSurveyMeasurement(lengthMeters),
    widthMeters: roundSurveyMeasurement(widthMeters),
    areaSquareMeters: roundSurveyMeasurement(lengthMeters * widthMeters, 2),
  };
}

export function surveyMetersToPlanUnits(valueMeters: number) {
  return valueMeters * SURVEY_PLAN_UNITS_PER_METER;
}

export function getSurveyDimensionSourceLabel(source?: SurveyRoomDimensionSource) {
  switch (source) {
    case "drawn": return "Alaprajzon felrajzolva";
    case "manual": return "Kézzel megadva";
    case "bluetooth_keyboard": return "Bluetooth billentyűzet";
    case "bluetooth_leica": return "Leica DISTO Bluetooth";
    case "bluetooth_bridge": return "Bluetooth / natív bridge";
    case "lidar": return "LiDAR / RoomPlan";
    case "imported": return "Importált alaprajz";
    default: return "Korábbi adatból számítva";
  }
}
