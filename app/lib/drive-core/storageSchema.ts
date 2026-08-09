export const DRIVE_OBJECT_STORAGE_SCHEMA_VERSION = "0.4.0";
export const DRIVE_OBJECT_STORAGE_MIGRATION_COUNT = 1;
export const DRIVE_OBJECT_STORAGE_BOOTSTRAP_ID = "drive-object-storage-v040-20260802";

export const DRIVE_OBJECT_STORAGE_TABLES = [
  "drive_storage_schema_meta",
  "drive_core_upload_sessions",
] as const;

export type DriveObjectStorageTable = typeof DRIVE_OBJECT_STORAGE_TABLES[number];

export function getDriveObjectStorageSchemaSelect(table: DriveObjectStorageTable) {
  const selects: Record<DriveObjectStorageTable, string> = {
    drive_storage_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    drive_core_upload_sessions: "id,project_id,upload_kind,status,storage_bucket,storage_key,expires_at",
  };
  return selects[table];
}
