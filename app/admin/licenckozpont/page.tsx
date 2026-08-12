"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, KeyRound, LoaderCircle, Plus, RefreshCw, Search, X } from "lucide-react";
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
type ModuleDraft = { moduleCode: string; enabled: boolean };
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
type DrawerMode = "closed" | "new" | "edit";

const statusOptions = ["pending", "trial", "active", "expired", "suspended", "revoked"];
const statusLabels: Record<string, string> = { pending: "Függő", trial: "Próba", active: "Aktív", expired: "Lejárt", suspended: "Felfüggesztett", revoked: "Visszavont" };
const modulePresets = [
  ["HAGE_WORKSPACE", "HAGE-INVEST ONE / Munkatér"], ["TASKS", "Feladatok"], ["VACATIONS", "Szabadságok"], ["AI_ASSISTANT", "AI Asszisztens"],
  ["DROP_SEND", "DIMPRO Send"], ["DROP_QUICK_IMAGE_SEND", "Gyors KépSend"], ["DROP_PROJECT_INBOX", "Projekt Beérkező Drop"],
  ["ARUTER", "Árutér"], ["DRIVE", "DIMPRO Drive"], ["MEETING_ASSISTANT", "Értekezleti Asszisztens"], ["SCHEDULE", "Ütemterv"], ["MINUTES", "Jegyzőkönyvek"],
] as const;

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
    modules: modules.filter((item) => item.license_id === license.id).map((item) => ({ moduleCode: item.module_code, enabled: item.enabled })),
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
    else onChange([...value.filter((item) => item.moduleCode !== code), { moduleCode: code, enabled: true }]);
  }
  function addCustom() {
    const code = custom.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 80);
    if (code.length < 2 || active.has(code)) return;
    onChange([...value, { moduleCode: code, enabled: true }]);
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
  const headers = useMemo(() => ({ "content-type": "application/json", "x-dimpro-license-admin-key": adminKey }), [adminKey]);

  const load = useCallback(async (key: string) => {
    const [licenseResponse, sendResponse] = await Promise.all([
      fetch("/api/dimpro-identity/admin/licenses", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
      fetch("/api/dimpro-identity/admin/send-entitlements", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" }),
    ]);
    const [licensePayload, sendPayload] = await Promise.all([licenseResponse.json(), sendResponse.json()]);
    if (!licenseResponse.ok) throw new Error(licensePayload.error || "A Licencközpont nem tölthető be.");
    if (!sendResponse.ok) throw new Error(sendPayload.error || "A Send-jogosultságok nem tölthetők be.");
    const nextLicenses = licensePayload.licenses || [];
    const nextModules = licensePayload.licenseModules || [];
    setUsers(licensePayload.users || []);
    setOrganizations(licensePayload.organizations || []);
    setMemberships(licensePayload.organizationMemberships || []);
    setLicenses(nextLicenses);
    setModules(nextModules);
    setMembershipModules(licensePayload.membershipModules || []);
    setOrganizationInvitations(licensePayload.organizationInvitations || []);
    setEntitlements(sendPayload.entitlements || []);
    setDrafts(Object.fromEntries(nextLicenses.map((license: License) => [license.id, licenseDraft(license, nextModules)])));
    setAuthorized("yes");
    setMessage("Identity Core adatok frissítve.");
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
                <button type="button" className="benjadmin-data-primary-action is-full" onClick={() => void createLicense()} disabled={busy !== "" || !isValidDimproLicenseCode(createDraft.publicLicenseCode) || !(createDraft.ownerType === "user" ? createDraft.ownerUserId : createDraft.ownerOrganizationId)}>{busy === "create-license" ? <LoaderCircle size={17} className="is-spinning" /> : <Plus size={17} />} Licenc létrehozása</button>
              </>
            ) : selectedLicense ? (() => {
              const draft = drafts[selectedLicense.id] || licenseDraft(selectedLicense, modules);
              const send = sendDrafts[selectedLicense.id] || initialSend();
              const allowedUsers = eligibleUsers(selectedLicense);
              const licenseEntitlements = entitlements.filter((entitlement) => entitlement.license_id === selectedLicense.id);
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
                  <button type="button" className="benjadmin-data-primary-action is-full" onClick={() => void saveLicense(selectedLicense.id)} disabled={busy !== ""}>{busy === `license:${selectedLicense.id}` ? <LoaderCircle size={17} className="is-spinning" /> : <Check size={17} />} Licenc mentése</button>

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
