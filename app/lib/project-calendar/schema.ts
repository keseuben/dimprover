export const PROJECT_CALENDAR_SCHEMA_VERSION = "0.5.0";
export const PROJECT_CALENDAR_MIGRATION_COUNT = 1;
export const PROJECT_CALENDAR_BOOTSTRAP_ID = "project-calendar-core-v050-20260802";
export const PROJECT_CALENDAR_COMPONENT = "project-calendar-core";
export const PROJECT_CALENDAR_TABLES = [
  "project_calendar_schema_meta",
  "project_calendar_events",
] as const;

export type ProjectCalendarTable = typeof PROJECT_CALENDAR_TABLES[number];

export function getProjectCalendarSchemaSelect(table: ProjectCalendarTable) {
  const selects: Record<ProjectCalendarTable, string> = {
    project_calendar_schema_meta: "component,schema_version,migration_count,bootstrap_id",
    project_calendar_events: "id,project_id,title,event_type,source_module,status,priority,starts_at,ends_at,version",
  };
  return selects[table];
}
