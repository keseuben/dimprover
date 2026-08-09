import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DropStorageError } from "./dropLocalStorage";
import { ensureDropLocalStorage, getDropStorageConfig, getDropStoragePaths } from "./dropStorageConfig";

function safeId(value: string, label: string) {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new DropStorageError(`Érvénytelen ${label}.`, "DROP_STORAGE_KEY_INVALID", 400);
  return value;
}

function safePartNumber(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new DropStorageError("Érvénytelen feltöltési rész sorszám.", "DROP_UPLOAD_PART_NUMBER_INVALID", 400);
  }
  return value;
}

async function getSessionPartsDirectory(sessionId: string) {
  const config = getDropStorageConfig();
  if (config.provider !== "local-private") {
    throw new DropStorageError("A helyi multipart adapter nem aktív.", "DROP_STORAGE_PROVIDER_UNAVAILABLE", 503);
  }
  await ensureDropLocalStorage(config);
  const root = path.resolve(getDropStoragePaths(config).incoming);
  const directory = path.resolve(root, safeId(sessionId, "feltöltési munkamenet"), "parts");
  if (!directory.startsWith(`${root}${path.sep}`)) throw new DropStorageError("Érvénytelen multipart útvonal.", "DROP_STORAGE_PATH_ESCAPE", 400);
  return directory;
}

export async function getDropPartPath(sessionId: string, partNumber: number) {
  const directory = await getSessionPartsDirectory(sessionId);
  return path.join(directory, `${String(safePartNumber(partNumber)).padStart(5, "0")}.part`);
}

export async function streamDropUploadPart(input: {
  sessionId: string;
  partNumber: number;
  body: ReadableStream<Uint8Array> | null;
  expectedBytes: number;
}) {
  const config = getDropStorageConfig();
  if (!input.body) throw new DropStorageError("A feltöltési rész törzse hiányzik.", "DROP_UPLOAD_BODY_MISSING", 400);
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0 || input.expectedBytes > config.maxPartBytes) {
    throw new DropStorageError("A feltöltési rész mérete nem engedélyezett.", "DROP_UPLOAD_PART_SIZE_INVALID", 413);
  }
  const partPath = await getDropPartPath(input.sessionId, input.partNumber);
  await mkdir(path.dirname(partPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${partPath}.uploading`;
  const hash = createHash("sha256");
  let receivedBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > input.expectedBytes || receivedBytes > config.maxPartBytes) {
        callback(new DropStorageError("A beérkező rész túllépte az engedélyezett méretet.", "DROP_UPLOAD_PART_TOO_LARGE", 413));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(input.body as never),
      counter,
      createWriteStream(temporaryPath, { flags: "w", mode: 0o600 }),
    );
    if (receivedBytes !== input.expectedBytes) {
      throw new DropStorageError(`A rész mérete eltér (${receivedBytes}/${input.expectedBytes} bájt).`, "DROP_UPLOAD_PART_SIZE_MISMATCH", 400);
    }
    await rm(partPath, { force: true });
    const file = await open(temporaryPath, "r");
    await file.sync();
    await file.close();
    await import("node:fs/promises").then(({ rename }) => rename(temporaryPath, partPath));
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return { partPath, receivedBytes, sha256: hash.digest("hex") };
}

export async function statDropUploadPart(sessionId: string, partNumber: number) {
  const partPath = await getDropPartPath(sessionId, partNumber);
  const info = await stat(partPath);
  return { partPath, sizeBytes: info.size };
}

export async function assembleDropUploadParts(input: {
  sessionId: string;
  totalParts: number;
  expectedBytes: number;
}) {
  if (!Number.isSafeInteger(input.totalParts) || input.totalParts < 1 || input.totalParts > 10_000) {
    throw new DropStorageError("A feltöltési részek száma érvénytelen.", "DROP_UPLOAD_PART_COUNT_INVALID", 400);
  }
  await getSessionPartsDirectory(input.sessionId);
  const paths = getDropStoragePaths();
  const assembledPath = path.resolve(paths.incoming, `${safeId(input.sessionId, "feltöltési munkamenet")}.part`);
  const temporaryPath = `${assembledPath}.assembling`;
  await mkdir(path.dirname(assembledPath), { recursive: true, mode: 0o700 });
  const destination = createWriteStream(temporaryPath, { flags: "w", mode: 0o600 });
  const hash = createHash("sha256");
  let totalBytes = 0;
  try {
    for (let partNumber = 1; partNumber <= input.totalParts; partNumber += 1) {
      const partPath = await getDropPartPath(input.sessionId, partNumber);
      const info = await stat(partPath).catch(() => null);
      if (!info?.isFile()) throw new DropStorageError(`Hiányzik a(z) ${partNumber}. feltöltési rész.`, "DROP_UPLOAD_PART_NOT_FOUND", 409);
      await pipeline(
        createReadStream(partPath),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            totalBytes += chunk.length;
            if (totalBytes > input.expectedBytes) {
              callback(new DropStorageError("Az összefűzött fájl túl nagy.", "DROP_UPLOAD_STREAM_TOO_LARGE", 413));
              return;
            }
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        destination,
        { end: partNumber === input.totalParts },
      );
    }
    if (totalBytes !== input.expectedBytes) {
      throw new DropStorageError(`Az összefűzött méret eltér (${totalBytes}/${input.expectedBytes}).`, "DROP_UPLOAD_SIZE_MISMATCH", 400);
    }
    await rm(assembledPath, { force: true });
    await import("node:fs/promises").then(({ rename }) => rename(temporaryPath, assembledPath));
    return { incomingPath: assembledPath, receivedBytes: totalBytes, sha256: hash.digest("hex") };
  } catch (error) {
    destination.destroy();
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removeDropMultipartSession(sessionId: string) {
  const directory = path.dirname(await getSessionPartsDirectory(sessionId));
  await rm(directory, { recursive: true, force: true });
}

export async function listDropLocalPartNumbers(sessionId: string) {
  const directory = await getSessionPartsDirectory(sessionId);
  const names = await readdir(directory).catch(() => []);
  return names
    .filter((name) => /^\d{5}\.part$/.test(name))
    .map((name) => Number.parseInt(name.slice(0, 5), 10))
    .sort((a, b) => a - b);
}
