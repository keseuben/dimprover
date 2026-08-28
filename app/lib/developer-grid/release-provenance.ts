import type { ReleaseRuntimeProvenance } from "./types";

type ReleaseRuntimeInput = Omit<ReleaseRuntimeProvenance, "state" | "blockCode" | "reasons" | "verifiedAt">;

function clean(value: string | null) {
  return value?.trim() || null;
}

export function verifyReleaseRuntimeProvenance(input: ReleaseRuntimeInput): ReleaseRuntimeProvenance {
  const reasons: string[] = [];
  const releaseValues = [
    clean(input.declaredRelease),
    clean(input.activeReleasePointer),
    clean(input.pm2NextDistDir),
    clean(input.runtimeRelease),
  ].filter((value): value is string => Boolean(value));
  const configured = releaseValues.length > 0
    || Boolean(input.buildId || input.expectedBuildId || input.sourceCommit || input.expectedSourceCommit);

  if (releaseValues.length > 1 && new Set(releaseValues).size > 1) {
    reasons.push(`Release pointer/runtime eltérés: ${releaseValues.join(" != ")}`);
  }

  if (configured && input.metadataReady === false) {
    reasons.push("Immutable release metadata hiányzik vagy sérült.");
  }

  if (input.expectedBuildId && !input.buildId) {
    reasons.push(`BUILD_ID hiányzik; elvárt: ${input.expectedBuildId}`);
  } else if (input.expectedBuildId && input.buildId && input.expectedBuildId !== input.buildId) {
    reasons.push(`BUILD_ID eltérés: ${input.expectedBuildId} != ${input.buildId}`);
  }

  if (input.expectedSourceCommit && !input.sourceCommit) {
    reasons.push(`Release source commit hiányzik; elvárt: ${input.expectedSourceCommit}`);
  } else if (
    input.expectedSourceCommit
    && input.sourceCommit
    && input.expectedSourceCommit.toLowerCase() !== input.sourceCommit.toLowerCase()
  ) {
    reasons.push(`Release source commit eltérés: ${input.expectedSourceCommit} != ${input.sourceCommit}`);
  }

  if (input.expectedSourceBranch && !input.sourceBranch) {
    reasons.push(`Release source branch hiányzik; elvárt: ${input.expectedSourceBranch}`);
  } else if (
    input.expectedSourceBranch
    && input.sourceBranch
    && input.expectedSourceBranch !== input.sourceBranch
  ) {
    reasons.push(`Release source branch eltérés: ${input.expectedSourceBranch} != ${input.sourceBranch}`);
  }

  const state = !configured ? "NOT_CONFIGURED" : reasons.length ? "BLOCKED" : "VERIFIED";
  return {
    ...input,
    state,
    blockCode: state === "BLOCKED" ? "RELEASE_STATE_MISMATCH" : null,
    reasons,
    verifiedAt: new Date().toISOString(),
  };
}

export function assertReleaseRuntimeMatch(provenance: ReleaseRuntimeProvenance) {
  if (provenance.state === "BLOCKED") {
    const error = new Error(`BLOCKED · RELEASE_STATE_MISMATCH · ${provenance.reasons.join("; ")}`);
    Object.assign(error, { code: "RELEASE_STATE_MISMATCH", provenance });
    throw error;
  }
  return provenance;
}
