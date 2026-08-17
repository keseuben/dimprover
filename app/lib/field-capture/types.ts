export const FIELD_CAPTURE_VERSION = "0.1.0-dev";
export const FIELD_CAPTURE_MAX_ITEMS = 200;

export type FieldCaptureTranscriptMode = "raw" | "cleaned";

export type PreCaptureOptions = {
  gpsEnabled: boolean;
  orientationEnabled: boolean;
  voiceNoteEnabled: boolean;
  transcriptMode: FieldCaptureTranscriptMode;
  saveToDevice: boolean;
  saveToUserDrive: boolean;
  saveToProjectDrive: boolean;
  rememberForSession: boolean;
};

export const DEFAULT_PRE_CAPTURE_OPTIONS: PreCaptureOptions = {
  gpsEnabled: false,
  orientationEnabled: false,
  voiceNoteEnabled: false,
  transcriptMode: "cleaned",
  saveToDevice: false,
  saveToUserDrive: false,
  saveToProjectDrive: false,
  rememberForSession: false,
};

export type FieldCaptureSyncState =
  | "LOCAL_ONLY"
  | "QUEUED"
  | "UPLOADING"
  | "SERVER_STORED"
  | "DESTINATION_PENDING"
  | "SYNCED"
  | "ERROR";

export type FieldCaptureLocationStatus = "OFF" | "REQUESTING" | "READY" | "UNAVAILABLE" | "DENIED" | "LOW_ACCURACY";
export type FieldCaptureOrientationStatus = "OFF" | "REQUESTING" | "READY" | "UNAVAILABLE" | "DENIED" | "UNSTABLE";

export type FieldCaptureLocalSession = {
  id: string;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  status: "ACTIVE" | "CLOSED";
};

export type FieldCaptureItem = {
  id: string;
  sessionId: string;
  sequence: number;
  capturedAt: string;
  originalName: string;
  displayName: string;
  originalSize: number;
  uploadSize: number;
  optimized: boolean;
  optimizationNote: string;
  width: number | null;
  height: number | null;
  previewUrl: string | null;
  uploadFile: File;
  originalFile: File;
  note: string;
  voiceTranscript: string;
  status: FieldCaptureSyncState;
  progress: number;
  error: string | null;
  options: PreCaptureOptions;
  locationStatus: FieldCaptureLocationStatus;
  orientationStatus: FieldCaptureOrientationStatus;
};

export type CaptureDestinationTarget = "CAPTURE" | "DEVICE" | "USER_DRIVE" | "PROJECT_DRIVE";
export type CaptureDestination = {
  target: CaptureDestinationTarget;
  enabled: boolean;
  ready: boolean;
  detail: string;
};
