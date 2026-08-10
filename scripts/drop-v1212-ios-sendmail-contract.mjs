import { readFile } from "node:fs/promises";

const files = {
  route: await readFile("app/api/dimpro-identity/admin/send-entitlements/route.ts", "utf8"),
  admin: await readFile("app/lib/identity-core/admin.ts", "utf8"),
  email: await readFile("app/lib/identity-core/send-code-email.ts", "utf8"),
  workflow: await readFile("components/drop/DropPublicWorkflowManager.tsx", "utf8"),
  prep: await readFile("components/drop/dropUploadPreparation.ts", "utf8"),
  shell: await readFile("components/drop/DropPwaShell.tsx", "utf8"),
  release: await readFile("components/drop/dropPwaReleaseInfo.ts", "utf8"),
  sw: await readFile("public/drop-sw.js", "utf8"),
  security: await readFile("app/lib/drop/storage/dropFileSecurity.ts", "utf8"),
};
const checks = [];
function has(name, source, pattern) {
  const ok = pattern.test(source);
  checks.push({ name, ok });
  if (!ok) throw new Error(`Contract FAIL: ${name}`);
}

has("identity-api-v022", files.route, /IDENTITY CORE 0\.2\.2/);
has("send-code-email-helper", files.route, /sendDimproSendCodeEmail/);
has("send-code-email-on-create", files.route, /deliverSendCode\(context, created\.rawCode, "created"\)/);
has("send-code-email-on-rotate", files.route, /deliverSendCode\(rotated, rotated\.rawCode, "rotated"\)/);
has("send-mail-audit", files.admin, /send_code_email_sent/);
has("send-mail-failure-audit", files.admin, /send_code_email_failed/);
has("send-code-rotation-audit", files.admin, /send_entitlement_code_rotated/);
has("send-code-hmac-only", files.admin, /code_hash: hashDimproSendCode\(rawCode\)/);
has("send-email-subject", files.email, /Saját DIMPRO Send-kód/);
has("send-email-noreply", files.email, /profileId: "noreply"/);
has("send-email-drop-link", files.email, /https:\/\/drop\.dimpro\.hu\/send/);
has("workflow-email-delivery-state", files.workflow, /emailDelivery/);
has("workflow-rotate-button", files.workflow, /Új kód \+ e-mail/);
has("heic-fallback-original", files.prep, /eredeti HEIC fájl kerül feltöltésre/);
has("heic-preview-disabled", files.prep, /&& !isHeicFile\(uploadFile\)/);
has("server-heic-extension", files.security, /"heic"/);
has("server-heif-extension", files.security, /"heif"/);
has("ios-install-help-state", files.shell, /showIosInstallHelp/);
has("ios-install-click-opens-guide", files.shell, /setShowIosInstallHelp\(true\)/);
has("ios-safari-detection", files.shell, /crios\|fxios\|edgios\|opios/i);
has("ios-guide-marker", files.shell, /data-drop-ios-install-guide/);
has("ios-guide-add-home", files.shell, /Főképernyőhöz adás/);
has("ios-guide-webapp", files.shell, /Megnyitás webalkalmazásként/);
has("drop-release-v1212", files.release, /version: "1\.2\.12"/);
has("drop-release-date", files.release, /2026-08-10/);
has("sw-release-v1212", files.sw, /DROP_SW_VERSION = "DROP 1\.2\.12"/);
has("sw-cache-v1212", files.sw, /STATIC_CACHE = "dimpro-drop-static-v1212"/);
console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks.map((item) => item.name) }, null, 2));
