import { NextResponse } from "next/server";
import { getFieldCaptureFeatureState } from "@/app/lib/field-capture/featureFlags";
import { getFieldCaptureServerSchemaReadiness } from "@/app/lib/field-capture/serverRepository";
import { getFieldCaptureDropUploadReadiness } from "@/app/lib/field-capture/dropUploadAdapter";
import { getFieldCaptureUserDriveReadiness } from "@/app/lib/field-capture/userDriveService";
import { getFieldCaptureProjectDriveContentReadiness } from "@/app/lib/field-capture/projectDriveService";
import { getFieldCaptureStagingReadiness } from "@/app/lib/field-capture/stagingPackageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const feature = getFieldCaptureFeatureState();
  const [schema, upload, userDrive, projectDriveContent, staging] = await Promise.all([
    getFieldCaptureServerSchemaReadiness().catch(() => ({
      ready: false,
      markerReady: false,
      checks: {},
    })),
    getFieldCaptureDropUploadReadiness().catch(() => ({
      ready: false,
      uploadReady: false,
      quarantineUploadReady: false,
      resumableUploadReady: false,
      storageProvider: "disabled",
      maxFileBytes: 0,
      chunkSizeBytes: 0,
      packageBindingMode: "EXISTING_ENTITLEMENT_PACKAGE" as const,
      rawTokenPersistence: false,
    })),
    getFieldCaptureUserDriveReadiness().catch(() => ({
      ready: false,
      contentCoreReady: false,
      storageReady: false,
      storageMode: "disabled" as const,
      userDriveWriteEnabled: false,
      bucketConfigured: false,
      ownership: "USER" as const,
      scope: "USER_ROOT" as const,
      independentRetention: true,
      requiresCleanDropObject: true,
    })),
    getFieldCaptureProjectDriveContentReadiness().catch(() => ({
      ready: false,
      contentCoreReady: false,
      canonicalProjectCore: false,
      projectCoreProvider: "unknown",
      storageReady: false,
      storageMode: "disabled" as const,
      projectContentWriteEnabled: false,
      bucketConfigured: false,
      ownership: "PROJECT" as const,
      scope: "PROJECT_ROOT" as const,
      independentRetention: true,
      requiresCleanDropObject: true,
      requiresProjectMembership: true,
      requiresDocumentWrite: true,
      projectDriveTreeBound: false,
      uiEnabled: false,
      stage: "P9.1" as const,
    })),
    getFieldCaptureStagingReadiness().catch(() => ({
      ready: false,
      markerReady: false,
      tableReady: false,
      retentionDays: 7,
      rawCapabilitiesPersisted: false,
      publicDeliveryWorkflow: false,
    })),
  ]);
  return NextResponse.json({
    ...feature,
    readiness: {
      route: true,
      localCapture: true,
      sharedImageEngine: true,
      offlineQueue: true,
      sharedBrowserVoice: true,
      phoneSave: true,
      serverCaptureSchema: schema.ready,
      serverUploadBinding: schema.ready && upload.ready,
      serverUploadAdapter: upload.ready,
      serverUploadPackageBinding: "SEND_OR_FIELD_CAPTURE_STAGING",
      stagingPackageBinding: schema.ready && staging.ready,
      stagingRetentionDays: staging.retentionDays,
      stagingPublicDeliveryWorkflow: false,
      stagingRawCapabilitiesPersisted: false,
      serverUploadRawTokenPersistence: false,
      gpsAdapter: true,
      orientationAdapter: true,
      cameraVectorHeading: true,
      imageMarkupEditor: true,
      localWorkflow: true,
      userDriveBinding: schema.ready && upload.ready && userDrive.ready,
      userDriveOwnership: "USER",
      userDriveScope: "USER_ROOT",
      userDriveIndependentRetention: true,
      userDriveRequiresCleanDropObject: true,
      projectDriveContentBinding: schema.ready && upload.ready && projectDriveContent.ready,
      projectDriveContentOwnership: "PROJECT",
      projectDriveContentScope: "PROJECT_ROOT",
      projectDriveTreeBinding: false,
      projectDriveUiEnabled: false,
      projectDriveBinding: false,
    },
    serverSchema: schema,
    serverUpload: upload,
    userDrive,
    projectDriveContent,
    staging,
  }, { status: feature.enabled ? 200 : 503 });
}
