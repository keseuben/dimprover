import type { HageAiFeatureId, LicenseAiUserAccess } from "@/app/lib/license/types";

type CentralHageAiScope = "personal" | "hage";

export type CentralAiModuleSnapshot = {
  enabled: boolean;
  limits: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type CentralIdentityUserSnapshot = {
  id: string;
  publicUserCode?: string | null;
  fullName: string;
  email?: string | null;
  status: string;
};

export type CentralMembershipSnapshot = {
  id: string;
  userId: string;
  status: string;
  accessEndsAt?: string | null;
  user: CentralIdentityUserSnapshot;
  aiModule?: { enabled: boolean; limits: Record<string, unknown> } | null;
};

export type CentralLicenseSnapshot = {
  id: string;
  status: string;
  ownerType: "user" | "organization";
  ownerUserId?: string | null;
  activatedAt?: string | null;
  expiresAt?: string | null;
  aiModule?: CentralAiModuleSnapshot | null;
  ownerUser?: CentralIdentityUserSnapshot | null;
  memberships?: CentralMembershipSnapshot[];
};

export type CentralHageAiPolicyRequest = {
  userId?: string;
  userName: string;
  scope: CentralHageAiScope;
  action?: HageAiFeatureId;
  requireAction: boolean;
  nowIso?: string;
};

export type CentralHageAiEffectivePolicy = {
  centralLicenseId: string;
  centralUserId: string;
  centralMembershipId?: string;
  aiUser: LicenseAiUserAccess;
  organizationMonthlyBudgetHuf: number;
  organizationMonthlyTokenBudget: number;
  organizationMaxRequestsPerDay: number;
  organizationMaxRequestsPerMonth: number;
  maxSingleRequestHuf: number;
};

export type CentralHageAiPolicyDecision =
  | { mode: "fallback"; reason: string }
  | { mode: "deny"; reason: string; errorCode: string; message: string }
  | { mode: "allow"; reason: string; policy: CentralHageAiEffectivePolicy };

const FEATURES: HageAiFeatureId[] = ["daily_plan", "next_step", "task_breakdown", "waiting_email", "meeting_agenda", "weekly_summary", "decision_support", "document_extract"];
const SCOPES: CentralHageAiScope[] = ["personal", "hage"];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@._-]+/g, "-").replace(/^-+|-+$/g, "");
}
function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function arr<T extends string>(value: unknown, allowed: readonly T[]) {
  if (!Array.isArray(value)) return [];
  const allow = new Set<string>(allowed);
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter((item): item is T => allow.has(item)))] as T[];
}
function activeDate(start: string | null | undefined, end: string | null | undefined, now: Date) {
  if (start) { const d = new Date(start); if (Number.isNaN(d.getTime()) || d > now) return false; }
  if (end) { const d = new Date(end); if (Number.isNaN(d.getTime()) || d <= now) return false; }
  return true;
}
function expiryState(value: string | null | undefined, now: Date) {
  if (!value) return "active" as const;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid" as const;
  return date <= now ? "expired" as const : "active" as const;
}
function userMatches(user: CentralIdentityUserSnapshot, request: CentralHageAiPolicyRequest) {
  const requestedId = normalize(request.userId);
  const requestedName = normalize(request.userName);
  const strong = [user.id, user.publicUserCode, user.email].map(normalize).filter(Boolean);
  if (requestedId && strong.includes(requestedId)) return true;
  return Boolean(requestedName && normalize(user.fullName) === requestedName);
}
function deny(reason: string, errorCode: string, message: string): CentralHageAiPolicyDecision {
  return { mode: "deny", reason, errorCode, message };
}

export function resolveCentralHageAiPolicy(snapshot: CentralLicenseSnapshot | null, request: CentralHageAiPolicyRequest): CentralHageAiPolicyDecision {
  if (!snapshot) return { mode: "fallback", reason: "central_license_not_mapped" };
  const now = new Date(request.nowIso || Date.now());
  if (!Number.isFinite(now.getTime())) return deny("invalid_clock", "AI_IDENTITY_POLICY_INVALID_CLOCK", "A központi AI-policy időellenőrzése sikertelen.");
  if (!(["active", "trial"].includes(snapshot.status)) || !activeDate(snapshot.activatedAt, snapshot.expiresAt, now)) {
    return deny("central_license_inactive", "AI_IDENTITY_LICENSE_INACTIVE", "A központi DIMPRO licenc nem aktív.");
  }
  const licenseAi = snapshot.aiModule;
  if (!licenseAi || !licenseAi.enabled || !activeDate(licenseAi.validFrom, licenseAi.validUntil, now)) {
    return deny("central_license_ai_disabled", "AI_IDENTITY_MODULE_DISABLED", "A központi licencen az AI_ASSISTANT modul nem használható.");
  }
  const licenseFeatures = FEATURES.filter((feature) => licenseAi.featureFlags?.[feature] !== false);
  const organizationBudget = num(licenseAi.limits?.monthlyBudgetHuf);
  const organizationMonthlyTokenBudget = num(licenseAi.limits?.monthlyTokenBudget);
  const organizationMaxRequestsPerDay = num(licenseAi.limits?.maxRequestsPerDay);
  const organizationMaxRequestsPerMonth = num(licenseAi.limits?.maxRequestsPerMonth);
  const maxSingleRequestHuf = num(licenseAi.limits?.maxSingleRequestHuf);

  if (snapshot.ownerType === "user") {
    if (!snapshot.ownerUser || !userMatches(snapshot.ownerUser, request)) return { mode: "fallback", reason: "central_direct_user_not_resolved" };
    if (snapshot.ownerUser.status !== "active") return deny("central_user_inactive", "AI_IDENTITY_USER_INACTIVE", "A központi felhasználó nem aktív.");
    if (num(licenseAi.limits?.policyVersion) < 1) return { mode: "fallback", reason: "central_direct_policy_not_managed" };
    const allowedScopes = arr(licenseAi.limits?.allowedScopes, SCOPES); const scopes = allowedScopes.length ? allowedScopes : [...SCOPES];
    const requestedFeatures = arr(licenseAi.limits?.allowedFeatures, licenseFeatures); const allowedFeatures = requestedFeatures.length ? requestedFeatures : licenseFeatures;
    if (!scopes.includes(request.scope)) return deny("central_scope_disabled", "AI_SCOPE_DISABLED", "Az AI ezen a munkaterületen nincs engedélyezve a felhasználónak.");
    if (request.requireAction && (!request.action || !allowedFeatures.includes(request.action))) return deny("central_feature_disabled", "AI_FEATURE_DISABLED", "Ez az AI-funkció nincs engedélyezve a felhasználónak.");
    const directAccessExpiresAt = typeof licenseAi.limits?.accessExpiresAt === "string" ? licenseAi.limits.accessExpiresAt : undefined;
    const directAccessExpiry = expiryState(directAccessExpiresAt, now);
    if (directAccessExpiry === "invalid") return deny("central_direct_ai_expiry_invalid", "AI_USER_ACCESS_EXPIRY_INVALID", "A felhasználó AI-hozzáférési lejárata érvénytelen.");
    if (directAccessExpiry === "expired") return deny("central_direct_ai_expired", "AI_USER_ACCESS_EXPIRED", "A felhasználó AI-hozzáférése lejárt.");
    return { mode: "allow", reason: "central_direct_policy", policy: { centralLicenseId: snapshot.id, centralUserId: snapshot.ownerUser.id, aiUser: { id: `identity:${snapshot.ownerUser.id}`, userId: snapshot.ownerUser.publicUserCode || snapshot.ownerUser.id, displayName: snapshot.ownerUser.fullName, enabled: true, allowedFeatures, allowedScopes: scopes, maxRequestsPerDay: num(licenseAi.limits?.maxRequestsPerDay), maxRequestsPerMonth: num(licenseAi.limits?.maxRequestsPerMonth), monthlyBudgetHuf: num(licenseAi.limits?.userMonthlyBudgetHuf), accessExpiresAt: directAccessExpiresAt, createdAt: now.toISOString(), updatedAt: now.toISOString() }, organizationMonthlyBudgetHuf: organizationBudget, organizationMonthlyTokenBudget, organizationMaxRequestsPerDay, organizationMaxRequestsPerMonth, maxSingleRequestHuf } };
  }

  const matches = (snapshot.memberships || []).filter((membership) => userMatches(membership.user, request));
  if (matches.length === 0) return { mode: "fallback", reason: "central_membership_not_resolved" };
  if (matches.length > 1) return deny("central_membership_ambiguous", "AI_IDENTITY_USER_AMBIGUOUS", "A központi felhasználói azonosítás nem egyértelmű.");
  const membership = matches[0];
  if (membership.user.status !== "active" || membership.status !== "active") return deny("central_membership_inactive", "AI_IDENTITY_MEMBERSHIP_INACTIVE", "A központi szervezeti tagság nem aktív.");
  const membershipExpiry = expiryState(membership.accessEndsAt, now);
  if (membershipExpiry === "invalid") return deny("central_membership_expiry_invalid", "AI_IDENTITY_MEMBERSHIP_EXPIRY_INVALID", "A központi szervezeti tagság lejárati ideje érvénytelen.");
  if (membershipExpiry === "expired") return deny("central_membership_expired", "AI_IDENTITY_MEMBERSHIP_EXPIRED", "A központi szervezeti tagság lejárt.");
  const memberAi = membership.aiModule;
  if (!memberAi || num(memberAi.limits?.policyVersion) < 1) return { mode: "fallback", reason: "central_member_policy_not_managed" };
  if (!memberAi.enabled) return deny("central_member_ai_disabled", "AI_USER_DISABLED", "Az AI-hozzáférés ennél a felhasználónál ki van kapcsolva.");
  const accessExpiresAt = typeof memberAi.limits?.accessExpiresAt === "string" ? memberAi.limits.accessExpiresAt : undefined;
  const aiAccessExpiry = expiryState(accessExpiresAt, now);
  if (aiAccessExpiry === "invalid") return deny("central_member_ai_expiry_invalid", "AI_USER_ACCESS_EXPIRY_INVALID", "A felhasználó AI-hozzáférési lejárata érvénytelen.");
  if (aiAccessExpiry === "expired") return deny("central_member_ai_expired", "AI_USER_ACCESS_EXPIRED", "A felhasználó AI-hozzáférése lejárt.");
  const allowedScopes = arr(memberAi.limits?.allowedScopes, SCOPES);
  const memberFeatures = arr(memberAi.limits?.allowedFeatures, FEATURES);
  const allowedFeatures = memberFeatures.filter((feature) => licenseFeatures.includes(feature));
  if (!allowedScopes.includes(request.scope)) return deny("central_scope_disabled", "AI_SCOPE_DISABLED", "Az AI ezen a munkaterületen nincs engedélyezve a felhasználónak.");
  if (request.requireAction && (!request.action || !allowedFeatures.includes(request.action))) return deny("central_feature_disabled", "AI_FEATURE_DISABLED", "Ez az AI-funkció nincs engedélyezve a felhasználónak.");
  return { mode: "allow", reason: "central_membership_policy", policy: { centralLicenseId: snapshot.id, centralUserId: membership.user.id, centralMembershipId: membership.id, aiUser: { id: `identity:${membership.id}`, userId: membership.user.publicUserCode || membership.user.id, displayName: membership.user.fullName, enabled: true, allowedFeatures, allowedScopes, maxRequestsPerDay: num(memberAi.limits?.maxRequestsPerDay), maxRequestsPerMonth: num(memberAi.limits?.maxRequestsPerMonth), monthlyBudgetHuf: num(memberAi.limits?.monthlyBudgetHuf), accessExpiresAt, createdAt: now.toISOString(), updatedAt: now.toISOString() }, organizationMonthlyBudgetHuf: organizationBudget, organizationMonthlyTokenBudget, organizationMaxRequestsPerDay, organizationMaxRequestsPerMonth, maxSingleRequestHuf } };
}
