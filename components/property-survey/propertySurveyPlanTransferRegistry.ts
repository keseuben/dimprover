import type { EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type { SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyPlanPage,
  SurveyPlanTransferAction,
  SurveyPlanTransferAuditEntry,
  SurveyPlanTransferRecord,
  SurveyPlanTransferRegistry,
  SurveyPlanTransferState,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyPlanTransferSourceSnapshot = {
  fingerprint: string;
  wallSuggestionIds: string[];
  openingSuggestionIds: string[];
  wallCount: number;
  openingCount: number;
};

export type SurveyPlanTransferModelSnapshot = {
  fingerprint: string;
  centralWallIds: string[];
  centralOpeningIds: string[];
  centralThermalBridgeIds: string[];
  wallCount: number;
  openingCount: number;
  thermalBridgeCount: number;
  lockedElementCount: number;
};

export type SurveyPlanTransferPageStatus = {
  pageId: string;
  documentId: string;
  state: SurveyPlanTransferState;
  record: SurveyPlanTransferRecord | null;
  source: SurveyPlanTransferSourceSnapshot;
  model: SurveyPlanTransferModelSnapshot;
  sourceChanged: boolean;
  modelChanged: boolean;
  hasTransferredModel: boolean;
  requiresConflictResolution: boolean;
};

export type SurveyPlanTransferRegistryPageSummary = SurveyPlanTransferPageStatus & {
  fileName: string;
  pageNumber: number;
  pageLabel: string;
  levelId: string;
  lastTransferredAt: string;
};

export type SurveyPlanTransferRegistrySummary = {
  pages: SurveyPlanTransferRegistryPageSummary[];
  totals: {
    pageCount: number;
    transferredPageCount: number;
    syncedCount: number;
    sourceChangedCount: number;
    modelChangedCount: number;
    conflictCount: number;
    removedCount: number;
    attentionCount: number;
  };
};

function rounded(value: unknown, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function stableHash(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

export function buildSurveyPlanTransferSourceSnapshot(page: SurveyPlanPage): SurveyPlanTransferSourceSnapshot {
  const approvedWalls = page.wallSuggestions
    .filter((wall) => wall.status === "approved")
    .sort((left, right) => left.id.localeCompare(right.id));
  const approvedWallIds = new Set(approvedWalls.map((wall) => wall.id));
  const approvedOpenings = page.openingSuggestions
    .filter((opening) => opening.status === "approved" && approvedWallIds.has(opening.wallSuggestionId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const payload = {
    pageId: page.id,
    documentId: page.documentId,
    levelId: page.levelId,
    walls: approvedWalls.map((wall) => ({
      id: wall.id,
      levelId: wall.levelId,
      start: { x: rounded(wall.start.x), y: rounded(wall.start.y) },
      end: { x: rounded(wall.end.x), y: rounded(wall.end.y) },
      boundaryType: wall.boundaryType,
      orientationDegrees: rounded(wall.orientationDegrees),
      lengthMeters: rounded(wall.lengthMeters),
      heightMeters: rounded(wall.heightMeters),
      thicknessMeters: rounded(wall.thicknessMeters),
      assemblyId: wall.assemblyId,
      zoneId: wall.zoneId,
      adjacentZoneId: wall.adjacentZoneId,
      connectedRoomSuggestionIds: [...wall.connectedRoomSuggestionIds].sort(),
    })),
    openings: approvedOpenings.map((opening) => ({
      id: opening.id,
      levelId: opening.levelId,
      wallSuggestionId: opening.wallSuggestionId,
      connectedRoomSuggestionIds: [...opening.connectedRoomSuggestionIds].sort(),
      zoneId: opening.zoneId,
      name: opening.name,
      kind: opening.kind,
      offsetRatio: rounded(opening.offsetRatio),
      widthMeters: rounded(opening.widthMeters),
      heightMeters: rounded(opening.heightMeters),
      sillHeightMeters: rounded(opening.sillHeightMeters),
      frame: opening.frame,
      glazing: opening.glazing,
      uValueWm2K: opening.uValueWm2K,
      catalogProfileId: opening.catalogProfileId,
      sourceReference: opening.sourceReference,
      solarGValue: opening.solarGValue,
      shading: opening.shading,
      thermalBridgeMode: opening.thermalBridgeMode,
      installationPsiWmK: opening.installationPsiWmK,
      installationPsiSourceReference: opening.installationPsiSourceReference,
    })),
  };
  return {
    fingerprint: stableHash(payload),
    wallSuggestionIds: approvedWalls.map((wall) => wall.id),
    openingSuggestionIds: approvedOpenings.map((opening) => opening.id),
    wallCount: approvedWalls.length,
    openingCount: approvedOpenings.length,
  };
}

export function buildSurveyPlanTransferModelSnapshot(input: {
  pageId: string;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  openingWorkspace: EnergyOpeningWorkspace;
}): SurveyPlanTransferModelSnapshot {
  const walls = input.wallSegments
    .filter((wall) => wall.planPageId === input.pageId && wall.dataSource === "planTransfer")
    .sort((left, right) => left.id.localeCompare(right.id));
  const openings = input.wallOpenings
    .filter((opening) => opening.planPageId === input.pageId && opening.dataSource === "planTransfer")
    .sort((left, right) => left.id.localeCompare(right.id));
  const openingIds = new Set(openings.map((opening) => opening.id));
  const bridges = input.openingWorkspace.thermalBridges
    .filter((bridge) => bridge.planPageId === input.pageId || Boolean(bridge.openingId && openingIds.has(bridge.openingId)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const payload = {
    pageId: input.pageId,
    walls: walls.map((wall) => ({
      id: wall.id,
      levelId: wall.levelId,
      roomId: wall.roomId,
      side: wall.side,
      startRatio: rounded(wall.startRatio),
      endRatio: rounded(wall.endRatio),
      boundaryType: wall.boundaryType,
      wallType: wall.wallType,
      thicknessCm: rounded(wall.thicknessCm),
      assemblyId: wall.assemblyId || "",
      adjacentRoomId: wall.adjacentRoomId || "",
      measuredLengthMeters: rounded(wall.measuredLengthMeters),
      heightMeters: rounded(wall.heightMeters),
      orientationDegrees: rounded(wall.orientationDegrees),
      zoneId: wall.zoneId || "",
      adjacentZoneId: wall.adjacentZoneId || "",
      planWallSuggestionId: wall.planWallSuggestionId || "",
      planStart: wall.planStart ? { x: rounded(wall.planStart.x), y: rounded(wall.planStart.y) } : null,
      planEnd: wall.planEnd ? { x: rounded(wall.planEnd.x), y: rounded(wall.planEnd.y) } : null,
      planTransferLocked: Boolean(wall.planTransferLocked),
    })),
    openings: openings.map((opening) => {
      const detail = input.openingWorkspace.openingDetails[opening.id];
      return {
        id: opening.id,
        levelId: opening.levelId,
        roomId: opening.roomId,
        wallSegmentId: opening.wallSegmentId,
        kind: opening.kind,
        name: opening.name,
        widthMeters: rounded(opening.widthMeters),
        heightMeters: rounded(opening.heightMeters),
        sillHeightMeters: rounded(opening.sillHeightMeters),
        offsetRatio: rounded(opening.offsetRatio),
        frame: opening.frame,
        glazing: opening.glazing,
        uValue: opening.uValue,
        shading: opening.shading,
        zoneId: opening.zoneId || "",
        catalogProfileId: opening.catalogProfileId || "",
        planOpeningSuggestionId: opening.planOpeningSuggestionId || "",
        planTransferLocked: Boolean(opening.planTransferLocked),
        detail: detail ? {
          calculationMode: detail.calculationMode,
          requirementType: detail.requirementType,
          declaredUwWm2K: rounded(detail.declaredUwWm2K),
          declaredSourceType: detail.declaredSourceType || "",
          declaredSourceReference: detail.declaredSourceReference || "",
          solarGValue: rounded(detail.solarGValue),
          installationPsiWmK: rounded(detail.installationPsiWmK),
          installationPsiSourceReference: detail.installationPsiSourceReference || "",
          catalogProfileId: detail.catalogProfileId || "",
          shading: detail.shading || "",
        } : null,
      };
    }),
    bridges: bridges.map((bridge) => ({
      id: bridge.id,
      kind: bridge.kind,
      category: bridge.category,
      name: bridge.name,
      levelId: bridge.levelId || "",
      zoneId: bridge.zoneId || "",
      roomId: bridge.roomId || "",
      wallSegmentId: bridge.wallSegmentId || "",
      openingId: bridge.openingId || "",
      lengthMeters: rounded(bridge.lengthMeters),
      quantity: rounded(bridge.quantity),
      psiWmK: rounded(bridge.psiWmK),
      chiWK: rounded(bridge.chiWK),
      sourceType: bridge.sourceType,
      sourceReference: bridge.sourceReference,
      planOpeningSuggestionId: bridge.planOpeningSuggestionId || "",
    })),
  };
  return {
    fingerprint: stableHash(payload),
    centralWallIds: walls.map((wall) => wall.id),
    centralOpeningIds: openings.map((opening) => opening.id),
    centralThermalBridgeIds: bridges.map((bridge) => bridge.id),
    wallCount: walls.length,
    openingCount: openings.length,
    thermalBridgeCount: bridges.length,
    lockedElementCount: walls.filter((wall) => wall.planTransferLocked).length + openings.filter((opening) => opening.planTransferLocked).length,
  };
}

export function resolveSurveyPlanTransferState(input: {
  record?: SurveyPlanTransferRecord | null;
  source: SurveyPlanTransferSourceSnapshot;
  model: SurveyPlanTransferModelSnapshot;
}): SurveyPlanTransferState {
  const record = input.record || null;
  if (!record) return "notTransferred";
  const sourceChanged = input.source.fingerprint !== record.sourceFingerprint;
  const modelChanged = input.model.fingerprint !== record.modelFingerprint;
  const hadCentralModel = record.centralWallIds.length > 0 || record.centralOpeningIds.length > 0 || record.centralThermalBridgeIds.length > 0;
  const hasCentralModel = input.model.wallCount > 0 || input.model.openingCount > 0 || input.model.thermalBridgeCount > 0;
  if (record.lastAction === "removed" && !hasCentralModel && !sourceChanged) return "removed";
  if (sourceChanged && modelChanged) return "conflict";
  if (!input.source.wallCount && hadCentralModel && hasCentralModel) return "sourceRemoved";
  if (hadCentralModel && !hasCentralModel) return "modelRemoved";
  if (sourceChanged) return "sourceChanged";
  if (modelChanged) return "modelChanged";
  return "synced";
}

export function buildSurveyPlanTransferPageStatus(input: {
  page: SurveyPlanPage;
  registry: SurveyPlanTransferRegistry;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  openingWorkspace: EnergyOpeningWorkspace;
}): SurveyPlanTransferPageStatus {
  const record = input.registry.records[input.page.id] || null;
  const source = buildSurveyPlanTransferSourceSnapshot(input.page);
  const model = buildSurveyPlanTransferModelSnapshot({
    pageId: input.page.id,
    wallSegments: input.wallSegments,
    wallOpenings: input.wallOpenings,
    openingWorkspace: input.openingWorkspace,
  });
  const state = resolveSurveyPlanTransferState({ record, source, model });
  const sourceChanged = Boolean(record && source.fingerprint !== record.sourceFingerprint);
  const modelChanged = Boolean(record && model.fingerprint !== record.modelFingerprint);
  return {
    pageId: input.page.id,
    documentId: input.page.documentId,
    state,
    record,
    source,
    model,
    sourceChanged,
    modelChanged,
    hasTransferredModel: model.wallCount > 0 || model.openingCount > 0 || model.thermalBridgeCount > 0,
    requiresConflictResolution: state === "modelChanged" || state === "conflict" || state === "modelRemoved",
  };
}

export function buildSurveyPlanTransferRegistrySummary(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  openingWorkspace: EnergyOpeningWorkspace;
}): SurveyPlanTransferRegistrySummary {
  const pages = input.workspace.documents.flatMap((document) => document.pages.map((page) => {
    const status = buildSurveyPlanTransferPageStatus({
      page,
      registry: input.workspace.transferRegistry,
      wallSegments: input.wallSegments,
      wallOpenings: input.wallOpenings,
      openingWorkspace: input.openingWorkspace,
    });
    return {
      ...status,
      fileName: document.fileName,
      pageNumber: page.pageNumber,
      pageLabel: page.pageLabel,
      levelId: page.levelId,
      lastTransferredAt: status.record?.lastTransferredAt || "",
    } satisfies SurveyPlanTransferRegistryPageSummary;
  }));
  const attentionStates = new Set<SurveyPlanTransferState>(["sourceChanged", "modelChanged", "conflict", "sourceRemoved", "modelRemoved"]);
  return {
    pages,
    totals: {
      pageCount: pages.length,
      transferredPageCount: pages.filter((page) => page.record && page.record.lastAction !== "removed").length,
      syncedCount: pages.filter((page) => page.state === "synced").length,
      sourceChangedCount: pages.filter((page) => page.state === "sourceChanged" || page.state === "sourceRemoved").length,
      modelChangedCount: pages.filter((page) => page.state === "modelChanged" || page.state === "modelRemoved").length,
      conflictCount: pages.filter((page) => page.state === "conflict").length,
      removedCount: pages.filter((page) => page.state === "removed").length,
      attentionCount: pages.filter((page) => attentionStates.has(page.state)).length,
    },
  };
}

export function createSurveyPlanTransferRecord(input: {
  page: SurveyPlanPage;
  previousRecord?: SurveyPlanTransferRecord | null;
  action: SurveyPlanTransferAction;
  transferId: string;
  transferredAt: string;
  source: SurveyPlanTransferSourceSnapshot;
  model: SurveyPlanTransferModelSnapshot;
  state?: SurveyPlanTransferState;
}): SurveyPlanTransferRecord {
  return {
    pageId: input.page.id,
    documentId: input.page.documentId,
    state: input.state || "synced",
    lastAction: input.action,
    lastTransferId: input.transferId || input.previousRecord?.lastTransferId || "",
    lastTransferredAt: input.action === "modelAccepted" ? input.previousRecord?.lastTransferredAt || input.transferredAt : input.transferredAt,
    sourceFingerprint: input.source.fingerprint,
    modelFingerprint: input.model.fingerprint,
    sourceWallSuggestionIds: [...input.source.wallSuggestionIds],
    sourceOpeningSuggestionIds: [...input.source.openingSuggestionIds],
    centralWallIds: [...input.model.centralWallIds],
    centralOpeningIds: [...input.model.centralOpeningIds],
    centralThermalBridgeIds: [...input.model.centralThermalBridgeIds],
    wallCount: input.model.wallCount,
    openingCount: input.model.openingCount,
    thermalBridgeCount: input.model.thermalBridgeCount,
    updatedAt: input.transferredAt,
  };
}

export function createSurveyPlanTransferAuditEntry(input: {
  page: SurveyPlanPage;
  action: SurveyPlanTransferAction;
  result: "success" | "blocked";
  stateBefore: SurveyPlanTransferState;
  stateAfter: SurveyPlanTransferState;
  transferId: string;
  source: SurveyPlanTransferSourceSnapshot;
  model: SurveyPlanTransferModelSnapshot;
  message: string;
  createdAt: string;
}): SurveyPlanTransferAuditEntry {
  return {
    id: `plan-transfer-audit-${input.createdAt.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`,
    pageId: input.page.id,
    documentId: input.page.documentId,
    action: input.action,
    result: input.result,
    stateBefore: input.stateBefore,
    stateAfter: input.stateAfter,
    transferId: input.transferId,
    wallCount: input.model.wallCount,
    openingCount: input.model.openingCount,
    thermalBridgeCount: input.model.thermalBridgeCount,
    sourceFingerprint: input.source.fingerprint,
    modelFingerprint: input.model.fingerprint,
    message: input.message,
    createdAt: input.createdAt,
  };
}

export function updateSurveyPlanTransferRegistry(input: {
  registry: SurveyPlanTransferRegistry;
  record: SurveyPlanTransferRecord;
  auditEntry: SurveyPlanTransferAuditEntry;
}): SurveyPlanTransferRegistry {
  return {
    ...input.registry,
    version: "1",
    records: { ...input.registry.records, [input.record.pageId]: input.record },
    auditLog: [...input.registry.auditLog, input.auditEntry].slice(-250),
    updatedAt: input.auditEntry.createdAt,
  };
}

export function acknowledgeSurveyPlanModelChanges(input: {
  page: SurveyPlanPage;
  registry: SurveyPlanTransferRegistry;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  openingWorkspace: EnergyOpeningWorkspace;
}) {
  const status = buildSurveyPlanTransferPageStatus(input);
  const acknowledgedAt = new Date().toISOString();
  const transferId = `plan-model-accepted-${acknowledgedAt.replace(/\D/g, "")}`;
  const record = createSurveyPlanTransferRecord({
    page: input.page,
    previousRecord: status.record,
    action: "modelAccepted",
    transferId,
    transferredAt: acknowledgedAt,
    source: status.source,
    model: status.model,
    state: "synced",
  });
  const auditEntry = createSurveyPlanTransferAuditEntry({
    page: input.page,
    action: "modelAccepted",
    result: "success",
    stateBefore: status.state,
    stateAfter: "synced",
    transferId,
    source: status.source,
    model: status.model,
    message: "A központi modell kézi módosításai lettek az új elfogadott összehasonlítási alapok; a tervlapi forrás nem írta felül őket.",
    createdAt: acknowledgedAt,
  });
  return { status, record, auditEntry, registry: updateSurveyPlanTransferRegistry({ registry: input.registry, record, auditEntry }) };
}

export const surveyPlanTransferStateLabels: Record<SurveyPlanTransferState, string> = {
  notTransferred: "Még nincs átadva",
  synced: "Szinkronban",
  sourceChanged: "A terv megváltozott",
  modelChanged: "A központi modell megváltozott",
  conflict: "Kétoldali konfliktus",
  sourceRemoved: "A tervből eltávolítva",
  modelRemoved: "A központi modellből hiányzik",
  removed: "Átadás eltávolítva",
};
