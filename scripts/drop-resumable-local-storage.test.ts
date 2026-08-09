import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  assembleDropUploadParts,
  listDropLocalPartNumbers,
  removeDropMultipartSession,
  statDropUploadPart,
  streamDropUploadPart,
} from "../app/lib/drop/storage/dropMultipartLocalStorage";

function toWebStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return Readable.toWeb(Readable.from(buffer)) as ReadableStream<Uint8Array>;
}

async function main() {
  const sessionId = randomUUID();
  const root = process.env.DROP_STORAGE_LOCAL_ROOT || "/root/dimprover/.data/drop-storage-v034-local-test";
  const parts = [
    Buffer.from("DIMPRO-DROP-PART-ONE\n".repeat(7_000), "utf8"),
    Buffer.from("DIMPRO-DROP-PART-TWO\n".repeat(5_000), "utf8"),
    Buffer.from("DIMPRO-DROP-PART-THREE\n".repeat(3_000), "utf8"),
  ];
  const expected = Buffer.concat(parts);
  try {
    const first = await streamDropUploadPart({ sessionId, partNumber: 1, body: toWebStream(parts[0]), expectedBytes: parts[0].length });
    assert.equal(first.receivedBytes, parts[0].length);
    assert.equal(first.sha256, createHash("sha256").update(parts[0]).digest("hex"));

    const resumedBefore = await listDropLocalPartNumbers(sessionId);
    assert.deepEqual(resumedBefore, [1]);

    await streamDropUploadPart({ sessionId, partNumber: 2, body: toWebStream(parts[1]), expectedBytes: parts[1].length });
    await streamDropUploadPart({ sessionId, partNumber: 3, body: toWebStream(parts[2]), expectedBytes: parts[2].length });
    assert.deepEqual(await listDropLocalPartNumbers(sessionId), [1, 2, 3]);
    assert.equal((await statDropUploadPart(sessionId, 2)).sizeBytes, parts[1].length);

    const assembled = await assembleDropUploadParts({ sessionId, totalParts: parts.length, expectedBytes: expected.length });
    assert.equal(assembled.receivedBytes, expected.length);
    assert.equal(assembled.sha256, createHash("sha256").update(expected).digest("hex"));
    assert.deepEqual(await readFile(assembled.incomingPath), expected);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4-staged",
      interruptedAfterParts: 1,
      resumedMissingParts: 2,
      totalParts: parts.length,
      assembledBytes: assembled.receivedBytes,
      finalSha256: assembled.sha256,
      contentMatches: true,
    }, null, 2));
  } finally {
    await removeDropMultipartSession(sessionId).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    console.log(JSON.stringify({ cleanupCompleted: true, testStorageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
