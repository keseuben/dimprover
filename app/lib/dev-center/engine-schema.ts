export const DEV_CENTER_ENGINE_SCHEMA_VERSION = "0.3.0";
export const DEV_CENTER_ENGINE_BOOTSTRAP_ID = "BENJADMIN-B3-M3-20260810";
export const DEV_CENTER_ENGINE_REQUIRED_WORKERS = ["ARMINAI", "JAZMINAI", "OUTMINAI"] as const;
export const DEV_CENTER_ENGINE_TABLES = [
  "dev_center_schema_meta", "dev_center_projects", "dev_center_repositories", "dev_center_versions",
  "dev_center_workers", "dev_center_tasks", "dev_center_task_dependencies", "dev_center_environments",
  "dev_center_worker_sessions", "dev_center_session_events", "dev_center_scope_locks", "dev_center_build_runs",
  "dev_center_releases", "dev_center_infra_assets", "dev_center_backup_runs", "dev_center_work_sessions",
  "dev_center_work_segments", "dev_center_audit_events", "dev_center_worktree_leases", "dev_center_conflicts",
] as const;
