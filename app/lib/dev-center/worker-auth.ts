import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { OUTMINAI_WORKER_ID } from "./partner-isolation";

const DEFAULT_OUTMINAI_TOKEN_HASH_FILE = "/root/.dimpro-secrets/benjadmin/outminai-mcp-token.sha256";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function configuredOutminTokenHash() {
  const file = process.env.DIMPRO_OUTMINAI_TOKEN_HASH_FILE?.trim() || DEFAULT_OUTMINAI_TOKEN_HASH_FILE;
  try {
    const value = (await readFile(file, "utf8")).trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

export type DevWorkerSubject = {
  kind: "worker";
  workerId: typeof OUTMINAI_WORKER_ID;
  plane: "PARTNER";
};

export async function getDevWorkerSubject(headers: Headers): Promise<DevWorkerSubject | null> {
  const workerId = headers.get("x-dimpro-worker-id")?.trim() || "";
  const token = headers.get("x-dimpro-worker-token")?.trim() || "";
  if (workerId !== OUTMINAI_WORKER_ID || !token) return null;

  const expectedHash = await configuredOutminTokenHash();
  if (!expectedHash) return null;
  const suppliedHash = createHash("sha256").update(token, "utf8").digest("hex");
  if (!safeEqual(suppliedHash, expectedHash)) return null;

  return { kind: "worker", workerId: OUTMINAI_WORKER_ID, plane: "PARTNER" };
}
