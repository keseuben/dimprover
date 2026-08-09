import type { WinWattFieldMapResult, WinWattFieldReadinessStatus } from "@/components/energy/domain/energyWinWattTransferTypes";

export type WinWattTrialSessionStatus = "draft" | "inProgress" | "completed" | "blocked";
export type WinWattTrialFieldStatus = "notTested" | "matched" | "targetAdjusted" | "unitAdjusted" | "manualOnly" | "skipped" | "blocked";
export type WinWattTrialInputMethod = "typing" | "copyPaste" | "excelPaste" | "import" | "notApplicable";
export type WinWattTrialComparisonStatus = "notCompared" | "withinTolerance" | "outsideTolerance" | "notComparable";

export type WinWattTrialFieldResult = {
  id: string;
  fieldMapId: string;
  sourceTableId: string;
  sourceColumnKey: string;
  targetFieldKey: string;
  targetWindow: string;
  targetTab: string;
  targetFieldLabel: string;
  targetUnit: string;
  sourceReadiness: WinWattFieldReadinessStatus;
  status: WinWattTrialFieldStatus;
  inputMethod: WinWattTrialInputMethod;
  entryOrder?: number;
  durationSeconds?: number;
  entryStartedAt?: string;
  entryCompletedAt?: string;
  observedValue: string;
  note: string;
  verifiedAt?: string;
};

export type WinWattTrialMetricComparison = {
  id: string;
  metricKey: string;
  label: string;
  dimproValue?: number;
  winWattValue?: number;
  unit: string;
  toleranceAbsolute?: number;
  tolerancePercent?: number;
  status: WinWattTrialComparisonStatus;
  note: string;
};

export type WinWattTrialSession = {
  id: string;
  title: string;
  status: WinWattTrialSessionStatus;
  winWattVersion: string;
  operatorName: string;
  workstation: string;
  sourcePackageSchema: string;
  sourcePackageExportedAt?: string;
  activeFieldMapId?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  fieldResults: WinWattTrialFieldResult[];
  resultComparisons: WinWattTrialMetricComparison[];
  note: string;
};

export type WinWattTrialWorkspace = {
  schemaVersion: 1;
  activeSessionId?: string;
  sessions: WinWattTrialSession[];
  updatedAt: string;
};

export type WinWattTrialMetricSeed = {
  metricKey: string;
  label: string;
  dimproValue?: number;
  unit: string;
  toleranceAbsolute?: number;
  tolerancePercent?: number;
};

export type WinWattTrialSessionSummary = {
  sessionId: string;
  title: string;
  status: WinWattTrialSessionStatus;
  totalFieldCount: number;
  testedFieldCount: number;
  notTestedFieldCount: number;
  matchedFieldCount: number;
  adjustedFieldCount: number;
  manualOnlyFieldCount: number;
  skippedFieldCount: number;
  blockedFieldCount: number;
  verifiedFieldCount: number;
  progressPercent: number;
  comparedMetricCount: number;
  withinToleranceMetricCount: number;
  outsideToleranceMetricCount: number;
  notComparableMetricCount: number;
  durationSeconds: number;
  readyToComplete: boolean;
};

export type WinWattVerifiedMapping = {
  fieldMapId: string;
  sourceTableId: string;
  sourceColumnKey: string;
  targetFieldKey: string;
  targetWindow: string;
  targetTab: string;
  targetFieldLabel: string;
  targetUnit: string;
  status: Exclude<WinWattTrialFieldStatus, "notTested" | "skipped" | "blocked">;
  sessionId: string;
  verifiedAt: string;
};

export type WinWattTrialFeedbackResult = {
  schema: "dimpro.winwatt-trial-feedback.v0.8.4";
  generatedAt: string;
  activeSessionId?: string;
  sessionSummaries: WinWattTrialSessionSummary[];
  verifiedMappings: WinWattVerifiedMapping[];
  totals: {
    sessionCount: number;
    completedSessionCount: number;
    testedFieldCount: number;
    verifiedFieldCount: number;
    blockedFieldCount: number;
    comparedMetricCount: number;
    outsideToleranceMetricCount: number;
  };
  disclaimer: string;
};

export const winWattTrialSessionStatusLabels: Record<WinWattTrialSessionStatus, string> = {
  draft: "Előkészítés",
  inProgress: "Folyamatban",
  completed: "Lezárt próba",
  blocked: "Blokkolt próba",
};

export const winWattTrialFieldStatusLabels: Record<WinWattTrialFieldStatus, string> = {
  notTested: "Még nem próbált",
  matched: "Célmező egyezik",
  targetAdjusted: "Célfelirat pontosítva",
  unitAdjusted: "Mértékegység pontosítva",
  manualOnly: "Csak kézzel vihető át",
  skipped: "Kihagyva",
  blocked: "Blokkolt",
};

export const winWattTrialInputMethodLabels: Record<WinWattTrialInputMethod, string> = {
  typing: "Kézi begépelés",
  copyPaste: "Másolás és beillesztés",
  excelPaste: "Excel-táblából beillesztés",
  import: "Import",
  notApplicable: "Nem alkalmazandó",
};

export const winWattTrialComparisonStatusLabels: Record<WinWattTrialComparisonStatus, string> = {
  notCompared: "Még nincs összevetve",
  withinTolerance: "Tűrésen belül",
  outsideTolerance: "Tűrésen kívül",
  notComparable: "Nem összehasonlítható",
};

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function finiteOrUndefined(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function createDefaultWinWattTrialWorkspace(): WinWattTrialWorkspace {
  return { schemaVersion: 1, sessions: [], updatedAt: nowIso() };
}

export function createWinWattTrialSession(input: {
  fieldMap: WinWattFieldMapResult;
  title?: string;
  winWattVersion?: string;
  operatorName?: string;
  workstation?: string;
  metricSeeds?: WinWattTrialMetricSeed[];
}): WinWattTrialSession {
  const createdAt = nowIso();
  return {
    id: id("winwatt-trial"),
    title: input.title?.trim() || `WinWatt próba ${new Date().toLocaleDateString("hu-HU")}`,
    status: "draft",
    winWattVersion: input.winWattVersion?.trim() || "",
    operatorName: input.operatorName?.trim() || "",
    workstation: input.workstation?.trim() || "",
    sourcePackageSchema: "dimpro.winwatt-trial-package.v0.8.4",
    activeFieldMapId: input.fieldMap.fields.find((field) => field.readiness !== "notApplicable")?.id || input.fieldMap.fields[0]?.id,
    createdAt,
    updatedAt: createdAt,
    fieldResults: input.fieldMap.fields.map((field) => ({
      id: id("trial-field"),
      fieldMapId: field.id,
      sourceTableId: field.sourceTableId,
      sourceColumnKey: field.sourceColumnKey,
      targetFieldKey: field.targetFieldKey,
      targetWindow: field.targetGroupLabel,
      targetTab: "",
      targetFieldLabel: field.targetFieldLabel,
      targetUnit: field.targetUnit || field.sourceUnit || "",
      sourceReadiness: field.readiness,
      status: field.readiness === "notApplicable" ? "skipped" : "notTested",
      inputMethod: field.readiness === "notApplicable" ? "notApplicable" : field.transferMode === "directCopy" ? "copyPaste" : "typing",
      observedValue: "",
      note: "",
    })),
    resultComparisons: (input.metricSeeds || []).map((metric) => ({
      id: id("trial-metric"),
      metricKey: metric.metricKey,
      label: metric.label,
      dimproValue: finiteOrUndefined(metric.dimproValue),
      unit: metric.unit,
      toleranceAbsolute: finiteOrUndefined(metric.toleranceAbsolute),
      tolerancePercent: finiteOrUndefined(metric.tolerancePercent),
      status: "notCompared",
      note: "",
    })),
    note: "",
  };
}

function normalizeFieldResult(input: Partial<WinWattTrialFieldResult>, index: number): WinWattTrialFieldResult {
  const allowedStatus: WinWattTrialFieldStatus[] = ["notTested", "matched", "targetAdjusted", "unitAdjusted", "manualOnly", "skipped", "blocked"];
  const allowedMethod: WinWattTrialInputMethod[] = ["typing", "copyPaste", "excelPaste", "import", "notApplicable"];
  return {
    id: typeof input.id === "string" && input.id ? input.id : `trial-field-${index + 1}`,
    fieldMapId: typeof input.fieldMapId === "string" ? input.fieldMapId : "",
    sourceTableId: typeof input.sourceTableId === "string" ? input.sourceTableId : "",
    sourceColumnKey: typeof input.sourceColumnKey === "string" ? input.sourceColumnKey : "",
    targetFieldKey: typeof input.targetFieldKey === "string" ? input.targetFieldKey : "",
    targetWindow: typeof input.targetWindow === "string" ? input.targetWindow : "",
    targetTab: typeof input.targetTab === "string" ? input.targetTab : "",
    targetFieldLabel: typeof input.targetFieldLabel === "string" ? input.targetFieldLabel : "",
    targetUnit: typeof input.targetUnit === "string" ? input.targetUnit : "",
    sourceReadiness: input.sourceReadiness === "ready" || input.sourceReadiness === "reviewRequired" || input.sourceReadiness === "blocked" || input.sourceReadiness === "notApplicable" ? input.sourceReadiness : input.status === "skipped" ? "notApplicable" : "reviewRequired",
    status: allowedStatus.includes(input.status as WinWattTrialFieldStatus) ? input.status as WinWattTrialFieldStatus : "notTested",
    inputMethod: allowedMethod.includes(input.inputMethod as WinWattTrialInputMethod) ? input.inputMethod as WinWattTrialInputMethod : "typing",
    entryOrder: finiteOrUndefined(input.entryOrder),
    durationSeconds: finiteOrUndefined(input.durationSeconds),
    entryStartedAt: typeof input.entryStartedAt === "string" && input.entryStartedAt ? input.entryStartedAt : undefined,
    entryCompletedAt: typeof input.entryCompletedAt === "string" && input.entryCompletedAt ? input.entryCompletedAt : undefined,
    observedValue: typeof input.observedValue === "string" ? input.observedValue : "",
    note: typeof input.note === "string" ? input.note : "",
    verifiedAt: typeof input.verifiedAt === "string" && input.verifiedAt ? input.verifiedAt : undefined,
  };
}

function normalizeMetric(input: Partial<WinWattTrialMetricComparison>, index: number): WinWattTrialMetricComparison {
  const allowed: WinWattTrialComparisonStatus[] = ["notCompared", "withinTolerance", "outsideTolerance", "notComparable"];
  return {
    id: typeof input.id === "string" && input.id ? input.id : `trial-metric-${index + 1}`,
    metricKey: typeof input.metricKey === "string" && input.metricKey ? input.metricKey : `metric-${index + 1}`,
    label: typeof input.label === "string" && input.label ? input.label : `Eredmény ${index + 1}`,
    dimproValue: finiteOrUndefined(input.dimproValue),
    winWattValue: finiteOrUndefined(input.winWattValue),
    unit: typeof input.unit === "string" ? input.unit : "",
    toleranceAbsolute: finiteOrUndefined(input.toleranceAbsolute),
    tolerancePercent: finiteOrUndefined(input.tolerancePercent),
    status: allowed.includes(input.status as WinWattTrialComparisonStatus) ? input.status as WinWattTrialComparisonStatus : "notCompared",
    note: typeof input.note === "string" ? input.note : "",
  };
}

export function getWinWattTrialFieldElapsedSeconds(field: WinWattTrialFieldResult, now: string | number | Date = Date.now()) {
  const recorded = Math.max(0, Number(field.durationSeconds) || 0);
  if (!field.entryStartedAt) return recorded;
  const startedAt = new Date(field.entryStartedAt).getTime();
  const current = now instanceof Date ? now.getTime() : typeof now === "string" ? new Date(now).getTime() : now;
  if (!Number.isFinite(startedAt) || !Number.isFinite(current) || current <= startedAt) return recorded;
  return recorded + Math.max(0, (current - startedAt) / 1000);
}

export function startWinWattTrialField(field: WinWattTrialFieldResult, startedAt = nowIso()): WinWattTrialFieldResult {
  if (field.entryStartedAt) return field;
  return { ...field, entryStartedAt: startedAt, entryCompletedAt: undefined };
}

export function finishWinWattTrialField(
  field: WinWattTrialFieldResult,
  status: WinWattTrialFieldStatus,
  finishedAt = nowIso(),
): WinWattTrialFieldResult {
  const verified = status === "matched" || status === "targetAdjusted" || status === "unitAdjusted" || status === "manualOnly";
  return {
    ...field,
    status,
    durationSeconds: Number(getWinWattTrialFieldElapsedSeconds(field, finishedAt).toFixed(1)),
    entryStartedAt: undefined,
    entryCompletedAt: finishedAt,
    verifiedAt: verified ? finishedAt : field.verifiedAt,
    inputMethod: status === "skipped" ? "notApplicable" : field.inputMethod,
  };
}

export function normalizeWinWattTrialWorkspace(input?: Partial<WinWattTrialWorkspace> | null): WinWattTrialWorkspace {
  const allowedSessionStatus: WinWattTrialSessionStatus[] = ["draft", "inProgress", "completed", "blocked"];
  const sessions = Array.isArray(input?.sessions) ? input.sessions.map((session, index) => {
    const createdAt = typeof session.createdAt === "string" && session.createdAt ? session.createdAt : nowIso();
    return {
      id: typeof session.id === "string" && session.id ? session.id : `winwatt-trial-${index + 1}`,
      title: typeof session.title === "string" && session.title.trim() ? session.title : `WinWatt próba ${index + 1}`,
      status: allowedSessionStatus.includes(session.status as WinWattTrialSessionStatus) ? session.status as WinWattTrialSessionStatus : "draft",
      winWattVersion: typeof session.winWattVersion === "string" ? session.winWattVersion : "",
      operatorName: typeof session.operatorName === "string" ? session.operatorName : "",
      workstation: typeof session.workstation === "string" ? session.workstation : "",
      sourcePackageSchema: typeof session.sourcePackageSchema === "string" && session.sourcePackageSchema ? session.sourcePackageSchema : "dimpro.winwatt-trial-package.v0.8.4",
      sourcePackageExportedAt: typeof session.sourcePackageExportedAt === "string" && session.sourcePackageExportedAt ? session.sourcePackageExportedAt : undefined,
      activeFieldMapId: typeof session.activeFieldMapId === "string" && session.fieldResults?.some((field) => field.fieldMapId === session.activeFieldMapId)
        ? session.activeFieldMapId
        : session.fieldResults?.find((field) => field.sourceReadiness !== "notApplicable")?.fieldMapId || session.fieldResults?.[0]?.fieldMapId,
      startedAt: typeof session.startedAt === "string" && session.startedAt ? session.startedAt : undefined,
      completedAt: typeof session.completedAt === "string" && session.completedAt ? session.completedAt : undefined,
      createdAt,
      updatedAt: typeof session.updatedAt === "string" && session.updatedAt ? session.updatedAt : createdAt,
      fieldResults: Array.isArray(session.fieldResults) ? session.fieldResults.map(normalizeFieldResult) : [],
      resultComparisons: Array.isArray(session.resultComparisons) ? session.resultComparisons.map(normalizeMetric) : [],
      note: typeof session.note === "string" ? session.note : "",
    } satisfies WinWattTrialSession;
  }) : [];
  const activeSessionId = sessions.some((session) => session.id === input?.activeSessionId) ? input?.activeSessionId : sessions[0]?.id;
  return {
    schemaVersion: 1,
    activeSessionId,
    sessions,
    updatedAt: typeof input?.updatedAt === "string" && input.updatedAt ? input.updatedAt : nowIso(),
  };
}
