export const DECIDE_CORE_COMPONENT = "decide-core";
export const DECIDE_CORE_SCHEMA_VERSION = "0.7.0";
export const DECIDE_CORE_MIGRATION_COUNT = 1;
export const DECIDE_CORE_BOOTSTRAP_ID = "decide-core-v070-20260802";

export const DECIDE_CORE_TABLES = [
  "decide_core_schema_meta",
  "decide_core_sequences",
  "decide_core_requests",
  "decide_core_approvers",
  "decide_core_notes",
] as const;

export type DecideCoreTable = typeof DECIDE_CORE_TABLES[number];

export function getDecideCoreSchemaSelect(table: DecideCoreTable) {
  const selects: Record<DecideCoreTable, string> = {
    decide_core_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    decide_core_sequences: "project_id,next_number,updated_at",
    decide_core_requests: "id,project_id,code,status,version",
    decide_core_approvers: "id,project_id,request_id,stage_number,status",
    decide_core_notes: "id,project_id,request_id,note_type,created_at",
  };
  return selects[table];
}
