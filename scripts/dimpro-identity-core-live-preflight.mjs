import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function loadEnvFile(file) {
  try {
    const content = await readFile(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local env file.
  }
}

await loadEnvFile(path.join(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.log(JSON.stringify({
    ok: false,
    ready: false,
    blocker: "SUPABASE_SERVER_CONFIG_MISSING",
    message: "A Supabase URL vagy service role kulcs hiányzik.",
  }, null, 2));
  process.exit(0);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const requiredTables = [
  "dimpro_users",
  "dimpro_organizations",
  "dimpro_organization_memberships",
  "dimpro_licenses",
  "dimpro_license_modules",
  "dimpro_membership_modules",
  "dimpro_organization_invitations",
  "dimpro_projects",
  "dimpro_project_memberships",
  "dimpro_project_drop_settings",
  "dimpro_send_entitlements",
  "dimpro_send_recipients",
  "dimpro_access_audit_logs",
  "dimpro_access_rate_limits",
];

const markerResult = await client
  .from("dimpro_identity_schema_meta")
  .select("component,schema_version,migration_count,bootstrap_id,metadata,updated_at")
  .eq("component", "dimpro-identity-core")
  .maybeSingle();
const tableResults = await Promise.all(requiredTables.map(async (table) => {
  const result = await client.from(table).select("*").limit(0);
  return {
    table,
    ready: !result.error,
    code: result.error?.code || null,
    message: result.error?.message || null,
  };
}));

const marker = markerResult.data || null;
const ready = !markerResult.error
  && marker?.component === "dimpro-identity-core"
  && marker?.schema_version === "0.2.0"
  && Number(marker?.migration_count || 0) >= 4
  && marker?.bootstrap_id === "dimpro-identity-org-license-v020-20260810"
  && tableResults.every((item) => item.ready);

console.log(JSON.stringify({
  ok: ready,
  ready,
  enabled: process.env.DIMPRO_IDENTITY_CORE_ENABLED?.trim().toLowerCase() === "true",
  marker: marker ? {
    component: marker.component,
    schemaVersion: marker.schema_version,
    migrationCount: marker.migration_count,
    bootstrapId: marker.bootstrap_id,
    metadata: marker.metadata,
    updatedAt: marker.updated_at,
  } : null,
  markerError: markerResult.error ? {
    code: markerResult.error.code || null,
    message: markerResult.error.message,
  } : null,
  tables: tableResults,
  nextAction: ready
    ? "A központi Identity Core séma telepítve van; a feature gate és az API-regresszió ellenőrizhető."
    : "Futtassa a supabase/IDENTITY 0.2.0 migrációkat a kijelölt Supabase SQL Editorban, majd ismételje meg a preflightot.",
}, null, 2));
