#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const files = {
  session: await readFile("app/api/drop/public/send/session/route.ts", "utf8"),
  transfer: await readFile("components/drop/DropPublicTransferClient.tsx", "utf8"),
  manager: await readFile("components/drop/DropPublicWorkflowManager.tsx", "utf8"),
  workflow: await readFile("app/lib/drop/public/dropPublicWorkflowService.ts", "utf8"),
  finalize: await readFile("app/lib/drop/public/dropPublicFinalizeService.ts", "utf8"),
  identityVerify: await readFile("app/api/dimpro-identity/send/verify/route.ts", "utf8"),
  identityAdmin: await readFile("app/lib/identity-core/admin.ts", "utf8"),
  identityRepo: await readFile("app/lib/identity-core/repository.ts", "utf8"),
  identitySecurity: await readFile("app/lib/identity-core/security.ts", "utf8"),
  proxy: await readFile("proxy.ts", "utf8"),
  loader: await readFile("scripts/load-next-env.cjs", "utf8"),
  bridge: await readFile("supabase/migrations/20260807110000_drop_identity_core_consumer_bridge_v110.sql", "utf8"),
  adminBridge: await readFile("supabase/migrations/20260807111500_dimpro_identity_send_admin_bridge_v110.sql", "utf8"),
  runtime: await readFile("app/lib/drop/dropRuntime.ts", "utf8"),
  postgresRepository: await readFile("app/lib/drop/public/dropPublicPostgresRepository.ts", "utf8"),
};
const checks = [];
function has(name, source, pattern) {
  const ok = pattern.test(source); checks.push({ name, ok }); if (!ok) throw new Error(`Hiányzó Identity consumer szerződés: ${name}`);
}
function lacks(name, source, pattern) {
  const ok = !pattern.test(source); checks.push({ name, ok }); if (!ok) throw new Error(`Tiltott Identity consumer szerződés: ${name}`);
}

has("drop-session-verifies-dss1", files.session, /verifyDimproSendSession\(body\.sendSessionToken\)/);
has("drop-session-central-revalidation", files.session, /getDimproSendContextByEntitlementId/);
has("drop-session-central-entitlement-reference", files.session, /dimproSendEntitlementId: context\.entitlement\.id/);
lacks("drop-session-no-legacy-code-verification", files.session, /verifyDropSendCode|dropSendEntitlementProfileStore/);

has("client-calls-central-send-verify", files.transfer, /\/api\/dimpro-identity\/send\/verify/);
has("client-loads-central-projects", files.transfer, /\/api\/dimpro-identity\/send\/projects/);
has("client-verifies-project-code", files.transfer, /\/api\/dimpro-identity\/projects\/verify-code/);
has("client-bridges-dss-session", files.transfer, /sendSessionToken: token/);
has("client-project-code-format", files.transfer, /PRJ-26-K7M-4Q9/);
has("client-project-inbox-copy", files.transfer, /Beérkező Drop/);

has("workflow-central-context", files.workflow, /getDimproSendContextByEntitlementId\(session\.dimproSendEntitlementId\)/);
has("workflow-server-project-reverify", files.workflow, /verifyDimproProjectCode\(context\.entitlement\.id, requestedProjectCode, input\.headers\)/);
has("workflow-persists-central-project-id", files.workflow, /dimproProjectId: centralProjectId/);
has("workflow-persists-entitlement-id", files.workflow, /dimproSendEntitlementId: centralEntitlementId/);
has("workflow-central-package-limit", files.workflow, /context\.entitlement\.maxPackageSizeBytes/);

has("workflow-mapper-entitlement-id", files.postgresRepository, /dimproSendEntitlementId: nullableText\(row\.dimpro_send_entitlement_id\)/);
has("workflow-mapper-project-id", files.postgresRepository, /dimproProjectId: nullableText\(row\.dimpro_project_id\)/);
has("workflow-mapper-project-code", files.postgresRepository, /projectPublicCode: nullableText\(row\.project_public_code\)/);
has("workflow-mapper-accounted-at", files.postgresRepository, /identityAccountedAt: nullableText\(row\.identity_accounted_at\)/);

has("finalize-central-accounting", files.finalize, /recordDropIdentityAccountingAtomic/);
has("finalize-accounting-before-delivery", files.finalize, /identity\.send_accounted/);

has("identity-verify-returns-recipient-list", files.identityVerify, /approvedRecipients/);
has("identity-repository-session-revalidation", files.identityRepo, /getDimproSendContextByEntitlementId/);
has("identity-repository-module-check", files.identityRepo, /DROP_PROJECT_INBOX/);
has("identity-security-hmac-send-code", files.identitySecurity, /createHmac\("sha256", requiredSecret\("DIMPRO_SEND_CODE_PEPPER"\)\)/);
has("identity-security-hmac-session", files.identitySecurity, /DIMPRO_SEND_SESSION_SECRET/);

has("admin-uses-central-rpc", files.identityAdmin, /dimpro_admin_create_send_entitlement/);
has("admin-legacy-link-explicit", files.identityAdmin, /dimpro_admin_link_legacy_send_code/);
has("admin-ui-central-api", files.manager, /\/api\/dimpro-identity\/admin\/send-entitlements/);
has("admin-ui-legacy-manual-selection", files.manager, /Auditált átvezetés \+ visszavonás/);
lacks("admin-ui-no-local-send-code-create", files.manager, /\/api\/drop\/admin\/public\/send-codes/);

has("proxy-central-public-allowlist", files.proxy, /pathname === "\/api\/dimpro-identity\/send\/verify"/);
has("proxy-central-project-list-allowlist", files.proxy, /pathname === "\/api\/dimpro-identity\/send\/projects"/);
lacks("proxy-drop-host-blocks-identity-admin", files.proxy, /isDropIdentityPublicApiRoute[\s\S]*\/api\/dimpro-identity\/admin/);

has("loader-root-only-identity-file", files.loader, /\/root\/\.dimpro-secrets\/dimpro-identity-core\.env/);
has("loader-send-pepper-allowlist", files.loader, /DIMPRO_SEND_CODE_PEPPER/);
has("loader-session-secret-allowlist", files.loader, /DIMPRO_SEND_SESSION_SECRET/);
lacks("loader-no-db-password", files.loader, /SUPABASE_DB_PASSWORD|PGPASSWORD/);

has("bridge-session-central-fk", files.bridge, /dimpro_send_entitlement_id uuid[\s\S]*references public\.dimpro_send_entitlements/);
has("bridge-project-central-fk", files.bridge, /dimpro_project_id uuid[\s\S]*references public\.dimpro_projects/);
has("bridge-idempotent-accounting", files.bridge, /identity_accounted_at[\s\S]*dimpro_record_send_completed/);
has("bridge-legacy-compatible", files.bridge, /send_code_id is not null and dimpro_send_entitlement_id is null/);

has("admin-bridge-existing-user-required", files.adminBridge, /DIMPRO_SEND_USER_NOT_ACTIVE/);
has("admin-bridge-existing-license-required", files.adminBridge, /DIMPRO_SEND_LICENSE_NOT_ACTIVE/);
has("admin-bridge-no-guessed-org-membership", files.adminBridge, /dimpro_organization_memberships/);
has("admin-bridge-legacy-one-by-one", files.adminBridge, /p_legacy_send_code_id text/);
has("admin-bridge-audits-link", files.adminBridge, /legacy_send_code_linked/);
lacks("admin-bridge-does-not-create-users", files.adminBridge, /insert into public\.dimpro_users/i);
lacks("admin-bridge-does-not-create-projects", files.adminBridge, /insert into public\.dimpro_projects/i);

const combinedMigrations = `${files.bridge}\n${files.adminBridge}`;
lacks("no-parallel-drop-user-table", combinedMigrations, /create table[^;]*(drop|dimpro)_.*users/i);
lacks("no-parallel-drop-license-table", combinedMigrations, /create table[^;]*(drop|dimpro)_.*licenses/i);
lacks("no-parallel-drop-project-table", combinedMigrations, /create table[^;]*(drop|dimpro)_.*projects/i);

has("runtime-central-readiness", files.runtime, /identityCoreConsumer: identityCoreConsumerReady/);
has("runtime-no-parallel-store-flag", files.runtime, /parallelDropUserLicenseProjectStore: false/);
has("runtime-no-auto-legacy-migration", files.runtime, /legacySendCodeAutoMigration: false/);

console.log(JSON.stringify({ ok: true, version: "DROP 1.1.0", checks: checks.length, names: checks.map((item) => item.name) }, null, 2));
