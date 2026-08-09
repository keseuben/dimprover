import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const checks=[];
function has(name,source,text){assert.ok(source.includes(text),`${name}: ${text}`);checks.push(name)}
function lacks(name,source,text){assert.ok(!source.includes(text),`${name}: ${text}`);checks.push(name)}

const types=read("app/lib/drop/operations/dropOperationsTypes.ts");
const repo=read("app/lib/drop/operations/dropOperationsRepository.ts");
const service=read("app/lib/drop/operations/dropOperationsService.ts");
const api=read("app/api/drop/admin/operations/route.ts");
const dashboard=read("components/drop/DropOperationsDashboard.tsx");
const page=read("app/drive/drop/operations/page.tsx");
const s3=read("app/lib/drop/storage/dropS3Storage.ts");
const sendSession=read("app/api/drop/public/send/session/route.ts");
const finalize=read("app/lib/drop/public/dropPublicFinalizeService.ts");
const publicEmail=read("app/lib/drop/public/dropPublicEmail.ts");
const publicEmailTemplate=read("app/lib/drop/public/dropPublicEmailTemplate.ts");
const publicWorkflow=read("app/lib/drop/public/dropPublicWorkflowService.ts");
const publicUploader=read("components/drop/DropPublicHexUploader.tsx");
const uploadPreparation=read("components/drop/dropUploadPreparation.ts");
const validatedAccess=read("components/drop/DropValidatedAccessPage.tsx");
const worker=read("app/lib/drop/worker/dropWorkerService.ts");
const runtime=read("app/lib/drop/dropRuntime.ts");
const flags=read("app/lib/drop/dropFeatureFlags.ts");
const packageManager=read("components/drop/DropPackageManager.tsx");
const workflowManager=read("components/drop/DropPublicWorkflowManager.tsx");
const postgres=read("app/lib/drop/public/dropPublicPostgresRepository.ts");
const resolver=read("app/lib/drop/public/dropPublicStoreResolver.ts");

has("types-version",types,'version: "DROP 0.9.9"');
has("types-status",types,'DropOperationsStatus = "ok" | "warning" | "error"');
has("types-storage-audit",types,"DropOperationsStorageAudit");
has("types-alert-result",types,"notificationCreated: boolean");
has("types-masked-object-samples",types,"orphanSamples: string[]");

has("repo-package-source",repo,'from("drop_packages")');
has("repo-file-source",repo,'from("drop_files")');
has("repo-upload-source",repo,'from("drop_upload_sessions")');
has("repo-access-source",repo,'from("drop_access_attempts")');
has("repo-event-source",repo,'from("drop_events")');
has("repo-email-source",repo,'from("drop_email_log")');
has("repo-download-source",repo,'from("drop_downloads")');
has("repo-worker-source",repo,'from("drop_jobs")');
has("repo-cleanup-source",repo,'from("drop_object_cleanup_tasks")');
has("repo-workflow-source",repo,'from("drop_public_package_workflows")');
has("repo-24h",repo,"24 * 60 * 60_000");
has("repo-7d",repo,"7 * 24 * 60 * 60_000");
has("repo-failed-access",repo,"failedAccess24h");
has("repo-send-code-failure",repo,"failedSendCode24h");
has("repo-bot-events",repo,'startsWith("security.bot_")');
has("repo-malware",repo,"infectedFiles");
has("repo-scan-stale",repo,"staleScanQueue");
has("repo-email-rate",repo,"emailFailureRate24h");
has("repo-finalization-check",repo,'id: "public-finalization"');
has("repo-worker-check",repo,'id: "worker"');
has("repo-cleanup-check",repo,'id: "cleanup"');
has("repo-retention-check",repo,'id: "retention"');
has("repo-upload-check",repo,'id: "uploads"');
has("repo-storage-check",repo,'id: "storage-audit"');
has("repo-object-key-mask",repo,'createHash("sha256")');
has("repo-object-mask-prefix",repo,'`obj_${');
has("repo-s3-list-limit",repo,"maxKeys: 1000");
has("repo-head-sample-limit",repo,".slice(0, 25)");
lacks("repo-no-raw-ip-field",types,"rawIpAddress");
lacks("repo-no-email-metric",types,"uploaderEmail");

has("s3-list-command",s3,"ListObjectsV2Command");
has("s3-list-export",s3,"export async function listDropS3Objects");
has("s3-list-max-1000",s3,"Math.min(1000");

has("service-data-env",service,"DROP_OPERATIONS_DATA_DIR");
has("service-data-dir-0700",service,"mode: 0o700");
has("service-history-0600",service,"mode: 0o600");
has("service-history-limit",service,"slice(-240)");
has("service-alert-fingerprint",service,"alertFingerprint");
has("service-alert-throttle",service,"6 * 60 * 60_000");
has("service-alert-env",service,"DROP_OPERATIONS_ALERTS_ENABLED");
has("service-notification-center",service,"createNotification");
has("service-email",service,"sendDimproMail");
has("service-email-profile",service,'profileId: "notifications"');
has("service-recovery",service,"isRecovery");
has("service-scheduled-lock",service,"scheduled.lock");
has("service-scheduled-throttle",service,"15 * 60_000");
has("service-stale-lock",service,"5 * 60_000");
has("service-worker-source",service,'source: "worker"');

has("api-admin-auth",api,"isLicenseAdminAuthorized");
has("api-get-history",api,"getDropOperationsResponse");
has("api-run-monitor",api,"runDropOperationsMonitor");
has("api-deep-audit",api,"deepStorageAudit");
has("api-no-store",api,"dropNoStoreHeaders");
has("api-version",api,'version: "DROP 0.9.9"');

has("dashboard-version",dashboard,"DROP 0.9.9 · üzemeltetési felügyelet");
has("dashboard-quick",dashboard,"Gyors ellenőrzés");
has("dashboard-deep",dashboard,"Mély S3-audit");
has("dashboard-security",dashboard,'label="Biztonság"');
has("dashboard-delivery",dashboard,'label="Kézbesítés"');
has("dashboard-history",dashboard,"Utolsó {history.length} futás");
has("dashboard-masked-samples",dashboard,"Maszkolt árva minták");
has("dashboard-auth",dashboard,"dimproLicenseAdminKey");
has("page-dashboard",page,"DropOperationsDashboard");

has("package-manager-link",packageManager,'href="/drive/drop/operations"');
has("workflow-manager-link",workflowManager,'href="/drive/drop/operations"');
has("workflow-manager-version",workflowManager,"DROP 0.9.9 · publikus workflow-k");

has("send-audit-function",sendSession,"auditSendCodeAttempt");
has("send-audit-db",sendSession,"recordDropAccessAttempt");
has("send-audit-ip-hash",sendSession,"getDropPublicRequestContext");
has("send-audit-code-fingerprint",sendSession,'createDropSecurityFingerprint("drop-send-code-attempt"');
lacks("send-audit-no-raw-code-column",sendSession,"raw_code");
has("send-api-version",sendSession,'version: "DROP 0.9.9"');

has("finalize-core-by-id",finalize,"finalizeDropPublicPackageById");
has("finalize-browser-session",finalize,"resolveDropPublicSession");
has("finalize-worker-source",finalize,'source: "worker"');
has("finalize-candidates",finalize,"processDropPublicFinalizationCandidates");
has("finalize-not-ready-preserved",finalize,'code !== "DROP_PUBLIC_FILES_NOT_READY"');
has("finalize-already-sent-filter",finalize,"invitation_sent_at");
has("finalize-pending-only",finalize,"pendingRecipients");
has("finalize-event-source",finalize,"public_workflow_finalize_${source}");
has("finalize-candidate-limit",finalize,"Math.min(100, limit)");
has("finalize-worker-only-unstarted",finalize,'["not_requested", "pending"]');
has("finalize-partial-review",finalize,"DROP_PUBLIC_PARTIAL_DELIVERY_REVIEW_REQUIRED");
has("finalize-preserves-recipient-links",finalize,"már kiküldött linkek ne váljanak érvénytelenné");

has("public-workflow-upload-mail-off",publicWorkflow,"notify_on_upload_complete: false");
has("public-workflow-open-mail-off",publicWorkflow,"notify_on_first_open: false");
has("public-workflow-policy-before-bind",publicWorkflow,"disablePublicWorkflowUploadNotifications(created.package.id)");

has("public-email-one-loop-per-recipient",publicEmail,"for (const recipient of input.recipients)");
has("public-email-all-files",publicEmail,"input.files.map");
has("public-email-direct-download-link",publicEmailTemplate,"Letöltési link: ${input.downloadUrl}");
has("public-email-pin",publicEmailTemplate,"Letöltési kód:");
has("public-email-cid-preview",publicEmailTemplate,"src=\"cid:${escapeHtml(preview.cid)}\"");
has("public-email-zip-download",publicEmailTemplate,"egyetlen ZIP-csomagban");
has("public-email-single-send-call",publicEmail,"const sent = await sendDimproMail");

has("upload-prep-heic-csp",uploadPreparation,'import("heic-to/csp")');
has("upload-prep-extension-detection",uploadPreparation,"rasterImageExtensions.has(extensionOf(file.name))");
has("upload-prep-heic-jpeg",uploadPreparation,'type: "image/jpeg"');
has("upload-prep-heic-explicit-error",uploadPreparation,"HEIC/HEIF képet a böngésző nem tudta JPG-vé alakítani");
has("upload-prep-preview",uploadPreparation,"previewUrl");

has("public-uploader-thumbnail",publicUploader,'<img src={item.previewUrl}');
has("public-uploader-grid-two",publicUploader,"md:grid-cols-2");
has("public-uploader-grid-three",publicUploader,"xl:grid-cols-3");
has("public-uploader-modal",publicUploader,'role="dialog"');
has("public-uploader-image-comment",publicUploader,"Megjegyzés ehhez a képhez");
has("public-uploader-finalize-lock",publicUploader,"finalizeInFlightRef");
has("public-uploader-one-summary-message",publicUploader,"címzett egy-egy összesített értesítése");

has("validated-direct-download-panel",validatedAccess,"DropSecureDownloadPanel");
has("validated-pin-conditional",validatedAccess,"downloadPinRequired && !downloadPinVerified");
has("validated-link-only-direct",validatedAccess,"downloadPinVerified ? <DropSecureDownloadPanel");

has("worker-finalization-import",worker,"processDropPublicFinalizationCandidates");
has("worker-finalization-result",worker,"publicFinalization");
has("worker-monitor-import",worker,"runScheduledDropOperationsMonitor");
has("worker-monitor-result",worker,"operationsMonitor");
has("worker-monitor-nonfatal",worker,'reason: "scheduled-error"');
has("worker-version",worker,'version: "DROP 0.9.9"');

has("runtime-version",runtime,'version: "DROP 0.9.9"');
has("flags-version",flags,'version: "DROP 0.9.9"');
has("runtime-monitor-readiness",runtime,"operationsMonitor");
has("runtime-history-readiness",runtime,"operationsHistory");
has("runtime-alert-readiness",runtime,"operationsAlerts");
has("runtime-deep-audit-readiness",runtime,"deepStorageAudit");
has("runtime-admin-only",runtime,"adminOnly: true");
has("runtime-monitor-interval",runtime,"monitorIntervalMinutes: 15");
has("runtime-raw-ip-hidden",runtime,"rawIpAddressesExposed: false");
has("runtime-raw-key-hidden",runtime,"rawObjectKeysExposed: false");

has("postgres-schema-stays-v095",postgres,'version: "DROP 0.9.5"');
has("resolver-schema-stays-v095",resolver,'schemaVersion: "DROP 0.9.5"');

const apiFiles=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const full=`${dir}/${name}`;const st=fs.statSync(full);if(st.isDirectory())walk(full);else if(full.endsWith(".ts"))apiFiles.push(full)}}
walk("app/api/drop");
for(const file of apiFiles){const source=read(file);lacks(`api-no-stale-v095-${file}`,source,'version: "DROP 0.9.5"')}

console.log(JSON.stringify({ok:true,version:"DROP 0.9.9",checks:checks.length,names:checks},null,2));
