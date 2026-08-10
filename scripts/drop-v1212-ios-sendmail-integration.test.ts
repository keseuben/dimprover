import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createDimproLicenseAdmin,
  createDimproSendEntitlementAdmin,
  createDimproSendUserAdmin,
  getDimproSendCodeDeliveryContextAdmin,
  rotateDimproSendEntitlementCodeAdmin,
} from "../app/lib/identity-core/admin";
import { hashDimproSendCode } from "../app/lib/identity-core/security";
import { sendDimproSendCodeEmail } from "../app/lib/identity-core/send-code-email";

function required(name: string) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function group(length: number) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
const client = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixture = { userId: "", licenseId: "", entitlementId: "" };
const checks: string[] = [];
function pass(name: string, condition: unknown, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
}

async function main() {
  try {
    const email = `drop-v1212-${Date.now()}@example.invalid`;
    const createdUser = await createDimproSendUserAdmin({
      fullName: "DROP 1.2.12 Send Mail Test",
      email,
      phone: "",
      organizationName: "",
      emailVerified: true,
    });
    fixture.userId = String(createdUser.user?.id || "");
    pass("fixture-user-created", Boolean(fixture.userId));

    const yy = String(new Date().getFullYear()).slice(-2);
    const license = await createDimproLicenseAdmin({
      publicLicenseCode: `LIC-${yy}-${group(4)}-${group(4)}`,
      ownerType: "user",
      ownerUserId: fixture.userId,
      productCode: "DIMPRO_DROP",
      planCode: "SEND_V1212_TEST",
      status: "active",
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      maxDevices: 1,
      modules: [
        { moduleCode: "DROP_SEND", enabled: true },
        { moduleCode: "DROP_QUICK_IMAGE_SEND", enabled: true },
      ],
    });
    fixture.licenseId = String(license.id || "");
    pass("fixture-license-created", fixture.licenseId.length > 20);

    const digits = String(Date.now() % 1_000_000).padStart(6, "0");
    const oldCode = `TSTX-${digits.slice(0, 3)}-${digits.slice(3)}`;
    const entitlement = await createDimproSendEntitlementAdmin({
      sendCode: oldCode,
      userId: fixture.userId,
      licenseId: fixture.licenseId,
      recipientMode: "free_entry",
      recipients: [],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      maxRecipients: 6,
      maxSavedContacts: 10,
      maxPackageSizeBytes: 20 * 1024 * 1024,
      canUseStandardSend: true,
      canUseQuickImageSend: true,
      canUseImageGroups: true,
      canUseFileComments: true,
      canUseProjectDrop: false,
    });
    fixture.entitlementId = String(entitlement.entitlementId || "");
    pass("entitlement-created", fixture.entitlementId.length > 20);
    pass("raw-code-returned-once", entitlement.rawCode === oldCode);

    const context = await getDimproSendCodeDeliveryContextAdmin(fixture.entitlementId);
    pass("delivery-context-email", context.recipientEmail === email, context.recipientEmail);
    pass("delivery-context-entitlement", context.entitlementId === fixture.entitlementId);

    let captured: Record<string, unknown> | null = null;
    const mail = await sendDimproSendCodeEmail({
      recipientName: context.recipientName,
      recipientEmail: context.recipientEmail,
      organizationName: context.organizationName,
      sendCode: oldCode,
      expiresAt: context.expiresAt,
      canUseStandardSend: context.canUseStandardSend,
      canUseQuickImageSend: context.canUseQuickImageSend,
      canUseProjectDrop: context.canUseProjectDrop,
    }, {
      sendMail: async (input) => {
        captured = input as unknown as Record<string, unknown>;
        return { messageId: "mock-v1212", profileId: "noreply", from: "noreply@dimpro.hu" };
      },
    });
    pass("send-code-mail-mock-sent", mail.messageId === "mock-v1212");
    const capturedMail = captured as unknown as Record<string, unknown>;
    pass("send-code-mail-recipient", Array.isArray(capturedMail.to) && capturedMail.to[0] === email);
    pass("send-code-mail-subject", String(capturedMail.subject || "").includes("Saját DIMPRO Send-kód"));
    pass("send-code-mail-contains-code", String(capturedMail.text || "").includes(oldCode));
    pass("send-code-mail-link", String(capturedMail.text || "").includes("https://drop.dimpro.hu/send"));

    const rotated = await rotateDimproSendEntitlementCodeAdmin({ entitlementId: fixture.entitlementId });
    pass("code-rotated", rotated.rawCode !== oldCode && /^[A-Z]{4}-\d{3}-\d{3}$/.test(rotated.rawCode), rotated.rawCode);
    const stored = await client.from("dimpro_send_entitlements").select("code_hash,code_hint").eq("id", fixture.entitlementId).single();
    if (stored.error) throw stored.error;
    pass("new-code-hash-stored", stored.data.code_hash === hashDimproSendCode(rotated.rawCode));
    pass("old-code-invalidated", stored.data.code_hash !== hashDimproSendCode(oldCode));
    pass("raw-new-code-not-stored", JSON.stringify(stored.data).includes(rotated.rawCode) === false);

    const audits = await client.from("dimpro_access_audit_logs").select("event_type,success").eq("entitlement_id", fixture.entitlementId);
    if (audits.error) throw audits.error;
    pass("rotation-audited", (audits.data || []).some((row) => row.event_type === "send_entitlement_code_rotated" && row.success === true));

    console.log(JSON.stringify({ ok: true, version: "DROP 1.2.12 / IDENTITY 0.2.2", checks: checks.length, names: checks }, null, 2));
  } finally {
    if (fixture.entitlementId) { try { await client.from("dimpro_access_audit_logs").delete().eq("entitlement_id", fixture.entitlementId); } catch {} }
    if (fixture.licenseId) { try { await client.from("dimpro_access_audit_logs").delete().eq("license_id", fixture.licenseId); } catch {} }
    if (fixture.entitlementId) { try { await client.from("dimpro_send_entitlements").delete().eq("id", fixture.entitlementId); } catch {} }
    if (fixture.licenseId) { try { await client.from("dimpro_licenses").delete().eq("id", fixture.licenseId); } catch {} }
    if (fixture.userId) { try { await client.from("dimpro_access_audit_logs").delete().eq("user_id", fixture.userId); } catch {} }
    if (fixture.userId) { try { await client.from("dimpro_users").delete().eq("id", fixture.userId); } catch {} }
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
