"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import BenjadminOperatorConsole from "@/components/admin/BenjadminOperatorConsole";
import BenjadminBrandScreen from "@/components/admin/BenjadminBrandScreen";
import type { DevProject, DevVersion, DevWorkSession } from "@/app/lib/dev-center/types";

type Device = {
  id: string;
  licenseId: string;
  machineIdHash: string;
  appId: string;
  firstActivatedAt: string;
  lastOnlineCheckAt: string;
  offlineGraceUntil: string;
  status: "active" | "blocked";
  userName?: string;
  organizationUnit?: string;
  note?: string;
};

type LicenseStatus = "active" | "expired" | "blocked" | "trial" | "pending" | "archived";

type AiFeatureId = "daily_plan" | "next_step" | "task_breakdown" | "waiting_email" | "meeting_agenda" | "weekly_summary" | "decision_support" | "document_extract";

type AiUserAccess = {
  id: string;
  userId: string;
  displayName: string;
  enabled: boolean;
  allowedFeatures: AiFeatureId[];
  allowedScopes: Array<"personal" | "hage">;
  maxRequestsPerDay: number;
  maxRequestsPerMonth: number;
  monthlyBudgetHuf: number;
  accessExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};


type AdditionalContact = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  receiveEmail: boolean;
  createdAt: string;
  updatedAt: string;
};

type License = {
  id: string;
  licenseKey: string;
  companyId: string;
  companyName: string;
  status: LicenseStatus;
  startsAt: string;
  expiresAt: string;
  maxDevices: number;
  enabledModules: string[];
  aiUsers?: AiUserAccess[];
  aiMonthlyBudgetHuf?: number;
  aiMaxSingleRequestHuf?: number;
  deviceCount: number;
  devices: Device[];
  createdAt: string;
  updatedAt: string;
  adminNote?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
  additionalContacts?: AdditionalContact[];
  licenseEmailSentAt?: string;
  planCode?: string;
  billingInterval?: string;
  billingStatus?: string;
  subscriptionQuantity?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  autoReleaseInactiveDevices?: boolean;
  inactiveReleaseDays?: number;
};

type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  licenseId?: string;
  deviceId?: string;
  companyName?: string;
  message: string;
};

type AdminStore = {
  licenses: License[];
  devices: Device[];
  auditEntries?: AuditEntry[];
};

type AdminEntryView = "launcher" | "license";

type LicenseDraft = {
  licenseKey: string;
  companyId: string;
  companyName: string;
  status: LicenseStatus;
  startsAt: string;
  expiresAt: string;
  maxDevices: string;
  enabledModules: string[];
  aiUsers: AiUserAccess[];
  aiMonthlyBudgetHuf: string;
  aiMaxSingleRequestHuf: string;
  adminNote: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  secondaryContactName: string;
  secondaryContactEmail: string;
  secondaryContactPhone: string;
  additionalContacts: AdditionalContact[];
  licenseEmailSentAt: string;
  planCode: string;
  billingInterval: string;
  billingStatus: string;
  subscriptionQuantity: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: string;
  autoReleaseInactiveDevices: boolean;
  inactiveReleaseDays: string;
};

const statusOptions: LicenseStatus[] = ["active", "trial", "pending", "blocked", "expired", "archived"];
const statusLabels: Record<string, string> = {
  active: "Aktív",
  trial: "Próba",
  pending: "Függőben",
  blocked: "Tiltott",
  expired: "Lejárt",
  archived: "Archivált",
};

const billingStatusLabels: Record<string, string> = {
  manual: "Kézi kezelés",
  none: "Nincs előfizetés",
  active: "Aktív fizetés",
  trialing: "Próbaidő",
  past_due: "Fizetési hiba",
  canceled: "Lemondva",
};

const billingIntervalLabels: Record<string, string> = {
  manual: "Kézi",
  none: "Nincs",
  monthly: "Havi",
  yearly: "Éves",
};

const moduleOptions = [
  { id: "hage_workspace", label: "HAGE munkafelület" },
  { id: "tasks", label: "Feladatkezelés" },
  { id: "vacations", label: "Szabadságtervező" },
  { id: "documents", label: "Dokumentumtár" },
  { id: "minutes", label: "Jegyzőkönyvek" },
  { id: "schedule", label: "Ütemterv" },
  { id: "aruter", label: "Árutér" },
  { id: "ai_assistant", label: "AI segéd / AI Gateway" },
];

const aiFeatureOptions: Array<{ id: AiFeatureId; label: string }> = [
  { id: "daily_plan", label: "Mai feladatok rangsorolása" },
  { id: "next_step", label: "Következő lépés" },
  { id: "task_breakdown", label: "Feladat bontása" },
  { id: "waiting_email", label: "Visszakérdező levél" },
  { id: "meeting_agenda", label: "Értekezleti napirend" },
  { id: "weekly_summary", label: "Heti összefoglaló" },
  { id: "decision_support", label: "Döntési összefoglaló" },
  { id: "document_extract", label: "Iktató dokumentum-adatkinyerés" },
];

const allAiFeatures = aiFeatureOptions.map((item) => item.id);

function toLocalInputValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function addMonthsInputValue(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return toLocalInputValue(date.toISOString());
}

function addMonthsFromLicenseExpiryInputValue(value: string, months: number) {
  const currentExpiry = value ? new Date(value) : new Date();
  const now = new Date();
  const baseDate = !Number.isNaN(currentExpiry.getTime()) && currentExpiry.getTime() > now.getTime()
    ? currentExpiry
    : now;
  const next = new Date(baseDate);
  next.setUTCMonth(next.getUTCMonth() + months);
  return toLocalInputValue(next.toISOString());
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("hu-HU");
}

function getDaysUntil(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function getLicenseTimeLabel(license: License) {
  const days = getDaysUntil(license.expiresAt);
  if (days === null) return "Lejárat nem értelmezhető";
  if (days < 0) return `Lejárt ${Math.abs(days)} napja`;
  if (days === 0) return "Ma jár le";
  if (days <= 30) return `Figyelem: ${days} nap múlva lejár`;
  return `${days} nap van hátra`;
}

function getInactivityLabel(value: string) {
  const days = getDaysUntil(value);
  if (days === null) return "Nincs adat";
  const inactiveDays = Math.max(0, -days);
  if (inactiveDays <= 1) return "Ma aktív";
  if (inactiveDays <= 30) return `${inactiveDays} napja aktív`;
  if (inactiveDays <= 90) return `${inactiveDays} napja nem jelentkezett – inaktív`;
  return `${inactiveDays} napja nem jelentkezett – felszabadítható`;
}

function toDraft(license: License): LicenseDraft {
  return {
    licenseKey: license.licenseKey,
    companyId: license.companyId,
    companyName: license.companyName,
    status: license.status,
    startsAt: toLocalInputValue(license.startsAt),
    expiresAt: toLocalInputValue(license.expiresAt),
    maxDevices: String(license.maxDevices),
    enabledModules: license.enabledModules ?? [],
    aiUsers: (license.aiUsers ?? []).map((user) => ({ ...user, accessExpiresAt: user.accessExpiresAt ? toLocalInputValue(user.accessExpiresAt) : "" })),
    aiMonthlyBudgetHuf: String(license.aiMonthlyBudgetHuf ?? 15000),
    aiMaxSingleRequestHuf: String(license.aiMaxSingleRequestHuf ?? 100),
    adminNote: license.adminNote ?? "",
    contactName: license.contactName ?? "",
    contactEmail: license.contactEmail ?? "",
    contactPhone: license.contactPhone ?? "",
    secondaryContactName: license.secondaryContactName ?? "",
    secondaryContactEmail: license.secondaryContactEmail ?? "",
    secondaryContactPhone: license.secondaryContactPhone ?? "",
    additionalContacts: (license.additionalContacts ?? []).map((contact) => ({
      ...contact,
      role: contact.role ?? "",
      phone: contact.phone ?? "",
    })),
    licenseEmailSentAt: license.licenseEmailSentAt ?? "",
    planCode: license.planCode ?? "manual",
    billingInterval: license.billingInterval ?? "manual",
    billingStatus: license.billingStatus ?? "manual",
    subscriptionQuantity: String(license.subscriptionQuantity ?? license.maxDevices),
    stripeCustomerId: license.stripeCustomerId ?? "",
    stripeSubscriptionId: license.stripeSubscriptionId ?? "",
    currentPeriodEnd: toLocalInputValue(license.currentPeriodEnd ?? license.expiresAt),
    autoReleaseInactiveDevices: Boolean(license.autoReleaseInactiveDevices),
    inactiveReleaseDays: String(license.inactiveReleaseDays ?? 90),
  };
}

function emptyLicenseDraft(): LicenseDraft {
  return {
    licenseKey: "",
    companyId: "",
    companyName: "",
    status: "active",
    startsAt: toLocalInputValue(new Date().toISOString()),
    expiresAt: addMonthsInputValue(6),
    maxDevices: "3",
    enabledModules: ["hage_workspace", "tasks", "vacations"],
    aiUsers: [],
    aiMonthlyBudgetHuf: "15000",
    aiMaxSingleRequestHuf: "100",
    adminNote: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    secondaryContactName: "",
    secondaryContactEmail: "",
    secondaryContactPhone: "",
    additionalContacts: [],
    licenseEmailSentAt: "",
    planCode: "manual",
    billingInterval: "manual",
    billingStatus: "manual",
    subscriptionQuantity: "3",
    stripeCustomerId: "",
    stripeSubscriptionId: "",
    currentPeriodEnd: addMonthsInputValue(6),
    autoReleaseInactiveDevices: false,
    inactiveReleaseDays: "90",
  };
}

function hasNotificationRecipient(license: License) {
  return Boolean(
    license.contactEmail?.trim() ||
      license.secondaryContactEmail?.trim() ||
      (license.additionalContacts ?? []).some(
        (contact) => contact.receiveEmail && contact.email.trim(),
      ),
  );
}

function toggleModule(modules: string[], moduleId: string) {
  return modules.includes(moduleId)
    ? modules.filter((item) => item !== moduleId)
    : [...modules, moduleId];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/55">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
  tone = "dark",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] ${
        tone === "light" ? "text-slate-700" : "text-cyan-100/60"
      }`}
    >
      {label}
      {children}
    </label>
  );
}

function textInputClass() {
  return "mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400";
}

function ModuleCheckboxes({ value, onChange }: { value: string[]; onChange: (modules: string[]) => void }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/60">Moduljogosultságok</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {moduleOptions.map((module) => (
          <label key={module.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 hover:border-cyan-400/50">
            <input
              type="checkbox"
              checked={value.includes(module.id)}
              onChange={() => onChange(toggleModule(value, module.id))}
              className="h-4 w-4 accent-cyan-400"
            />
            <span>{module.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}


function AdditionalContactsEditor({
  value,
  onChange,
}: {
  value: AdditionalContact[];
  onChange: (contacts: AdditionalContact[]) => void;
}) {
  function addContact() {
    const now = new Date().toISOString();
    onChange([
      ...value,
      {
        id: `contact-${crypto.randomUUID()}`,
        name: "",
        role: "",
        email: "",
        phone: "",
        receiveEmail: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  function updateContact(contactId: string, patch: Partial<AdditionalContact>) {
    onChange(
      value.map((contact) =>
        contact.id === contactId
          ? { ...contact, ...patch, updatedAt: new Date().toISOString() }
          : contact,
      ),
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-sky-400/25 bg-sky-950/20 p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/75">További értesítési kapcsolattartók</div>
          <p className="mt-1 text-sm leading-6 text-slate-300">Opcionális lista több vezető vagy munkatárs részére. Csak a „Kapjon e-mailt” jelöléssel ellátott, érvényes címek kapnak külön értesítést.</p>
        </div>
        <button type="button" onClick={addContact} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-300">+ Kapcsolattartó hozzáadása</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-3 py-3">Név</th>
              <th className="px-3 py-3">Szerepkör</th>
              <th className="px-3 py-3">E-mail</th>
              <th className="px-3 py-3">Telefon</th>
              <th className="px-3 py-3">Értesítés</th>
              <th className="px-3 py-3">Művelet</th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-5 text-slate-400">Nincs további értesítési kapcsolattartó. A két fő kapcsolattartó ettől függetlenül használható.</td>
              </tr>
            ) : value.map((contact) => (
              <tr key={contact.id} className="border-t border-slate-800 bg-slate-950/55">
                <td className="px-3 py-3"><input value={contact.name} onChange={(event) => updateContact(contact.id, { name: event.target.value })} placeholder="Név" className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /></td>
                <td className="px-3 py-3"><input value={contact.role} onChange={(event) => updateContact(contact.id, { role: event.target.value })} placeholder="pl. ügyvezető" className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /></td>
                <td className="px-3 py-3"><input type="email" value={contact.email} onChange={(event) => updateContact(contact.id, { email: event.target.value })} placeholder="nev@ceg.hu" className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /></td>
                <td className="px-3 py-3"><input value={contact.phone} onChange={(event) => updateContact(contact.id, { phone: event.target.value })} placeholder="+36..." className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /></td>
                <td className="px-3 py-3"><label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-200"><input type="checkbox" checked={contact.receiveEmail} onChange={(event) => updateContact(contact.id, { receiveEmail: event.target.checked })} className="h-4 w-4 accent-sky-400" /> Kapjon e-mailt</label></td>
                <td className="px-3 py-3"><button type="button" onClick={() => onChange(value.filter((item) => item.id !== contact.id))} className="rounded-lg border border-red-400/50 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-400/10">Eltávolítás</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AiUserAccessEditor({ value, onChange }: { value: AiUserAccess[]; onChange: (users: AiUserAccess[]) => void }) {
  function addUser() {
    const now = new Date().toISOString();
    onChange([
      ...value,
      {
        id: `ai-user-${crypto.randomUUID()}`,
        userId: `user-${Date.now()}`,
        displayName: "",
        enabled: true,
        allowedFeatures: [...allAiFeatures],
        allowedScopes: ["personal", "hage"],
        maxRequestsPerDay: 20,
        maxRequestsPerMonth: 300,
        monthlyBudgetHuf: 5000,
        accessExpiresAt: "",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  function updateUser(userId: string, patch: Partial<AiUserAccess>) {
    onChange(value.map((user) => user.id === userId ? { ...user, ...patch, updatedAt: new Date().toISOString() } : user));
  }

  function toggleFeature(user: AiUserAccess, feature: AiFeatureId) {
    const allowedFeatures = user.allowedFeatures.includes(feature)
      ? user.allowedFeatures.filter((item) => item !== feature)
      : [...user.allowedFeatures, feature];
    updateUser(user.id, { allowedFeatures });
  }

  function toggleScope(user: AiUserAccess, scope: "personal" | "hage") {
    const allowedScopes = user.allowedScopes.includes(scope)
      ? user.allowedScopes.filter((item) => item !== scope)
      : [...user.allowedScopes, scope];
    updateUser(user.id, { allowedScopes });
  }

  return (
    <section className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-950/20 p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/70">Névre szóló AI-jogosultság</div>
          <p className="mt-1 text-sm text-slate-300">Az AI csak aktív licenc, bekapcsolt AI-modul és az itt név szerint engedélyezett felhasználó esetén fut.</p>
        </div>
        <button type="button" onClick={addUser} className="rounded-xl bg-violet-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-violet-300">+ Felhasználó hozzáadása</button>
      </div>

      <div className="mt-4 space-y-4">
        {value.length === 0 ? (
          <div className="rounded-xl border border-dashed border-violet-300/30 px-4 py-5 text-sm text-slate-400">Még nincs név szerint AI-ra jogosult felhasználó. Az AI-modul bekapcsolása önmagában nem ad hozzáférést senkinek.</div>
        ) : value.map((user) => (
          <article key={user.id} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Felhasználó neve"><input value={user.displayName} onChange={(event) => updateUser(user.id, { displayName: event.target.value })} placeholder="pl. Keserű Benjámin" className={textInputClass()} /></Field>
              <Field label="Stabil felhasználóazonosító"><input value={user.userId} onChange={(event) => updateUser(user.id, { userId: event.target.value })} placeholder="pl. keseru-benjamin" className={textInputClass()} /></Field>
              <Field label="Napi AI-kérések"><input type="number" min="0" value={user.maxRequestsPerDay} onChange={(event) => updateUser(user.id, { maxRequestsPerDay: Number(event.target.value) })} className={textInputClass()} /></Field>
              <Field label="Havi AI-kérések"><input type="number" min="0" value={user.maxRequestsPerMonth} onChange={(event) => updateUser(user.id, { maxRequestsPerMonth: Number(event.target.value) })} className={textInputClass()} /></Field>
              <Field label="Havi egyéni keret (Ft)"><input type="number" min="0" step="100" value={user.monthlyBudgetHuf} onChange={(event) => updateUser(user.id, { monthlyBudgetHuf: Number(event.target.value) })} className={textInputClass()} /></Field>
              <Field label="AI-hozzáférés lejárata"><input type="datetime-local" value={user.accessExpiresAt ?? ""} onChange={(event) => updateUser(user.id, { accessExpiresAt: event.target.value })} className={textInputClass()} /></Field>
              <label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100"><input type="checkbox" checked={user.enabled} onChange={(event) => updateUser(user.id, { enabled: event.target.checked })} className="h-4 w-4 accent-violet-400" /> AI-hozzáférés aktív</label>
              <button type="button" onClick={() => onChange(value.filter((item) => item.id !== user.id))} className="mt-5 rounded-xl border border-red-400/50 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-400/10">Felhasználó eltávolítása</button>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[280px_1fr]">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200/70">Engedélyezett munkaterek</div>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={user.allowedScopes.includes("personal")} onChange={() => toggleScope(user, "personal")} className="h-4 w-4 accent-violet-400" /> Saját munkatér</label>
                  <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={user.allowedScopes.includes("hage")} onChange={() => toggleScope(user, "hage")} className="h-4 w-4 accent-violet-400" /> HAGE-INVEST munkatér</label>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200/70">Engedélyezett AI-funkciók</div><button type="button" onClick={() => updateUser(user.id, { allowedFeatures: user.allowedFeatures.length === allAiFeatures.length ? [] : [...allAiFeatures] })} className="text-xs font-semibold text-violet-200 hover:text-white">{user.allowedFeatures.length === allAiFeatures.length ? "Összes törlése" : "Összes kijelölése"}</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {aiFeatureOptions.map((feature) => <label key={feature.id} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"><input type="checkbox" checked={user.allowedFeatures.includes(feature.id)} onChange={() => toggleFeature(user, feature.id)} className="h-4 w-4 accent-violet-400" /> {feature.label}</label>)}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminEntrySelector({
  onOpenLicense,
  onLogout,
  devProjects,
  devVersions,
  devWorkSessions,
}: {
  onOpenLicense: () => void;
  onLogout: () => void;
  devProjects: DevProject[];
  devVersions: DevVersion[];
  devWorkSessions: DevWorkSession[];
}) {
  return (
    <BenjadminOperatorConsole
      onOpenLicense={onOpenLicense}
      onLogout={onLogout}
      devProjects={devProjects}
      devVersions={devVersions}
      devWorkSessions={devWorkSessions}
    />
  );
}

export default function LicenseAdminPage() {
  const supabase = createClient();
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [entryUnlocked, setEntryUnlocked] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [store, setStore] = useState<AdminStore | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LicenseDraft>>({});
  const [newLicense, setNewLicense] = useState<LicenseDraft>(() => emptyLicenseDraft());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [machineMetaSaveStatus, setMachineMetaSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [expandedLicenseIds, setExpandedLicenseIds] = useState<string[]>([]);
  const [adminEntryView, setAdminEntryView] = useState<AdminEntryView>("launcher");
  const [expiryReminderLoading, setExpiryReminderLoading] = useState(false);
  const [expiryReminderSummary, setExpiryReminderSummary] = useState("");
  const [devProjects, setDevProjects] = useState<DevProject[]>([]);
  const [devVersions, setDevVersions] = useState<DevVersion[]>([]);
  const [devWorkSessions, setDevWorkSessions] = useState<DevWorkSession[]>([]);

  const cleanEmail = otpEmail.trim().toLowerCase();
  const cleanCode = otpCode.trim();
  const canSendOtp = cleanEmail.length > 3 && cleanEmail.includes("@");
  const canVerifyOtp = otpSent && cleanCode.length === 6;

  const stats = useMemo(() => {
    const licenses = store?.licenses ?? [];
    const devices = store?.devices ?? [];
    return {
      licenses: licenses.length,
      active: licenses.filter((license) => license.status === "active").length,
      devices: devices.length,
      blockedDevices: devices.filter((device) => device.status === "blocked").length,
    };
  }, [store]);

  const filteredLicenses = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return (store?.licenses ?? []).filter((license) => {
      const matchesStatus = statusFilter === "all" || license.status === statusFilter;
      const matchesText = !text || [license.companyName, license.companyId, license.licenseKey]
        .join(" ")
        .toLowerCase()
        .includes(text);
      return matchesStatus && matchesText;
    });
  }, [searchText, statusFilter, store]);

  async function checkAdminEmailAllowed() {
    const response = await fetch("/api/license/admin-login-attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, action: "request_otp" }),
    });
    const data = await response.json();
    if (!response.ok || !data.allowed) {
      setMessage(data.message ?? "Ez az e-mail cím nincs engedélyezve a licencadmin felülethez.");
      return false;
    }
    return true;
  }

  async function sendAdminOtp() {
    if (!canSendOtp || loading) return;
    setLoading(true);
    setMessage("");
    const allowed = await checkAdminEmailAllowed();
    if (!allowed) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: false },
    });

    setLoading(false);
    if (error) {
      setMessage("Nem sikerült elküldeni az admin belépési kódot.");
      return;
    }

    setOtpSent(true);
    setOtpCode("");
    setMessage("Admin belépési kód elküldve e-mailben.");
    window.setTimeout(() => codeInputRef.current?.focus(), 80);
  }

  async function verifyAdminOtp(codeOverride?: string) {
    const tokenCode = (codeOverride ?? cleanCode).trim();
    if (!otpSent || tokenCode.length !== 6 || loading) return;
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: tokenCode,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setMessage("Hibás vagy lejárt admin belépési kód.");
      return;
    }

    setOtpVerified(true);
    localStorage.setItem("dimproLicenseAdminEmail", cleanEmail);

    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (storedAdminKey) {
      setAdminKey(storedAdminKey);
      setMessage("Belépési kód elfogadva. A licencfelület betöltése folyamatban...");
      void loadStore(storedAdminKey, true);
      return;
    }
    setMessage("E-mail OTP belépés sikeres. Add meg az admin kulcsot.");
  }

  async function loadDevCenterOverview(key: string) {
    try {
      const response = await fetch("/api/dev/projects", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        projects?: DevProject[];
        versions?: DevVersion[];
        workSessions?: DevWorkSession[];
      } | null;
      if (!response.ok || !payload?.ok) return;
      setDevProjects(payload.projects || []);
      setDevVersions(payload.versions || []);
      setDevWorkSessions(payload.workSessions || []);
    } catch {
      // A licencadmin önállóan tovább használható akkor is, ha a fejlesztési összesítő átmenetileg nem tölthető be.
    }
  }

  async function loadStore(key = adminKey, skipOtpGuard = false) {
    if (!otpVerified && !skipOtpGuard) {
      setMessage("Előbb az e-mail OTP belépést kell elvégezni.");
      return;
    }
    if (!key.trim()) {
      setMessage("Add meg az admin kulcsot.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/admin", {
        headers: { "x-dimpro-license-admin-key": key.trim() },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (skipOtpGuard) {
          localStorage.removeItem("dimproLicenseAdminKey");
          sessionStorage.removeItem("dimproBenjadminSession");
          window.dispatchEvent(new Event("dimpro-admin-auth-changed"));
        }
        setMessage(data.error ?? "Nem sikerült betölteni a licencadatokat.");
        return;
      }

      if (skipOtpGuard) setOtpVerified(true);
      setEntryUnlocked(true);
      setStore(data.store);
      setDrafts(Object.fromEntries(data.store.licenses.map((license: License) => [license.id, toDraft(license)])));
      localStorage.setItem("dimproLicenseAdminKey", key.trim());
      sessionStorage.setItem("dimproBenjadminSession", "active");
      window.dispatchEvent(new Event("dimpro-admin-auth-changed"));
      void loadDevCenterOverview(key.trim());
      setAdminEntryView("launcher");
      setMessage("Licencadatok betöltve. Válaszd ki, melyik admin felületet nyitod meg.");
      window.setTimeout(() => document.getElementById("admin-entry-selector")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(payload: Record<string, unknown>) {
    if (!otpVerified || !store) {
      setMessage("Nincs aktív admin munkamenet.");
      return;
    }
    if (!adminKey.trim()) {
      setMessage("Hiányzik az admin kulcs.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": adminKey.trim(),
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "A művelet sikertelen.");
        return;
      }
      setStore(data.store);
      setDrafts(Object.fromEntries(data.store.licenses.map((license: License) => [license.id, toDraft(license)])));
      const notification = data.emailNotification as { attempted?: boolean; sent?: boolean; error?: string; to?: string[] } | undefined;
      if (notification?.sent) {
        const recipientCount = notification.to?.length ?? 0;
        setMessage(`Módosítás mentve, a kapcsolattartói e-mail(ek) elküldve${recipientCount ? ` ${recipientCount} címzettnek` : ""}.`);
      } else if (notification?.attempted) {
        setMessage(`Módosítás mentve, de az e-mail küldése nem sikerült${notification.error ? `: ${notification.error}` : "."}`);
      } else if (notification) {
        setMessage(`Módosítás mentve, de nem ment ki e-mail${notification.error ? `: ${notification.error}` : ", mert nincs érvényes kapcsolattartói cím."}`);
      } else {
        setMessage("Módosítás mentve.");
      }
    } catch {
      setMessage("Hálózati vagy szerverhiba történt.");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(licenseId: string, patch: Partial<LicenseDraft>) {
    setDrafts((current) => ({
      ...current,
      [licenseId]: {
        ...current[licenseId],
        ...patch,
      },
    }));
  }

  function toggleLicenseCard(licenseId: string) {
    setExpandedLicenseIds((current) => current.includes(licenseId) ? current.filter((id) => id !== licenseId) : [...current, licenseId]);
  }

  function buildLicenseCopyText(license: License) {
    const modules = license.enabledModules.length ? license.enabledModules.join(", ") : "nincs megadva";
    return [
      `Cég / ügyfél: ${license.companyName}`,
      `Licenckulcs: ${license.licenseKey}`,
      `Státusz: ${statusLabels[license.status] ?? license.status}`,
      `Engedélyezett gépszám: ${license.maxDevices}`,
      `Aktív gépek: ${license.deviceCount}/${license.maxDevices}`,
      `Lejárat: ${formatDateTime(license.expiresAt)}`,
      `Moduljogosultságok: ${modules}`,
      `1. kapcsolattartó: ${license.contactName || "-"} · ${license.contactEmail || "-"} · ${license.contactPhone || "-"}`,
      `2. kapcsolattartó: ${license.secondaryContactName || "-"} · ${license.secondaryContactEmail || "-"} · ${license.secondaryContactPhone || "-"}`,
      ...(license.additionalContacts ?? []).map((contact, index) =>
        `${index + 3}. kapcsolattartó: ${contact.name || "-"} · ${contact.role || "-"} · ${contact.email || "-"} · ${contact.phone || "-"} · e-mail: ${contact.receiveEmail ? "igen" : "nem"}`,
      ),
      `Ügyfélportál: https://license.dimpro.hu/customer`,
      "",
      "Az első indításkor a fenti licenckulcsot kell megadni az aktiváló ablakban.",
    ].join("\n");
  }

  async function copyToClipboard(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage("Nem sikerült a vágólapra másolni. Másold ki kézzel a licenckulcsot.");
    }
  }

  function serializeDraft(draft: LicenseDraft) {
    return {
      ...draft,
      startsAt: toIsoFromLocalInput(draft.startsAt),
      expiresAt: toIsoFromLocalInput(draft.expiresAt),
      currentPeriodEnd: toIsoFromLocalInput(draft.currentPeriodEnd),
      maxDevices: Number(draft.maxDevices),
      subscriptionQuantity: Number(draft.subscriptionQuantity),
      inactiveReleaseDays: Number(draft.inactiveReleaseDays),
      aiMonthlyBudgetHuf: Number(draft.aiMonthlyBudgetHuf),
      aiMaxSingleRequestHuf: Number(draft.aiMaxSingleRequestHuf),
      aiUsers: draft.aiUsers.map((user) => ({
        ...user,
        accessExpiresAt: user.accessExpiresAt ? toIsoFromLocalInput(user.accessExpiresAt) : "",
      })),
    };
  }

  function saveLicense(licenseId: string) {
    const draft = drafts[licenseId];
    if (!draft) return;
    void runAction({ action: "updateLicense", licenseId, ...serializeDraft(draft) });
  }

  function saveDeviceMeta(
    device: Device,
    patch: Partial<Pick<Device, "userName" | "organizationUnit" | "note">>,
  ) {
    setMachineMetaSaveStatus((current) => ({ ...current, [device.id]: "saving" }));
    void runAction({
      action: "updateDeviceMeta",
      deviceId: device.id,
      userName: patch.userName ?? device.userName ?? "",
      organizationUnit: patch.organizationUnit ?? device.organizationUnit ?? "",
      note: patch.note ?? device.note ?? "",
    });
    window.setTimeout(() => setMachineMetaSaveStatus((current) => ({ ...current, [device.id]: "saved" })), 700);
    window.setTimeout(() => setMachineMetaSaveStatus((current) => { const next = { ...current }; delete next[device.id]; return next; }), 2600);
  }

  function createLicense() {
    void runAction({ action: "createLicense", ...serializeDraft(newLicense) });
    setNewLicense(emptyLicenseDraft());
  }

  async function sendLicenseEmailFromAdmin(licenseId: string) {
    if (!adminKey.trim()) {
      setMessage("Hiányzik az admin kulcs.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/admin-mail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": adminKey.trim(),
        },
        body: JSON.stringify({ licenseId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Nem sikerült elküldeni a licenc e-mailt.");
        return;
      }
      const recipientCount = Array.isArray(data.recipients) ? data.recipients.length : 0;
      setMessage(`Licenc e-mail elküldve${recipientCount ? ` ${recipientCount} címzettnek` : ""}.`);
      await loadStore(adminKey, true);
    } catch {
      setMessage("Hálózati vagy szerverhiba történt az e-mail küldés során.");
    } finally {
      setLoading(false);
    }
  }

  async function runExpiryReminderCheck(dryRun: boolean) {
    if (!adminKey.trim()) {
      setMessage("Hiányzik az admin kulcs.");
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
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setExpiryReminderSummary(data.error ?? "A lejárati ellenőrzés nem sikerült.");
        return;
      }
      const run = data.run as {
        scannedLicenses: number;
        stageCandidates: number;
        intendedEmails: number;
        sentEmails: number;
        alreadySentEmails: number;
        failedEmails: number;
      };
      setExpiryReminderSummary(
        `${dryRun ? "Előnézet" : "Futtatás"}: ${run.scannedLicenses} licenc ellenőrizve, ${run.stageCandidates} értesítési fokozat aktív, ${run.intendedEmails} címzett, ${run.sentEmails} ${dryRun ? "küldendő" : "elküldött"}, ${run.alreadySentEmails} korábban elküldött, ${run.failedEmails} hiba.`,
      );
    } catch {
      setExpiryReminderSummary("Hálózati vagy szerverhiba történt a lejárati ellenőrzés során.");
    } finally {
      setExpiryReminderLoading(false);
    }
  }

  function logoutAdmin() {
    setOtpVerified(false);
    setOtpSent(false);
    setOtpCode("");
    setAdminKey("");
    setStore(null);
    setDrafts({});
    setDevProjects([]);
    setDevVersions([]);
    setDevWorkSessions([]);
    setAdminEntryView("launcher");
    localStorage.removeItem("dimproLicenseAdminKey");
    sessionStorage.removeItem("dimproBenjadminSession");
    setEntryUnlocked(false);
    window.dispatchEvent(new Event("dimpro-admin-auth-changed"));
    setMessage("Admin munkamenet lezárva.");
  }

  useEffect(() => {
    const storedEmail = localStorage.getItem("dimproLicenseAdminEmail");
    if (storedEmail) setOtpEmail(storedEmail);

    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    const sessionActive = sessionStorage.getItem("dimproBenjadminSession") === "active";
    if (storedAdminKey && sessionActive) {
      setAdminKey(storedAdminKey);
      setEntryUnlocked(true);
      void loadStore(storedAdminKey, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (store) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setEntryUnlocked(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  useEffect(() => {
    if (otpSent) codeInputRef.current?.focus();
  }, [otpSent]);

  if (!store && !entryUnlocked) {
    return <BenjadminBrandScreen mode="entry" onActivate={() => setEntryUnlocked(true)} />;
  }

  return (
    <main className={store && adminEntryView === "launcher" ? "benjadmin-admin-root" : "min-h-screen bg-[#050812] px-5 py-8 text-slate-100 lg:px-8"}>
      {!store ? (
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-cyan-400/20 bg-slate-950/80 p-8 shadow-[0_0_80px_rgba(34,211,238,0.10)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">DIMPRO licencadmin</p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white md:text-5xl">Licencelés, gépaktiválás és előfizetés-kezelés</h1>
            <p className="mt-5 text-sm leading-7 text-slate-300">Zárt admin felület a DIMPRO licencek, moduljogosultságok, gépek és előfizetés-előkészítő adatok kezelésére.</p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/95 p-6 text-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.25)] md:p-8">
            <h2 className="text-2xl font-bold">Admin belépés</h2>
            {!otpVerified ? (
              <div className="mt-6 space-y-4">
                <Field label="Admin e-mail cím" tone="light">
                  <input value={otpEmail} onChange={(event) => { setOtpEmail(event.target.value); setOtpSent(false); setOtpCode(""); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-500" placeholder="admin@dimpro.hu" />
                </Field>
                <button type="button" onClick={sendAdminOtp} disabled={loading || !canSendOtp} className="w-full rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{loading ? "Küldés..." : "Admin kód küldése"}</button>
                <Field label="6 számjegyű belépési kód" tone="light">
                  <input ref={codeInputRef} value={otpCode} onChange={(event) => { const next = event.target.value.replace(/\D/g, "").slice(0, 6); setOtpCode(next); if (otpSent && next.length === 6 && !loading) window.setTimeout(() => verifyAdminOtp(next), 80); }} disabled={!otpSent} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center text-xl font-bold normal-case tracking-[0.35em] text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-500 disabled:bg-slate-100 disabled:text-slate-500" placeholder="••••••" />
                </Field>
                <button type="button" onClick={() => verifyAdminOtp()} disabled={loading || !canVerifyOtp} className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-50">Kód ellenőrzése</button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <Field label="Admin kulcs" tone="light">
                  <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none placeholder:text-slate-500 focus:border-cyan-500" placeholder="DIMPRO-LICENSE-ADMIN-..." />
                </Field>
                <button type="button" onClick={() => loadStore()} disabled={loading || !adminKey.trim()} className="w-full rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">Dashboard betöltése</button>
              </div>
            )}
            {message ? <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</div> : null}
          </div>
        </section>
      ) : adminEntryView === "launcher" ? (
        <AdminEntrySelector
          onOpenLicense={() => setAdminEntryView("license")}
          onLogout={logoutAdmin}
          devProjects={devProjects}
          devVersions={devVersions}
          devWorkSessions={devWorkSessions}
        />
      ) : (
        <section id="license-dashboard" className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 rounded-[24px] border border-cyan-400/20 bg-slate-950/80 p-5 lg:flex-row lg:items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">DIMPRO licenckezelő</div>
              <h2 className="mt-2 text-3xl font-bold text-white">Licenc-dashboard</h2>
              <p className="mt-2 text-sm text-slate-400">Magyar mezők, moduljogosultságok, lejárati állapotok, gép inaktivitás, audit napló és előfizetés-előkészítés.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAdminEntryView("launcher")} className="rounded-xl border border-lime-300/40 px-4 py-2 text-sm font-semibold text-lime-100 hover:bg-lime-300/10">Belépési felületek</button>
              <a href="/customer" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Ügyféloldali portál</a>
              <a href="/admin/dev" className="rounded-xl border border-lime-300/40 px-4 py-2 text-sm font-semibold text-lime-100 hover:bg-lime-300/10">Fejlesztői kezdőlap</a>
              <a href="/admin/releases" className="rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10">Release feltöltő</a>
              <a href="/admin/drive" className="rounded-xl border border-sky-300/40 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-300/10">Drive API token</a>
              <a href="/drive/drop" className="rounded-xl border border-teal-300/45 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-300/15">Drop csomagkezelő</a>
              <a href="/admin/fajlmuhely-verziok" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Fájlműhely verziók</a>
              <a href="/admin/szerver" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Szerverállapot</a>
              <a href="/admin/release-kozpont" className="rounded-xl border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/10">Release Központ</a>
              <a href="/admin/fejlesztesi-naplo" className="rounded-xl border border-lime-300/40 px-4 py-2 text-sm font-semibold text-lime-100 hover:bg-lime-300/10">Fejlesztési napló</a>
              <button type="button" onClick={logoutAdmin} className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">Admin kilépés</button>
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <StatCard label="Licencek" value={stats.licenses} />
            <StatCard label="Aktív" value={stats.active} />
            <StatCard label="Gépek" value={stats.devices} />
            <StatCard label="Tiltott gépek" value={stats.blockedDevices} />
          </section>

          <section className="rounded-[24px] border border-amber-300/20 bg-amber-950/10 p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-xl font-semibold text-white">Automatikus lejárati értesítések</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">A rendszer naponta 08:00-kor ellenőrzi a licenceket, és 30, 7, 1 nappal a lejárat előtt, valamint a lejárat napján külön e-mailt küld az engedélyezett kapcsolattartóknak és az admin címzetteknek.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void runExpiryReminderCheck(true)} disabled={expiryReminderLoading} className="rounded-xl border border-amber-300/50 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50">Előnézet küldés nélkül</button>
                <button type="button" onClick={() => { if (window.confirm("Elindítod a lejárati értesítések kézi kiküldését? Csak a még nem küldött aktuális fokozatok mennek ki.")) void runExpiryReminderCheck(false); }} disabled={expiryReminderLoading} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-200 disabled:opacity-50">Értesítések futtatása</button>
              </div>
            </div>
            {expiryReminderSummary ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-slate-950/50 px-4 py-3 text-sm text-amber-50">{expiryReminderSummary}</div> : null}
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
            <h2 className="text-xl font-semibold text-white">Új licenc létrehozása</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Licenckulcs"><input value={newLicense.licenseKey} onChange={(event) => setNewLicense((current) => ({ ...current, licenseKey: event.target.value }))} placeholder="Automatikus, ha üres" className={textInputClass()} /></Field>
              <Field label="Cégazonosító"><input value={newLicense.companyId} onChange={(event) => setNewLicense((current) => ({ ...current, companyId: event.target.value }))} placeholder="pl. hage-invest" className={textInputClass()} /></Field>
              <Field label="Cégnév / ügyfél"><input value={newLicense.companyName} onChange={(event) => setNewLicense((current) => ({ ...current, companyName: event.target.value }))} placeholder="Ügyfél neve" className={textInputClass()} /></Field>
              <Field label="Max. gépszám"><input value={newLicense.maxDevices} onChange={(event) => setNewLicense((current) => ({ ...current, maxDevices: event.target.value, subscriptionQuantity: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Státusz"><select value={newLicense.status} onChange={(event) => setNewLicense((current) => ({ ...current, status: event.target.value as LicenseStatus }))} className={textInputClass()}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field>
              <Field label="Kezdés"><input type="datetime-local" value={newLicense.startsAt} onChange={(event) => setNewLicense((current) => ({ ...current, startsAt: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Lejárat"><input type="datetime-local" value={newLicense.expiresAt} onChange={(event) => setNewLicense((current) => ({ ...current, expiresAt: event.target.value, currentPeriodEnd: event.target.value }))} className={textInputClass()} /></Field>
              <div className="flex flex-col justify-end gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Gyors lejárat</div>
                <div className="flex flex-wrap gap-2">{[1, 6, 12].map((month) => <button key={month} type="button" onClick={() => setNewLicense((current) => ({ ...current, expiresAt: addMonthsInputValue(month), currentPeriodEnd: addMonthsInputValue(month) }))} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10">{month === 12 ? "1 év" : `${month} hónap`}</button>)}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Előfizetési csomag"><input value={newLicense.planCode} onChange={(event) => setNewLicense((current) => ({ ...current, planCode: event.target.value }))} className={textInputClass()} /></Field>
              <Field label="Számlázási ciklus"><select value={newLicense.billingInterval} onChange={(event) => setNewLicense((current) => ({ ...current, billingInterval: event.target.value }))} className={textInputClass()}>{Object.entries(billingIntervalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Fizetési státusz"><select value={newLicense.billingStatus} onChange={(event) => setNewLicense((current) => ({ ...current, billingStatus: event.target.value }))} className={textInputClass()}>{Object.entries(billingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Előfizetett gépszám"><input value={newLicense.subscriptionQuantity} onChange={(event) => setNewLicense((current) => ({ ...current, subscriptionQuantity: event.target.value }))} className={textInputClass()} /></Field>
            </div>
            <div className="mt-4"><ModuleCheckboxes value={newLicense.enabledModules} onChange={(modules) => setNewLicense((current) => ({ ...current, enabledModules: modules }))} /></div>
            {newLicense.enabledModules.includes("ai_assistant") ? <>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Céges havi AI-keret (Ft)"><input type="number" min="0" step="100" value={newLicense.aiMonthlyBudgetHuf} onChange={(event) => setNewLicense((current) => ({ ...current, aiMonthlyBudgetHuf: event.target.value }))} className={textInputClass()} /></Field>
                <Field label="Egy AI-kérés maximuma (Ft)"><input type="number" min="0" step="1" value={newLicense.aiMaxSingleRequestHuf} onChange={(event) => setNewLicense((current) => ({ ...current, aiMaxSingleRequestHuf: event.target.value }))} className={textInputClass()} /></Field>
              </div>
              <AiUserAccessEditor value={newLicense.aiUsers} onChange={(aiUsers) => setNewLicense((current) => ({ ...current, aiUsers }))} />
            </> : null}
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">1. kapcsolattartó</div>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <Field label="Név"><input value={newLicense.contactName} onChange={(event) => setNewLicense((current) => ({ ...current, contactName: event.target.value }))} className={textInputClass()} /></Field>
                <Field label="E-mail"><input type="email" value={newLicense.contactEmail} onChange={(event) => setNewLicense((current) => ({ ...current, contactEmail: event.target.value }))} className={textInputClass()} /></Field>
                <Field label="Telefon"><input value={newLicense.contactPhone} onChange={(event) => setNewLicense((current) => ({ ...current, contactPhone: event.target.value }))} className={textInputClass()} /></Field>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">2. kapcsolattartó – opcionális</div>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <Field label="Név"><input value={newLicense.secondaryContactName} onChange={(event) => setNewLicense((current) => ({ ...current, secondaryContactName: event.target.value }))} className={textInputClass()} /></Field>
                <Field label="E-mail"><input type="email" value={newLicense.secondaryContactEmail} onChange={(event) => setNewLicense((current) => ({ ...current, secondaryContactEmail: event.target.value }))} className={textInputClass()} /></Field>
                <Field label="Telefon"><input value={newLicense.secondaryContactPhone} onChange={(event) => setNewLicense((current) => ({ ...current, secondaryContactPhone: event.target.value }))} className={textInputClass()} /></Field>
              </div>
            </div>
            <AdditionalContactsEditor value={newLicense.additionalContacts} onChange={(additionalContacts) => setNewLicense((current) => ({ ...current, additionalContacts }))} />
            <Field label="Admin megjegyzés"><textarea value={newLicense.adminNote} onChange={(event) => setNewLicense((current) => ({ ...current, adminNote: event.target.value }))} className={`${textInputClass()} min-h-24`} /></Field>
            <button type="button" onClick={createLicense} disabled={loading} className="mt-4 rounded-xl bg-cyan-400 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">Új licenc mentése</button>
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
            <h2 className="text-xl font-semibold text-white">Keresés és szűrés</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Keresés cégnév, cégazonosító vagy licenckulcs alapján" className={textInputClass()} />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={textInputClass()}><option value="all">Összes státusz</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
            </div>
          </section>

          <section className="space-y-4">
            {filteredLicenses.map((license) => {
              const draft = drafts[license.id] ?? toDraft(license);
              const isLicenseExpanded = expandedLicenseIds.includes(license.id);
              return (
                <article key={license.id} className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">{license.companyName}</h2>
                      <p className="mt-1 break-all text-sm text-cyan-200">{license.licenseKey}</p>
                      <p className="mt-2 text-sm text-slate-400">{getLicenseTimeLabel(license)} · Lejárat: {formatDateTime(license.expiresAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><div className="rounded-full border border-cyan-400/30 px-4 py-1 text-xs uppercase tracking-[0.18em] text-cyan-100">{statusLabels[license.status]} · {license.deviceCount}/{license.maxDevices} gép</div><button type="button" onClick={() => toggleLicenseCard(license.id)} className="rounded-full border border-slate-600 px-4 py-1 text-xs font-semibold text-slate-100 hover:border-cyan-400/60 hover:bg-cyan-400/10">{isLicenseExpanded ? "Bezárás" : "Megnyitás"}</button></div>
                  </div>
                  {isLicenseExpanded ? (
                    <>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Licenckulcs"><input value={draft.licenseKey} onChange={(event) => updateDraft(license.id, { licenseKey: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Cégazonosító"><input value={draft.companyId} onChange={(event) => updateDraft(license.id, { companyId: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Cégnév / ügyfél"><input value={draft.companyName} onChange={(event) => updateDraft(license.id, { companyName: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Max. gépszám"><input value={draft.maxDevices} onChange={(event) => updateDraft(license.id, { maxDevices: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Státusz"><select value={draft.status} onChange={(event) => updateDraft(license.id, { status: event.target.value as LicenseStatus })} className={textInputClass()}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></Field>
                    <Field label="Kezdés"><input type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft(license.id, { startsAt: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Lejárat"><input type="datetime-local" value={draft.expiresAt} onChange={(event) => updateDraft(license.id, { expiresAt: event.target.value })} className={textInputClass()} /></Field>
                    <div className="flex flex-col justify-end gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Gyors hosszabbítás</div>
                      <div className="flex flex-wrap gap-2">{[1, 6, 12].map((month) => <button key={month} type="button" onClick={() => {
                        const renewedExpiresAt = addMonthsFromLicenseExpiryInputValue(draft.expiresAt, month);
                        updateDraft(license.id, {
                          expiresAt: renewedExpiresAt,
                          currentPeriodEnd: renewedExpiresAt,
                          status: draft.status === "expired" ? "active" : draft.status,
                        });
                      }} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10">+{month === 12 ? "1 év" : `${month} hónap`}</button>)}</div>
                      <div className="text-[11px] leading-4 text-slate-500">Aktív licencnél a jelenlegi lejárattól, lejárt licencnél a mai naptól számol.</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Előfizetési csomag"><input value={draft.planCode} onChange={(event) => updateDraft(license.id, { planCode: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Számlázási ciklus"><select value={draft.billingInterval} onChange={(event) => updateDraft(license.id, { billingInterval: event.target.value })} className={textInputClass()}>{Object.entries(billingIntervalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label="Fizetési státusz"><select value={draft.billingStatus} onChange={(event) => updateDraft(license.id, { billingStatus: event.target.value })} className={textInputClass()}>{Object.entries(billingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label="Előfizetett gépszám"><input value={draft.subscriptionQuantity} onChange={(event) => updateDraft(license.id, { subscriptionQuantity: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Stripe ügyfélazonosító"><input value={draft.stripeCustomerId} onChange={(event) => updateDraft(license.id, { stripeCustomerId: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Stripe előfizetésazonosító"><input value={draft.stripeSubscriptionId} onChange={(event) => updateDraft(license.id, { stripeSubscriptionId: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Fordulónap"><input type="datetime-local" value={draft.currentPeriodEnd} onChange={(event) => updateDraft(license.id, { currentPeriodEnd: event.target.value })} className={textInputClass()} /></Field>
                    <Field label="Inaktív gép naplimit"><input value={draft.inactiveReleaseDays} onChange={(event) => updateDraft(license.id, { inactiveReleaseDays: event.target.value })} className={textInputClass()} /></Field>
                  </div>

                  <div className="mt-4"><ModuleCheckboxes value={draft.enabledModules} onChange={(modules) => updateDraft(license.id, { enabledModules: modules })} /></div>
                  {draft.enabledModules.includes("ai_assistant") ? <>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Céges havi AI-keret (Ft)"><input type="number" min="0" step="100" value={draft.aiMonthlyBudgetHuf} onChange={(event) => updateDraft(license.id, { aiMonthlyBudgetHuf: event.target.value })} className={textInputClass()} /></Field>
                      <Field label="Egy AI-kérés maximuma (Ft)"><input type="number" min="0" step="1" value={draft.aiMaxSingleRequestHuf} onChange={(event) => updateDraft(license.id, { aiMaxSingleRequestHuf: event.target.value })} className={textInputClass()} /></Field>
                    </div>
                    <AiUserAccessEditor value={draft.aiUsers} onChange={(aiUsers) => updateDraft(license.id, { aiUsers })} />
                  </> : null}
                  <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">1. kapcsolattartó</div>
                    <div className="mt-3 grid gap-4 md:grid-cols-3">
                      <Field label="Név"><input value={draft.contactName} onChange={(event) => updateDraft(license.id, { contactName: event.target.value })} className={textInputClass()} /></Field>
                      <Field label="E-mail"><input type="email" value={draft.contactEmail} onChange={(event) => updateDraft(license.id, { contactEmail: event.target.value })} className={textInputClass()} /></Field>
                      <Field label="Telefon"><input value={draft.contactPhone} onChange={(event) => updateDraft(license.id, { contactPhone: event.target.value })} className={textInputClass()} /></Field>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-slate-900/60 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">2. kapcsolattartó – opcionális</div>
                    <div className="mt-3 grid gap-4 md:grid-cols-3">
                      <Field label="Név"><input value={draft.secondaryContactName} onChange={(event) => updateDraft(license.id, { secondaryContactName: event.target.value })} className={textInputClass()} /></Field>
                      <Field label="E-mail"><input type="email" value={draft.secondaryContactEmail} onChange={(event) => updateDraft(license.id, { secondaryContactEmail: event.target.value })} className={textInputClass()} /></Field>
                      <Field label="Telefon"><input value={draft.secondaryContactPhone} onChange={(event) => updateDraft(license.id, { secondaryContactPhone: event.target.value })} className={textInputClass()} /></Field>
                    </div>
                  </div>
                  <AdditionalContactsEditor value={draft.additionalContacts} onChange={(additionalContacts) => updateDraft(license.id, { additionalContacts })} />
                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
                    <Field label="Admin megjegyzés"><textarea value={draft.adminNote} onChange={(event) => updateDraft(license.id, { adminNote: event.target.value })} className={`${textInputClass()} min-h-24`} /></Field>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200"><input type="checkbox" checked={draft.autoReleaseInactiveDevices} onChange={(event) => updateDraft(license.id, { autoReleaseInactiveDevices: event.target.checked })} className="h-4 w-4 accent-cyan-400" /> Automatikus inaktív gép felszabadítás előkészítve</label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => saveLicense(license.id)} disabled={loading} className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">Licenc mentése</button>
                    <button type="button" onClick={() => void copyToClipboard(license.licenseKey, "Licenckulcs vágólapra másolva.")} className="rounded-xl border border-cyan-400/40 px-5 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10">Licenckulcs másolása</button>
                    <button type="button" onClick={() => void copyToClipboard(buildLicenseCopyText(license), "Licencadatok vágólapra másolva.")} className="rounded-xl border border-cyan-400/40 px-5 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10">Licencadatok másolása</button>
                    <button type="button" onClick={() => void copyToClipboard(buildLicenseCopyText(license), "E-mailbe illeszthető licencszöveg vágólapra másolva.")} className="rounded-xl border border-cyan-400/40 px-5 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10">E-mail szöveg másolása</button>
                    <button type="button" onClick={() => { if (!hasNotificationRecipient(license)) { setMessage("Előbb adj meg és ments legalább egy értesítési e-mail címet."); return; } void sendLicenseEmailFromAdmin(license.id); }} className="rounded-xl border border-slate-500/60 px-5 py-2 text-sm font-bold text-slate-200 hover:bg-slate-400/10">Licenc e-mail küldése</button>
                    <button type="button" onClick={() => { if (window.confirm("Biztosan archiválod ezt a licencet?")) void runAction({ action: "archiveLicense", licenseId: license.id }); }} disabled={loading || license.status === "archived"} className="rounded-xl border border-amber-300/50 px-5 py-2 text-sm font-bold text-amber-100 hover:bg-amber-300/10 disabled:opacity-40">Archiválás</button>
                    <button type="button" onClick={() => { if (window.confirm("Biztosan törlöd ezt a licencet és a kapcsolódó gépeket?")) void runAction({ action: "removeLicense", licenseId: license.id }); }} disabled={loading} className="rounded-xl border border-red-400/60 px-5 py-2 text-sm font-bold text-red-100 hover:bg-red-400/10 disabled:opacity-40">Licenc törlése</button>
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-900 text-xs uppercase tracking-[0.18em] text-slate-400"><tr><th className="px-3 py-3">Gépazonosító</th><th className="px-3 py-3">Felhasználó neve</th><th className="px-3 py-3">Szervezeti egység</th><th className="px-3 py-3">Megjegyzés</th><th className="px-3 py-3">Alkalmazás</th><th className="px-3 py-3">Aktiválva</th><th className="px-3 py-3">Utolsó ellenőrzés</th><th className="px-3 py-3">Inaktivitás</th><th className="px-3 py-3">Státusz</th><th className="px-3 py-3">Művelet</th></tr></thead>
                      <tbody>{license.devices.length === 0 ? <tr><td className="px-3 py-4 text-slate-400" colSpan={10}>Még nincs aktivált gép.</td></tr> : license.devices.map((device) => <tr key={device.id} className="border-t border-slate-800"><td className="max-w-[260px] truncate px-3 py-3 font-mono text-xs text-slate-300">{device.machineIdHash}</td><td className="px-3 py-3"><input defaultValue={device.userName ?? ""} onBlur={(event) => saveDeviceMeta(device, { userName: event.currentTarget.value })} placeholder="Név" className="w-40 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-400" /></td><td className="px-3 py-3"><input defaultValue={device.organizationUnit ?? ""} onBlur={(event) => saveDeviceMeta(device, { organizationUnit: event.currentTarget.value })} placeholder="Szervezeti egység" className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-400" /></td><td className="px-3 py-3"><input defaultValue={device.note ?? ""} onBlur={(event) => saveDeviceMeta(device, { note: event.currentTarget.value })} placeholder="Megjegyzés" className="w-56 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-400" /></td><td className="px-3 py-3 text-slate-300">{device.appId}</td><td className="px-3 py-3 text-slate-400">{formatDateTime(device.firstActivatedAt)}</td><td className="px-3 py-3 text-slate-400">{formatDateTime(device.lastOnlineCheckAt)}</td><td className="px-3 py-3 text-slate-300">{getInactivityLabel(device.lastOnlineCheckAt)}</td><td className="px-3 py-3 text-slate-300">{statusLabels[device.status] ?? device.status}</td><td className="flex gap-2 px-3 py-3"><button type="button" onClick={() => { if (window.confirm("Biztosan módosítod a gép státuszát?")) void runAction({ action: "setDeviceStatus", deviceId: device.id, status: device.status === "active" ? "blocked" : "active" }); }} className="rounded-lg border border-cyan-400/40 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-400/10">{device.status === "active" ? "Tiltás" : "Aktiválás"}</button><button type="button" onClick={() => { if (window.confirm("Biztosan törlöd / felszabadítod ezt a gépet?")) void runAction({ action: "removeDevice", deviceId: device.id }); }} className="rounded-lg border border-red-400/40 px-3 py-1 text-xs text-red-100 hover:bg-red-400/10">Törlés</button></td></tr>)}</tbody>
                    </table>
                  </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
            <h2 className="text-xl font-semibold text-white">Audit napló</h2>
            <div className="mt-4 space-y-2">{(store.auditEntries ?? []).length === 0 ? <p className="text-sm text-slate-400">Még nincs megjeleníthető naplóbejegyzés.</p> : (store.auditEntries ?? []).slice(0, 30).map((entry) => <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300"><span className="text-cyan-200">{formatDateTime(entry.createdAt)}</span> · {entry.message}</div>)}</div>
          </section>
        </section>
      )}
    </main>
  );
}