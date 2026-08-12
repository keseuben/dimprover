import { getDimproIdentitySupabaseClient } from "./repository";
import {
  resolveCentralHageAiPolicy,
  type CentralHageAiPolicyDecision,
  type CentralHageAiPolicyRequest,
  type CentralIdentityUserSnapshot,
  type CentralLicenseSnapshot,
  type CentralMembershipSnapshot,
} from "./hage-ai-policy-pure";

type Row = Record<string, unknown>;

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { const valueText = text(value).trim(); return valueText || null; }
function objectValue(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function bool(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function userSnapshot(row: Row): CentralIdentityUserSnapshot {
  return { id: text(row.id), publicUserCode: nullableText(row.public_user_code), fullName: text(row.full_name), email: nullableText(row.email), status: text(row.status) };
}

export type HageAiIdentityPolicyMode = "off" | "prefer" | "strict";
export function getHageAiIdentityPolicyMode(): HageAiIdentityPolicyMode {
  const value = String(process.env.DIMPRO_HAGE_AI_IDENTITY_POLICY_MODE || "off").trim().toLowerCase();
  return value === "prefer" || value === "strict" ? value : "off";
}

export async function readCentralHageAiPolicyDecision(legacyLicenseId: string, request: CentralHageAiPolicyRequest): Promise<CentralHageAiPolicyDecision> {
  const client = getDimproIdentitySupabaseClient();
  const licenseResult = await client.from("dimpro_licenses")
    .select("id,status,owner_type,owner_user_id,owner_organization_id,activated_at,expires_at")
    .eq("legacy_license_ref", legacyLicenseId)
    .limit(2);
  if (licenseResult.error) throw new Error(`Identity license read failed: ${licenseResult.error.code || "database"}`);
  const licenseRows = (licenseResult.data || []) as Row[];
  if (licenseRows.length === 0) return resolveCentralHageAiPolicy(null, request);
  if (licenseRows.length !== 1) return { mode: "deny", reason: "central_license_mapping_ambiguous", errorCode: "AI_IDENTITY_LICENSE_AMBIGUOUS", message: "A központi licenckapcsolat nem egyértelmű." };
  const license = licenseRows[0];
  const centralLicenseId = text(license.id);

  const aiResult = await client.from("dimpro_license_modules")
    .select("enabled,limits,feature_flags,valid_from,valid_until")
    .eq("license_id", centralLicenseId)
    .eq("module_code", "AI_ASSISTANT")
    .limit(2);
  if (aiResult.error) throw new Error(`Identity license AI module read failed: ${aiResult.error.code || "database"}`);
  const aiRows = (aiResult.data || []) as Row[];
  const aiRow = aiRows.length === 1 ? aiRows[0] : null;
  const snapshot: CentralLicenseSnapshot = {
    id: centralLicenseId,
    status: text(license.status),
    ownerType: text(license.owner_type) === "user" ? "user" : "organization",
    ownerUserId: nullableText(license.owner_user_id),
    activatedAt: nullableText(license.activated_at),
    expiresAt: nullableText(license.expires_at),
    aiModule: aiRow ? { enabled: bool(aiRow.enabled), limits: objectValue(aiRow.limits), featureFlags: objectValue(aiRow.feature_flags), validFrom: nullableText(aiRow.valid_from), validUntil: nullableText(aiRow.valid_until) } : null,
  };

  if (snapshot.ownerType === "user") {
    if (snapshot.ownerUserId) {
      const userResult = await client.from("dimpro_users").select("id,public_user_code,full_name,email,status").eq("id", snapshot.ownerUserId).maybeSingle();
      if (userResult.error) throw new Error(`Identity owner user read failed: ${userResult.error.code || "database"}`);
      snapshot.ownerUser = userResult.data ? userSnapshot(userResult.data as Row) : null;
    }
    return resolveCentralHageAiPolicy(snapshot, request);
  }

  const organizationId = text(license.owner_organization_id);
  if (!organizationId) return { mode: "deny", reason: "central_organization_missing", errorCode: "AI_IDENTITY_ORGANIZATION_MISSING", message: "A központi szervezeti licenc tulajdonosa hiányzik." };
  const membershipResult = await client.from("dimpro_organization_memberships")
    .select("id,user_id,status,access_ends_at")
    .eq("organization_id", organizationId)
    .limit(1000);
  if (membershipResult.error) throw new Error(`Identity memberships read failed: ${membershipResult.error.code || "database"}`);
  const membershipRows = (membershipResult.data || []) as Row[];
  const userIds = [...new Set(membershipRows.map((row) => text(row.user_id)).filter(Boolean))];
  const userRows: Row[] = [];
  if (userIds.length) {
    const usersResult = await client.from("dimpro_users").select("id,public_user_code,full_name,email,status").in("id", userIds);
    if (usersResult.error) throw new Error(`Identity users read failed: ${usersResult.error.code || "database"}`);
    userRows.push(...((usersResult.data || []) as Row[]));
  }
  const memberAiRows: Row[] = [];
  const membershipIds = membershipRows.map((row) => text(row.id)).filter(Boolean);
  if (membershipIds.length) {
    const modulesResult = await client.from("dimpro_membership_modules")
      .select("membership_id,enabled,limits")
      .in("membership_id", membershipIds)
      .eq("module_code", "AI_ASSISTANT");
    if (modulesResult.error) throw new Error(`Identity member AI modules read failed: ${modulesResult.error.code || "database"}`);
    memberAiRows.push(...((modulesResult.data || []) as Row[]));
  }
  const usersById = new Map(userRows.map((row) => [text(row.id), userSnapshot(row)]));
  const aiByMembership = new Map(memberAiRows.map((row) => [text(row.membership_id), { enabled: bool(row.enabled), limits: objectValue(row.limits) }]));
  snapshot.memberships = membershipRows.flatMap((row): CentralMembershipSnapshot[] => {
    const user = usersById.get(text(row.user_id));
    if (!user) return [];
    const id = text(row.id);
    return [{ id, userId: text(row.user_id), status: text(row.status), accessEndsAt: nullableText(row.access_ends_at), user, aiModule: aiByMembership.get(id) || null }];
  });
  return resolveCentralHageAiPolicy(snapshot, request);
}
