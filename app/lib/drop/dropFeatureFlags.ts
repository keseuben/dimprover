import type { DropFeatureFlags, DropFeatureKey, DropRuntimeStage } from "./dropTypes";

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function getDropRuntimeStage(): DropRuntimeStage {
  const value = process.env.DROP_RUNTIME_STAGE?.trim().toLowerCase();
  if (value === "private-pilot" || value === "production") return value;
  return "shell";
}

export function getDropFeatureFlags(): DropFeatureFlags {
  const releaseGateEnabled = isEnabled(process.env.DROP_RELEASE_GATE_ENABLED);

  return {
    dropModuleVisible: process.env.DROP_MODULE_VISIBLE?.trim().toLowerCase() !== "false",
    packageEngineEnabled: releaseGateEnabled && isEnabled(process.env.DROP_PACKAGE_ENGINE_ENABLED),
    accessGateEnabled: releaseGateEnabled && isEnabled(process.env.DROP_ACCESS_GATE_ENABLED),
    emailNotificationsEnabled: releaseGateEnabled && isEnabled(process.env.DROP_EMAIL_NOTIFICATIONS_ENABLED),
    spacesEnabled: releaseGateEnabled && isEnabled(process.env.DROP_SPACES_ENABLED),
    spacePackageCreationEnabled: releaseGateEnabled && isEnabled(process.env.DROP_SPACE_PACKAGE_CREATION_ENABLED),
    storageCoreEnabled: releaseGateEnabled && isEnabled(process.env.DROP_STORAGE_CORE_ENABLED),
    quarantineUploadEnabled: releaseGateEnabled && isEnabled(process.env.DROP_QUARANTINE_UPLOAD_ENABLED),
    resumableUploadEnabled: releaseGateEnabled && isEnabled(process.env.DROP_RESUMABLE_UPLOAD_ENABLED),
    imageDropEnabled: releaseGateEnabled && isEnabled(process.env.DROP_IMAGE_DROP_ENABLED),
    fileDropEnabled: releaseGateEnabled && isEnabled(process.env.DROP_FILE_DROP_ENABLED),
    zipUploadEnabled: releaseGateEnabled && isEnabled(process.env.DROP_ZIP_UPLOAD_ENABLED),
    mixedPackageEnabled: releaseGateEnabled && isEnabled(process.env.DROP_MIXED_PACKAGE_ENABLED),
    commentsEnabled: releaseGateEnabled && isEnabled(process.env.DROP_COMMENTS_ENABLED),
    pdfReportEnabled: releaseGateEnabled && isEnabled(process.env.DROP_PDF_REPORT_ENABLED),
    driveArchiveEnabled: releaseGateEnabled && isEnabled(process.env.DROP_DRIVE_ARCHIVE_ENABLED),
    driveDesktopEnabled: releaseGateEnabled && isEnabled(process.env.DROP_DRIVE_DESKTOP_ENABLED),
    aiImageCheckEnabled: releaseGateEnabled && isEnabled(process.env.DROP_AI_IMAGE_CHECK_ENABLED),
    issueRegisterLinkEnabled: releaseGateEnabled && isEnabled(process.env.DROP_ISSUE_REGISTER_LINK_ENABLED),
    autoGroupingEnabled: releaseGateEnabled && isEnabled(process.env.DROP_AUTO_GROUPING_ENABLED),
    submissionGateEnabled: releaseGateEnabled && isEnabled(process.env.DROP_SUBMISSION_GATE_ENABLED),
    sendEnabled: releaseGateEnabled && isEnabled(process.env.DROP_SEND_ENABLED),
    hexUploadEnabled: releaseGateEnabled && isEnabled(process.env.DROP_HEX_UPLOAD_ENABLED),
  };
}

export function getDropFeatureState() {
  const flags = getDropFeatureFlags();
  const releaseGateEnabled = isEnabled(process.env.DROP_RELEASE_GATE_ENABLED);

  return {
    ok: true as const,
    version: "DROP 1.2.11",
    stage: getDropRuntimeStage(),
    releaseGateEnabled,
    flags,
    coreEnabled: flags.packageEngineEnabled && flags.accessGateEnabled,
    uploadEnabled: flags.imageDropEnabled || flags.fileDropEnabled || flags.zipUploadEnabled || flags.mixedPackageEnabled,
    activationRule:
      "A funkció csak a központi release gate és a saját feature flag együttes engedélyezésekor aktiválható.",
    generatedAt: new Date().toISOString(),
  };
}

export function assertDropFeatureEnabled(feature: DropFeatureKey) {
  const state = getDropFeatureState();
  if (!state.flags[feature]) {
    const error = new Error(`A(z) ${feature} DIMPRO Drop funkció még nincs aktiválva.`);
    Object.assign(error, { code: "DROP_FEATURE_DISABLED", status: 503 });
    throw error;
  }
  return state;
}
