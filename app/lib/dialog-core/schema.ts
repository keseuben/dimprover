export const DIALOG_CORE_SCHEMA_VERSION = "0.6.0";
export const DIALOG_CORE_MIGRATION_COUNT = 1;
export const DIALOG_CORE_BOOTSTRAP_ID = "dialog-core-v060-20260802";
export const DIALOG_CORE_COMPONENT = "dialog-core";

export const DIALOG_CORE_TABLES = [
  "dialog_core_schema_meta",
  "dialog_core_sequences",
  "dialog_core_threads",
  "dialog_core_messages",
] as const;

export type DialogCoreTable = typeof DIALOG_CORE_TABLES[number];

export function getDialogCoreSchemaSelect(table: DialogCoreTable) {
  const selects: Record<DialogCoreTable, string> = {
    dialog_core_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    dialog_core_sequences: "project_id,next_number",
    dialog_core_threads: "id,project_id,code,thread_type,status,priority,due_at,version",
    dialog_core_messages: "id,project_id,thread_id,message_type,created_at",
  };
  return selects[table];
}
