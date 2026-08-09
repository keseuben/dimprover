export const DRIVE_CORE_SCHEMA_VERSION = "0.3.0";
export const DRIVE_CORE_MIGRATION_COUNT = 1;
export const DRIVE_CORE_BOOTSTRAP_ID = "drive-core-v030-20260802";

export const DRIVE_CORE_TABLES = [
  "drive_core_schema_meta",
  "drive_core_folders",
  "drive_core_documents",
  "drive_core_document_versions",
  "drive_core_change_events",
  "drive_core_sync_cursors",
  "drive_core_project_bootstraps",
] as const;

export type DriveCoreTable = typeof DRIVE_CORE_TABLES[number];

export function getDriveCoreSchemaSelect(table: DriveCoreTable) {
  const selects: Record<DriveCoreTable, string> = {
    drive_core_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    drive_core_folders: "id,project_id,parent_id,name,path,status",
    drive_core_documents: "id,project_id,folder_id,name,status,current_version_number",
    drive_core_document_versions: "id,project_id,document_id,version_number,status",
    drive_core_change_events: "sequence,id,project_id,event_type,entity_type,entity_id",
    drive_core_sync_cursors: "id,project_id,client_id,cursor_value,last_sync_at",
    drive_core_project_bootstraps: "project_id,bootstrap_id,bootstrapped_at",
  };
  return selects[table];
}
