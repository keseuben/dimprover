import { NextResponse } from "next/server";
import { getFieldCaptureFeatureState } from "@/app/lib/field-capture/featureFlags";
import { getFieldCaptureServerSchemaReadiness } from "@/app/lib/field-capture/serverRepository";
import { getFieldCaptureDropUploadReadiness } from "@/app/lib/field-capture/dropUploadAdapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const feature = getFieldCaptureFeatureState();
  const [schema, upload] = await Promise.all([
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
      serverUploadPackageBinding: "EXISTING_ENTITLEMENT_PACKAGE",
      serverUploadRawTokenPersistence: false,
      gpsAdapter: true,
      orientationAdapter: true,
      cameraVectorHeading: true,
      imageMarkupEditor: true,
      localWorkflow: true,
      userDriveBinding: false,
      projectDriveBinding: false,
    },
    serverSchema: schema,
    serverUpload: upload,
  }, { status: feature.enabled ? 200 : 503 });
}
