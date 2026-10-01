export const DRIVE_CORE_SCHEMA_VERSION = "0.7.0";
export const DRIVE_CORE_MIGRATION_COUNT = 4;
export const DRIVE_CORE_BOOTSTRAP_ID = "drive-core-v070-folder-acl-20261001";

export const DRIVE_CORE_TABLES = [
  "drive_core_schema_meta",
  "drive_core_folders",
  "drive_core_folder_acl_entries",
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
    drive_core_folders: "id,project_id,parent_id,name,path,original_name,display_name,acl_inherit,status",
    drive_core_folder_acl_entries: "id,project_id,folder_id,principal_type,membership_id,role,permission,effect",
    drive_core_documents: "id,project_id,folder_id,name,status,current_version_number",
    drive_core_document_versions: "id,project_id,document_id,version_number,status",
    drive_core_change_events: "sequence,id,project_id,event_type,entity_type,entity_id",
    drive_core_sync_cursors: "id,project_id,client_id,cursor_value,last_sync_at",
    drive_core_project_bootstraps: "project_id,bootstrap_id,bootstrapped_at",
  };
  return selects[table];
}
