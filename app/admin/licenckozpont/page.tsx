"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, BellRing, Bot, Check, Coins, ContactRound, CreditCard, KeyRound, Laptop, LoaderCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { DropSendRecipientMode } from "@/app/lib/drop/public/dropPublicTypes";
import { formatDropSendCode, normalizeDropSendCode } from "@/app/lib/drop/public/dropSendCodeFormat";
import { formatDimproLicenseCodeInput, isValidDimproLicenseCode, normalizeDimproLicenseCodeInput } from "@/app/lib/identity-core/licenseCode";
import OrganizationLicenseMembers from "@/components/license/OrganizationLicenseMembers";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

type User = { id: string; public_user_code: string; full_name: string; email: string; status: string; email_verified_at: string | null };
type Organization = { id: string; public_organization_code: string; display_name: string | null; legal_name: string; email: string | null; status: string };
type Membership = { id: string; user_id: string; organization_id: string; role_code: string; role_label: string | null; status: string; joined_at: string | null; access_ends_at: string | null; is_primary: boolean };
type License = {
  id: string;
  public_license_code: string;
  owner_type: "user" | "organization";
  owner_user_id: string | null;
  owner_organization_id: string | null;
  product_code: string;
  plan_code: string | null;
  status: string;
  activated_at: string | null;
  expires_at: string | null;
  offline_grace_until: string | null;
  max_users: number;
  max_devices: number;
  legacy_license_ref: string | null;
  created_at: string;
  updated_at: string;
};
type LicenseModule = { id: string; license_id: string; module_code: string; enabled: boolean; limits: Record<string, unknown>; feature_flags: Record<string, unknown>; valid_from: string | null; valid_until: string | null };
type MembershipModule = { id: string; membership_id: string; module_code: string; enabled: boolean; limits: Record<string, unknown> };
type OrganizationInvitation = { id: string; organization_id: string; license_id: string; membership_id: string; invited_user_id: string; email_normalized: string; full_name: string; role_code: string; role_label: string | null; token_hint: string; status: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string };
type Entitlement = { id: string; user_id: string; license_id: string; status: string; code_hint: string | null; expires_at: string | null; can_use_standard_send: boolean; can_use_quick_image_send: boolean; can_use_project_drop: boolean; monthly_send_limit: number | null; current_month_send_count: number; last_used_at: string | null };
type ModuleDraft = {
  moduleCode: string;
  enabled: boolean;
  limits: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  validFrom: string;
  validUntil: string;
};
type LicenseDraft = { productCode: string; planCode: string; status: string; activatedAt: string; expiresAt: string; maxUsers: number; maxDevices: number; legacyLicenseRef: string; modules: ModuleDraft[] };
type CreateDraft = LicenseDraft & { publicLicenseCode: string; ownerType: "user" | "organization"; ownerUserId: string; ownerOrganizationId: string };
type SendDraft = {
  sendCode: string;
  userId: string;
  recipientMode: DropSendRecipientMode;
  recipientName: string;
  recipientEmail: string;
  recipientOrganization: string;
  expiresAt: string;
  maxPackageSizeMb: number;
  maxRecipients: number;
  monthlySendLimit: string;
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseImageGroups: boolean;
  canUseFileComments: boolean;
  canUseProjectDrop: boolean;
};
type LegacyAdditionalContact = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  receiveEmail: boolean;
  createdAt?: string;
  updatedAt?: string;
};
type LegacyLicenseContacts = {
  legacyLicenseId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  secondaryContactName: string;
  secondaryContactEmail: string;
  secondaryContactPhone: string;
  additionalContacts: LegacyAdditionalContact[];
  updatedAt?: string;
};
type LegacyDeviceSummary = {
  deviceId: string;
  legacyLicenseId: string;
  machineHint: string;
  appId: string;
  firstActivatedAt: string;
  lastOnlineCheckAt: string;
  offlineGraceUntil: string;
  status: "active" | "blocked";
  userName: string;
  organizationUnit: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};
type LegacyBillingSummary = {
  legacyLicenseId: string;
  companyName: string;
  legacyStatus: string;
  startsAt: string;
  expiresAt: string;
  maxDevices: number;
  planCode: string;
  billingInterval: "none" | "monthly" | "yearly" | "manual";
  billingStatus: "none" | "active" | "past_due" | "canceled" | "trialing" | "manual";
  subscriptionQuantity: number;
  currentPeriodEnd: string;
  autoReleaseInactiveDevices: boolean;
  inactiveReleaseDays: number;
  providerCustomerLinked: boolean;
  providerSubscriptionLinked: boolean;
  updatedAt: string;
};

type DrawerMode = "closed" | "new" | "edit";

type ExpiryReminderRun = {
  id?: string;
  createdAt?: string;
  source?: string;
  dryRun?: boolean;
  scannedLicenses: number;
  eligibleLicenses?: number;
  stageCandidates: number;
  intendedEmails: number;
  sentEmails: number;
  alreadySentEmails: number;
  failedEmails: number;
};

type ExpiryReminderStatus = {
  ok: boolean;
  error?: string;
  thresholds?: number[];
  timezone?: string;
  latestRuns?: ExpiryReminderRun[];
};

const statusOptions = ["pending", "trial", "active", "expired", "suspended", "revoked"];
const statusLabels: Record<string, string> = { pending: "Függő", trial: "Próba", active: "Aktív", expired: "Lejárt", suspended: "Felfüggesztett", revoked: "Visszavont" };
const billingIntervalLabels: Record<LegacyBillingSummary["billingInterval"], string> = { none: "Nincs", monthly: "Havi", yearly: "Éves", manual: "Kézi" };
const billingStatusLabels: Record<LegacyBillingSummary["billingStatus"], string> = { none: "Nincs", active: "Aktív", past_due: "Fizetési késedelem", canceled: "Megszűnt", trialing: "Próbaidő", manual: "Kézi" };
const modulePresets = [
  ["HAGE_WORKSPACE", "HAGE-INVEST ONE / Munkatér"], ["TASKS", "Feladatok"], ["VACATIONS", "Szabadságok"], ["AI_ASSISTANT", "AI Asszisztens"],
  ["DROP_SEND", "DIMPRO Send"], ["DROP_QUICK_IMAGE_SEND", "Gyors KépSend"], ["DROP_PROJECT_INBOX", "Projekt Beérkező Drop"],
  ["ARUTER", "Árutér"], ["DRIVE", "DIMPRO Drive"], ["MEETING_ASSISTANT", "Értekezleti Asszisztens"], ["SCHEDULE", "Ütemterv"], ["MINUTES", "Jegyzőkönyvek"],
] as const;

const aiFeatureOptions = [
  ["daily_plan", "Mai feladatok rangsorolása"],
  ["next_step", "Következő lépés"],
  ["task_breakdown", "Feladat bontása"],
  ["waiting_email", "Visszakérdező levél"],
  ["meeting_agenda", "Értekezleti napirend"],
  ["weekly_summary", "Heti összefoglaló"],
  ["decision_support", "Döntési összefoglaló"],
  ["document_extract", "Dokumentum-adatkinyerés"],
] as const;

const aiLimitKeys = {
  monthlyBudgetHuf: "monthlyBudgetHuf",
  maxSingleRequestHuf: "maxSingleRequestHuf",
  monthlyTokenBudget: "monthlyTokenBudget",
  maxRequestsPerDay: "maxRequestsPerDay",
  maxRequestsPerMonth: "maxRequestsPerMonth",
} as const;

function dateValue(days = 180) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }
function isoDate(value: string) { return value ? new Date(`${value}T23:59:59`).toISOString() : null; }
function displayDate(value: string | null) { return value ? new Date(value).toLocaleDateString("hu-HU") : "Nincs lejárat"; }
function ownerName(license: License, users: User[], organizations: Organization[]) {
  if (license.owner_type === "user") return users.find((item) => item.id === license.owner_user_id)?.full_name || "Ismeretlen felhasználó";
  const org = organizations.find((item) => item.id === license.owner_organization_id);
  return org?.display_name || org?.legal_name || "Ismeretlen szervezet";
}
function licenseDraft(license: License, modules: LicenseModule[]): LicenseDraft {
  return {
    productCode: license.product_code,
    planCode: license.plan_code || "",
    status: license.status,
    activatedAt: license.activated_at?.slice(0, 10) || "",
    expiresAt: license.expires_at?.slice(0, 10) || "",
    maxUsers: license.max_users || 1,
    maxDevices: license.max_devices,
    legacyLicenseRef: license.legacy_license_ref || "",
    modules: modules.filter((item) => item.license_id === license.id).map((item) => ({
      moduleCode: item.module_code,
      enabled: item.enabled,
      limits: item.limits && typeof item.limits === "object" ? { ...item.limits } : {},
      featureFlags: item.feature_flags && typeof item.feature_flags === "object" ? { ...item.feature_flags } : {},
      validFrom: item.valid_from || "",
      validUntil: item.valid_until || "",
    })),
  };
}
function initialCreate(): CreateDraft {
  return { publicLicenseCode: "", ownerType: "user", ownerUserId: "", ownerOrganizationId: "", productCode: "DIMPRO", planCode: "standard", status: "active", activatedAt: new Date().toISOString().slice(0, 10), expiresAt: dateValue(365), maxUsers: 1, maxDevices: 1, legacyLicenseRef: "", modules: [] };
}
function initialSend(): SendDraft {
  return { sendCode: "", userId: "", recipientMode: "locked_default", recipientName: "", recipientEmail: "", recipientOrganization: "", expiresAt: dateValue(180), maxPackageSizeMb: 250, maxRecipients: 1, monthlySendLimit: "", canUseStandardSend: true, canUseQuickImageSend: true, canUseImageGroups: true, canUseFileComments: true, canUseProjectDrop: false };
}
function formatAdminSendInput(value: string) {
  const compact = normalizeDropSendCode(value);
  const letters = compact.slice(0, 4).replace(/[^A-Z]/g, "");
  const digits = compact.slice(4).replace(/\D/g, "").slice(0, 6);
  return formatDropSendCode(`${letters}${digits}`);
}
function sendCodeReady(value: string) { return /^[A-Z]{4}-\d{3}-\d{3}$/.test(formatAdminSendInput(value)); }
function statusTone(status: string): "default" | "ok" | "warning" | "danger" | "info" {
  if (status === "active") return "ok";
  if (status === "trial" || status === "pending") return "info";
  if (status === "expired") return "warning";
  if (status === "suspended" || status === "revoked") return "danger";
  return "default";
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="benjadmin-data-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function ModuleEditor({ value, onChange }: { value: ModuleDraft[]; onChange: (next: ModuleDraft[]) => void }) {
  const active = new Set(value.filter((item) => item.enabled).map((item) => item.moduleCode));
  const [custom, setCustom] = useState("");
  function toggle(code: string) {
    if (active.has(code)) onChange(value.filter((item) => item.moduleCode !== code));
    else onChange([...value.filter((item) => item.moduleCode !== code), { moduleCode: code, enabled: true, limits: {}, featureFlags: {}, validFrom: "", validUntil: "" }]);
  }
  function addCustom() {
    const code = custom.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 80);
    if (code.length < 2 || active.has(code)) return;
    onChange([...value, { moduleCode: code, enabled: true, limits: {}, featureFlags: {}, validFrom: "", validUntil: "" }]);
    setCustom("");
  }
  const customItems = value.filter((item) => !modulePresets.some(([code]) => code === item.moduleCode));
  return (
    <section className="benjadmin-data-form-section">
      <header><strong>Moduljogosultságok</strong><span>{active.size} aktív modul</span></header>
      <div className="benjadmin-data-chip-grid">
        {modulePresets.map(([code, label]) => (
          <button key={code} type="button" className={active.has(code) ? "is-active" : ""} onClick={() => toggle(code)}>{active.has(code) ? "✓ " : "+ "}{label}</button>
        ))}
      </div>
      <div className="benjadmin-data-inline-input">
        <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Egyedi modulazonosító" />
        <button type="button" onClick={addCustom}>Hozzáadás</button>
      </div>
      {customItems.length ? <div className="benjadmin-data-chip-grid is-custom">{customItems.map((item) => <button key={item.moduleCode} type="button" className="is-active" onClick={() => toggle(item.moduleCode)}>{item.moduleCode} ×</button>)}</div> : null}
    </section>
  );
}


function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function AiPolicyEditor({ value, onChange }: { value: ModuleDraft[]; onChange: (next: ModuleDraft[]) => void }) {
  const aiModule = value.find((item) => item.moduleCode === "AI_ASSISTANT" && item.enabled);
  if (!aiModule) return null;
  const limits = aiModule.limits || {};
  const flags = aiModule.featureFlags || {};

  function updateModule(next: Partial<ModuleDraft>) {
    onChange(value.map((item) => item.moduleCode === "AI_ASSISTANT" ? { ...item, ...next } : item));
  }
  function setLimit(key: string, raw: string) {
    const parsed = Number(raw);
    updateModule({ limits: { ...limits, [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 } });
  }
  function toggleFeature(key: string) {
    const current = flags[key] !== false;
    updateModule({ featureFlags: { ...flags, [key]: !current } });
  }
  const budget = positiveNumber(limits[aiLimitKeys.monthlyBudgetHuf]);
  const tokenBudget = positiveNumber(limits[aiLimitKeys.monthlyTokenBudget]);

  return (
    <section className="benjadmin-data-form-section benjadmin-ai-policy" data-testid="benjadmin-ai-policy">
      <header>
        <strong><Coins size={16} /> AI finanszírozás és keretek</strong>
        <span>Identity Core policy</span>
      </header>
      <div className="benjadmin-data-security-note benjadmin-ai-policy__notice">
        <Bot size={17} />
        <div>
          <strong>Központi AI-szabályok</strong>
          <span>A keretek a központi <code>AI_ASSISTANT</code> modul <code>limits</code> mezőjében tárolódnak. DEV-en a HAGE AI futási motor már az Identity Core policy-t is olvassa átmeneti <code>prefer</code> módban: az aláírt licenctoken, a gépkötés és a meglévő legacy felhasználói jogosultság továbbra is biztonsági felső korlát, így a központi policy a migráció alatt csak szűkíthet.</span>
        </div>
      </div>
      <div className="benjadmin-data-form-grid benjadmin-ai-policy__limits">
        <Field label="Havi AI-keret (Ft)" hint={budget > 0 ? `${budget.toLocaleString("hu-HU")} Ft` : "0 = nincs központi költséglimit"}><input type="number" min={0} step={100} value={positiveNumber(limits[aiLimitKeys.monthlyBudgetHuf]) || 0} onChange={(event) => setLimit(aiLimitKeys.monthlyBudgetHuf, event.target.value)} /></Field>
        <Field label="Egy AI-kérés maximuma (Ft)" hint="0 = nincs egyedi kéréslimit"><input type="number" min={0} step={1} value={positiveNumber(limits[aiLimitKeys.maxSingleRequestHuf]) || 0} onChange={(event) => setLimit(aiLimitKeys.maxSingleRequestHuf, event.target.value)} /></Field>
        <Field label="Havi tokenkeret" hint={tokenBudget > 0 ? `${tokenBudget.toLocaleString("hu-HU")} token` : "0 = nincs tokenlimit"}><input type="number" min={0} step={1000} value={positiveNumber(limits[aiLimitKeys.monthlyTokenBudget]) || 0} onChange={(event) => setLimit(aiLimitKeys.monthlyTokenBudget, event.target.value)} /></Field>
        <Field label="Napi AI-kérések" hint="0 = nincs napi kérésszám-limit"><input type="number" min={0} step={1} value={positiveNumber(limits[aiLimitKeys.maxRequestsPerDay]) || 0} onChange={(event) => setLimit(aiLimitKeys.maxRequestsPerDay, event.target.value)} /></Field>
        <Field label="Havi AI-kérések" hint="0 = nincs havi kérésszám-limit"><input type="number" min={0} step={1} value={positiveNumber(limits[aiLimitKeys.maxRequestsPerMonth]) || 0} onChange={(event) => setLimit(aiLimitKeys.maxRequestsPerMonth, event.target.value)} /></Field>
      </div>
      <div className="benjadmin-ai-policy__features">
        <div className="benjadmin-ai-policy__features-title"><strong>Engedélyezett AI-funkciók</strong><span>Hiányzó flag = engedélyezett, így a régi üres konfiguráció nem tilt le funkciót.</span></div>
        <div className="benjadmin-data-check-grid">
          {aiFeatureOptions.map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={flags[key] !== false} onChange={() => toggleFeature(key)} />{label}</label>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DimproLicenseCenterPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authorized, setAuthorized] = useState<"checking" | "yes" | "no">("checking");
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [modules, setModules] = useState<LicenseModule[]>([]);
  const [membershipModules, setMembershipModules] = useState<MembershipModule[]>([]);
  const [organizationInvitations, setOrganizationInvitations] = useState<OrganizationInvitation[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [legacyContacts, setLegacyContacts] = useState<LegacyLicenseContacts[]>([]);
  const [contactDrafts, setContactDrafts] = useState<Record<string, LegacyLicenseContacts>>({});
  const [legacyDevices, setLegacyDevices] = useState<LegacyDeviceSummary[]>([]);
  const [deviceDrafts, setDeviceDrafts] = useState<Record<string, LegacyDeviceSummary>>({});
  const [legacyBilling, setLegacyBilling] = useState<LegacyBillingSummary[]>([]);
  const [billingDrafts, setBillingDrafts] = useState<Record<string, LegacyBillingSummary>>({});
  const [drafts, setDrafts] = useState<Record<string, LicenseDraft>>({});
  const [createDraft, setCreateDraft] = useState<CreateDraft>(initialCreate);
  const [sendDrafts, setSendDrafts] = useState<Record<string, SendDraft>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Központi Identity Core adatok betöltése…");
  const [createdCode, setCreatedCode] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [selectedLicenseId, setSelectedLicenseId] = useState("");
  const [expiryReminderOpen, setExpiryReminderOpen] = useState(false);
  const [expiryReminderLoading, setExpiryReminderLoading] = useState(false);
  const [expiryReminderSummary, setExpiryReminderSummary] = useState("");
  const [expiryReminderStatus, setExpiryReminderStatus] = useState<ExpiryReminderStatus | null>(null);
  const headers = useMemo(() => ({ "content-type": "application/json", "x-dimpro-license-admin-key": adminKey }), [adminKey]);

  const load = useCallback(async (key: string) => {
    const [licenseResponse, sendResponse, contactResponse, deviceResponse, billingResponse] = await Promise.all([
      fetch("/api/dimpro-identity/admin/licenses", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
      fetch("/api/dimpro-identity/admin/send-entitlements", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
      fetch("/api/license/admin-contacts", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
      fetch("/api/license/admin-devices", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
      fetch("/api/license/admin-billing", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
    ]);
    const [licensePayload, sendPayload, contactPayload, devicePayload, billingPayload] = await Promise.all([licenseResponse.json(), sendResponse.json(), contactResponse.json(), deviceResponse.json(), billingResponse.json()]);
    if (!licenseResponse.ok) throw new Error(licensePayload.error || "A Licencközpont nem tölthető be.");
    if (!sendResponse.ok) throw new Error(sendPayload.error || "A Send-jogosultságok nem tölthetők be.");
    const nextLicenses = licensePayload.licenses || [];
    const nextModules = licensePayload.licenseModules || [];
    const nextContacts: LegacyLicenseContacts[] = contactResponse.ok && contactPayload?.ok && Array.isArray(contactPayload.contacts)
      ? contactPayload.contacts
      : [];
    const nextDevices: LegacyDeviceSummary[] = deviceResponse.ok && devicePayload?.ok && Array.isArray(devicePayload.devices)
      ? devicePayload.devices
      : [];
    const nextBilling: LegacyBillingSummary[] = billingResponse.ok && billingPayload?.ok && Array.isArray(billingPayload.billing)
      ? billingPayload.billing
      : [];
    setUsers(licensePayload.users || []);
    setOrganizations(licensePayload.organizations || []);
    setMemberships(licensePayload.organizationMemberships || []);
    setLicenses(nextLicenses);
    setModules(nextModules);
    setMembershipModules(licensePayload.membershipModules || []);
    setOrganizationInvitations(licensePayload.organizationInvitations || []);
    setEntitlements(sendPayload.entitlements || []);
    setLegacyContacts(nextContacts);
    setContactDrafts(Object.fromEntries(nextContacts.map((contact) => [contact.legacyLicenseId, { ...contact, additionalContacts: contact.additionalContacts.map((item) => ({ ...item })) }])));
    setLegacyDevices(nextDevices);
    setDeviceDrafts(Object.fromEntries(nextDevices.map((device) => [device.deviceId, { ...device }])));
    setLegacyBilling(nextBilling);
    setBillingDrafts(Object.fromEntries(nextBilling.map((billing) => [billing.legacyLicenseId, { ...billing }])));
    setDrafts(Object.fromEntries(nextLicenses.map((license: License) => [license.id, licenseDraft(license, nextModules)])));
    setAuthorized("yes");
    const unavailable = [!contactResponse.ok ? "kapcsolattartók" : "", !deviceResponse.ok ? "gépkötések" : "", !billingResponse.ok ? "előfizetés/számlázás" : ""].filter(Boolean);
    setMessage(unavailable.length ? `Identity Core adatok frissítve; nem elérhető legacy bridge: ${unavailable.join(", ")}.` : "Identity Core adatok és legacy kompatibilitási blokkok frissítve.");
  }, []);

  useEffect(() => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
    setAdminKey(key);
    if (!key) {
      setAuthorized("no");
      setMessage("Nincs aktív licencadmin munkamenet.");
      return;
    }
    void load(key).catch((error) => {
      setAuthorized("no");
      setMessage(error instanceof Error ? error.message : "A Licencközpont nem tölthető be.");
    });
  }, [load]);

  const stats = useMemo(() => ({
    licenses: licenses.length,
    active: licenses.filter((license) => license.status === "active").length,
    modules: modules.filter((module) => module.enabled).length,
    send: entitlements.filter((entitlement) => entitlement.status === "active").length,
  }), [entitlements, licenses, modules]);

  const visibleLicenses = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return licenses.filter((license) => {
      if (statusFilter !== "all" && license.status !== statusFilter) return false;
      if (!clean) return true;
      const owner = ownerName(license, users, organizations);
      return [license.public_license_code, owner, license.product_code, license.plan_code || "", license.status, license.legacy_license_ref || ""]
        .some((value) => value.toLowerCase().includes(clean));
    });
  }, [licenses, organizations, query, statusFilter, users]);

  const pageCount = Math.max(1, Math.ceil(visibleLicenses.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedLicenses = visibleLicenses.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedLicense = licenses.find((license) => license.id === selectedLicenseId) || null;

  async function loadExpiryReminderStatus(announce = true) {
    if (!adminKey.trim()) {
      setExpiryReminderSummary("Licencadmin belépés szükséges.");
      return;
    }
    setExpiryReminderLoading(true);
    try {
      const response = await fetch("/api/license/expiry-reminders?limit=10", {
        headers: { "x-dimpro-license-admin-key": adminKey.trim(), accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json() as ExpiryReminderStatus;
      setExpiryReminderStatus(payload);
      if (!response.ok || !payload.ok) {
        setExpiryReminderSummary(payload.error || "A lejárati értesítő állapota nem tölthető be.");
        return;
      }
      if (announce) setExpiryReminderSummary("Lejárati értesítő állapota betöltve.");
    } catch (error) {
      setExpiryReminderSummary(error instanceof Error ? error.message : "Ismeretlen lejárati értesítő hiba.");
    } finally {
      setExpiryReminderLoading(false);
    }
  }

  async function runExpiryReminderCheck(dryRun: boolean) {
    if (!adminKey.trim()) {
      setExpiryReminderSummary("Licencadmin belépés szükséges.");
      return;
    }
    setExpiryReminderLoading(true);
    setExpiryReminderSummary("");
    try {
      const response = await fetch("/api/license/expiry-reminders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": adminKey.trim(),
        },
        body: JSON.stringify({ source: "manual", dryRun }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; run?: ExpiryReminderRun };
      if (!response.ok || !payload.ok || !payload.run) {
        setExpiryReminderSummary(payload.error || "A lejárati ellenőrzés nem sikerült.");
        return;
      }
      const run = payload.run;
      setExpiryReminderSummary(
        `${dryRun ? "Előnézet" : "Futtatás"}: ${run.scannedLicenses} licenc ellenőrizve, ${run.stageCandidates} értesítési fokozat aktív, ${run.intendedEmails} címzett, ${run.sentEmails} ${dryRun ? "küldendő" : "elküldött"}, ${run.alreadySentEmails} korábban elküldött, ${run.failedEmails} hiba.`,
      );
      await loadExpiryReminderStatus(false);
    } catch (error) {
      setExpiryReminderSummary(error instanceof Error ? error.message : "Hálózati vagy szerverhiba történt a lejárati ellenőrzés során.");
    } finally {
      setExpiryReminderLoading(false);
    }
  }

  async function createLicense() {
    if (busy || !isValidDimproLicenseCode(createDraft.publicLicenseCode)) return;
    setBusy("create-license");
    setMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/licenses", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...createDraft, activatedAt: isoDate(createDraft.activatedAt), expiresAt: isoDate(createDraft.expiresAt) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A licenc nem hozható létre.");
      setMessage(`Központi licenc létrehozva: ${payload.license.public_license_code}`);
      setCreateDraft(initialCreate());
      setDrawerMode("closed");
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A licenc létrehozása sikertelen.");
    } finally {
      setBusy("");
    }
  }

  async function saveLicense(id: string) {
    const draft = drafts[id];
    if (!draft || busy) return;
    setBusy(`license:${id}`);
    try {
      const response = await fetch("/api/dimpro-identity/admin/licenses", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ licenseId: id, ...draft, activatedAt: isoDate(draft.activatedAt), expiresAt: isoDate(draft.expiresAt) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A licenc nem menthető.");
      setMessage("A központi licenc és moduljogosultságai mentve.");
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A licenc mentése sikertelen.");
    } finally {
      setBusy("");
    }
  }

  function legacyContactForLicense(license: License) {
    if (!license.legacy_license_ref) return null;
    return legacyContacts.find((contact) => contact.legacyLicenseId === license.legacy_license_ref) || null;
  }

  function updateContactDraft(legacyLicenseId: string, patch: Partial<LegacyLicenseContacts>) {
    setContactDrafts((current) => {
      const base = current[legacyLicenseId] || legacyContacts.find((contact) => contact.legacyLicenseId === legacyLicenseId);
      if (!base) return current;
      return { ...current, [legacyLicenseId]: { ...base, ...patch } };
    });
  }

  function updateAdditionalContact(legacyLicenseId: string, contactId: string, patch: Partial<LegacyAdditionalContact>) {
    const base = contactDrafts[legacyLicenseId] || legacyContacts.find((contact) => contact.legacyLicenseId === legacyLicenseId);
    if (!base) return;
    updateContactDraft(legacyLicenseId, {
      additionalContacts: base.additionalContacts.map((contact) => contact.id === contactId ? { ...contact, ...patch } : contact),
    });
  }

  function addAdditionalContact(legacyLicenseId: string) {
    const base = contactDrafts[legacyLicenseId] || legacyContacts.find((contact) => contact.legacyLicenseId === legacyLicenseId);
    if (!base) return;
    updateContactDraft(legacyLicenseId, {
      additionalContacts: [
        ...base.additionalContacts,
        { id: `contact-${crypto.randomUUID()}`, name: "", role: "", email: "", phone: "", receiveEmail: true },
      ],
    });
  }

  function removeAdditionalContact(legacyLicenseId: string, contactId: string) {
    const base = contactDrafts[legacyLicenseId] || legacyContacts.find((contact) => contact.legacyLicenseId === legacyLicenseId);
    if (!base) return;
    updateContactDraft(legacyLicenseId, { additionalContacts: base.additionalContacts.filter((contact) => contact.id !== contactId) });
  }

  async function saveLegacyContacts(license: License) {
    const source = legacyContactForLicense(license);
    if (!source || busy) {
      setMessage("A kapcsolattartók csak pontos legacy licenckapcsolat mellett módosíthatók.");
      return;
    }
    const draft = contactDrafts[source.legacyLicenseId] || source;
    setBusy(`contacts:${license.id}`);
    try {
      const response = await fetch("/api/license/admin-contacts", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          legacyLicenseId: source.legacyLicenseId,
          contactName: draft.contactName,
          contactEmail: draft.contactEmail,
          contactPhone: draft.contactPhone,
          secondaryContactName: draft.secondaryContactName,
          secondaryContactEmail: draft.secondaryContactEmail,
          secondaryContactPhone: draft.secondaryContactPhone,
          additionalContacts: draft.additionalContacts,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A kapcsolattartók nem menthetők.");
      setMessage("A legacy kapcsolattartók biztonságosan mentve. A központi licencadatok nem változtak.");
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kapcsolattartók mentése sikertelen.");
    } finally {
      setBusy("");
    }
  }

  function devicesForLicense(license: License) {
    if (!license.legacy_license_ref) return [];
    return legacyDevices.filter((device) => device.legacyLicenseId === license.legacy_license_ref);
  }

  function updateDeviceDraft(deviceId: string, patch: Partial<LegacyDeviceSummary>) {
    setDeviceDrafts((current) => {
      const base = current[deviceId] || legacyDevices.find((device) => device.deviceId === deviceId);
      if (!base) return current;
      return { ...current, [deviceId]: { ...base, ...patch } };
    });
  }

  async function runDeviceAction(license: License, device: LegacyDeviceSummary, action: "updateMeta" | "setStatus" | "remove", status?: "active" | "blocked") {
    if (!license.legacy_license_ref || device.legacyLicenseId !== license.legacy_license_ref || busy) {
      setMessage("A gépkötés csak pontos legacy licenckapcsolat mellett módosítható.");
      return;
    }
    const draft = deviceDrafts[device.deviceId] || device;
    setBusy(`device:${device.deviceId}:${action}`);
    try {
      const response = await fetch("/api/license/admin-devices", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          action,
          legacyLicenseId: license.legacy_license_ref,
          deviceId: device.deviceId,
          ...(action === "updateMeta" ? { userName: draft.userName, organizationUnit: draft.organizationUnit, note: draft.note } : {}),
          ...(action === "setStatus" ? { status } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A gépkötés nem módosítható.");
      setMessage(action === "remove" ? "A gépkötés felszabadítva." : action === "setStatus" ? "A gépkötés státusza mentve." : "A gépkötés leíró adatai mentve.");
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A gépkötés módosítása sikertelen.");
    } finally {
      setBusy("");
    }
  }

  function billingForLicense(license: License) {
    if (!license.legacy_license_ref) return null;
    return legacyBilling.find((billing) => billing.legacyLicenseId === license.legacy_license_ref) || null;
  }

  function updateBillingDraft(legacyLicenseId: string, patch: Partial<LegacyBillingSummary>) {
    setBillingDrafts((current) => {
      const base = current[legacyLicenseId] || legacyBilling.find((billing) => billing.legacyLicenseId === legacyLicenseId);
      if (!base) return current;
      return { ...current, [legacyLicenseId]: { ...base, ...patch } };
    });
  }

  async function saveLegacyBilling(license: License) {
    const source = billingForLicense(license);
    if (!source || !license.legacy_license_ref || busy) {
      setMessage("Az előfizetési adatok csak pontos legacy licenckapcsolat mellett módosíthatók.");
      return;
    }
    const draft = billingDrafts[source.legacyLicenseId] || source;
    setBusy(`billing:${license.id}`);
    try {
      const response = await fetch("/api/license/admin-billing", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          legacyLicenseId: source.legacyLicenseId,
          planCode: license.plan_code || "manual",
          billingInterval: draft.billingInterval,
          billingStatus: draft.billingStatus,
          subscriptionQuantity: draft.subscriptionQuantity,
          currentPeriodEnd: draft.currentPeriodEnd || "",
          autoReleaseInactiveDevices: draft.autoReleaseInactiveDevices,
          inactiveReleaseDays: draft.inactiveReleaseDays,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Az előfizetési adatok nem menthetők.");
      setMessage(payload.changed ? "A legacy előfizetési és számlázási adatok mentve és auditálva." : "Az előfizetési adatok változatlanok.");
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az előfizetési adatok mentése sikertelen.");
    } finally {
      setBusy("");
    }
  }

  function eligibleUsers(license: License) {
    if (license.owner_type === "user") return users.filter((user) => user.id === license.owner_user_id);
    const ids = new Set(memberships.filter((membership) => membership.organization_id === license.owner_organization_id && membership.status === "active").map((membership) => membership.user_id));
    return users.filter((user) => ids.has(user.id) && user.status === "active" && user.email_verified_at);
  }

  async function createSend(license: License) {
    const draft = sendDrafts[license.id] || initialSend();
    if (busy) return;
    const code = formatAdminSendInput(draft.sendCode);
    if (!sendCodeReady(code)) {
      setMessage("Adjon meg saját Send-kódot, például: HAGE-123-456.");
      return;
    }
    const recipients = draft.recipientMode === "free_entry" ? [] : [{ name: draft.recipientName, email: draft.recipientEmail, organizationName: draft.recipientOrganization || null, label: "Alapértelmezett címzett", isDefault: true, locked: draft.recipientMode === "locked_default" }];
    setBusy(`send:${license.id}`);
    setCreatedCode("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/send-entitlements", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sendCode: code,
          userId: draft.userId,
          licenseId: license.id,
          recipientMode: draft.recipientMode,
          recipients,
          expiresAt: isoDate(draft.expiresAt),
          maxRecipients: draft.maxRecipients,
          maxPackageSizeBytes: Math.round(draft.maxPackageSizeMb * 1024 * 1024),
          monthlySendLimit: draft.monthlySendLimit ? Number(draft.monthlySendLimit) : null,
          canUseStandardSend: draft.canUseStandardSend,
          canUseQuickImageSend: draft.canUseQuickImageSend,
          canUseImageGroups: draft.canUseImageGroups,
          canUseFileComments: draft.canUseFileComments,
          canUseProjectDrop: draft.canUseProjectDrop,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Send-jogosultság nem hozható létre.");
      setCreatedCode(payload.created.formattedCode);
      setMessage("A saját Send-kódhoz tartozó központi jogosultság elkészült. A szerver a nyers kódot nem tárolja.");
      setSendDrafts((current) => ({ ...current, [license.id]: { ...initialSend(), userId: draft.userId } }));
      await load(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Send-jogosultság létrehozása sikertelen.");
    } finally {
      setBusy("");
    }
  }

  function openEdit(license: License) {
    setSelectedLicenseId(license.id);
    setDrawerMode("edit");
    setCreatedCode("");
  }

  if (authorized !== "yes") {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <KeyRound size={22} />
          <h1>{authorized === "checking" ? "Licencközpont betöltése" : "Licencadmin belépés szükséges"}</h1>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · LICENCKÖZPONT"
        title="Központi licencek és jogosultságok"
        description="Szervezeti és felhasználói licencek, modulok, eszközkeretek és Send-jogosultságok (entitlement) táblázatos kezelése."
        actions={(
          <>
            <Link href="/admin?legacyLicense=1" className="benjadmin-data-secondary-action" title="Régi licencadmin kompatibilitási felület">Régi licencadmin</Link>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => { setExpiryReminderOpen(true); void loadExpiryReminderStatus(); }}><BellRing size={16} /> Lejárati értesítések</button>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void load(adminKey)}><RefreshCw size={16} /> Frissítés</button>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => { setCreateDraft(initialCreate()); setDrawerMode("new"); }}><Plus size={16} /> Új licenc</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Központi licencek" value={stats.licenses} />
            <BenjadminMetric label="Aktív licencek" value={stats.active} tone="ok" />
            <BenjadminMetric label="Aktív modulok" value={stats.modules} />
            <BenjadminMetric label="Aktív Send-jog" value={stats.send} />
            <BenjadminMetric label="Szervezetek" value={organizations.length} />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="Licenc státusz szűrő">
              {["all", "active", "trial", "expired", "suspended"].map((status) => (
                <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => { setStatusFilter(status); setPage(1); }}>
                  {status === "all" ? "Mind" : statusLabels[status] || status}
                </button>
              ))}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés licenckód, tulajdonos, termék, csomag vagy státusz alapján" /></label>
            <div className="benjadmin-data-allowed"><KeyRound size={15} /><span>Identity Core <b>0.2.0</b></span></div>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleLicenses.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table" data-testid="benjadmin-license-table">
            <thead>
              <tr>
                <th>Licenckód</th>
                <th>Tulajdonos</th>
                <th>Termék / csomag</th>
                <th>Státusz</th>
                <th>Felhasználók</th>
                <th>Eszközök</th>
                <th>Modulok</th>
                <th>Send-jog</th>
                <th>Lejárat</th>
                <th>Művelet</th>
              </tr>
            </thead>
            <tbody>
              {pagedLicenses.length === 0 ? (
                <tr><td colSpan={10} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő licenc.</td></tr>
              ) : pagedLicenses.map((license) => {
                const moduleCount = modules.filter((module) => module.license_id === license.id && module.enabled).length;
                const sendCount = entitlements.filter((entitlement) => entitlement.license_id === license.id && entitlement.status === "active").length;
                const organizationMembers = license.owner_type === "organization" ? memberships.filter((membership) => membership.organization_id === license.owner_organization_id && ["invited", "active", "suspended"].includes(membership.status)).length : 1;
                return (
                  <tr key={license.id}>
                    <td className="is-mono"><strong>{license.public_license_code}</strong></td>
                    <td><strong>{ownerName(license, users, organizations)}</strong><br /><small>{license.owner_type === "organization" ? "Szervezet" : "Felhasználó"}</small></td>
                    <td><strong>{license.product_code}</strong>{license.plan_code ? <><br /><small>{license.plan_code}</small></> : null}</td>
                    <td><BenjadminStatusPill tone={statusTone(license.status)}>{statusLabels[license.status] || license.status}</BenjadminStatusPill></td>
                    <td>{organizationMembers} / {license.max_users}</td>
                    <td>{license.max_devices}</td>
                    <td>{moduleCount}</td>
                    <td>{sendCount}</td>
                    <td className="is-nowrap">{displayDate(license.expires_at)}</td>
                    <td><button type="button" className="benjadmin-data-row-action" onClick={() => openEdit(license)}>Szerkesztés</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {expiryReminderOpen ? <button className="benjadmin-data-drawer-backdrop" type="button" aria-label="Lejárati értesítések bezárása" onClick={() => setExpiryReminderOpen(false)} /> : null}
      {expiryReminderOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-expiry-reminder-drawer" data-testid="benjadmin-expiry-reminder-drawer">
          <header>
            <div><span>LICENC LEJÁRATI ÉRTESÍTÉSEK</span><strong>Átmeneti kompatibilitási szolgáltatás</strong></div>
            <button type="button" onClick={() => setExpiryReminderOpen(false)} aria-label="Bezárás"><X size={18} /></button>
          </header>
          <div className="benjadmin-data-drawer__body benjadmin-expiry-reminder-body">
            <div className="benjadmin-data-security-note">
              <BellRing size={17} />
              <div>
                <strong>30 / 7 / 1 nap és lejárat napja</strong>
                <span>Ez a szolgáltatás jelenleg a régi licencállományt ellenőrzi. Az Identity Core migráció befejezéséig kompatibilitási funkcióként marad elérhető.</span>
              </div>
            </div>
            <section className="benjadmin-data-form-section">
              <header><strong>Állapot</strong><BenjadminStatusPill tone="info">{expiryReminderStatus?.timezone || "Europe/Budapest"}</BenjadminStatusPill></header>
              <div className="benjadmin-infra-detail-grid">
                <span>Értesítési küszöbök<b>{(expiryReminderStatus?.thresholds || [30, 7, 1, 0]).map((value) => `${value} nap`).join(" · ")}</b></span>
                <span>Korábbi futások<b>{expiryReminderStatus?.latestRuns?.length ?? 0}</b></span>
                <span>Legutóbbi futás<b>{displayDate(expiryReminderStatus?.latestRuns?.[0]?.createdAt || null)}</b></span>
                <span>Legutóbbi mód<b>{expiryReminderStatus?.latestRuns?.[0]?.dryRun ? "Előnézet" : expiryReminderStatus?.latestRuns?.[0] ? "Éles futás" : "—"}</b></span>
              </div>
            </section>
            <section className="benjadmin-data-form-section">
              <header><strong>Kézi ellenőrzés</strong><span>e-mail küldés szabályozva</span></header>
              <p>Az előnézet nem küld levelet. Az éles futtatás csak külön megerősítés után indul, és a korábban már kiküldött aktuális fokozatokat nem küldi újra.</p>
              <div className="benjadmin-expiry-reminder-actions">
                <button type="button" className="benjadmin-data-secondary-action" disabled={expiryReminderLoading} onClick={() => void runExpiryReminderCheck(true)}>{expiryReminderLoading ? <LoaderCircle className="is-spinning" size={16} /> : <BellRing size={16} />} Előnézet küldés nélkül</button>
                <button type="button" className="benjadmin-data-danger-action" disabled={expiryReminderLoading} onClick={() => { if (window.confirm("Elindítod a lejárati értesítések kézi kiküldését? Csak a még nem küldött aktuális fokozatok mennek ki.")) void runExpiryReminderCheck(false); }}><BellRing size={16} /> Értesítések futtatása</button>
              </div>
              {expiryReminderSummary ? <p className="benjadmin-expiry-reminder-summary">{expiryReminderSummary}</p> : null}
            </section>
            <section className="benjadmin-data-form-section">
              <header><strong>Legutóbbi futások</strong><span>max. 10 rekord</span></header>
              <div className="benjadmin-data-mini-table-scroll">
                <table className="benjadmin-data-mini-table">
                  <thead><tr><th>Időpont</th><th>Mód</th><th>Licencek</th><th>Fokozat</th><th>Címzett</th><th>Küldött</th><th>Hiba</th></tr></thead>
                  <tbody>
                    {(expiryReminderStatus?.latestRuns || []).length ? (expiryReminderStatus?.latestRuns || []).map((run, index) => (
                      <tr key={`${run.id || run.createdAt || "run"}-${index}`}>
                        <td>{displayDate(run.createdAt || null)}</td>
                        <td>{run.dryRun ? "Előnézet" : "Éles"}</td>
                        <td>{run.scannedLicenses}</td>
                        <td>{run.stageCandidates}</td>
                        <td>{run.intendedEmails}</td>
                        <td>{run.sentEmails}</td>
                        <td>{run.failedEmails}</td>
                      </tr>
                    )) : <tr><td colSpan={7}>Még nincs rögzített futás.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      {drawerMode !== "closed" ? <button className="benjadmin-data-drawer-backdrop" type="button" aria-label="Szerkesztő bezárása" onClick={() => setDrawerMode("closed")} /> : null}
      {drawerMode !== "closed" ? (
        <aside className="benjadmin-data-drawer" data-testid="benjadmin-license-drawer">
          <header>
            <div><span>{drawerMode === "new" ? "ÚJ KÖZPONTI LICENC" : "LICENC SZERKESZTÉSE"}</span><strong>{drawerMode === "new" ? "Licenc létrehozása" : selectedLicense?.public_license_code || "—"}</strong></div>
            <button type="button" onClick={() => setDrawerMode("closed")} aria-label="Bezárás"><X size={18} /></button>
          </header>

          <div className="benjadmin-data-drawer__body">
            {drawerMode === "new" ? (
              <>
                <div className="benjadmin-data-form-grid">
                  <Field label="Saját központi licenckód" hint="Formátum: LIC-ÉÉ-XXXX-XXXX"><input value={createDraft.publicLicenseCode} onChange={(event) => setCreateDraft((draft) => ({ ...draft, publicLicenseCode: normalizeDimproLicenseCodeInput(event.target.value) }))} onBlur={(event) => setCreateDraft((draft) => ({ ...draft, publicLicenseCode: formatDimproLicenseCodeInput(event.target.value) }))} placeholder="LIC-26-HAGE-2468" /></Field>
                  <Field label="Tulajdonos típusa"><select value={createDraft.ownerType} onChange={(event) => setCreateDraft((draft) => ({ ...draft, ownerType: event.target.value as "user" | "organization", ownerUserId: "", ownerOrganizationId: "" }))}><option value="user">Felhasználó</option><option value="organization">Szervezet</option></select></Field>
                  {createDraft.ownerType === "user" ? <Field label="Felhasználó"><select value={createDraft.ownerUserId} onChange={(event) => setCreateDraft((draft) => ({ ...draft, ownerUserId: event.target.value }))}><option value="">Válasszon</option>{users.filter((user) => user.status === "active").map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}</select></Field> : <Field label="Szervezet"><select value={createDraft.ownerOrganizationId} onChange={(event) => setCreateDraft((draft) => ({ ...draft, ownerOrganizationId: event.target.value }))}><option value="">Válasszon</option>{organizations.filter((organization) => organization.status === "active").map((organization) => <option key={organization.id} value={organization.id}>{organization.display_name || organization.legal_name}</option>)}</select></Field>}
                  <Field label="Termék"><input value={createDraft.productCode} onChange={(event) => setCreateDraft((draft) => ({ ...draft, productCode: event.target.value }))} /></Field>
                  <Field label="Csomag"><input value={createDraft.planCode} onChange={(event) => setCreateDraft((draft) => ({ ...draft, planCode: event.target.value }))} /></Field>
                  <Field label="Státusz"><select value={createDraft.status} onChange={(event) => setCreateDraft((draft) => ({ ...draft, status: event.target.value }))}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field>
                  <Field label="Aktiválás"><input type="date" value={createDraft.activatedAt} onChange={(event) => setCreateDraft((draft) => ({ ...draft, activatedAt: event.target.value }))} /></Field>
                  <Field label="Lejárat"><input type="date" value={createDraft.expiresAt} onChange={(event) => setCreateDraft((draft) => ({ ...draft, expiresAt: event.target.value }))} /></Field>
                  <Field label="Max. felhasználó"><input type="number" min={1} value={createDraft.maxUsers} onChange={(event) => setCreateDraft((draft) => ({ ...draft, maxUsers: Number(event.target.value) }))} /></Field>
                  <Field label="Max. eszköz"><input type="number" min={1} value={createDraft.maxDevices} onChange={(event) => setCreateDraft((draft) => ({ ...draft, maxDevices: Number(event.target.value) }))} /></Field>
                  <Field label="Régi licenc hivatkozás"><input value={createDraft.legacyLicenseRef} onChange={(event) => setCreateDraft((draft) => ({ ...draft, legacyLicenseRef: event.target.value }))} /></Field>
                </div>
                <ModuleEditor value={createDraft.modules} onChange={(next) => setCreateDraft((draft) => ({ ...draft, modules: next }))} />
                <AiPolicyEditor value={createDraft.modules} onChange={(next) => setCreateDraft((draft) => ({ ...draft, modules: next }))} />
                <button type="button" className="benjadmin-data-primary-action is-full" onClick={() => void createLicense()} disabled={busy !== "" || !isValidDimproLicenseCode(createDraft.publicLicenseCode) || !(createDraft.ownerType === "user" ? createDraft.ownerUserId : createDraft.ownerOrganizationId)}>{busy === "create-license" ? <LoaderCircle size={17} className="is-spinning" /> : <Plus size={17} />} Licenc létrehozása</button>
              </>
            ) : selectedLicense ? (() => {
              const draft = drafts[selectedLicense.id] || licenseDraft(selectedLicense, modules);
              const send = sendDrafts[selectedLicense.id] || initialSend();
              const allowedUsers = eligibleUsers(selectedLicense);
              const licenseEntitlements = entitlements.filter((entitlement) => entitlement.license_id === selectedLicense.id);
              const contactSource = legacyContactForLicense(selectedLicense);
              const contactDraft = contactSource ? (contactDrafts[contactSource.legacyLicenseId] || contactSource) : null;
              const licenseDevices = devicesForLicense(selectedLicense);
              const billingSource = billingForLicense(selectedLicense);
              const billingDraft = billingSource ? (billingDrafts[billingSource.legacyLicenseId] || billingSource) : null;
              const organization = organizations.find((item) => item.id === selectedLicense.owner_organization_id);
              return (
                <>
                  <div className="benjadmin-data-form-grid">
                    <Field label="Termék"><input value={draft.productCode} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, productCode: event.target.value } }))} /></Field>
                    <Field label="Csomag"><input value={draft.planCode} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, planCode: event.target.value } }))} /></Field>
                    <Field label="Státusz"><select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, status: event.target.value } }))}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field>
                    <Field label="Lejárat"><input type="date" value={draft.expiresAt} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, expiresAt: event.target.value } }))} /></Field>
                    <Field label="Max. felhasználó"><input type="number" min={1} value={draft.maxUsers} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, maxUsers: Number(event.target.value) } }))} /></Field>
                    <Field label="Max. eszköz"><input type="number" min={1} value={draft.maxDevices} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, maxDevices: Number(event.target.value) } }))} /></Field>
                    <Field label="Régi licenc hivatkozás"><input value={draft.legacyLicenseRef} onChange={(event) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, legacyLicenseRef: event.target.value } }))} /></Field>
                  </div>
                  <ModuleEditor value={draft.modules} onChange={(next) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, modules: next } }))} />
                  <AiPolicyEditor value={draft.modules} onChange={(next) => setDrafts((current) => ({ ...current, [selectedLicense.id]: { ...draft, modules: next } }))} />
                  <button type="button" className="benjadmin-data-primary-action is-full" onClick={() => void saveLicense(selectedLicense.id)} disabled={busy !== ""}>{busy === `license:${selectedLicense.id}` ? <LoaderCircle size={17} className="is-spinning" /> : <Check size={17} />} Licenc mentése</button>

                  <section className="benjadmin-data-form-section benjadmin-license-contacts" data-testid="benjadmin-license-contacts">
                    <header><strong><ContactRound size={16} /> Kapcsolattartók</strong><span>Átmeneti legacy bridge</span></header>
                    <div className="benjadmin-data-security-note">
                      <ContactRound size={17} />
                      <div>
                        <strong>Biztonságos kompatibilitási nézet</strong>
                        <span>A modern Licencközpont csak a kapcsolattartói mezőket olvassa a legacy rekordból. Nyers licenckulcs, gépazonosító vagy számlázási titok nem kerül ebbe a nézetbe. A kapcsolattartói adatok központi Identity Core sémába migrálása külön fejlesztési lépés.</span>
                      </div>
                    </div>
                    {!contactDraft ? (
                      <div className="benjadmin-data-security-note is-warning">
                        <ContactRound size={17} />
                        <div><strong>Nincs pontos legacy licenckapcsolat</strong><span>A kapcsolattartók csak akkor szerkeszthetők, ha a központi licenc <code>legacy_license_ref</code> mezője egy létező legacy licencrekordra mutat. A rendszer nem hoz létre automatikus vagy név alapú kapcsolatot.</span></div>
                      </div>
                    ) : (
                      <>
                        <div className="benjadmin-data-form-grid">
                          <Field label="Elsődleges kapcsolattartó neve"><input value={contactDraft.contactName} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { contactName: event.target.value })} /></Field>
                          <Field label="Elsődleges e-mail"><input type="email" value={contactDraft.contactEmail} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { contactEmail: event.target.value })} /></Field>
                          <Field label="Elsődleges telefon"><input value={contactDraft.contactPhone} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { contactPhone: event.target.value })} /></Field>
                          <Field label="Másodlagos kapcsolattartó neve"><input value={contactDraft.secondaryContactName} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { secondaryContactName: event.target.value })} /></Field>
                          <Field label="Másodlagos e-mail"><input type="email" value={contactDraft.secondaryContactEmail} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { secondaryContactEmail: event.target.value })} /></Field>
                          <Field label="Másodlagos telefon"><input value={contactDraft.secondaryContactPhone} onChange={(event) => updateContactDraft(contactDraft.legacyLicenseId, { secondaryContactPhone: event.target.value })} /></Field>
                        </div>
                        <div className="benjadmin-license-contacts__toolbar"><strong>További értesítési kapcsolattartók</strong><button type="button" className="benjadmin-data-secondary-action" onClick={() => addAdditionalContact(contactDraft.legacyLicenseId)}><Plus size={15} /> Új kapcsolattartó</button></div>
                        <div className="benjadmin-data-mini-table-scroll">
                          <table className="benjadmin-data-mini-table">
                            <thead><tr><th>Név</th><th>Szerepkör</th><th>E-mail</th><th>Telefon</th><th>Értesítés</th><th /></tr></thead>
                            <tbody>
                              {contactDraft.additionalContacts.length ? contactDraft.additionalContacts.map((contact) => (
                                <tr key={contact.id}>
                                  <td><input value={contact.name} onChange={(event) => updateAdditionalContact(contactDraft.legacyLicenseId, contact.id, { name: event.target.value })} /></td>
                                  <td><input value={contact.role} onChange={(event) => updateAdditionalContact(contactDraft.legacyLicenseId, contact.id, { role: event.target.value })} /></td>
                                  <td><input type="email" value={contact.email} onChange={(event) => updateAdditionalContact(contactDraft.legacyLicenseId, contact.id, { email: event.target.value })} /></td>
                                  <td><input value={contact.phone} onChange={(event) => updateAdditionalContact(contactDraft.legacyLicenseId, contact.id, { phone: event.target.value })} /></td>
                                  <td><input type="checkbox" checked={contact.receiveEmail} onChange={(event) => updateAdditionalContact(contactDraft.legacyLicenseId, contact.id, { receiveEmail: event.target.checked })} aria-label={`${contact.name || "Kapcsolattartó"} e-mail értesítése`} /></td>
                                  <td><button type="button" className="benjadmin-data-row-action" onClick={() => removeAdditionalContact(contactDraft.legacyLicenseId, contact.id)} aria-label="Kapcsolattartó eltávolítása"><Trash2 size={15} /></button></td>
                                </tr>
                              )) : <tr><td colSpan={6}>Nincs további kapcsolattartó.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                        <button type="button" className="benjadmin-data-secondary-action is-full" onClick={() => void saveLegacyContacts(selectedLicense)} disabled={busy !== ""}>{busy === `contacts:${selectedLicense.id}` ? <LoaderCircle size={17} className="is-spinning" /> : <Check size={17} />} Kapcsolattartók mentése</button>
                      </>
                    )}
                  </section>

                  <section className="benjadmin-data-form-section benjadmin-license-billing" data-testid="benjadmin-license-billing">
                    <header><strong><CreditCard size={16} /> Előfizetés és számlázási állapot</strong><span>Átmeneti legacy bridge</span></header>
                    <div className="benjadmin-data-security-note benjadmin-license-billing__notice">
                      <CreditCard size={17} />
                      <div>
                        <strong>Adatminimalizált előfizetési nézet</strong>
                        <span>A fizetési szolgáltatói ügyfél- és előfizetés-azonosítók nem kerülnek a böngészőbe. Csak az látható, hogy létezik-e szolgáltatói kapcsolat. A központi Identity Core licenc marad a termék- és csomagadat elsődleges adminisztratív forrása; mentéskor a legacy csomagkód a már mentett központi csomagkódhoz igazodik.</span>
                      </div>
                    </div>
                    {!billingDraft ? (
                      <div className="benjadmin-data-security-note is-warning"><CreditCard size={17} /><div><strong>Nincs pontos legacy előfizetési kapcsolat</strong><span>A számlázási blokk csak létező <code>legacy_license_ref</code> rekordnál szerkeszthető. Automatikus cég- vagy név alapú összerendelés nincs.</span></div></div>
                    ) : (
                      <>
                        <div className="benjadmin-license-billing__summary">
                          <span>Központi csomag<b>{selectedLicense.plan_code || "—"}</b></span>
                          <span>Legacy csomag<b>{billingDraft.planCode || "—"}</b></span>
                          <span>Legacy licencállapot<b>{billingDraft.legacyStatus || "—"}</b></span>
                          <span>Legacy lejárat<b>{displayDate(billingDraft.expiresAt)}</b></span>
                          <span>Fizetési ügyfélkapcsolat<b>{billingDraft.providerCustomerLinked ? "Kapcsolva" : "Nincs kapcsolat"}</b></span>
                          <span>Fizetési előfizetéskapcsolat<b>{billingDraft.providerSubscriptionLinked ? "Kapcsolva" : "Nincs kapcsolat"}</b></span>
                        </div>
                        <div className="benjadmin-license-billing__alignment">
                          <BenjadminStatusPill tone={(selectedLicense.plan_code || "manual") === billingDraft.planCode ? "ok" : "warning"}>{(selectedLicense.plan_code || "manual") === billingDraft.planCode ? "Csomag egyezik" : "Csomag eltérés"}</BenjadminStatusPill>
                          <span>A mentés a legacy csomagkódot a jelenleg mentett központi csomaghoz igazítja; a központi licencet ez a gomb nem módosítja.</span>
                        </div>
                        <div className="benjadmin-data-form-grid">
                          <Field label="Számlázási ciklus"><select value={billingDraft.billingInterval} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { billingInterval: event.target.value as LegacyBillingSummary["billingInterval"] })}>{Object.entries(billingIntervalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                          <Field label="Fizetési állapot"><select value={billingDraft.billingStatus} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { billingStatus: event.target.value as LegacyBillingSummary["billingStatus"] })}>{Object.entries(billingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                          <Field label="Előfizetési mennyiség" hint="A legacy számlázási mennyiség; nem azonos automatikusan a felhasználó- vagy gépkerettel."><input type="number" min={1} value={billingDraft.subscriptionQuantity} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { subscriptionQuantity: Math.max(1, Number(event.target.value) || 1) })} /></Field>
                          <Field label="Aktuális számlázási időszak vége"><input type="date" value={billingDraft.currentPeriodEnd?.slice(0, 10) || ""} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { currentPeriodEnd: event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : "" })} /></Field>
                          <Field label="Inaktív gép automatikus felszabadítása"><select value={billingDraft.autoReleaseInactiveDevices ? "yes" : "no"} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { autoReleaseInactiveDevices: event.target.value === "yes" })}><option value="no">Kikapcsolva</option><option value="yes">Bekapcsolva</option></select></Field>
                          <Field label="Felszabadítási küszöb (nap)" hint="Csak bekapcsolt automatikus felszabadításnál releváns."><input type="number" min={1} value={billingDraft.inactiveReleaseDays} onChange={(event) => updateBillingDraft(billingDraft.legacyLicenseId, { inactiveReleaseDays: Math.max(1, Number(event.target.value) || 1) })} /></Field>
                        </div>
                        <button type="button" className="benjadmin-data-secondary-action is-full" onClick={() => void saveLegacyBilling(selectedLicense)} disabled={busy !== ""}>{busy === `billing:${selectedLicense.id}` ? <LoaderCircle size={17} className="is-spinning" /> : <Check size={17} />} Előfizetési adatok mentése</button>
                      </>
                    )}
                  </section>

                  <section className="benjadmin-data-form-section benjadmin-license-devices" data-testid="benjadmin-license-devices">
                    <header><strong><Laptop size={16} /> Gépkötések és aktivált eszközök</strong><span>{licenseDevices.length} / {selectedLicense.max_devices}</span></header>
                    <div className="benjadmin-data-security-note benjadmin-license-devices__notice">
                      <Laptop size={17} />
                      <div>
                        <strong>Biztonságos gépkötési nézet</strong>
                        <span>A teljes <code>machineIdHash</code> nem kerül a böngészőbe; csak rövid, maszkolt gépazonosító látható. A metaadat, tiltás/aktiválás és felszabadítás a meglévő legacy licencmotoron keresztül történik, auditálva. A státuszváltás és felszabadítás a meglévő licencváltozás-értesítési szabályokat is követheti.</span>
                      </div>
                    </div>
                    {!selectedLicense.legacy_license_ref ? (
                      <div className="benjadmin-data-security-note is-warning"><Ban size={17} /><div><strong>Nincs legacy licenckapcsolat</strong><span>Gépkötés csak pontos <code>legacy_license_ref</code> kapcsolat mellett kezelhető.</span></div></div>
                    ) : licenseDevices.length === 0 ? (
                      <div className="benjadmin-license-devices__empty">Ehhez a licenchez jelenleg nincs aktivált legacy gép.</div>
                    ) : (
                      <div className="benjadmin-data-mini-table-scroll">
                        <table className="benjadmin-data-mini-table">
                          <thead><tr><th>Gép</th><th>Használó</th><th>Szervezeti egység</th><th>Megjegyzés</th><th>Alkalmazás</th><th>Aktiválva</th><th>Utolsó ellenőrzés</th><th>Státusz</th><th>Művelet</th></tr></thead>
                          <tbody>{licenseDevices.map((device) => {
                            const deviceDraft = deviceDrafts[device.deviceId] || device;
                            return (
                              <tr key={device.deviceId}>
                                <td className="is-mono">{device.machineHint}</td>
                                <td><input value={deviceDraft.userName} onChange={(event) => updateDeviceDraft(device.deviceId, { userName: event.target.value })} placeholder="Felhasználó" /></td>
                                <td><input value={deviceDraft.organizationUnit} onChange={(event) => updateDeviceDraft(device.deviceId, { organizationUnit: event.target.value })} placeholder="Szervezeti egység" /></td>
                                <td><input value={deviceDraft.note} onChange={(event) => updateDeviceDraft(device.deviceId, { note: event.target.value })} placeholder="Megjegyzés" /></td>
                                <td className="is-mono">{device.appId}</td>
                                <td>{displayDate(device.firstActivatedAt)}</td>
                                <td>{displayDate(device.lastOnlineCheckAt)}</td>
                                <td><BenjadminStatusPill tone={device.status === "active" ? "ok" : "danger"}>{device.status === "active" ? "Aktív" : "Tiltott"}</BenjadminStatusPill></td>
                                <td><div className="benjadmin-license-devices__actions">
                                  <button type="button" className="benjadmin-data-row-action" disabled={busy !== ""} onClick={() => void runDeviceAction(selectedLicense, device, "updateMeta")} title="Gépadatok mentése"><Check size={15} /></button>
                                  <button type="button" className="benjadmin-data-row-action" disabled={busy !== ""} onClick={() => { const next = device.status === "active" ? "blocked" : "active"; if (window.confirm(`Biztosan ${next === "blocked" ? "letiltod" : "aktiválod"} ezt a gépkötést?`)) void runDeviceAction(selectedLicense, device, "setStatus", next); }} title={device.status === "active" ? "Gép tiltása" : "Gép aktiválása"}><Ban size={15} /></button>
                                  <button type="button" className="benjadmin-data-row-action is-danger" disabled={busy !== ""} onClick={() => { if (window.confirm("Biztosan felszabadítod ezt a gépkötést? A művelet eltávolítja a legacy aktiválást.")) void runDeviceAction(selectedLicense, device, "remove"); }} title="Gépkötés felszabadítása"><Trash2 size={15} /></button>
                                </div></td>
                              </tr>
                            );
                          })}</tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {selectedLicense.owner_type === "organization" && selectedLicense.owner_organization_id && organization ? (
                    <section className="benjadmin-data-form-section is-embedded">
                      <header><strong>Szervezeti felhasználók</strong><span>{selectedLicense.max_users} licenchely</span></header>
                      <OrganizationLicenseMembers adminKey={adminKey} licenseId={selectedLicense.id} organizationId={selectedLicense.owner_organization_id} organizationName={organization.display_name || organization.legal_name} maxUsers={selectedLicense.max_users} maxDevices={selectedLicense.max_devices} users={users} memberships={memberships} licenseModules={modules} membershipModules={membershipModules} invitations={organizationInvitations} onChanged={() => load(adminKey)} />
                    </section>
                  ) : null}

                  <section className="benjadmin-data-form-section">
                    <header><strong>Új Send-jogosultság (entitlement)</strong><span>{licenseEntitlements.length} meglévő</span></header>
                    {createdCode ? <div className="benjadmin-data-created-code"><span>Létrehozott Send-kód</span><strong>{createdCode}</strong><small>A nyers kód később nem olvasható vissza.</small></div> : null}
                    <div className="benjadmin-data-form-grid">
                      <Field label="Saját Send-kód"><input value={send.sendCode} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, sendCode: formatAdminSendInput(event.target.value) } }))} placeholder="HAGE-123-456" /></Field>
                      <Field label="Felhasználó"><select value={send.userId} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, userId: event.target.value } }))}><option value="">Válasszon</option>{allowedUsers.map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}</select></Field>
                      <Field label="Címzettmód"><select value={send.recipientMode} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, recipientMode: event.target.value as DropSendRecipientMode } }))}><option value="locked_default">Zárolt alapcímzett</option><option value="approved_list">Jóváhagyott lista</option><option value="free_entry">Szabad címzett</option></select></Field>
                      <Field label="Lejárat"><input type="date" value={send.expiresAt} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, expiresAt: event.target.value } }))} /></Field>
                      {send.recipientMode !== "free_entry" ? <><Field label="Címzett neve"><input value={send.recipientName} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, recipientName: event.target.value } }))} /></Field><Field label="Címzett e-mail"><input type="email" value={send.recipientEmail} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, recipientEmail: event.target.value } }))} /></Field><Field label="Címzett szervezete"><input value={send.recipientOrganization} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, recipientOrganization: event.target.value } }))} /></Field></> : null}
                      <Field label="Csomaglimit MB"><input type="number" min={1} value={send.maxPackageSizeMb} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, maxPackageSizeMb: Number(event.target.value) } }))} /></Field>
                      <Field label="Max. címzett"><input type="number" min={1} max={100} value={send.maxRecipients} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, maxRecipients: Math.max(1, Math.min(100, Number(event.target.value) || 1)) } }))} /></Field>
                      <Field label="Havi Send-limit"><input type="number" min={1} value={send.monthlySendLimit} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, monthlySendLimit: event.target.value } }))} placeholder="Korlátlan" /></Field>
                    </div>
                    <div className="benjadmin-data-check-grid">
                      {[["canUseStandardSend", "Normál Send"], ["canUseQuickImageSend", "Gyors KépSend"], ["canUseImageGroups", "Képcsoportok"], ["canUseFileComments", "Megjegyzések"], ["canUseProjectDrop", "Projekt Beérkező Drop"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(send[key as keyof SendDraft])} onChange={(event) => setSendDrafts((current) => ({ ...current, [selectedLicense.id]: { ...send, [key]: event.target.checked } }))} />{label}</label>)}
                    </div>
                    <button type="button" className="benjadmin-data-secondary-action is-full" onClick={() => void createSend(selectedLicense)} disabled={busy !== "" || !send.userId || !sendCodeReady(send.sendCode) || (send.recipientMode !== "free_entry" && (!send.recipientName || !send.recipientEmail))}>{busy === `send:${selectedLicense.id}` ? <LoaderCircle size={17} className="is-spinning" /> : <Check size={17} />} Saját Send-kód aktiválása</button>

                    {licenseEntitlements.length ? (
                      <div className="benjadmin-data-mini-table-scroll"><table className="benjadmin-data-mini-table"><thead><tr><th>Kód</th><th>Felhasználó</th><th>Státusz</th><th>Használat</th><th>Lejárat</th></tr></thead><tbody>{licenseEntitlements.map((entitlement) => <tr key={entitlement.id}><td className="is-mono">{entitlement.code_hint || "••••-•••-•••"}</td><td>{users.find((user) => user.id === entitlement.user_id)?.full_name || entitlement.user_id}</td><td>{entitlement.status}</td><td>{entitlement.current_month_send_count}/{entitlement.monthly_send_limit ?? "∞"}</td><td>{displayDate(entitlement.expires_at)}</td></tr>)}</tbody></table></div>
                    ) : null}
                  </section>
                </>
              );
            })() : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
