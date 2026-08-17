"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DropPublicStoreMigrationPanel from "./DropPublicStoreMigrationPanel";
import DropEmailClientValidationPanel from "./DropEmailClientValidationPanel";
import DropPrivatePilotValidationPanel from "./DropPrivatePilotValidationPanel";
import {
  Activity,
  ArrowLeft,
  Building2,
  Check,
  Clipboard,
  ExternalLink,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { DropSendRecipientMode } from "@/app/lib/drop/public/dropPublicTypes";
import { formatDropSendCode, normalizeDropSendCode } from "@/app/lib/drop/public/dropSendCodeFormat";
import { formatDimproLicenseCodeInput, isValidDimproLicenseCode, normalizeDimproLicenseCodeInput } from "@/app/lib/identity-core/licenseCode";

type AuthState = "checking" | "authorized" | "blocked";
type IdentityUser = {
  id: string;
  public_user_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  email_verified_at: string | null;
};
type IdentityMembership = {
  id: string;
  user_id: string;
  organization_id: string;
  role_code: string;
  status: string;
  access_ends_at: string | null;
  is_primary: boolean;
};
type IdentityOrganization = {
  id: string;
  public_organization_code: string;
  display_name: string;
  legal_name: string;
  status: string;
};
type IdentityLicense = {
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
};
type IdentityLicenseModule = {
  id: string;
  license_id: string;
  module_code: string;
  enabled: boolean;
  limits?: Record<string, unknown> | null;
  valid_from?: string | null;
  valid_until?: string | null;
};
type IdentityEntitlement = {
  id: string;
  user_id: string;
  license_id: string;
  organization_id: string | null;
  code_hint: string | null;
  status: string;
  valid_from: string;
  expires_at: string | null;
  can_use_standard_send: boolean;
  can_use_quick_image_send: boolean;
  can_use_image_groups: boolean;
  can_use_file_comments: boolean;
  can_use_project_drop: boolean;
  recipient_mode: DropSendRecipientMode;
  default_recipient_id: string | null;
  max_recipients: number;
  max_saved_contacts: number;
  upload_rules_acceptance_count: number;
  upload_rules_version: string | null;
  max_package_size_bytes: number;
  monthly_send_limit: number | null;
  current_month_send_count: number;
  last_used_at: string | null;
};
type IdentityRecipient = {
  id: string;
  entitlement_id: string;
  recipient_name: string;
  recipient_email: string;
  organization_name: string | null;
  label: string | null;
  is_default: boolean;
  is_locked: boolean;
  active: boolean;
};
type LegacySendCode = {
  id: string;
  label: string;
  code_hint: string;
  status: string;
  expires_at: string;
  created_at: string;
  dimpro_send_entitlement_id: string | null;
};
type GateRecipient = { id?: string; name: string; email: string; label?: string; company?: string; projectRole?: string };
type Gate = {
  id: string;
  slug: string;
  type: "personal" | "project" | "organization";
  title: string;
  description: string;
  status: "active" | "revoked" | "expired";
  recipients: GateRecipient[];
  projectId?: string | null;
  projectName?: string | null;
  targetFolder?: string | null;
  retentionDays: number;
  allowPackageComment: boolean;
  allowFileComments: boolean;
  downloadProtection: "link" | "link_pin";
  expiresAt: string;
};
type EntitlementForm = {
  sendCode: string;
  userId: string;
  licenseId: string;
  recipientMode: DropSendRecipientMode;
  defaultRecipientName: string;
  defaultRecipientEmail: string;
  defaultRecipientOrganization: string;
  approvedRecipientsText: string;
  expiresAt: string;
  maxRecipients: number;
  maxSavedContacts: number;
  maxPackageSizeMb: number;
  monthlySendLimit: string;
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseImageGroups: boolean;
  canUseFileComments: boolean;
  canUseProjectDrop: boolean;
};
type InlineUserDraft = {
  fullName: string;
  email: string;
  licenseId: string;
  roleCode: "member" | "manager" | "admin";
  moduleCodes: string[];
};
type InlineLicenseDraft = {
  publicLicenseCode: string;
  productCode: string;
  planCode: string;
  status: "active" | "trial";
  activatedAt: string;
  expiresAt: string;
  maxDevices: number;
  enableQuickVoiceNote: boolean;
};
type GateForm = {
  type: Gate["type"];
  title: string;
  slug: string;
  description: string;
  recipientsText: string;
  projectId: string;
  projectName: string;
  targetFolder: string;
  retentionDays: number;
  downloadProtection: "link" | "link_pin";
  allowPackageComment: boolean;
  allowFileComments: boolean;
  expiresAt: string;
};

function dateInput(days: number) { return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10); }
const initialEntitlementForm: EntitlementForm = {
  sendCode: "",
  userId: "",
  licenseId: "",
  recipientMode: "locked_default",
  defaultRecipientName: "",
  defaultRecipientEmail: "",
  defaultRecipientOrganization: "",
  approvedRecipientsText: "",
  expiresAt: dateInput(180),
  maxRecipients: 6,
  maxSavedContacts: 10,
  maxPackageSizeMb: 250,
  monthlySendLimit: "",
  canUseStandardSend: true,
  canUseQuickImageSend: true,
  canUseImageGroups: true,
  canUseFileComments: true,
  canUseProjectDrop: false,
};
const initialGateForm: GateForm = {
  type: "personal", title: "", slug: "", description: "", recipientsText: "", projectId: "", projectName: "", targetFolder: "",
  retentionDays: 5, downloadProtection: "link_pin", allowPackageComment: true, allowFileComments: true, expiresAt: dateInput(90),
};
const initialInlineUserDraft = (): InlineUserDraft => ({
  fullName: "",
  email: "",
  licenseId: "",
  roleCode: "member",
  moduleCodes: [],
});
const initialInlineLicenseDraft = (): InlineLicenseDraft => ({
  publicLicenseCode: "",
  productCode: "DIMPRO_DROP",
  planCode: "SEND",
  status: "active",
  activatedAt: new Date().toISOString().slice(0, 10),
  expiresAt: dateInput(365),
  maxDevices: 1,
  enableQuickVoiceNote: true,
});
function formatAdminSendInput(value: string) {
  const compact = normalizeDropSendCode(value);
  const letters = compact.slice(0, 4).replace(/[^A-Z]/g, "");
  const digits = compact.slice(4).replace(/\D/g, "").slice(0, 6);
  return formatDropSendCode(`${letters}${digits}`);
}
function sendCodeReady(value: string) { return /^[A-Z]{4}-\d{3}-\d{3}$/.test(formatAdminSendInput(value)); }
function identityLicenseUsable(license: IdentityLicense) {
  if (!["active", "trial"].includes(license.status)) return false;
  const now = Date.now();
  if (license.activated_at && new Date(license.activated_at).getTime() > now) return false;
  if (license.expires_at && new Date(license.expires_at).getTime() < now) return false;
  return true;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";

function parseGateRecipients(value: string): GateRecipient[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = "", email = "", label = "", company = ""] = line.split("|").map((part) => part.trim());
    return { name, email, label, company };
  }).filter((item) => item.name && item.email);
}
function parseApprovedRecipients(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = "", email = "", organizationName = "", label = ""] = line.split("|").map((part) => part.trim());
    return { name, email, organizationName: organizationName || null, label: label || null, isDefault: false, locked: false };
  }).filter((item) => item.name && validEmail(item.email));
}
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"]; let current = value; let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} ${units[index]}`;
}
function formatDate(value: string | null | undefined) {
  if (!value) return "Nincs lejárat";
  return new Date(value).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
}
function recipientModeLabel(value: DropSendRecipientMode) {
  return value === "locked_default" ? "Zárolt alapcímzett" : value === "approved_list" ? "Jóváhagyott lista" : "Szabad címzett";
}
function identityModuleLabel(code: string) {
  return ({
    HAGE_WORKSPACE: "HAGE-INVEST Munkatér",
    TASKS: "Feladatok",
    VACATIONS: "Szabadságok",
    AI_ASSISTANT: "AI asszisztens",
    DRIVE: "DIMPRO Drive",
    MEETING_ASSISTANT: "Értekezleti asszisztens",
    DROP_SEND: "Normál Send",
    DROP_QUICK_IMAGE_SEND: "Gyors KépSend",
    DROP_PROJECT_INBOX: "Projekt Beérkező Drop",
    DROP_QUICK_VOICE_NOTE: "Hangos megjegyzés",
  } as Record<string, string>)[code] || code;
}
function identityRoleLabel(code: InlineUserDraft["roleCode"]) {
  return code === "admin" ? "Szervezeti admin" : code === "manager" ? "Vezető / projektvezető" : "Munkatárs";
}

export default function DropPublicWorkflowManager() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [adminKey, setAdminKey] = useState("");
  const [users, setUsers] = useState<IdentityUser[]>([]);
  const [organizations, setOrganizations] = useState<IdentityOrganization[]>([]);
  const [memberships, setMemberships] = useState<IdentityMembership[]>([]);
  const [licenses, setLicenses] = useState<IdentityLicense[]>([]);
  const [licenseModules, setLicenseModules] = useState<IdentityLicenseModule[]>([]);
  const [entitlements, setEntitlements] = useState<IdentityEntitlement[]>([]);
  const [identityRecipients, setIdentityRecipients] = useState<IdentityRecipient[]>([]);
  const [legacyCodes, setLegacyCodes] = useState<LegacySendCode[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [entitlementForm, setEntitlementForm] = useState<EntitlementForm>(initialEntitlementForm);
  const [showInlineUserCreator, setShowInlineUserCreator] = useState(false);
  const [inlineUserDraft, setInlineUserDraft] = useState<InlineUserDraft>(() => initialInlineUserDraft());
  const [showInlineLicenseCreator, setShowInlineLicenseCreator] = useState(false);
  const [inlineLicenseDraft, setInlineLicenseDraft] = useState<InlineLicenseDraft>(() => initialInlineLicenseDraft());
  const [gateForm, setGateForm] = useState<GateForm>(initialGateForm);
  const [createdCode, setCreatedCode] = useState("");
  const [createdInvitationUrl, setCreatedInvitationUrl] = useState("");
  const [createdGateUrl, setCreatedGateUrl] = useState("");
  const [legacyTarget, setLegacyTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Licencadmin jogosultság ellenőrzése…");
  const [copied, setCopied] = useState("");
  const headers = useMemo(() => ({ "content-type": "application/json", "x-dimpro-license-admin-key": adminKey }), [adminKey]);

  const eligibleLicenses = useMemo(() => {
    if (!entitlementForm.userId) return [];
    const organizationIds = new Set(memberships.filter((membership) => membership.user_id === entitlementForm.userId && membership.status === "active").map((membership) => membership.organization_id));
    return licenses.filter((license) => identityLicenseUsable(license) && (
      license.owner_user_id === entitlementForm.userId
      || Boolean(license.owner_organization_id && organizationIds.has(license.owner_organization_id))
    ));
  }, [entitlementForm.userId, licenses, memberships]);

  const organizationLicenses = useMemo(() => licenses.filter((license) => identityLicenseUsable(license) && license.owner_type === "organization" && Boolean(license.owner_organization_id)), [licenses]);
  const inlineInvitationModules = useMemo(() => licenseModules.filter((module) =>
    module.license_id === inlineUserDraft.licenseId && module.enabled,
  ), [inlineUserDraft.licenseId, licenseModules]);

  const selectedVoiceLicenseModule = useMemo(() => licenseModules.find((module) =>
    module.license_id === entitlementForm.licenseId
      && module.module_code === "DROP_QUICK_VOICE_NOTE"
      && module.enabled,
  ) || null, [entitlementForm.licenseId, licenseModules]);

  const loadData = useCallback(async (key: string) => {
    const requestHeaders = { "x-dimpro-license-admin-key": key };
    const [identityResponse, gateResponse] = await Promise.all([
      fetch("/api/dimpro-identity/admin/send-entitlements", { headers: requestHeaders, cache: "no-store" }),
      fetch("/api/drop/admin/public/submission-gates", { headers: requestHeaders, cache: "no-store" }),
    ]);
    const [identityPayload, gatePayload] = await Promise.all([identityResponse.json(), gateResponse.json()]);
    if (!identityResponse.ok) throw new Error(identityPayload.error || "A központi Send-jogosultságok nem tölthetők be.");
    if (!gateResponse.ok) throw new Error(gatePayload.error || "A Beküldőkapuk nem tölthetők be.");
    const nextUsers = Array.isArray(identityPayload.users) ? identityPayload.users as IdentityUser[] : [];
    setUsers(nextUsers);
    setOrganizations(Array.isArray(identityPayload.organizations) ? identityPayload.organizations : []);
    setMemberships(Array.isArray(identityPayload.organizationMemberships) ? identityPayload.organizationMemberships : []);
    setLicenses(Array.isArray(identityPayload.licenses) ? identityPayload.licenses : []);
    setLicenseModules(Array.isArray(identityPayload.licenseModules) ? identityPayload.licenseModules : []);
    setEntitlements(Array.isArray(identityPayload.entitlements) ? identityPayload.entitlements : []);
    setIdentityRecipients(Array.isArray(identityPayload.recipients) ? identityPayload.recipients : []);
    setLegacyCodes(Array.isArray(identityPayload.legacySendCodes) ? identityPayload.legacySendCodes : []);
    setGates(Array.isArray(gatePayload.gates) ? gatePayload.gates : []);
    setEntitlementForm((current) => current.userId || !nextUsers.length ? current : { ...current, userId: nextUsers.find((user) => user.status === "active" && user.email_verified_at)?.id || nextUsers[0].id });
  }, []);

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) { setAuthState("blocked"); setMessage("Nincs aktív licencadmin munkamenet."); return; }
    setAdminKey(key);
    try {
      await loadData(key);
      setAuthState("authorized");
      setMessage("A DIMPRO Send most a központi Identity Core felhasználó-, licenc- és jogosultsági adatait kezeli.");
    } catch (error) {
      setAuthState("blocked");
      setMessage(error instanceof Error ? error.message : "A kezelőközpont nem tölthető be.");
    }
  }, [loadData]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!entitlementForm.userId) return;
    const organizationIds = new Set(memberships.filter((membership) => membership.user_id === entitlementForm.userId && membership.status === "active").map((membership) => membership.organization_id));
    const options = licenses.filter((license) => identityLicenseUsable(license) && (license.owner_user_id === entitlementForm.userId || Boolean(license.owner_organization_id && organizationIds.has(license.owner_organization_id))));
    if (!options.some((license) => license.id === entitlementForm.licenseId)) {
      setEntitlementForm((old) => ({ ...old, licenseId: options[0]?.id || "" }));
    }
  }, [entitlementForm.userId, entitlementForm.licenseId, licenses, memberships]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value); setCopied(value); window.setTimeout(() => setCopied(""), 1800);
  }

  const defaultRecipientReady = entitlementForm.recipientMode !== "locked_default"
    || (entitlementForm.defaultRecipientName.trim().length >= 2 && validEmail(entitlementForm.defaultRecipientEmail));
  const approvedListReady = entitlementForm.recipientMode !== "approved_list"
    || parseApprovedRecipients(entitlementForm.approvedRecipientsText).length > 0
    || (entitlementForm.defaultRecipientName.trim().length >= 2 && validEmail(entitlementForm.defaultRecipientEmail));
  const entitlementFormReady = Boolean(
    sendCodeReady(entitlementForm.sendCode) && entitlementForm.userId && entitlementForm.licenseId && defaultRecipientReady && approvedListReady
    && (entitlementForm.canUseStandardSend || entitlementForm.canUseQuickImageSend || entitlementForm.canUseProjectDrop),
  );

  function toggleInlineUserCreator() {
    const next = !showInlineUserCreator;
    if (next && !inlineUserDraft.licenseId) {
      const licenseId = organizationLicenses[0]?.id || "";
      const moduleCodes = licenseModules.filter((module) => module.license_id === licenseId && module.enabled).map((module) => module.module_code);
      setInlineUserDraft((current) => ({ ...current, licenseId, moduleCodes }));
    }
    if (next) { setCreatedInvitationUrl(""); setMessage(""); }
    setShowInlineUserCreator(next);
  }

  function toggleInlineInvitationModule(moduleCode: string) {
    setInlineUserDraft((current) => ({
      ...current,
      moduleCodes: current.moduleCodes.includes(moduleCode)
        ? current.moduleCodes.filter((code) => code !== moduleCode)
        : [...current.moduleCodes, moduleCode],
    }));
  }

  async function createInlineUser() {
    if (busy || inlineUserDraft.fullName.trim().length < 2 || !validEmail(inlineUserDraft.email) || !inlineUserDraft.licenseId || !inlineUserDraft.moduleCodes.length) return;
    setBusy("user:invite"); setMessage(""); setCreatedInvitationUrl("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/organization-invitations", {
        method: "POST", headers,
        body: JSON.stringify({
          licenseId: inlineUserDraft.licenseId,
          fullName: inlineUserDraft.fullName.trim(),
          email: inlineUserDraft.email.trim(),
          roleCode: inlineUserDraft.roleCode,
          roleLabel: identityRoleLabel(inlineUserDraft.roleCode),
          moduleCodes: inlineUserDraft.moduleCodes,
        }),
      });
      const payload = await response.json() as {
        invitation?: { userId?: string; activeMemberOnboarding?: boolean };
        invitationUrl?: string;
        emailDelivery?: { sent?: boolean; messageId?: string; error?: string };
        note?: string;
        error?: string;
      };
      if (!response.ok || !payload.invitation?.userId) throw new Error(payload.error || "A szervezeti meghívás nem hozható létre.");
      setCreatedInvitationUrl(payload.invitationUrl || "");
      const existingActiveUser = users.find((user) => user.id === payload.invitation?.userId && user.status === "active" && user.email_verified_at);
      if (existingActiveUser) {
        setEntitlementForm((old) => ({ ...old, userId: existingActiveUser.id, licenseId: inlineUserDraft.licenseId }));
      }
      const delivery = payload.emailDelivery?.sent
        ? "A meghívó e-mail elküldve."
        : `A meghívó létrejött, de az e-mail nem ment ki${payload.emailDelivery?.error ? `: ${payload.emailDelivery.error}` : "."}`;
      const onboarding = payload.invitation.activeMemberOnboarding ? " A meglévő HAGE-tagság megmaradt; ez belépési/onboarding meghívó." : "";
      setMessage(`${payload.note || delivery}${onboarding} ${existingActiveUser ? "A felhasználó kiválasztva; a Send entitlement most létrehozható." : "Az új felhasználó a meghívás elfogadása után választható ki Send entitlementhez."}`);
      setInlineUserDraft(initialInlineUserDraft());
      setShowInlineUserCreator(false);
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A szervezeti meghívás sikertelen."); }
    finally { setBusy(""); }
  }

  async function createInlineLicense() {
    if (busy || !entitlementForm.userId || !isValidDimproLicenseCode(inlineLicenseDraft.publicLicenseCode)) return;
    setBusy("license:create"); setMessage("");
    try {
      const modules = [
        entitlementForm.canUseStandardSend ? { moduleCode: "DROP_SEND", enabled: true } : null,
        entitlementForm.canUseQuickImageSend ? { moduleCode: "DROP_QUICK_IMAGE_SEND", enabled: true } : null,
        entitlementForm.canUseProjectDrop ? { moduleCode: "DROP_PROJECT_INBOX", enabled: true } : null,
        inlineLicenseDraft.enableQuickVoiceNote ? { moduleCode: "DROP_QUICK_VOICE_NOTE", enabled: true, limits: { maxSecondsPerNote: 60 } } : null,
      ].filter(Boolean);
      const response = await fetch("/api/dimpro-identity/admin/licenses", {
        method: "POST", headers,
        body: JSON.stringify({
          publicLicenseCode: inlineLicenseDraft.publicLicenseCode,
          ownerType: "user",
          ownerUserId: entitlementForm.userId,
          ownerOrganizationId: null,
          productCode: inlineLicenseDraft.productCode,
          planCode: inlineLicenseDraft.planCode,
          status: inlineLicenseDraft.status,
          activatedAt: new Date(`${inlineLicenseDraft.activatedAt}T00:00:00`).toISOString(),
          expiresAt: new Date(`${inlineLicenseDraft.expiresAt}T23:59:59`).toISOString(),
          maxDevices: inlineLicenseDraft.maxDevices,
          modules,
        }),
      });
      const payload = await response.json() as { license?: IdentityLicense; error?: string };
      if (!response.ok || !payload.license?.id) throw new Error(payload.error || "A központi licenc nem hozható létre.");
      await loadData(adminKey);
      setEntitlementForm((old) => ({ ...old, licenseId: payload.license!.id }));
      setInlineLicenseDraft(initialInlineLicenseDraft());
      setShowInlineLicenseCreator(false);
      setMessage(`Központi licenc létrehozva és kiválasztva: ${payload.license.public_license_code}. Most adja meg a Send-kódot és hozza létre az entitlementet.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A központi licenc létrehozása sikertelen."); }
    finally { setBusy(""); }
  }

  async function createEntitlement() {
    if (busy || !entitlementFormReady) return;
    setBusy("entitlement:create"); setMessage(""); setCreatedCode("");
    const recipients = parseApprovedRecipients(entitlementForm.approvedRecipientsText);
    if (validEmail(entitlementForm.defaultRecipientEmail) && entitlementForm.defaultRecipientName.trim().length >= 2) {
      recipients.unshift({
        name: entitlementForm.defaultRecipientName.trim(),
        email: entitlementForm.defaultRecipientEmail.trim(),
        organizationName: entitlementForm.defaultRecipientOrganization.trim() || null,
        label: "Alapértelmezett címzett",
        isDefault: true,
        locked: entitlementForm.recipientMode === "locked_default",
      });
    }
    try {
      const response = await fetch("/api/dimpro-identity/admin/send-entitlements", {
        method: "POST", headers,
        body: JSON.stringify({
          sendCode: formatAdminSendInput(entitlementForm.sendCode),
          userId: entitlementForm.userId,
          licenseId: entitlementForm.licenseId,
          recipientMode: entitlementForm.recipientMode,
          recipients,
          expiresAt: new Date(`${entitlementForm.expiresAt}T23:59:59`).toISOString(),
          maxRecipients: entitlementForm.maxRecipients,
          maxSavedContacts: entitlementForm.maxSavedContacts,
          maxPackageSizeBytes: Math.round(entitlementForm.maxPackageSizeMb * 1024 * 1024),
          monthlySendLimit: entitlementForm.monthlySendLimit ? Number(entitlementForm.monthlySendLimit) : null,
          canUseStandardSend: entitlementForm.canUseStandardSend,
          canUseQuickImageSend: entitlementForm.canUseQuickImageSend,
          canUseImageGroups: entitlementForm.canUseImageGroups,
          canUseFileComments: entitlementForm.canUseFileComments,
          canUseProjectDrop: entitlementForm.canUseProjectDrop,
          grantMembershipModules: true,
        }),
      });
      const payload = await response.json() as {
        created?: { formattedCode?: string; rawCode?: string };
        emailDelivery?: { sent?: boolean; to?: string; messageId?: string; error?: string; auditError?: string };
        error?: string;
      };
      if (!response.ok || !payload.created?.formattedCode) throw new Error(payload.error || "A központi Send-jogosultság nem hozható létre.");
      setCreatedCode(payload.created.formattedCode);
      const selectedUser = entitlementForm.userId;
      setEntitlementForm({ ...initialEntitlementForm, userId: selectedUser });
      const deliveryMessage = payload.emailDelivery?.sent
        ? ` A saját Send-kód e-mail elküldve: ${payload.emailDelivery.to || "a felhasználó e-mail-címére"}.`
        : ` A Send-kód e-mail nem ment ki${payload.emailDelivery?.error ? `: ${payload.emailDelivery.error}` : "."} A kód most kézzel is átmásolható.`;
      setMessage(`A központi Send entitlement elkészült.${deliveryMessage} A teljes kód csak most olvasható; az adatbázis HMAC-lenyomatot tárol.`);
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A Send-jogosultság létrehozása sikertelen."); }
    finally { setBusy(""); }
  }

  async function updateEntitlement(id: string, status: "active" | "suspended" | "revoked") {
    if (busy) return; setBusy(`entitlement:${id}`);
    try {
      const response = await fetch("/api/dimpro-identity/admin/send-entitlements", { method: "PATCH", headers, body: JSON.stringify({ entitlementId: id, status }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A központi Send-jogosultság állapota nem módosítható.");
      setMessage(status === "active" ? "A Send entitlement ismét aktív." : status === "suspended" ? "A Send entitlement felfüggesztve." : "A Send entitlement visszavonva.");
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A jogosultság módosítása sikertelen."); }
    finally { setBusy(""); }
  }

  async function rotateEntitlementCode(id: string, userName: string) {
    if (busy) return;
    if (!window.confirm(`${userName}: biztosan új Send-kódot generál és e-mailben elküldi? A korábbi kód azonnal érvényét veszti.`)) return;
    setBusy(`entitlement:rotate:${id}`); setMessage(""); setCreatedCode("");
    try {
      const response = await fetch("/api/dimpro-identity/admin/send-entitlements", {
        method: "POST", headers, body: JSON.stringify({ action: "rotateCode", entitlementId: id }),
      });
      const payload = await response.json() as {
        rotated?: { formattedCode?: string };
        emailDelivery?: { sent?: boolean; to?: string; messageId?: string; error?: string; auditError?: string };
        error?: string;
      };
      if (!response.ok || !payload.rotated?.formattedCode) throw new Error(payload.error || "Az új Send-kód nem hozható létre.");
      setCreatedCode(payload.rotated.formattedCode);
      if (payload.emailDelivery?.sent) {
        setMessage(`Új Send-kód létrehozva és e-mailben elküldve: ${payload.emailDelivery.to || userName}. A korábbi kód érvénytelen.`);
      } else {
        setMessage(`Új Send-kód létrejött, de az e-mail nem ment ki${payload.emailDelivery?.error ? `: ${payload.emailDelivery.error}` : "."} A kód most egyszer megjelenik, kézzel átmásolható.`);
      }
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A Send-kód cseréje sikertelen."); }
    finally { setBusy(""); }
  }

  async function linkLegacy(legacyId: string) {
    const entitlementId = legacyTarget[legacyId];
    if (!entitlementId || busy) return;
    setBusy(`legacy:${legacyId}`);
    try {
      const response = await fetch("/api/dimpro-identity/admin/send-entitlements", {
        method: "POST", headers,
        body: JSON.stringify({ action: "linkLegacy", legacySendCodeId: legacyId, entitlementId, revokeLegacy: true, actor: "DIMPRO licencadmin" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A legacy Send-kód nem vezethető át.");
      setMessage("A legacy Send-kód auditáltan a kiválasztott központi entitlementhez kapcsolódott és visszavonásra került.");
      setLegacyTarget((old) => ({ ...old, [legacyId]: "" }));
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A legacy átvezetés sikertelen."); }
    finally { setBusy(""); }
  }

  async function createGate() {
    if (busy) return; setBusy("gate:create"); setMessage(""); setCreatedGateUrl("");
    try {
      const response = await fetch("/api/drop/admin/public/submission-gates", {
        method: "POST", headers,
        body: JSON.stringify({ ...gateForm, expiresAt: new Date(`${gateForm.expiresAt}T23:59:59`).toISOString(), recipients: parseGateRecipients(gateForm.recipientsText), requireSenderEmail: true }),
      });
      const payload = await response.json() as { publicUrl?: string; error?: string };
      if (!response.ok || !payload.publicUrl) throw new Error(payload.error || "A Beküldőkapu nem hozható létre.");
      setCreatedGateUrl(payload.publicUrl); setGateForm(initialGateForm); setMessage("A Beküldőkapu elkészült. A link azonnal használható.");
      await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A Beküldőkapu létrehozása sikertelen."); }
    finally { setBusy(""); }
  }
  async function updateGate(id: string, status: "active" | "revoked") {
    if (busy) return; setBusy(`gate:${id}`);
    try {
      const response = await fetch("/api/drop/admin/public/submission-gates", { method: "PATCH", headers, body: JSON.stringify({ id, status }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A Beküldőkapu állapota nem módosítható.");
      setMessage(status === "revoked" ? "A Beküldőkapu lezárva." : "A Beküldőkapu ismét aktív."); await loadData(adminKey);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A kapumódosítás sikertelen."); }
    finally { setBusy(""); }
  }

  if (authState !== "authorized") {
    return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white"><section className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8"><ShieldCheck className="text-cyan-300" size={34}/><h1 className="mt-5 text-3xl font-black">{authState === "checking" ? "Jogosultság ellenőrzése" : "Licencadmin belépés szükséges"}</h1><p className="mt-4 text-sm leading-7 text-slate-300">{message}</p><Link href="/admin" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Licencadmin megnyitása</Link></section></main>;
  }

  return <main className="min-h-screen bg-[#eef4f8] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-8"><div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div><Link href="/drive/drop" className="inline-flex items-center gap-2 text-sm font-black text-cyan-800"><ArrowLeft size={17}/> Vissza a CsomagDrophoz</Link><p className="mt-5 text-xs font-black uppercase tracking-[.24em] text-teal-700">DROP 1.2.13 · IDENTITY CORE 0.2.2</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">DIMPRO Send és Beküldőkapu</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">A Send entitlementek a központi DIMPRO felhasználó-, licenc-, szervezet- és projektadatbázist használják. A legacy Drop Send-kódok csak egyenként, auditált adminművelettel vezethetők át.</p></div><div className="flex flex-wrap gap-2"><Link href="/drive/drop/operations" className="inline-flex items-center gap-2 rounded-xl border border-amber-500 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-950"><Activity size={16}/> Üzemeltetés</Link><Link href="https://drop.dimpro.hu/send" target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-900"><Send size={16}/> Send megnyitása</Link><button type="button" onClick={() => void loadData(adminKey)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><RefreshCw size={16}/> Frissítés</button></div></div></header>
    <section className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950">{message}</div>
      <DropPublicStoreMigrationPanel adminKey={adminKey}/>
      <DropPrivatePilotValidationPanel adminKey={adminKey}/>
      <DropEmailClientValidationPanel adminKey={adminKey}/>

      {createdCode ? <section className="mt-5 rounded-[1.5rem] border border-amber-300 bg-amber-50 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-amber-800">Egyszer megjelenő központi Send-kód</p><div className="mt-3 flex flex-wrap items-center gap-4"><strong className="font-mono text-3xl tracking-[.12em] text-slate-950">{createdCode}</strong><button type="button" onClick={() => void copy(createdCode)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{copied === createdCode ? <Check size={16}/> : <Clipboard size={16}/>} Másolás</button><button type="button" onClick={() => setCreatedCode("")} className="rounded-xl border border-amber-300 bg-white p-2.5 text-amber-800"><X size={16}/></button></div><p className="mt-3 text-sm font-semibold text-amber-950">A teljes kód később nem olvasható vissza. A központi adatbázis HMAC SHA-256 lenyomatot tárol.</p></section> : null}
      {createdInvitationUrl ? <section className="mt-5 rounded-[1.5rem] border border-cyan-300 bg-cyan-50 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-800">Szervezeti meghívó elkészült</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="min-w-0 break-all rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800">{createdInvitationUrl}</code><button type="button" onClick={() => void copy(createdInvitationUrl)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{copied === createdInvitationUrl ? <Check size={16}/> : <Clipboard size={16}/>} Link másolása</button><a href={createdInvitationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-white px-4 py-2.5 text-sm font-black text-cyan-900"><ExternalLink size={16}/> Meghívó megnyitása</a></div><p className="mt-3 text-xs font-semibold text-cyan-950">A link csak tartalék: normál esetben a meghívott e-mailben kapja meg.</p></section> : null}
      {createdGateUrl ? <section className="mt-5 rounded-[1.5rem] border border-emerald-300 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">Új Beküldőkapu</p><div className="mt-3 flex flex-wrap items-center gap-3"><code className="min-w-0 break-all rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800">{createdGateUrl}</code><button type="button" onClick={() => void copy(createdGateUrl)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">{copied === createdGateUrl ? <Check size={16}/> : <Clipboard size={16}/>} Másolás</button><a href={createdGateUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-black text-emerald-900"><ExternalLink size={16}/> Megnyitás</a></div></section> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-800"><KeyRound size={21}/></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-700">Központi DIMPRO Send</p><h2 className="mt-1 text-xl font-black text-slate-950">Új Send entitlement</h2><p className="mt-1 text-sm leading-6 text-slate-600">Meglévő, ellenőrzött központi felhasználóhoz és hozzá tartozó aktív licenchez rendelhető. Párhuzamos Drop-felhasználói adat nem jön létre.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Saját DIMPRO Send-kód"><input value={entitlementForm.sendCode} onChange={(event) => setEntitlementForm((old) => ({ ...old, sendCode: formatAdminSendInput(event.target.value) }))} placeholder="HAGE-123-456" className={`${inputClass} font-mono uppercase tracking-[.12em]`}/><span className="mt-1 block text-[10px] font-medium leading-4 text-slate-500">A kódot Ön választja. Négy betű + hat számjegy. A szerver csak HMAC-lenyomatot tárol.</span></Field>
            <div><Field label="Központi felhasználó"><select value={entitlementForm.userId} onChange={(event) => setEntitlementForm((old) => ({ ...old, userId: event.target.value, licenseId: "" }))} className={inputClass}><option value="">Válasszon felhasználót</option>{users.filter((user) => user.status === "active" && user.email_verified_at).map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email} · {user.public_user_code}</option>)}</select></Field><button type="button" onClick={toggleInlineUserCreator} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-900"><Mail size={14}/>{showInlineUserCreator ? "Meghívópanel bezárása" : "Felhasználó meghívása a szervezeti licencbe"}</button></div>
            <div><Field label="Hozzárendelhető DIMPRO licenc"><select value={entitlementForm.licenseId} onChange={(event) => setEntitlementForm((old) => ({ ...old, licenseId: event.target.value }))} className={inputClass}><option value="">Válasszon licencet</option>{eligibleLicenses.map((license) => <option key={license.id} value={license.id}>{license.public_license_code} · {license.product_code}{license.plan_code ? ` / ${license.plan_code}` : ""}</option>)}</select></Field><button type="button" onClick={() => setShowInlineLicenseCreator((value) => !value)} disabled={!entitlementForm.userId} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-900 disabled:opacity-40"><Plus size={14}/>{showInlineLicenseCreator ? "Új licenc panel bezárása" : "Új központi licenc létrehozása"}</button></div>
            <Field label="Lejárat"><input type="date" value={entitlementForm.expiresAt} onChange={(event) => setEntitlementForm((old) => ({ ...old, expiresAt: event.target.value }))} className={inputClass}/></Field>
            <Field label="Csomagméret-korlát (MB)"><input type="number" min={1} max={5120} value={entitlementForm.maxPackageSizeMb} onChange={(event) => setEntitlementForm((old) => ({ ...old, maxPackageSizeMb: Number(event.target.value) }))} className={inputClass}/></Field>
            <Field label="Max. címzett"><input type="number" min={1} max={100} value={entitlementForm.maxRecipients} onChange={(event) => setEntitlementForm((old) => ({ ...old, maxRecipients: Number(event.target.value) }))} className={inputClass}/><span className="mt-1 block text-[10px] text-slate-500">Gyors KépSendnél 1 saját + legfeljebb 5 további címzett ajánlott.</span></Field>
            <Field label="Mentett címjegyzék-limit"><input type="number" min={0} max={100} value={entitlementForm.maxSavedContacts} onChange={(event) => setEntitlementForm((old) => ({ ...old, maxSavedContacts: Number(event.target.value) }))} className={inputClass}/><span className="mt-1 block text-[10px] text-slate-500">A felhasználó ennyi saját, bármikor módosítható Send-kontaktot tárolhat.</span></Field>
            <Field label="Havi Send-limit · opcionális"><input type="number" min={1} value={entitlementForm.monthlySendLimit} onChange={(event) => setEntitlementForm((old) => ({ ...old, monthlySendLimit: event.target.value }))} className={inputClass} placeholder="Korlátlan"/></Field>
          </div>
          {showInlineUserCreator ? <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-sky-800">Szervezeti DIMPRO felhasználó meghívása</p><p className="mt-1 text-xs leading-5 text-slate-600">Ez már a központi Identity 0.2.0 meghívási folyamat: a felhasználó bekerül a kiválasztott szervezeti licencbe, e-mailben egyszer használható meghívólinket kap, majd elfogadás után OTP-belépést kérhet. Már meglévő, de még belépési fiókkal nem rendelkező HAGE-taghoz onboarding meghívó is küldhető.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Szervezeti licenc"><select value={inlineUserDraft.licenseId} onChange={(event) => { const licenseId = event.target.value; const moduleCodes = licenseModules.filter((module) => module.license_id === licenseId && module.enabled).map((module) => module.module_code); setInlineUserDraft((old) => ({ ...old, licenseId, moduleCodes })); }} className={inputClass}><option value="">Válasszon szervezeti licencet</option>{organizationLicenses.map((license) => { const org = organizations.find((item) => item.id === license.owner_organization_id); return <option key={license.id} value={license.id}>{license.public_license_code} · {org?.display_name || org?.legal_name || license.product_code}</option>; })}</select></Field><Field label="Szerepkör"><select value={inlineUserDraft.roleCode} onChange={(event) => setInlineUserDraft((old) => ({ ...old, roleCode: event.target.value as InlineUserDraft["roleCode"] }))} className={inputClass}><option value="member">Munkatárs</option><option value="manager">Vezető / projektvezető</option><option value="admin">Szervezeti admin</option></select></Field><Field label="Teljes név"><input value={inlineUserDraft.fullName} onChange={(event) => setInlineUserDraft((old) => ({ ...old, fullName: event.target.value.slice(0,160) }))} className={inputClass} placeholder="pl. Kiss Péter"/></Field><Field label="E-mail-cím"><input type="email" value={inlineUserDraft.email} onChange={(event) => setInlineUserDraft((old) => ({ ...old, email: event.target.value.slice(0,254) }))} className={inputClass} placeholder="nev@ceg.hu"/></Field></div><div className="mt-4"><p className="text-xs font-black uppercase tracking-[.1em] text-slate-600">Engedélyezett szolgáltatások</p><div className="mt-2 flex flex-wrap gap-2">{inlineInvitationModules.map((module) => <label key={module.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${inlineUserDraft.moduleCodes.includes(module.module_code) ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-500"}`}><input type="checkbox" checked={inlineUserDraft.moduleCodes.includes(module.module_code)} onChange={() => toggleInlineInvitationModule(module.module_code)} className="accent-emerald-700"/>{identityModuleLabel(module.module_code)}</label>)}</div></div><div className="mt-4 rounded-xl border border-cyan-200 bg-white p-3 text-xs font-semibold leading-5 text-cyan-950"><strong>Fontos:</strong> új kollégánál először a meghívót kell elfogadni. Ezután a „Frissítés” gombbal megjelenik az aktív központi felhasználók között, és létrehozható számára a Send entitlement. Már meglévő HAGE-tagnál a meghívó onboarding e-mailként működik.</div><button type="button" onClick={() => void createInlineUser()} disabled={busy !== "" || inlineUserDraft.fullName.trim().length < 2 || !validEmail(inlineUserDraft.email) || !inlineUserDraft.licenseId || inlineUserDraft.moduleCodes.length < 1} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-800 px-4 py-3 text-xs font-black text-white disabled:bg-slate-300">{busy === "user:invite" ? <LoaderCircle size={15} className="animate-spin"/> : <Mail size={15}/>} Meghívó e-mail küldése</button></section> : null}
          {showInlineLicenseCreator ? <section className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-cyan-800">Új központi licenc a kiválasztott felhasználóhoz</p><p className="mt-1 text-xs leading-5 text-slate-600">A licenc közvetlenül a LIVE Identity Core `dimpro_licenses` táblába kerül. A kódot Ön választja; automatikus generálás nincs.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Saját licenckód"><input value={inlineLicenseDraft.publicLicenseCode} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, publicLicenseCode: normalizeDimproLicenseCodeInput(event.target.value) }))} onBlur={(event) => setInlineLicenseDraft((old) => ({ ...old, publicLicenseCode: formatDimproLicenseCodeInput(event.target.value) }))} placeholder="LIC-26-HAGE-2468" className={`${inputClass} font-mono uppercase tracking-[.1em]`}/><span className="mt-1 block text-[10px] text-slate-500">Formátum: LIC-ÉÉ-XXXX-XXXX. Nem használható: 0, 1, I, L, O.</span></Field><Field label="Termék"><input value={inlineLicenseDraft.productCode} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, productCode: event.target.value.toUpperCase().slice(0,60) }))} className={inputClass}/></Field><Field label="Csomag"><input value={inlineLicenseDraft.planCode} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, planCode: event.target.value.slice(0,80) }))} className={inputClass}/></Field><Field label="Státusz"><select value={inlineLicenseDraft.status} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, status: event.target.value as "active" | "trial" }))} className={inputClass}><option value="active">Aktív</option><option value="trial">Próba</option></select></Field><Field label="Aktiválás"><input type="date" value={inlineLicenseDraft.activatedAt} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, activatedAt: event.target.value }))} className={inputClass}/></Field><Field label="Lejárat"><input type="date" value={inlineLicenseDraft.expiresAt} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, expiresAt: event.target.value }))} className={inputClass}/></Field></div><label className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950"><input type="checkbox" checked={inlineLicenseDraft.enableQuickVoiceNote} onChange={(event) => setInlineLicenseDraft((old) => ({ ...old, enableQuickVoiceNote: event.target.checked }))} className="mt-0.5 accent-emerald-700"/><span><strong>Gyors hangos megjegyzés licencmodul</strong><br/>Bekapcsolva a licenc megkapja a `DROP_QUICK_VOICE_NOTE` modult, legfeljebb 60 mp-es device/böngésző diktálással képenként.</span></label><button type="button" onClick={() => void createInlineLicense()} disabled={busy !== "" || !entitlementForm.userId || !isValidDimproLicenseCode(inlineLicenseDraft.publicLicenseCode)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-4 py-3 text-xs font-black text-white disabled:bg-slate-300">{busy === "license:create" ? <LoaderCircle size={15} className="animate-spin"/> : <Plus size={15}/>} Licenc létrehozása és kiválasztása</button><Link href="/admin/licenckozpont" target="_blank" className="ml-2 inline-flex rounded-xl border border-cyan-300 bg-white px-4 py-3 text-xs font-black text-cyan-900">Teljes Licencközpont megnyitása</Link></section> : null}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-700">Címzettkezelés</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><ModeButton selected={entitlementForm.recipientMode === "locked_default"} title="Zárolt címzett" note="A felhasználó nem módosíthatja." onClick={() => setEntitlementForm((old) => ({ ...old, recipientMode: "locked_default" }))}/><ModeButton selected={entitlementForm.recipientMode === "approved_list"} title="Jóváhagyott lista" note="Csak központilag rögzített címzettek." onClick={() => setEntitlementForm((old) => ({ ...old, recipientMode: "approved_list" }))}/><ModeButton selected={entitlementForm.recipientMode === "free_entry"} title="Szabad címzett" note="Explicit entitlement esetén új cím is megadható." onClick={() => setEntitlementForm((old) => ({ ...old, recipientMode: "free_entry" }))}/></div>{entitlementForm.recipientMode !== "free_entry" ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Alap címzett neve"><input value={entitlementForm.defaultRecipientName} onChange={(event) => setEntitlementForm((old) => ({ ...old, defaultRecipientName: event.target.value.slice(0, 160) }))} className={inputClass}/></Field><Field label="Alap címzett e-mail"><input type="email" value={entitlementForm.defaultRecipientEmail} onChange={(event) => setEntitlementForm((old) => ({ ...old, defaultRecipientEmail: event.target.value.slice(0, 254) }))} className={inputClass}/></Field><Field label="Címzett szervezete"><input value={entitlementForm.defaultRecipientOrganization} onChange={(event) => setEntitlementForm((old) => ({ ...old, defaultRecipientOrganization: event.target.value.slice(0, 180) }))} className={inputClass}/></Field></div> : null}{entitlementForm.recipientMode === "approved_list" ? <div className="mt-4"><Field label="További jóváhagyott címzettek · név | e-mail | szervezet | címke"><textarea value={entitlementForm.approvedRecipientsText} onChange={(event) => setEntitlementForm((old) => ({ ...old, approvedRecipientsText: event.target.value }))} className={`${inputClass} min-h-28 resize-y`} placeholder="Projektvezető | projekt@example.hu | Példa Kft. | Projekt"/></Field></div> : null}</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><FeatureToggle checked={entitlementForm.canUseStandardSend} title="Normál Send" onChange={(checked) => setEntitlementForm((old) => ({ ...old, canUseStandardSend: checked }))}/><FeatureToggle checked={entitlementForm.canUseQuickImageSend} title="Gyors KépSend" onChange={(checked) => setEntitlementForm((old) => ({ ...old, canUseQuickImageSend: checked }))}/><FeatureToggle checked={entitlementForm.canUseImageGroups} title="Képcsoportok" onChange={(checked) => setEntitlementForm((old) => ({ ...old, canUseImageGroups: checked }))}/><FeatureToggle checked={entitlementForm.canUseFileComments} title="Megjegyzések" onChange={(checked) => setEntitlementForm((old) => ({ ...old, canUseFileComments: checked }))}/><FeatureToggle checked={entitlementForm.canUseProjectDrop} title="Projekt Beérkező Drop" onChange={(checked) => setEntitlementForm((old) => ({ ...old, canUseProjectDrop: checked }))}/></div>
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950"><strong>Projektkapcsolat:</strong> bekapcsoláskor a licenc `DROP_PROJECT_INBOX` moduljogosultságot kap. A felhasználó csak saját, aktív, feltöltési joggal rendelkező projektjeit látja.</div><div className={`mt-3 rounded-xl border p-3 text-xs font-semibold leading-5 ${selectedVoiceLicenseModule ? "border-cyan-200 bg-cyan-50 text-cyan-950" : "border-slate-200 bg-slate-50 text-slate-600"}`}><strong>Gyors hangos megjegyzés:</strong> {selectedVoiceLicenseModule ? "a kiválasztott licencen aktív · max. 60 mp/kép · device/böngésző diktálás" : "a kiválasztott licencen nincs DROP_QUICK_VOICE_NOTE modul. A funkció a Licencközpontban kapcsolható be."}</div>
          <button type="button" onClick={() => void createEntitlement()} disabled={busy !== "" || !entitlementFormReady} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{busy === "entitlement:create" ? <LoaderCircle size={17} className="animate-spin"/> : <Plus size={17}/>} Központi Send entitlement létrehozása</button>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-800">{gateForm.type === "personal" ? <UserRound size={21}/> : gateForm.type === "project" ? <FolderKanban size={21}/> : <Building2 size={21}/>}</span><div><p className="text-xs font-black uppercase tracking-[.15em] text-teal-700">DIMPRO Beküldőkapu</p><h2 className="mt-1 text-xl font-black text-slate-950">Új kapu</h2><p className="mt-1 text-sm leading-6 text-slate-600">A Beküldőkapu jelenlegi célzott workflow-ja változatlanul használható.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Kaputípus"><select value={gateForm.type} onChange={(event) => setGateForm((old) => ({ ...old, type: event.target.value as Gate["type"] }))} className={inputClass}><option value="personal">Személyes</option><option value="project">Projekt</option><option value="organization">Szervezeti</option></select></Field><Field label="Cím"><input value={gateForm.title} onChange={(event) => setGateForm((old) => ({ ...old, title: event.target.value.slice(0, 200) }))} className={inputClass}/></Field><Field label="URL-azonosító"><input value={gateForm.slug} onChange={(event) => setGateForm((old) => ({ ...old, slug: event.target.value.slice(0, 100) }))} className={inputClass} placeholder="Üresen: automatikus"/></Field><Field label="Lejárat"><input type="date" value={gateForm.expiresAt} onChange={(event) => setGateForm((old) => ({ ...old, expiresAt: event.target.value }))} className={inputClass}/></Field><Field label="Projekt neve"><input value={gateForm.projectName} onChange={(event) => setGateForm((old) => ({ ...old, projectName: event.target.value.slice(0, 240) }))} className={inputClass} placeholder="Opcionális"/></Field><Field label="Projektazonosító"><input value={gateForm.projectId} onChange={(event) => setGateForm((old) => ({ ...old, projectId: event.target.value.slice(0, 160) }))} className={inputClass} placeholder="Opcionális"/></Field><Field label="Célmappa"><input value={gateForm.targetFolder} onChange={(event) => setGateForm((old) => ({ ...old, targetFolder: event.target.value.slice(0, 500) }))} className={inputClass} placeholder="pl. Beérkező / Elektromos"/></Field><Field label="Megőrzés"><select value={gateForm.retentionDays} onChange={(event) => setGateForm((old) => ({ ...old, retentionDays: Number(event.target.value) }))} className={inputClass}>{[1, 3, 5, 7].map((day) => <option key={day} value={day}>{day} nap</option>)}</select></Field><Field label="Letöltési védelem"><select value={gateForm.downloadProtection} onChange={(event) => setGateForm((old) => ({ ...old, downloadProtection: event.target.value as GateForm["downloadProtection"] }))} className={inputClass}><option value="link_pin">Link + hatjegyű kód</option><option value="link">Csak link</option></select></Field></div><div className="mt-4"><Field label="Leírás"><textarea value={gateForm.description} onChange={(event) => setGateForm((old) => ({ ...old, description: event.target.value.slice(0, 2000) }))} className={`${inputClass} min-h-24 resize-y`}/></Field></div><div className="mt-4"><Field label={gateForm.type === "organization" ? "Engedélyezett címzettek · soronként név | e-mail | címke | cég" : "Címzett · név | e-mail | címke | cég"}><textarea value={gateForm.recipientsText} onChange={(event) => setGateForm((old) => ({ ...old, recipientsText: event.target.value }))} className={`${inputClass} min-h-28 resize-y`} placeholder="Név | nev@example.hu | Projektvezető | Példa Kft."/></Field></div><div className="mt-4 flex flex-wrap gap-3"><FeatureToggle checked={gateForm.allowPackageComment} title="Csomagmegjegyzés" onChange={(checked) => setGateForm((old) => ({ ...old, allowPackageComment: checked }))}/><FeatureToggle checked={gateForm.allowFileComments} title="Fájlmegjegyzés" onChange={(checked) => setGateForm((old) => ({ ...old, allowFileComments: checked }))}/></div><button type="button" onClick={() => void createGate()} disabled={busy !== "" || gateForm.title.trim().length < 3 || parseGateRecipients(gateForm.recipientsText).length < 1} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{busy === "gate:create" ? <LoaderCircle size={17} className="animate-spin"/> : <Plus size={17}/>} Beküldőkapu létrehozása</button></section>
      </div>

      <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-700">Központi jogosultságok</p><h2 className="mt-1 text-xl font-black text-slate-950">Identity Core Send entitlementek</h2></div><span className="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800">{entitlements.length} entitlement</span></div><div className="mt-5 grid gap-4 xl:grid-cols-2">{entitlements.length ? entitlements.map((entitlement) => { const user = users.find((item) => item.id === entitlement.user_id); const license = licenses.find((item) => item.id === entitlement.license_id); const recipientRows = identityRecipients.filter((item) => item.entitlement_id === entitlement.id && item.active); const voiceModule = licenseModules.find((module) => module.license_id === entitlement.license_id && module.module_code === "DROP_QUICK_VOICE_NOTE" && module.enabled); return <article key={entitlement.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{user?.full_name || "Ismeretlen felhasználó"}</strong><p className="mt-1 text-xs font-semibold text-slate-600">{user?.email || entitlement.user_id}</p><p className="mt-1 font-mono text-xs font-black text-cyan-800">{entitlement.code_hint || "••••"} · {license?.public_license_code || entitlement.license_id}</p></div><Status value={entitlement.status}/></div><div className="mt-3 rounded-xl border border-cyan-100 bg-white p-3 text-xs font-semibold leading-5 text-slate-600"><p><strong>Címzettmód:</strong> {recipientModeLabel(entitlement.recipient_mode)} · {recipientRows.length} rögzített címzett</p><p><strong>Modulok:</strong> {[entitlement.can_use_standard_send && "Normál Send", entitlement.can_use_quick_image_send && "Gyors KépSend", entitlement.can_use_image_groups && "képcsoportok", entitlement.can_use_file_comments && "megjegyzések", entitlement.can_use_project_drop && "Projekt Beérkező Drop", voiceModule && "hangos megjegyzés"].filter(Boolean).join(" · ")}</p><p><strong>Keret:</strong> {formatBytes(entitlement.max_package_size_bytes)} · max. {entitlement.max_recipients} címzett · {entitlement.max_saved_contacts ?? 10} mentett kontakt{voiceModule ? " · max. 60 mp hangjegyzet" : ""}{entitlement.monthly_send_limit ? ` · havi ${entitlement.current_month_send_count}/${entitlement.monthly_send_limit}` : ""}</p><p><strong>Lejárat:</strong> {formatDate(entitlement.expires_at)}</p></div><div className="mt-3 flex flex-wrap gap-2">{entitlement.status === "active" ? <button type="button" onClick={() => void updateEntitlement(entitlement.id, "suspended")} disabled={busy !== ""} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">Felfüggesztés</button> : entitlement.status === "suspended" ? <button type="button" onClick={() => void updateEntitlement(entitlement.id, "active")} disabled={busy !== ""} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Újraaktiválás</button> : null}{entitlement.status !== "revoked" ? <button type="button" onClick={() => void rotateEntitlementCode(entitlement.id, user?.full_name || "Felhasználó")} disabled={busy !== ""} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-900">{busy === `entitlement:rotate:${entitlement.id}` ? <LoaderCircle size={14} className="animate-spin"/> : <Mail size={14}/>} Új kód + e-mail</button> : null}{entitlement.status !== "revoked" ? <button type="button" onClick={() => void updateEntitlement(entitlement.id, "revoked")} disabled={busy !== ""} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800">Visszavonás</button> : null}</div></article>; }) : <Empty text="Még nincs központi Send entitlement."/>}</div></section>

      <section className="mt-6 rounded-[1.75rem] border border-amber-200 bg-white p-5 shadow-sm sm:p-6"><div><p className="text-xs font-black uppercase tracking-[.15em] text-amber-800">Legacy bridge</p><h2 className="mt-1 text-xl font-black text-slate-950">Régi Drop Send-kódok · csak egyenként, auditáltan</h2><p className="mt-2 text-sm leading-6 text-slate-600">Automatikus összerendelés nincs. Az átvezetéshez előbb hozzon létre központi entitlementet, majd válassza ki kézzel. Az átvezetett legacy kód visszavonásra kerül; a felhasználó a központi új Send-kódot kapja.</p></div><div className="mt-5 space-y-3">{legacyCodes.length ? legacyCodes.map((legacy) => <article key={legacy.id} className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><strong className="text-sm text-slate-950">{legacy.label}</strong><p className="mt-1 font-mono text-xs font-bold text-amber-900">{legacy.code_hint} · {legacy.id}</p><p className="mt-1 text-xs text-slate-600">Állapot: {legacy.status} · lejárat: {formatDate(legacy.expires_at)}</p>{legacy.dimpro_send_entitlement_id ? <p className="mt-2 text-xs font-black text-emerald-800">Átvezetve: {legacy.dimpro_send_entitlement_id}</p> : null}</div>{!legacy.dimpro_send_entitlement_id ? <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-2xl"><select value={legacyTarget[legacy.id] || ""} onChange={(event) => setLegacyTarget((old) => ({ ...old, [legacy.id]: event.target.value }))} className={inputClass}><option value="">Válasszon központi entitlementet</option>{entitlements.map((entitlement) => { const user = users.find((item) => item.id === entitlement.user_id); return <option key={entitlement.id} value={entitlement.id}>{user?.full_name || entitlement.user_id} · {entitlement.code_hint || entitlement.id}</option>; })}</select><button type="button" onClick={() => void linkLegacy(legacy.id)} disabled={busy !== "" || !legacyTarget[legacy.id]} className="shrink-0 rounded-xl bg-amber-800 px-4 py-3 text-xs font-black text-white disabled:bg-slate-300">{busy === `legacy:${legacy.id}` ? "Átvezetés…" : "Auditált átvezetés + visszavonás"}</button></div> : null}</div></article>) : <Empty text="Nincs legacy Drop Send-kód."/>}</div></section>

      <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-teal-700">Beküldőkapuk</p><h2 className="mt-1 text-xl font-black text-slate-950">Személyes, projekt és szervezeti kapuk</h2></div><span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-800">{gates.length} kapu</span></div><div className="mt-5 grid gap-4 xl:grid-cols-2">{gates.length ? gates.map((gate) => { const url = `https://drop.dimpro.hu/bekuldes/${encodeURIComponent(gate.slug)}`; return <article key={gate.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-teal-800 shadow-sm">{gate.type === "personal" ? <UserRound size={19}/> : gate.type === "project" ? <FolderKanban size={19}/> : <UsersRound size={19}/>}</span><div><strong className="text-sm text-slate-950">{gate.title}</strong><p className="mt-1 text-xs font-bold text-teal-800">{gate.type === "personal" ? "Személyes" : gate.type === "project" ? "Projekt" : "Szervezeti"} · {gate.recipients.length} címzett</p></div></div><Status value={gate.status}/></div><p className="mt-3 text-xs leading-5 text-slate-600">{gate.projectName ? `${gate.projectName} · ` : ""}{gate.targetFolder || "Nincs célmappa megadva"}</p><code className="mt-3 block break-all rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-700">{url}</code><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copy(url)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">{copied === url ? <Check size={14}/> : <Clipboard size={14}/>} Másolás</button><a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-black text-teal-800"><ExternalLink size={14}/> Megnyitás</a><button type="button" onClick={() => void updateGate(gate.id, gate.status === "active" ? "revoked" : "active")} disabled={busy !== "" || gate.status === "expired"} className={`rounded-xl px-3 py-2 text-xs font-black ${gate.status === "active" ? "border border-rose-200 bg-rose-50 text-rose-800" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{busy === `gate:${gate.id}` ? "Mentés…" : gate.status === "active" ? "Lezárás" : "Újraaktiválás"}</button></div></article>; }) : <Empty text="Még nincs Beküldőkapu."/>}</div></section>
    </section>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">{label}</span>{children}</label>; }
function ModeButton({ selected, title, note, onClick }: { selected: boolean; title: string; note: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left ${selected ? "border-cyan-500 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white"}`}><span className="flex items-center gap-2 text-xs font-black text-slate-950">{selected ? <LockKeyhole size={14} className="text-cyan-700"/> : null}{title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{note}</span></button>; }
function FeatureToggle({ checked, title, onChange }: { checked: boolean; title: string; onChange: (checked: boolean) => void }) { return <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-black ${checked ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-emerald-700"/>{title}</label>; }
function Status({ value }: { value: string }) { const active = value === "active"; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] ${active ? "bg-emerald-100 text-emerald-800" : value === "expired" ? "bg-slate-200 text-slate-700" : value === "suspended" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800"}`}>{active ? "Aktív" : value === "expired" ? "Lejárt" : value === "suspended" ? "Felfüggesztve" : "Visszavont"}</span>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">{text}</div>; }
