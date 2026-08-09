const secret = process.env.DROP_WORKER_SECRET?.trim() || "";
if (secret.length < 32) {
  console.error(JSON.stringify({ ok: false, code: "DROP_WORKER_SECRET_MISSING", secretsExposed: false }));
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 19 * 60 * 1000);
try {
  const response = await fetch("http://127.0.0.1:3000/api/drop/worker/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-host": "license.dimpro.hu",
      "x-dimpro-drop-worker-secret": secret,
    },
    body: JSON.stringify({ limit: Number(process.env.DIMPRO_DROP_WORKER_CLAIM_LIMIT || 2) }),
    cache: "no-store",
    signal: controller.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    console.error(JSON.stringify({
      ok: false,
      status: response.status,
      code: payload.code || "DROP_WORKER_HTTP_FAILED",
      error: payload.error || "A DROP worker HTTP-futtatása sikertelen.",
      secretsExposed: false,
    }));
    process.exit(1);
  }
  console.log(JSON.stringify({
    ok: true,
    version: payload.version,
    scanner: payload.scanner,
    queuedCandidates: payload.queuedCandidates,
    claimedScanJobs: payload.claimedScanJobs,
    scanResults: payload.scanResults,
    staleSessionCount: Array.isArray(payload.staleSessions) ? payload.staleSessions.length : 0,
    lifecycleCount: Array.isArray(payload.lifecycle) ? payload.lifecycle.length : 0,
    cleanup: payload.cleanup,
    publicDownloadEnabled: payload.publicDownloadEnabled,
    completedAt: payload.completedAt,
    secretsExposed: false,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error?.name === "AbortError" ? "DROP_WORKER_TIMEOUT" : "DROP_WORKER_REQUEST_FAILED",
    error: error instanceof Error ? error.message : "Ismeretlen DROP worker hiba.",
    secretsExposed: false,
  }));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
