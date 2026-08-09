import type { SurveyRoomDimensionTarget } from "@/components/property-survey/propertySurveyRoomDimensions";

export const DIMPRO_PROPERTY_MEASUREMENT_EVENT = "dimpro:property-survey-measurement";

export type PropertySurveyMeasurementDetail = {
  valueMeters: number;
  target?: SurveyRoomDimensionTarget;
  deviceName?: string;
  measuredAt?: string;
};

export function dispatchPropertySurveyMeasurement(detail: PropertySurveyMeasurementDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PropertySurveyMeasurementDetail>(DIMPRO_PROPERTY_MEASUREMENT_EVENT, { detail }));
}
