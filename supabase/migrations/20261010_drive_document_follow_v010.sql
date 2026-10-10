-- DIMPRO Drive V0.9.34: stable-document follows and user-selected notification scope.
-- SOURCE ONLY. Guarded migration approval required; no automated schema application.
begin;

do $guard$
begin
  if to_regclass('public.project_core_projects') is null
     or to_regclass('public.drive_core_documents') is null then
    raise exception 'DRIVE_FOLLOW_REQUIRED_SCHEMA_MISSING' using errcode='55000';
  end if;
end
$guard$;

create table if not exists public.drive_core_document_follows (
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  user_id text not null,
  notify_versions boolean not null default true,
  notify_revisions boolean not null default true,
  notify_approvals boolean not null default false,
  digest_frequency text not null default 'DAILY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id, document_id, user_id),
  constraint drive_follow_frequency_check check (
    digest_frequency in ('FOUR_HOURLY','EIGHT_HOURLY','DAILY','WEEKLY','MONTHLY','NONE')
  ),
  constraint drive_follow_user_nonempty_check check (length(btrim(user_id)) > 0)
);

create index if not exists drive_follow_user_project_idx
  on public.drive_core_document_follows(user_id, project_id, updated_at desc);
create index if not exists drive_follow_project_doc_idx
  on public.drive_core_document_follows(project_id, document_id);

alter table public.drive_core_document_follows enable row level security;
revoke all on public.drive_core_document_follows from public, anon, authenticated;
grant select, insert, update, delete on public.drive_core_document_follows to service_role;

commit;
