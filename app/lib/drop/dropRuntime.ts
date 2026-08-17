import { getMailProfilesSafeConfig } from "@/app/lib/license/mail-profiles";
import { getDimproIdentitySchemaHealth } from "@/app/lib/identity-core/repository";
import { isIdentityCoreEnabled } from "@/app/lib/identity-core/security";
import { getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { getDriveObjectStorageDatabaseHealth } from "@/app/lib/drive-core/storageRepository";
import { getDropFeatureState } from "./dropFeatureFlags";
import { isDropTokenSecurityConfigured } from "./dropCrypto";
import { getDropSchemaHealth } from "./dropRepository";
import { getDropSpacePackageSchemaHealth, getDropSpacesSchemaHealth } from "./dropSpaceRepository";
import { getDropStorageConfig, getDropStorageSafeStatus } from "./storage/dropStorageConfig";
import { getDropStorageSchemaHealth } from "./storage/dropStorageRepository";
import { getClamdHealth } from "./worker/clamdInstream";
import { getDropWorkerConfig, getDropWorkerSafeStatus } from "./worker/dropWorkerConfig";
import { getDropWorkerSchemaHealth } from "./worker/dropWorkerRepository";
import { getDropRobotGuardSafeStatus } from "./robot/dropRobotGuard";
import { getDropPublicStateSafe } from "./public/dropPublicRepository";

function hasEnv(key: string) {
  const value = process.env[key]?.trim();
  return Boolean(value && !value.includes("<") && !value.includes(">"));
}

export async function getDropRuntimeHealth() {
  const featureState = getDropFeatureState();
  const storageConfig = getDropStorageConfig();
  const storageStatus = getDropStorageSafeStatus(storageConfig);
  const workerConfig = getDropWorkerConfig();
  const driveArchiveStorage = getDriveObjectStorageSafeStatus();
  const [schema, spacesSchema, storageSchema, workerSchema, driveArchiveDatabase, mailConfig, scannerHealth, publicWorkflowState, identityCoreHealth] = await Promise.all([
    getDropSchemaHealth(),
    getDropSpacesSchemaHealth().catch(() => ({ ready: false, checks: [], marker: null })),
    getDropStorageSchemaHealth().catch(() => ({ ready: false, checks: {}, marker: null, errors: [] })),
    getDropWorkerSchemaHealth().catch(() => ({ ready: false, checks: {}, marker: null, errors: [] })),
    getDriveObjectStorageDatabaseHealth().catch(() => ({ ready: false, configured: false, errorCode: "DRIVE_OBJECT_HEALTH_FAILED" })),
    getMailProfilesSafeConfig().catch(() => null),
    workerConfig.enabled
      ? getClamdHealth(workerConfig).catch(() => null)
      : Promise.resolve(null),
    getDropPublicStateSafe().catch(() => null),
    getDimproIdentitySchemaHealth().catch(() => null),
  ]);
  const spacePackageSchema = await getDropSpacePackageSchemaHealth().catch(() => ({ ready: false, spaces: spacesSchema }));
  const databaseConfigured = hasEnv("NEXT_PUBLIC_SUPABASE_URL") && hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenSecurityReady = isDropTokenSecurityConfigured();
  const scannerReady = Boolean(scannerHealth?.ping === "PONG");
  const workerReady = Boolean(workerConfig.enabled && workerSchema.ready && scannerReady);
  const driveMailProfile = mailConfig?.profiles.find((profile) => profile.id === "drive");
  const emailNotificationsReady = Boolean(
    featureState.flags.emailNotificationsEnabled
      && driveMailProfile?.enabled
      && driveMailProfile.smtpConfigured,
  );
  const spacesReady = Boolean(featureState.flags.spacesEnabled && spacesSchema.ready);
  const spacePackageCreationReady = Boolean(
    featureState.flags.spacePackageCreationEnabled
      && featureState.flags.packageEngineEnabled
      && spacesReady
      && spacePackageSchema.ready,
  );
  const storageCoreReady = Boolean(
    featureState.flags.storageCoreEnabled
      && storageSchema.ready
      && storageStatus.storageConfigured,
  );
  const quarantineUploadReady = Boolean(
    featureState.flags.quarantineUploadEnabled
      && storageCoreReady
      && storageStatus.objectWriteEnabled
      && storageConfig.mode !== "disabled",
  );
  const markerVersion = storageSchema.marker?.schema_version || "";
  const resumableUploadReady = Boolean(
    featureState.flags.resumableUploadEnabled
      && quarantineUploadReady
      && storageSchema.ready
      && ["DROP 0.3.4", "DROP 0.4.0", "DROP 0.5.0"].includes(markerVersion),
  );
  const publicUploadReady = Boolean(
    featureState.uploadEnabled
      && storageCoreReady
      && workerReady
      && storageConfig.mode === "active",
  );
  const publicDownloadReady = Boolean(
    storageStatus.publicDownloadReady
      && storageCoreReady
      && workerReady,
  );
  const driveArchiveReady = Boolean(
    featureState.flags.driveArchiveEnabled
      && driveArchiveDatabase.ready
      && driveArchiveStorage.storageConfigured
      && driveArchiveStorage.objectWriteEnabled,
  );
  const publicStore = publicWorkflowState?.store;
  const publicWorkflowReady = Boolean(publicWorkflowState && publicStore);
  const publicWorkflowPostgresReady = Boolean(publicStore?.activeStore === "postgresql" && publicStore.schemaReady);
  const identityCoreEnabled = isIdentityCoreEnabled();
  const identityCoreSecretsReady = [
    "DIMPRO_SEND_CODE_PEPPER",
    "DIMPRO_ACCESS_HASH_PEPPER",
    "DIMPRO_SEND_SESSION_SECRET",
    "DIMPRO_SEND_SESSION_TTL_SECONDS",
  ].every(hasEnv);
  const identityCoreConsumerReady = Boolean(
    identityCoreEnabled
      && identityCoreSecretsReady
      && identityCoreHealth?.ready
      && publicWorkflowPostgresReady,
  );
  const coreReady = Boolean(
    featureState.flags.packageEngineEnabled
      && featureState.flags.accessGateEnabled
      && databaseConfigured
      && schema.ready
      && tokenSecurityReady,
  );

  return {
    ok: true as const,
    service: "DIMPRO Drop",
    version: "DROP 1.2.13",
    stage: featureState.stage,
    timestamp: new Date().toISOString(),
    publicBaseUrl: process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu",
    coreEnabled: featureState.coreEnabled,
    coreReady,
    uploadEnabled: featureState.uploadEnabled,
    featureGate: {
      releaseGateEnabled: featureState.releaseGateEnabled,
      flags: featureState.flags,
    },
    readiness: {
      databaseConfigured,
      databaseSchema: schema.ready,
      objectStorage: storageStatus.storageConfigured,
      storageSchema: storageSchema.ready,
      workerSchema: workerSchema.ready,
      storageCore: storageCoreReady,
      quarantineUpload: quarantineUploadReady,
      resumableUpload: resumableUploadReady,
      hetznerStorageConfigured: storageStatus.s3Configured,
      virusScanner: scannerReady,
      publicDownload: publicDownloadReady,
      tokenSecurity: tokenSecurityReady,
      worker: workerReady,
      packageEngine: coreReady,
      publicAccessGate: coreReady,
      emailNotifications: emailNotificationsReady,
      spacesSchema: spacesSchema.ready,
      spacesEngine: spacesReady,
      spacePackageSchema: spacePackageSchema.ready,
      spacePackageCreation: spacePackageCreationReady,
      publicUpload: publicUploadReady,
      driveArchive: driveArchiveReady,
      driveArchiveDatabase: driveArchiveDatabase.ready,
      driveArchiveObjectStorage: driveArchiveStorage.storageConfigured,
      mobilePwa: featureState.flags.imageDropEnabled,
      mobileBottomDock: true,
      mobileUploadLauncher: true,
      screenWakeLock: true,
      offlineQueue: true,
      offlineQueueTokenless: true,
      networkMonitor: true,
      publicSessionResume: true,
      multipartResumeAfterReload: resumableUploadReady,
      pwaUpdateNotification: true,
      localCompletionNotification: true,
      backgroundSyncWakeup: true,
      repeatedMobileCameraCapture: true,
      emailInlineImagePreviews: true,
      emailClientValidationAdminTool: true,
      emailClientValidationUsesProductionTemplate: true,
      packageZipDownload: true,
      packageZipStreaming: true,
      packageZipPersistentStorage: false,
      mobileGalleryUpload: featureState.flags.imageDropEnabled && quarantineUploadReady,
      imageGrouping: featureState.flags.imageDropEnabled && spacesSchema.ready,
      packageDrop: coreReady && publicUploadReady,
      submissionGate: Boolean(featureState.flags.submissionGateEnabled && coreReady && publicUploadReady && emailNotificationsReady && publicWorkflowReady),
      dimproSend: Boolean(featureState.flags.sendEnabled && coreReady && publicUploadReady && emailNotificationsReady && publicWorkflowReady && identityCoreConsumerReady),
      identityCoreConsumer: identityCoreConsumerReady,
      identityCoreSchema: Boolean(identityCoreHealth?.ready),
      identityCoreSecrets: identityCoreSecretsReady,
      hexUpload: Boolean(featureState.flags.hexUploadEnabled),
      publicWorkflowStore: publicWorkflowReady,
      publicWorkflowPostgres: publicWorkflowPostgresReady,
      publicWorkflowMigrationRequired: Boolean(publicStore?.migrationRequired),
      operationsMonitor: Boolean(publicWorkflowPostgresReady && workerReady),
      operationsHistory: true,
      operationsAlerts: true,
      deepStorageAudit: Boolean(storageStatus.s3Configured),
      driveArchiveSeparateBucket: Boolean(
        driveArchiveStorage.storageConfigured
          && driveArchiveStorage.bucketConfigured
          && driveArchiveStorage.credentialsConfigured
          && driveArchiveStorage.mode !== "disabled"
          && storageConfig.bucket !== process.env.DIMPRO_DRIVE_S3_BUCKET?.trim(),
      ),
    },
    database: {
      provider: databaseConfigured ? "supabase-postgresql" : "not-configured",
      schema,
      spacesSchema,
      spacePackageSchema,
      storageSchema,
      workerSchema,
      migrationMode: markerVersion === "DROP 0.5.0" && workerSchema.ready
        ? "drop-050-malware-retention-download-ready"
        : markerVersion === "DROP 0.4.0" && storageSchema.ready
          ? "drop-040-private-s3-ready"
          : markerVersion === "DROP 0.3.4" && storageSchema.ready
            ? "drop-034-resumable-upload-ready"
            : storageSchema.ready
              ? "drop-033-private-storage-ready"
              : spacePackageSchema.ready
                ? "drop-032-space-packages-ready"
                : schema.ready && spacesSchema.ready
                  ? "drop-030-spaces-ready"
                  : schema.ready
                    ? "drop-020-core-ready"
                    : "manual-sql-required",
    },
    storage: {
      provider: storageConfig.provider,
      mode: storageConfig.mode,
      bucket: storageConfig.bucket,
      maxUploadBytes: storageConfig.maxUploadBytes,
      maxFileBytes: storageConfig.maxFileBytes,
      maxPartBytes: storageConfig.maxPartBytes,
      chunkSizeBytes: storageConfig.chunkSizeBytes,
      configured: storageStatus.storageConfigured,
      hetznerConfigured: storageStatus.s3Configured,
      credentialIsolationReady: storageStatus.credentialIsolationReady,
      signedUrlTtlSeconds: storageConfig.signedUrlTtlSeconds,
      scannerAvailable: scannerReady,
      localRootExposed: false,
    },
    robotProtection: getDropRobotGuardSafeStatus(),
    identityCore: {
      enabled: identityCoreEnabled,
      schemaReady: Boolean(identityCoreHealth?.ready),
      secretsReady: identityCoreSecretsReady,
      consumerReady: identityCoreConsumerReady,
      schemaVersion: identityCoreHealth?.marker?.schemaVersion || null,
      bootstrapId: identityCoreHealth?.marker?.bootstrapId || null,
      rawSecretsExposed: false,
      parallelDropIdentityStore: false,
      legacySendCodesAutoLinked: false,
    },
    publicWorkflows: {
      enabled: Boolean(featureState.flags.submissionGateEnabled || featureState.flags.sendEnabled),
      storeReady: publicWorkflowReady,
      activeStore: publicStore?.activeStore || null,
      requestedStoreMode: publicStore?.requestedMode || null,
      postgresSchemaReady: Boolean(publicStore?.schemaReady),
      migrationRequired: Boolean(publicStore?.migrationRequired),
      failClosed: Boolean(publicStore?.failClosed),
      multiInstanceReady: Boolean(publicStore?.multiInstanceReady),
      storeReason: publicStore?.reason || null,
      fileCounts: publicStore?.fileCounts || null,
      postgresCounts: publicStore?.postgresCounts || null,
      sqlBootstrapPath: publicStore?.sqlBootstrapPath || null,
      sendCodeCount: publicWorkflowState?.sendCodes.length || 0,
      submissionGateCount: publicWorkflowState?.gates.length || 0,
      activeSessions: publicWorkflowState?.activeSessions || 0,
      maxPackageBytes: 262_144_000,
      rawCodesExposed: false,
      rawSessionTokensPersisted: false,
      emailInlineImagePreviews: true,
      emailPreviewMaxImages: 20,
      emailPreviewUsesCidAttachments: true,
      originalFilesAttachedToDeliveryEmail: false,
      packageZipDownload: {
        enabled: true,
        streaming: true,
        maximumFiles: 500,
        maximumSourceBytes: 2_147_483_648,
        persistentArchiveCreated: false,
        originalFilesRecompressed: false,
        individualDownloadRemainsAvailable: true,
        requiresCleanFiles: true,
        requiresDownloadPinProofWhenConfigured: true,
      },
      emailClientValidation: {
        enabled: true,
        adminOnly: true,
        explicitRecipientRequired: true,
        confirmationPhrase: "TESZT",
        sameRecipientCooldownSeconds: 60,
        maximumDailyTestEmails: 20,
        usesProductionTemplate: true,
        usesCidInlineAttachments: true,
        originalFilesAttached: false,
        realPackageAccessGranted: false,
        publicEndpoint: false,
      },
    },
    operations: {
      enabled: true,
      adminOnly: true,
      monitorIntervalMinutes: 15,
      historyLimit: 240,
      deepStorageAuditMaxObjects: 1000,
      deepStorageHeadSample: 25,
      duplicateAlertThrottleHours: 6,
      notificationCenterEnabled: true,
      emailAlertsConfigured: Boolean(mailConfig?.testRecipients?.length),
      rawIpAddressesExposed: false,
      rawObjectKeysExposed: false,
    },
    mobilePwa: {
      enabled: featureState.flags.imageDropEnabled,
      manifest: "/drop.webmanifest",
      serviceWorker: "/drop-sw.js",
      galleryMultipleSelection: true,
      cameraCapture: true,
      repeatedCameraSessions: true,
      cameraInputRecreatedAfterCapture: true,
      clientSideImageOptimization: true,
      groupAssignment: true,
      privateResponseCaching: false,
      bottomDock: true,
      centralHexUploadLauncher: true,
      safeAreaInsets: true,
      keyboardAwareDock: true,
      modalAwareDock: true,
      screenWakeLock: true,
      screenWakeLockManualToggle: true,
      screenWakeLockAutomaticDuringUpload: true,
      screenWakeLockReacquireOnVisibility: true,
      unsupportedWakeLockSafeFallback: true,
      onlineOfflineIndicator: true,
      serverReachabilityProbe: "/api/drop/public/ping",
      indexedDbQueue: "dimpro-drop-offline-v098",
      indexedDbStoresRawCredentials: false,
      persistentStorageRequest: true,
      multipartCheckpointResume: true,
      publicSessionCookieResume: true,
      serviceWorkerUpdatePrompt: true,
      backgroundSyncWakeupOnly: true,
      localCompletionNotification: true,
      physicalIosAndroidValidationPending: true,
    },
    driveArchive: {
      enabled: featureState.flags.driveArchiveEnabled,
      ready: driveArchiveReady,
      databaseReady: driveArchiveDatabase.ready,
      storageConfigured: driveArchiveStorage.storageConfigured,
      objectWriteEnabled: driveArchiveStorage.objectWriteEnabled,
      driveMode: driveArchiveStorage.mode,
      separateBucket: storageConfig.bucket !== process.env.DIMPRO_DRIVE_S3_BUCKET?.trim(),
      credentialsExposed: false,
    },
    worker: {
      ...getDropWorkerSafeStatus(workerConfig),
      schemaReady: workerSchema.ready,
      scannerPing: scannerHealth?.ping || null,
      scannerEngine: scannerHealth?.version.engine || null,
      scannerEngineVersion: scannerHealth?.version.engineVersion || null,
      scannerSignatureVersion: scannerHealth?.version.signatureVersion || null,
    },
    safety: {
      anonymousPackageCreation: false,
      unboundPublicUpload: false,
      publicSendRequiresCode: true,
      publicSendUsesCentralIdentityCore: identityCoreConsumerReady,
      parallelDropUserLicenseProjectStore: false,
      legacySendCodeAutoMigration: false,
      submissionRequiresGateLink: true,
      publicWorkflowConfigurationEncryptedAtRest: false,
      publicWorkflowConfigurationCentralized: publicWorkflowPostgresReady,
      publicWorkflowConfigurationProtectedByFilePermissionsAndHashedSecrets: publicStore?.activeStore === "file",
      publicWorkflowFailClosedAfterPostgresActivation: Boolean(publicStore?.failClosed),
      publicWorkflowMultiInstanceReady: publicWorkflowPostgresReady,
      demoUploadApiEnabled: false,
      secretsExposed: false,
      rawTokensPersisted: false,
      unfinishedFeaturesRejectedByApi: true,
      fileUploadStillDisabled: !publicUploadReady,
      quarantineUploadOnly: quarantineUploadReady && storageConfig.mode === "quarantine",
      quarantinedFilesDownloadable: false,
      virusScannerRequiredForRelease: true,
      cleanScanRequiredForDownload: true,
      retentionDeletionBlockedUntilFinalReport: workerConfig.reportDeletionGateEnabled,
      retentionDeletionBlockedUntilRequiredDriveArchive: featureState.flags.driveArchiveEnabled,
      dropAndDriveCredentialsIsolated: storageStatus.credentialIsolationReady,
      pwaCachesPrivateApiResponses: false,
      pwaCachesPrivateFiles: false,
      pwaPerformsSecretBearingBackgroundUpload: false,
      indexedDbStoresRawUploadCapability: false,
      indexedDbStoresRawSessionToken: false,
      indexedDbStoresSendCodeOrPin: false,
      resumeCapabilityReissuedFromHttpOnlySession: true,
      emailPreviewReadsPrivateObjectStorageServerSide: true,
      emailPreviewUsesPublicObjectUrl: false,
      originalFilesAttachedToDeliveryEmail: false,
      invitationEmailUsesOneTimeSecrets: true,
      uploadIntentRequired: true,
      serverTimedHumanGate: true,
      honeypotRobotTrap: true,
    },
  };
}
