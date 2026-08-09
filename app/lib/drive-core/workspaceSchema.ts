export const DRIVE_WORKSPACE_SCHEMA_VERSION = "1.0.0";
export const DRIVE_WORKSPACE_MIGRATION_COUNT = 1;
export const DRIVE_WORKSPACE_BOOTSTRAP_ID = "drive-workspace-v100-20260807";

export const DRIVE_WORKSPACE_TABLES = [
  "drive_workspace_schema_meta",
  "drive_core_document_metadata",
  "drive_core_file_notes",
  "drive_core_qr_codes",
  "drive_core_boxes",
  "drive_core_box_items",
  "drive_core_saved_views",
] as const;

export type DriveWorkspaceTable = typeof DRIVE_WORKSPACE_TABLES[number];

export function getDriveWorkspaceSchemaSelect(table: DriveWorkspaceTable) {
  const selects: Record<DriveWorkspaceTable, string> = {
    drive_workspace_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    drive_core_document_metadata: "id,project_id,document_id,plan_no,discipline,document_type,revision,issue_status,approval_status,building,level,zone,updated_by,updated_at",
    drive_core_file_notes: "id,project_id,document_id,version_id,note,updated_by,updated_at",
    drive_core_qr_codes: "id,project_id,document_id,version_id,public_key,status,created_by,created_at",
    drive_core_boxes: "id,project_id,name,purpose,color_token,icon_key,note,sort_order,status,created_by,created_at,updated_at",
    drive_core_box_items: "id,project_id,box_id,document_id,version_id,sort_order,added_by,added_at",
    drive_core_saved_views: "id,project_id,user_id,name,mode,columns,is_default,updated_at",
  };
  return selects[table];
}
