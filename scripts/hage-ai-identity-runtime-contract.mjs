import fs from "node:fs";

const gateway = fs.readFileSync("app/lib/license/hage-ai-gateway.ts", "utf8");
const adapter = fs.readFileSync("app/lib/identity-core/hage-ai-policy.ts", "utf8");
const admin = fs.readFileSync("app/lib/identity-core/admin.ts", "utf8");
const checks = [];
function check(name, ok, detail = "") { checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`); if (!ok) throw new Error(name); }
function has(source, value) { return source.includes(value); }

const authorizeIndex = gateway.indexOf("async function authorize");
const tokenIndex = gateway.indexOf("verifyLicenseToken", authorizeIndex);
const deviceIndex = gateway.indexOf('DEVICE_NOT_ALLOWED', authorizeIndex);
const centralIndex = gateway.indexOf("readCentralHageAiPolicyDecision", authorizeIndex);
check("legacy aláírt licenctoken ellenőrzés megmaradt", tokenIndex >= 0);
check("legacy gépkötés ellenőrzés megmaradt", deviceIndex >= 0);
check("központi policy csak token és gépkötés után fut", centralIndex > deviceIndex && deviceIndex > tokenIndex, JSON.stringify({ tokenIndex, deviceIndex, centralIndex }));
check("Identity policy mód alapból kikapcsolt", has(adapter, 'DIMPRO_HAGE_AI_IDENTITY_POLICY_MODE || "off"'));
check("prefer és strict migrációs mód támogatott", has(adapter, 'value === "prefer" || value === "strict"'));
check("központi mapping legacy rekord ID alapján történik", has(adapter, '.eq("legacy_license_ref", legacyLicenseId)'));
check("prefer módban legacy safety ceiling alkalmazódik", has(gateway, "applyLegacySafetyCeiling") && has(gateway, "restrictivePositive(decision.policy.organizationMonthlyBudgetHuf"));
check("prefer mód nem ad új AI-user jogot legacy jogosultság nélkül", has(gateway, 'central_policy_requires_legacy_user_during_migration'));
check("usage user azonosító folytonosság megmarad", has(gateway, "const usageAiUserId = legacyAiUser?.id || aiUser.id"));
check("hatékony egy-kérés költséglimit használódik", (gateway.match(/auth\.maxSingleRequestHuf/g) || []).length >= 3);
check("policy forrás státuszban és usage-ban auditálható", has(gateway, "policySource: auth.policySource") && has(gateway, 'policySource?: "central_identity" | "legacy_license_store"'));
check("strict Identity hiba fail-closed 503", has(gateway, 'AI_IDENTITY_POLICY_UNAVAILABLE') && has(gateway, 'identityPolicyMode === "strict"'));
check("strict mód fallback policy esetén is fail-closed", has(gateway, 'AI_IDENTITY_POLICY_REQUIRED') && has(gateway, 'decision.mode === "fallback" && identityPolicyMode === "strict"'));
check("licencszintű napi és havi request limit runtime-ban érvényesül", has(gateway, 'AI_LICENSE_DAILY_LIMIT') && has(gateway, 'AI_LICENSE_MONTHLY_LIMIT'));
check("központi havi tokenkeret runtime-ban érvényesül", has(gateway, 'AI_LICENSE_TOKEN_BUDGET') && has(gateway, 'organizationMonthlyTokenBudget'));
check("tokenkeret becsült kérés előtt is véd", (gateway.match(/organizationMonthTokens \+ estimate\.inputTokens \+ estimate\.outputTokens/g) || []).length === 2);
check("névre szóló policy explicit policyVersion markerrel készül", has(admin, 'policyVersion: 1') && has(admin, 'managedBy: "identity-license-center"'));
console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
