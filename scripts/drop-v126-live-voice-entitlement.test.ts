import assert from "node:assert/strict";
import { getDimproIdentitySupabaseClient, getDimproSendContextByEntitlementId } from "../app/lib/identity-core/repository";

async function main() {
  const licenseId = "38bf20c6-8f3b-4bf4-a672-4935c96292b2";
  const entitlementId = "badb15eb-dd87-4602-80ae-5c8f1dac066f";
  const client = getDimproIdentitySupabaseClient();
  const modules = await client.from("dimpro_license_modules")
    .select("module_code,enabled,limits,valid_until")
    .eq("license_id", licenseId)
    .eq("module_code", "DROP_QUICK_VOICE_NOTE")
    .maybeSingle();
  if (modules.error) throw modules.error;
  assert.ok(modules.data, "DROP_QUICK_VOICE_NOTE module missing");
  assert.equal(modules.data.enabled, true);
  assert.equal(Number((modules.data.limits as Record<string, unknown> | null)?.maxSecondsPerNote), 60);
  const context = await getDimproSendContextByEntitlementId(entitlementId);
  assert.equal(context.entitlement.canUseQuickVoiceNote, true);
  assert.equal(context.entitlement.maxQuickVoiceSecondsPerNote, 60);
  console.log(JSON.stringify({ ok: true, checks: 5, module: modules.data.module_code, seconds: context.entitlement.maxQuickVoiceSecondsPerNote }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
