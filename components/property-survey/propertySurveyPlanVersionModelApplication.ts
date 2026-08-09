import type { EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import {
  appendSurveyPlanVersionApplication,
  appendSurveyPlanVersionAuditOnly,
  createSurveyPlanVersionModelSnapshot,
  markSurveyPlanVersionApplicationRolledBack,
  resolveSurveyPlanVersionApplication,
  resolveSurveyPlanVersionSnapshot,
  upsertSurveyPlanVersionModelSnapshot,
} from "@/components/property-survey/propertySurveyPlanVersionHistory";
import { applySurveyPlanEnergyTransfer, buildSurveyPlanEnergyTransferPreview } from "@/components/property-survey/propertySurveyPlanEnergyTransfer";
import {
  buildSurveyPlanTransferModelSnapshot,
  buildSurveyPlanTransferSourceSnapshot,
  createSurveyPlanTransferAuditEntry,
  createSurveyPlanTransferRecord,
  updateSurveyPlanTransferRegistry,
} from "@/components/property-survey/propertySurveyPlanTransferRegistry";
import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyPlanElementDiff,
  SurveyPlanPage,
  SurveyPlanPagePair,
  SurveyPlanTransferRegistry,
  SurveyPlanVersionModelApplicationAuditEntry,
  SurveyPlanVersionModelApplicationCounts,
  SurveyPlanVersionModelApplicationIssue,
  SurveyPlanVersionModelApplicationRecord,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyPlanVersionModelApplicationInput = {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  assemblies: SurveyConstructionAssembly[];
  zoneWorkspace: EnergyZoneWorkspace;
  openingWorkspace: EnergyOpeningWorkspace;
};

export type SurveyPlanVersionModelApplicationPreview = {
  comparisonId: string;
  applicationId: string;
  counts: SurveyPlanVersionModelApplicationCounts;
  issues: SurveyPlanVersionModelApplicationIssue[];
  blockingIssueCount: number;
  warningCount: number;
  canApply: boolean;
  requiresConfirmation: boolean;
  previousApplication: SurveyPlanVersionModelApplicationRecord | null;
};

export type SurveyPlanVersionModelApplicationResult = SurveyPlanVersionModelApplicationPreview & {
  applied: boolean;
  rolledBack: boolean;
  message: string;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  zoneWorkspace: EnergyZoneWorkspace;
  openingWorkspace: EnergyOpeningWorkspace;
  workspace: PropertySurveyPlanDocumentWorkspace;
  applicationRecord: SurveyPlanVersionModelApplicationRecord | null;
  auditEntry: SurveyPlanVersionModelApplicationAuditEntry | null;
};

function emptyCounts(): SurveyPlanVersionModelApplicationCounts {
  return {
    roomCreateCount: 0,
    roomUpdateCount: 0,
    roomDeleteCount: 0,
    wallCreateCount: 0,
    wallUpdateCount: 0,
    wallDeleteCount: 0,
    openingCreateCount: 0,
    openingUpdateCount: 0,
    openingDeleteCount: 0,
    thermalBridgeCreateCount: 0,
    thermalBridgeDeleteCount: 0,
    preservedCentralIdCount: 0,
  };
}

function addIssue(issues: SurveyPlanVersionModelApplicationIssue[], issue: SurveyPlanVersionModelApplicationIssue) {
  if (!issues.some((candidate) => candidate.code === issue.code && candidate.entityId === issue.entityId)) issues.push(issue);
}

function actionable(diff: SurveyPlanElementDiff) {
  return diff.changeType === "unchanged" || diff.decision === "accepted";
}

function allDiffs(input: SurveyPlanVersionModelApplicationInput) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  return comparison?.pagePairs.flatMap((pair) => pair.elementDiffs) || [];
}

function roomBounds(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs, 0) * 900,
    y: Math.min(...ys, 0) * 610,
    width: Math.max(1, (Math.max(...xs, 0) - Math.min(...xs, 0)) * 900),
    depth: Math.max(1, (Math.max(...ys, 0) - Math.min(...ys, 0)) * 610),
  };
}

function updateRoomFromSuggestion(room: SurveyRoom, page: SurveyPlanPage, suggestion: SurveyPlanPage["suggestions"][number]): SurveyRoom {
  const bounds = roomBounds(suggestion.polygon);
  return {
    ...room,
    levelId: page.levelId,
    name: suggestion.name,
    function: suggestion.function,
    area: suggestion.calculatedAreaSquareMeters || suggestion.labeledAreaSquareMeters || room.area,
    height: suggestion.roomHeightMeters,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    depth: bounds.depth,
    polygon: suggestion.polygon.map((point) => ({ x: point.x * 900, y: point.y * 610 })),
    heated: suggestion.heated,
    note: suggestion.sourceDetails,
    planDataSource: suggestion.userModified ? "userCorrected" : suggestion.source,
    planRecognitionStatus: "approved",
    planConfidence: suggestion.confidence,
    planDocumentId: page.documentId,
    planPageId: page.id,
    planSuggestionId: suggestion.id,
  };
}

function createRoomFromSuggestion(page: SurveyPlanPage, suggestion: SurveyPlanPage["suggestions"][number]): SurveyRoom {
  return updateRoomFromSuggestion({
    id: `plan-room-${page.id}-${suggestion.id}`,
    levelId: page.levelId,
    name: suggestion.name,
    function: suggestion.function,
    area: suggestion.calculatedAreaSquareMeters || suggestion.labeledAreaSquareMeters || 0,
    height: suggestion.roomHeightMeters,
    x: 0,
    y: 0,
    width: 1,
    depth: 1,
    heated: suggestion.heated,
    externalWallType: "Tervdokumentáció alapján ellenőrzendő",
    floorType: "Tervdokumentáció alapján ellenőrzendő",
    ceilingType: "Tervdokumentáció alapján ellenőrzendő",
    windowCount: 0,
    windowType: "",
    orientation: "Terv alapján ellenőrzendő",
    note: "",
  }, page, suggestion);
}

function targetPageForPair(input: SurveyPlanVersionModelApplicationInput, pair: SurveyPlanPagePair) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  const targetDocument = input.workspace.documents.find((document) => document.id === comparison?.targetDocumentId);
  return targetDocument?.pages.find((page) => page.id === pair.targetPageId) || null;
}

function basePageForPair(input: SurveyPlanVersionModelApplicationInput, pair: SurveyPlanPagePair) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  const baseDocument = input.workspace.documents.find((document) => document.id === comparison?.baseDocumentId);
  return baseDocument?.pages.find((page) => page.id === pair.basePageId) || null;
}

function centralWallFor(input: SurveyPlanVersionModelApplicationInput, pageId: string, suggestionId: string) {
  return input.wallSegments.find((wall) => wall.dataSource === "planTransfer" && wall.planPageId === pageId && wall.planWallSuggestionId === suggestionId) || null;
}

function centralOpeningFor(input: SurveyPlanVersionModelApplicationInput, pageId: string, suggestionId: string) {
  return input.wallOpenings.find((opening) => opening.dataSource === "planTransfer" && opening.planPageId === pageId && opening.planOpeningSuggestionId === suggestionId) || null;
}

function targetEligibility(pair: SurveyPlanPagePair, targetPage: SurveyPlanPage | null) {
  const roomIds = new Set(pair.elementDiffs.filter((diff) => diff.kind === "room" && diff.targetElementId && actionable(diff)).map((diff) => diff.targetElementId));
  const rawWallIds = new Set(pair.elementDiffs.filter((diff) => diff.kind === "wall" && diff.targetElementId && actionable(diff)).map((diff) => diff.targetElementId));
  const wallIds = new Set((targetPage?.wallSuggestions || []).filter((wall) => rawWallIds.has(wall.id) && (!wall.connectedRoomSuggestionIds.length || wall.connectedRoomSuggestionIds.some((id) => roomIds.has(id)))).map((wall) => wall.id));
  const rawOpeningIds = new Set(pair.elementDiffs.filter((diff) => diff.kind === "opening" && diff.targetElementId && actionable(diff)).map((diff) => diff.targetElementId));
  const openingIds = new Set((targetPage?.openingSuggestions || []).filter((opening) => rawOpeningIds.has(opening.id) && wallIds.has(opening.wallSuggestionId)).map((opening) => opening.id));
  return { roomIds, wallIds, openingIds };
}

export function buildSurveyPlanVersionModelApplicationPreview(input: SurveyPlanVersionModelApplicationInput): SurveyPlanVersionModelApplicationPreview {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  const counts = emptyCounts();
  const issues: SurveyPlanVersionModelApplicationIssue[] = [];
  const comparisonStamp = comparison?.updatedAt.replace(/\D/g, "") || "draft";
  const applicationId = `plan-model-application-${input.comparisonId}-${comparisonStamp}`;
  const previousApplication = input.workspace.versionComparison.modelApplications[input.comparisonId] || null;
  const alreadyAppliedSameComparison = previousApplication?.status === "applied" && previousApplication.sourceComparisonUpdatedAt === comparison?.updatedAt;
  if (!comparison) addIssue(issues, { code: "VERSION_MODEL_COMPARISON_MISSING", severity: "error", blocking: true, entityType: "comparison", entityId: input.comparisonId, message: "A tervverzió-összehasonlítás nem található." });
  if (comparison && comparison.status !== "applied") addIssue(issues, { code: "VERSION_MODEL_DECISIONS_NOT_APPLIED", severity: "error", blocking: true, entityType: "comparison", entityId: comparison.id, message: "Előbb alkalmazni kell a tervverzió elemenkénti döntéseit." });
  const pending = allDiffs(input).filter((diff) => diff.changeType !== "unchanged" && diff.decision === "pending");
  if (pending.length) addIssue(issues, { code: "VERSION_MODEL_PENDING_DECISIONS", severity: "error", blocking: true, entityType: "comparison", entityId: input.comparisonId, message: `${pending.length} tervváltozás még függőben van.` });
  if (previousApplication?.status === "applied" && previousApplication.sourceComparisonUpdatedAt === comparison?.updatedAt) addIssue(issues, { code: "VERSION_MODEL_ALREADY_APPLIED", severity: "warning", blocking: false, entityType: "comparison", entityId: input.comparisonId, message: "Ez a tervverzió-állapot már át lett vezetve a központi modellbe; az ismételt alkalmazás idempotens ellenőrzést végez." });

  for (const pair of comparison?.pagePairs || []) {
    const basePage = basePageForPair(input, pair);
    const targetPage = targetPageForPair(input, pair);
    for (const diff of pair.elementDiffs) {
      if (!actionable(diff)) continue;
      if (diff.kind === "room") {
        const baseExisting = diff.baseElementId && basePage ? input.rooms.find((room) => room.planPageId === basePage.id && room.planSuggestionId === diff.baseElementId) : null;
        const targetExisting = diff.targetElementId && targetPage ? input.rooms.find((room) => room.planPageId === targetPage.id && room.planSuggestionId === diff.targetElementId) : null;
        const existing = baseExisting || targetExisting;
        if (diff.changeType === "added") { if (existing) counts.roomUpdateCount += 1; else counts.roomCreateCount += 1; }
        else if (diff.changeType === "removed") counts.roomDeleteCount += existing ? 1 : 0;
        else counts.roomUpdateCount += existing ? 1 : 0;
      }
      if (diff.kind === "wall") {
        const baseExisting = diff.baseElementId && basePage ? centralWallFor(input, basePage.id, diff.baseElementId) : null;
        const targetExisting = diff.targetElementId && targetPage ? centralWallFor(input, targetPage.id, diff.targetElementId) : null;
        const existing = baseExisting || targetExisting;
        if ((diff.changeType === "modified" || diff.changeType === "removed" || diff.changeType === "unchanged") && !existing && !(alreadyAppliedSameComparison && diff.changeType === "removed")) addIssue(issues, { code: "VERSION_MODEL_BASE_WALL_MISSING", severity: "error", blocking: true, entityType: "wall", entityId: diff.baseElementId, message: "A korábbi tervfal központi modellkapcsolata hiányzik; az átvezetés nem lehet biztonságos." });
        if (existing?.planTransferLocked) addIssue(issues, { code: "VERSION_MODEL_WALL_LOCKED", severity: "error", blocking: true, entityType: "wall", entityId: existing.id, message: "A központi fal kézzel módosított és zárolt; előbb külön konfliktusfeloldás szükséges." });
        if (diff.changeType === "added") { if (existing) { counts.wallUpdateCount += 1; counts.preservedCentralIdCount += 1; } else counts.wallCreateCount += 1; }
        else if (diff.changeType === "removed") counts.wallDeleteCount += existing ? 1 : 0;
        else { counts.wallUpdateCount += 1; if (existing) counts.preservedCentralIdCount += 1; }
      }
      if (diff.kind === "opening") {
        const baseExisting = diff.baseElementId && basePage ? centralOpeningFor(input, basePage.id, diff.baseElementId) : null;
        const targetExisting = diff.targetElementId && targetPage ? centralOpeningFor(input, targetPage.id, diff.targetElementId) : null;
        const existing = baseExisting || targetExisting;
        if ((diff.changeType === "modified" || diff.changeType === "removed" || diff.changeType === "unchanged") && !existing && !(alreadyAppliedSameComparison && diff.changeType === "removed")) addIssue(issues, { code: "VERSION_MODEL_BASE_OPENING_MISSING", severity: "error", blocking: true, entityType: "opening", entityId: diff.baseElementId, message: "A korábbi nyílászáró központi modellkapcsolata hiányzik." });
        if (existing?.planTransferLocked) addIssue(issues, { code: "VERSION_MODEL_OPENING_LOCKED", severity: "error", blocking: true, entityType: "opening", entityId: existing.id, message: "A központi nyílászáró kézzel módosított és zárolt." });
        if (diff.changeType === "added") { if (existing) { counts.openingUpdateCount += 1; counts.preservedCentralIdCount += 1; } else counts.openingCreateCount += 1; }
        else if (diff.changeType === "removed") counts.openingDeleteCount += existing ? 1 : 0;
        else { counts.openingUpdateCount += 1; if (existing) counts.preservedCentralIdCount += 1; }
      }
    }
    if (targetPage) {
      const eligibility = targetEligibility(pair, targetPage);
      const synthetic: SurveyPlanPage = { ...targetPage, wallSuggestions: targetPage.wallSuggestions.map((wall) => ({ ...wall, status: eligibility.wallIds.has(wall.id) ? "approved" : "ignored" })), openingSuggestions: targetPage.openingSuggestions.map((opening) => ({ ...opening, status: eligibility.openingIds.has(opening.id) ? "approved" : "ignored" })) };
      const roomIds = eligibility.roomIds;
      const projectedRooms = [...input.rooms];
      for (const suggestion of targetPage.suggestions.filter((item) => roomIds.has(item.id))) if (!projectedRooms.some((room) => room.planSuggestionId === suggestion.id)) projectedRooms.push(createRoomFromSuggestion(targetPage, suggestion));
      for (const diff of pair.elementDiffs.filter((candidate) => candidate.kind === "wall" && candidate.targetElementId && actionable(candidate))) if (!eligibility.wallIds.has(diff.targetElementId)) addIssue(issues, { code: "VERSION_MODEL_WALL_DEPENDENCY_RETAINED", severity: "warning", blocking: false, entityType: "wall", entityId: diff.targetElementId, message: "A fal célhelyisége nem kerül átvezetésre, ezért a korábbi központi fal marad meg." });
      for (const diff of pair.elementDiffs.filter((candidate) => candidate.kind === "opening" && candidate.targetElementId && actionable(candidate))) if (!eligibility.openingIds.has(diff.targetElementId)) addIssue(issues, { code: "VERSION_MODEL_OPENING_DEPENDENCY_RETAINED", severity: "warning", blocking: false, entityType: "opening", entityId: diff.targetElementId, message: "A nyílászáró célfala nem kerül átvezetésre, ezért a korábbi központi nyílászáró marad meg." });
      const transferPreview = buildSurveyPlanEnergyTransferPreview({ page: synthetic, rooms: projectedRooms, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings, assemblies: input.assemblies, zoneWorkspace: input.zoneWorkspace, openingWorkspace: input.openingWorkspace });
      transferPreview.issues.filter((issue) => eligibility.wallIds.size || issue.code !== "PLAN_TRANSFER_NO_APPROVED_WALL").forEach((issue) => addIssue(issues, { ...issue, entityType: issue.entityType, severity: issue.severity, blocking: issue.blocking }));
      for (const opening of synthetic.openingSuggestions.filter((candidate) => candidate.status === "approved" && candidate.thermalBridgeMode === "separateEdges")) {
        const existingBridgeCount = input.openingWorkspace.thermalBridges.filter((bridge) => bridge.planPageId === targetPage.id && bridge.planOpeningSuggestionId === opening.id).length;
        counts.thermalBridgeCreateCount += Math.max(0, 3 - existingBridgeCount);
      }
    }
  }
  const actionableBaseOpeningIds = new Set((comparison?.pagePairs || []).flatMap((pair) => pair.elementDiffs.filter((diff) => diff.kind === "opening" && diff.baseElementId && actionable(diff)).map((diff) => diff.baseElementId)));
  counts.thermalBridgeDeleteCount = input.openingWorkspace.thermalBridges.filter((bridge) => bridge.planOpeningSuggestionId && actionableBaseOpeningIds.has(bridge.planOpeningSuggestionId)).length;
  const blockingIssueCount = issues.filter((issue) => issue.blocking).length;
  return { comparisonId: input.comparisonId, applicationId, counts, issues, blockingIssueCount, warningCount: issues.filter((issue) => issue.severity === "warning").length, canApply: Boolean(comparison) && blockingIssueCount === 0, requiresConfirmation: counts.roomDeleteCount + counts.wallDeleteCount + counts.openingDeleteCount > 0, previousApplication };
}

export function applySurveyPlanVersionModelApplication(input: SurveyPlanVersionModelApplicationInput & { confirmed: boolean }): SurveyPlanVersionModelApplicationResult {
  const preview = buildSurveyPlanVersionModelApplicationPreview(input);
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  const now = new Date().toISOString();
  const blocked = !preview.canApply || (preview.requiresConfirmation && !input.confirmed);
  if (blocked) {
    const message = !preview.canApply ? `${preview.blockingIssueCount} blokkoló hiba miatt az átvezetés nem indult el.` : "A törléseket tartalmazó átvezetést külön meg kell erősíteni.";
    const sequenceNumber = Math.max(1, ...input.workspace.versionComparison.modelApplicationHistory.map((record) => record.sequenceNumber + 1));
    const blockedRecord: SurveyPlanVersionModelApplicationRecord = { id: preview.applicationId, comparisonId: input.comparisonId, baseDocumentId: comparison?.baseDocumentId || "", targetDocumentId: comparison?.targetDocumentId || "", status: "blocked", sequenceNumber, parentApplicationId: preview.previousApplication?.id || "", counts: preview.counts, issues: preview.issues, appliedAt: "", rolledBackAt: "", sourceComparisonUpdatedAt: comparison?.updatedAt || "", rollbackSnapshotId: "", rollbackSnapshotBytes: 0, rollbackSnapshot: null, updatedAt: now };
    const record = preview.previousApplication?.status === "applied" ? preview.previousApplication : blockedRecord;
    const auditEntry: SurveyPlanVersionModelApplicationAuditEntry = { id: `plan-model-application-audit-${now.replace(/\D/g, "")}`, comparisonId: input.comparisonId, applicationId: record.id, action: "blocked", result: "blocked", counts: preview.counts, message, createdAt: now };
    return { ...preview, applied: false, rolledBack: false, message, rooms: input.rooms, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings, zoneWorkspace: input.zoneWorkspace, openingWorkspace: input.openingWorkspace, workspace: appendSurveyPlanVersionAuditOnly({ workspace: input.workspace, auditEntry }), applicationRecord: record, auditEntry };
  }

  let rooms = input.rooms.map((room) => ({ ...room }));
  let wallSegments = input.wallSegments.map((wall) => ({ ...wall }));
  let wallOpenings = input.wallOpenings.map((opening) => ({ ...opening }));
  let zoneWorkspace = structuredClone(input.zoneWorkspace);
  let openingWorkspace = structuredClone(input.openingWorkspace);
  let transferRegistry: SurveyPlanTransferRegistry = structuredClone(input.workspace.transferRegistry);
  const rollbackSnapshot = createSurveyPlanVersionModelSnapshot({ rooms: input.rooms, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings, zoneWorkspace: input.zoneWorkspace, openingWorkspace: input.openingWorkspace, transferRegistry: input.workspace.transferRegistry });
  const snapshotUpsert = upsertSurveyPlanVersionModelSnapshot({ store: input.workspace.versionComparison.modelSnapshotStore, payload: rollbackSnapshot, now });

  for (const pair of comparison.pagePairs) {
    const basePage = basePageForPair(input, pair);
    const targetPage = targetPageForPair(input, pair);
    const roomDiffs = pair.elementDiffs.filter((diff) => diff.kind === "room");
    for (const diff of roomDiffs) {
      if (!actionable(diff)) continue;
      const baseExistingIndex = diff.baseElementId && basePage ? rooms.findIndex((room) => room.planPageId === basePage.id && room.planSuggestionId === diff.baseElementId) : -1;
      const targetExistingIndex = diff.targetElementId && targetPage ? rooms.findIndex((room) => room.planPageId === targetPage.id && room.planSuggestionId === diff.targetElementId) : -1;
      const existingIndex = baseExistingIndex >= 0 ? baseExistingIndex : targetExistingIndex;
      if (diff.changeType === "removed") { if (existingIndex >= 0) rooms.splice(existingIndex, 1); continue; }
      const target = targetPage?.suggestions.find((suggestion) => suggestion.id === diff.targetElementId);
      if (!target || !targetPage) continue;
      if (existingIndex >= 0) rooms[existingIndex] = updateRoomFromSuggestion(rooms[existingIndex], targetPage, target);
      else rooms.push(createRoomFromSuggestion(targetPage, target));
    }

    const oldWallByTarget = new Map<string, SurveyWallSegment>();
    const oldOpeningByTarget = new Map<string, SurveyWallOpening>();
    for (const diff of pair.elementDiffs) {
      if (!actionable(diff) || !basePage) continue;
      if (diff.kind === "wall" && diff.baseElementId && diff.targetElementId) { const central = wallSegments.find((wall) => wall.planPageId === basePage.id && wall.planWallSuggestionId === diff.baseElementId); if (central) oldWallByTarget.set(diff.targetElementId, central); }
      if (diff.kind === "opening" && diff.baseElementId && diff.targetElementId) { const central = wallOpenings.find((opening) => opening.planPageId === basePage.id && opening.planOpeningSuggestionId === diff.baseElementId); if (central) oldOpeningByTarget.set(diff.targetElementId, central); }
    }

    const actionableBaseWallSources = new Set(pair.elementDiffs.filter((diff) => diff.kind === "wall" && diff.baseElementId && actionable(diff)).map((diff) => diff.baseElementId));
    const actionableBaseOpeningSources = new Set(pair.elementDiffs.filter((diff) => diff.kind === "opening" && diff.baseElementId && actionable(diff)).map((diff) => diff.baseElementId));
    const replacedOldWallIds = new Set(basePage ? wallSegments.filter((wall) => wall.planPageId === basePage.id && wall.planWallSuggestionId && actionableBaseWallSources.has(wall.planWallSuggestionId)).map((wall) => wall.id) : []);
    const replacedOldOpeningIds = new Set(basePage ? wallOpenings.filter((opening) => opening.planPageId === basePage.id && opening.planOpeningSuggestionId && actionableBaseOpeningSources.has(opening.planOpeningSuggestionId)).map((opening) => opening.id) : []);
    wallSegments = wallSegments.filter((wall) => !replacedOldWallIds.has(wall.id));
    wallOpenings = wallOpenings.filter((opening) => !replacedOldOpeningIds.has(opening.id));
    const preTransferDetails = { ...openingWorkspace.openingDetails };
    for (const openingId of replacedOldOpeningIds) delete preTransferDetails[openingId];
    openingWorkspace = { ...openingWorkspace, openingDetails: preTransferDetails, thermalBridges: openingWorkspace.thermalBridges.filter((bridge) => !(bridge.planPageId === basePage?.id && bridge.planOpeningSuggestionId && actionableBaseOpeningSources.has(bridge.planOpeningSuggestionId)) && (!bridge.openingId || !replacedOldOpeningIds.has(bridge.openingId))) };

    if (targetPage) {
      const eligibility = targetEligibility(pair, targetPage);
      const synthetic: SurveyPlanPage = { ...targetPage, wallSuggestions: targetPage.wallSuggestions.map((wall) => ({ ...wall, status: eligibility.wallIds.has(wall.id) ? "approved" : "ignored" })), openingSuggestions: targetPage.openingSuggestions.map((opening) => ({ ...opening, status: eligibility.openingIds.has(opening.id) ? "approved" : "ignored" })) };
      if (eligibility.wallIds.size) {
        const result = applySurveyPlanEnergyTransfer({ page: synthetic, rooms, wallSegments, wallOpenings, assemblies: input.assemblies, zoneWorkspace, openingWorkspace });
        wallSegments = result.wallSegments;
        wallOpenings = result.wallOpenings;
        rooms = result.rooms;
        zoneWorkspace = result.zoneWorkspace;
        openingWorkspace = result.openingWorkspace;
      }
      const wallIdRemap = new Map<string, string>();
      for (const [targetId, oldWall] of oldWallByTarget) {
        const generated = wallSegments.find((wall) => wall.planPageId === targetPage.id && wall.planWallSuggestionId === targetId);
        if (generated) { wallIdRemap.set(generated.id, oldWall.id); wallSegments = wallSegments.map((wall) => wall.id === generated.id ? { ...wall, id: oldWall.id, createdAt: oldWall.createdAt } : wall); }
      }
      const openingIdRemap = new Map<string, string>();
      for (const [targetId, oldOpening] of oldOpeningByTarget) {
        const generated = wallOpenings.find((opening) => opening.planPageId === targetPage.id && opening.planOpeningSuggestionId === targetId);
        if (generated) { openingIdRemap.set(generated.id, oldOpening.id); wallOpenings = wallOpenings.map((opening) => opening.id === generated.id ? { ...opening, id: oldOpening.id, createdAt: oldOpening.createdAt } : opening); }
      }
      wallOpenings = wallOpenings.map((opening) => ({ ...opening, wallSegmentId: wallIdRemap.get(opening.wallSegmentId) || opening.wallSegmentId }));
      const remappedDetails = { ...openingWorkspace.openingDetails };
      for (const [fromId, toId] of openingIdRemap) { if (remappedDetails[fromId]) { remappedDetails[toId] = { ...remappedDetails[fromId], openingId: toId, createdAt: input.openingWorkspace.openingDetails[toId]?.createdAt || remappedDetails[fromId].createdAt }; delete remappedDetails[fromId]; } }
      openingWorkspace = { ...openingWorkspace, openingDetails: remappedDetails, thermalBridges: openingWorkspace.thermalBridges.map((bridge) => ({ ...bridge, openingId: bridge.openingId ? openingIdRemap.get(bridge.openingId) || bridge.openingId : bridge.openingId, wallSegmentId: bridge.wallSegmentId ? wallIdRemap.get(bridge.wallSegmentId) || bridge.wallSegmentId : bridge.wallSegmentId })) };
    }

    if (basePage) {
      const removeWallSources = new Set(pair.elementDiffs.filter((diff) => diff.kind === "wall" && diff.baseElementId && actionable(diff)).map((diff) => diff.baseElementId));
      const removeOpeningSources = new Set(pair.elementDiffs.filter((diff) => diff.kind === "opening" && diff.baseElementId && actionable(diff)).map((diff) => diff.baseElementId));
      const keepWallIds = new Set(wallSegments.filter((wall) => targetPage && wall.planPageId === targetPage.id).map((wall) => wall.id));
      const keepOpeningIds = new Set(wallOpenings.filter((opening) => targetPage && opening.planPageId === targetPage.id).map((opening) => opening.id));
      const removedWallIds = new Set(wallSegments.filter((wall) => wall.planPageId === basePage.id && wall.planWallSuggestionId && removeWallSources.has(wall.planWallSuggestionId) && !keepWallIds.has(wall.id)).map((wall) => wall.id));
      const removedOpeningIds = new Set(wallOpenings.filter((opening) => opening.planPageId === basePage.id && opening.planOpeningSuggestionId && removeOpeningSources.has(opening.planOpeningSuggestionId) && !keepOpeningIds.has(opening.id)).map((opening) => opening.id));
      wallSegments = wallSegments.filter((wall) => !removedWallIds.has(wall.id));
      wallOpenings = wallOpenings.filter((opening) => !removedOpeningIds.has(opening.id) && !removedWallIds.has(opening.wallSegmentId));
      const details = { ...openingWorkspace.openingDetails }; for (const id of removedOpeningIds) delete details[id];
      openingWorkspace = { ...openingWorkspace, openingDetails: details, thermalBridges: openingWorkspace.thermalBridges.filter((bridge) => !(bridge.planPageId === basePage.id && bridge.planOpeningSuggestionId && removeOpeningSources.has(bridge.planOpeningSuggestionId)) && (!bridge.openingId || !removedOpeningIds.has(bridge.openingId))) };
      delete transferRegistry.records[basePage.id];
    }
  }

  for (const pair of comparison.pagePairs) {
    const targetPage = targetPageForPair(input, pair);
    if (!targetPage) continue;
    const model = buildSurveyPlanTransferModelSnapshot({ pageId: targetPage.id, wallSegments, wallOpenings, openingWorkspace });
    if (!model.wallCount && !model.openingCount) continue;
    const source = buildSurveyPlanTransferSourceSnapshot(targetPage);
    const transferId = `plan-version-model-${now.replace(/\D/g, "")}-${targetPage.id}`;
    const record = createSurveyPlanTransferRecord({ page: targetPage, previousRecord: transferRegistry.records[targetPage.id], action: transferRegistry.records[targetPage.id] ? "updated" : "created", transferId, transferredAt: now, source, model, state: "synced" });
    const audit = createSurveyPlanTransferAuditEntry({ page: targetPage, action: transferRegistry.records[targetPage.id] ? "updated" : "created", result: "success", stateBefore: transferRegistry.records[targetPage.id]?.state || "notTransferred", stateAfter: "synced", transferId, source, model, message: "Tervverzió-változásokból ellenőrzötten frissített központi modell.", createdAt: now });
    transferRegistry = updateSurveyPlanTransferRegistry({ registry: transferRegistry, record, auditEntry: audit });
  }

  const previousApplication = preview.previousApplication;
  const sameApplication = Boolean(previousApplication?.status === "applied" && previousApplication.sourceComparisonUpdatedAt === comparison.updatedAt && previousApplication.id === preview.applicationId);
  const sequenceNumber = sameApplication ? previousApplication!.sequenceNumber : Math.max(1, ...input.workspace.versionComparison.modelApplicationHistory.map((candidate) => candidate.sequenceNumber + 1));
  const rollbackSnapshotId = sameApplication && previousApplication!.rollbackSnapshotId ? previousApplication!.rollbackSnapshotId : snapshotUpsert.snapshotId;
  const rollbackSnapshotBytes = sameApplication && previousApplication!.rollbackSnapshotBytes ? previousApplication!.rollbackSnapshotBytes : snapshotUpsert.estimatedBytes;
  const record: SurveyPlanVersionModelApplicationRecord = { id: preview.applicationId, comparisonId: input.comparisonId, baseDocumentId: comparison.baseDocumentId, targetDocumentId: comparison.targetDocumentId, status: "applied", sequenceNumber, parentApplicationId: sameApplication ? previousApplication!.parentApplicationId : previousApplication?.id || "", counts: preview.counts, issues: preview.issues, appliedAt: sameApplication ? previousApplication!.appliedAt : now, rolledBackAt: "", sourceComparisonUpdatedAt: comparison.updatedAt, rollbackSnapshotId, rollbackSnapshotBytes, rollbackSnapshot: null, updatedAt: now };
  const auditEntry: SurveyPlanVersionModelApplicationAuditEntry = { id: `plan-model-application-audit-${now.replace(/\D/g, "")}`, comparisonId: input.comparisonId, applicationId: record.id, action: "apply", result: "success", counts: preview.counts, message: sameApplication ? "A tervverzió-átvezetés idempotens ellenőrzése sikeres; új duplikált pillanatkép nem készült." : `Az elfogadott tervverzió-változások átvezetése sikeres; ${snapshotUpsert.reused ? "meglévő deduplikált" : "új"} visszaállítási pillanatkép készült.`, createdAt: now };
  const workspace = appendSurveyPlanVersionApplication({ workspace: { ...input.workspace, transferRegistry }, record, auditEntry, snapshotStore: sameApplication ? input.workspace.versionComparison.modelSnapshotStore : snapshotUpsert.store, now });
  return { ...preview, applied: true, rolledBack: false, message: auditEntry.message, rooms, wallSegments, wallOpenings, zoneWorkspace, openingWorkspace, workspace, applicationRecord: record, auditEntry };
}

export function rollbackSurveyPlanVersionModelApplication(input: SurveyPlanVersionModelApplicationInput & { confirmed: boolean; applicationId?: string | null }): SurveyPlanVersionModelApplicationResult {
  const preview = buildSurveyPlanVersionModelApplicationPreview(input);
  const record = resolveSurveyPlanVersionApplication({ workspace: input.workspace, comparisonId: input.comparisonId, applicationId: input.applicationId });
  const now = new Date().toISOString();
  const snapshot = resolveSurveyPlanVersionSnapshot({ workspace: input.workspace, record });
  if (!input.confirmed || !record || !snapshot || (record.status !== "applied" && record.status !== "superseded")) {
    return { ...preview, applied: false, rolledBack: false, message: !input.confirmed ? "A visszaállítást külön meg kell erősíteni." : "Nincs alkalmazott, visszaállítható modellpillanatkép.", rooms: input.rooms, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings, zoneWorkspace: input.zoneWorkspace, openingWorkspace: input.openingWorkspace, workspace: input.workspace, applicationRecord: record, auditEntry: null };
  }
  const auditEntry: SurveyPlanVersionModelApplicationAuditEntry = { id: `plan-model-application-audit-rollback-${now.replace(/\D/g, "")}`, comparisonId: input.comparisonId, applicationId: record.id, action: "rollback", result: "success", counts: record.counts, message: record.status === "superseded" ? "A központi modell egy korábbi történeti visszaállítási pontra állt vissza." : "A központi modell a tervverzió-átvezetés előtti pillanatképre visszaállt.", createdAt: now };
  const rolledBack = markSurveyPlanVersionApplicationRolledBack({ workspace: { ...input.workspace, transferRegistry: snapshot.transferRegistry }, record, auditEntry, now });
  return { ...preview, applied: false, rolledBack: true, message: auditEntry.message, rooms: structuredClone(snapshot.rooms) as unknown as SurveyRoom[], wallSegments: structuredClone(snapshot.wallSegments) as unknown as SurveyWallSegment[], wallOpenings: structuredClone(snapshot.wallOpenings) as unknown as SurveyWallOpening[], zoneWorkspace: structuredClone(snapshot.zoneWorkspace) as unknown as EnergyZoneWorkspace, openingWorkspace: structuredClone(snapshot.openingWorkspace) as unknown as EnergyOpeningWorkspace, workspace: rolledBack.workspace, applicationRecord: rolledBack.record, auditEntry };
}
