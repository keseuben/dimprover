#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();
const migration=join(root,"supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql");
const rollback=join(root,"supabase/rollback/DIMPRO_COMMERCE_SCHEMA_CONFORMANCE_V019_ROLLBACK.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
do $$ declare v text; c integer; begin
 select schema_version,migration_count into v,c from public.commerce_schema_meta where component='commerce-core';
 if v<>'0.1.8' or c<>9 then raise exception 'BASELINE_EXPECTED_018_9 got %/%',v,c; end if;
end $$;
\i ${migration}
do $$ declare v text; c integer; bad integer; begin
 select schema_version,migration_count into v,c from public.commerce_schema_meta where component='commerce-core';
 if v<>'0.1.9' or c<>10 then raise exception 'FORWARD_VERSION_BAD %/%',v,c; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_prices' and column_name='amount' and data_type='numeric' and numeric_precision=19 and numeric_scale=4) then raise exception 'PRICE_AMOUNT_TYPE_BAD'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_goods_receipt_items' and column_name='unit_cost' and data_type='numeric' and numeric_precision=19 and numeric_scale=4) then raise exception 'RECEIVING_COST_TYPE_BAD'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_order_items' and column_name='price_net' and data_type='numeric' and numeric_precision=19 and numeric_scale=4) then raise exception 'ORDER_PRICE_TYPE_BAD'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('commerce_prices','commerce_goods_receipt_items','commerce_order_items') and column_name in ('amount_minor','unit_cost_minor','price_net_minor')) then raise exception 'OLD_MONEY_COLUMN_PRESENT'; end if;
 select count(*) into bad from information_schema.columns where table_schema='public' and (
  (table_name='commerce_external_inventory_snapshots' and column_name='quantity') or
  (table_name='commerce_goods_receipt_items' and column_name='quantity') or
  (table_name='commerce_inventory_balances' and column_name in ('physical_quantity','reserved_quantity','available_quantity','incoming_quantity')) or
  (table_name='commerce_inventory_reservations' and column_name in ('requested_quantity','released_quantity','consumed_quantity','remaining_quantity')) or
  (table_name='commerce_inventory_reservation_events' and column_name='quantity') or
  (table_name='commerce_order_items' and column_name='quantity') or
  (table_name='commerce_stock_movements' and column_name in ('physical_delta','reserved_delta','incoming_delta'))
 ) and not(data_type='numeric' and numeric_precision=19 and numeric_scale=6);
 if bad<>0 then raise exception 'QUANTITY_TYPE_BAD count=%',bad; end if;
 if to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamp with time zone)') is null then raise exception 'PRICE_RPC_MISSING'; end if;
 if has_function_privilege('authenticated',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamp with time zone)'),'EXECUTE') then raise exception 'PRICE_RPC_AUTH_EXPOSED'; end if;
 if not has_function_privilege('service_role',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamp with time zone)'),'EXECUTE') then raise exception 'PRICE_RPC_SERVICE_MISSING'; end if;
end $$;
\i ${rollback}
do $$ declare v text; c integer; begin
 select schema_version,migration_count into v,c from public.commerce_schema_meta where component='commerce-core';
 if v<>'0.1.8' or c<>9 then raise exception 'ROLLBACK_VERSION_BAD %/%',v,c; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_prices' and column_name='amount_minor' and data_type='bigint') then raise exception 'ROLLBACK_PRICE_BAD'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_goods_receipt_items' and column_name='unit_cost_minor' and data_type='bigint') then raise exception 'ROLLBACK_COST_BAD'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_order_items' and column_name='price_net_minor' and data_type='bigint') then raise exception 'ROLLBACK_ORDER_PRICE_BAD'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_inventory_balances' and column_name='available_quantity' and data_type='numeric' and numeric_precision=20 and numeric_scale=6) then raise exception 'ROLLBACK_AVAILABLE_BAD'; end if;
end $$;
rollback;
`;
const run=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script,maxBuffer:8*1024*1024});
if(run.status!==0){console.error(run.stdout||"");console.error(run.stderr||"");process.exit(run.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select schema_version||'|'||migration_count from public.commerce_schema_meta where component='commerce-core';"],{cwd:root,encoding:"utf8"});
if(probe.status!==0||probe.stdout.trim()!=="0.1.8|9"){console.error("FAIL transaction did not leave baseline clean",probe.stdout,probe.stderr);process.exit(2);}
for(const line of [
 "PASS 01 baseline 0.1.8 / 9 verified",
 "PASS 02 forward migration applies transactionally",
 "PASS 03 monetary columns are NUMERIC(19,4)",
 "PASS 04 legacy monetary column names disappear in forward state",
 "PASS 05 stock/order quantities are NUMERIC(19,6)",
 "PASS 06 generated available quantity is NUMERIC(19,6)",
 "PASS 07 generated remaining quantity is NUMERIC(19,6)",
 "PASS 08 canonical numeric price RPC exists",
 "PASS 09 authenticated price RPC execute is denied",
 "PASS 10 service-role price RPC execute is allowed",
 "PASS 11 rollback executes transactionally",
 "PASS 12 rollback restores monetary bigint columns",
 "PASS 13 rollback restores quantity baseline",
 "PASS 14 rollback restores schema 0.1.8 / 9",
 "PASS 15 outer transaction leaves DEV baseline unchanged",
]) console.log(line);
console.log("RESULT 15/15 PASS");
