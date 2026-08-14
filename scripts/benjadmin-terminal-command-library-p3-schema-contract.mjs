import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260814160000_benjadmin_terminal_command_library_v010.sql";
const shaPath = `${migrationPath}.sha256`;
const rollbackPath = "supabase/rollback/20260814160000_benjadmin_terminal_command_library_v010_rollback.sql";
const migration = fs.readFileSync(path.join(root, migrationPath), "utf8");
const rollback = fs.readFileSync(path.join(root, rollbackPath), "utf8");
const expectedSha = fs.readFileSync(path.join(root, shaPath), "utf8").trim();
const actualSha = crypto.createHash("sha256").update(migration).digest("hex");
const checks = [];
function check(name, ok) { checks.push(Boolean(ok)); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) throw new Error(name); }

check("Migration SHA-256 egyezik", expectedSha === actualSha);
check("Deduplikált katalógus tábla létezik", migration.includes("dev_center_terminal_command_catalog"));
check("Használati esemény tábla létezik", migration.includes("dev_center_terminal_command_events"));
check("command_hash UNIQUE", /command_hash\s+text\s+not null\s+unique/i.test(migration));
check("SHA-256 formátum constraint", migration.includes("^[0-9a-f]{64}$"));
check("usage_count növekszik conflict esetén", migration.includes("usage_count = public.dev_center_terminal_command_catalog.usage_count + 1"));
check("Minden rögzítés event sort ír", migration.includes("insert into public.dev_center_terminal_command_events"));
check("Katalógus projekt FK text", migration.includes("last_project_id text null references public.dev_center_projects(id)"));
check("Event worker session FK text", migration.includes("worker_session_id text null references public.dev_center_worker_sessions(id)"));
check("Nincs raw_command oszlop", !/\braw_command\b/i.test(migration));
check("Nincs secret/token/password oszlop", !/\b(secret|token|password|credential)_?(value|text|data)?\s+(text|jsonb|bytea)/i.test(migration));
check("RLS mindkét táblán aktív", ["dev_center_terminal_command_catalog", "dev_center_terminal_command_events"].every((table) => migration.includes(`alter table public.${table} enable row level security`)));
check("anon/authenticated tiltva", migration.includes("revoke all on table public.dev_center_terminal_command_catalog from anon, authenticated") && migration.includes("revoke all on table public.dev_center_terminal_command_events from anon, authenticated"));
check("service_role kap hozzáférést", migration.includes("grant all on table public.dev_center_terminal_command_catalog to service_role") && migration.includes("grant execute on function public.dev_center_record_terminal_command"));
check("Security definer search_path rögzített", migration.includes("security definer") && migration.includes("set search_path = public"));
check("Környezetek explicit allowlist", ["DEV","STAGING","PRODUCTION","LOCAL","CONTROL"].every((value) => migration.includes(`'${value}'`)));
check("Shell family explicit allowlist", ["bash","powershell","git","other"].every((value) => migration.includes(`'${value}'`)));
check("Rollback function + event + catalog törlés", rollback.includes("drop function if exists public.dev_center_record_terminal_command") && rollback.includes("drop table if exists public.dev_center_terminal_command_events") && rollback.includes("drop table if exists public.dev_center_terminal_command_catalog"));
check("Rollback schema meta takarítás", rollback.includes("benjadmin-terminal-command-library"));
console.log(`SUMMARY ${checks.filter(Boolean).length}/${checks.length} PASS`);
