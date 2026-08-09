import { createHash } from "node:crypto";
import net from "node:net";
import { once } from "node:events";
import type { DropWorkerConfig } from "./dropWorkerConfig";

export class DropScannerError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(message: string, code: string, retryable = true, status = 502) {
    super(message);
    this.name = "DropScannerError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

type ClamdVersion = {
  raw: string;
  engine: string;
  engineVersion: string;
  signatureVersion: string | null;
  signatureDate: string | null;
};

export type DropScanResult = {
  status: "clean" | "infected";
  sha256: string;
  bytesScanned: number;
  signatureName: string | null;
  response: string;
  version: ClamdVersion;
};

function sanitizeResponse(value: string) {
  return value.replace(/\0/g, "").replace(/[\r\n]+/g, " ").trim().slice(0, 1000);
}

function parseVersion(raw: string): ClamdVersion {
  const normalized = sanitizeResponse(raw);
  const [enginePart, signatureVersion, ...dateParts] = normalized.split("/");
  const engineMatch = enginePart.match(/^(ClamAV)\s+(.+)$/i);
  return {
    raw: normalized,
    engine: engineMatch?.[1] || "ClamAV",
    engineVersion: engineMatch?.[2] || enginePart || "unknown",
    signatureVersion: signatureVersion || null,
    signatureDate: dateParts.length ? dateParts.join("/") : null,
  };
}

function writeSocket(socket: net.Socket, data: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      socket.off("error", onError);
      socket.off("drain", onDrain);
    };
    socket.once("error", onError);
    const ready = socket.write(data, (error) => {
      if (error) onError(error);
      else if (ready) {
        cleanup();
        resolve();
      }
    });
    if (!ready) socket.once("drain", onDrain);
  });
}

async function openSocket(config: DropWorkerConfig) {
  const socket = net.createConnection(config.clamdSocket);
  socket.setTimeout(config.scanTimeoutMs);
  socket.on("timeout", () => socket.destroy(new DropScannerError("A ClamAV socket időtúllépéssel leállt.", "DROP_SCANNER_TIMEOUT")));
  try {
    await once(socket, "connect");
    return socket;
  } catch (error) {
    socket.destroy();
    throw new DropScannerError(
      error instanceof Error ? `A ClamAV socket nem érhető el: ${error.message}` : "A ClamAV socket nem érhető el.",
      "DROP_SCANNER_UNAVAILABLE",
    );
  }
}

async function runCommand(config: DropWorkerConfig, command: "PING" | "VERSION") {
  const socket = await openSocket(config);
  try {
    const response = new Promise<string>((resolve, reject) => {
      let output = "";
      socket.on("data", (chunk) => {
        output += chunk.toString("utf8");
        if (output.includes("\0") || output.includes("\n")) resolve(sanitizeResponse(output));
      });
      socket.once("error", reject);
      socket.once("end", () => resolve(sanitizeResponse(output)));
    });
    await writeSocket(socket, Buffer.from(`z${command}\0`, "utf8"));
    const value = await response;
    socket.destroy();
    return value;
  } catch (error) {
    socket.destroy();
    throw new DropScannerError(
      error instanceof Error ? error.message : "A ClamAV parancs sikertelen.",
      "DROP_SCANNER_COMMAND_FAILED",
    );
  }
}

export async function getClamdHealth(config: DropWorkerConfig) {
  const [ping, versionRaw] = await Promise.all([
    runCommand(config, "PING"),
    runCommand(config, "VERSION"),
  ]);
  if (ping !== "PONG") {
    throw new DropScannerError("A ClamAV nem adott PONG választ.", "DROP_SCANNER_PING_FAILED");
  }
  return { ping, version: parseVersion(versionRaw) };
}

export async function scanAsyncIterableWithClamd(
  source: AsyncIterable<Uint8Array>,
  expectedBytes: number,
  config: DropWorkerConfig,
): Promise<DropScanResult> {
  if (!config.enabled || config.scannerMode !== "clamd-instream") {
    throw new DropScannerError("A DROP ClamAV worker nincs aktiválva.", "DROP_SCANNER_DISABLED", false);
  }
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > config.maxScanBytes) {
    throw new DropScannerError("A fájl mérete nem vizsgálható a beállított scanner-plafonnal.", "DROP_SCANNER_SIZE_LIMIT", false);
  }

  const version = parseVersion(await runCommand(config, "VERSION"));
  const socket = await openSocket(config);
  let response = "";
  const responsePromise = new Promise<string>((resolve, reject) => {
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("\0") || response.includes("\n")) resolve(sanitizeResponse(response));
    });
    socket.once("error", reject);
    socket.once("end", () => resolve(sanitizeResponse(response)));
  });

  const hash = createHash("sha256");
  let bytesScanned = 0;
  const maxChunkBytes = 1024 * 1024;
  try {
    await writeSocket(socket, Buffer.from("zINSTREAM\0", "utf8"));
    for await (const rawChunk of source) {
      const chunk = rawChunk instanceof Uint8Array ? rawChunk : new Uint8Array(rawChunk);
      bytesScanned += chunk.byteLength;
      if (bytesScanned > config.maxScanBytes) {
        throw new DropScannerError("A scanner-adatfolyam meghaladta a megengedett méretet.", "DROP_SCANNER_SIZE_LIMIT", false);
      }
      hash.update(chunk);
      for (let offset = 0; offset < chunk.byteLength; offset += maxChunkBytes) {
        const part = chunk.subarray(offset, Math.min(chunk.byteLength, offset + maxChunkBytes));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(part.byteLength, 0);
        await writeSocket(socket, length);
        await writeSocket(socket, part);
      }
    }
    await writeSocket(socket, Buffer.alloc(4));
    const resultText = await responsePromise;
    socket.destroy();
    if (bytesScanned !== expectedBytes) {
      throw new DropScannerError(
        `A scanner ${bytesScanned} bájtot kapott a várt ${expectedBytes} helyett.`,
        "DROP_SCANNER_SIZE_MISMATCH",
      );
    }
    if (/\sOK$/i.test(resultText)) {
      return {
        status: "clean",
        sha256: hash.digest("hex"),
        bytesScanned,
        signatureName: null,
        response: resultText,
        version,
      };
    }
    const infected = resultText.match(/^stream:\s+(.+?)\s+FOUND$/i);
    if (infected) {
      return {
        status: "infected",
        sha256: hash.digest("hex"),
        bytesScanned,
        signatureName: infected[1].slice(0, 240),
        response: resultText,
        version,
      };
    }
    throw new DropScannerError(`A ClamAV nem értelmezhető választ adott: ${resultText || "üres válasz"}`, "DROP_SCANNER_PROTOCOL_ERROR");
  } catch (error) {
    socket.destroy();
    if (error instanceof DropScannerError) throw error;
    throw new DropScannerError(
      error instanceof Error ? error.message : "A ClamAV streamvizsgálat sikertelen.",
      "DROP_SCANNER_STREAM_FAILED",
    );
  }
}
