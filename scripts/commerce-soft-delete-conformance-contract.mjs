import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const migration=readFileSync("supabase/migrations/20260819143000_dimpro_commerce_soft_delete_conformance_v011.sql","utf8");
const rollback=readFileSync("supabase/rollback/DIMPRO_COMMERCE_SOFT_DELETE_CONFORMANCE_V011_ROLLBACK.sql","utf8");
const lifecycle=readFileSync("app/lib/commerce/core/types.ts","utf8");
const appFiles=execFileSync("bash",["-lc","find app/lib/commerce app/api/v1/commerce components/aruter -type f \\( -name '*.ts' -o -name '*.tsx' \\) -print"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
const app=appFiles.map(file=>readFileSync(file,"utf8")).join("\n");
const tables=[
  "commerce_brands","commerce_categories","commerce_goods_receipt_items","commerce_goods_receipts",
  "commerce_inventory_balances","commerce_inventory_reservations","commerce_inventory_sources","commerce_manufacturers",
  "commerce_media_assets","commerce_media_links","commerce_media_overlays","commerce_media_variants",
  "commerce_order_items","commerce_order_mirror_attempts","commerce_orders","commerce_prices",
  "commerce_product_identifiers","commerce_product_variants","commerce_products","commerce_storefronts","commerce_warehouses",
];
const checks=[];
function check(name,condition){checks.push({name,condition:Boolean(condition)});console.log(`${condition?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);}

check("migration targets Commerce schema 0.1.11 / 12",migration.includes("schema_version='0.1.11'")&&migration.includes("migration_count=12"));
check("rollback returns to 0.1.10 / 11",rollback.includes("schema_version='0.1.10'")&&rollback.includes("migration_count=11"));
check("canonical column is timestamptz",migration.includes("add column if not exists deleted_at timestamptz null"));
check("all 21 soft-deletable Commerce tables are enumerated",tables.every(table=>migration.includes(`'${table}'`))&&tables.length===21);
check("compatibility trigger function exists",migration.includes("commerce_sync_soft_delete_columns"));
check("insert archived_at backfills deleted_at",migration.includes("new.deleted_at := new.archived_at"));
check("insert deleted_at backfills archived_at",migration.includes("new.archived_at := new.deleted_at"));
check("updates synchronize deleted_at to archived_at",migration.includes("new.archived_at := new.deleted_at"));
check("updates synchronize archived_at to deleted_at",migration.includes("new.deleted_at := new.archived_at"));
check("mismatched dual writes fail closed",migration.includes("COMMERCE_SOFT_DELETE_TIMESTAMP_MISMATCH"));
check("existing archived rows are backfilled",migration.includes("set deleted_at=archived_at where deleted_at is null and archived_at is not null"));
check("compatibility check constraint requires equality",migration.includes("check (deleted_at is not distinct from archived_at)"));
check("trigger covers inserts and updates",migration.includes("before insert or update of deleted_at, archived_at"));
check("rollback validates timestamp equality before dropping canonical column",rollback.includes("where deleted_at is distinct from archived_at")&&rollback.includes("COMMERCE_SOFT_DELETE_ROLLBACK_MISMATCH"));
check("rollback removes every compatibility trigger",rollback.includes("drop trigger if exists commerce_soft_delete_sync_trigger"));
check("rollback drops canonical column only after validation",rollback.indexOf("COMMERCE_SOFT_DELETE_ROLLBACK_MISMATCH")<rollback.indexOf("drop column if exists deleted_at"));
check("CommerceLifecycle exposes canonical deletedAt",lifecycle.includes("deletedAt?: CommerceUtcTimestamp | null"));
check("archivedAt remains explicitly deprecated compatibility alias",lifecycle.includes("@deprecated Compatibility alias during deleted_at migration"));
check("active Commerce application DB access no longer references archived_at",!app.includes("archived_at"));
check("active Commerce application uses deleted_at",app.includes("deleted_at"));
check("new archive mutations write deleted_at",app.includes("deleted_at:new Date().toISOString()")||app.includes("deleted_at: new Date().toISOString()"));
check("old archive mutations no longer write archived_at",!app.includes("archived_at:new Date().toISOString()")&&!app.includes("archived_at: new Date().toISOString()"));
check("order mapping publishes canonical deletedAt",readFileSync("app/lib/commerce/order/repository.ts","utf8").includes("deletedAt:nullableText(row.deleted_at)"));
check("receiving mapping publishes canonical deletedAt",readFileSync("app/lib/commerce/receiving/repository.ts","utf8").includes("deletedAt:nullableText(row.deleted_at)"));
check("reservation mapping publishes canonical deletedAt",readFileSync("app/lib/commerce/inventory/repository.ts","utf8").includes("deletedAt:nullableText(row.deleted_at)"));

const failed=checks.filter(item=>!item.condition);
console.log(`RESULT ${checks.length-failed.length}/${checks.length} PASS`);
assert.equal(failed.length,0,failed.map(item=>item.name).join(", "));
