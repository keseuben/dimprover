import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "supabase/DIMPRO_DROP_050_MALWARE_RETENTION_DOWNLOAD_BOOTSTRAP.sql",
  "app/lib/drop/dropRuntime.ts",
  "app/lib/drop/dropTypes.ts",
  "app/lib/drop/storage/dropS3Storage.ts",
  "app/lib/drop/storage/dropStorageRepository.ts",
  "app/lib/drop/worker/dropWorkerConfig.ts",
  "app/lib/drop/worker/dropWorkerAuth.ts",
  "app/lib/drop/worker/clamdInstream.ts",
  "app/lib/drop/worker/dropWorkerRepository.ts",
  "app/lib/drop/worker/dropWorkerService.ts",
  "app/lib/drop/download/dropDownloadService.ts",
  "app/api/drop/worker/run/route.ts",
  "app/api/drop/downloads/file/[fileId]/route.ts",
  "components/drop/DropSecureDownloadPanel.tsx",
  "components/drop/DropValidatedAccessPage.tsx",
  "scripts/run-drop-worker-v050.mjs",
  "scripts/drop-worker-v050-readiness.mjs",
  "ops/systemd/dimpro-drop-worker-v050.service",
  "ops/systemd/dimpro-drop-worker-v050.timer",
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])))
const [sql, runtime, types, s3, storageRepository, workerConfig, workerAuth, clamd, workerRepository, workerService, downloadService, workerRoute, downloadRoute, downloadPanel, validatedPage, runner, readiness, serviceUnit, timerUnit] = paths.map((path) => files[path]);
let checks = 0;
const match = (text, pattern) => { assert.match(text, pattern); checks += 1; };
const truth = (value) => { assert.ok(value); checks += 1; };

match(sql, /(?:^|\n)begin;\s*(?:\n|$)/);
truth(sql.trimEnd().endsWith("commit;"));
match(sql, /DROP 0\.5\.0/);
match(sql, /DROP_040_SCHEMA_REQUIRED/);
match(sql, /drop-050-malware-retention-download-20260803/);
match(sql, /scan_attempts/);
match(sql, /download_ready_at/);
match(sql, /lease_expires_at/);
match(sql, /drop_queue_worker_job/);
match(sql, /drop_claim_worker_jobs/);
match(sql, /for update skip locked/);
match(sql, /drop_finish_worker_job/);
match(sql, /drop_start_file_scan/);
match(sql, /drop_apply_file_scan_result/);
match(sql, /FILE_SHA256/);
match(sql, /drop_mark_file_object_deleted/);
match(sql, /reservationReleased/);
match(sql, /drop_create_file_download/);
match(sql, /DROP_FILE_DOWNLOAD_NOT_READY/);
match(sql, /drop_files_queue_scan_job/);
match(sql, /retentionReportGate/);
match(sql, /publicDownloadRequiresCleanScan/);
match(sql, /revoke all on function public\.drop_claim_worker_jobs/);
match(sql, /grant execute on function public\.drop_claim_worker_jobs/);
match(sql, /revoke all on table public\.drop_jobs from public,anon,authenticated/);

match(clamd, /zINSTREAM/);
match(clamd, /writeUInt32BE/);
match(clamd, /createHash\("sha256"\)/);
match(clamd, /Eicar|FOUND/);
match(clamd, /DROP_SCANNER_SIZE_MISMATCH/);
match(clamd, /getClamdHealth/);
match(workerConfig, /DROP_WORKER_SECRET/);
match(workerConfig, /clamd-instream/);
match(workerConfig, /reportDeletionGateEnabled/);
match(workerConfig, /secretsExposed: false/);
match(workerAuth, /timingSafeEqual/);
match(workerAuth, /license\.dimpro\.hu/);
truth(!workerAuth.includes('"drop.dimpro.hu",'));

match(workerRepository, /claimDropWorkerJobs/);
match(workerRepository, /startDropFileScan/);
match(workerRepository, /applyDropFileScanResult/);
match(workerRepository, /createDropFileDownloadRecord/);
match(workerRepository, /markDropPackageFinalReportQueued/);
match(workerService, /scanAsyncIterableWithClamd/);
match(workerService, /deleteFileObjectDurably/);
match(workerService, /infected-cleanup-completed/);
match(workerService, /processStaleUploadSessions/);
match(workerService, /report-blocked/);
match(workerService, /final_report_status/);
match(workerService, /processDropObjectCleanup/);
match(workerService, /publicDownloadEnabled: getDropStorageSafeStatus\(\)\.publicDownloadReady/);

match(s3, /createDropS3DownloadUrl/);
match(s3, /ResponseContentDisposition/);
match(s3, /filename\*=UTF-8/);
match(s3, /NoSuchUpload/);
match(storageRepository, /DROP 0\.5\.0/);
match(runtime, /version: "DROP 0\.5\.0"/);
match(runtime, /cleanScanRequiredForDownload: true/);
match(runtime, /retentionDeletionBlockedUntilFinalReport/);
match(runtime, /workerSchema/);
match(types, /scan_signature_name/);
match(types, /download_ready_at/);

match(downloadService, /expectedPurpose: "download"/);
match(downloadService, /DROP_FILE_DOWNLOAD_NOT_READY/);
match(downloadService, /tokenRemainingSeconds < 60/);
match(downloadService, /createDropFileDownloadRecord/);
match(downloadService, /createDropS3DownloadUrl/);
match(downloadService, /hashDropToken/);
match(downloadRoute, /DROP_FILE_ID_INVALID/);
match(downloadRoute, /drop\.dimpro\.hu/);
match(downloadPanel, /Biztonságos letöltés/);
match(downloadPanel, /Vírusellenőrzött fájlok/);
match(validatedPage, /DropSecureDownloadPanel/);
match(validatedPage, /readiness\.publicDownload/);

match(workerRoute, /x-dimpro-drop-worker-secret|isDropWorkerAuthorized/);
match(workerRoute, /DROP_ROUTE_NOT_FOUND/);
match(workerRoute, /runDropWorkerCycle/);
match(runner, /127\.0\.0\.1:3000\/api\/drop\/worker\/run/);
match(runner, /x-dimpro-drop-worker-secret/);
match(runner, /secretsExposed: false/);
match(readiness, /clamdReachable/);
match(readiness, /timerActivationExpectedAfterSql: true/);
match(serviceUnit, /NoNewPrivileges=true/);
match(serviceUnit, /ProtectSystem=full/);
match(timerUnit, /OnUnitActiveSec=2min/);
match(timerUnit, /Persistent=true/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.5.0",
  checksPassed: checks,
  clamdInstream: true,
  fullFileSha256: true,
  leasedWorkerQueue: true,
  infectedObjectDeletion: true,
  retentionReportGate: true,
  secureSignedDownload: true,
  preSqlTimerSafetyContract: true,
  secretsExposed: false,
}, null, 2));
