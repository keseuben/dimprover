import { readFileSync } from "node:fs";
import { assessPersonalPilotIsolation }
  from "../app/lib/content-core/personalPilotIsolation.ts";

/**
 * Read-only pilot environment sanity check. Input is environment variables and
 * a separately approved operations inventory file (optional).
 * NEVER contacts S3/DB/AUTH, writes data, or prints credentials/URLs/buckets.
 *
 * Usage (after independent ops verification, in DEV only):
 *   node scripts/drive-personal-v0963-isolation-preflight.mjs /path/to/approved-inventory.json
 *
 * No inventory => NO-GO, not a bypass. The release process must verify the
 * approval provenance OUTSIDE this script; a JSON bool is not a signature.
 */
const evidencePath = process.argv[2] || "";
if (process.argv.length > 3 || (evidencePath && !evidencePath.startsWith("/"))) {
  console.log(JSON.stringify({ok:false,status:"NO_GO",findings:["INVENTORY_ARGUMENT_INVALID"]}));
  process.exitCode = 2;
} else {
  let evidence = null;
  let readError = false;
  if (evidencePath) {
    try {
      evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    } catch {
      readError = true;
    }
  }
  const env = process.env;
  const result = assessPersonalPilotIsolation({
    productionAccess: env.DIMPRO_PRODUCTION_ACCESS,
    authEnvironment: env.DIMPRO_AUTH_ENVIRONMENT,
    personalUploadEnabled: env.DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED,
    storageMode: env.DIMPRO_DRIVE_STORAGE_MODE,
    storageEndpoint: env.DIMPRO_DRIVE_S3_ENDPOINT,
    storageBucket: env.DIMPRO_DRIVE_S3_BUCKET,
    storageRegion: env.DIMPRO_DRIVE_S3_REGION,
    storageAccessKeyPresent: Boolean(env.DIMPRO_DRIVE_S3_ACCESS_KEY_ID),
    storageSecretKeyPresent: Boolean(env.DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY),
    databaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    databaseServiceKeyPresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    maxUploadMiB: Number(env.DIMPRO_DRIVE_MAX_UPLOAD_MB || 100),
  }, evidence);
  const ok = !readError && result.eligibleForIsolatedE2E;
  console.log(JSON.stringify({
    ok, status:ok?"POLICY_PREFLIGHT_PASS_STILL_REQUIRES_HUMAN_APPROVAL":"NO_GO",
    findings:[...(readError?["INVENTORY_UNREADABLE"]:[]),...result.findings],
    writesPerformed:0, secretsExposed:false,
  }, null, 2));
  if (!ok) process.exitCode = 2;
}
