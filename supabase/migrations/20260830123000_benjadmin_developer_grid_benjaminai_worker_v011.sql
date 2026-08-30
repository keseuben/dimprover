begin;

insert into public.dev_center_workers(id, code, name, role, status, capabilities, metadata)
values (
  'worker_benjaminai',
  'BENJAMINAI',
  'BenjáminAI',
  'Integrált kódmérnök worker',
  'ready',
  '["code","ui","api","test","review"]'::jsonb,
  '{"layer":"INTERNAL_AI","productionAccess":"DENY","origin":"BENJADMIN_DEVELOPER_GRID"}'::jsonb
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  role = excluded.role,
  capabilities = excluded.capabilities,
  metadata = excluded.metadata,
  updated_at = now();

commit;
