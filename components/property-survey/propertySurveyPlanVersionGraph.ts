import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyPlanDocument,
  SurveyPlanVersionModelApplicationRecord,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import { getSurveyPlanVersionHistorySummary } from "@/components/property-survey/propertySurveyPlanVersionHistory";

export type SurveyPlanVersionGraphNode = {
  documentId: string;
  fileName: string;
  revisionCode: string;
  revisionDate: string;
  versionGroupId: string;
  isCurrentVersion: boolean;
  parentDocumentIds: string[];
  childDocumentIds: string[];
  comparisonIds: string[];
  applicationIds: string[];
  depth: number;
  orphaned: boolean;
};

export type SurveyPlanVersionGraphEdge = {
  id: string;
  fromDocumentId: string;
  toDocumentId: string;
  relation: "supersedes" | "comparison";
  comparisonId: string;
};

export type SurveyPlanVersionGraphGroup = {
  id: string;
  nodeIds: string[];
  rootNodeIds: string[];
  currentNodeIds: string[];
  branchNodeIds: string[];
};

export type SurveyPlanVersionGraph = {
  nodes: SurveyPlanVersionGraphNode[];
  edges: SurveyPlanVersionGraphEdge[];
  groups: SurveyPlanVersionGraphGroup[];
  applications: SurveyPlanVersionModelApplicationRecord[];
  totals: {
    documentCount: number;
    groupCount: number;
    edgeCount: number;
    rootCount: number;
    currentCount: number;
    branchCount: number;
    orphanCount: number;
    cycleCount: number;
    applicationCount: number;
    rollbackPointCount: number;
    snapshotCount: number;
    storedSnapshotBytes: number;
    estimatedSavedBytes: number;
  };
};

function documentLabel(document: SurveyPlanDocument) {
  return document.revisionCode || document.fileName || document.id;
}

export function buildSurveyPlanVersionGraph(workspace: PropertySurveyPlanDocumentWorkspace): SurveyPlanVersionGraph {
  const documents = workspace.documents;
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const edgeMap = new Map<string, SurveyPlanVersionGraphEdge>();
  for (const document of documents) {
    if (!document.supersedesDocumentId || !documentMap.has(document.supersedesDocumentId) || document.supersedesDocumentId === document.id) continue;
    const id = `plan-version-edge-supersedes-${document.supersedesDocumentId}-${document.id}`;
    edgeMap.set(id, { id, fromDocumentId: document.supersedesDocumentId, toDocumentId: document.id, relation: "supersedes", comparisonId: "" });
  }
  for (const comparison of Object.values(workspace.versionComparison.comparisons)) {
    if (!documentMap.has(comparison.baseDocumentId) || !documentMap.has(comparison.targetDocumentId) || comparison.baseDocumentId === comparison.targetDocumentId) continue;
    const existing = [...edgeMap.values()].find((edge) => edge.fromDocumentId === comparison.baseDocumentId && edge.toDocumentId === comparison.targetDocumentId);
    if (existing) {
      edgeMap.set(existing.id, { ...existing, comparisonId: comparison.id });
      continue;
    }
    const id = `plan-version-edge-comparison-${comparison.id}`;
    edgeMap.set(id, { id, fromDocumentId: comparison.baseDocumentId, toDocumentId: comparison.targetDocumentId, relation: "comparison", comparisonId: comparison.id });
  }
  const edges = [...edgeMap.values()];
  const parentIds = new Map<string, Set<string>>();
  const childIds = new Map<string, Set<string>>();
  for (const document of documents) {
    parentIds.set(document.id, new Set());
    childIds.set(document.id, new Set());
  }
  for (const edge of edges) {
    parentIds.get(edge.toDocumentId)?.add(edge.fromDocumentId);
    childIds.get(edge.fromDocumentId)?.add(edge.toDocumentId);
  }

  const depthMemo = new Map<string, number>();
  const cycleNodes = new Set<string>();
  function resolveDepth(documentId: string, stack: string[] = []): number {
    if (depthMemo.has(documentId)) return depthMemo.get(documentId) || 0;
    if (stack.includes(documentId)) {
      stack.slice(stack.indexOf(documentId)).forEach((id) => cycleNodes.add(id));
      cycleNodes.add(documentId);
      return 0;
    }
    const parents = [...(parentIds.get(documentId) || [])];
    const depth = parents.length ? Math.max(...parents.map((id) => resolveDepth(id, [...stack, documentId]) + 1)) : 0;
    depthMemo.set(documentId, depth);
    return depth;
  }

  const applicationsByDocument = new Map<string, string[]>();
  for (const record of workspace.versionComparison.modelApplicationHistory) {
    const values = applicationsByDocument.get(record.targetDocumentId) || [];
    values.push(record.id);
    applicationsByDocument.set(record.targetDocumentId, values);
  }
  const comparisonsByDocument = new Map<string, string[]>();
  for (const comparison of Object.values(workspace.versionComparison.comparisons)) {
    for (const documentId of [comparison.baseDocumentId, comparison.targetDocumentId]) {
      const values = comparisonsByDocument.get(documentId) || [];
      if (!values.includes(comparison.id)) values.push(comparison.id);
      comparisonsByDocument.set(documentId, values);
    }
  }

  const nodes = documents.map((document) => ({
    documentId: document.id,
    fileName: document.fileName,
    revisionCode: document.revisionCode,
    revisionDate: document.revisionDate,
    versionGroupId: document.versionGroupId || `plan-version-group-${document.id}`,
    isCurrentVersion: document.isCurrentVersion,
    parentDocumentIds: [...(parentIds.get(document.id) || [])],
    childDocumentIds: [...(childIds.get(document.id) || [])],
    comparisonIds: comparisonsByDocument.get(document.id) || [],
    applicationIds: applicationsByDocument.get(document.id) || [],
    depth: resolveDepth(document.id),
    orphaned: Boolean(document.supersedesDocumentId && !documentMap.has(document.supersedesDocumentId)),
  } satisfies SurveyPlanVersionGraphNode)).sort((left, right) => left.depth - right.depth || left.revisionDate.localeCompare(right.revisionDate) || left.revisionCode.localeCompare(right.revisionCode) || documentLabel(documentMap.get(left.documentId)!).localeCompare(documentLabel(documentMap.get(right.documentId)!)));

  const groupMap = new Map<string, SurveyPlanVersionGraphNode[]>();
  for (const node of nodes) {
    const values = groupMap.get(node.versionGroupId) || [];
    values.push(node);
    groupMap.set(node.versionGroupId, values);
  }
  const groups = [...groupMap.entries()].map(([id, groupNodes]) => ({
    id,
    nodeIds: groupNodes.map((node) => node.documentId),
    rootNodeIds: groupNodes.filter((node) => node.parentDocumentIds.length === 0).map((node) => node.documentId),
    currentNodeIds: groupNodes.filter((node) => node.isCurrentVersion).map((node) => node.documentId),
    branchNodeIds: groupNodes.filter((node) => node.childDocumentIds.length > 1).map((node) => node.documentId),
  } satisfies SurveyPlanVersionGraphGroup));
  const historySummary = getSurveyPlanVersionHistorySummary({ workspace });
  return {
    nodes,
    edges,
    groups,
    applications: workspace.versionComparison.modelApplicationHistory,
    totals: {
      documentCount: nodes.length,
      groupCount: groups.length,
      edgeCount: edges.length,
      rootCount: nodes.filter((node) => node.parentDocumentIds.length === 0).length,
      currentCount: nodes.filter((node) => node.isCurrentVersion).length,
      branchCount: nodes.filter((node) => node.childDocumentIds.length > 1).length,
      orphanCount: nodes.filter((node) => node.orphaned).length,
      cycleCount: cycleNodes.size,
      applicationCount: historySummary.applicationCount,
      rollbackPointCount: historySummary.rollbackPointCount,
      snapshotCount: historySummary.snapshotCount,
      storedSnapshotBytes: historySummary.storedSnapshotBytes,
      estimatedSavedBytes: historySummary.estimatedSavedBytes,
    },
  };
}

export function findSurveyPlanVersionComparisonForDocuments(workspace: PropertySurveyPlanDocumentWorkspace, baseDocumentId: string, targetDocumentId: string) {
  return Object.values(workspace.versionComparison.comparisons).find((comparison) => comparison.baseDocumentId === baseDocumentId && comparison.targetDocumentId === targetDocumentId) || null;
}
