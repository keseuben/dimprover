import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  permissionsForDropSpaceRole,
  resolveDropSpaceAccessWindow,
  resolveMembershipAccessEnd,
} from "./dropSpacePermissions";
import type {
  DropCreateSpaceInput,
  DropSpace,
  DropSpaceMembership,
  DropSpaceProjectLink,
  DropSpaceMembershipRole,
} from "./dropSpaceTypes";
import type { DropPackageMode, DropPackageStatus } from "./dropTypes";
import { parseDropCreateSpaceInput } from "./dropSpaceValidation";
import {
  createDropSpaceInvitationToken,
  createDropSpaceSessionToken,
  verifyDropSpaceInvitationToken,
  verifyDropSpaceSessionToken,
} from "./dropSpaceSecurity";

export class DropSpaceRepositoryError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = "DROP_SPACE_REPOSITORY_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "DropSpaceRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DropCreateSpaceAdminInput = DropCreateSpaceInput & {
  ownerName: string;
  ownerEmail: string;
  ownerOrganizationName?: string;
  project?: {
    id: string;
    name: string;
    syncToDock?: boolean;
    allowDockPackageCreation?: boolean;
    archiveToDrive?: boolean;
    driveTargetFolderId?: string;
  };
};

export type DropSpaceListItem = DropSpace & {
  effectiveEndsAt: string;
  effectiveEndSource: "license" | "project" | "fixed";
  runtimeMode: "writable" | "read_only" | "blocked";
  memberCount: number;
  projectCount: number;
  packageCount: number;
  ownerMembership: Pick<DropSpaceMembership, "id" | "email" | "displayName" | "status"> | null;
  projects: Array<Pick<DropSpaceProjectLink, "id" | "projectId" | "projectNameSnapshot" | "syncToDock" | "archiveToDrive">>;
};

type DbDropSpace = {
  id: string;
  public_code: string;
  name: string;
  description: string;
  organization_id: string | null;
  owner_license_id: string;
  owner_user_id: string | null;
  status: DropSpace["status"];
  access_expiry_mode: DropSpace["accessExpiryMode"];
  access_ends_at: string | null;
  license_ends_at: string;
  project_ends_at: string | null;
  grace_ends_at: string | null;
  max_members: number;
  max_packages: number;
  storage_quota_bytes: number | string;
  current_storage_bytes: number | string;
  allow_guest_package_creation: boolean;
  allow_guest_invites: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

type DbMembership = {
  id: string;
  space_id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  organization_name: string | null;
  role: DropSpaceMembership["role"];
  status: DropSpaceMembership["status"];
  is_guest: boolean;
  invited_by_membership_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  access_ends_at: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbProjectLink = {
  id: string;
  space_id: string;
  project_id: string;
  project_name_snapshot: string;
  sync_to_dock: boolean;
  allow_dock_package_creation: boolean;
  archive_to_drive: boolean;
  drive_target_folder_id: string | null;
  added_by_membership_id: string;
  created_at: string;
  updated_at: string;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey || serviceKey.includes("<") || serviceKey.includes(">")) {
    throw new DropSpaceRepositoryError(
      "A Drop tér szerveroldali Supabase-kapcsolata nincs beállítva.",
      "DROP_SPACE_DATABASE_NOT_CONFIGURED",
      503,
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-drop-spaces/0.3.0" } },
  });
}

function databaseError(message: string, error: unknown, status = 500): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const schemaMissing = candidate?.code === "PGRST205" || candidate?.code === "42P01" || candidate?.code === "42703";
  throw new DropSpaceRepositoryError(
    schemaMissing ? "A DROP 0.3.0 hozzáférési tér sémája még nincs alkalmazva." : message,
    schemaMissing ? "DROP_SPACES_SCHEMA_NOT_READY" : candidate?.code || "DROP_SPACE_DATABASE_ERROR",
    schemaMissing ? 503 : status,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeEmail(value: unknown) {
  const email = cleanText(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DropSpaceRepositoryError("Érvényes tulajdonosi e-mail-cím szükséges.", "DROP_SPACE_OWNER_EMAIL_INVALID", 400);
  }
  return email;
}

function createPublicCode() {
  const year = new Date().getUTCFullYear().toString().slice(-2);
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `DSP-${year}-${random}`;
}

function mapSpace(row: DbDropSpace): DropSpace {
  return {
    id: row.id,
    publicCode: row.public_code,
    name: row.name,
    description: row.description,
    organizationId: row.organization_id,
    ownerLicenseId: row.owner_license_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    accessExpiryMode: row.access_expiry_mode,
    accessEndsAt: row.access_ends_at,
    licenseEndsAt: row.license_ends_at,
    projectEndsAt: row.project_ends_at,
    graceEndsAt: row.grace_ends_at,
    maxMembers: row.max_members,
    maxPackages: row.max_packages,
    storageQuotaBytes: Number(row.storage_quota_bytes),
    currentStorageBytes: Number(row.current_storage_bytes),
    allowGuestPackageCreation: row.allow_guest_package_creation,
    allowGuestInvites: row.allow_guest_invites,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

function mapMembership(row: DbMembership): DropSpaceMembership {
  return {
    id: row.id,
    spaceId: row.space_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationName: row.organization_name,
    role: row.role,
    status: row.status,
    isGuest: row.is_guest,
    invitedByMembershipId: row.invited_by_membership_id,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    accessEndsAt: row.access_ends_at,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProject(row: DbProjectLink): DropSpaceProjectLink {
  return {
    id: row.id,
    spaceId: row.space_id,
    projectId: row.project_id,
    projectNameSnapshot: row.project_name_snapshot,
    syncToDock: row.sync_to_dock,
    allowDockPackageCreation: row.allow_dock_package_creation,
    archiveToDrive: row.archive_to_drive,
    driveTargetFolderId: row.drive_target_folder_id,
    addedByMembershipId: row.added_by_membership_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDropSpacesSchemaHealth() {
  const client = getClient();
  const tables = ["drop_spaces", "drop_space_memberships", "drop_space_projects", "drop_package_members"] as const;
  const checks = await Promise.all(tables.map(async (table) => {
    const { error } = await client.from(table).select("*").limit(0);
    return { table, ready: !error, errorCode: error?.code || null };
  }));
  const { data: marker, error: markerError } = await client
    .from("drop_schema_meta")
    .select("component,schema_version,migration_count,bootstrap_id,metadata")
    .eq("component", "drop-spaces")
    .maybeSingle();
  if (markerError) databaseError("A DROP 0.3.0 sémamarker nem olvasható.", markerError);
  const acceptedVersions = new Set(["DROP 0.3.0", "DROP 0.3.2"]);
  const acceptedBootstraps = new Set([
    "drop-030-spaces-access-model-20260801",
    "drop-032-space-package-creation-20260801",
  ]);
  const ready = checks.every((check) => check.ready)
    && acceptedVersions.has(String(marker?.schema_version || ""))
    && acceptedBootstraps.has(String(marker?.bootstrap_id || ""));
  return { ready, checks, marker };
}

export async function getDropSpacePackageSchemaHealth() {
  const spaces = await getDropSpacesSchemaHealth();
  const ready = Boolean(
    spaces.ready
      && spaces.marker?.schema_version === "DROP 0.3.2"
      && spaces.marker?.migration_count === 2
      && spaces.marker?.bootstrap_id === "drop-032-space-package-creation-20260801"
      && spaces.marker?.metadata?.spacePackageAtomicCreation === true
      && spaces.marker?.metadata?.selectedMemberSharing === true,
  );
  return { ready, spaces };
}

export async function createDropSpace(input: DropCreateSpaceAdminInput) {
  const normalized = parseDropCreateSpaceInput(input);
  const ownerName = cleanText(input.ownerName, 160);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const ownerOrganizationName = cleanText(input.ownerOrganizationName, 200) || null;
  if (ownerName.length < 2) {
    throw new DropSpaceRepositoryError("A térgazda neve legalább 2 karakter legyen.", "DROP_SPACE_OWNER_NAME_INVALID", 400);
  }

  const projectId = cleanText(input.project?.id, 160);
  const projectName = cleanText(input.project?.name, 240);
  if ((projectId && !projectName) || (!projectId && projectName)) {
    throw new DropSpaceRepositoryError(
      "Projektkapcsolatnál a projektazonosító és a projektnév együtt szükséges.",
      "DROP_SPACE_PROJECT_INPUT_INCOMPLETE",
      400,
    );
  }

  const client = getClient();
  let createdSpaceId: string | null = null;
  try {
    const now = new Date().toISOString();
    const { data: spaceRow, error: spaceError } = await client
      .from("drop_spaces")
      .insert({
        public_code: createPublicCode(),
        name: normalized.name,
        description: normalized.description,
        organization_id: normalized.organizationId,
        owner_license_id: normalized.ownerLicenseId,
        owner_user_id: normalized.ownerUserId,
        status: "active",
        access_expiry_mode: normalized.accessExpiryMode,
        access_ends_at: normalized.accessEndsAt,
        license_ends_at: normalized.licenseEndsAt,
        project_ends_at: normalized.projectEndsAt,
        grace_ends_at: normalized.graceEndsAt,
        max_members: normalized.maxMembers,
        max_packages: normalized.maxPackages,
        storage_quota_bytes: normalized.storageQuotaBytes,
        allow_guest_package_creation: normalized.allowGuestPackageCreation,
        allow_guest_invites: normalized.allowGuestInvites,
        updated_at: now,
      })
      .select("*")
      .single();
    if (spaceError || !spaceRow) databaseError("A Drop tér létrehozása sikertelen.", spaceError);
    createdSpaceId = (spaceRow as DbDropSpace).id;

    const { data: membershipRow, error: membershipError } = await client
      .from("drop_space_memberships")
      .insert({
        space_id: createdSpaceId,
        user_id: normalized.ownerUserId,
        email: ownerEmail,
        display_name: ownerName,
        organization_name: ownerOrganizationName,
        role: "owner",
        status: "active",
        is_guest: false,
        invited_at: now,
        accepted_at: now,
        access_ends_at: normalized.licenseEndsAt,
        updated_at: now,
      })
      .select("*")
      .single();
    if (membershipError || !membershipRow) databaseError("A Drop tér tulajdonosi tagságának létrehozása sikertelen.", membershipError);

    let projectRow: DbProjectLink | null = null;
    if (projectId && projectName) {
      const { data, error } = await client
        .from("drop_space_projects")
        .insert({
          space_id: createdSpaceId,
          project_id: projectId,
          project_name_snapshot: projectName,
          sync_to_dock: input.project?.syncToDock !== false,
          allow_dock_package_creation: input.project?.allowDockPackageCreation !== false,
          archive_to_drive: input.project?.archiveToDrive === true,
          drive_target_folder_id: cleanText(input.project?.driveTargetFolderId, 240) || null,
          added_by_membership_id: (membershipRow as DbMembership).id,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error || !data) databaseError("A Drop tér projektkapcsolatának létrehozása sikertelen.", error);
      projectRow = data as DbProjectLink;
    }

    const space = mapSpace(spaceRow as DbDropSpace);
    const ownerMembership = mapMembership(membershipRow as DbMembership);
    const accessWindow = resolveDropSpaceAccessWindow(space);
    return {
      space,
      ownerMembership,
      project: projectRow ? mapProject(projectRow) : null,
      accessWindow,
      guestLicenseRequired: false,
      fileUploadEnabled: false,
    };
  } catch (error) {
    if (createdSpaceId) {
      const { error: cleanupError } = await client.from("drop_spaces").delete().eq("id", createdSpaceId);
      if (cleanupError) {
        throw new DropSpaceRepositoryError(
          "A Drop tér létrehozása megszakadt, és az automatikus visszatörlés is hibázott.",
          "DROP_SPACE_CREATE_CLEANUP_FAILED",
          500,
          { originalError: error instanceof Error ? error.message : String(error), cleanupError: cleanupError.message },
        );
      }
    }
    throw error;
  }
}

export async function listDropSpaces(limit = 50): Promise<DropSpaceListItem[]> {
  const client = getClient();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const { data: spaceRows, error: spacesError } = await client
    .from("drop_spaces")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (spacesError) databaseError("A Drop terek listázása sikertelen.", spacesError);

  return Promise.all(((spaceRows || []) as DbDropSpace[]).map(async (row) => {
    const [membersResult, projectsResult, packagesResult] = await Promise.all([
      client.from("drop_space_memberships").select("*", { count: "exact" }).eq("space_id", row.id).order("created_at", { ascending: true }),
      client.from("drop_space_projects").select("*", { count: "exact" }).eq("space_id", row.id).order("created_at", { ascending: true }),
      client.from("drop_packages").select("id", { count: "exact", head: true }).eq("space_id", row.id),
    ]);
    if (membersResult.error) databaseError("A Drop tér tagságai nem tölthetők be.", membersResult.error);
    if (projectsResult.error) databaseError("A Drop tér projektkapcsolatai nem tölthetők be.", projectsResult.error);
    if (packagesResult.error) databaseError("A Drop tér csomagszáma nem tölthető be.", packagesResult.error);

    const space = mapSpace(row);
    const accessWindow = resolveDropSpaceAccessWindow(space);
    const memberships = ((membersResult.data || []) as DbMembership[]).map(mapMembership);
    const projects = ((projectsResult.data || []) as DbProjectLink[]).map(mapProject);
    const owner = memberships.find((membership) => membership.role === "owner") || null;
    return {
      ...space,
      effectiveEndsAt: accessWindow.effectiveEndsAt,
      effectiveEndSource: accessWindow.source,
      runtimeMode: accessWindow.runtimeMode,
      memberCount: membersResult.count || memberships.length,
      projectCount: projectsResult.count || projects.length,
      packageCount: packagesResult.count || 0,
      ownerMembership: owner ? {
        id: owner.id,
        email: owner.email,
        displayName: owner.displayName,
        status: owner.status,
      } : null,
      projects: projects.map((project) => ({
        id: project.id,
        projectId: project.projectId,
        projectNameSnapshot: project.projectNameSnapshot,
        syncToDock: project.syncToDock,
        archiveToDrive: project.archiveToDrive,
      })),
    };
  }));
}


export type DropInviteSpaceMemberInput = {
  displayName: string;
  email: string;
  organizationName?: string;
  role: Exclude<DropSpaceMembershipRole, "owner">;
  accessEndsAt?: string;
};

export type DropSpaceInvitationContext = {
  space: DropSpace;
  membership: DropSpaceMembership;
  rolePermissions: ReturnType<typeof permissionsForDropSpaceRole>;
  effectiveAccessEndsAt: string;
  invitationExpiresAt: string;
  alreadyAccepted: boolean;
};

async function getSpaceRowById(client: SupabaseClient, spaceId: string) {
  const { data, error } = await client.from("drop_spaces").select("*").eq("id", spaceId).maybeSingle();
  if (error) databaseError("A Drop tér nem tölthető be.", error);
  if (!data) throw new DropSpaceRepositoryError("A Drop tér nem található.", "DROP_SPACE_NOT_FOUND", 404);
  return data as DbDropSpace;
}

async function getMembershipRowById(client: SupabaseClient, membershipId: string) {
  const { data, error } = await client.from("drop_space_memberships").select("*").eq("id", membershipId).maybeSingle();
  if (error) databaseError("A Drop tér tagsága nem tölthető be.", error);
  if (!data) throw new DropSpaceRepositoryError("A Drop tér tagsága nem található.", "DROP_SPACE_MEMBERSHIP_NOT_FOUND", 404);
  return data as DbMembership;
}

function parseOptionalIsoDate(value: unknown, label: string) {
  const text = cleanText(value, 64);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new DropSpaceRepositoryError(`${label}: érvénytelen dátum.`, "DROP_SPACE_DATE_INVALID", 400);
  }
  return date.toISOString();
}

function minIsoDate(...values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  if (!timestamps.length) throw new DropSpaceRepositoryError("A hozzáférési lejárat nem határozható meg.", "DROP_SPACE_ACCESS_END_MISSING", 500);
  return timestamps[0].value;
}

function assertSpaceWritable(space: DropSpace) {
  const window = resolveDropSpaceAccessWindow(space);
  if (window.runtimeMode !== "writable") {
    throw new DropSpaceRepositoryError(
      "A Drop tér jelenleg nem módosítható.",
      window.runtimeMode === "read_only" ? "DROP_SPACE_READ_ONLY" : "DROP_SPACE_BLOCKED",
      409,
    );
  }
  return window;
}

export async function listDropSpaceMemberships(spaceId: string) {
  const client = getClient();
  const space = mapSpace(await getSpaceRowById(client, spaceId));
  const { data, error } = await client
    .from("drop_space_memberships")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });
  if (error) databaseError("A Drop tér tagságai nem tölthetők be.", error);
  return ((data || []) as DbMembership[]).map((row) => {
    const membership = mapMembership(row);
    return {
      ...membership,
      effectiveAccessEndsAt: resolveMembershipAccessEnd(space, membership),
      permissions: permissionsForDropSpaceRole(membership.role),
    };
  });
}

export async function inviteDropSpaceMember(spaceId: string, input: DropInviteSpaceMemberInput) {
  const client = getClient();
  const space = mapSpace(await getSpaceRowById(client, spaceId));
  const spaceWindow = assertSpaceWritable(space);
  const displayName = cleanText(input.displayName, 160);
  const email = normalizeEmail(input.email);
  const organizationName = cleanText(input.organizationName, 200) || null;
  const allowedRoles: Array<DropInviteSpaceMemberInput["role"]> = ["space_admin", "contributor", "uploader", "viewer"];
  if (!allowedRoles.includes(input.role)) {
    throw new DropSpaceRepositoryError("A kiválasztott Drop tér szerepkör nem meghívható.", "DROP_SPACE_ROLE_INVALID", 400);
  }
  if (displayName.length < 2) {
    throw new DropSpaceRepositoryError("A meghívott neve legalább 2 karakter legyen.", "DROP_SPACE_MEMBER_NAME_INVALID", 400);
  }
  const requestedAccessEnd = parseOptionalIsoDate(input.accessEndsAt, "Tagsági lejárat");
  const effectiveSpaceEnd = spaceWindow.effectiveEndsAt;
  if (requestedAccessEnd && new Date(requestedAccessEnd).getTime() > new Date(effectiveSpaceEnd).getTime()) {
    throw new DropSpaceRepositoryError(
      "A tagság nem nyúlhat túl a Drop tér vagy a fizető licenc lejáratán.",
      "DROP_SPACE_MEMBER_ACCESS_EXCEEDS_SPACE",
      400,
    );
  }
  const accessEndsAt = requestedAccessEnd || effectiveSpaceEnd;

  const { data: existingData, error: existingError } = await client
    .from("drop_space_memberships")
    .select("*")
    .eq("space_id", spaceId)
    .eq("email", email)
    .maybeSingle();
  if (existingError) databaseError("A meglévő Drop tér tagság ellenőrzése sikertelen.", existingError);
  const existing = existingData as DbMembership | null;
  if (existing?.role === "owner") {
    throw new DropSpaceRepositoryError("A térgazda tagsága nem írható felül meghívással.", "DROP_SPACE_OWNER_MEMBERSHIP_PROTECTED", 409);
  }
  if (existing?.status === "active") {
    throw new DropSpaceRepositoryError("Ez az e-mail-cím már aktív tagja a Drop térnek.", "DROP_SPACE_MEMBER_ALREADY_ACTIVE", 409);
  }

  if (!existing) {
    const { count, error: countError } = await client
      .from("drop_space_memberships")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .in("status", ["invited", "active", "suspended"]);
    if (countError) databaseError("A Drop tér tagszámának ellenőrzése sikertelen.", countError);
    if ((count || 0) >= space.maxMembers) {
      throw new DropSpaceRepositoryError("A Drop tér elérte a licenc szerinti maximális tagszámot.", "DROP_SPACE_MEMBER_LIMIT_REACHED", 409);
    }
  }

  const { data: ownerData, error: ownerError } = await client
    .from("drop_space_memberships")
    .select("id")
    .eq("space_id", spaceId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  if (ownerError) databaseError("A Drop térgazda tagsága nem tölthető be.", ownerError);
  if (!ownerData) throw new DropSpaceRepositoryError("A Drop térnek nincs aktív térgazdája.", "DROP_SPACE_OWNER_MISSING", 409);

  const invitedAt = new Date().toISOString();
  let membershipRow: DbMembership;
  if (existing) {
    const { data, error } = await client
      .from("drop_space_memberships")
      .update({
        display_name: displayName,
        organization_name: organizationName,
        role: input.role,
        status: "invited",
        is_guest: true,
        invited_by_membership_id: ownerData.id,
        invited_at: invitedAt,
        accepted_at: null,
        access_ends_at: accessEndsAt,
        updated_at: invitedAt,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) databaseError("A Drop tér meghívásának újrakiadása sikertelen.", error);
    membershipRow = data as DbMembership;
  } else {
    const { data, error } = await client
      .from("drop_space_memberships")
      .insert({
        space_id: spaceId,
        user_id: null,
        email,
        display_name: displayName,
        organization_name: organizationName,
        role: input.role,
        status: "invited",
        is_guest: true,
        invited_by_membership_id: ownerData.id,
        invited_at: invitedAt,
        accepted_at: null,
        access_ends_at: accessEndsAt,
        updated_at: invitedAt,
      })
      .select("*")
      .single();
    if (error || !data) databaseError("A Drop tér tagsági meghívásának létrehozása sikertelen.", error);
    membershipRow = data as DbMembership;
  }

  const membership = mapMembership(membershipRow);
  const invitationExpiresAt = minIsoDate(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    resolveMembershipAccessEnd(space, membership),
  );
  const rawInvitationToken = createDropSpaceInvitationToken({
    membershipId: membership.id,
    spaceId: space.id,
    email: membership.email,
    invitedAt: membership.invitedAt,
    expiresAt: invitationExpiresAt,
  });
  return {
    space,
    membership,
    invitationExpiresAt,
    rawInvitationToken,
    invitationLink: `${process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu"}/join/${encodeURIComponent(rawInvitationToken)}`,
    rolePermissions: permissionsForDropSpaceRole(membership.role),
    guestLicenseRequired: false,
  };
}

export async function resolveDropSpaceInvitation(rawToken: string): Promise<DropSpaceInvitationContext> {
  const payload = verifyDropSpaceInvitationToken(rawToken);
  const client = getClient();
  const [spaceRow, membershipRow] = await Promise.all([
    getSpaceRowById(client, payload.spaceId),
    getMembershipRowById(client, payload.membershipId),
  ]);
  const space = mapSpace(spaceRow);
  const membership = mapMembership(membershipRow);
  if (membership.spaceId !== space.id || membership.email.toLowerCase() !== payload.email.toLowerCase()) {
    throw new DropSpaceRepositoryError("A Drop tér meghívó nem ehhez a tagsághoz tartozik.", "DROP_SPACE_INVITATION_MISMATCH", 401);
  }
  if (new Date(membership.invitedAt).getTime() !== new Date(payload.invitedAt).getTime()) {
    throw new DropSpaceRepositoryError("Ezt a Drop tér meghívót újabb meghívó váltotta fel.", "DROP_SPACE_INVITATION_REPLACED", 410);
  }
  if (membership.status === "active") {
    throw new DropSpaceRepositoryError("Ezt a Drop tér meghívót már elfogadták.", "DROP_SPACE_INVITATION_CONSUMED", 409);
  }
  if (membership.status !== "invited") {
    throw new DropSpaceRepositoryError("A Drop tér meghívó már nem aktív.", "DROP_SPACE_INVITATION_INACTIVE", 410);
  }
  const effectiveAccessEndsAt = resolveMembershipAccessEnd(space, membership);
  if (Date.now() >= new Date(effectiveAccessEndsAt).getTime()) {
    throw new DropSpaceRepositoryError("A Drop tér tagsági hozzáférése lejárt.", "DROP_SPACE_MEMBERSHIP_EXPIRED", 410);
  }
  return {
    space,
    membership,
    rolePermissions: permissionsForDropSpaceRole(membership.role),
    effectiveAccessEndsAt,
    invitationExpiresAt: new Date(payload.exp * 1000).toISOString(),
    alreadyAccepted: false,
  };
}

export async function acceptDropSpaceInvitation(rawToken: string) {
  const context = await resolveDropSpaceInvitation(rawToken);
  const client = getClient();
  const acceptedAt = new Date().toISOString();
  const { data, error } = await client
    .from("drop_space_memberships")
    .update({ status: "active", accepted_at: acceptedAt, last_opened_at: acceptedAt, updated_at: acceptedAt })
    .eq("id", context.membership.id)
    .eq("status", "invited")
    .select("*")
    .maybeSingle();
  if (error) databaseError("A Drop tér meghívásának elfogadása sikertelen.", error);
  if (!data) throw new DropSpaceRepositoryError("A Drop tér meghívót időközben már felhasználták vagy visszavonták.", "DROP_SPACE_INVITATION_CONSUMED", 409);
  const membership = mapMembership(data as DbMembership);
  const sessionExpiresAt = minIsoDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    resolveMembershipAccessEnd(context.space, membership),
  );
  const sessionToken = createDropSpaceSessionToken({
    membershipId: membership.id,
    spaceId: context.space.id,
    email: membership.email,
    acceptedAt,
    expiresAt: sessionExpiresAt,
  });
  return {
    ...context,
    membership,
    acceptedAt,
    sessionExpiresAt,
    sessionToken,
    redirectPath: `/space/${encodeURIComponent(context.space.publicCode)}`,
  };
}

export async function resolveDropSpaceSession(rawToken: string) {
  const payload = verifyDropSpaceSessionToken(rawToken);
  const client = getClient();
  const [spaceRow, membershipRow] = await Promise.all([
    getSpaceRowById(client, payload.spaceId),
    getMembershipRowById(client, payload.membershipId),
  ]);
  const space = mapSpace(spaceRow);
  const membership = mapMembership(membershipRow);
  if (
    membership.spaceId !== space.id
    || membership.email.toLowerCase() !== payload.email.toLowerCase()
    || membership.status !== "active"
    || !membership.acceptedAt
    || new Date(membership.acceptedAt).getTime() !== new Date(payload.acceptedAt).getTime()
  ) {
    throw new DropSpaceRepositoryError("A Drop tér munkamenet már nem érvényes.", "DROP_SPACE_SESSION_INVALID", 401);
  }
  const accessWindow = resolveDropSpaceAccessWindow(space);
  const effectiveAccessEndsAt = resolveMembershipAccessEnd(space, membership);
  if (accessWindow.runtimeMode === "blocked" || Date.now() >= new Date(effectiveAccessEndsAt).getTime()) {
    throw new DropSpaceRepositoryError("A Drop tér hozzáférése lejárt vagy blokkolt.", "DROP_SPACE_SESSION_EXPIRED", 410);
  }
  await client
    .from("drop_space_memberships")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", membership.id);
  const { data: projectRows, error: projectsError } = await client
    .from("drop_space_projects")
    .select("*")
    .eq("space_id", space.id)
    .order("created_at", { ascending: true });
  if (projectsError) databaseError("A Drop tér projektkapcsolatai nem tölthetők be.", projectsError);
  const { count: packageCount, error: packagesError } = await client
    .from("drop_packages")
    .select("id", { count: "exact", head: true })
    .eq("space_id", space.id);
  if (packagesError) databaseError("A Drop tér csomagszáma nem tölthető be.", packagesError);
  return {
    space,
    membership,
    permissions: permissionsForDropSpaceRole(membership.role),
    effectiveAccessEndsAt,
    runtimeMode: accessWindow.runtimeMode,
    projects: ((projectRows || []) as DbProjectLink[]).map(mapProject),
    packageCount: packageCount || 0,
  };
}


export type DropSpaceVisiblePackage = {
  id: string;
  publicCode: string;
  mode: DropPackageMode;
  title: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  status: DropPackageStatus;
  visibility: "space_members" | "selected_members" | "project_members" | "private";
  createdByMembershipId: string | null;
  uploaderName: string;
  uploaderEmail: string;
  expiresAt: string;
  createdAt: string;
  currentFileCount: number;
  currentTotalSizeBytes: number;
  isOwn: boolean;
  memberAccess: {
    canView: boolean;
    canUpload: boolean;
    canDownload: boolean;
    canComment: boolean;
  } | null;
  canUpload: boolean;
};

export async function listVisibleDropSpacePackages(session: Awaited<ReturnType<typeof resolveDropSpaceSession>>) {
  const client = getClient();
  const { data: packageRows, error: packageError } = await client
    .from("drop_packages")
    .select("id,public_code,mode,title,description,project_id,project_name_snapshot,status,visibility,created_by_membership_id,uploader_name,uploader_email,expires_at,created_at,current_file_count,current_total_size_bytes")
    .eq("space_id", session.space.id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(250);
  if (packageError) databaseError("A Drop tér csomagjai nem tölthetők be.", packageError);

  const { data: accessRows, error: accessError } = await client
    .from("drop_package_members")
    .select("package_id,can_view,can_upload,can_download,can_comment")
    .eq("membership_id", session.membership.id);
  if (accessError) databaseError("A Drop tér csomagmegosztásai nem tölthetők be.", accessError);

  const accessByPackage = new Map((accessRows || []).map((row) => [String(row.package_id), row]));
  const canReadAll = session.permissions.includes("package.read_all");

  return (packageRows || []).filter((row) => {
    const id = String(row.id);
    const own = row.created_by_membership_id === session.membership.id;
    const visibility = row.visibility as DropSpaceVisiblePackage["visibility"];
    const access = accessByPackage.get(id);
    if (canReadAll || own) return true;
    if (visibility === "space_members") return true;
    if (visibility === "selected_members") return Boolean(access?.can_view);
    return false;
  }).map((row) => {
    const id = String(row.id);
    const access = accessByPackage.get(id);
    const own = row.created_by_membership_id === session.membership.id;
    const visibility = row.visibility as DropSpaceVisiblePackage["visibility"];
    return {
      id,
      publicCode: String(row.public_code),
      mode: row.mode as DropPackageMode,
      title: String(row.title),
      description: String(row.description || ""),
      projectId: row.project_id ? String(row.project_id) : null,
      projectName: row.project_name_snapshot ? String(row.project_name_snapshot) : null,
      status: row.status as DropPackageStatus,
      visibility,
      createdByMembershipId: row.created_by_membership_id ? String(row.created_by_membership_id) : null,
      uploaderName: String(row.uploader_name || ""),
      uploaderEmail: String(row.uploader_email || ""),
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
      currentFileCount: Number(row.current_file_count || 0),
      currentTotalSizeBytes: Number(row.current_total_size_bytes || 0),
      isOwn: own,
      memberAccess: access ? {
        canView: Boolean(access.can_view),
        canUpload: Boolean(access.can_upload),
        canDownload: Boolean(access.can_download),
        canComment: Boolean(access.can_comment),
      } : null,
      canUpload: Boolean(
        session.runtimeMode === "writable"
          && session.permissions.includes("file.upload")
          && (canReadAll || own || visibility === "space_members" || access?.can_upload),
      ),
    } satisfies DropSpaceVisiblePackage;
  });
}
