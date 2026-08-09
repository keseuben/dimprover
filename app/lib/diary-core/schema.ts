export const DIARY_CORE_COMPONENT = "diary-core";
export const DIARY_CORE_SCHEMA_VERSION = "0.8.0";
export const DIARY_CORE_MIGRATION_COUNT = 1;
export const DIARY_CORE_BOOTSTRAP_ID = "diary-core-v080-20260802";

export const DIARY_CORE_TABLES = [
  "diary_core_schema_meta",
  "diary_core_sequences",
  "diary_core_entries",
  "diary_core_events",
] as const;

export type DiaryCoreTable = (typeof DIARY_CORE_TABLES)[number];

export function getDiaryCoreSchemaSelect(table: DiaryCoreTable) {
  switch (table) {
    case "diary_core_schema_meta":
      return "component,schema_version,migration_count,bootstrap_id";
    case "diary_core_sequences":
      return "project_id,diary_year,next_number";
    case "diary_core_entries":
      return "id,project_id,code,diary_date,status,version";
    case "diary_core_events":
      return "id,project_id,entry_id,code,status,version";
  }
}
