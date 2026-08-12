import { getDimproLicenseCenterOverview } from "@/app/lib/identity-core/admin";
import { getLicenseAdminStore } from "@/app/lib/license/admin-service";
import { getHageAiAdminUsageSnapshot } from "@/app/lib/license/hage-ai-gateway";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export async function getBenjadminEntitlementSnapshot() {
  const [central, localLicense, aiUsage] = await Promise.all([
    getDimproLicenseCenterOverview(),
    getLicenseAdminStore(),
    getHageAiAdminUsageSnapshot(),
  ]);

  const users = new Map(
    central.users.map((row) => [text(row.id), { name: text(row.full_name), email: text(row.email) }]),
  );
  const organizations = new Map(
    central.organizations.map((row) => [text(row.id), { name: text(row.display_name) || text(row.legal_name), email: text(row.email) }]),
  );
  const modulesByLicense = new Map<string, string[]>();
  const aiPolicyByLicense = new Map<string, {
    monthlyBudgetHuf: number;
    maxSingleRequestHuf: number;
    monthlyTokenBudget: number;
    maxRequestsPerDay: number;
    maxRequestsPerMonth: number;
    featureFlags: Record<string, unknown>;
  }>();
  for (const row of central.licenseModules) {
    if (row.enabled === false) continue;
    const licenseId = text(row.license_id);
    if (!licenseId) continue;
    const moduleCode = text(row.module_code);
    const items = modulesByLicense.get(licenseId) || [];
    items.push(moduleCode);
    modulesByLicense.set(licenseId, items.filter(Boolean));
    if (moduleCode.toUpperCase() === "AI_ASSISTANT") {
      const limits = objectValue(row.limits);
      aiPolicyByLicense.set(licenseId, {
        monthlyBudgetHuf: numberValue(limits.monthlyBudgetHuf),
        maxSingleRequestHuf: numberValue(limits.maxSingleRequestHuf),
        monthlyTokenBudget: numberValue(limits.monthlyTokenBudget),
        maxRequestsPerDay: numberValue(limits.maxRequestsPerDay),
        maxRequestsPerMonth: numberValue(limits.maxRequestsPerMonth),
        featureFlags: objectValue(row.feature_flags),
      });
    }
  }

  const sendByLicense = new Map<string, { total: number; active: number; usedThisMonth: number; limitThisMonth: number }>();
  for (const row of central.sendEntitlements) {
    const licenseId = text(row.license_id);
    if (!licenseId) continue;
    const current = sendByLicense.get(licenseId) || { total: 0, active: 0, usedThisMonth: 0, limitThisMonth: 0 };
    current.total += 1;
    if (text(row.status) === "active") current.active += 1;
    current.usedThisMonth += numberValue(row.current_month_send_count);
    current.limitThisMonth += numberValue(row.monthly_send_limit);
    sendByLicense.set(licenseId, current);
  }

  const centralLicenses = central.licenses.map((row) => {
    const licenseId = text(row.id);
    const ownerType = text(row.owner_type);
    const owner = ownerType === "organization"
      ? organizations.get(text(row.owner_organization_id))
      : users.get(text(row.owner_user_id));
    const send = sendByLicense.get(licenseId) || { total: 0, active: 0, usedThisMonth: 0, limitThisMonth: 0 };
    return {
      id: licenseId,
      publicCode: text(row.public_license_code),
      ownerType,
      ownerName: owner?.name || "—",
      ownerEmail: owner?.email || "",
      productCode: text(row.product_code),
      planCode: text(row.plan_code),
      status: text(row.status),
      activatedAt: text(row.activated_at),
      expiresAt: text(row.expires_at),
      maxUsers: numberValue(row.max_users),
      maxDevices: numberValue(row.max_devices),
      modules: (modulesByLicense.get(licenseId) || []).sort(),
      aiPolicy: aiPolicyByLicense.get(licenseId) || null,
      sendEntitlements: send,
      updatedAt: text(row.updated_at),
    };
  });

  const usageByLicense = new Map(aiUsage.byLicense.map((row) => [row.licenseId, row]));
  const localByCompany = new Map<string, (typeof localLicense.licenses)[number]>();
  for (const license of localLicense.licenses) {
    localByCompany.set(normalizeKey(license.companyName), license);
    localByCompany.set(normalizeKey(license.companyId), license);
  }

  const matchedLocalIds = new Set<string>();
  const localAiLicenses = centralLicenses
    .filter((license) => license.modules.some((moduleCode) => moduleCode.toUpperCase() === "AI_ASSISTANT"))
    .map((centralLicense) => {
      const bridge = localByCompany.get(normalizeKey(centralLicense.ownerName));
      if (bridge) matchedLocalIds.add(bridge.id);
      const usage = bridge ? usageByLicense.get(bridge.id) : undefined;
      const enabledAiUsers = (bridge?.aiUsers || []).filter((user) => user.enabled);
      const centralBudget = numberValue(centralLicense.aiPolicy?.monthlyBudgetHuf);
      const bridgeBudget = numberValue(bridge?.aiMonthlyBudgetHuf);
      const budget = centralBudget > 0 ? centralBudget : bridgeBudget;
      const centralRequestLimit = numberValue(centralLicense.aiPolicy?.maxSingleRequestHuf);
      const bridgeRequestLimit = numberValue(bridge?.aiMaxSingleRequestHuf);
      return {
        id: centralLicense.id,
        companyId: bridge?.companyId || centralLicense.id,
        companyName: centralLicense.ownerName,
        status: centralLicense.status,
        expiresAt: centralLicense.expiresAt,
        enabledModules: [...centralLicense.modules],
        aiEnabled: true,
        aiMonthlyBudgetHuf: budget,
        aiMaxSingleRequestHuf: centralRequestLimit > 0 ? centralRequestLimit : bridgeRequestLimit,
        aiMonthlyTokenBudget: numberValue(centralLicense.aiPolicy?.monthlyTokenBudget),
        aiMaxRequestsPerDay: numberValue(centralLicense.aiPolicy?.maxRequestsPerDay),
        aiMaxRequestsPerMonth: numberValue(centralLicense.aiPolicy?.maxRequestsPerMonth),
        aiFeatureFlags: centralLicense.aiPolicy?.featureFlags || {},
        aiUsersTotal: (bridge?.aiUsers || []).length,
        aiUsersEnabled: enabledAiUsers.length,
        aiRequestsThisMonth: usage?.requests || 0,
        aiCostHufThisMonth: usage?.costHuf || 0,
        aiBudgetPercent: budget > 0 ? (usage?.costHuf || 0) / budget * 100 : 0,
        lastAiUsedAt: usage?.lastUsedAt || "",
        updatedAt: centralLicense.updatedAt,
        entitlementSource: "central_identity",
        budgetSource: centralBudget > 0 ? "central_identity_module_limits" : bridge ? "legacy_license_bridge" : "not_configured",
        runtimePolicySource: bridge ? "legacy_license_bridge" : "not_configured",
      };
    });

  for (const license of localLicense.licenses) {
    if (matchedLocalIds.has(license.id) || !license.enabledModules.includes("ai_assistant")) continue;
    const usage = usageByLicense.get(license.id);
    const enabledAiUsers = (license.aiUsers || []).filter((user) => user.enabled);
    const budget = numberValue(license.aiMonthlyBudgetHuf);
    localAiLicenses.push({
      id: license.id,
      companyId: license.companyId,
      companyName: license.companyName,
      status: license.status,
      expiresAt: license.expiresAt,
      enabledModules: [...license.enabledModules],
      aiEnabled: true,
      aiMonthlyBudgetHuf: budget,
      aiMaxSingleRequestHuf: numberValue(license.aiMaxSingleRequestHuf),
      aiMonthlyTokenBudget: 0,
      aiMaxRequestsPerDay: 0,
      aiMaxRequestsPerMonth: 0,
      aiFeatureFlags: {},
      aiUsersTotal: (license.aiUsers || []).length,
      aiUsersEnabled: enabledAiUsers.length,
      aiRequestsThisMonth: usage?.requests || 0,
      aiCostHufThisMonth: usage?.costHuf || 0,
      aiBudgetPercent: budget > 0 ? (usage?.costHuf || 0) / budget * 100 : 0,
      lastAiUsedAt: usage?.lastUsedAt || "",
      updatedAt: license.updatedAt,
      entitlementSource: "legacy_license_store",
      budgetSource: "legacy_license_store",
      runtimePolicySource: "legacy_license_store",
    });
  }

  const aiMonthlyBudgetHuf = localAiLicenses.reduce((sum, item) => sum + numberValue(item.aiMonthlyBudgetHuf), 0);
  const centralAiMonthlyBudgetHuf = localAiLicenses
    .filter((item) => item.budgetSource === "central_identity_module_limits")
    .reduce((sum, item) => sum + numberValue(item.aiMonthlyBudgetHuf), 0);
  const legacyAiMonthlyBudgetHuf = localAiLicenses
    .filter((item) => item.budgetSource === "legacy_license_bridge" || item.budgetSource === "legacy_license_store")
    .reduce((sum, item) => sum + numberValue(item.aiMonthlyBudgetHuf), 0);
  const centralAiMonthlyTokenBudget = localAiLicenses.reduce((sum, item) => sum + numberValue(item.aiMonthlyTokenBudget), 0);
  const aiCostHufThisMonth = numberValue(aiUsage.totals.costHuf);
  const aiInputTokensThisMonth = numberValue(aiUsage.totals.inputTokens);
  const aiOutputTokensThisMonth = numberValue(aiUsage.totals.outputTokens);
  const aiTotalTokensThisMonth = aiInputTokensThisMonth + aiOutputTokensThisMonth;
  const configuredTokenBudget = Number(process.env.DIMPRO_BENJADMIN_AI_MONTHLY_TOKEN_BUDGET || 0);
  const fallbackTokenBudget = Number.isFinite(configuredTokenBudget) && configuredTokenBudget > 0
    ? Math.floor(configuredTokenBudget)
    : 0;
  const aiMonthlyTokenBudget = centralAiMonthlyTokenBudget > 0 ? centralAiMonthlyTokenBudget : fallbackTokenBudget;
  const aiBudgetSource = centralAiMonthlyBudgetHuf > 0 && legacyAiMonthlyBudgetHuf > 0
    ? "mixed"
    : centralAiMonthlyBudgetHuf > 0
      ? "central_identity_module_limits"
      : legacyAiMonthlyBudgetHuf > 0
        ? "legacy_license_bridge"
        : "not_configured";
  const aiTokenBudgetSource = centralAiMonthlyTokenBudget > 0
    ? "central_identity_module_limits"
    : fallbackTokenBudget > 0
      ? "benjadmin_env"
      : "not_configured";

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      centralIdentity: "dimpro_identity_core",
      aiLicenseBridge: "legacy_license_store",
      aiUsage: "hage_ai_usage",
    },
    summary: {
      centralLicenses: centralLicenses.length,
      activeCentralLicenses: centralLicenses.filter((item) => item.status === "active" || item.status === "trial").length,
      centralOrganizations: central.organizations.length,
      centralUsers: central.users.length,
      activeSendEntitlements: central.sendEntitlements.filter((item) => text(item.status) === "active").length,
      aiEnabledLicenses: localAiLicenses.filter((item) => item.aiEnabled).length,
      aiRequestsThisMonth: aiUsage.totals.requests,
      aiCostHufThisMonth,
      aiMonthlyBudgetHuf,
      centralAiMonthlyBudgetHuf,
      legacyAiMonthlyBudgetHuf,
      aiBudgetSource,
      aiBudgetPercent: aiMonthlyBudgetHuf > 0 ? (aiCostHufThisMonth / aiMonthlyBudgetHuf) * 100 : 0,
      aiInputTokensThisMonth,
      aiOutputTokensThisMonth,
      aiTotalTokensThisMonth,
      aiMonthlyTokenBudget,
      centralAiMonthlyTokenBudget,
      aiTokenBudgetSource,
      aiTokenBudgetPercent: aiMonthlyTokenBudget > 0 ? (aiTotalTokensThisMonth / aiMonthlyTokenBudget) * 100 : 0,
    },
    centralLicenses,
    localAiLicenses,
    aiUsage,
  };
}
