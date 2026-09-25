#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const expectedHost = "dimpro-dev";
const expectedDevProjectRef = "pbgyuznivqvestuksvif";
const envDir = process.env.NEXT_ENV_PROJECT_DIR?.trim()
  || "/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35";
const envFile = path.join(envDir, ".env.local");

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
const env = { ...readEnv(envFile), ...process.env };
const value = (...keys) => keys.map((key) => String(env[key] || "").trim()).find(Boolean) || "";
const enabled = (key) => value(key).toLowerCase() === "true";
const secretReady = (...keys) => {
  const found = value(...keys);
  return Boolean(found && found.length >= 16 && !found.includes("<") && !found.includes(">"));
};
const projectRef = String(value("NEXT_PUBLIC_SUPABASE_URL")).match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1] || "";
const checks = {};
const blockers = [];
const warnings = [];
function requireCheck(key, ready, blocker, details = undefined) {
  checks[key] = details === undefined ? Boolean(ready) : { ready: Boolean(ready), ...details };
  if (!ready) blockers.push(blocker);
}
function warningCheck(condition, warning) { if (condition) warnings.push(warning); }

requireCheck("host", process.env.HOSTNAME === expectedHost || value("HOSTNAME") === expectedHost, "DEV_HOST_MISMATCH", { expected: expectedHost });
requireCheck("envFile", existsSync(envFile), "DEV_ENV_FILE_MISSING", { path: envFile });
requireCheck("devProjectRef", projectRef === expectedDevProjectRef, "DEV_SUPABASE_PROJECT_REF_MISMATCH", { projectRefPresent: Boolean(projectRef) });
requireCheck("supabaseServiceRole", secretReady("SUPABASE_SERVICE_ROLE_KEY"), "SUPABASE_SERVICE_ROLE_NOT_CONFIGURED");

const releaseGate = enabled("DROP_RELEASE_GATE_ENABLED");
const submissionGateDeliveryMode = value("DROP_SUBMISSION_GATE_DELIVERY_MODE").toLowerCase() === "manual-link" ? "manual-link" : "email";
const submissionGateEmailRequired = submissionGateDeliveryMode === "email";
requireCheck("dropReleaseGate", releaseGate, "DROP_RELEASE_GATE_DISABLED");
for (const [key, blocker] of [
  ["DROP_PACKAGE_ENGINE_ENABLED","DROP_PACKAGE_ENGINE_DISABLED"],
  ["DROP_ACCESS_GATE_ENABLED","DROP_ACCESS_GATE_DISABLED"],
  ["DROP_STORAGE_CORE_ENABLED","DROP_STORAGE_CORE_DISABLED"],
  ["DROP_QUARANTINE_UPLOAD_ENABLED","DROP_QUARANTINE_UPLOAD_DISABLED"],
  ["DROP_SUBMISSION_GATE_ENABLED","DROP_SUBMISSION_GATE_DISABLED"],
  ["DROP_DRIVE_INCOMING_ENABLED","DROP_DRIVE_INCOMING_DISABLED"],
]) requireCheck(key, releaseGate && enabled(key), blocker);
const uploadFlagReady = ["DROP_IMAGE_DROP_ENABLED","DROP_FILE_DROP_ENABLED","DROP_ZIP_UPLOAD_ENABLED","DROP_MIXED_PACKAGE_ENABLED"].some((key)=>releaseGate&&enabled(key));
requireCheck("dropPublicUploadFeature", uploadFlagReady, "DROP_PUBLIC_UPLOAD_FEATURE_DISABLED");

requireCheck("dropTokenSecurity", secretReady("DROP_TOKEN_HMAC_SECRET") && secretReady("DROP_SESSION_SECRET"), "DROP_TOKEN_SECURITY_NOT_CONFIGURED");
requireCheck("dropWorkerSecret", secretReady("DROP_WORKER_SECRET"), "DROP_WORKER_SECRET_NOT_CONFIGURED");
const scannerCommand = value("DIMPRO_DROP_VIRUS_SCANNER_COMMAND","DROP_VIRUS_SCANNER_COMMAND").toLowerCase();
requireCheck("dropScannerMode", scannerCommand === "clamd-instream", "DROP_SCANNER_MODE_NOT_READY");
const clamdSocket = value("DIMPRO_DROP_CLAMD_SOCKET") || "/var/run/clamav/clamd.ctl";
requireCheck("clamdSocket", path.isAbsolute(clamdSocket) && existsSync(clamdSocket), "DROP_CLAMD_SOCKET_NOT_READY", { absolute: path.isAbsolute(clamdSocket), exists: existsSync(clamdSocket) });

const dropProvider = (value("DIMPRO_DROP_STORAGE_PROVIDER","DROP_STORAGE_PROVIDER") || "local-private").toLowerCase();
const dropMode = value("DIMPRO_DROP_STORAGE_MODE","DROP_STORAGE_MODE").toLowerCase();
const dropBucket = value("DIMPRO_DROP_S3_BUCKET","DROP_STORAGE_BUCKET");
const dropAccess = value("DIMPRO_DROP_S3_ACCESS_KEY_ID","DROP_STORAGE_ACCESS_KEY_ID");
const driveBucket = value("DIMPRO_DRIVE_S3_BUCKET");
const driveAccess = value("DIMPRO_DRIVE_S3_ACCESS_KEY_ID");
let dropStorageConfigured = false;
let credentialIsolationReady = true;
if (dropProvider === "s3-compatible") {
  dropStorageConfigured = Boolean(
    value("DIMPRO_DROP_S3_ENDPOINT","DROP_STORAGE_ENDPOINT")
    && value("DIMPRO_DROP_S3_REGION","DROP_STORAGE_REGION")
    && dropAccess
    && secretReady("DIMPRO_DROP_S3_SECRET_ACCESS_KEY","DROP_STORAGE_SECRET_ACCESS_KEY")
    && dropBucket
  );
  credentialIsolationReady = Boolean(dropBucket && dropAccess && dropBucket !== driveBucket && dropAccess !== driveAccess);
} else {
  const root = value("DIMPRO_DROP_STORAGE_LOCAL_ROOT","DROP_STORAGE_LOCAL_ROOT") || "/var/lib/dimpro/drop";
  dropStorageConfigured = path.isAbsolute(root) && !root.includes("/public/");
}
requireCheck("dropStorageConfigured", dropStorageConfigured, "DROP_OBJECT_STORAGE_NOT_CONFIGURED", { provider: dropProvider, mode: dropMode || "disabled" });
requireCheck("dropStorageModeActive", dropMode === "active", "DROP_STORAGE_NOT_ACTIVE", { mode: dropMode || "disabled" });
requireCheck("dropDriveCredentialIsolation", credentialIsolationReady, "DROP_DRIVE_STORAGE_CREDENTIAL_ISOLATION_FAILED");

const driveStorageConfigured = Boolean(
  value("DIMPRO_DRIVE_S3_ENDPOINT")
  && value("DIMPRO_DRIVE_S3_REGION")
  && driveAccess
  && secretReady("DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY")
  && driveBucket
);
const driveMode = value("DIMPRO_DRIVE_STORAGE_MODE").toLowerCase();
requireCheck("driveStorageConfigured", driveStorageConfigured, "DRIVE_OBJECT_STORAGE_NOT_CONFIGURED", { mode: driveMode || "disabled" });
requireCheck("driveStorageWritable", driveStorageConfigured && driveMode !== "disabled", "DRIVE_OBJECT_STORAGE_NOT_WRITABLE", { mode: driveMode || "disabled" });

const publicBaseUrl = value("DROP_PUBLIC_BASE_URL");
requireCheck("dropPublicBaseUrl", /^https:\/\//i.test(publicBaseUrl), "DROP_PUBLIC_BASE_URL_NOT_CONFIGURED", { explicit: Boolean(publicBaseUrl) });

const projectRoot = value("DIMPRO_PROJECT_ROOT") || envDir;
const mailFile = path.join(projectRoot, ".dimprover", "mail", "mail-profiles.json");
let mailStorage = null;
if (existsSync(mailFile)) {
  try { mailStorage = JSON.parse(readFileSync(mailFile, "utf8")); } catch {}
}
const dropProfile = Array.isArray(mailStorage?.profiles) ? mailStorage.profiles.find((item)=>item?.id==="drop") : null;
const dropMailEnabled = dropProfile ? dropProfile.enabled !== false : true;
const dropMailAddress = value("DIMPRO_DROP_MAIL_USER","DIMPRO_MAIL_DROP_USER") || dropProfile?.address || "ertesites.drop@dimpro.hu";
const dropMailPasswordReady = secretReady("DIMPRO_DROP_MAIL_PASS","DIMPRO_MAIL_DROP_PASS","DIMPRO_MAIL_SHARED_PASS","DIMPRO_SMTP_PASS")
  || Boolean(dropProfile?.password)
  || Boolean(mailStorage?.sharedPassword);
const smtpHostReady = Boolean(dropProfile?.smtpHost || mailStorage?.smtpHost || value("DIMPRO_MAIL_SMTP_HOST","DIMPRO_SMTP_HOST") || "vuhzuqtm.loginssl.com");
const dropMailProfileReady = dropMailEnabled && Boolean(dropMailAddress) && dropMailPasswordReady && smtpHostReady;
if (submissionGateEmailRequired) {
  requireCheck("dropEmailNotificationsFeature", releaseGate && enabled("DROP_EMAIL_NOTIFICATIONS_ENABLED"), "DROP_EMAIL_NOTIFICATIONS_DISABLED");
  requireCheck("dropMailProfile", dropMailProfileReady, "DROP_MAIL_PROFILE_NOT_READY", {
    storageFilePresent: existsSync(mailFile),
    profileEnabled: dropMailEnabled,
    addressConfigured: Boolean(dropMailAddress),
    passwordConfigured: dropMailPasswordReady,
    smtpHostConfigured: smtpHostReady,
  });
} else {
  checks.dropEmailNotificationsFeature = { ready: true, required: false, mode: submissionGateDeliveryMode };
  checks.dropMailProfile = {
    ready: true,
    required: false,
    mode: submissionGateDeliveryMode,
    configured: dropMailProfileReady,
  };
  if (!dropMailProfileReady) warnings.push("DROP_MAIL_PROFILE_OPTIONAL_IN_MANUAL_LINK_MODE");
}

const restUrl = value("NEXT_PUBLIC_SUPABASE_URL");
const serviceRole = value("SUPABASE_SERVICE_ROLE_KEY");
async function rest(pathname) {
  if (!restUrl || !serviceRole) return { ok:false, status:0, body:null };
  const response = await fetch(`${restUrl}/rest/v1/${pathname}`, { headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}`, accept:"application/json" } });
  let body=null; try { body=await response.json(); } catch {}
  return { ok:response.ok, status:response.status, body };
}
const dropMarkersRes = await rest("drop_schema_meta?select=component,schema_version,migration_count,bootstrap_id,metadata&component=in.(drop-core,drop-storage,drop-public-workflows)");
const dropMarkers = Array.isArray(dropMarkersRes.body) ? Object.fromEntries(dropMarkersRes.body.map((row)=>[row.component,row])) : {};
requireCheck("dropCoreSchema", Boolean(dropMarkers["drop-core"]), "DROP_CORE_SCHEMA_NOT_READY");
requireCheck("dropStorageSchema", dropMarkers["drop-storage"]?.schema_version === "DROP 0.5.0", "DROP_STORAGE_SCHEMA_NOT_READY", { version: dropMarkers["drop-storage"]?.schema_version || null });
requireCheck("dropPublicWorkflowSchema", dropMarkers["drop-public-workflows"]?.schema_version === "DROP 0.9.5", "DROP_PUBLIC_WORKFLOW_SCHEMA_NOT_READY", { version: dropMarkers["drop-public-workflows"]?.schema_version || null });
const publicGateTable = await rest("drop_public_submission_gates?select=id&limit=0");
requireCheck("dropPublicGateTable", publicGateTable.ok, "DROP_PUBLIC_GATE_TABLE_NOT_READY", { status: publicGateTable.status });

const driveMarkersRes = await rest("drive_storage_schema_meta?select=component,schema_version,migration_count,bootstrap_id&component=in.(drive-object-storage,drive-quarantine-review,drive-document-flow)");
const driveMarkers = Array.isArray(driveMarkersRes.body) ? Object.fromEntries(driveMarkersRes.body.map((row)=>[row.component,row])) : {};
requireCheck("driveObjectStorageSchema", driveMarkers["drive-object-storage"]?.schema_version === "0.4.0", "DRIVE_OBJECT_STORAGE_SCHEMA_NOT_READY", { version: driveMarkers["drive-object-storage"]?.schema_version || null });
requireCheck("driveReviewSchema", driveMarkers["drive-quarantine-review"]?.schema_version === "0.4.1", "DRIVE_REVIEW_SCHEMA_NOT_READY", { version: driveMarkers["drive-quarantine-review"]?.schema_version || null });
requireCheck("driveDocumentFlowSchema", driveMarkers["drive-document-flow"]?.schema_version === "0.1.0", "DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY", { version: driveMarkers["drive-document-flow"]?.schema_version || null });

const hasDbCredential = Boolean(value("DRIVE_DOCUMENT_FLOW_DB_PASSWORD","PGPASSWORD")) || existsSync(value("PGPASSFILE") || path.join(process.env.HOME || "/root", ".pgpass"));
if (!checks.driveDocumentFlowSchema?.ready && !hasDbCredential) warnings.push("DEV_DB_CREDENTIAL_REQUIRED_FOR_DOCUMENT_FLOW_MIGRATION");
warningCheck(dropProvider !== "s3-compatible", "DROP_STORAGE_PROVIDER_IS_NOT_EXTERNAL_S3");
warningCheck(dropMarkers["drop-public-workflows"]?.metadata?.activeStore !== "postgresql", "DROP_PUBLIC_WORKFLOW_POSTGRES_ACTIVATION_NOT_CONFIRMED");

const result = {
  ok: true,
  environment: "DEV",
  productionAccess: "DENY",
  projectRef: projectRef || null,
  submissionGateDeliveryMode,
  ready: blockers.length === 0,
  blockerCount: blockers.length,
  blockers,
  warnings,
  checks,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(result,null,2));
process.exit(result.ready ? 0 : 3);
