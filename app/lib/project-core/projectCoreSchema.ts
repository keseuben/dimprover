export const PROJECT_CORE_SCHEMA_VERSION = "0.2.0";
export const PROJECT_CORE_MIGRATION_COUNT = 1;
export const PROJECT_CORE_BOOTSTRAP_ID = "project-core-v020-20260802";

export const PROJECT_CORE_TABLES = [
  "project_core_schema_meta",
  "project_core_projects",
  "project_core_memberships",
  "project_core_audit_events",
  "project_core_entity_links",
] as const;

export type ProjectCoreTable = typeof PROJECT_CORE_TABLES[number];

export function getProjectCoreSchemaSelect(table: ProjectCoreTable) {
  const selects: Record<ProjectCoreTable, string> = {
    project_core_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    project_core_projects: "id,organization_id,code,name,status",
    project_core_memberships: "id,project_id,user_id,role,status",
    project_core_audit_events: "id,project_id,event_type,created_at",
    project_core_entity_links: "id,project_id,source_type,source_id,target_type,target_id,relation_type",
  };
  return selects[table];
}
