import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DropFileRecord } from "../dropTypes";
import { queueDropWorkerJob } from "./dropWorkerRepository";

const DEFAULT_TRIGGER_DIR = "/root/dimprover/.data/drop-worker-trigger";
const IMAGE_PRIORITY_OFFSET_MS = 60_000;
const SMALL_FILE_PRIORITY_OFFSET_MS = 30_000;
const SMALL_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

function triggerDirectory() {
  return process.env.DIMPRO_DROP_SCAN_TRIGGER_DIR?.trim() || DEFAULT_TRIGGER_DIR;
}

function scanPriority(file: Pick<DropFileRecord, "is_image" | "size_stored_bytes">) {
  if (file.is_image) return { name: "image", offsetMs: IMAGE_PRIORITY_OFFSET_MS } as const;
  if (file.size_stored_bytes <= SMALL_FILE_LIMIT_BYTES) return { name: "small-file", offsetMs: SMALL_FILE_PRIORITY_OFFSET_MS } as const;
  return { name: "standard", offsetMs: 0 } as const;
}

async function signalImmediateScan(fileId: string) {
  const directory = triggerDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // A worker-feladat maga PostgreSQL-ben sorban áll. A fájlrendszeri jel csak ébresztés,
  // ezért egyetlen összevont sentinel elég. Így 20–80 gyors mobilfotó sem indít
  // másodpercenként külön systemd service-t és nem fut bele a start-limitbe.
  const triggerPath = path.join(directory, "scan-wakeup.trigger");
  await writeFile(triggerPath, `${new Date().toISOString()} ${fileId}\n`, { encoding: "utf8", mode: 0o600, flag: "w" });
  return { requested: true as const, coalesced: true as const, triggerPathExposed: false as const };
}

export async function dispatchDropFileScan(file: DropFileRecord) {
  const priority = scanPriority(file);
  const runAfter = new Date(Date.now() - priority.offsetMs).toISOString();
  const job = await queueDropWorkerJob({
    type: "scan_file",
    packageId: file.package_id,
    fileId: file.id,
    jobKey: `scan_file:${file.id}`,
    maxAttempts: 5,
    runAfter,
    payload: {
      fileId: file.id,
      packageId: file.package_id,
      storageBucket: file.storage_bucket,
      storageKey: file.storage_key,
      priority: priority.name,
      sizeBytes: file.size_stored_bytes,
      immediateDispatch: true,
    },
  });
  const signal = await signalImmediateScan(file.id);
  return {
    queued: true as const,
    jobId: job.id,
    priority: priority.name,
    runAfter,
    immediateWakeRequested: signal.requested,
    triggerPathExposed: false as const,
  };
}
