#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const baseUrl = (process.env.PROJECT_IDENTITY_E2E_BASE_URL || "http://127.0.0.1:3220").replace(/\/$/, "");
const operatorRoot = "/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2";
const token = fs.readFileSync(`${operatorRoot}/.dimprover/drive/dev-token.txt`, "utf8").trim();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let passed = 0;
function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2,"0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}
async function api(path, options = {}, actorUserId) {
  const headers = {
    host: "app.dev.dimpro.hu",
    "x-dimpro-drive-dev-token": token,
    "x-dimpro-drive-client-id": "project-identity-v100-e2e",
    "x-dimpro-notification-user-id": actorUserId,
    "x-dimpro-notification-user-name": "Project Identity V1 QA",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}

const userResult = await db.from("dimpro_users")
  .select("id,status")
  .eq("status", "active")
  .limit(1)
  .maybeSingle();
if (userResult.error) throw userResult.error;
check("Canonical active user fixture exists", Boolean(userResult.data?.id));
const actorUserId = String(userResult.data.id);
const canonicalUserId = String(userResult.data.id);

const stamp = Date.now();
const created = await api("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: `Identity Drive V1 QA ${stamp}`,
    code: `IDV1-${String(stamp).slice(-6)}`,
    description: "Project Identity + Drive Bridge V1 runtime E2E",
    currentPhase: "DEV QA",
  }),
}, actorUserId);
check("Project create 201", created.status === 201 && created.payload?.ok === true);
const projectId = created.payload?.project?.id;
check("Project Core id returned", typeof projectId === "string" && projectId.startsWith("project-"));
check("Drive provisioning ready", created.payload?.driveProvisioning?.ready === true);
check("Identity provisioning ready", created.payload?.identityProvisioning?.ready === true);
check("DRAFT does not enable project Drop", created.payload?.identityProvisioning?.identityProject?.status === "draft" && created.payload?.identityProvisioning?.identityProject?.projectDropEnabled === false && created.payload?.identityProvisioning?.destination?.enabled === false);
const identityProjectId = created.payload?.identityProvisioning?.identityProject?.id;
const publicProjectCode = created.payload?.identityProvisioning?.identityProject?.publicCode;
const driveFolderId = created.payload?.identityProvisioning?.destination?.driveFolderId;
check("Canonical Identity project UUID", typeof identityProjectId === "string" && /^[0-9a-f-]{36}$/i.test(identityProjectId));
check("Public project code generated", typeof publicProjectCode === "string" && /^PRJ-\d{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/.test(publicProjectCode));
check("Real Drive folder id bound", typeof driveFolderId === "string" && driveFolderId.startsWith("drive-folder-"));
check("Owner canonical membership mapped", created.payload?.identityProvisioning?.memberships?.mapped >= 1 && created.payload?.identityProvisioning?.memberships?.unresolved?.length === 0);
check("DRAFT dropBindingReady false", created.payload?.identityProvisioning?.dropBindingReady === false);

const [coreDb, identityDb, settingsDb, coreMembershipDb] = await Promise.all([
  db.from("project_core_projects").select("id,dimpro_project_id,status").eq("id", projectId).single(),
  db.from("dimpro_projects").select("id,legacy_project_core_id,public_project_code,status,project_drop_enabled").eq("id", identityProjectId).single(),
  db.from("dimpro_project_drop_settings").select("project_id,drive_folder_id,incoming_folder_name,enabled,require_virus_scan").eq("project_id", identityProjectId).single(),
  db.from("project_core_memberships").select("id,user_id,dimpro_project_membership_id,status,role").eq("project_id", projectId).eq("user_id", actorUserId).single(),
]);
for (const result of [coreDb, identityDb, settingsDb, coreMembershipDb]) if (result.error) throw result.error;
check("Reverse Project Core bridge exact", coreDb.data.dimpro_project_id === identityProjectId);
check("Identity legacy Project Core bridge exact", identityDb.data.legacy_project_core_id === projectId);
check("Public code persisted", identityDb.data.public_project_code === publicProjectCode);
check("Drop settings exact Drive folder", settingsDb.data.drive_folder_id === driveFolderId && settingsDb.data.incoming_folder_name === "Beérkező Drop");
check("Virus scan requirement persisted", settingsDb.data.require_virus_scan === true);
check("Core owner reverse membership bridge set", Boolean(coreMembershipDb.data.dimpro_project_membership_id));
const identityMembershipDb = await db.from("dimpro_project_memberships").select("id,user_id,project_id,status,can_upload_to_drop,can_manage_inbox").eq("id", coreMembershipDb.data.dimpro_project_membership_id).single();
if (identityMembershipDb.error) throw identityMembershipDb.error;
check("Canonical owner user linked", identityMembershipDb.data.user_id === canonicalUserId && identityMembershipDb.data.project_id === identityProjectId);
check("Owner upload/inbox permission prepared", identityMembershipDb.data.can_upload_to_drop === true && identityMembershipDb.data.can_manage_inbox === true);

const retry = await api(`/api/projects/${projectId}/identity/provision`, { method: "POST", body: "{}" }, actorUserId);
check("Identity provision retry 200", retry.status === 200 && retry.payload?.provisioning?.ready === true);
check("Identity provision idempotent project", retry.payload?.provisioning?.identityProject?.id === identityProjectId && retry.payload?.provisioning?.identityProject?.publicCode === publicProjectCode);
check("Identity provision idempotent Drive folder", retry.payload?.provisioning?.destination?.driveFolderId === driveFolderId);

const active = await api(`/api/projects/${projectId}/lifecycle`, { method: "POST", body: JSON.stringify({ nextStatus: "ACTIVE" }) }, actorUserId);
check("Lifecycle DRAFT to ACTIVE 200", active.status === 200 && active.payload?.project?.status === "ACTIVE");
check("ACTIVE sync enables Identity Drop", active.payload?.identityProvisioning?.identityProject?.status === "active" && active.payload?.identityProvisioning?.identityProject?.projectDropEnabled === true && active.payload?.identityProvisioning?.destination?.enabled === true);
check("ACTIVE dropBindingReady true", active.payload?.identityProvisioning?.dropBindingReady === true);

const renamedName = `Identity Drive V1 QA RENAMED ${stamp}`;
const updated = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name: renamedName, description: "P3 canonical sync updated" }) }, actorUserId);
check("Project update 200", updated.status === 200 && updated.payload?.project?.name === renamedName);
check("Project update resync ready", updated.payload?.identityProvisioning?.ready === true);
const renamedDb = await db.from("dimpro_projects").select("name,description").eq("id", identityProjectId).single();
if (renamedDb.error) throw renamedDb.error;
check("Canonical project name/description resynced", renamedDb.data.name === renamedName && renamedDb.data.description === "P3 canonical sync updated");

const closing = await api(`/api/projects/${projectId}/lifecycle`, { method: "POST", body: JSON.stringify({ nextStatus: "CLOSING" }) }, actorUserId);
check("Lifecycle ACTIVE to CLOSING 200", closing.status === 200 && closing.payload?.project?.status === "CLOSING");
check("CLOSING disables Identity Drop", closing.payload?.identityProvisioning?.identityProject?.status === "closing" && closing.payload?.identityProvisioning?.identityProject?.projectDropEnabled === false && closing.payload?.identityProvisioning?.destination?.enabled === false);
check("CLOSING dropBindingReady false", closing.payload?.identityProvisioning?.dropBindingReady === false);

const healthResponse = await fetch(`${baseUrl}/api/drop/health`, { headers: { host: "app.dev.dimpro.hu" } });
const health = await healthResponse.json();
check("Drop release gate remains OFF", health?.featureGate?.releaseGateEnabled === false);
check("Drop Send remains OFF", health?.featureGate?.flags?.sendEnabled === false);
check("Drop Drive archive remains OFF", health?.featureGate?.flags?.driveArchiveEnabled === false);

const auditDb = await db.from("project_core_audit_events").select("event_type").eq("project_id", projectId).eq("event_type", "PROJECT_IDENTITY_DRIVE_SYNCED");
if (auditDb.error) throw auditDb.error;
check("Identity/Drive sync audit recorded", (auditDb.data || []).length >= 4);

console.log(JSON.stringify({
  ok: true,
  contract: "Project Identity + Drive Bridge V1 runtime E2E",
  passed,
  projectId,
  identityProjectId,
  publicProjectCode,
  driveFolderId,
  finalProjectStatus: "CLOSING",
  dropFeatureGateChanged: false,
  completedAt: new Date().toISOString(),
}, null, 2));
