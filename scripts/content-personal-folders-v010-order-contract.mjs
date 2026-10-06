import assert from "node:assert/strict";import fs from "node:fs";
const order=fs.readFileSync("supabase/DIMPRO_MIGRATION_ORDER_V1.txt","utf8").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const base="supabase/migrations/20260818183500_dimpro_content_core_user_drive_v010.sql";
const addon="supabase/migrations/20261006123000_dimpro_content_personal_folders_v010.sql";
assert.ok(order.includes(base),'Content Core V0.1 migration missing from order');
assert.ok(order.includes(addon),'Personal folder migration missing from order');
assert.ok(order.indexOf(base)<order.indexOf(addon),'Personal folder migration must follow Content Core V0.1');
assert.equal(order.filter(v=>v===addon).length,1,'Personal folder migration must appear once');
console.log(JSON.stringify({ok:true,contract:'Content Personal Folders migration order',baseIndex:order.indexOf(base),addonIndex:order.indexOf(addon),knownGlobalOrderDebt:true},null,2));
