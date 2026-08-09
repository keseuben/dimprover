import assert from "node:assert/strict";
import fs from "node:fs";

const sources = {
  queue: fs.readFileSync("components/drop/dropOfflineQueueStore.ts", "utf8"),
  network: fs.readFileSync("components/drop/dropNetworkClient.ts", "utf8"),
  multipart: fs.readFileSync("components/drop/dropMultipartClient.ts", "utf8"),
  uploader: fs.readFileSync("components/drop/DropPublicHexUploader.tsx", "utf8"),
  transfer: fs.readFileSync("components/drop/DropPublicTransferClient.tsx", "utf8"),
  pwa: fs.readFileSync("components/drop/DropPwaShell.tsx", "utf8"),
  dock: fs.readFileSync("components/drop/DropMobileDock.tsx", "utf8"),
  events: fs.readFileSync("components/drop/dropMobileEvents.ts", "utf8"),
  sw: fs.readFileSync("public/drop-sw.js", "utf8"),
  resumeService: fs.readFileSync("app/lib/drop/public/dropPublicWorkflowService.ts", "utf8"),
  resumeRoute: fs.readFileSync("app/api/drop/public/packages/resume/route.ts", "utf8"),
  pingRoute: fs.readFileSync("app/api/drop/public/ping/route.ts", "utf8"),
  postgresPublicRepo: fs.readFileSync("app/lib/drop/public/dropPublicPostgresRepository.ts", "utf8"),
  filePublicRepo: fs.readFileSync("app/lib/drop/public/dropPublicFileRepository.ts", "utf8"),
};
let checks = 0;
const names = [];
function has(name, source, pattern) { checks += 1; names.push(name); assert.match(source, pattern, name); }
function lacks(name, source, pattern) { checks += 1; names.push(name); assert.doesNotMatch(source, pattern, name); }

has("queue-db-v098", sources.queue, /dimpro-drop-offline-v098/);
has("queue-blob", sources.queue, /blob:\s*Blob/);
has("queue-client-upload-id", sources.queue, /clientUploadId:\s*string/);
has("queue-package-index", sources.queue, /createIndex\("packageId"/);
has("queue-updated-index", sources.queue, /createIndex\("updatedAt"/);
has("queue-persist", sources.queue, /persistDropQueueItem/);
has("queue-patch", sources.queue, /patchDropQueueItem/);
has("queue-restore", sources.queue, /restoreDropQueue/);
has("queue-prune", sources.queue, /pruneDropQueueStore/);
has("queue-expiry", sources.queue, /MAX_RECORD_AGE_MS/);
has("queue-uploading-normalized-paused", sources.queue, /status === "uploading" \? "paused"/);
has("queue-persistent-storage", sources.queue, /navigator\.storage\.persist/);
has("queue-security-upload-capability-false", sources.queue, /rawUploadCapabilityStored:\s*false/);
has("queue-security-session-false", sources.queue, /rawSessionTokenStored:\s*false/);
has("queue-security-send-code-false", sources.queue, /sendCodeStored:\s*false/);
has("queue-security-pin-false", sources.queue, /pinStored:\s*false/);
lacks("queue-no-upload-token-field", sources.queue, /uploadToken\s*:/);
lacks("queue-no-session-token-field", sources.queue, /rawSession\s*:/);
lacks("queue-no-send-code-field", sources.queue, /sendCode\s*:/);
lacks("queue-no-pin-field", sources.queue, /pin\s*:/);

has("network-server-ping", sources.network, /api\/drop\/public\/ping/);
has("network-browser-events", sources.network, /addEventListener\("offline"/);
has("network-visibility", sources.network, /visibilitychange/);
has("network-poll", sources.network, /30_000/);
has("network-retry", sources.network, /dropFetchWithRetry/);
has("network-wait-online", sources.network, /waitForDropOnline/);
has("network-exponential-backoff", sources.network, /2 \*\* \(attempt - 1\)/);
has("network-retry-429", sources.network, /status === 429/);
has("network-retry-5xx", sources.network, /status >= 500/);

has("multipart-abort-signal", sources.multipart, /signal\?: AbortSignal/);
has("multipart-xhr-retry", sources.multipart, /xhrUploadWithRetry/);
has("multipart-checkpoint-type", sources.multipart, /DropUploadCheckpoint/);
has("multipart-checkpoint-callback", sources.multipart, /onCheckpoint\?/);
has("multipart-skip-completed", sources.multipart, /completed\.has\(partNumber\)/);
has("multipart-completed-part-list", sources.multipart, /completedPartNumbers/);
has("multipart-sign-retry", sources.multipart, /dropFetchWithRetry\(apiUrl/);
has("multipart-confirm-retry", sources.multipart, /dropFetchWithRetry\(confirmUrl/);
has("multipart-network-wait", sources.multipart, /waitForDropOnline/);
has("multipart-part-checkpoint", sources.multipart, /completedPartNumbers: \[\.\.\.completed\]/);

has("resume-expected-workflow", sources.resumeService, /expectedWorkflowType\?: DropPublicWorkflowType/);
has("resume-gate-slug-match", sources.resumeService, /DROP_PUBLIC_RESUME_GATE_MISMATCH/);
has("resume-route-workflow-query", sources.resumeRoute, /searchParams\.get\("workflowType"\)/);
has("transfer-resume-workflow-query", sources.transfer, /new URLSearchParams\(\{\s*workflowType:\s*mode\s*\}\)/);
has("resume-cookie-only-route", sources.resumeRoute, /DROP_PUBLIC_SESSION_COOKIE/);
lacks("resume-route-no-body-token", sources.resumeRoute, /request\.json/);
has("resume-service-session-resolve", sources.resumeService, /resolveDropPublicSession\(input\.rawSession/);

has("resume-controlled-context-rebind", sources.resumeService, /resolveDropPublicSession\(input\.rawSession, input\.headers, input\.expectedWorkflowType, true\)/);
has("resume-service-package-bound", sources.resumeService, /session\.packageId/);
has("resume-service-atomic-reissue", sources.resumeService, /reissueDropAccessTokenAtomic/);
has("resume-service-upload-purpose", sources.resumeService, /purpose:\s*"upload"/);
has("resume-service-no-persist", sources.resumeService, /rawTokenPersisted:\s*false/);
has("resume-security-cookie-only", sources.resumeService, /sessionCookieOnly:\s*true/);
has("resume-security-credential-false", sources.resumeService, /rawCredentialsPersisted:\s*false/);
has("resume-active-package-only", sources.resumeService, /packageRow\.status === "active"/);
has("resume-expiry-bound", sources.resumeService, /Math\.min\(Date\.parse\(packageRow\.expires_at\), Date\.parse\(session\.expiresAt\)\)/);
has("resume-route-no-store", sources.resumeRoute, /dropNoStoreHeaders/);

has("postgres-rebind-opt-in-only", sources.postgresPublicRepo, /allowBoundContextRebind = false/);
has("postgres-rebind-package-bound", sources.postgresPublicRepo, /!allowBoundContextRebind \|\| !session\.packageId/);
has("postgres-rebind-same-user-agent", sources.postgresPublicRepo, /session\.userAgentSummary !== context\.userAgentSummary/);
has("postgres-rebind-updates-ip-hash", sources.postgresPublicRepo, /update\(\{ ip_hash: context\.ipHash/);
has("file-rebind-opt-in-only", sources.filePublicRepo, /allowBoundContextRebind = false/);
has("file-rebind-package-bound", sources.filePublicRepo, /!allowBoundContextRebind \|\| !session\.packageId/);
has("file-rebind-same-user-agent", sources.filePublicRepo, /session\.userAgentSummary !== context\.userAgentSummary/);

has("ping-no-store", sources.pingRoute, /dropNoStoreHeaders/);

has("transfer-resume-first", sources.transfer, /api\/drop\/public\/packages\/resume/);
has("transfer-resume-checked", sources.transfer, /resumeChecked/);
has("transfer-no-second-gate-session", sources.transfer, /!resumeChecked\s*\|\|\s*created\s*\|\|\s*deliveredResume/);
has("transfer-delivered-clear", sources.transfer, /clearDropQueuePackage\(resume\.package\.id\)/);
has("transfer-v098", sources.transfer, /DROP 1\.2\.10/);

has("uploader-restores-indexeddb", sources.uploader, /restoreDropQueue\(packageInfo\.id\)/);
has("uploader-persists-new-files", sources.uploader, /Promise\.all\(next\.map\(persist\)\)/);
has("uploader-stable-client-id", sources.uploader, /clientUploadId: createStableDropClientUploadId/);
has("uploader-reuses-client-id", sources.uploader, /clientUploadId: item\.clientUploadId/);
has("uploader-auto-resume", sources.uploader, /autoResume/);
has("uploader-network-subscribe", sources.uploader, /subscribeDropNetworkState/);
has("uploader-background-sync", sources.uploader, /registerDropBackgroundResume/);
has("uploader-pause", sources.uploader, /pauseUpload/);
has("uploader-part-checkpoint", sources.uploader, /onCheckpoint:/);
has("uploader-delivery-clears-queue", sources.uploader, /clearDropQueuePackage\(packageInfo\.id\)/);
has("uploader-local-notification", sources.uploader, /dispatchDropLocalNotification/);
has("uploader-mobile-compact", sources.uploader, /space-y-2 sm:hidden/);
has("uploader-desktop-grid", sources.uploader, /hidden gap-4 sm:grid/);
has("uploader-offline-banner", sources.uploader, /Offline · a fájlok ezen a készüléken megmaradnak/);
has("uploader-persistent-storage-ui", sources.uploader, /Helyi tár:/);
has("uploader-v098", sources.uploader, /DROP 1\.2\.10/);

has("pwa-deterministic-network-hydration", sources.pwa, /INITIAL_NETWORK_STATE/);
has("pwa-network-monitor", sources.pwa, /initializeDropNetworkMonitor/);
has("pwa-offline-banner", sources.pwa, /data-drop-network-banner="offline"/);
has("pwa-reconnected-banner", sources.pwa, /data-drop-network-banner="reconnected"/);
has("pwa-update-banner", sources.pwa, /data-drop-update-banner/);
has("pwa-update-waiting", sources.pwa, /registration\.waiting/);
has("pwa-skip-waiting", sources.pwa, /SKIP_WAITING/);
has("pwa-controller-reload", sources.pwa, /controllerchange/);
has("pwa-notification-event", sources.pwa, /DROP_LOCAL_NOTIFICATION_EVENT/);
has("pwa-show-notification", sources.pwa, /showNotification/);
has("pwa-notification-preference", sources.pwa, /dimpro_drop_notifications_v098/);
has("pwa-resume-message", sources.pwa, /DROP_UPLOAD_RESUME_REQUESTED/);

has("dock-network-card", sources.dock, /data-drop-network-card/);
has("dock-notification-toggle", sources.dock, /Feltöltés elkészült értesítés/);
has("dock-update-card", sources.dock, /Új Drop-verzió elérhető/);
has("dock-v098", sources.dock, /DROP 1\.2\.10/);
has("events-background-sync-tag", sources.events, /dimpro-drop-upload-resume-v098/);
has("events-local-notification", sources.events, /DROP_LOCAL_NOTIFICATION_EVENT/);
has("events-no-secret-registration", sources.events, /sync\.register\(DROP_BACKGROUND_SYNC_TAG\)/);

has("sw-cache-v098", sources.sw, /dimpro-drop-static-v1210/);
has("sw-update-message", sources.sw, /SKIP_WAITING/);
has("sw-sync-tag", sources.sw, /dimpro-drop-upload-resume-v098/);
has("sw-resume-broadcast", sources.sw, /DROP_UPLOAD_RESUME_REQUESTED/);
has("sw-api-bypass", sources.sw, /url\.pathname\.startsWith\("\/api\/"\)/);
has("sw-download-bypass", sources.sw, /url\.pathname\.startsWith\("\/drop\/d\/"\)/);
has("sw-upload-bypass", sources.sw, /url\.pathname\.startsWith\("\/drop\/u\/"\)/);
has("sw-capability-bypass", sources.sw, /url\.pathname\.startsWith\("\/drop\/p\/"\)/);
lacks("sw-no-upload-token", sources.sw, /uploadToken/);
lacks("sw-no-bearer", sources.sw, /Bearer /);
lacks("sw-no-indexeddb-secret-upload", sources.sw, /indexedDB/);

console.log(JSON.stringify({ ok: true, version: "DROP 1.2.10", checks, names }, null, 2));
