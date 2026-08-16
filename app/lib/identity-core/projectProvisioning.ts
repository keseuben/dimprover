import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDimproIdentitySchemaHealth, getDimproIdentitySupabaseClient } from "./repository";
import { normalizeUuid } from "./security";
import { DimproIdentityError } from "./types";

export const DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION = "1.0.0";
export const DIMPRO_PROJECT_INCOMING_FOLDER_NAME = "Beérkező Drop";

type CoreProjectRow = {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "CLOSING" | "READ_ONLY" | "ARCHIVED" | "DELETION_SCHEDULED" | "DELETED";
  created_by: string;
  dimpro_project_id: string | null;
};

type CoreMembershipRow = {
  id: string;
  project_id: string;
  user_id: string;
  email: string | null;
  role: "OWNER" | "PROJECT_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "VIEWER";
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  invited_at: string;
  updated_at: string;
  dimpro_project_membership_id: string | null;
};

type IdentityProjectRow = {
  id: string;
  public_project_code: string;
  name: string;
  organization_id: string | null;
  status: string;
  project_drop_enabled: boolean;
  legacy_project_core_id: string | null;
  legacy_project_code: string | null;
};

type IdentityMembershipRow = {
  id: string;
  project_id: string;
  user_id: string;
  status: string;
  legacy_project_core_membership_id: string | null;
};

type CanonicalUser = { id: string; status: string };

type BindRpcPayload = {
  ok?: boolean;
  project?: {
    id?: string;
    publicCode?: string;
    name?: string;
    status?: string;
    projectDropEnabled?: boolean;
    legacyProjectCoreId?: string;
  };
  destination?: {
    driveFolderId?: string;
    incomingFolderName?: string;
    enabled?: boolean;
    preserveGroups?: boolean;
    requireVirusScan?: boolean;
    notifyProjectAdmins?: boolean;
  };
};

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string | null; message?: string | null; details?: string | null } | null;
  const source = `${candidate?.message || ""} ${candidate?.details || ""}`;
  const known = source.match(/DIMPRO_[A-Z0-9_]+/)?.[0];
  throw new DimproIdentityError(message, known || candidate?.code || "DIMPRO_PROJECT_IDENTITY_DATABASE_ERROR", status);
}

function identityStatus(status: CoreProjectRow["status"]) {
  return status.toLowerCase();
}

function membershipStatus(status: CoreMembershipRow["status"]) {
  return status.toLowerCase();
}

function roleCode(role: CoreMembershipRow["role"]) {
  return role.toLowerCase();
}

function uploadRole(role: CoreMembershipRow["role"]) {
  return ["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR"].includes(role);
}

function manageInboxRole(role: CoreMembershipRow["role"]) {
  return ["OWNER", "PROJECT_MANAGER"].includes(role);
}

function downloadRole(role: CoreMembershipRow["role"]) {
  return ["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR", "REVIEWER", "VIEWER"].includes(role);
}

function normalizedEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

async function requireIdentityClient() {
  const health = await getDimproIdentitySchemaHealth();
  const projectDriveSchemaReady = health.ready
    && health.marker?.schemaVersion === "0.2.1"
    && Number(health.marker?.migrationCount || 0) >= 5
    && health.marker?.bootstrapId === "dimpro-identity-project-drive-v021-20260816";
  if (!projectDriveSchemaReady) {
    throw new DimproIdentityError(
      "A DIMPRO Identity Core 0.2.1 projekt-Drive binding sémája nem áll készen.",
      "DIMPRO_PROJECT_IDENTITY_SCHEMA_NOT_READY",
      503,
    );
  }
  return getDimproIdentitySupabaseClient();
}

async function loadCoreProject(client: SupabaseClient, projectId: string) {
  const result = await client.from("project_core_projects")
    .select("id,organization_id,code,name,description,status,created_by,dimpro_project_id")
    .eq("id", projectId)
    .maybeSingle();
  if (result.error) databaseError("A Project Core projekt nem tölthető be.", result.error);
  if (!result.data) throw new DimproIdentityError("A projekt nem található.", "DIMPRO_PROJECT_IDENTITY_CORE_NOT_FOUND", 404);
  return result.data as CoreProjectRow;
}

async function loadCoreMemberships(client: SupabaseClient, projectId: string) {
  const result = await client.from("project_core_memberships")
    .select("id,project_id,user_id,email,role,status,invited_at,updated_at,dimpro_project_membership_id")
    .eq("project_id", projectId)
    .order("invited_at", { ascending: true });
  if (result.error) databaseError("A Project Core projekttagságok nem tölthetők be.", result.error);
  return (result.data || []) as CoreMembershipRow[];
}

async function resolveCanonicalUser(client: SupabaseClient, userId: string, email?: string | null): Promise<CanonicalUser | null> {
  const uuid = normalizeUuid(userId);
  if (uuid) {
    const byId = await client.from("dimpro_users").select("id,status").eq("id", uuid).maybeSingle();
    if (byId.error) databaseError("A canonical DIMPRO felhasználó nem oldható fel.", byId.error);
    if (byId.data) return byId.data as CanonicalUser;
    const byAuth = await client.from("dimpro_users").select("id,status").eq("auth_user_id", uuid).maybeSingle();
    if (byAuth.error) databaseError("A canonical DIMPRO auth-felhasználó nem oldható fel.", byAuth.error);
    if (byAuth.data) return byAuth.data as CanonicalUser;
  }
  const emailValue = normalizedEmail(email);
  if (emailValue) {
    const byEmail = await client.from("dimpro_users").select("id,status").eq("email_normalized", emailValue).maybeSingle();
    if (byEmail.error) databaseError("A canonical DIMPRO felhasználó e-mail alapján nem oldható fel.", byEmail.error);
    if (byEmail.data) return byEmail.data as CanonicalUser;
  }
  return null;
}

async function resolveCanonicalOrganization(client: SupabaseClient, organizationId: string | null) {
  const uuid = normalizeUuid(organizationId);
  if (!uuid) return null;
  const result = await client.from("dimpro_organizations").select("id,status").eq("id", uuid).maybeSingle();
  if (result.error) databaseError("A canonical DIMPRO szervezet nem oldható fel.", result.error);
  return result.data?.id ? String(result.data.id) : null;
}

async function loadIdentityProject(client: SupabaseClient, core: CoreProjectRow): Promise<IdentityProjectRow | null> {
  let byCanonical: IdentityProjectRow | null = null;
  if (core.dimpro_project_id) {
    const result = await client.from("dimpro_projects")
      .select("id,public_project_code,name,organization_id,status,project_drop_enabled,legacy_project_core_id,legacy_project_code")
      .eq("id", core.dimpro_project_id)
      .maybeSingle();
    if (result.error) databaseError("A canonical DIMPRO projekt nem tölthető be.", result.error);
    byCanonical = (result.data || null) as IdentityProjectRow | null;
  }
  const legacyResult = await client.from("dimpro_projects")
    .select("id,public_project_code,name,organization_id,status,project_drop_enabled,legacy_project_core_id,legacy_project_code")
    .eq("legacy_project_core_id", core.id)
    .maybeSingle();
  if (legacyResult.error) databaseError("A Project Core bridge nem ellenőrizhető.", legacyResult.error);
  const byLegacy = (legacyResult.data || null) as IdentityProjectRow | null;
  if (byCanonical && byLegacy && byCanonical.id !== byLegacy.id) {
    throw new DimproIdentityError("A projekt két eltérő canonical Identity projektre mutat.", "DIMPRO_PROJECT_IDENTITY_BRIDGE_CONFLICT", 409);
  }
  return byCanonical || byLegacy;
}

async function syncMemberships(client: SupabaseClient, projectId: string, identityProjectId: string) {
  const coreMemberships = await loadCoreMemberships(client, projectId);
  const identityResult = await client.from("dimpro_project_memberships")
    .select("id,project_id,user_id,status,legacy_project_core_membership_id")
    .eq("project_id", identityProjectId);
  if (identityResult.error) databaseError("A canonical projekttagságok nem tölthetők be.", identityResult.error);
  const identityMemberships = (identityResult.data || []) as IdentityMembershipRow[];
  const byLegacy = new Map(identityMemberships.filter((row) => row.legacy_project_core_membership_id).map((row) => [row.legacy_project_core_membership_id!, row]));
  const byUser = new Map(identityMemberships.map((row) => [row.user_id, row]));
  const unresolved: Array<{ membershipId: string; userId: string; email: string | null; reason: string }> = [];
  let mapped = 0;
  let activeUploaders = 0;

  for (const membership of coreMemberships) {
    const user = await resolveCanonicalUser(client, membership.user_id, membership.email);
    if (!user || ["disabled", "deleted"].includes(user.status)) {
      unresolved.push({ membershipId: membership.id, userId: membership.user_id, email: membership.email, reason: user ? `canonical-user-${user.status}` : "canonical-user-not-found" });
      continue;
    }
    const existingByLegacy = byLegacy.get(membership.id) || null;
    const existingByUser = byUser.get(user.id) || null;
    if (existingByLegacy && existingByUser && existingByLegacy.id !== existingByUser.id) {
      throw new DimproIdentityError("A projekttagság canonical kapcsolata ütközik.", "DIMPRO_PROJECT_MEMBERSHIP_BRIDGE_CONFLICT", 409);
    }
    const existing = existingByLegacy || existingByUser;
    const active = membership.status === "ACTIVE";
    const payload = {
      project_id: identityProjectId,
      user_id: user.id,
      organization_id: null,
      role_code: roleCode(membership.role),
      can_view: membership.status !== "REVOKED",
      can_upload_to_drop: active && uploadRole(membership.role),
      can_download: active && downloadRole(membership.role),
      can_manage_inbox: active && manageInboxRole(membership.role),
      status: membershipStatus(membership.status),
      valid_from: membership.invited_at,
      valid_until: null,
      legacy_project_core_membership_id: membership.id,
      updated_at: new Date().toISOString(),
    };
    let identityMembershipId: string;
    if (existing) {
      const updated = await client.from("dimpro_project_memberships").update(payload).eq("id", existing.id).select("id").single();
      if (updated.error) databaseError("A canonical projekttagság nem frissíthető.", updated.error, 409);
      identityMembershipId = String(updated.data.id);
    } else {
      const created = await client.from("dimpro_project_memberships").insert(payload).select("id").single();
      if (created.error) databaseError("A canonical projekttagság nem hozható létre.", created.error, 409);
      identityMembershipId = String(created.data.id);
      const row = { id: identityMembershipId, project_id: identityProjectId, user_id: user.id, status: payload.status, legacy_project_core_membership_id: membership.id } satisfies IdentityMembershipRow;
      byLegacy.set(membership.id, row);
      byUser.set(user.id, row);
    }
    if (membership.dimpro_project_membership_id !== identityMembershipId) {
      const linked = await client.from("project_core_memberships").update({ dimpro_project_membership_id: identityMembershipId, updated_at: new Date().toISOString() }).eq("id", membership.id);
      if (linked.error) databaseError("A Project Core tagsági reverse bridge nem menthető.", linked.error, 409);
    }
    mapped += 1;
    if (payload.can_upload_to_drop) activeUploaders += 1;
  }
  return { total: coreMemberships.length, mapped, activeUploaders, unresolved };
}

async function writeProjectAudit(client: SupabaseClient, projectId: string, actorUserId: string, metadata: Record<string, unknown>) {
  const result = await client.from("project_core_audit_events").insert({
    id: `project-audit-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    project_id: projectId,
    actor_user_id: actorUserId,
    event_type: "PROJECT_IDENTITY_DRIVE_SYNCED",
    entity_type: "project",
    entity_id: projectId,
    summary: "Canonical DIMPRO projekt és Drive Drop célmappa szinkronizálva.",
    metadata,
  });
  if (result.error) databaseError("A projekt Identity/Drive auditja nem menthető.", result.error);
}

export async function getProjectIdentityProvisioningState(projectId: string) {
  const client = await requireIdentityClient();
  const core = await loadCoreProject(client, projectId);
  const identityProject = await loadIdentityProject(client, core);
  if (!identityProject) {
    return {
      version: DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION,
      projectId,
      ready: false,
      dropBindingReady: false,
      projectCoreStatus: core.status,
      identityProject: null,
      destination: null,
      memberships: { total: 0, mapped: 0, activeUploaders: 0, unresolved: [] as Array<Record<string, unknown>> },
    };
  }
  const [settingsResult, coreMembershipsResult] = await Promise.all([
    client.from("dimpro_project_drop_settings").select("drive_folder_id,incoming_folder_name,enabled,preserve_groups,require_virus_scan,notify_project_admins").eq("project_id", identityProject.id).maybeSingle(),
    client.from("project_core_memberships").select("id,dimpro_project_membership_id,status,role").eq("project_id", projectId),
  ]);
  if (settingsResult.error) databaseError("A projekt Drop célbeállítása nem tölthető be.", settingsResult.error);
  if (coreMembershipsResult.error) databaseError("A projekt tagsági bridge állapota nem tölthető be.", coreMembershipsResult.error);
  const settings = settingsResult.data;
  const coreMemberships = coreMembershipsResult.data || [];
  const mapped = coreMemberships.filter((row) => row.dimpro_project_membership_id).length;
  const activeUploaders = coreMemberships.filter((row) => row.dimpro_project_membership_id && row.status === "ACTIVE" && ["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR"].includes(String(row.role))).length;
  const ready = Boolean(core.dimpro_project_id === identityProject.id && settings?.drive_folder_id);
  return {
    version: DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION,
    projectId,
    ready,
    dropBindingReady: ready && core.status === "ACTIVE" && identityProject.status === "active" && identityProject.project_drop_enabled === true && settings?.enabled === true && activeUploaders > 0,
    projectCoreStatus: core.status,
    identityProject: {
      id: identityProject.id,
      publicCode: identityProject.public_project_code,
      name: identityProject.name,
      status: identityProject.status,
      projectDropEnabled: identityProject.project_drop_enabled,
      legacyProjectCoreId: identityProject.legacy_project_core_id,
    },
    destination: settings ? {
      driveFolderId: settings.drive_folder_id,
      incomingFolderName: settings.incoming_folder_name,
      enabled: settings.enabled,
      preserveGroups: settings.preserve_groups,
      requireVirusScan: settings.require_virus_scan,
      notifyProjectAdmins: settings.notify_project_admins,
    } : null,
    memberships: { total: coreMemberships.length, mapped, activeUploaders, unresolved: [] as Array<Record<string, unknown>> },
  };
}

export async function provisionProjectIdentityBridge(input: {
  projectId: string;
  actorUserId: string;
  driveFolderId: string;
  incomingFolderName?: string;
}) {
  const client = await requireIdentityClient();
  const core = await loadCoreProject(client, input.projectId);
  const actor = await resolveCanonicalUser(client, input.actorUserId);
  const organizationId = await resolveCanonicalOrganization(client, core.organization_id);
  const rpc = await client.rpc("dimpro_bind_project_core_atomic", {
    p_project_core_id: core.id,
    p_project_core_code: core.code,
    p_name: core.name,
    p_description: core.description || "",
    p_status: identityStatus(core.status),
    p_organization_id: organizationId,
    p_created_by: actor?.id || null,
    p_drive_folder_id: input.driveFolderId,
    p_incoming_folder_name: input.incomingFolderName || DIMPRO_PROJECT_INCOMING_FOLDER_NAME,
  });
  if (rpc.error) databaseError("A Project Core és canonical DIMPRO projekt összekötése sikertelen.", rpc.error, 409);
  const result = (rpc.data || {}) as BindRpcPayload;
  const identityProjectId = String(result.project?.id || "");
  const publicCode = String(result.project?.publicCode || "");
  if (!result.ok || !normalizeUuid(identityProjectId) || !publicCode) {
    throw new DimproIdentityError("A projektbinding válasza hiányos.", "DIMPRO_PROJECT_IDENTITY_BIND_RESPONSE_INVALID", 500);
  }
  const memberships = await syncMemberships(client, core.id, identityProjectId);
  const active = core.status === "ACTIVE";
  await writeProjectAudit(client, core.id, input.actorUserId, {
    bridgeVersion: DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION,
    identityProjectId,
    publicProjectCode: publicCode,
    driveFolderId: result.destination?.driveFolderId || input.driveFolderId,
    projectCoreStatus: core.status,
    identityStatus: result.project?.status || identityStatus(core.status),
    projectDropEnabled: result.project?.projectDropEnabled === true,
    mappedMemberships: memberships.mapped,
    unresolvedMemberships: memberships.unresolved.length,
  });
  return {
    ok: true as const,
    version: DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION,
    projectId: core.id,
    ready: true,
    dropBindingReady: active && result.project?.projectDropEnabled === true && result.destination?.enabled === true && memberships.activeUploaders > 0,
    projectCoreStatus: core.status,
    identityProject: {
      id: identityProjectId,
      publicCode,
      name: String(result.project?.name || core.name),
      status: String(result.project?.status || identityStatus(core.status)),
      projectDropEnabled: result.project?.projectDropEnabled === true,
      legacyProjectCoreId: String(result.project?.legacyProjectCoreId || core.id),
    },
    destination: {
      driveFolderId: String(result.destination?.driveFolderId || input.driveFolderId),
      incomingFolderName: String(result.destination?.incomingFolderName || input.incomingFolderName || DIMPRO_PROJECT_INCOMING_FOLDER_NAME),
      enabled: result.destination?.enabled === true,
      preserveGroups: result.destination?.preserveGroups !== false,
      requireVirusScan: result.destination?.requireVirusScan !== false,
      notifyProjectAdmins: result.destination?.notifyProjectAdmins !== false,
    },
    memberships,
  };
}
