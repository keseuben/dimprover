import type { ReleaseRuntimeProvenance } from "./types";

type ReleaseRuntimeInput = Omit<ReleaseRuntimeProvenance, "state" | "blockCode" | "reasons" | "verifiedAt">;

export function verifyReleaseRuntimeProvenance(input: ReleaseRuntimeInput): ReleaseRuntimeProvenance {
  const reasons: string[] = [];
  const releaseValues = [input.declaredRelease, input.activeReleasePointer, input.pm2NextDistDir, input.runtimeCwd].filter((value): value is string => Boolean(value));
  const configured = releaseValues.length > 0 || Boolean(input.buildId || input.expectedBuildId);

  if (releaseValues.length > 1 && new Set(releaseValues).size > 1) {
    reasons.push(`Release pointer/runtime eltérés: ${releaseValues.join(" != ")}`);
  }
  if (input.expectedBuildId && input.buildId && input.expectedBuildId !== input.buildId) {
    reasons.push(`BUILD_ID eltérés: ${input.expectedBuildId} != ${input.buildId}`);
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
