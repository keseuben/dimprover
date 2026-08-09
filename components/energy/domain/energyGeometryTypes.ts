import type { SurveyWallBoundaryType } from "@/components/property-survey/propertySurveyBuildingModel";

export type EnergyGeometryValidationSeverity = "info" | "warning" | "error";

export type EnergyGeometryValidationMessage = {
  code:
    | "NO_CONDITIONED_ROOM"
    | "ROOM_DIMENSION_INVALID"
    | "ROOM_HEIGHT_INVALID"
    | "ROOM_OVERLAP"
    | "WALL_ROOM_MISSING"
    | "DUPLICATE_ENVELOPE_WALL"
    | "HEATED_ROOM_WITHOUT_ENVELOPE_WALL"
    | "OPENING_DIMENSION_INVALID"
    | "OPENING_WIDER_THAN_WALL"
    | "OPENING_AREA_EXCEEDS_WALL"
    | "CUSTOM_ROOF_AREA_APPROXIMATION"
    | "MULTILEVEL_PROJECTION_UNCERTAIN";
  severity: EnergyGeometryValidationSeverity;
  blocking: boolean;
  levelId?: string;
  entityType?: "room" | "wall" | "opening" | "level" | "section";
  entityId?: string;
  entityName?: string;
  relatedEntityIds?: string[];
  message: string;
};

export type EnergyGeometryTraceItem = {
  id: string;
  ruleId: string;
  label: string;
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  unroundedValue: number;
  value: number;
  unit: "m" | "m2" | "m3" | "1/m" | "%";
  entityRefs: Array<{ type: "room" | "wall" | "opening" | "level" | "section"; id: string; name: string }>;
};

export type EnergyEnvelopeWallRow = {
  levelId: string;
  levelName: string;
  roomId: string;
  roomName: string;
  wallSegmentId: string;
  wallName: string;
  boundaryType: SurveyWallBoundaryType;
  orientation: string;
  azimuth: number;
  lengthMeters: number;
  heightMeters: number;
  grossAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netAreaSquareMeters: number;
  openingCount: number;
  duplicateSourceIds: string[];
};

export type EnergyOrientationGeometryRow = {
  orientation: string;
  azimuth: number;
  wallCount: number;
  openingCount: number;
  grossWallAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netWallAreaSquareMeters: number;
};

export type EnergyLevelGeometryRow = {
  levelId: string;
  levelName: string;
  roomCount: number;
  conditionedRoomCount: number;
  floorAreaSquareMeters: number;
  conditionedFloorAreaSquareMeters: number;
  conditionedVolumeCubicMeters: number;
  grossWallAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netWallAreaSquareMeters: number;
  lowerBoundaryAreaSquareMeters: number;
  upperBoundaryProjectedAreaSquareMeters: number;
  upperBoundaryAdjustedAreaSquareMeters: number;
  roofOpeningAreaSquareMeters: number;
  roofSlopeFactor: number;
  thermalEnvelopeAreaSquareMeters: number;
};

export type EnergyEnvelopeGeometryResult = {
  schema: "dimpro.energy-geometry.v0.7.1";
  engineVersion: "0.7.1";
  calculatedAt: string;
  valid: boolean;
  blocked: boolean;
  wallRows: EnergyEnvelopeWallRow[];
  orientationRows: EnergyOrientationGeometryRow[];
  levelRows: EnergyLevelGeometryRow[];
  totals: {
    floorAreaSquareMeters: number;
    conditionedFloorAreaSquareMeters: number;
    conditionedVolumeCubicMeters: number;
    grossWallAreaSquareMeters: number;
    openingAreaSquareMeters: number;
    netWallAreaSquareMeters: number;
    lowerBoundaryAreaSquareMeters: number;
    upperBoundaryProjectedAreaSquareMeters: number;
    upperBoundaryAdjustedAreaSquareMeters: number;
    roofOpeningAreaSquareMeters: number;
    thermalEnvelopeAreaSquareMeters: number;
    areaToVolumeRatioPerMeter: number | null;
  };
  validationMessages: EnergyGeometryValidationMessage[];
  trace: EnergyGeometryTraceItem[];
};
