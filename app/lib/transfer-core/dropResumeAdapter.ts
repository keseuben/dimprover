"use client";

import {
  uploadDropInitialized,
  type DropInitializedUpload,
  type DropUploadCheckpoint,
} from "@/components/drop/dropMultipartClient";
import {transferResumeCapability} from "./retryPolicy.mjs";

/**
 * Drop already has a checkpointed multipart upload. This adapter preserves its
 * established token, signed-part and checksum logic; it only normalizes events
 * for the shared Transfer Center. Do not use it for Drive uploads until Drive
 * gains an equivalent authenticated multipart protocol.
 */
export async function transferExistingDropUpload(input: {
  initialized:DropInitializedUpload;
  file:File;
  signal:AbortSignal;
  onProgress:(percent:number,detail:string)=>void;
  onCheckpoint?:(checkpoint:DropUploadCheckpoint)=>void|Promise<void>;
  onNetworkStatus?:(detail:string)=>void;
}) {
  const capability=transferResumeCapability(input.initialized.protocol || "single",
    Boolean(input.initialized.session.totalParts && input.initialized.session.chunkSizeBytes));
  const result=await uploadDropInitialized({
    initialized:input.initialized,
    file:input.file,
    signal:input.signal,
    onProgress:input.onProgress,
    onCheckpoint:input.onCheckpoint,
    onNetworkState:input.onNetworkStatus,
  });
  return {...result,capability};
}
