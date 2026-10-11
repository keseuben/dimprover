/**
 * DIMPRO Transfer Center V0.9.50 – shared, side-effect-free UI event contract.
 * No credentials, signed URLs, health/identity payloads, or customer data persisted.
 * Percentages describe network bytes only, never malware scanning or approval.
 */
export const TRANSFER_CORE_VERSION = "0.9.50" as const;
export type TransferPhase =
  | "QUEUED" | "INITIALIZING" | "UPLOADING" | "VERIFYING" | "SCANNING"
  | "AWAITING_REVIEW" | "SCAN_PENDING" | "SCAN_FAILED" | "INFECTED"
  | "ERROR" | "CANCELLED";

export type TransferTask = {
  id: string;
  fileName: string;
  folderName: string;
  sizeBytes: number;
  uploadedBytes: number;
  phase: TransferPhase;
  speedBps: number | null;
  error: string | null;
  updatedAt: number;
};

export const TRANSFER_TERMINAL_PHASES = [
  "AWAITING_REVIEW", "SCAN_PENDING", "SCAN_FAILED", "INFECTED",
  "ERROR", "CANCELLED",
] as const satisfies readonly TransferPhase[];

export const TRANSFER_LABELS: Record<TransferPhase, string> = {
  QUEUED: "Sorban áll",
  INITIALIZING: "Munkamenet előkészítése",
  UPLOADING: "Átvitel folyamatban",
  VERIFYING: "Szerveroldali SHA-256 ellenőrzés",
  SCANNING: "Vírusellenőrzés folyamatban",
  AWAITING_REVIEW: "Vírusmentes · jóváhagyásra vár",
  SCAN_PENDING: "Feltöltve · vírusellenőrzésre vár",
  SCAN_FAILED: "Vírusellenőrzés sikertelen · karantén",
  INFECTED: "Vírusveszély · fájl blokkolva",
  ERROR: "Feltöltési hiba",
  CANCELLED: "Megszakítva",
};

export function isTransferTerminal(phase: TransferPhase): boolean {
  return (TRANSFER_TERMINAL_PHASES as readonly string[]).includes(phase);
}

export function clampTransferredBytes(loaded: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(loaded)) return 0;
  return Math.min(Math.floor(total), Math.max(0, Math.floor(loaded)));
}

export function transferPercent(loaded: number, total: number): number {
  if (total <= 0 || !Number.isFinite(total)) return 0;
  return Math.round(clampTransferredBytes(loaded, total) / total * 100);
}

export function transferEtaSeconds(remaining: number, speedBps: number | null): number | null {
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!speedBps || !Number.isFinite(speedBps) || speedBps <= 0) return null;
  return Math.ceil(remaining / speedBps);
}

export function transferSpeedSample(
  previous: { loaded: number; at: number; smoothedBps: number | null } | null,
  loaded: number,
  now: number,
): { loaded: number; at: number; smoothedBps: number | null } {
  if (!previous || loaded < previous.loaded) return { loaded, at: now, smoothedBps: null };
  const elapsed = (now - previous.at) / 1000;
  if (elapsed < 0.15) return previous;
  const speed = (loaded - previous.loaded) / elapsed;
  return { loaded, at: now, smoothedBps: speed > 0
    ? previous.smoothedBps === null ? speed : previous.smoothedBps * 0.65 + speed * 0.35
    : null };
}

export function summarizeTransfers(tasks: readonly TransferTask[]) {
  const totalBytes = tasks.reduce((sum, item) => sum + Math.max(0, item.sizeBytes), 0);
  const uploadedBytes = tasks.reduce(
    (sum, item) => sum + clampTransferredBytes(item.uploadedBytes, item.sizeBytes), 0);
  const active = tasks.filter(item => !isTransferTerminal(item.phase) && item.phase !== "QUEUED").length;
  const queued = tasks.filter(item => item.phase === "QUEUED").length;
  const failed = tasks.filter(item => item.phase === "ERROR" || item.phase === "SCAN_FAILED" || item.phase === "INFECTED").length;
  const awaitingReview = tasks.filter(item => item.phase === "AWAITING_REVIEW").length;
  const scanning = tasks.filter(item => item.phase === "SCANNING" || item.phase === "SCAN_PENDING").length;
  const terminal = tasks.filter(item => isTransferTerminal(item.phase)).length;
  const speedBps = tasks.reduce((sum, item) => item.phase === "UPLOADING" ? sum + Math.max(0, item.speedBps || 0) : sum, 0);
  return { count: tasks.length, totalBytes, uploadedBytes, percent: transferPercent(uploadedBytes, totalBytes),
    active, queued, failed, awaitingReview, scanning, terminal, speedBps };
}
