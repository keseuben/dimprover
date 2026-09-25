#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const expectedProjectRef = "pbgyuznivqvestuksvif";
const expected = {
  component: "drive-document-flow",
  schemaVersion: "0.1.0",
  migrationCount: 1,
  bootstrapId: "drive-document-flow-v010-20260925",
};
const tables = [
  "drive_core_document_governance",
  "drive_core_document_issues",
  "drive_core_document_issue_recipients",
];

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at <= 0) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
function projectRef(url) {
  return String(url || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1] || "";
}
function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok: false, code, message, ...details }, null, 2));
  process.exit(2);
}

const envDir = process.env.NEXT_ENV_PROJECT_DIR?.trim()
  || "/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35";
const fileEnv = readEnv(join(envDir, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "";
const ref = projectRef(url);
if (!url || !key || !ref) fail("DRIVE_DOCUMENT_FLOW_REST_PROBE_NOT_CONFIGURED", "DEV Supabase URL/service role is not configured.");
if (ref !== expectedProjectRef) fail("DRIVE_DOCUMENT_FLOW_REST_PROBE_TARGET_MISMATCH", "REST probe target is not canonical DEV.", { expectedProjectRef, actualProjectRef: ref });

const headers = { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" };
async function request(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  let body = null;
  try { body = await response.json(); } catch {}
  return {
    status: response.status,
    ok: response.ok,
    errorCode: body && !Array.isArray(body) ? body.code || null : null,
    body,
  };
}
const checks = [];
for (const table of tables) {
  const result = await request(`${table}?select=*&limit=0`);
  checks.push({ table, ready: result.ok, status: result.status, errorCode: result.errorCode });
}
const marker = await request(`drive_storage_schema_meta?select=schema_version,migration_count,bootstrap_id&component=eq.${encodeURIComponent(expected.component)}&limit=1`);
const row = Array.isArray(marker.body) ? marker.body[0] || null : null;
const markerReady = marker.ok
  && row?.schema_version === expected.schemaVersion
  && Number(row?.migration_count) === expected.migrationCount
  && row?.bootstrap_id === expected.bootstrapId;
const ready = checks.every((x) => x.ready) && markerReady;
console.log(JSON.stringify({
  ok: true,
  environment: "DEV",
  productionAccess: "DENY",
  projectRef: ref,
  ready,
  expected,
  actual: row,
  checks,
  markerStatus: marker.status,
  markerErrorCode: marker.errorCode,
}, null, 2));
process.exit(ready ? 0 : 3);
