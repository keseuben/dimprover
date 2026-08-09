import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createDimproLicenseAdmin, createDimproSendEntitlementAdmin } from "../app/lib/identity-core/admin";

function required(name: string) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomGroup(length: number) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const yy = String(new Date().getFullYear()).slice(-2);
const manualLicenseCode = `LIC-${yy}-${randomGroup(4)}-${randomGroup(4)}`;
const sendDigits = String(Date.now() % 1_000_000).padStart(6, "0");
const manualSendCode = `TSTX-${sendDigits.slice(0, 3)}-${sendDigits.slice(3)}`;
const fixture = { userId: "", licenseId: "", entitlementId: "" };
const checks: string[] = [];
function pass(name: string, condition: unknown, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
}

async function main() {
try {
  const userCode = await client.rpc("dimpro_generate_user_code");
  if (userCode.error) throw userCode.error;
  const email = `v122-license-${Date.now()}@example.invalid`;
  const user = await client.from("dimpro_users").insert({
    public_user_code: String(userCode.data),
    full_name: "DROP 1.2.2 Licenc E2E",
    email,
    email_normalized: email,
    email_verified_at: new Date().toISOString(),
    status: "active",
  }).select("id").single();
  if (user.error) throw user.error;
  fixture.userId = user.data.id;
  pass("fixture-user-created", Boolean(fixture.userId));

  let invalidRejected = false;
  try {
    await createDimproLicenseAdmin({
      publicLicenseCode: "LIC-26-BAD0-CODE",
      ownerType: "user",
      ownerUserId: fixture.userId,
      productCode: "DIMPRO_DROP",
      planCode: "SEND_TEST",
      status: "active",
    });
  } catch {
    invalidRejected = true;
  }
  pass("invalid-manual-license-code-rejected", invalidRejected);

  const license = await createDimproLicenseAdmin({
    publicLicenseCode: manualLicenseCode,
    ownerType: "user",
    ownerUserId: fixture.userId,
    productCode: "DIMPRO_DROP",
    planCode: "SEND_TEST",
    status: "active",
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    maxDevices: 1,
    modules: [
      { moduleCode: "DROP_SEND", enabled: true },
      { moduleCode: "DROP_QUICK_IMAGE_SEND", enabled: true },
    ],
  });
  fixture.licenseId = String(license.id || "");
  pass("manual-license-created", fixture.licenseId.length > 20);
  pass("manual-license-code-preserved", license.public_license_code === manualLicenseCode, String(license.public_license_code));

  let duplicateRejected = false;
  try {
    await createDimproLicenseAdmin({
      publicLicenseCode: manualLicenseCode,
      ownerType: "user",
      ownerUserId: fixture.userId,
      productCode: "DIMPRO_DROP",
      planCode: "SEND_TEST",
      status: "active",
    });
  } catch {
    duplicateRejected = true;
  }
  pass("duplicate-manual-license-code-rejected", duplicateRejected);

  const modules = await client.from("dimpro_license_modules").select("module_code,enabled").eq("license_id", fixture.licenseId);
  if (modules.error) throw modules.error;
  const moduleCodes = new Set((modules.data || []).filter((row) => row.enabled).map((row) => row.module_code));
  pass("license-modules-created", moduleCodes.has("DROP_SEND") && moduleCodes.has("DROP_QUICK_IMAGE_SEND"));

  const entitlement = await createDimproSendEntitlementAdmin({
    sendCode: manualSendCode,
    userId: fixture.userId,
    licenseId: fixture.licenseId,
    recipientMode: "locked_default",
    recipients: [{
      name: "DIMPRO Teszt Címzett",
      email: "admin@dimpro.hu",
      organizationName: "DIMPRO",
      label: "DROP 1.2.2 E2E",
      isDefault: true,
      locked: true,
    }],
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    maxRecipients: 3,
    maxPackageSizeBytes: 5 * 1024 * 1024,
    monthlySendLimit: 5,
    canUseStandardSend: true,
    canUseQuickImageSend: true,
    canUseImageGroups: true,
    canUseFileComments: true,
    canUseProjectDrop: false,
  });
  fixture.entitlementId = String(entitlement.result?.entitlementId || "");
  pass("manual-send-entitlement-created", fixture.entitlementId.length > 20);
  pass("manual-send-code-preserved", entitlement.rawCode === manualSendCode, entitlement.rawCode);

  const stored = await client.from("dimpro_send_entitlements").select("id,code_hint,license_id,user_id,status").eq("id", fixture.entitlementId).single();
  if (stored.error) throw stored.error;
  pass("entitlement-bound-to-manual-license", stored.data.license_id === fixture.licenseId && stored.data.user_id === fixture.userId);
  pass("entitlement-active", stored.data.status === "active");
  pass("raw-send-code-not-stored", JSON.stringify(stored.data).includes(manualSendCode) === false);

  const audit = await client.from("dimpro_access_audit_logs").select("event_type,success").eq("license_id", fixture.licenseId);
  if (audit.error) throw audit.error;
  const events = new Set((audit.data || []).filter((row) => row.success).map((row) => row.event_type));
  pass("license-create-audited", events.has("license_created"));
  pass("send-create-audited", events.has("send_entitlement_created"));

  console.log(JSON.stringify({ ok: true, version: "DROP 1.2.2", checks: checks.length, names: checks, manualLicenseCode, manualSendCode }, null, 2));
} finally {
  if (fixture.entitlementId) { try { await client.from("dimpro_access_audit_logs").delete().eq("entitlement_id", fixture.entitlementId); } catch {} }
  if (fixture.licenseId) { try { await client.from("dimpro_access_audit_logs").delete().eq("license_id", fixture.licenseId); } catch {} }
  if (fixture.entitlementId) { try { await client.from("dimpro_send_entitlements").delete().eq("id", fixture.entitlementId); } catch {} }
  if (fixture.licenseId) { try { await client.from("dimpro_licenses").delete().eq("id", fixture.licenseId); } catch {} }
  if (fixture.userId) { try { await client.from("dimpro_users").delete().eq("id", fixture.userId); } catch {} }
}

}

main().catch((error) => { console.error(error); process.exit(1); });
