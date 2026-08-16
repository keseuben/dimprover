#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.env.DIMPRO_PROJECT_ROOT?.trim() || process.cwd());
const baseUrl = (process.env.BENJADMIN_ACTIVITY_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const host = process.env.BENJADMIN_ACTIVITY_HOST || "admin.dev.dimpro.hu";

function fail(message, code = 1) {
  console.error(`[BENJADMIN worker activity] ${message}`);
  process.exit(code);
}

if (!host.endsWith(".dev.dimpro.hu") && host !== "admin.dev.dimpro.hu") fail(`Nem DEV host: ${host}`, 78);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl) && process.env.BENJADMIN_ACTIVITY_ALLOW_REMOTE_DEV !== "1") {
  fail(`A worker activity helper alapértelmezetten csak helyi DEV endpointot használhat: ${baseUrl}`, 78);
}

const keyPath = process.env.BENJADMIN_ACTIVITY_ADMIN_KEY_FILE || path.join(root, ".dimprover", "license", "admin-key.txt");
let adminKey = "";
try { adminKey = fs.readFileSync(keyPath, "utf8").trim(); } catch { /* handled below */ }
if (!adminKey) fail("Hiányzik a helyi DEV admin key.", 78);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
if (!raw.trim()) fail("JSON activity payload szükséges stdin-en.", 64);
let payload;
try { payload = JSON.parse(raw); } catch { fail("Érvénytelen JSON activity payload.", 64); }

const response = await fetch(`${baseUrl}/api/dev/console/activity`, {
  method: "POST",
  headers: {
    Host: host,
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  },
  body: JSON.stringify(payload),
  cache: "no-store",
});
const result = await response.json().catch(() => null);
if (!response.ok || !result?.ok) fail(result?.error || `Worker activity HTTP ${response.status}`);
console.log(JSON.stringify({
  ok: true,
  messageId: result.message?.id || null,
  kind: result.message?.kind || null,
  sanitized: Boolean(result.sanitized),
  sensitiveFindingCount: Array.isArray(result.sensitiveFindings) ? result.sensitiveFindings.length : 0,
}));
