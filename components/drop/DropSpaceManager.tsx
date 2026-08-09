"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  FolderKanban,
  HardDrive,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { HoldActionButton } from "@/components/ui/HoldActionButton";
import DropSpaceMembersPanel from "@/components/drop/DropSpaceMembersPanel";
import DropSpaceProjectLinksPanel from "@/components/drop/DropSpaceProjectLinksPanel";

type SpaceListItem = {
  id: string;
  publicCode: string;
  name: string;
  description: string;
  organizationId: string | null;
  ownerLicenseId: string;
  status: string;
  accessExpiryMode: "license" | "project" | "fixed" | "none";
  licenseEndsAt: string;
  effectiveEndsAt: string;
  effectiveEndSource: "license" | "project" | "fixed";
  runtimeMode: "writable" | "read_only" | "blocked";
  maxMembers: number;
  maxPackages: number;
  storageQuotaBytes: number;
  currentStorageBytes: number;
  allowGuestPackageCreation: boolean;
  allowGuestInvites: boolean;
  memberCount: number;
  projectCount: number;
  packageCount: number;
  ownerMembership: { id: string; email: string; displayName: string; status: string } | null;
  projects: Array<{
    id: string;
    projectId: string;
    projectNameSnapshot: string;
    syncToDock: boolean;
    archiveToDrive: boolean;
  }>;
};

type SpaceForm = {
  name: string;
  description: string;
  organizationId: string;
  ownerLicenseId: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  ownerOrganizationName: string;
  licenseEndsAt: string;
  accessExpiryMode: "license" | "project" | "fixed" | "none";
  accessEndsAt: string;
  projectEndsAt: string;
  graceEndsAt: string;
  maxMembers: number;
  maxPackages: number;
  storageQuotaGb: number;
  allowGuestPackageCreation: boolean;
  allowGuestInvites: boolean;
  projectId: string;
  projectName: string;
  syncToDock: boolean;
  allowDockPackageCreation: boolean;
  archiveToDrive: boolean;
  driveTargetFolderId: string;
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createInitialForm(): SpaceForm {
  const licenseEnd = addMonths(new Date(), 6);
  return {
    name: "",
    description: "",
    organizationId: "",
    ownerLicenseId: "",
    ownerUserId: "",
    ownerName: "",
    ownerEmail: "",
    ownerOrganizationName: "",
    licenseEndsAt: toDateInput(licenseEnd),
    accessExpiryMode: "license",
    accessEndsAt: "",
    projectEndsAt: "",
    graceEndsAt: toDateInput(addDays(licenseEnd, 30)),
    maxMembers: 100,
    maxPackages: 1000,
    storageQuotaGb: 10,
    allowGuestPackageCreation: true,
    allowGuestInvites: false,
    projectId: "",
    projectName: "",
    syncToDock: true,
    allowDockPackageCreation: true,
    archiveToDrive: false,
    driveTargetFolderId: "",
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("hu-HU");
}

function formatBytes(value: number) {
  const gib = value / 1024 ** 3;
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 }).format(gib)} GB`;
}

function runtimeLabel(mode: SpaceListItem["runtimeMode"]) {
  if (mode === "writable") return "Írható";
  if (mode === "read_only") return "Csak olvasható";
  return "Blokkolt";
}

function runtimeClasses(mode: SpaceListItem["runtimeMode"]) {
  if (mode === "writable") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (mode === "read_only") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-300 bg-rose-50 text-rose-900";
}

export default function DropSpaceManager({ adminKey, enabled }: { adminKey: string; enabled: boolean }) {
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SpaceForm>(() => createInitialForm());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  const headers = useMemo(() => ({
    "content-type": "application/json",
    "x-dimpro-license-admin-key": adminKey,
  }), [adminKey]);

  const loadSpaces = useCallback(async () => {
    if (!enabled || !adminKey) {
      setSpaces([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/drop/admin/spaces", {
        headers: { "x-dimpro-license-admin-key": adminKey },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop terek nem tölthetők be.");
      setSpaces(Array.isArray(payload.spaces) ? payload.spaces : []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drop terek betöltése sikertelen.");
    } finally {
      setLoading(false);
    }
  }, [adminKey, enabled]);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const createSpace = useCallback(async () => {
    setSubmitting(true);
    setMessage("");
    try {
      const hasProject = Boolean(form.projectId.trim() || form.projectName.trim());
      const response = await fetch("/api/drop/admin/spaces", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          organizationId: form.organizationId,
          ownerLicenseId: form.ownerLicenseId,
          ownerUserId: form.ownerUserId,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerOrganizationName: form.ownerOrganizationName,
          licenseEndsAt: form.licenseEndsAt,
          accessExpiryMode: form.accessExpiryMode,
          accessEndsAt: form.accessExpiryMode === "fixed" ? form.accessEndsAt : "",
          projectEndsAt: form.accessExpiryMode === "project" ? form.projectEndsAt : "",
          graceEndsAt: form.graceEndsAt,
          maxMembers: form.maxMembers,
          maxPackages: form.maxPackages,
          storageQuotaBytes: Math.round(form.storageQuotaGb * 1024 ** 3),
          allowGuestPackageCreation: form.allowGuestPackageCreation,
          allowGuestInvites: form.allowGuestInvites,
          project: hasProject ? {
            id: form.projectId,
            name: form.projectName,
            syncToDock: form.syncToDock,
            allowDockPackageCreation: form.allowDockPackageCreation,
            archiveToDrive: form.archiveToDrive,
            driveTargetFolderId: form.driveTargetFolderId,
          } : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop tér létrehozása sikertelen.");
      setMessage(`A Drop tér létrejött: ${payload.created?.space?.publicCode || form.name}. A tulajdonosi tagság aktív.`);
      setForm(createInitialForm());
      setFormOpen(false);
      await loadSpaces();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drop tér létrehozása sikertelen.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [form, headers, loadSpaces]);

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) || null;

  const valid = Boolean(
    form.name.trim().length >= 3
      && form.ownerLicenseId.trim()
      && form.ownerName.trim().length >= 2
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())
      && form.licenseEndsAt
      && (!(form.projectId.trim() || form.projectName.trim()) || (form.projectId.trim() && form.projectName.trim()))
      && (form.accessExpiryMode !== "fixed" || form.accessEndsAt)
      && (form.accessExpiryMode !== "project" || form.projectEndsAt)
  );

  return (
    <section className="mt-6 rounded-[1.75rem] border border-teal-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">DROP 0.3.0 · működő térmotor</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Drop hozzáférési terek</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            A fizető licencgazda tartós teret hoz létre. A tulajdonosi tagság automatikusan aktív, a külső meghívottak pedig később külön fizetős licenc nélkül kapcsolhatók hozzá.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadSpaces()}
            disabled={!enabled || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
          ><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés</button>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            disabled={!enabled}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          ><Plus size={16} /> Új hozzáférési tér</button>
        </div>
      </div>

      {!enabled ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          A térmotor feature flagje még zárva van. Az adatbázisséma ellenőrzése után aktiválható.
        </div>
      ) : null}
      {message ? <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-950">{message}</div> : null}

      {formOpen ? (
        <div className="mt-6 rounded-[1.5rem] border border-teal-200 bg-teal-50/60 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">Licencgazdához kötött tér</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Új Drop hozzáférési tér</h3>
            </div>
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600"><X size={18} /></button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <SpaceField label="Tér neve"><input value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} className={inputClass} placeholder="Példa: Várdomb projekt Drop tér" /></SpaceField>
            <SpaceField label="Fizető licenc azonosító"><input value={form.ownerLicenseId} onChange={(event) => setForm((old) => ({ ...old, ownerLicenseId: event.target.value }))} className={inputClass} placeholder="Licenc ID vagy licenckód" /></SpaceField>
            <SpaceField label="Szervezet azonosító"><input value={form.organizationId} onChange={(event) => setForm((old) => ({ ...old, organizationId: event.target.value }))} className={inputClass} placeholder="Opcionális" /></SpaceField>
            <SpaceField label="Térgazda neve"><input value={form.ownerName} onChange={(event) => setForm((old) => ({ ...old, ownerName: event.target.value }))} className={inputClass} /></SpaceField>
            <SpaceField label="Térgazda e-mail-címe"><input type="email" value={form.ownerEmail} onChange={(event) => setForm((old) => ({ ...old, ownerEmail: event.target.value }))} className={inputClass} /></SpaceField>
            <SpaceField label="Térgazda szervezete"><input value={form.ownerOrganizationName} onChange={(event) => setForm((old) => ({ ...old, ownerOrganizationName: event.target.value }))} className={inputClass} placeholder="Opcionális" /></SpaceField>
            <SpaceField label="Licenc lejárata"><input type="date" value={form.licenseEndsAt} onChange={(event) => setForm((old) => ({ ...old, licenseEndsAt: event.target.value }))} className={inputClass} /></SpaceField>
            <SpaceField label="Tér lejárati módja"><select value={form.accessExpiryMode} onChange={(event) => setForm((old) => ({ ...old, accessExpiryMode: event.target.value as SpaceForm["accessExpiryMode"] }))} className={inputClass}><option value="license">Licenc lejáratáig</option><option value="project">Projekt végéig, legfeljebb a licencig</option><option value="fixed">Fix dátumig, legfeljebb a licencig</option><option value="none">Nincs külön lejárat, a licenc a felső korlát</option></select></SpaceField>
            {form.accessExpiryMode === "fixed" ? <SpaceField label="Fix hozzáférési lejárat"><input type="date" value={form.accessEndsAt} onChange={(event) => setForm((old) => ({ ...old, accessEndsAt: event.target.value }))} className={inputClass} /></SpaceField> : null}
            {form.accessExpiryMode === "project" ? <SpaceField label="Projekt tervezett vége"><input type="date" value={form.projectEndsAt} onChange={(event) => setForm((old) => ({ ...old, projectEndsAt: event.target.value }))} className={inputClass} /></SpaceField> : null}
            <SpaceField label="Read-only türelmi idő vége"><input type="date" value={form.graceEndsAt} onChange={(event) => setForm((old) => ({ ...old, graceEndsAt: event.target.value }))} className={inputClass} /></SpaceField>
            <SpaceField label="Maximális tagok"><input type="number" min={1} max={10000} value={form.maxMembers} onChange={(event) => setForm((old) => ({ ...old, maxMembers: Number(event.target.value) }))} className={inputClass} /></SpaceField>
            <SpaceField label="Maximális csomagok"><input type="number" min={1} max={1000000} value={form.maxPackages} onChange={(event) => setForm((old) => ({ ...old, maxPackages: Number(event.target.value) }))} className={inputClass} /></SpaceField>
            <SpaceField label="Tárhelykeret (GB)"><input type="number" min={1} max={10240} value={form.storageQuotaGb} onChange={(event) => setForm((old) => ({ ...old, storageQuotaGb: Number(event.target.value) }))} className={inputClass} /></SpaceField>
            <SpaceField label="Projektazonosító"><input value={form.projectId} onChange={(event) => setForm((old) => ({ ...old, projectId: event.target.value }))} className={inputClass} placeholder="Opcionális project_id" /></SpaceField>
            <SpaceField label="Projekt neve"><input value={form.projectName} onChange={(event) => setForm((old) => ({ ...old, projectName: event.target.value }))} className={inputClass} placeholder="Projektazonosítóval együtt" /></SpaceField>
            <SpaceField label="Drive célmappa azonosító"><input value={form.driveTargetFolderId} onChange={(event) => setForm((old) => ({ ...old, driveTargetFolderId: event.target.value }))} className={inputClass} placeholder="Opcionális" /></SpaceField>
          </div>
          <SpaceField label="Leírás"><textarea value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} className={`${inputClass} mt-4 min-h-24`} placeholder="A tér célja és használati szabályai" /></SpaceField>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SpaceToggle checked={form.allowGuestPackageCreation} onChange={(checked) => setForm((old) => ({ ...old, allowGuestPackageCreation: checked }))} title="Vendég csomagkészítés" text="A közreműködő szerepkör saját csomagot hozhat létre." />
            <SpaceToggle checked={form.allowGuestInvites} onChange={(checked) => setForm((old) => ({ ...old, allowGuestInvites: checked }))} title="Vendégmeghívás" text="Csak külön engedéllyel hívhatnak meg további tagokat." />
            <SpaceToggle checked={form.syncToDock} onChange={(checked) => setForm((old) => ({ ...old, syncToDock: checked }))} title="Megjelenés a Dockban" text="Projektkapcsolat esetén ugyanazok a csomagok jelennek meg." />
            <SpaceToggle checked={form.archiveToDrive} onChange={(checked) => setForm((old) => ({ ...old, archiveToDrive: checked }))} title="Drive-archívum előkészítés" text="A csomag később másolat nélkül archiválható a Drive-ba." />
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 lg:flex-row lg:items-center lg:justify-between">
            <span>A művelet létrehozza a teret és az aktív tulajdonosi tagságot. A fájlfeltöltés ettől még nem kapcsol be.</span>
            <HoldActionButton
              tone="warning"
              durationMs={2000}
              disabled={!enabled || !valid || submitting}
              icon={<ShieldCheck size={17} />}
              label="Drop tér létrehozása · 2 mp"
              holdingLabel="Létrehozáshoz"
              runningLabel="Tér létrehozása…"
              completedLabel="Tér létrehozva"
              onComplete={createSpace}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-4">
        <h3 className="text-lg font-black text-slate-950">Létrehozott terek</h3>
        <span className="text-sm font-bold text-slate-500">{spaces.length} tér</span>
      </div>
      {spaces.length ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {spaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              selected={selectedSpaceId === space.id}
              onManageMembers={() => setSelectedSpaceId((old) => old === space.id ? null : space.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <Database className="mx-auto text-slate-300" size={38} />
          <p className="mt-4 text-sm font-bold text-slate-500">Még nincs létrehozott Drop hozzáférési tér.</p>
        </div>
      )}
      {selectedSpace ? (
        <>
          <DropSpaceMembersPanel
            adminKey={adminKey}
            space={{
              id: selectedSpace.id,
              publicCode: selectedSpace.publicCode,
              name: selectedSpace.name,
              effectiveEndsAt: selectedSpace.effectiveEndsAt,
            }}
            onClose={() => setSelectedSpaceId(null)}
            onChanged={loadSpaces}
          />
          <DropSpaceProjectLinksPanel
            adminKey={adminKey}
            space={{
              id: selectedSpace.id,
              publicCode: selectedSpace.publicCode,
              name: selectedSpace.name,
            }}
            onChanged={loadSpaces}
          />
        </>
      ) : null}
    </section>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100";

function SpaceField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">{label}</span>{children}</label>;
}

function SpaceToggle({ checked, onChange, title, text }: { checked: boolean; onChange: (checked: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-teal-100 bg-white p-4">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" />
      <span><strong className="block text-sm text-slate-950">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{text}</span></span>
    </label>
  );
}

function SpaceCard({ space, selected, onManageMembers }: { space: SpaceListItem; selected: boolean; onManageMembers: () => void }) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">{space.publicCode}</p>
          <h4 className="mt-2 text-xl font-black text-slate-950">{space.name}</h4>
          {space.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{space.description}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${runtimeClasses(space.runtimeMode)}`}>{runtimeLabel(space.runtimeMode)}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SpaceMeta icon={Building2} label="Térgazda" value={space.ownerMembership?.displayName || "Nincs"} note={space.ownerMembership?.email || space.ownerLicenseId} />
        <SpaceMeta icon={CalendarClock} label="Érvényesség" value={formatDate(space.effectiveEndsAt)} note={`Forrás: ${space.effectiveEndSource}`} />
        <SpaceMeta icon={Users} label="Tagság" value={`${space.memberCount} / ${space.maxMembers} fő`} note={space.allowGuestPackageCreation ? "Vendég csomagkészítés engedélyezve" : "Vendég csomagkészítés tiltva"} />
        <SpaceMeta icon={FolderKanban} label="Projektek" value={`${space.projectCount} kapcsolat`} note={space.projects[0]?.projectNameSnapshot || "Nincs projektkapcsolat"} />
        <SpaceMeta icon={CheckCircle2} label="Csomagok" value={`${space.packageCount} / ${space.maxPackages} db`} note="A térhez rendelt csomagok" />
        <SpaceMeta icon={HardDrive} label="Tárhely" value={`${formatBytes(space.currentStorageBytes)} / ${formatBytes(space.storageQuotaBytes)}`} note="A feltöltés még központilag tiltott" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onManageMembers}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black transition ${selected ? "border-cyan-700 bg-cyan-700 text-white" : "border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-50"}`}
        ><Users size={15} /> {selected ? "Tagságkezelő bezárása" : "Tagok kezelése"}</button>
      </div>
      {space.projects.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {space.projects.map((project) => (
            <span key={project.id} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-900">
              {project.projectNameSnapshot}{project.syncToDock ? " · Dock" : ""}{project.archiveToDrive ? " · Drive" : ""}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SpaceMeta({ icon: Icon, label, value, note }: { icon: typeof Building2; label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-teal-700"><Icon size={16} /><span className="text-[10px] font-black uppercase tracking-[0.1em]">{label}</span></div>
      <strong className="mt-2 block text-sm text-slate-950">{value}</strong>
      <span className="mt-1 block break-all text-xs leading-5 text-slate-500">{note}</span>
    </div>
  );
}
