import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const sql = read("supabase/migrations/20261002_drive_revision_model_v080.sql");
const schema = read("app/lib/drive-core/schema.ts");
const types = read("app/lib/drive-core/types.ts");
const repo = read("app/lib/drive-core/databaseRepository.ts");
const storage = read("app/lib/drive-core/storageService.ts");
const versionRoute = read("app/api/projects/[projectId]/drive/documents/[documentId]/versions/route.ts");
const workspace = read("components/drive/DriveWorkspace.tsx");
const flowMigration = read("supabase/migrations/20260925_drive_document_flow_v010.sql");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("Current Drive Core schema retains V080 and has advanced to V086", () => assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.8\.6"/));
check("Current Drive Core migration count has advanced to 7", () => assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 7/));
check("V080 migration preserves its revision-model bootstrap marker", () => assert.match(sql, /drive-core-v080-revision-model-20261002/));
check("V080 migration requires V070 predecessor", () => assert.match(sql, /v_schema_version\s*=.*0\.7\.0[\s\S]*?v_migration_count\s*=\s*4[\s\S]*?drive-core-v070-folder-acl-20261001/));
check("documents gain stable export alias", () => assert.match(sql, /add column if not exists export_alias text not null default/));
check("export alias is ASCII-safe and bounded", () => assert.match(sql, /drive_core_documents_export_alias_check[\s\S]*?length\(export_alias\) between 1 and 40[\s\S]*?A-Za-z0-9/));
check("versions gain independent revision number", () => assert.match(sql, /add column if not exists revision_number integer not null default 0/));
check("versions gain explicit version kind", () => assert.match(sql, /add column if not exists version_kind text not null default[^\n]*VERSION/));
check("versions gain revision reason and date", () => { assert.match(sql, /revision_reason text not null default/); assert.match(sql, /revision_date date null/); });
check("legacy revision_code text is not rewritten destructively", () => assert.doesNotMatch(sql, /set\s+revision_code\s*=/i));
check("legacy numeric revision derives only from R code", () => { assert.match(sql, /revision_code ~ /); assert.match(sql, /substring\(revision_code from 2\)::integer/); });
check("new document is V1 R00 INITIAL", () => assert.match(sql, /v_document\.id, 1,[\s\S]*?0,[\s\S]{0,24}R00[\s\S]{0,24}INITIAL/));
check("technical VERSION increments version only", () => assert.match(sql, /else[\s\S]*?v_revision_number := coalesce\(v_current_version\.revision_number,0\)[\s\S]*?v_revision_code :=/));
check("official REVISION increments revision counter", () => assert.match(sql, /v_kind = [^\n]*REVISION[\s\S]*?revision_number,0\) \+ 1/));
check("official REVISION requires reason", () => assert.match(sql, /DRIVE_REVISION_REASON_REQUIRED/));
check("object finalize reads explicit versionKind", () => assert.match(sql, /v_session\.metadata->>[^\n]*versionKind/));
check("object finalize reads revision reason\/date", () => { assert.match(sql, /v_session\.metadata->>[^\n]*revisionReason/); assert.match(sql, /v_session\.metadata->>[^\n]*revisionDate/); });
check("upload service persists revision model metadata", () => { for (const key of ["versionKind", "revisionReason", "revisionDate", "exportAlias"]) assert.match(storage, new RegExp(key)); });
check("normal web upload no longer sends V1 as revision", () => assert.doesNotMatch(workspace, /revisionCode:\s*"V1"/));
check("normal web upload identifies initial version kind", () => assert.match(workspace, /versionKind:\s*"INITIAL"/));
check("metadata-only revision requires reason before RPC", () => assert.match(repo, /versionKind === "REVISION" && !revisionReason/));
check("version route rechecks document ACL", () => assert.match(versionRoute, /requireDriveDocumentAccess\(projectId, documentId, access\.access\)/));
check("core types separate revision number and version kind", () => { assert.match(types, /revisionNumber: number/); assert.match(types, /versionKind: DriveVersionKind/); });
check("core document exposes stable export alias", () => assert.match(types, /exportAlias: string/));
check("schema readiness probes new fields", () => { assert.match(schema, /export_alias/); assert.match(schema, /revision_number/); assert.match(schema, /version_kind/); });
check("issuance status remains in Document Flow", () => { assert.match(flowMigration, /issue_status/); assert.doesNotMatch(sql, /add column if not exists issue_status/); });
check("core revision model does not duplicate business status", () => assert.doesNotMatch(sql, /add column if not exists business_status/));
check("migration is transactional", () => { assert.match(sql, /^begin;/m); assert.match(sql, /commit;\s*$/); });

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive Core 0.8.0 stable identity and revision model",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
