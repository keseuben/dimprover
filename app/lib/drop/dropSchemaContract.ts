export const DROP_REQUIRED_TABLES = [
  "drop_packages",
  "drop_recipients",
  "drop_groups",
  "drop_access_tokens",
  "drop_access_attempts",
  "drop_events",
  "drop_schema_meta",
] as const;

export type DropRequiredTable = (typeof DROP_REQUIRED_TABLES)[number];

export const DROP_SCHEMA_VERSION = "DROP 0.2.0" as const;
export const DROP_BOOTSTRAP_SQL_PATH = "supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql" as const;

export const DROP_REQUIRED_COLUMNS: Record<DropRequiredTable, readonly string[]> = {
  drop_packages: [
    "id",
    "public_code",
    "mode",
    "title",
    "status",
    "access_policy",
    "expires_at",
    "grace_expires_at",
    "pin_hash",
    "pin_salt",
  ],
  drop_recipients: ["id", "package_id", "name", "email", "role"],
  drop_groups: ["id", "package_id", "name", "code", "sort_order"],
  drop_access_tokens: [
    "id",
    "package_id",
    "purpose",
    "token_hash",
    "token_hint",
    "status",
    "expires_at",
    "use_count",
  ],
  drop_access_attempts: [
    "id",
    "package_id",
    "attempt_type",
    "purpose",
    "ip_hash",
    "success",
    "created_at",
  ],
  drop_events: ["id", "package_id", "event_type", "severity", "payload", "created_at"],
  drop_schema_meta: [
    "component",
    "schema_version",
    "migration_count",
    "bootstrap_id",
    "installed_at",
    "updated_at",
  ],
};

export function getDropSchemaSelect(table: DropRequiredTable) {
  return DROP_REQUIRED_COLUMNS[table].join(",");
}
