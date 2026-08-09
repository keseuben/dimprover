import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyPlanVersionModelApplicationAuditEntry,
  SurveyPlanVersionModelApplicationRecord,
  SurveyPlanVersionModelRollbackSnapshot,
  SurveyPlanVersionModelSnapshotEntry,
  SurveyPlanVersionModelSnapshotStore,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyPlanVersionSnapshotUpsertResult = {
  store: SurveyPlanVersionModelSnapshotStore;
  snapshotId: string;
  estimatedBytes: number;
  reused: boolean;
};

export type SurveyPlanVersionHistorySummary = {
  applicationCount: number;
  rollbackPointCount: number;
  snapshotCount: number;
  storedSnapshotBytes: number;
  referencedSnapshotBytes: number;
  estimatedSavedBytes: number;
  latestApplication: SurveyPlanVersionModelApplicationRecord | null;
};

function snapshotText(payload: SurveyPlanVersionModelRollbackSnapshot) {
  return JSON.stringify(payload);
}

function fingerprintText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createSurveyPlanVersionModelSnapshot(input: {
  rooms: unknown[];
  wallSegments: unknown[];
  wallOpenings: unknown[];
  zoneWorkspace: unknown;
  openingWorkspace: unknown;
  transferRegistry: SurveyPlanVersionModelRollbackSnapshot["transferRegistry"];
}): SurveyPlanVersionModelRollbackSnapshot {
  return {
    rooms: structuredClone(input.rooms) as Array<Record<string, unknown>>,
    wallSegments: structuredClone(input.wallSegments) as Array<Record<string, unknown>>,
    wallOpenings: structuredClone(input.wallOpenings) as Array<Record<string, unknown>>,
    zoneWorkspace: structuredClone(input.zoneWorkspace) as Record<string, unknown>,
    openingWorkspace: structuredClone(input.openingWorkspace) as Record<string, unknown>,
    transferRegistry: structuredClone(input.transferRegistry),
  };
}

export function upsertSurveyPlanVersionModelSnapshot(input: {
  store: SurveyPlanVersionModelSnapshotStore;
  payload: SurveyPlanVersionModelRollbackSnapshot;
  now?: string;
}): SurveyPlanVersionSnapshotUpsertResult {
  const now = input.now || new Date().toISOString();
  const text = snapshotText(input.payload);
  const fingerprint = fingerprintText(text);
  const estimatedBytes = text.length;
  const existing = Object.values(input.store.snapshots).find((entry) => entry.fingerprint === fingerprint && entry.estimatedBytes === estimatedBytes && snapshotText(entry.payload) === text);
  if (existing) {
    return {
      snapshotId: existing.id,
      estimatedBytes,
      reused: true,
      store: {
        ...input.store,
        snapshots: { ...input.store.snapshots, [existing.id]: { ...existing, lastUsedAt: now } },
        order: [...input.store.order.filter((id) => id !== existing.id), existing.id],
        updatedAt: now,
      },
    };
  }
  const id = `plan-model-snapshot-${fingerprint}-${estimatedBytes}`;
  const entry: SurveyPlanVersionModelSnapshotEntry = { id, fingerprint, payload: input.payload, estimatedBytes, createdAt: now, lastUsedAt: now };
  return {
    snapshotId: id,
    estimatedBytes,
    reused: false,
    store: {
      ...input.store,
      snapshots: { ...input.store.snapshots, [id]: entry },
      order: [...input.store.order.filter((candidate) => candidate !== id), id],
      updatedAt: now,
    },
  };
}

function pruneSnapshotStore(input: {
  store: SurveyPlanVersionModelSnapshotStore;
  applications: Record<string, SurveyPlanVersionModelApplicationRecord>;
  history: SurveyPlanVersionModelApplicationRecord[];
  now: string;
}) {
  const currentIds = Object.values(input.applications).map((record) => record.rollbackSnapshotId).filter(Boolean);
  const recentIds = input.history.filter((record) => record.rollbackSnapshotId).slice(-input.store.maxSnapshots).map((record) => record.rollbackSnapshotId);
  const keepIds = new Set([...currentIds, ...recentIds]);
  const order = input.store.order.filter((id) => keepIds.has(id) && input.store.snapshots[id]);
  const snapshots = Object.fromEntries(Object.entries(input.store.snapshots).filter(([id]) => keepIds.has(id)));
  const history = input.history.map((record) => record.rollbackSnapshotId && !snapshots[record.rollbackSnapshotId] ? { ...record, rollbackSnapshotId: "" } : record);
  const applications = Object.fromEntries(Object.entries(input.applications).map(([comparisonId, record]) => [comparisonId, record.rollbackSnapshotId && !snapshots[record.rollbackSnapshotId] ? { ...record, rollbackSnapshotId: "" } : record]));
  return { store: { ...input.store, snapshots, order, updatedAt: input.now }, history, applications };
}

export function appendSurveyPlanVersionApplication(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  record: SurveyPlanVersionModelApplicationRecord;
  auditEntry: SurveyPlanVersionModelApplicationAuditEntry;
  snapshotStore?: SurveyPlanVersionModelSnapshotStore;
  now?: string;
}) {
  const now = input.now || input.auditEntry.createdAt || new Date().toISOString();
  let history = input.workspace.versionComparison.modelApplicationHistory.map((record) => record.comparisonId === input.record.comparisonId && record.status === "applied" && record.id !== input.record.id ? { ...record, status: "superseded" as const, updatedAt: now } : record);
  const existingIndex = history.findIndex((record) => record.id === input.record.id);
  if (existingIndex >= 0) history[existingIndex] = input.record;
  else history.push(input.record);
  history = history.sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.updatedAt.localeCompare(right.updatedAt)).slice(-40);
  const applications = { ...input.workspace.versionComparison.modelApplications, [input.record.comparisonId]: input.record };
  const pruned = pruneSnapshotStore({ store: input.snapshotStore || input.workspace.versionComparison.modelSnapshotStore, applications, history, now });
  return {
    ...input.workspace,
    versionComparison: {
      ...input.workspace.versionComparison,
      modelApplications: pruned.applications,
      modelApplicationHistory: pruned.history,
      modelSnapshotStore: pruned.store,
      modelApplicationAudit: [...input.workspace.versionComparison.modelApplicationAudit, input.auditEntry].slice(-150),
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function appendSurveyPlanVersionAuditOnly(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  auditEntry: SurveyPlanVersionModelApplicationAuditEntry;
}) {
  return {
    ...input.workspace,
    versionComparison: {
      ...input.workspace.versionComparison,
      modelApplicationAudit: [...input.workspace.versionComparison.modelApplicationAudit, input.auditEntry].slice(-150),
      updatedAt: input.auditEntry.createdAt,
    },
    updatedAt: input.auditEntry.createdAt,
  };
}

export function resolveSurveyPlanVersionApplication(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  applicationId?: string | null;
}) {
  if (input.applicationId) {
    const historical = input.workspace.versionComparison.modelApplicationHistory.find((record) => record.id === input.applicationId && record.comparisonId === input.comparisonId);
    if (historical) return historical;
  }
  return input.workspace.versionComparison.modelApplications[input.comparisonId] || null;
}

export function resolveSurveyPlanVersionSnapshot(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  record: SurveyPlanVersionModelApplicationRecord | null;
}) {
  if (!input.record) return null;
  if (input.record.rollbackSnapshotId) return input.workspace.versionComparison.modelSnapshotStore.snapshots[input.record.rollbackSnapshotId]?.payload || null;
  return input.record.rollbackSnapshot || null;
}

export function markSurveyPlanVersionApplicationRolledBack(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  record: SurveyPlanVersionModelApplicationRecord;
  auditEntry: SurveyPlanVersionModelApplicationAuditEntry;
  now?: string;
}) {
  const now = input.now || input.auditEntry.createdAt;
  const nextRecord: SurveyPlanVersionModelApplicationRecord = { ...input.record, status: "rolledBack", rolledBackAt: now, updatedAt: now };
  const history = input.workspace.versionComparison.modelApplicationHistory.map((record) => {
    if (record.id === nextRecord.id) return nextRecord;
    if (record.sequenceNumber > nextRecord.sequenceNumber && record.status === "applied") return { ...record, status: "superseded" as const, updatedAt: now };
    return record;
  });
  const historyById = new Map(history.map((record) => [record.id, record]));
  const modelApplications = Object.fromEntries(Object.entries(input.workspace.versionComparison.modelApplications).map(([comparisonId, record]) => {
    if (record.id === nextRecord.id) return [comparisonId, nextRecord];
    const historical = historyById.get(record.id);
    return [comparisonId, historical || record];
  }));
  modelApplications[nextRecord.comparisonId] = nextRecord;
  return {
    workspace: {
      ...input.workspace,
      versionComparison: {
        ...input.workspace.versionComparison,
        modelApplications,
        modelApplicationHistory: history,
        modelApplicationAudit: [...input.workspace.versionComparison.modelApplicationAudit, input.auditEntry].slice(-150),
        updatedAt: now,
      },
      updatedAt: now,
    },
    record: nextRecord,
  };
}

export function getSurveyPlanVersionHistorySummary(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId?: string | null;
}): SurveyPlanVersionHistorySummary {
  const history = input.comparisonId ? input.workspace.versionComparison.modelApplicationHistory.filter((record) => record.comparisonId === input.comparisonId) : input.workspace.versionComparison.modelApplicationHistory;
  const rollbackRecords = history.filter((record) => record.rollbackSnapshotId && Boolean(input.workspace.versionComparison.modelSnapshotStore.snapshots[record.rollbackSnapshotId]));
  const storedSnapshotBytes = Object.values(input.workspace.versionComparison.modelSnapshotStore.snapshots).reduce((sum, entry) => sum + entry.estimatedBytes, 0);
  const referencedSnapshotBytes = history.reduce((sum, record) => sum + record.rollbackSnapshotBytes, 0);
  return {
    applicationCount: history.length,
    rollbackPointCount: rollbackRecords.length,
    snapshotCount: Object.keys(input.workspace.versionComparison.modelSnapshotStore.snapshots).length,
    storedSnapshotBytes,
    referencedSnapshotBytes,
    estimatedSavedBytes: Math.max(0, referencedSnapshotBytes - storedSnapshotBytes),
    latestApplication: history.at(-1) || null,
  };
}
