import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const service = read("app/lib/field-capture/serverService.ts");
const repo = read("app/lib/field-capture/serverRepository.ts");
const sessionRoute = read("app/api/field-capture/sessions/route.ts");
const itemRoute = read("app/api/field-capture/sessions/[sessionId]/items/route.ts");
const healthRoute = read("app/api/field-capture/health/route.ts");
const migration = read("supabase/migrations/20260818074500_field_capture_p7_server_session_v010.sql");

const tests = [
  ["bearer-only Send session auth", () => {
    assert.match(service, /readBearerToken\(request\.headers\)/);
    assert.match(service, /verifyDimproSendSession\(token\)/);
    assert.match(service, /getDimproSendContextByEntitlementId\(claims\.entitlementId\)/);
    assert.doesNotMatch(sessionRoute + itemRoute, /sendSessionToken\s*:/);
  }],
  ["Send entitlement gate", () => {
    assert.match(service, /canUseStandardSend/);
    assert.match(service, /canUseQuickImageSend/);
  }],
  ["official Project Core identity bridge", () => {
    assert.match(repo, /\.from\("project_core_projects"\)/);
    assert.match(repo, /\.eq\("dimpro_project_id", dimproProjectId\)/);
    assert.match(service, /context\.projects\.find/);
    assert.match(service, /project\.canUploadToDrop/);
  }],
  ["service-role server repository", () => {
    assert.match(repo, /getDimproIdentitySupabaseClient/);
    assert.doesNotMatch(repo, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }],
  ["idempotent session/item/asset/sync writes", () => {
    assert.match(repo, /onConflict: "user_id,client_session_id"/);
    assert.match(repo, /onConflict: "session_id,client_item_id"/);
    assert.match(repo, /onConflict: "capture_item_id,variant"/);
    assert.match(repo, /onConflict: "session_id,device_local_id,operation"/);
    assert.match(migration, /unique\(capture_item_id, variant\)/);
  }],
  ["structured GPS/orientation/voice records", () => {
    assert.match(repo, /field_capture_locations/);
    assert.match(repo, /field_capture_orientations/);
    assert.match(repo, /field_capture_voice_notes/);
    assert.match(service, /LOCATION_STATUSES/);
    assert.match(service, /ORIENTATION_STATUSES/);
    assert.match(service, /VOICE_STATUSES/);
  }],
  ["server destination state only", () => {
    assert.match(repo, /field_capture_destinations/);
    assert.match(service, /CAPTURE/);
    assert.match(service, /USER_DRIVE/);
    assert.match(service, /PROJECT_DRIVE/);
    assert.doesNotMatch(repo, /navigator\.share/);
  }],
  ["audit failures are not swallowed", () => {
    assert.match(repo, /auditnaplózása sikertelen/);
    assert.match(repo, /existingEvent\.error/);
    assert.match(repo, /eventResult\.error/);
  }],
  ["no raw Send PIN/capability token persistence", () => {
    const persistenceSurface = repo + migration;
    assert.doesNotMatch(persistenceSurface, /send_session_token/i);
    assert.doesNotMatch(persistenceSurface, /\bpin_(?:code|token|hash)\b/i);
    assert.doesNotMatch(persistenceSurface, /capability_token/i);
  }],
  ["dynamic server schema health", () => {
    assert.match(healthRoute, /getFieldCaptureServerSchemaReadiness/);
    assert.match(healthRoute, /serverCaptureSchema: schema\.ready/);
    assert.match(repo, /field_capture_schema_meta/);
  }],
  ["session owner checked before item write", () => {
    assert.match(itemRoute, /assertFieldCaptureSessionOwner/);
    assert.match(repo, /\.eq\("user_id", input\.userId\)/);
    assert.match(repo, /\.eq\("entitlement_id", input\.entitlementId\)/);
  }],
  ["JSON metadata body remains bounded", () => {
    assert.match(sessionRoute, /readDimproIdentityJsonBody/);
    assert.match(itemRoute, /readDimproIdentityJsonBody/);
  }],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${passed}: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}
console.log(`FIELD_CAPTURE_P7_SERVER_CONTRACT ${passed}/${tests.length} PASS`);
