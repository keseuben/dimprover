import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import type {
  WinWattTrialFeedbackResult,
  WinWattTrialFieldResult,
  WinWattTrialSession,
  WinWattTrialSessionSummary,
  WinWattTrialWorkspace,
  WinWattVerifiedMapping,
} from "@/components/energy/domain/energyWinWattTrialTypes";

function uniqueByFieldMapId(results: WinWattTrialFieldResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (!result.fieldMapId || seen.has(result.fieldMapId)) return false;
    seen.add(result.fieldMapId);
    return true;
  });
}

function summarizeSession(session: WinWattTrialSession): WinWattTrialSessionSummary {
  const uniqueResults = uniqueByFieldMapId(session.fieldResults);
  const relevantResults = uniqueResults.filter((result) => result.sourceReadiness !== "notApplicable");
  const statuses = relevantResults.map((result) => result.status);
  const testedFieldCount = statuses.filter((status) => status !== "notTested").length;
  const matchedFieldCount = statuses.filter((status) => status === "matched").length;
  const adjustedFieldCount = statuses.filter((status) => status === "targetAdjusted" || status === "unitAdjusted").length;
  const manualOnlyFieldCount = statuses.filter((status) => status === "manualOnly").length;
  const skippedFieldCount = statuses.filter((status) => status === "skipped").length;
  const blockedFieldCount = statuses.filter((status) => status === "blocked").length;
  const verifiedFieldCount = matchedFieldCount + adjustedFieldCount + manualOnlyFieldCount;
  const comparedMetricCount = session.resultComparisons.filter((metric) => metric.status !== "notCompared").length;
  const withinToleranceMetricCount = session.resultComparisons.filter((metric) => metric.status === "withinTolerance").length;
  const outsideToleranceMetricCount = session.resultComparisons.filter((metric) => metric.status === "outsideTolerance").length;
  const notComparableMetricCount = session.resultComparisons.filter((metric) => metric.status === "notComparable").length;
  const durationSeconds = session.fieldResults.reduce((sum, result) => sum + (Number.isFinite(result.durationSeconds) ? Number(result.durationSeconds) : 0), 0);
  const totalFieldCount = relevantResults.length;
  return {
    sessionId: session.id,
    title: session.title,
    status: session.status,
    totalFieldCount,
    testedFieldCount,
    notTestedFieldCount: Math.max(0, totalFieldCount - testedFieldCount),
    matchedFieldCount,
    adjustedFieldCount,
    manualOnlyFieldCount,
    skippedFieldCount,
    blockedFieldCount,
    verifiedFieldCount,
    progressPercent: totalFieldCount ? Math.round((testedFieldCount / totalFieldCount) * 100) : 100,
    comparedMetricCount,
    withinToleranceMetricCount,
    outsideToleranceMetricCount,
    notComparableMetricCount,
    durationSeconds,
    readyToComplete: totalFieldCount > 0 && testedFieldCount === totalFieldCount && blockedFieldCount === 0,
  };
}

function verifiedMappings(workspace: WinWattTrialWorkspace, fieldMap: WinWattFieldMapResult): WinWattVerifiedMapping[] {
  const fieldIds = new Set(fieldMap.fields.map((field) => field.id));
  const latestByField = new Map<string, WinWattVerifiedMapping>();
  for (const session of workspace.sessions) {
    for (const result of uniqueByFieldMapId(session.fieldResults)) {
      if (!fieldIds.has(result.fieldMapId)) continue;
      if (result.status !== "matched" && result.status !== "targetAdjusted" && result.status !== "unitAdjusted" && result.status !== "manualOnly") continue;
      const verifiedAt = result.verifiedAt || session.completedAt || session.updatedAt;
      const current = latestByField.get(result.fieldMapId);
      if (current && current.verifiedAt > verifiedAt) continue;
      latestByField.set(result.fieldMapId, {
        fieldMapId: result.fieldMapId,
        sourceTableId: result.sourceTableId,
        sourceColumnKey: result.sourceColumnKey,
        targetFieldKey: result.targetFieldKey,
        targetWindow: result.targetWindow,
        targetTab: result.targetTab,
        targetFieldLabel: result.targetFieldLabel,
        targetUnit: result.targetUnit,
        status: result.status,
        sessionId: session.id,
        verifiedAt,
      });
    }
  }
  return [...latestByField.values()].sort((a, b) => a.sourceTableId.localeCompare(b.sourceTableId, "hu") || a.sourceColumnKey.localeCompare(b.sourceColumnKey, "hu"));
}

export function buildWinWattTrialFeedback(workspace: WinWattTrialWorkspace, fieldMap: WinWattFieldMapResult): WinWattTrialFeedbackResult {
  const sessionSummaries = workspace.sessions.map((session) => summarizeSession(session));
  const mappings = verifiedMappings(workspace, fieldMap);
  return {
    schema: "dimpro.winwatt-trial-feedback.v0.8.4",
    generatedAt: new Date().toISOString(),
    activeSessionId: workspace.activeSessionId,
    sessionSummaries,
    verifiedMappings: mappings,
    totals: {
      sessionCount: workspace.sessions.length,
      completedSessionCount: workspace.sessions.filter((session) => session.status === "completed").length,
      testedFieldCount: sessionSummaries.reduce((sum, session) => sum + session.testedFieldCount, 0),
      verifiedFieldCount: mappings.length,
      blockedFieldCount: sessionSummaries.reduce((sum, session) => sum + session.blockedFieldCount, 0),
      comparedMetricCount: sessionSummaries.reduce((sum, session) => sum + session.comparedMetricCount, 0),
      outsideToleranceMetricCount: sessionSummaries.reduce((sum, session) => sum + session.outsideToleranceMetricCount, 0),
    },
    disclaimer: "A próbanapló felhasználó által rögzített WinWatt-asztali tapasztalatokat tartalmaz. A visszaigazolt mezők nem válnak automatikusan központi WinWatt-szerződéssé; kiadás előtt szakmai és regressziós ellenőrzés szükséges.",
  };
}
