import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ensureDropLocalStorage, getDropStorageConfig, getDropStoragePaths } from "./dropStorageConfig";

export class DropStorageError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.name = "DropStorageError";
    this.code = code;
    this.status = status;
  }
}

function assertSafeSegment(value: string, label: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || value === "." || value === "..") {
    throw new DropStorageError(`Érvénytelen ${label}.`, "DROP_STORAGE_KEY_INVALID", 400);
  }
  return value;
}

export function createDropStorageKey(input: {
  packageId: string;
  fileId: string;
  generatedName: string;
}) {
  return [
    assertSafeSegment(input.packageId, "csomagazonosító"),
    assertSafeSegment(input.fileId, "fájlazonosító"),
    assertSafeSegment(input.generatedName, "generált fájlnév"),
  ].join("/");
}

function resolveWithin(root: string, relativeKey: string) {
  const segments = relativeKey.split("/").filter(Boolean).map((segment) => assertSafeSegment(segment, "tárhelykulcs"));
  if (!segments.length) throw new DropStorageError("Üres tárhelykulcs.", "DROP_STORAGE_KEY_INVALID", 400);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new DropStorageError("A tárhelykulcs kilépne a privát tárhelyből.", "DROP_STORAGE_PATH_ESCAPE", 400);
  }
  return resolved;
}

export async function getDropIncomingPath(sessionId: string) {
  const config = getDropStorageConfig();
  if (config.provider !== "local-private") {
    throw new DropStorageError("A helyi privát tárhelyadapter nem aktív.", "DROP_STORAGE_PROVIDER_UNAVAILABLE", 503);
  }
  await ensureDropLocalStorage(config);
  return resolveWithin(getDropStoragePaths(config).incoming, `${assertSafeSegment(sessionId, "feltöltési munkamenet")}.part`);
}

export async function getDropQuarantinePath(storageKey: string) {
  const config = getDropStorageConfig();
  if (config.provider !== "local-private") {
    throw new DropStorageError("A helyi privát tárhelyadapter nem aktív.", "DROP_STORAGE_PROVIDER_UNAVAILABLE", 503);
  }
  await ensureDropLocalStorage(config);
  return resolveWithin(getDropStoragePaths(config).quarantine, storageKey);
}

export async function streamDropIncomingFile(input: {
  sessionId: string;
  body: ReadableStream<Uint8Array> | null;
  expectedBytes: number;
}) {
  const config = getDropStorageConfig();
  if (config.mode === "disabled") {
    throw new DropStorageError("A privát Drop tárhely ki van kapcsolva.", "DROP_STORAGE_DISABLED", 503);
  }
  if (!input.body) throw new DropStorageError("A feltöltési törzs hiányzik.", "DROP_UPLOAD_BODY_MISSING", 400);
  if (!Number.isFinite(input.expectedBytes) || input.expectedBytes <= 0 || input.expectedBytes > config.maxPartBytes) {
    throw new DropStorageError("A feltöltendő fájl mérete nem engedélyezett.", "DROP_UPLOAD_SIZE_INVALID", 413);
  }

  const incomingPath = await getDropIncomingPath(input.sessionId);
  await mkdir(path.dirname(incomingPath), { recursive: true, mode: 0o700 });
  const hash = createHash("sha256");
  let receivedBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > input.expectedBytes || receivedBytes > config.maxPartBytes) {
        callback(new DropStorageError("A beérkező fájl túllépte az engedélyezett méretet.", "DROP_UPLOAD_STREAM_TOO_LARGE", 413));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    const source = Readable.fromWeb(input.body as never);
    const destination = createWriteStream(incomingPath, { flags: "wx", mode: 0o600 });
    await pipeline(source, counter, destination);
  } catch (error) {
    await rm(incomingPath, { force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException | null)?.code === "EEXIST") {
      throw new DropStorageError("Ehhez a munkamenethez már érkezett fájltartalom.", "DROP_UPLOAD_CONTENT_EXISTS", 409);
    }
    throw error;
  }

  if (receivedBytes !== input.expectedBytes) {
    await rm(incomingPath, { force: true }).catch(() => undefined);
    throw new DropStorageError(
      `A beérkezett fájlméret eltér a megadott mérettől (${receivedBytes}/${input.expectedBytes} bájt).`,
      "DROP_UPLOAD_SIZE_MISMATCH",
      400,
    );
  }

  return {
    incomingPath,
    receivedBytes,
    sha256: hash.digest("hex"),
  };
}

export async function moveDropFileToQuarantine(input: {
  sessionId: string;
  storageKey: string;
}) {
  const incomingPath = await getDropIncomingPath(input.sessionId);
  const quarantinePath = await getDropQuarantinePath(input.storageKey);
  await mkdir(path.dirname(quarantinePath), { recursive: true, mode: 0o700 });
  await rename(incomingPath, quarantinePath);
  const info = await stat(quarantinePath);
  return { quarantinePath, sizeBytes: info.size };
}

export async function removeDropStoredFile(input: {
  sessionId?: string;
  storageKey?: string;
}) {
  if (input.sessionId) {
    const incomingPath = await getDropIncomingPath(input.sessionId).catch(() => null);
    if (incomingPath) await rm(incomingPath, { force: true }).catch(() => undefined);
  }
  if (input.storageKey) {
    const quarantinePath = await getDropQuarantinePath(input.storageKey).catch(() => null);
    if (quarantinePath) await rm(quarantinePath, { force: true }).catch(() => undefined);
  }
}

export async function statDropQuarantineFile(storageKey: string) {
  const quarantinePath = await getDropQuarantinePath(storageKey);
  const info = await stat(quarantinePath);
  return { quarantinePath, sizeBytes: info.size };
}

export async function openDropQuarantineReadStream(storageKey: string) {
  const { quarantinePath, sizeBytes } = await statDropQuarantineFile(storageKey);
  return { stream: createReadStream(quarantinePath), sizeBytes, quarantinePath };
}
