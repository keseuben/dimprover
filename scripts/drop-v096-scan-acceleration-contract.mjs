import assert from "node:assert/strict";
import fs from "node:fs";

const files = {
  dispatch: fs.readFileSync("app/lib/drop/worker/dropScanDispatch.ts", "utf8"),
  upload: fs.readFileSync("app/lib/drop/storage/dropUploadService.ts", "utf8"),
  worker: fs.readFileSync("app/lib/drop/worker/dropWorkerService.ts", "utf8"),
  repository: fs.readFileSync("app/lib/drop/worker/dropWorkerRepository.ts", "utf8"),
  route: fs.readFileSync("app/api/drop/worker/run/route.ts", "utf8"),
  runner: fs.readFileSync("scripts/run-drop-scan-trigger-v096.mjs", "utf8"),
  service: fs.readFileSync("scripts/systemd/dimpro-drop-scan-trigger-v096.service", "utf8"),
  path: fs.readFileSync("scripts/systemd/dimpro-drop-scan-trigger-v096.path", "utf8"),
  proxy: fs.readFileSync("proxy.ts", "utf8"),
};
let checks = 0;
function has(name, value, pattern) { checks += 1; assert.match(value, pattern, name); }
function lacks(name, value, pattern) { checks += 1; assert.doesNotMatch(value, pattern, name); }

has("dispatch-queues-scan-job", files.dispatch, /queueDropWorkerJob/);
has("dispatch-coalesced-trigger", files.dispatch, /scan-wakeup\.trigger/);
lacks("dispatch-no-per-file-random-trigger", files.dispatch, /randomUUID/);
has("dispatch-private-trigger-mode", files.dispatch, /mode:\s*0o600/);
has("dispatch-private-directory", files.dispatch, /mode:\s*0o700/);
has("dispatch-image-priority", files.dispatch, /IMAGE_PRIORITY_OFFSET_MS\s*=\s*60_000/);
has("dispatch-small-file-priority", files.dispatch, /SMALL_FILE_PRIORITY_OFFSET_MS\s*=\s*30_000/);
has("dispatch-no-trigger-path-exposure", files.dispatch, /triggerPathExposed:\s*false/);
has("s3-upload-dispatch", files.upload, /dispatchDropFileScan\(finalized\.file\)/);
has("upload-dispatch-fallback-does-not-fail-upload", files.upload, /queued:\s*false as const/);
has("scan-candidate-image-first", files.repository, /order\("is_image", \{ ascending: false \}\)/);
has("scan-candidate-small-first", files.repository, /order\("size_stored_bytes", \{ ascending: true \}\)/);
has("parallel-scan-two", files.worker, /Promise\.all\(jobs\.map\(\(job\) => processScanJob\(job\)\)\)/);
has("scan-only-mode", files.worker, /mode:\s*"scan-only"/);
has("scan-concurrency-capped", files.worker, /scanConcurrency:\s*Math\.min\(limit, 2\)/);
has("api-scan-only", files.route, /body\.scanOnly === true/);
has("api-scan-only-limit-two", files.route, /Math\.min\(requestedLimit, 2\)/);
has("runner-scan-only-request", files.runner, /scanOnly:\s*true/);
has("runner-drains-queue", files.runner, /for \(let index = 0; index < maxCycles/);
has("runner-stops-empty", files.runner, /if \(claimed === 0\) break/);
has("runner-clears-trigger", files.runner, /rm\(`\$\{triggerDir\}\/\$\{entry\}`/);
has("systemd-clamav-dependency", files.service, /After=network-online\.target clamav-daemon\.service/);
has("systemd-read-write-only-trigger", files.service, /ReadWritePaths=\/root\/dimprover\/\.data\/drop-worker-trigger/);
has("systemd-protect-home", files.service, /ProtectHome=read-only/);
has("systemd-path-directory-not-empty", files.path, /DirectoryNotEmpty=\/root\/dimprover\/\.data\/drop-worker-trigger/);
has("heic-worker-csp", files.proxy, /worker-src 'self' blob:/);
has("heic-wasm-csp", files.proxy, /'wasm-unsafe-eval'/);
lacks("no-anonymous-unscanned-download", files.worker, /virus_scan_status\s*=\s*"clean"/);
console.log(JSON.stringify({ ok: true, version: "DROP 0.9.6", checks }, null, 2));
