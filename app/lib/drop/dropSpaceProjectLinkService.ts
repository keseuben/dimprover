import { randomUUID } from "node:crypto";
import { getDropSupabaseClient } from "./dropRepository";
import { DropSpaceRepositoryError } from "./dropSpaceRepository";

export type DropProjectLinkOptions = {
  syncToDock?: boolean;
  allowDockPackageCreation?: boolean;
  archiveToDrive?: boolean;
  driveTargetFolderId?: string | null;
};

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function serviceError(message: string, code: string, status: number, details?: unknown) {
  return new DropSpaceRepositoryError(message, code, status, details);
}

async function loadSpaceContext(spaceId: string) {
  const client = getDropSupabaseClient();
  const [{ data: space, error: spaceError }, { data: owner, error: ownerError }] = await Promise.all([
    client.from("drop_spaces").select("id,public_code,name,status").eq("id", spaceId).neq("status", "deleted").maybeSingle(),
    client.from("drop_space_memberships").select("id,email,display_name").eq("space_id", spaceId).eq("role", "owner").eq("status", "active").maybeSingle(),
  ]);
  if (spaceError) throw serviceError("A Drop tér nem tölthető be.", spaceError.code || "DROP_SPACE_PROJECT_SPACE_LOAD_FAILED", 500, spaceError);
  if (!space) throw serviceError("A Drop tér nem található.", "DROP_SPACE_NOT_FOUND", 404);
  if (ownerError) throw serviceError("A Drop térgazda nem tölthető be.", ownerError.code || "DROP_SPACE_PROJECT_OWNER_LOAD_FAILED", 500, ownerError);
  if (!owner) throw serviceError("A Drop térhez nincs aktív térgazda.", "DROP_SPACE_OWNER_MISSING", 409);
  return { client, space, owner };
}

export async function listDropSpaceProjectOptions(spaceId: string) {
  const { client, space } = await loadSpaceContext(spaceId);
  const [projectsResult, linksResult] = await Promise.all([
    client
      .from("project_core_projects")
      .select("id,code,name,description,status,current_phase,updated_at")
      .neq("status", "DELETED")
      .order("updated_at", { ascending: false }),
    client
      .from("drop_space_projects")
      .select("id,space_id,project_id,project_name_snapshot,sync_to_dock,allow_dock_package_creation,archive_to_drive,drive_target_folder_id,created_at,updated_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true }),
  ]);
  if (projectsResult.error) throw serviceError("A Projektkapu projektlistája nem tölthető be.", projectsResult.error.code || "DROP_SPACE_PROJECT_LIST_FAILED", 500, projectsResult.error);
  if (linksResult.error) throw serviceError("A Drop tér projektkapcsolatai nem tölthetők be.", linksResult.error.code || "DROP_SPACE_PROJECT_LINK_LIST_FAILED", 500, linksResult.error);
  const links = linksResult.data || [];
  const linkByProject = new Map(links.map((link) => [String(link.project_id), link]));
  return {
    space,
    projects: (projectsResult.data || []).map((project) => ({
      id: String(project.id),
      code: String(project.code),
      name: String(project.name),
      description: String(project.description || ""),
      status: String(project.status),
      currentPhase: String(project.current_phase || ""),
      linked: linkByProject.has(String(project.id)),
      link: linkByProject.get(String(project.id)) || null,
    })),
    links,
  };
}

export async function linkDropSpaceProject(spaceId: string, projectIdInput: unknown, options: DropProjectLinkOptions = {}) {
  const projectId = clean(projectIdInput, 180);
  if (!projectId) throw serviceError("Projekt kiválasztása kötelező.", "DROP_SPACE_PROJECT_ID_REQUIRED", 400);
  const { client, space, owner } = await loadSpaceContext(spaceId);
  const { data: project, error: projectError } = await client
    .from("project_core_projects")
    .select("id,code,name,status")
    .eq("id", projectId)
    .neq("status", "DELETED")
    .maybeSingle();
  if (projectError) throw serviceError("A Projektkapu projekt nem tölthető be.", projectError.code || "DROP_SPACE_PROJECT_LOAD_FAILED", 500, projectError);
  if (!project) throw serviceError("A kiválasztott Projektkapu projekt nem található.", "DROP_PROJECT_NOT_FOUND", 404);

  const { data: existing, error: existingError } = await client
    .from("drop_space_projects")
    .select("*")
    .eq("space_id", spaceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (existingError) throw serviceError("A meglévő projektkapcsolat nem ellenőrizhető.", existingError.code || "DROP_SPACE_PROJECT_CHECK_FAILED", 500, existingError);
  if (existing) return { created: false, link: existing, project, space };

  const now = new Date().toISOString();
  const { data: link, error: linkError } = await client
    .from("drop_space_projects")
    .insert({
      space_id: spaceId,
      project_id: projectId,
      project_name_snapshot: project.name,
      sync_to_dock: options.syncToDock !== false,
      allow_dock_package_creation: options.allowDockPackageCreation !== false,
      archive_to_drive: options.archiveToDrive === true,
      drive_target_folder_id: clean(options.driveTargetFolderId, 240) || null,
      added_by_membership_id: owner.id,
      updated_at: now,
    })
    .select("*")
    .single();
  if (linkError || !link) throw serviceError("A Drop tér projektkapcsolata nem hozható létre.", linkError?.code || "DROP_SPACE_PROJECT_LINK_CREATE_FAILED", 500, linkError);

  const entityId = `entity-link-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const { error: entityError } = await client.from("project_core_entity_links").insert({
    id: entityId,
    project_id: projectId,
    source_type: "drop_space",
    source_id: spaceId,
    target_type: "project",
    target_id: projectId,
    relation_type: "RELATES_TO",
    created_by: "license-admin",
  });
  if (entityError) {
    await client.from("drop_space_projects").delete().eq("id", link.id);
    throw serviceError("A közös projektkapcsolati rekord nem hozható létre.", entityError.code || "DROP_PROJECT_ENTITY_LINK_CREATE_FAILED", 500, entityError);
  }

  const { error: auditError } = await client.from("project_core_audit_events").insert({
    id: `project-audit-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    project_id: projectId,
    actor_user_id: "license-admin",
    event_type: "DROP_SPACE_LINKED",
    entity_type: "project",
    entity_id: projectId,
    summary: `${space.name} Drop tér összekapcsolva a projekttel.`,
    metadata: { spaceId, spaceCode: space.public_code, dropProjectLinkId: link.id, entityLinkId: entityId },
    created_at: now,
  });
  if (auditError) {
    await client.from("project_core_entity_links").delete().eq("id", entityId);
    await client.from("drop_space_projects").delete().eq("id", link.id);
    throw serviceError("A projektkapcsolat auditja nem rögzíthető.", auditError.code || "DROP_SPACE_PROJECT_AUDIT_FAILED", 500, auditError);
  }

  return { created: true, link, project, space };
}

export async function unlinkDropSpaceProject(spaceId: string, projectIdInput: unknown) {
  const projectId = clean(projectIdInput, 180);
  if (!projectId) throw serviceError("A leválasztandó projekt azonosítója hiányzik.", "DROP_SPACE_PROJECT_ID_REQUIRED", 400);
  const { client, space } = await loadSpaceContext(spaceId);
  const { data: link, error: linkError } = await client
    .from("drop_space_projects")
    .select("*")
    .eq("space_id", spaceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (linkError) throw serviceError("A projektkapcsolat nem tölthető be.", linkError.code || "DROP_SPACE_PROJECT_LINK_LOAD_FAILED", 500, linkError);
  if (!link) return { removed: false, projectId, space };

  const { error: deleteError } = await client.from("drop_space_projects").delete().eq("id", link.id);
  if (deleteError) throw serviceError("A projektkapcsolat nem törölhető.", deleteError.code || "DROP_SPACE_PROJECT_UNLINK_FAILED", 500, deleteError);
  await client
    .from("project_core_entity_links")
    .delete()
    .eq("project_id", projectId)
    .eq("source_type", "drop_space")
    .eq("source_id", spaceId)
    .eq("target_type", "project")
    .eq("target_id", projectId)
    .eq("relation_type", "RELATES_TO");
  await client.from("project_core_audit_events").insert({
    id: `project-audit-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    project_id: projectId,
    actor_user_id: "license-admin",
    event_type: "DROP_SPACE_UNLINKED",
    entity_type: "project",
    entity_id: projectId,
    summary: `${space.name} Drop tér leválasztva a projektről.`,
    metadata: { spaceId, spaceCode: space.public_code, dropProjectLinkId: link.id },
    created_at: new Date().toISOString(),
  });
  return { removed: true, projectId, space };
}
