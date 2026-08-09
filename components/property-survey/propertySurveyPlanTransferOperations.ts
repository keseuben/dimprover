import type { EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import {
  applySurveyPlanEnergyTransfer,
  buildSurveyPlanEnergyTransferPreview,
  type SurveyPlanEnergyTransferIssue,
  type SurveyPlanEnergyTransferPreview,
  type SurveyPlanEnergyTransferResult,
} from "@/components/property-survey/propertySurveyPlanEnergyTransfer";
import type {
  SurveyPlanPage,
  SurveyPlanTransferAuditEntry,
  SurveyPlanTransferRecord,
  SurveyPlanTransferRegistry,
  SurveyPlanTransferState,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import {
  buildSurveyPlanTransferModelSnapshot,
  buildSurveyPlanTransferPageStatus,
  buildSurveyPlanTransferSourceSnapshot,
  createSurveyPlanTransferAuditEntry,
  createSurveyPlanTransferRecord,
  updateSurveyPlanTransferRegistry,
  type SurveyPlanTransferPageStatus,
} from "@/components/property-survey/propertySurveyPlanTransferRegistry";

export type SurveyPlanTransferConflictStrategy = "block" | "overwrite";

export type ManagedSurveyPlanTransferInput = {
  page: SurveyPlanPage;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  assemblies: SurveyConstructionAssembly[];
  zoneWorkspace: EnergyZoneWorkspace;
  openingWorkspace: EnergyOpeningWorkspace;
  transferRegistry: SurveyPlanTransferRegistry;
  conflictStrategy?: SurveyPlanTransferConflictStrategy;
};

export type ManagedSurveyPlanTransferPreview = SurveyPlanEnergyTransferPreview & {
  transferStatus: SurveyPlanTransferPageStatus;
  transferState: SurveyPlanTransferState;
  requiresConflictResolution: boolean;
  lockedElementCount: number;
};

export type ManagedSurveyPlanTransferResult = SurveyPlanEnergyTransferResult & {
  transferRegistry: SurveyPlanTransferRegistry;
  transferRecord: SurveyPlanTransferRecord | null;
  auditEntry: SurveyPlanTransferAuditEntry | null;
  transferStatusBefore: SurveyPlanTransferPageStatus;
  transferState: SurveyPlanTransferState;
};

export type SurveyPlanTransferRemovalPreview = {
  pageId: string;
  transferStatus: SurveyPlanTransferPageStatus;
  wallCount: number;
  openingCount: number;
  thermalBridgeCount: number;
  lockedElementCount: number;
  requiresForce: boolean;
  canRemove: boolean;
};

export type SurveyPlanTransferRemovalResult = SurveyPlanTransferRemovalPreview & {
  removed: boolean;
  blockedReason: string;
  removedAt: string;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  rooms: SurveyRoom[];
  openingWorkspace: EnergyOpeningWorkspace;
  transferRegistry: SurveyPlanTransferRegistry;
  transferRecord: SurveyPlanTransferRecord | null;
  auditEntry: SurveyPlanTransferAuditEntry | null;
  affectedRoomIds: string[];
};

function appendAudit(registry: SurveyPlanTransferRegistry, auditEntry: SurveyPlanTransferAuditEntry): SurveyPlanTransferRegistry {
  return {
    ...registry,
    auditLog: [...registry.auditLog, auditEntry].slice(-250),
    updatedAt: auditEntry.createdAt,
  };
}

function conflictIssue(state: SurveyPlanTransferState, pageId: string): SurveyPlanEnergyTransferIssue | null {
  if (state === "modelChanged") return {
    code: "PLAN_TRANSFER_MODEL_CHANGED",
    severity: "error",
    blocking: true,
    entityType: "page",
    entityId: pageId,
    message: "A központi energetikai modellben kézi módosítás történt az utolsó átadás óta. Előbb tartsd meg a központi módosítást, vagy erősítsd meg a tervvel történő felülírást.",
  };
  if (state === "conflict") return {
    code: "PLAN_TRANSFER_TWO_SIDED_CONFLICT",
    severity: "error",
    blocking: true,
    entityType: "page",
    entityId: pageId,
    message: "A tervlap és a központi energetikai modell is megváltozott az utolsó átadás óta. A rendszer nem írja felül automatikusan egyik oldalt sem.",
  };
  if (state === "modelRemoved") return {
    code: "PLAN_TRANSFER_MODEL_REMOVED",
    severity: "error",
    blocking: true,
    entityType: "page",
    entityId: pageId,
    message: "Az utolsó átadás központi elemei részben vagy teljesen hiányoznak. Csak külön felülírási megerősítéssel építhetők újra a tervből.",
  };
  return null;
}

export function buildManagedSurveyPlanTransferPreview(input: ManagedSurveyPlanTransferInput): ManagedSurveyPlanTransferPreview {
  const base = buildSurveyPlanEnergyTransferPreview(input);
  const transferStatus = buildSurveyPlanTransferPageStatus({
    page: input.page,
    registry: input.transferRegistry,
    wallSegments: input.wallSegments,
    wallOpenings: input.wallOpenings,
    openingWorkspace: input.openingWorkspace,
  });
  const issue = input.conflictStrategy === "overwrite" ? null : conflictIssue(transferStatus.state, input.page.id);
  const issues = issue && !base.issues.some((candidate) => candidate.code === issue.code) ? [...base.issues, issue] : base.issues;
  const blockingIssueCount = issues.filter((candidate) => candidate.blocking).length;
  return {
    ...base,
    issues,
    blockingIssueCount,
    warningCount: issues.filter((candidate) => candidate.severity === "warning").length,
    canTransfer: base.approvedWallCount > 0 && blockingIssueCount === 0,
    transferStatus,
    transferState: transferStatus.state,
    requiresConflictResolution: transferStatus.requiresConflictResolution,
    lockedElementCount: transferStatus.model.lockedElementCount,
  };
}

export function applyManagedSurveyPlanEnergyTransfer(input: ManagedSurveyPlanTransferInput): ManagedSurveyPlanTransferResult {
  const preview = buildManagedSurveyPlanTransferPreview(input);
  const attemptedAt = new Date().toISOString();
  const transferId = `plan-transfer-${attemptedAt.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  if (!preview.canTransfer) {
    const auditEntry = createSurveyPlanTransferAuditEntry({
      page: input.page,
      action: input.conflictStrategy === "overwrite" ? "forcedOverwrite" : preview.transferStatus.record ? "updated" : "created",
      result: "blocked",
      stateBefore: preview.transferState,
      stateAfter: preview.transferState,
      transferId,
      source: preview.transferStatus.source,
      model: preview.transferStatus.model,
      message: `${preview.blockingIssueCount} blokkoló hiba miatt az energetikai átadás nem indult el.`,
      createdAt: attemptedAt,
    });
    return {
      ...preview,
      transferredAt: attemptedAt,
      wallSegments: input.wallSegments,
      wallOpenings: input.wallOpenings,
      rooms: input.rooms,
      zoneWorkspace: input.zoneWorkspace,
      openingWorkspace: input.openingWorkspace,
      transferRegistry: appendAudit(input.transferRegistry, auditEntry),
      transferRecord: preview.transferStatus.record,
      auditEntry,
      transferStatusBefore: preview.transferStatus,
      transferState: preview.transferState,
    };
  }

  const baseResult = applySurveyPlanEnergyTransfer(input);
  const overwrite = input.conflictStrategy === "overwrite";
  const wallSegments = overwrite
    ? baseResult.wallSegments.map((wall) => wall.planPageId === input.page.id && wall.dataSource === "planTransfer" ? { ...wall, planTransferLocked: false } : wall)
    : baseResult.wallSegments;
  const wallOpenings = overwrite
    ? baseResult.wallOpenings.map((opening) => opening.planPageId === input.page.id && opening.dataSource === "planTransfer" ? { ...opening, planTransferLocked: false } : opening)
    : baseResult.wallOpenings;
  const source = buildSurveyPlanTransferSourceSnapshot(input.page);
  const model = buildSurveyPlanTransferModelSnapshot({ pageId: input.page.id, wallSegments, wallOpenings, openingWorkspace: baseResult.openingWorkspace });
  const action = overwrite ? "forcedOverwrite" : preview.transferStatus.record ? "updated" : "created";
  const transferRecord = createSurveyPlanTransferRecord({
    page: input.page,
    previousRecord: preview.transferStatus.record,
    action,
    transferId,
    transferredAt: baseResult.transferredAt,
    source,
    model,
    state: "synced",
  });
  const auditEntry = createSurveyPlanTransferAuditEntry({
    page: input.page,
    action,
    result: "success",
    stateBefore: preview.transferState,
    stateAfter: "synced",
    transferId,
    source,
    model,
    message: overwrite
      ? "A tervlapi jóváhagyott adatok megerősített felülírással frissítették a központi energetikai modellt."
      : `${baseResult.approvedWallCount} fal és ${baseResult.approvedOpeningCount} nyílászáró átadása sikeres.`,
    createdAt: baseResult.transferredAt,
  });
  return {
    ...baseResult,
    wallSegments,
    wallOpenings,
    transferRegistry: updateSurveyPlanTransferRegistry({ registry: input.transferRegistry, record: transferRecord, auditEntry }),
    transferRecord,
    auditEntry,
    transferStatusBefore: preview.transferStatus,
    transferState: "synced",
  };
}

export function buildSurveyPlanTransferRemovalPreview(input: Pick<ManagedSurveyPlanTransferInput, "page" | "wallSegments" | "wallOpenings" | "openingWorkspace" | "transferRegistry">): SurveyPlanTransferRemovalPreview {
  const transferStatus = buildSurveyPlanTransferPageStatus({
    page: input.page,
    registry: input.transferRegistry,
    wallSegments: input.wallSegments,
    wallOpenings: input.wallOpenings,
    openingWorkspace: input.openingWorkspace,
  });
  const requiresForce = transferStatus.modelChanged || transferStatus.model.lockedElementCount > 0 || transferStatus.state === "conflict" || transferStatus.state === "modelRemoved";
  return {
    pageId: input.page.id,
    transferStatus,
    wallCount: transferStatus.model.wallCount,
    openingCount: transferStatus.model.openingCount,
    thermalBridgeCount: transferStatus.model.thermalBridgeCount,
    lockedElementCount: transferStatus.model.lockedElementCount,
    requiresForce,
    canRemove: transferStatus.hasTransferredModel,
  };
}

export function removeSurveyPlanEnergyTransfer(input: ManagedSurveyPlanTransferInput & { confirmed: boolean; force?: boolean }): SurveyPlanTransferRemovalResult {
  const preview = buildSurveyPlanTransferRemovalPreview(input);
  const removedAt = new Date().toISOString();
  const transferId = `plan-transfer-remove-${removedAt.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
  const block = !preview.canRemove
    ? "Ehhez a tervlaphoz nincs eltávolítható központi átadás."
    : !input.confirmed
      ? "Az eltávolítást külön meg kell erősíteni."
      : preview.requiresForce && !input.force
        ? "A központi modell kézi módosítást vagy konfliktust tartalmaz; kényszerített eltávolítási megerősítés szükséges."
        : "";
  if (block) {
    const auditEntry = createSurveyPlanTransferAuditEntry({
      page: input.page,
      action: "removalBlocked",
      result: "blocked",
      stateBefore: preview.transferStatus.state,
      stateAfter: preview.transferStatus.state,
      transferId,
      source: preview.transferStatus.source,
      model: preview.transferStatus.model,
      message: block,
      createdAt: removedAt,
    });
    return {
      ...preview,
      removed: false,
      blockedReason: block,
      removedAt,
      wallSegments: input.wallSegments,
      wallOpenings: input.wallOpenings,
      rooms: input.rooms,
      openingWorkspace: input.openingWorkspace,
      transferRegistry: appendAudit(input.transferRegistry, auditEntry),
      transferRecord: preview.transferStatus.record,
      auditEntry,
      affectedRoomIds: [],
    };
  }

  const removedWallIds = new Set(input.wallSegments.filter((wall) => wall.planPageId === input.page.id && wall.dataSource === "planTransfer").map((wall) => wall.id));
  const removedOpenings = input.wallOpenings.filter((opening) => opening.planPageId === input.page.id && opening.dataSource === "planTransfer");
  const removedOpeningIds = new Set(removedOpenings.map((opening) => opening.id));
  const affectedRoomIds = [...new Set([
    ...input.wallSegments.filter((wall) => removedWallIds.has(wall.id)).map((wall) => wall.roomId),
    ...removedOpenings.map((opening) => opening.roomId),
  ])];
  const wallSegments = input.wallSegments.filter((wall) => !removedWallIds.has(wall.id));
  const wallOpenings = input.wallOpenings.filter((opening) => !removedOpeningIds.has(opening.id) && !removedWallIds.has(opening.wallSegmentId));
  const openingDetails = { ...input.openingWorkspace.openingDetails };
  for (const openingId of removedOpeningIds) delete openingDetails[openingId];
  const openingWorkspace: EnergyOpeningWorkspace = {
    ...input.openingWorkspace,
    openingDetails,
    thermalBridges: input.openingWorkspace.thermalBridges.filter((bridge) => bridge.planPageId !== input.page.id && (!bridge.openingId || !removedOpeningIds.has(bridge.openingId))),
    updatedAt: removedAt,
  };
  const rooms = input.rooms.map((room) => {
    const roomOpenings = wallOpenings.filter((opening) => opening.roomId === room.id);
    const windows = roomOpenings.filter((opening) => opening.kind === "window");
    return { ...room, windowCount: windows.length, windowType: windows[0]?.name || (windows.length ? room.windowType : "") };
  });
  const source = buildSurveyPlanTransferSourceSnapshot(input.page);
  const model = buildSurveyPlanTransferModelSnapshot({ pageId: input.page.id, wallSegments, wallOpenings, openingWorkspace });
  const transferRecord = createSurveyPlanTransferRecord({
    page: input.page,
    previousRecord: preview.transferStatus.record,
    action: "removed",
    transferId,
    transferredAt: removedAt,
    source,
    model,
    state: "removed",
  });
  const auditEntry = createSurveyPlanTransferAuditEntry({
    page: input.page,
    action: "removed",
    result: "success",
    stateBefore: preview.transferStatus.state,
    stateAfter: "removed",
    transferId,
    source,
    model,
    message: `${preview.wallCount} fal, ${preview.openingCount} nyílászáró és ${preview.thermalBridgeCount} hőhíd eltávolítva a központi modellből.`,
    createdAt: removedAt,
  });
  return {
    ...preview,
    removed: true,
    blockedReason: "",
    removedAt,
    wallSegments,
    wallOpenings,
    rooms,
    openingWorkspace,
    transferRegistry: updateSurveyPlanTransferRegistry({ registry: input.transferRegistry, record: transferRecord, auditEntry }),
    transferRecord,
    auditEntry,
    affectedRoomIds,
  };
}
