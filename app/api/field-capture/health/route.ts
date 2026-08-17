import { NextResponse } from "next/server";
import { getFieldCaptureFeatureState } from "@/app/lib/field-capture/featureFlags";

export const dynamic = "force-dynamic";

export async function GET() {
  const feature = getFieldCaptureFeatureState();
  return NextResponse.json({
    ...feature,
    readiness: {
      route: true,
      localCapture: true,
      sharedImageEngine: true,
      offlineQueue: true,
      sharedBrowserVoice: true,
      phoneSave: true,
      serverCaptureSchema: false,
      serverUploadBinding: false,
      gpsAdapter: true,
      orientationAdapter: true,
      cameraVectorHeading: true,
      imageMarkupEditor: true,
      localWorkflow: true,
      userDriveBinding: false,
      projectDriveBinding: false
    }
  }, { status: feature.enabled ? 200 : 503 });
}
