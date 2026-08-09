import { createGeometryTraceItem } from "@/components/energy/audit/createCalculationTrace";
import type {
  EnergyEnvelopeGeometryResult,
  EnergyEnvelopeWallRow,
  EnergyGeometryTraceItem,
  EnergyGeometryValidationMessage,
  EnergyLevelGeometryRow,
  EnergyOrientationGeometryRow,
} from "@/components/energy/domain/energyGeometryTypes";
import { roomProjectedOverlapRatio } from "@/components/energy/calculations/geometry/geometryRectangleMath";
import { validateEnvelopeGeometry } from "@/components/energy/validation/validateGeometry";
import {
  getWallSegmentHeightMeters,
  getWallSegmentLengthMeters,
  getWallSegmentOrientationLabel,
  type SurveyBuildingLevel,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";
import { getRoomUsableHeight } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function openingArea(opening: SurveyWallOpening) {
  return Math.max(0, Number(opening.widthMeters) || 0) * Math.max(0, Number(opening.heightMeters) || 0);
}

function roofSlopeFactor(section?: SurveySectionLine | null) {
  if (!section || section.roofShape === "flat") return 1;
  if (section.roofShape === "singleSlope") {
    const degrees = Math.max(0, Math.min(80, Number(section.leftRoofPitchDegrees) || Number(section.rightRoofPitchDegrees) || 0));
    return Math.min(4, 1 / Math.max(0.25, Math.cos(degrees * Math.PI / 180)));
  }
  if (section.roofShape === "gable") {
    const leftDegrees = Math.max(0, Math.min(80, Number(section.leftRoofPitchDegrees) || 0));
    const rightDegrees = Math.max(0, Math.min(80, Number(section.rightRoofPitchDegrees) || 0));
    const leftFactor = 1 / Math.max(0.25, Math.cos(leftDegrees * Math.PI / 180));
    const rightFactor = 1 / Math.max(0.25, Math.cos(rightDegrees * Math.PI / 180));
    return Math.min(4, (leftFactor + rightFactor) / 2);
  }
  return 1;
}

function usesSlopedUpperBoundary(level: SurveyBuildingLevel, rooms: SurveyRoom[]) {
  if (level.kind === "attic") return true;
  return rooms.some((room) => {
    const value = `${room.ceilingType || ""} ${room.note || ""}`.toLocaleLowerCase("hu-HU");
    return (value.includes("tetősík") || value.includes("magastető")) && !value.includes("padlásfödém");
  });
}

function wallDisplayName(segment: SurveyWallSegment, room: SurveyRoom) {
  const sideLabels = { top: "felső", right: "jobb", bottom: "alsó", left: "bal" } as const;
  return `${room.name} · ${sideLabels[segment.side]} falszakasz`;
}

function sum<T>(rows: T[], selector: (row: T) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

export function calculateEnvelopeGeometry(input: {
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  sectionLines: SurveySectionLine[];
  northAngle: number;
  calculatedAt?: string;
}): EnergyEnvelopeGeometryResult {
  const validation = validateEnvelopeGeometry(input);
  const validationMessages: EnergyGeometryValidationMessage[] = [...validation.messages];
  const trace: EnergyGeometryTraceItem[] = [];
  const roomMap = new Map(input.rooms.map((room) => [room.id, room]));
  const levelMap = new Map(input.levels.map((level) => [level.id, level]));
  const sortedLevels = [...input.levels].sort((left, right) => left.order - right.order);
  const envelopeSegments = input.wallSegments.filter((segment) => ["external", "unheated", "adjacent", "ground"].includes(segment.boundaryType));
  const uniqueSegments: Array<{ segment: SurveyWallSegment; duplicates: SurveyWallSegment[] }> = [];
  const groupedWalls = new Map<string, SurveyWallSegment[]>();

  for (const segment of envelopeSegments) {
    const room = roomMap.get(segment.roomId);
    if (!room?.heated) continue;
    const key = validation.canonicalWallKey(segment, room);
    groupedWalls.set(key, [...(groupedWalls.get(key) || []), segment]);
  }
  for (const segments of groupedWalls.values()) uniqueSegments.push({ segment: segments[0], duplicates: segments.slice(1) });

  const wallRows: EnergyEnvelopeWallRow[] = uniqueSegments.flatMap(({ segment, duplicates }) => {
    const room = roomMap.get(segment.roomId);
    if (!room) return [];
    const level = levelMap.get(segment.levelId);
    const lengthMetersRaw = getWallSegmentLengthMeters(room, segment);
    const heightMetersRaw = segment.heightMeters ? getWallSegmentHeightMeters(room, segment) : getRoomUsableHeight(room);
    const grossRaw = lengthMetersRaw * heightMetersRaw;
    const openings = input.wallOpenings.filter((opening) => opening.wallSegmentId === segment.id);
    const openingRaw = sum(openings, openingArea);
    const netRaw = Math.max(0, grossRaw - openingRaw);
    const orientation = getWallSegmentOrientationLabel(segment, input.northAngle);
    const wallName = wallDisplayName(segment, room);

    trace.push(createGeometryTraceItem({
      ruleId: "GEOM-WALL-GROSS-001",
      label: `${wallName} bruttó felülete`,
      formula: "falszakasz hossza × hasznos belmagasság",
      inputs: { lengthMeters: lengthMetersRaw, heightMeters: heightMetersRaw },
      unroundedValue: grossRaw,
      unit: "m2",
      entityRefs: [{ type: "wall", id: segment.id, name: wallName }, { type: "room", id: room.id, name: room.name }],
    }));
    trace.push(createGeometryTraceItem({
      ruleId: "GEOM-WALL-NET-002",
      label: `${wallName} nettó felülete`,
      formula: "bruttó falfelület − kapcsolódó nyílászárók felülete",
      inputs: { grossAreaSquareMeters: grossRaw, openingAreaSquareMeters: openingRaw, openingCount: openings.length },
      unroundedValue: netRaw,
      unit: "m2",
      entityRefs: [{ type: "wall", id: segment.id, name: wallName }, ...openings.map((opening) => ({ type: "opening" as const, id: opening.id, name: opening.name || opening.id }))],
    }));

    return [{
      levelId: segment.levelId,
      levelName: level?.name || segment.levelId,
      roomId: room.id,
      roomName: room.name,
      wallSegmentId: segment.id,
      wallName,
      boundaryType: segment.boundaryType,
      orientation: orientation.label,
      azimuth: round(orientation.azimuth, 1),
      lengthMeters: round(lengthMetersRaw),
      heightMeters: round(heightMetersRaw),
      grossAreaSquareMeters: round(grossRaw),
      openingAreaSquareMeters: round(openingRaw),
      netAreaSquareMeters: round(netRaw),
      openingCount: openings.length,
      duplicateSourceIds: duplicates.map((duplicate) => duplicate.id),
    }];
  });

  const orientationMap = new Map<string, EnergyOrientationGeometryRow>();
  for (const row of wallRows) {
    const existing = orientationMap.get(row.orientation) || {
      orientation: row.orientation,
      azimuth: row.azimuth,
      wallCount: 0,
      openingCount: 0,
      grossWallAreaSquareMeters: 0,
      openingAreaSquareMeters: 0,
      netWallAreaSquareMeters: 0,
    };
    existing.wallCount += 1;
    existing.openingCount += row.openingCount;
    existing.grossWallAreaSquareMeters += row.grossAreaSquareMeters;
    existing.openingAreaSquareMeters += row.openingAreaSquareMeters;
    existing.netWallAreaSquareMeters += row.netAreaSquareMeters;
    orientationMap.set(row.orientation, existing);
  }
  const orientationRows = [...orientationMap.values()].map((row) => ({
    ...row,
    grossWallAreaSquareMeters: round(row.grossWallAreaSquareMeters),
    openingAreaSquareMeters: round(row.openingAreaSquareMeters),
    netWallAreaSquareMeters: round(row.netWallAreaSquareMeters),
  })).sort((left, right) => left.azimuth - right.azimuth);

  const levelRows: EnergyLevelGeometryRow[] = sortedLevels.map((level, levelIndex) => {
    const levelRooms = input.rooms.filter((room) => (room.levelId || sortedLevels[0]?.id) === level.id);
    const conditionedRooms = levelRooms.filter((room) => room.heated);
    const lowerLevel = sortedLevels[levelIndex - 1];
    const upperLevel = sortedLevels[levelIndex + 1];
    const lowerConditionedRooms = lowerLevel ? input.rooms.filter((room) => room.heated && (room.levelId || sortedLevels[0]?.id) === lowerLevel.id) : [];
    const upperConditionedRooms = upperLevel ? input.rooms.filter((room) => room.heated && (room.levelId || sortedLevels[0]?.id) === upperLevel.id) : [];
    const floorAreaRaw = sum(levelRooms, (room) => Math.max(0, Number(room.area) || 0));
    const conditionedFloorRaw = sum(conditionedRooms, (room) => Math.max(0, Number(room.area) || 0));
    const volumeRaw = sum(conditionedRooms, (room) => Math.max(0, Number(room.area) || 0) * getRoomUsableHeight(room));
    let lowerBoundaryRaw = 0;
    let upperProjectedRaw = 0;

    for (const room of conditionedRooms) {
      const area = Math.max(0, Number(room.area) || 0);
      const lowerOverlapRatio = lowerConditionedRooms.length ? roomProjectedOverlapRatio(room, lowerConditionedRooms) : 0;
      const upperOverlapRatio = upperConditionedRooms.length ? roomProjectedOverlapRatio(room, upperConditionedRooms) : 0;
      const lowerArea = area * (1 - lowerOverlapRatio);
      const upperArea = area * (1 - upperOverlapRatio);
      lowerBoundaryRaw += lowerArea;
      upperProjectedRaw += upperArea;
      trace.push(createGeometryTraceItem({
        ruleId: "GEOM-ROOM-VOLUME-003",
        label: `${room.name} kondicionált térfogata`,
        formula: "helyiség alapterülete × hasznos belmagasság",
        inputs: { areaSquareMeters: area, usableHeightMeters: getRoomUsableHeight(room) },
        unroundedValue: area * getRoomUsableHeight(room),
        unit: "m3",
        entityRefs: [{ type: "room", id: room.id, name: room.name }],
      }));
      trace.push(createGeometryTraceItem({
        ruleId: "GEOM-LOWER-BOUNDARY-004",
        label: `${room.name} alsó határoló felülete`,
        formula: "helyiség alapterülete × (1 − alsó fűtött átfedési arány)",
        inputs: { areaSquareMeters: area, lowerConditionedOverlapRatio: lowerOverlapRatio },
        unroundedValue: lowerArea,
        unit: "m2",
        entityRefs: [{ type: "room", id: room.id, name: room.name }],
      }));
      trace.push(createGeometryTraceItem({
        ruleId: "GEOM-UPPER-PROJECTED-005",
        label: `${room.name} felső határoló vetülete`,
        formula: "helyiség alapterülete × (1 − felső fűtött átfedési arány)",
        inputs: { areaSquareMeters: area, upperConditionedOverlapRatio: upperOverlapRatio },
        unroundedValue: upperArea,
        unit: "m2",
        entityRefs: [{ type: "room", id: room.id, name: room.name }],
      }));
    }

    if (upperLevel && conditionedRooms.length && upperConditionedRooms.length && upperProjectedRaw >= conditionedFloorRaw - 0.001) {
      validationMessages.push({
        code: "MULTILEVEL_PROJECTION_UNCERTAIN",
        severity: "warning",
        blocking: false,
        levelId: level.id,
        entityType: "level",
        entityId: level.id,
        entityName: level.name,
        relatedEntityIds: [upperLevel.id],
        message: `${level.name} és ${upperLevel.name}: a fűtött helyiségek alaprajzi vetülete nem fedi egymást. Ellenőrizd, hogy a szintek közös koordinátarendszerben vannak-e.`,
      });
    }

    const slopedBoundary = usesSlopedUpperBoundary(level, conditionedRooms);
    const section = input.sectionLines.find((line) => line.levelId === level.id) || null;
    const slopeFactorRaw = slopedBoundary ? roofSlopeFactor(section) : 1;
    if (slopedBoundary && section?.roofShape === "custom") validationMessages.push({ code: "CUSTOM_ROOF_AREA_APPROXIMATION", severity: "warning", blocking: false, levelId: level.id, entityType: "section", entityId: section.id, entityName: section.name, message: `${section.name}: egyedi tetőformánál a felső határoló felület jelenleg vízszintes vetülettel számolódik.` });
    const upperAdjustedRaw = upperProjectedRaw * slopeFactorRaw;
    const roofOpeningRaw = slopedBoundary && section
      ? Math.min(upperAdjustedRaw, Math.max(0, section.roofWindowCount) * Math.max(0, section.roofWindowWidthMeters) * Math.max(0, section.roofWindowHeightMeters))
      : 0;
    const levelWalls = wallRows.filter((row) => row.levelId === level.id);
    const grossWallRaw = sum(levelWalls, (row) => row.grossAreaSquareMeters);
    const openingWallRaw = sum(levelWalls, (row) => row.openingAreaSquareMeters);
    const netWallRaw = sum(levelWalls, (row) => row.netAreaSquareMeters);
    const envelopeRaw = grossWallRaw + lowerBoundaryRaw + upperAdjustedRaw;

    trace.push(createGeometryTraceItem({
      ruleId: "GEOM-UPPER-ADJUSTED-006",
      label: `${level.name} felső határoló felülete`,
      formula: "felső határoló vízszintes vetülete × tetősík szorzó",
      inputs: { projectedAreaSquareMeters: upperProjectedRaw, roofSlopeFactor: slopeFactorRaw, slopedBoundary },
      unroundedValue: upperAdjustedRaw,
      unit: "m2",
      entityRefs: [{ type: "level", id: level.id, name: level.name }, ...(section ? [{ type: "section" as const, id: section.id, name: section.name }] : [])],
    }));
    trace.push(createGeometryTraceItem({
      ruleId: "GEOM-LEVEL-ENVELOPE-007",
      label: `${level.name} lehűlő felülete`,
      formula: "bruttó energetikai falfelület + alsó határoló felület + felső határoló felület",
      inputs: { grossWallAreaSquareMeters: grossWallRaw, lowerBoundaryAreaSquareMeters: lowerBoundaryRaw, upperBoundaryAreaSquareMeters: upperAdjustedRaw },
      unroundedValue: envelopeRaw,
      unit: "m2",
      entityRefs: [{ type: "level", id: level.id, name: level.name }],
    }));

    return {
      levelId: level.id,
      levelName: level.name,
      roomCount: levelRooms.length,
      conditionedRoomCount: conditionedRooms.length,
      floorAreaSquareMeters: round(floorAreaRaw),
      conditionedFloorAreaSquareMeters: round(conditionedFloorRaw),
      conditionedVolumeCubicMeters: round(volumeRaw),
      grossWallAreaSquareMeters: round(grossWallRaw),
      openingAreaSquareMeters: round(openingWallRaw),
      netWallAreaSquareMeters: round(netWallRaw),
      lowerBoundaryAreaSquareMeters: round(lowerBoundaryRaw),
      upperBoundaryProjectedAreaSquareMeters: round(upperProjectedRaw),
      upperBoundaryAdjustedAreaSquareMeters: round(upperAdjustedRaw),
      roofOpeningAreaSquareMeters: round(roofOpeningRaw),
      roofSlopeFactor: round(slopeFactorRaw, 4),
      thermalEnvelopeAreaSquareMeters: round(envelopeRaw),
    };
  });

  const totals = {
    floorAreaSquareMeters: round(sum(levelRows, (row) => row.floorAreaSquareMeters)),
    conditionedFloorAreaSquareMeters: round(sum(levelRows, (row) => row.conditionedFloorAreaSquareMeters)),
    conditionedVolumeCubicMeters: round(sum(levelRows, (row) => row.conditionedVolumeCubicMeters)),
    grossWallAreaSquareMeters: round(sum(levelRows, (row) => row.grossWallAreaSquareMeters)),
    openingAreaSquareMeters: round(sum(levelRows, (row) => row.openingAreaSquareMeters)),
    netWallAreaSquareMeters: round(sum(levelRows, (row) => row.netWallAreaSquareMeters)),
    lowerBoundaryAreaSquareMeters: round(sum(levelRows, (row) => row.lowerBoundaryAreaSquareMeters)),
    upperBoundaryProjectedAreaSquareMeters: round(sum(levelRows, (row) => row.upperBoundaryProjectedAreaSquareMeters)),
    upperBoundaryAdjustedAreaSquareMeters: round(sum(levelRows, (row) => row.upperBoundaryAdjustedAreaSquareMeters)),
    roofOpeningAreaSquareMeters: round(sum(levelRows, (row) => row.roofOpeningAreaSquareMeters)),
    thermalEnvelopeAreaSquareMeters: round(sum(levelRows, (row) => row.thermalEnvelopeAreaSquareMeters)),
    areaToVolumeRatioPerMeter: null as number | null,
  };
  totals.areaToVolumeRatioPerMeter = totals.conditionedVolumeCubicMeters > 0 ? round(totals.thermalEnvelopeAreaSquareMeters / totals.conditionedVolumeCubicMeters, 4) : null;

  if (totals.areaToVolumeRatioPerMeter !== null) trace.push(createGeometryTraceItem({
    ruleId: "GEOM-AV-RATIO-008",
    label: "Épület A/V aránya",
    formula: "teljes lehűlő felület / kondicionált térfogat",
    inputs: { thermalEnvelopeAreaSquareMeters: totals.thermalEnvelopeAreaSquareMeters, conditionedVolumeCubicMeters: totals.conditionedVolumeCubicMeters },
    unroundedValue: totals.areaToVolumeRatioPerMeter,
    unit: "1/m",
    entityRefs: sortedLevels.map((level) => ({ type: "level" as const, id: level.id, name: level.name })),
    digits: 4,
  }));

  const blocked = validationMessages.some((message) => message.blocking);
  return {
    schema: "dimpro.energy-geometry.v0.7.1",
    engineVersion: "0.7.1",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    valid: !blocked,
    blocked,
    wallRows,
    orientationRows,
    levelRows,
    totals,
    validationMessages,
    trace,
  };
}
