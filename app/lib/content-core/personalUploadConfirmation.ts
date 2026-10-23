/**
 * Read-only personal upload acknowledgement policy.
 *
 * Never infer that a request failed solely because its ref is not yet visible:
 * an in-flight request may still commit after the status read.
 */
export type PersonalUploadConfirmation =
  | { ok: true; state: "VERIFIED_CLEAN"; contentRefId: string; sizeBytes: number; retryAllowed: false }
  | { ok: true; state: "PENDING_OR_NOT_FOUND"; retryAllowed: false }
  | { ok: false; state: "OBJECT_UNVERIFIED"; retryAllowed: false };

type ReceiptObject = {
  id: string; sha256: string; size_bytes: number;
  storage_provider: string; storage_bucket: string; storage_key: string;
  security_status: string; virus_scan_status: string; status: string;
};
type Receipt = { contentRefId: string; object: ReceiptObject | null } | null;

export async function assessPersonalUploadConfirmation(input: {
  ownerUserId: string;
  requestId: string;
  expectedBucket: string;
  findOwnedReceipt: (ownerUserId: string, requestId: string) => Promise<Receipt>;
  hashStoredObject: (bucket: string, key: string) =>
    Promise<{ sha256: string; sizeBytes: number }>;
}): Promise<PersonalUploadConfirmation> {
  const receipt = await input.findOwnedReceipt(input.ownerUserId, input.requestId);
  if (!receipt) return { ok: true, state: "PENDING_OR_NOT_FOUND", retryAllowed: false };
  const object = receipt.object;
  if (!object || object.status !== "ACTIVE"
    || object.security_status !== "clean" || object.virus_scan_status !== "clean"
    || object.storage_provider !== "S3" || object.storage_bucket !== input.expectedBucket
    || !object.storage_key || !/^[a-f0-9]{64}$/i.test(object.sha256)
    || !Number.isSafeInteger(object.size_bytes) || object.size_bytes < 1) {
    return { ok: false, state: "OBJECT_UNVERIFIED", retryAllowed: false };
  }
  const saved = await input.hashStoredObject(object.storage_bucket, object.storage_key);
  if (!Number.isSafeInteger(saved.sizeBytes) || saved.sizeBytes !== object.size_bytes
    || saved.sha256.toLowerCase() !== object.sha256.toLowerCase()) {
    return { ok: false, state: "OBJECT_UNVERIFIED", retryAllowed: false };
  }
  return { ok: true, state: "VERIFIED_CLEAN", contentRefId: receipt.contentRefId,
    sizeBytes: object.size_bytes, retryAllowed: false };
}
