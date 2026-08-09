import { mkdir, readdir, rm } from "node:fs/promises";

const secret = process.env.DROP_WORKER_SECRET?.trim() || "";
const triggerDir = process.env.DIMPRO_DROP_SCAN_TRIGGER_DIR?.trim() || "/root/dimprover/.data/drop-worker-trigger";
const baseUrl = process.env.DROP_WORKER_BASE_URL?.trim() || "http://127.0.0.1:3000";
const maxCycles = Math.max(1, Math.min(100, Number(process.env.DIMPRO_DROP_SCAN_TRIGGER_MAX_CYCLES || 50)));
if (secret.length < 32) {
  console.error(JSON.stringify({ ok: false, code: "DROP_WORKER_SECRET_MISSING", secretsExposed: false }));
  process.exit(2);
}

async function consumeCurrentTriggers() {
  await mkdir(triggerDir, { recursive: true, mode: 0o700 });
  const entries = await readdir(triggerDir).catch(() => []);
  let consumed = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".trigger")) continue;
    await rm(`${triggerDir}/${entry}`, { force: true }).catch(() => undefined);
    consumed += 1;
  }
  return consumed;
}

async function runCycle() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 19 * 60 * 1000);
  try {
    const response = await fetch(`${baseUrl}/api/drop/worker/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": "license.dimpro.hu",
        "x-dimpro-drop-worker-secret": secret,
      },
      body: JSON.stringify({ limit: 2, scanOnly: true }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw Object.assign(new Error(payload.error || "A DROP azonnali scan worker HTTP-futtatása sikertelen."), {
        code: payload.code || "DROP_SCAN_TRIGGER_HTTP_FAILED",
        status: response.status,
      });
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const consumedTriggers = await consumeCurrentTriggers();
  const cycles = [];
  let totalClaimed = 0;
  let totalScanned = 0;
  for (let index = 0; index < maxCycles; index += 1) {
    const result = await runCycle();
    const claimed = Number(result.claimedScanJobs || 0);
    const scanResults = Array.isArray(result.scanResults) ? result.scanResults : [];
    totalClaimed += claimed;
    totalScanned += scanResults.length;
    cycles.push({
      cycle: index + 1,
      queuedCandidates: Number(result.queuedCandidates || 0),
      claimedScanJobs: claimed,
      statuses: scanResults.map((item) => item?.status || "unknown"),
    });
    if (claimed === 0) break;
  }
  console.log(JSON.stringify({
    ok: true,
    version: "DROP 0.9.6",
    mode: "immediate-scan-trigger",
    consumedTriggers,
    cycleCount: cycles.length,
    totalClaimed,
    totalScanned,
    cycles,
    triggerPathExposed: false,
    secretsExposed: false,
    completedAt: new Date().toISOString(),
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    version: "DROP 0.9.6",
    code: error?.code || (error?.name === "AbortError" ? "DROP_SCAN_TRIGGER_TIMEOUT" : "DROP_SCAN_TRIGGER_FAILED"),
    error: error instanceof Error ? error.message : "Ismeretlen DROP azonnali scan worker hiba.",
    triggerPathExposed: false,
    secretsExposed: false,
  }));
  process.exit(1);
}
