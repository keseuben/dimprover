export const DRIVE_CORE_SCHEMA_VERSION = "0.8.6";
export const DRIVE_CORE_MIGRATION_COUNT = 7;
export const DRIVE_CORE_BOOTSTRAP_ID = "drive-core-v086-folder-password-gate-20261002";

export const DRIVE_CORE_TABLES = [
  "drive_core_schema_meta",
  "drive_core_folders",
  "drive_core_folder_acl_entries",
  "drive_core_documents",
  "drive_core_document_versions",
  "drive_core_change_events",
  "drive_core_sync_cursors",
  "drive_core_project_bootstraps",
  "drive_core_project_settings",
  "drive_core_folder_passwords",
  "drive_core_folder_password_attempts",
] as const;

export type DriveCoreTable = typeof DRIVE_CORE_TABLES[number];

export function getDriveCoreSchemaSelect(table: DriveCoreTable) {
  const selects: Record<DriveCoreTable, string> = {
    drive_core_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    drive_core_folders: "id,project_id,parent_id,name,path,original_name,display_name,acl_inherit,status",
    drive_core_folder_acl_entries: "id,project_id,folder_id,principal_type,membership_id,role,permission,effect",
    drive_core_documents: "id,project_id,folder_id,name,status,current_version_number,export_alias",
    drive_core_document_versions: "id,project_id,document_id,version_number,revision_number,revision_code,version_kind,revision_reason,revision_date,numbering_origin,numbering_correction_reason,numbering_corrected_by,numbering_corrected_at,status",
    drive_core_change_events: "sequence,id,project_id,event_type,entity_type,entity_id",
    drive_core_sync_cursors: "id,project_id,client_id,cursor_value,last_sync_at",
    drive_core_project_bootstraps: "project_id,bootstrap_id,bootstrapped_at",
    drive_core_project_settings: "project_id,metadata_options,updated_by,created_at,updated_at",
    drive_core_folder_passwords: "project_id,folder_id,password_version,unlock_ttl_minutes,max_attempts,lockout_minutes,created_by,updated_by,created_at,updated_at",
    drive_core_folder_password_attempts: "project_id,folder_id,actor_user_id,failure_count,locked_until,updated_at",
  };
  return selects[table];
}
