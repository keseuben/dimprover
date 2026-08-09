import { readFile } from "node:fs/promises";

const files = {
  validation: await readFile("app/lib/drop/validation/dropPrivatePilotValidation.ts", "utf8"),
  validationRoute: await readFile("app/api/drop/admin/private-pilot-validation/route.ts", "utf8"),
  validationPanel: await readFile("components/drop/DropPrivatePilotValidationPanel.tsx", "utf8"),
  manager: await readFile("components/drop/DropPublicWorkflowManager.tsx", "utf8"),
  emailTemplate: await readFile("app/lib/drop/public/dropPublicEmailTemplate.ts", "utf8"),
  emailContract: await readFile("scripts/drop-v099-email-client-validation-contract.mjs", "utf8"),
  downloadPanel: await readFile("components/drop/DropSecureDownloadPanel.tsx", "utf8"),
  zipRoute: await readFile("app/api/drop/downloads/package/zip/route.ts", "utf8"),
  preflight: await readFile("scripts/drop-v100-private-pilot-preflight.mjs", "utf8"),
  handoff: await readFile("DIMPROVER_PRODUCT_DOCS/106_dimpro_drop_new_chat_handoff_after_v099.md", "utf8"),
};

const checks = [];
function has(name, source, pattern) {
  const ok = pattern.test(source);
  checks.push({ name, ok });
  if (!ok) throw new Error(`Hiányzó szerződés: ${name}`);
}
function lacks(name, source, pattern) {
  const ok = !pattern.test(source);
  checks.push({ name, ok });
  if (!ok) throw new Error(`Tiltott szerződés: ${name}`);
}

has("target-version", files.validation, /productVersion: "DROP 1\.0\.0"/);
has("six-categories", files.validation, /mobile[\s\S]*email[\s\S]*zip[\s\S]*accessibility[\s\S]*operations[\s\S]*release/);
has("iphone-safari", files.validation, /id: "iphone_safari"/);
has("iphone-pwa-icon", files.validation, /id: "iphone_pwa_icon"/);
has("iphone-ten-camera", files.validation, /id: "iphone_camera_10"/);
has("iphone-network-switch", files.validation, /id: "iphone_network_switch"/);
has("iphone-low-power", files.validation, /id: "iphone_low_power_wakelock"/);
has("android-chrome", files.validation, /id: "android_chrome"/);
has("android-maskable", files.validation, /id: "android_maskable_icon"/);
has("android-ten-camera", files.validation, /id: "android_camera_10"/);
has("android-network-switch", files.validation, /id: "android_network_switch"/);
has("android-battery-saver", files.validation, /id: "android_battery_saver_wakelock"/);

has("gmail-web-light", files.validation, /id: "gmail_web_light"/);
has("gmail-web-dark", files.validation, /id: "gmail_web_dark"/);
has("gmail-mobile-light", files.validation, /id: "gmail_mobile_light"/);
has("gmail-mobile-dark", files.validation, /id: "gmail_mobile_dark"/);
has("thunderbird-light", files.validation, /id: "thunderbird_light"/);
has("thunderbird-dark", files.validation, /id: "thunderbird_dark"/);
has("outlook-apple-light", files.validation, /id: "outlook_or_apple_light"/);
has("outlook-apple-dark", files.validation, /id: "outlook_or_apple_dark"/);

has("pin-package", files.validation, /id: "pin_zip_create"/);
has("pin-proof-cookie", files.validation, /id: "pin_proof_cookie"/);
has("wrong-pin-limit", files.validation, /id: "pin_wrong_attempt_limit"/);
has("real-zip", files.validation, /id: "pin_zip_download"/);
has("hash-audit", files.validation, /id: "pin_zip_hash_audit"/);
has("expiry", files.validation, /id: "pin_expiry"/);
has("cleanup", files.validation, /id: "pin_cleanup"/);

has("keyboard", files.validation, /id: "keyboard_navigation"/);
has("screen-reader", files.validation, /id: "screen_reader_labels"/);
has("zoom-200", files.validation, /id: "zoom_200"/);
has("light-contrast", files.validation, /id: "contrast_light"/);
has("dark-contrast", files.validation, /id: "contrast_dark"/);
has("error-messages", files.validation, /id: "final_error_messages"/);

has("large-zip-state", files.validation, /id: "large_zip_state"/);
has("large-zip-performance", files.validation, /id: "large_zip_performance"/);
has("scanner-performance", files.validation, /id: "scanner_wait_performance"/);
has("smtp-metrics", files.validation, /id: "smtp_delivery_metrics"/);
has("backup-restore", files.validation, /id: "backup_restore"/);
has("privacy-terms", files.validation, /id: "privacy_terms"/);

has("release-regression", files.validation, /id: "release_full_regression"/);
has("release-physical", files.validation, /id: "release_physical_matrix"/);
has("release-email", files.validation, /id: "release_email_matrix"/);
has("release-pin-zip", files.validation, /id: "release_pin_zip_e2e"/);
has("release-backup", files.validation, /id: "release_backup_rollback"/);
has("release-docs", files.validation, /id: "release_documentation"/);
has("release-feedback", files.validation, /id: "release_private_pilot_feedback"/);

has("atomic-state-write", files.validation, /writeFile\(temporary[\s\S]*rename\(temporary, stateFile\)/);
has("state-mode-0600", files.validation, /mode: 0o600/);
has("validation-dir-0700", files.validation, /mode: 0o700/);
has("manual-release-required", files.validation, /manualReleaseRequired: true/);
has("automated-no-release", files.validation, /automatedChecksCannotRelease: true/);
has("no-raw-token-storage", files.validation, /rawTokensStored: false/);
has("critical-gate", files.validation, /criticalFailed[\s\S]*criticalOpen[\s\S]*releaseGate/);
has("completion-percent", files.validation, /completionPercent/);

has("admin-auth-get", files.validationRoute, /export async function GET[\s\S]*isLicenseAdminAuthorized/);
has("admin-auth-patch", files.validationRoute, /export async function PATCH[\s\S]*isLicenseAdminAuthorized/);
has("admin-no-store", files.validationRoute, /dropNoStoreHeaders/);
has("admin-unauthorized", files.validationRoute, /DROP_PRIVATE_PILOT_UNAUTHORIZED/);

has("panel-release-gate", files.validationPanel, /private-pilot release gate/);
has("panel-progress", files.validationPanel, /completionPercent/);
has("panel-evidence", files.validationPanel, /Bizonyíték \/ hivatkozás/);
has("panel-device", files.validationPanel, /Eszköz \/ kliens/);
has("panel-environment", files.validationPanel, /Környezet/);
has("panel-open-filter", files.validationPanel, /Csak nyitott tételek/);
has("panel-aria-live", files.validationPanel, /aria-live="polite"/);
has("panel-manager-integration", files.manager, /<DropPrivatePilotValidationPanel adminKey=\{adminKey\}\/>/);

has("email-light-dark-meta", files.emailTemplate, /name="supported-color-schemes" content="light dark"/);
has("email-dark-media", files.emailTemplate, /prefers-color-scheme: dark/);
has("email-outlook-dark", files.emailTemplate, /\[data-ogsc\] \.drop-shell/);
has("email-dark-pin", files.emailTemplate, /\.drop-pin/);
has("email-contract-compatible", files.emailContract, /light\(\?: dark\)\?/);

has("zip-request-id", files.downloadPanel, /createZipRequestId/);
has("zip-elapsed", files.downloadPanel, /zipElapsed/);
has("zip-large-warning", files.downloadPanel, /LARGE_ZIP_BYTES/);
has("zip-mobile-help", files.downloadPanel, /telefon tárhelyére/);
has("zip-aria-live", files.downloadPanel, /aria-live="polite"/);
has("zip-save-picker", files.downloadPanel, /showSaveFilePicker/);
has("zip-stream-to-file", files.downloadPanel, /response\.body\.getReader\(\)/);
has("zip-abort-controller", files.downloadPanel, /AbortController/);
has("zip-cancel-action", files.downloadPanel, /ZIP letöltés megszakítása/);
has("zip-ready-cookie", files.zipRoute, /dimpro_drop_zip_ready/);
has("zip-cookie-secure", files.zipRoute, /Secure; SameSite=Strict/);
has("zip-stream-header", files.zipRoute, /x-dimpro-drop-zip-stage/);
has("zip-max-duration", files.zipRoute, /maxDuration = 900/);
has("zip-node-stream", files.zipRoute, /NodeReadable\.toWeb/);

has("preflight-active-release", files.preflight, /active_release/);
has("preflight-health", files.preflight, /https_health/);
has("preflight-icons", files.preflight, /icon_dimensions/);
has("preflight-disk", files.preflight, /VPS tárhely release gate/);
has("preflight-backup", files.preflight, /Fejlesztés előtti backup/);
has("preflight-clamav", files.preflight, /ClamAV szolgáltatások/);
has("preflight-worker", files.preflight, /Drop worker timer/);
has("preflight-report", files.preflight, /drop-v100-preflight\.json/);

has("percentage-drop", files.handoff, /DIMPRO Drop \| 94%/);
has("percentage-backend", files.handoff, /DIMPRO Drive backend \| 72%/);
has("percentage-web", files.handoff, /DIMPRO Drive webes felület \| 58%/);
has("percentage-desktop", files.handoff, /Drive Desktop \| 38%/);
has("percentage-archive", files.handoff, /Drop → Drive archiválás \| 78%/);
has("percentage-suite", files.handoff, /Teljes Drop \+ Drive termékcsomag \| 68%/);

console.log(JSON.stringify({ ok: true, passed: checks.length, total: checks.length, checks }, null, 2));
