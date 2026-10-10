import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Deliberately not an executor: this script only checks and fingerprints the
// exact approved migration order, without accessing DB credentials or services.
const driveFiles = [
  "supabase/migrations/20261010_drive_document_follow_v010.sql",
  "supabase/migrations/20261010_drive_review_decision_events_v010.sql",
  "supabase/migrations/20261010_drive_notification_preferences_v010.sql",
  "supabase/migrations/20261010_drive_digest_delivery_gate_v011.sql",
  "supabase/migrations/20261010_drive_notification_consent_v012.sql",
  "supabase/migrations/20261010_drive_digest_cursor_producer_v013.sql",
  "supabase/migrations/20261010_drive_notification_hu_calendar_v014.sql",
];
const authFile = "db/auth/migrations/012_auth_v049_profile_photo.sql";
const migration = (file) => readFileSync(file, "utf8");
const sql=driveFiles.map(migration);
assert.equal(driveFiles.length, 7);
assert.match(sql[2],/CREATE TABLE IF NOT EXISTS public\.drive_core_digest_deliveries/);
assert.match(sql[3],/ALTER TABLE public\.drive_core_digest_deliveries/);
assert.match(sql[4],/CREATE OR REPLACE FUNCTION public\.drive_set_digest_preference/);
assert.match(sql[5],/CREATE OR REPLACE FUNCTION public\.drive_digest_register_journal_page/);
assert.match(sql[6],/CREATE TABLE IF NOT EXISTS public\.drive_notification_hu_calendar/);
assert.match(sql[2],/UNIQUE\(project_id,user_id,category,scheduled_slot,cursor_from\)/);
assert.match(sql[5],/ON CONFLICT\(project_id,user_id,category,scheduled_slot,cursor_from\)/);
for(const [index,text] of sql.entries()){
  assert.match(text,/^BEGIN;/im,`migration ${index} has BEGIN`);
  assert.match(text,/COMMIT;\s*$/i,`migration ${index} has COMMIT`);
  assert.doesNotMatch(text,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM public\.drive_core_documents)\b/i,`migration ${index} no destructive table mutation`);
}
const auth=migration(authFile);
assert.match(auth,/CREATE TABLE IF NOT EXISTS public\.auth_profile_photos/);
assert.match(auth,/dimpro_auth_migrator_/);
assert.doesNotMatch(sql.join("\n"),/CREATE TABLE IF NOT EXISTS public\.auth_profile_photos/);
for(const file of [...driveFiles,authFile]){
  const hash=createHash("sha256").update(migration(file)).digest("hex");
  console.log(`${file}: ${hash.slice(0,16)}`);
}
console.log("DRIVE NOTIFICATION MIGRATION DEPENDENCY CONTRACT PASS (static only)");
