import assert from 'node:assert/strict';import fs from 'node:fs';
const lines=fs.readFileSync('supabase/DIMPRO_MIGRATION_ORDER_V1.txt','utf8').split(/\r?\n/).filter(Boolean);
const base='supabase/migrations/20260818183500_dimpro_content_core_user_drive_v010.sql';
const folders='supabase/migrations/20261006123000_dimpro_content_personal_folders_v010.sql';
const boxes='supabase/migrations/20261006183000_dimpro_personal_drive_boxes_v010.sql';
assert.equal(lines.filter(x=>x===boxes).length,1);assert.ok(lines.indexOf(boxes)>lines.indexOf(base));assert.ok(lines.indexOf(boxes)>lines.indexOf(folders));
console.log('DIMPRO Personal Drive CsomagBOX migration order contract PASS · 3/3');
