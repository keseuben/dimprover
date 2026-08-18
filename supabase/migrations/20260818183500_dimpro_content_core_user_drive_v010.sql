begin;

create table if not exists public.dimpro_content_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 1 check (migration_count > 0),
  bootstrap_id text not null,
  updated_at timestamptz not null default now(),
  constraint dimpro_content_schema_meta_component_check check (length(btrim(component)) between 1 and 120),
  constraint dimpro_content_schema_meta_version_check check (length(btrim(schema_version)) between 1 and 40),
  constraint dimpro_content_schema_meta_bootstrap_check check (length(btrim(bootstrap_id)) between 1 and 160)
);

create table if not exists public.dimpro_content_objects (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null,
  original_name text null,
  display_name text not null,
  storage_provider text not null default 'S3' check (storage_provider in ('S3')),
  storage_bucket text not null,
  storage_key text not null,
  security_status text not null default 'clean' check (security_status in ('pending','clean','rejected')),
  virus_scan_status text not null default 'clean' check (virus_scan_status in ('pending','clean','infected','error')),
  source_system text not null check (source_system in ('FIELD_CAPTURE','DROP','DRIVE','IMPORT')),
  source_object_id text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DELETING','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_content_objects_sha256_check check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint dimpro_content_objects_mime_check check (length(btrim(mime_type)) between 1 and 255),
  constraint dimpro_content_objects_display_name_check check (length(btrim(display_name)) between 1 and 220),
  constraint dimpro_content_objects_bucket_check check (length(btrim(storage_bucket)) between 1 and 255),
  constraint dimpro_content_objects_key_check check (length(btrim(storage_key)) between 1 and 1024),
  constraint dimpro_content_objects_source_id_check check (length(btrim(source_object_id)) between 1 and 255),
  constraint dimpro_content_objects_hash_size_unique unique (sha256, size_bytes),
  constraint dimpro_content_objects_storage_unique unique (storage_provider, storage_bucket, storage_key)
);

create table if not exists public.dimpro_content_refs (
  id uuid primary key default gen_random_uuid(),
  content_object_id uuid not null references public.dimpro_content_objects(id) on delete restrict,
  owner_type text not null check (owner_type in ('USER','PROJECT')),
  owner_user_id uuid null references public.dimpro_users(id) on delete restrict,
  owner_project_id text null references public.project_core_projects(id) on delete restrict,
  folder_id text null,
  source_system text not null check (source_system in ('FIELD_CAPTURE','DROP','DRIVE','IMPORT')),
  source_ref text not null,
  display_name text not null,
  retained_independently boolean not null default true,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED')),
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_content_refs_owner_xor_check check (
    (owner_type = 'USER' and owner_user_id is not null and owner_project_id is null)
    or
    (owner_type = 'PROJECT' and owner_user_id is null and owner_project_id is not null)
  ),
  constraint dimpro_content_refs_source_ref_check check (length(btrim(source_ref)) between 1 and 255),
  constraint dimpro_content_refs_display_name_check check (length(btrim(display_name)) between 1 and 220)
);

create index if not exists dimpro_content_objects_status_created_idx
  on public.dimpro_content_objects(status, created_at desc);
create index if not exists dimpro_content_refs_object_idx
  on public.dimpro_content_refs(content_object_id, status);
create index if not exists dimpro_content_refs_user_idx
  on public.dimpro_content_refs(owner_user_id, status, updated_at desc)
  where owner_type = 'USER';
create index if not exists dimpro_content_refs_project_idx
  on public.dimpro_content_refs(owner_project_id, status, updated_at desc)
  where owner_type = 'PROJECT';
create unique index if not exists dimpro_content_refs_user_source_unique
  on public.dimpro_content_refs(owner_user_id, source_system, source_ref)
  where owner_type = 'USER';
create unique index if not exists dimpro_content_refs_project_source_unique
  on public.dimpro_content_refs(owner_project_id, source_system, source_ref)
  where owner_type = 'PROJECT';

insert into public.dimpro_content_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('content-core', '0.1.0', 1, 'content-core-user-drive-v010-20260818', now())
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    updated_at = excluded.updated_at;

comment on table public.dimpro_content_objects is 'DIMPRO shared immutable content object catalog. Physical storage is independent from Drop retention and ownership references.';
comment on table public.dimpro_content_refs is 'Independent ownership/reference layer over DIMPRO content objects. P8 activates USER references; PROJECT references are reserved for later project binding.';
comment on column public.dimpro_content_refs.folder_id is 'Optional logical folder reference. P8 Field Capture V0.1 stores into the personal Drive root and leaves this NULL until a personal folder core is introduced.';
comment on column public.dimpro_content_refs.retained_independently is 'When true, deleting the source workflow/reference must not remove this ownership reference or its content object while another active reference exists.';

alter table public.dimpro_content_schema_meta enable row level security;
alter table public.dimpro_content_objects enable row level security;
alter table public.dimpro_content_refs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.dimpro_content_schema_meta from anon';
    execute 'revoke all on table public.dimpro_content_objects from anon';
    execute 'revoke all on table public.dimpro_content_refs from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.dimpro_content_schema_meta from authenticated';
    execute 'revoke all on table public.dimpro_content_objects from authenticated';
    execute 'revoke all on table public.dimpro_content_refs from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.dimpro_content_schema_meta to service_role';
    execute 'grant all on table public.dimpro_content_objects to service_role';
    execute 'grant all on table public.dimpro_content_refs to service_role';
  end if;
end
$$;

commit;
