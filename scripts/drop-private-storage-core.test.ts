import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import {
  inspectDropIncomingFile,
  sanitizeDropFileName,
} from "../app/lib/drop/storage/dropFileSecurity";
import {
  createDropStorageKey,
  moveDropFileToQuarantine,
  removeDropStoredFile,
  streamDropIncomingFile,
} from "../app/lib/drop/storage/dropLocalStorage";
import { ensureDropLocalStorage, getDropStorageConfig, getDropStorageSafeStatus } from "../app/lib/drop/storage/dropStorageConfig";
import { createDropUploadSessionToken, verifyDropUploadSessionToken } from "../app/lib/drop/storage/dropUploadToken";

async function expectCode(action: () => unknown | Promise<unknown>, code: string) {
  try {
    await action();
    assert.fail(`A műveletnek hibával kellett volna leállnia: ${code}`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

function toWebStream(buffer: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

async function main() {
  const root = path.resolve(`.work_drop_v033_storage_core_${Date.now()}`);
  process.env.DROP_STORAGE_PROVIDER = "local-private";
  process.env.DROP_STORAGE_MODE = "quarantine";
  process.env.DROP_STORAGE_LOCAL_ROOT = root;
  process.env.DROP_STORAGE_BUCKET = "test-private-bucket";
  process.env.DROP_MAX_STREAM_UPLOAD_MB = "5";
  process.env.DROP_TOKEN_PEPPER ||= "drop-private-storage-core-test-secret-that-is-at-least-thirty-two-bytes";

  const packageId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "33333333-3333-4333-8333-333333333333";
  let cleanupCompleted = false;
  try {
    const config = getDropStorageConfig();
    await ensureDropLocalStorage(config);
    const safeStatus = getDropStorageSafeStatus(config);
    assert.equal(safeStatus.localConfigured, true);
    assert.equal(safeStatus.storageConfigured, true);
    assert.equal(safeStatus.publicDownloadReady, false);

    const safeName = sanitizeDropFileName("  Műszaki terv 01.PDF  ");
    assert.equal(safeName.extension, "pdf");
    assert.match(safeName.safeStem, /Műszaki terv 01/);
    await expectCode(() => sanitizeDropFileName("virus.exe"), "DROP_FILE_EXTENSION_BLOCKED");
    await expectCode(() => sanitizeDropFileName("ismeretlen.xyz"), "DROP_FILE_EXTENSION_NOT_ALLOWED");

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const uploadToken = createDropUploadSessionToken({ sessionId, fileId, packageId, expiresAt });
    assert.match(uploadToken, /^dup_s_1\./);
    const payload = verifyDropUploadSessionToken(uploadToken);
    assert.equal(payload.sessionId, sessionId);
    assert.equal(payload.fileId, fileId);
    assert.equal(payload.packageId, packageId);
    await expectCode(() => verifyDropUploadSessionToken(`${uploadToken}x`), "DROP_UPLOAD_TOKEN_INVALID");

    const textBuffer = Buffer.from("DIMPRO private storage streaming test\n", "utf8");
    const streamed = await streamDropIncomingFile({
      sessionId,
      body: toWebStream(textBuffer),
      expectedBytes: textBuffer.length,
    });
    assert.equal(streamed.receivedBytes, textBuffer.length);
    assert.equal(streamed.sha256, createHash("sha256").update(textBuffer).digest("hex"));
    const textInspection = await inspectDropIncomingFile({
      filePath: streamed.incomingPath,
      extension: "txt",
      expectedBytes: textBuffer.length,
    });
    assert.match(textInspection.detectedMimeType, /^text\//);
    assert.equal(textInspection.zipScanStatus, "not_applicable");
    const storageKey = createDropStorageKey({ packageId, fileId, generatedName: "test.txt" });
    const moved = await moveDropFileToQuarantine({ sessionId, storageKey });
    assert.equal(moved.sizeBytes, textBuffer.length);
    assert.equal((await stat(moved.quarantinePath)).isFile(), true);

    const zip = new JSZip();
    zip.file("tervek/A01.txt", "biztonsagos tartalom");
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const zipSessionId = "44444444-4444-4444-8444-444444444444";
    const zipStreamed = await streamDropIncomingFile({
      sessionId: zipSessionId,
      body: toWebStream(zipBuffer),
      expectedBytes: zipBuffer.length,
    });
    const zipInspection = await inspectDropIncomingFile({
      filePath: zipStreamed.incomingPath,
      extension: "zip",
      expectedBytes: zipBuffer.length,
    });
    assert.equal(zipInspection.zipScanStatus, "passed");
    assert.equal(zipInspection.zipEntryCount, 2, "A ZIP a könyvtár- és fájlbejegyzést külön számolja.");

    const unsafeZip = new JSZip();
    unsafeZip.file("danger.exe", "MZ");
    const unsafeBuffer = await unsafeZip.generateAsync({ type: "nodebuffer" });
    const unsafeSessionId = "55555555-5555-4555-8555-555555555555";
    const unsafeStreamed = await streamDropIncomingFile({
      sessionId: unsafeSessionId,
      body: toWebStream(unsafeBuffer),
      expectedBytes: unsafeBuffer.length,
    });
    await expectCode(() => inspectDropIncomingFile({
      filePath: unsafeStreamed.incomingPath,
      extension: "zip",
      expectedBytes: unsafeBuffer.length,
    }), "DROP_ZIP_BLOCKED_CONTENT");

    await expectCode(() => Promise.resolve(createDropStorageKey({
      packageId: "../escape",
      fileId,
      generatedName: "test.txt",
    })), "DROP_STORAGE_KEY_INVALID");

    await removeDropStoredFile({ sessionId: zipSessionId });
    await removeDropStoredFile({ sessionId: unsafeSessionId });

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.3-staged",
      localPrivateStorage: true,
      streamByteLimit: true,
      sha256: true,
      mimeDetection: true,
      safeZipAccepted: true,
      blockedZipRejected: true,
      pathTraversalRejected: true,
      publicDownloadReady: false,
      virusScannerAvailable: false,
    }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
    cleanupCompleted = true;
    console.log(JSON.stringify({ cleanupCompleted, testStorageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
