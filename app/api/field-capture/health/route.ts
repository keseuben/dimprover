import { NextResponse } from "next/server";
import { getFieldCaptureFeatureState } from "@/app/lib/field-capture/featureFlags";
import { getFieldCaptureServerSchemaReadiness } from "@/app/lib/field-capture/serverRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const feature = getFieldCaptureFeatureState();
  const schema = await getFieldCaptureServerSchemaReadiness().catch(() => ({
    ready: false,
    markerReady: false,
    checks: {},
  }));
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
      serverUploadBinding: false,
      gpsAdapter: true,
      orientationAdapter: true,
      cameraVectorHeading: true,
      imageMarkupEditor: true,
      localWorkflow: true,
      userDriveBinding: false,
      projectDriveBinding: false,
    },
    serverSchema: schema,
  }, { status: feature.enabled ? 200 : 503 });
}
