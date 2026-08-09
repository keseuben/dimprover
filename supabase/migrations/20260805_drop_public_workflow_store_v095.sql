begin;

do $$
begin
  if to_regclass('public.drop_schema_meta') is null
     or to_regclass('public.drop_packages') is null then
    raise exception 'DROP 0.9.5 requires the existing DIMPRO Drop core schema.';
  end if;
end $$;

create table if not exists public.drop_public_send_codes (
  id text primary key,
  label text not null check (char_length(label) between 2 and 160),
  code_hash text not null,
  code_salt text not null,
  code_hint text not null check (code_hint ~ '^\*\*\*-[0-9]{3}$'),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null,
  max_packages_per_day integer not null default 10 check (max_packages_per_day between 1 and 100),
  max_bytes_per_day bigint not null default 2147483648 check (max_bytes_per_day between 262144000 and 53687091200),
  max_recipients integer not null default 10 check (max_recipients between 1 and 20),
  default_retention_days integer not null default 5 check (default_retention_days between 1 and 7),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.drop_public_submission_gates (
  id text primary key,
  slug text not null unique,
  gate_type text not null check (gate_type in ('personal','project','organization')),
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '',
  status text not null default 'active' check (status in ('active','revoked','expired')),
  recipients jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  project_id text,
  project_name text,
  target_folder text,
  limits jsonb not null default '{"maxFileCount":50,"maxFileSizeBytes":262144000,"maxTotalSizeBytes":262144000}'::jsonb check (jsonb_typeof(limits) = 'object'),
  retention_days integer not null default 5 check (retention_days between 1 and 7),
  require_sender_email boolean not null default true,
  allow_package_comment boolean not null default true,
  allow_file_comments boolean not null default true,
  download_protection text not null default 'link_pin' check (download_protection in ('link','link_pin')),
  expires_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.drop_public_sessions (
  id text primary key,
  token_hash text not null unique,
  workflow_type text not null check (workflow_type in ('send','submission_gate')),
  send_code_id text references public.drop_public_send_codes(id) on delete restrict,
  gate_id text references public.drop_public_submission_gates(id) on delete restrict,
  ip_hash text not null,
  user_agent_summary text not null,
  expires_at timestamptz not null,
  package_id uuid references public.drop_packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  used_at timestamptz,
  constraint drop_public_session_source_check check (
    (workflow_type = 'send' and send_code_id is not null and gate_id is null)
    or (workflow_type = 'submission_gate' and gate_id is not null and send_code_id is null)
  )
);

create table if not exists public.drop_public_package_workflows (
  package_id uuid primary key references public.drop_packages(id) on delete cascade,
  workflow_type text not null check (workflow_type in ('package_drop','send','submission_gate')),
  subject text not null default '',
  sender_message text not null default '',
  package_note text not null default '',
  require_download_pin boolean not null default true,
  send_code_id text references public.drop_public_send_codes(id) on delete set null,
  gate_id text references public.drop_public_submission_gates(id) on delete set null,
  gate_type text check (gate_type is null or gate_type in ('personal','project','organization')),
  project_id text,
  project_name text,
  target_folder text,
  selected_recipient_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_recipient_ids) = 'array'),
  recipient_emails jsonb not null default '[]'::jsonb check (jsonb_typeof(recipient_emails) = 'array'),
  finalized_at timestamptz,
  notification_status text not null default 'not_requested' check (notification_status in ('not_requested','pending','sent','partial','failed')),
  notification_detail text,
  download_link_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drop_public_usage (
  id text primary key,
  send_code_id text not null references public.drop_public_send_codes(id) on delete restrict,
  package_id uuid not null unique references public.drop_packages(id) on delete cascade,
  reserved_bytes bigint not null check (reserved_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists drop_public_send_codes_status_expiry_idx on public.drop_public_send_codes(status, expires_at);
create index if not exists drop_public_gates_status_expiry_idx on public.drop_public_submission_gates(status, expires_at);
create index if not exists drop_public_sessions_expiry_idx on public.drop_public_sessions(expires_at);
create index if not exists drop_public_sessions_package_idx on public.drop_public_sessions(package_id) where package_id is not null;
create index if not exists drop_public_usage_code_created_idx on public.drop_public_usage(send_code_id, created_at);
create index if not exists drop_public_workflows_status_idx on public.drop_public_package_workflows(notification_status, updated_at);

alter table public.drop_public_send_codes enable row level security;
alter table public.drop_public_submission_gates enable row level security;
alter table public.drop_public_sessions enable row level security;
alter table public.drop_public_package_workflows enable row level security;
alter table public.drop_public_usage enable row level security;

revoke all on table public.drop_public_send_codes from public, anon, authenticated;
revoke all on table public.drop_public_submission_gates from public, anon, authenticated;
revoke all on table public.drop_public_sessions from public, anon, authenticated;
revoke all on table public.drop_public_package_workflows from public, anon, authenticated;
revoke all on table public.drop_public_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.drop_public_send_codes to service_role;
grant select, insert, update, delete on table public.drop_public_submission_gates to service_role;
grant select, insert, update, delete on table public.drop_public_sessions to service_role;
grant select, insert, update, delete on table public.drop_public_package_workflows to service_role;
grant select, insert, update, delete on table public.drop_public_usage to service_role;
create or replace function public.drop_public_cleanup(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_sessions integer := 0;
  deleted_usage integer := 0;
  expired_codes integer := 0;
  expired_gates integer := 0;
begin
  delete from public.drop_public_sessions where expires_at <= p_now;
  get diagnostics deleted_sessions = row_count;
  delete from public.drop_public_usage where created_at <= p_now - interval '8 days';
  get diagnostics deleted_usage = row_count;
  update public.drop_public_send_codes set status='expired', updated_at=p_now where status='active' and expires_at <= p_now;
  get diagnostics expired_codes = row_count;
  update public.drop_public_submission_gates set status='expired', updated_at=p_now where status='active' and expires_at <= p_now;
  get diagnostics expired_gates = row_count;
  return jsonb_build_object('deletedSessions',deleted_sessions,'deletedUsage',deleted_usage,'expiredCodes',expired_codes,'expiredGates',expired_gates);
end;
$$;

create or replace function public.drop_public_bind_session_package_atomic(
  p_token_hash text,
  p_package_id uuid,
  p_reserved_bytes bigint
)
returns public.drop_public_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.drop_public_sessions%rowtype;
  code_row public.drop_public_send_codes%rowtype;
  used_packages integer := 0;
  used_bytes bigint := 0;
begin
  select * into session_row from public.drop_public_sessions
  where token_hash=p_token_hash and expires_at>now()
  for update;
  if not found then raise exception 'DROP_PUBLIC_SESSION_INVALID'; end if;
  if session_row.package_id is not null and session_row.package_id<>p_package_id then
    raise exception 'DROP_PUBLIC_SESSION_ALREADY_BOUND';
  end if;
  if session_row.send_code_id is not null then
    select * into code_row from public.drop_public_send_codes where id=session_row.send_code_id for update;
    if not found or code_row.status<>'active' or code_row.expires_at<=now() then raise exception 'DROP_SEND_CODE_DENIED'; end if;
    select count(*),coalesce(sum(reserved_bytes),0) into used_packages,used_bytes
    from public.drop_public_usage
    where send_code_id=code_row.id and created_at>=date_trunc('day',now()) and package_id<>p_package_id;
    if used_packages>=code_row.max_packages_per_day then raise exception 'DROP_SEND_CODE_DAILY_PACKAGE_LIMIT'; end if;
    if used_bytes+greatest(p_reserved_bytes,0)>code_row.max_bytes_per_day then raise exception 'DROP_SEND_CODE_DAILY_BYTES_LIMIT'; end if;
    insert into public.drop_public_usage(id,send_code_id,package_id,reserved_bytes,created_at)
    values('usage_'||substr(replace(gen_random_uuid()::text,'-',''),1,12),code_row.id,p_package_id,greatest(p_reserved_bytes,0),now())
    on conflict(package_id) do nothing;
  end if;
  update public.drop_public_sessions set package_id=p_package_id,used_at=coalesce(used_at,now()),updated_at=now()
  where id=session_row.id returning * into session_row;
  return session_row;
end;
$$;

create or replace function public.drop_public_claim_finalization_atomic(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workflow_row public.drop_public_package_workflows%rowtype;
begin
  select * into workflow_row from public.drop_public_package_workflows where package_id=p_package_id for update;
  if not found then raise exception 'DROP_PUBLIC_WORKFLOW_NOT_FOUND'; end if;
  if workflow_row.finalized_at is not null then
    return jsonb_build_object('state','finalized','workflow',to_jsonb(workflow_row));
  end if;
  if workflow_row.notification_status='pending' and workflow_row.updated_at>now()-interval '5 minutes' then
    raise exception 'DROP_PUBLIC_FINALIZE_IN_PROGRESS';
  end if;
  update public.drop_public_package_workflows
  set notification_status='pending',notification_detail='A vírusellenőrzött küldemény kézbesítése folyamatban van.',updated_at=now()
  where package_id=p_package_id returning * into workflow_row;
  return jsonb_build_object('state','claimed','workflow',to_jsonb(workflow_row));
end;
$$;

create or replace function public.drop_public_activate_postgres_store(p_reason text,p_counts jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_metadata jsonb;
begin
  select coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'postgresStore',true,'multiInstanceReady',true,'activeStore','postgresql',
    'storeActivatedAt',now(),'activationReason',coalesce(nullif(p_reason,''),'manual'),
    'importCounts',coalesce(p_counts,'{}'::jsonb)
  ) into next_metadata
  from public.drop_schema_meta where component='drop-public-workflows';
  update public.drop_schema_meta set metadata=next_metadata,updated_at=now() where component='drop-public-workflows';
  return next_metadata;
end;
$$;
create or replace function public.drop_public_import_file_state_atomic(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  counts jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('dimpro-drop-public-v095-file-import'));
  for item in select value from jsonb_array_elements(coalesce(p_state->'sendCodes','[]'::jsonb)) loop
    insert into public.drop_public_send_codes(id,label,code_hash,code_salt,code_hint,status,expires_at,max_packages_per_day,max_bytes_per_day,max_recipients,default_retention_days,created_by,created_at,updated_at,revoked_at)
    values(item->>'id',item->>'label',item->>'codeHash',item->>'codeSalt',item->>'codeHint',item->>'status',(item->>'expiresAt')::timestamptz,(item->>'maxPackagesPerDay')::integer,(item->>'maxBytesPerDay')::bigint,(item->>'maxRecipients')::integer,(item->>'defaultRetentionDays')::integer,item->>'createdBy',(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,nullif(item->>'revokedAt','')::timestamptz)
    on conflict(id) do update set label=excluded.label,code_hash=excluded.code_hash,code_salt=excluded.code_salt,code_hint=excluded.code_hint,status=excluded.status,expires_at=excluded.expires_at,max_packages_per_day=excluded.max_packages_per_day,max_bytes_per_day=excluded.max_bytes_per_day,max_recipients=excluded.max_recipients,default_retention_days=excluded.default_retention_days,updated_at=excluded.updated_at,revoked_at=excluded.revoked_at;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_state->'gates','[]'::jsonb)) loop
    insert into public.drop_public_submission_gates(id,slug,gate_type,title,description,status,recipients,project_id,project_name,target_folder,limits,retention_days,require_sender_email,allow_package_comment,allow_file_comments,download_protection,expires_at,created_by,created_at,updated_at,revoked_at)
    values(item->>'id',item->>'slug',item->>'type',item->>'title',coalesce(item->>'description',''),item->>'status',coalesce(item->'recipients','[]'::jsonb),nullif(item->>'projectId',''),nullif(item->>'projectName',''),nullif(item->>'targetFolder',''),coalesce(item->'limits','{}'::jsonb),(item->>'retentionDays')::integer,coalesce((item->>'requireSenderEmail')::boolean,true),coalesce((item->>'allowPackageComment')::boolean,true),coalesce((item->>'allowFileComments')::boolean,true),item->>'downloadProtection',(item->>'expiresAt')::timestamptz,item->>'createdBy',(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,nullif(item->>'revokedAt','')::timestamptz)
    on conflict(id) do update set slug=excluded.slug,gate_type=excluded.gate_type,title=excluded.title,description=excluded.description,status=excluded.status,recipients=excluded.recipients,project_id=excluded.project_id,project_name=excluded.project_name,target_folder=excluded.target_folder,limits=excluded.limits,retention_days=excluded.retention_days,require_sender_email=excluded.require_sender_email,allow_package_comment=excluded.allow_package_comment,allow_file_comments=excluded.allow_file_comments,download_protection=excluded.download_protection,expires_at=excluded.expires_at,updated_at=excluded.updated_at,revoked_at=excluded.revoked_at;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_state->'sessions','[]'::jsonb)) loop
    insert into public.drop_public_sessions(id,token_hash,workflow_type,send_code_id,gate_id,ip_hash,user_agent_summary,expires_at,package_id,created_at,updated_at,used_at)
    values(item->>'id',item->>'tokenHash',item->>'workflowType',nullif(item->>'sendCodeId',''),nullif(item->>'gateId',''),item->>'ipHash',item->>'userAgentSummary',(item->>'expiresAt')::timestamptz,nullif(item->>'packageId','')::uuid,(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz,nullif(item->>'usedAt','')::timestamptz)
    on conflict(id) do update set expires_at=excluded.expires_at,package_id=excluded.package_id,updated_at=excluded.updated_at,used_at=excluded.used_at;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_state->'packageWorkflows','[]'::jsonb)) loop
    insert into public.drop_public_package_workflows(package_id,workflow_type,subject,sender_message,package_note,require_download_pin,send_code_id,gate_id,gate_type,project_id,project_name,target_folder,selected_recipient_ids,recipient_emails,finalized_at,notification_status,notification_detail,download_link_hint,created_at,updated_at)
    values((item->>'packageId')::uuid,item->>'workflowType',coalesce(item->>'subject',''),coalesce(item->>'senderMessage',''),coalesce(item->>'packageNote',''),coalesce((item->>'requireDownloadPin')::boolean,true),nullif(item->>'sendCodeId',''),nullif(item->>'gateId',''),nullif(item->>'gateType',''),nullif(item->>'projectId',''),nullif(item->>'projectName',''),nullif(item->>'targetFolder',''),coalesce(item->'selectedRecipientIds','[]'::jsonb),coalesce(item->'recipientEmails','[]'::jsonb),nullif(item->>'finalizedAt','')::timestamptz,coalesce(nullif(item->>'notificationStatus',''),'not_requested'),nullif(item->>'notificationDetail',''),nullif(item->>'downloadLinkHint',''),(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz)
    on conflict(package_id) do update set workflow_type=excluded.workflow_type,subject=excluded.subject,sender_message=excluded.sender_message,package_note=excluded.package_note,require_download_pin=excluded.require_download_pin,send_code_id=excluded.send_code_id,gate_id=excluded.gate_id,gate_type=excluded.gate_type,project_id=excluded.project_id,project_name=excluded.project_name,target_folder=excluded.target_folder,selected_recipient_ids=excluded.selected_recipient_ids,recipient_emails=excluded.recipient_emails,finalized_at=excluded.finalized_at,notification_status=excluded.notification_status,notification_detail=excluded.notification_detail,download_link_hint=excluded.download_link_hint,updated_at=excluded.updated_at;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_state->'usage','[]'::jsonb)) loop
    insert into public.drop_public_usage(id,send_code_id,package_id,reserved_bytes,created_at)
    values(item->>'id',item->>'sendCodeId',(item->>'packageId')::uuid,(item->>'reservedBytes')::bigint,(item->>'createdAt')::timestamptz)
    on conflict(package_id) do nothing;
  end loop;
  counts=jsonb_build_object('sendCodes',jsonb_array_length(coalesce(p_state->'sendCodes','[]'::jsonb)),'gates',jsonb_array_length(coalesce(p_state->'gates','[]'::jsonb)),'sessions',jsonb_array_length(coalesce(p_state->'sessions','[]'::jsonb)),'workflows',jsonb_array_length(coalesce(p_state->'packageWorkflows','[]'::jsonb)),'usage',jsonb_array_length(coalesce(p_state->'usage','[]'::jsonb)));
  perform public.drop_public_activate_postgres_store('file-import',counts);
  return counts;
end;
$$;

revoke all on function public.drop_public_cleanup(timestamptz) from public, anon, authenticated;
revoke all on function public.drop_public_bind_session_package_atomic(text,uuid,bigint) from public, anon, authenticated;
revoke all on function public.drop_public_claim_finalization_atomic(uuid) from public, anon, authenticated;
revoke all on function public.drop_public_activate_postgres_store(text,jsonb) from public, anon, authenticated;
revoke all on function public.drop_public_import_file_state_atomic(jsonb) from public, anon, authenticated;
grant execute on function public.drop_public_cleanup(timestamptz) to service_role;
grant execute on function public.drop_public_bind_session_package_atomic(text,uuid,bigint) to service_role;
grant execute on function public.drop_public_claim_finalization_atomic(uuid) to service_role;
grant execute on function public.drop_public_activate_postgres_store(text,jsonb) to service_role;
grant execute on function public.drop_public_import_file_state_atomic(jsonb) to service_role;

insert into public.drop_schema_meta(component,schema_version,migration_count,bootstrap_id,metadata,updated_at)
values('drop-public-workflows','DROP 0.9.5',1,'drop-095-public-workflow-store-20260805',jsonb_build_object('postgresStore',true,'multiInstanceReady',true,'atomicSessionBinding',true,'atomicFinalization',true,'fileImportSupported',true,'activeStore','pending'),now())
on conflict(component) do update set schema_version=excluded.schema_version,migration_count=excluded.migration_count,bootstrap_id=excluded.bootstrap_id,metadata=coalesce(public.drop_schema_meta.metadata,'{}'::jsonb)||excluded.metadata,updated_at=excluded.updated_at;

notify pgrst, 'reload schema';
commit;
