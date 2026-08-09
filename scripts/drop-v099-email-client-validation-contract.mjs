import { readFile } from "node:fs/promises";

const files = {
  template: await readFile("app/lib/drop/public/dropPublicEmailTemplate.ts", "utf8"),
  email: await readFile("app/lib/drop/public/dropPublicEmail.ts", "utf8"),
  service: await readFile("app/lib/drop/validation/dropEmailClientValidation.ts", "utf8"),
  route: await readFile("app/api/drop/admin/email-validation/route.ts", "utf8"),
  panel: await readFile("components/drop/DropEmailClientValidationPanel.tsx", "utf8"),
  manager: await readFile("components/drop/DropPublicWorkflowManager.tsx", "utf8"),
  runtime: await readFile("app/lib/drop/dropRuntime.ts", "utf8"),
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

has("shared-production-template-export", files.template, /export function buildDropPublicDeliveryEmailContent/);
has("production-mail-uses-shared-template", files.email, /buildDropPublicDeliveryEmailContent\(/);
has("full-html-document", files.template, /<!doctype html>/i);
has("email-client-table-layout", files.template, /<table role="presentation"/);
has("light-color-scheme-meta", files.template, /name="color-scheme" content="light(?: dark)?"/);
has("cid-inline-image", files.template, /src="cid:\$\{escapeHtml\(preview\.cid\)\}"/);
has("test-banner", files.template, /TESZTÜZENET – NEM VALÓDI FÁJLKÜLDEMÉNY/);
has("test-link-label", files.template, /Tesztoldal megnyitása/);
has("plain-text-fallback", files.template, /const text = \[/);
has("alt-text", files.template, /előnézete"/);

has("eight-client-options", files.service, /gmail_web[\s\S]*gmail_mobile[\s\S]*thunderbird[\s\S]*outlook_desktop[\s\S]*outlook_mobile[\s\S]*ios_mail[\s\S]*android_mail[\s\S]*other/);
has("three-synthetic-images", files.service, /sample-jpeg[\s\S]*sample-png[\s\S]*sample-heic/);
has("pdf-file-card", files.service, /muszaki-tervcsomag\.pdf/);
has("zip-file-card", files.service, /dokumentumcsomag\.zip/);
has("browser-cid-data-replacement", files.service, /replaceAll\(`cid:\$\{preview\.cid\}`/);
has("manual-recipient", files.service, /DROP_EMAIL_VALIDATION_RECIPIENT_INVALID/);
has("explicit-confirmation", files.service, /confirmation !== "TESZT"/);
has("same-recipient-cooldown", files.service, /SAME_RECIPIENT_COOLDOWN_MS = 60_000/);
has("daily-limit", files.service, /MAX_DAILY_SENDS = 20/);
has("atomic-history-write", files.service, /writeFile\(temporary[\s\S]*rename\(temporary, validationFile\)/);
has("history-mode-0600", files.service, /mode: 0o600/);
has("review-passed", files.service, /"passed"/);
has("review-failed", files.service, /"failed"/);
has("review-pending", files.service, /"pending"/);
has("production-template-flag", files.service, /usesProductionTemplate: true/);
has("no-real-package-access", files.service, /realPackageAccessGranted: false/);
has("not-public-endpoint", files.service, /publicEndpoint: false/);

has("admin-auth-get", files.route, /export async function GET[\s\S]*isLicenseAdminAuthorized/);
has("admin-auth-post", files.route, /export async function POST[\s\S]*isLicenseAdminAuthorized/);
has("admin-auth-patch", files.route, /export async function PATCH[\s\S]*isLicenseAdminAuthorized/);
has("rate-limit-http-429", files.route, /RATE_LIMIT[\s\S]*429/);
has("send-failure-http-502", files.route, /SEND_FAILED[\s\S]*502/);
has("no-store", files.route, /dropNoStoreHeaders/);

has("panel-manual-email", files.panel, /Tesztcímzett/);
has("panel-confirmation", files.panel, /Megerősítés: TESZT/);
has("panel-no-default-recipient", files.panel, /useState\(""\)/);
has("panel-preview-iframe", files.panel, /srcDoc=\{preview\.browserHtml\}/);
has("panel-sandbox", files.panel, /sandbox=""/);
has("panel-review-pass", files.panel, /Megfelelt/);
has("panel-review-fail", files.panel, /Hibás/);
has("panel-rate-info", files.panel, /sameRecipientCooldownSeconds/);
has("manager-integration", files.manager, /<DropEmailClientValidationPanel adminKey=\{adminKey\}\/>/);

has("runtime-version", files.runtime, /version: "DROP 0\.9\.9"/);
has("runtime-admin-tool", files.runtime, /emailClientValidationAdminTool: true/);
has("runtime-production-template", files.runtime, /emailClientValidationUsesProductionTemplate: true/);
has("runtime-safety-block", files.runtime, /emailClientValidation: \{[\s\S]*adminOnly: true[\s\S]*originalFilesAttached: false[\s\S]*publicEndpoint: false/);
lacks("no-old-version", Object.values(files).join("\n"), /DROP 0\.9\.8/);
lacks("no-original-file-attachments", files.email, /attachments:\s*input\.files|content:\s*file\./);

console.log(JSON.stringify({ ok: true, passed: checks.length, total: checks.length, checks }, null, 2));
