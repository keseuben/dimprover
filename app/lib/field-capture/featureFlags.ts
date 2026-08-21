import { FIELD_CAPTURE_VERSION } from "./types";

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function getFieldCaptureFeatureState() {
  const featureEnabled = enabled(process.env.FIELD_CAPTURE_ENABLED);
  return {
    ok: true as const,
    version: FIELD_CAPTURE_VERSION,
    enabled: featureEnabled,
    phase: "P0-P8" as const,
    route: "/terep",
    separateContextModule: true,
    sharedEngines: {
      imagePreparation: "components/drop/dropUploadPreparation.ts",
      resumableUpload: "components/drop/dropMultipartClient.ts",
      browserVoice: "components/drop/dropBrowserVoiceSession.ts",
      transcriptRules: "components/drop/dropSpeechTranscript.ts",
      dropOfflineReference: "components/drop/dropOfflineQueueStore.ts",
      driveStorage: "app/lib/drive-core/*",
    },
    generatedAt: new Date().toISOString(),
  };
}

export function assertFieldCaptureEnabled() {
  const state = getFieldCaptureFeatureState();
  if (!state.enabled) {
    const error = new Error("A Terepi Gyorsrögzítő még nincs aktiválva ezen a környezeten.");
    Object.assign(error, { code: "FIELD_CAPTURE_DISABLED", status: 503 });
    throw error;
  }
  return state;
}
