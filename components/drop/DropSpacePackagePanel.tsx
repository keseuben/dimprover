"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  Clipboard,
  FileArchive,
  FileStack,
  FolderKanban,
  Image as ImageIcon,
  MailCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { HoldActionButton } from "@/components/ui/HoldActionButton";
import DropPackageQuarantineUpload from "@/components/drop/DropPackageQuarantineUpload";
import DropUploadRulesDialog, { DropRulesButton } from "@/components/drop/DropUploadRulesDialog";

type ActiveMember = {
  id: string;
  displayName: string;
  email: string;
  organizationName: string | null;
  role: string;
  isSelf: boolean;
};

type SpacePackage = {
  id: string;
  publicCode: string;
  mode: "image" | "file" | "zip" | "mixed";
  title: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  status: string;
  visibility: "space_members" | "selected_members" | "project_members" | "private";
  uploaderName: string;
  uploaderEmail: string;
  expiresAt: string;
  createdAt: string;
  currentFileCount: number;
  currentTotalSizeBytes: number;
  isOwn: boolean;
  canUpload: boolean;
};

type UploadReadiness = {
  uploadReady: boolean;
  quarantineUploadReady: boolean;
  resumableUploadReady: boolean;
  scannerAvailable: boolean;
  publicDownloadReady: boolean;
  maxFileBytes: number;
};

type PackagePayload = {
  packages: SpacePackage[];
  activeMembers: ActiveMember[];
  projects: Array<{ id: string; name: string }>;
  creation: {
    ready: boolean;
    permissionGranted: boolean;
    runtimeMode: "writable" | "read_only" | "blocked";
    fileUploadEnabled: boolean;
    uploadReadiness: UploadReadiness;
    note: string;
  };
};

type CreatedResult = {
  package: { id: string; public_code: string; title: string; mode: string; expires_at: string };
  pin: string;
  links: { upload: string; view: string; download: string; report: string };
};

type FormState = {
  mode: "image" | "file" | "zip" | "mixed";
  title: string;
  description: string;
  projectId: string;
  retentionDays: number;
  visibility: "space_members" | "selected_members" | "private";
  selectedMembershipIds: string[];
};

const initialForm: FormState = {
  mode: "image",
  title: "",
  description: "",
  projectId: "",
  retentionDays: 7,
  visibility: "selected_members",
  selectedMembershipIds: [],
};

const modeLabels = {
  image: "KépDrop",
  file: "FájlDrop",
  zip: "ZIP-csomag",
  mixed: "Vegyes csomag",
} as const;

const visibilityLabels = {
  space_members: "Minden tértag",
  selected_members: "Kiválasztott tértagok",
  project_members: "Projekt tagjai",
  private: "Privát",
} as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: index > 1 ? 1 : 0 }).format(current)} ${units[index]}`;
}

export default function DropSpacePackagePanel() {
  const [data, setData] = useState<PackagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [emailSummary, setEmailSummary] = useState("");
  const [copied, setCopied] = useState("");
  const [creationRulesAccepted, setCreationRulesAccepted] = useState(false);
  const [rulesAcceptedByPackage, setRulesAcceptedByPackage] = useState<Record<string, boolean>>({});
  const [rulesDialog, setRulesDialog] = useState<{ type: "create" | "upload"; packageId?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/drop/spaces/packages", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop tér csomagadatai nem tölthetők be.");
      const next = payload as PackagePayload;
      setData(next);
      setSelectedPackageId((current) => current && next.packages.some((item) => item.id === current)
        ? current
        : next.packages[0]?.id || null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drop tér csomagadatai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPackage = useMemo(
    () => data?.packages.find((item) => item.id === selectedPackageId) || null,
    [data?.packages, selectedPackageId],
  );
  const availableMembers = useMemo(
    () => (data?.activeMembers || []).filter((member) => !member.isSelf),
    [data?.activeMembers],
  );

  const toggleMember = useCallback((id: string) => {
    setForm((old) => ({
      ...old,
      selectedMembershipIds: old.selectedMembershipIds.includes(id)
        ? old.selectedMembershipIds.filter((item) => item !== id)
        : [...old.selectedMembershipIds, id],
    }));
  }, []);

  const createPackage = useCallback(async () => {
    if (!creationRulesAccepted || submitting) return;
    setSubmitting(true);
    setMessage("");
    setCreated(null);
    setEmailSummary("");
    try {
      const response = await fetch("/api/drop/spaces/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, rulesAccepted: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A csomag létrehozása sikertelen.");
      const result = payload.created as CreatedResult;
      setCreated(result);
      setEmailSummary(payload.emailNotification?.note || payload.warning || "A csomag létrejött.");
      setForm(initialForm);
      setCreationRulesAccepted(false);
      setFormOpen(false);
      await load();
      setSelectedPackageId(result.package.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csomag létrehozása sikertelen.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [creationRulesAccepted, form, load, submitting]);

  const copy = useCallback(async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }, []);

  const valid = Boolean(
    data?.creation.ready
      && form.title.trim()
      && creationRulesAccepted
      && (form.visibility !== "selected_members" || form.selectedMembershipIds.length > 0),
  );

  const dialogAccepted = rulesDialog?.type === "create"
    ? creationRulesAccepted
    : Boolean(rulesDialog?.packageId && rulesAcceptedByPackage[rulesDialog.packageId]);

  const setDialogAccepted = useCallback((accepted: boolean) => {
    if (rulesDialog?.type === "create") setCreationRulesAccepted(accepted);
    else if (rulesDialog?.packageId) {
      setRulesAcceptedByPackage((old) => ({ ...old, [rulesDialog.packageId!]: accepted }));
    }
  }, [rulesDialog]);

  return (
    <section className="mt-5 rounded-[1.75rem] border border-cyan-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">DROP 1.2.12 · térmunkatér</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Csomagok és fájlfeltöltés</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Válassz egy mini csomagkártyát, majd használd az alatta megjelenő teljes szélességű feltöltőteret.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés</button>
          <button type="button" onClick={() => setFormOpen(true)} disabled={!data?.creation.permissionGranted} className="inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-4 py-2.5 text-sm font-black text-white disabled:bg-slate-300"><Plus size={17} /> Új csomag</button>
        </div>
      </div>

      {data?.creation ? (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${data.creation.fileUploadEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {data.creation.note}
        </div>
      ) : null}
      {message ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{message}</div> : null}

      {created ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3"><MailCheck className="mt-0.5 text-emerald-700" size={20} /><div><strong className="text-sm text-emerald-950">A csomag létrejött és az e-mailes kézbesítés elindult.</strong><p className="mt-1 text-xs leading-5 text-emerald-900">{emailSummary}</p></div></div>
          <details className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-black text-slate-700">Adminisztratív tartalék adatok</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <CopyRow label="Csomagkód" value={created.package.public_code} copied={copied} onCopy={copy} />
              <CopyRow label="PIN" value={created.pin.replace(/(\d{3})(\d{3})/, "$1-$2")} copyValue={created.pin} copied={copied} onCopy={copy} />
            </div>
          </details>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {(data?.packages || []).map((item) => (
            <MiniPackageCard
              key={item.id}
              item={item}
              selected={item.id === selectedPackageId}
              rulesAccepted={Boolean(rulesAcceptedByPackage[item.id])}
              onSelect={() => setSelectedPackageId(item.id)}
              onRules={() => setRulesDialog({ type: "upload", packageId: item.id })}
            />
          ))}
          {!data?.packages.length ? <div className="w-full min-w-[22rem] rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm font-bold text-slate-500">Még nincs csomag ebben a Drop térben.</div> : null}
        </div>
      </div>

      {selectedPackage ? (
        <div className="mt-4">
          <DropPackageQuarantineUpload
            packageInfo={{ id: selectedPackage.id, publicCode: selectedPackage.publicCode, title: selectedPackage.title, mode: selectedPackage.mode }}
            canUpload={selectedPackage.canUpload}
            rulesAccepted={Boolean(rulesAcceptedByPackage[selectedPackage.id])}
            onOpenRules={() => setRulesDialog({ type: "upload", packageId: selectedPackage.id })}
            onFilesChanged={() => void load()}
          />
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Új Drop csomag</p><h3 className="mt-2 text-2xl font-black text-slate-950">Csomag létrehozása</h3></div><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-300 p-2.5 text-slate-600"><X size={18} /></button></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Csomag neve"><input value={form.title} onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))} className={inputClass} /></Field>
              <Field label="Típus"><select value={form.mode} onChange={(event) => setForm((old) => ({ ...old, mode: event.target.value as FormState["mode"] }))} className={inputClass}><option value="image">KépDrop</option><option value="file">FájlDrop</option><option value="mixed">Vegyes csomag</option><option value="zip">ZIP-csomag</option></select></Field>
              <Field label="Kapcsolódó projekt"><select value={form.projectId} onChange={(event) => setForm((old) => ({ ...old, projectId: event.target.value }))} className={inputClass}><option value="">Nincs projekt</option>{(data?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
              <Field label="Megőrzés"><select value={form.retentionDays} onChange={(event) => setForm((old) => ({ ...old, retentionDays: Number(event.target.value) }))} className={inputClass}><option value={1}>1 nap</option><option value={3}>3 nap</option><option value={7}>7 nap</option><option value={14}>14 nap</option><option value={30}>30 nap</option></select></Field>
            </div>
            <Field label="Leírás"><textarea value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} rows={3} className={`${inputClass} mt-4`} /></Field>
            <div className="mt-4"><Field label="Láthatóság"><select value={form.visibility} onChange={(event) => setForm((old) => ({ ...old, visibility: event.target.value as FormState["visibility"] }))} className={inputClass}><option value="selected_members">Kiválasztott tértagok</option><option value="space_members">Minden aktív tértag</option><option value="private">Privát</option></select></Field></div>
            {form.visibility === "selected_members" ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-[0.1em] text-slate-600">Címzettek</p><div className="mt-3 grid gap-2 md:grid-cols-2">{availableMembers.map((member) => <label key={member.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={form.selectedMembershipIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="mt-0.5" /><span><strong className="block text-xs text-slate-950">{member.displayName}</strong><span className="mt-1 block text-[11px] text-slate-500">{member.email}</span></span></label>)}</div></div> : null}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><DropRulesButton accepted={creationRulesAccepted} onClick={() => setRulesDialog({ type: "create" })} label="Csomaglétrehozási szabályok" /><HoldActionButton tone="success" durationMs={2000} disabled={!valid || submitting} icon={<ShieldCheck size={16} />} label="Csomag létrehozása · 2 mp" holdingLabel="Létrehozáshoz" runningLabel="Létrehozás…" completedLabel="Létrehozva" onComplete={createPackage} /></div>
          </div>
        </div>
      ) : null}

      <DropUploadRulesDialog
        open={Boolean(rulesDialog)}
        onClose={() => setRulesDialog(null)}
        accepted={dialogAccepted}
        onAcceptedChange={setDialogAccepted}
        resumableEnabled={Boolean(data?.creation.uploadReadiness?.resumableUploadReady)}
        scannerAvailable={Boolean(data?.creation.uploadReadiness?.scannerAvailable)}
        publicDownloadReady={Boolean(data?.creation.uploadReadiness?.publicDownloadReady)}
      />
    </section>
  );
}

function MiniPackageCard({ item, selected, rulesAccepted, onSelect, onRules }: { item: SpacePackage; selected: boolean; rulesAccepted: boolean; onSelect: () => void; onRules: () => void }) {
  const Icon = item.mode === "image" ? ImageIcon : item.mode === "zip" ? FileArchive : item.mode === "mixed" ? Boxes : FileStack;
  return (
    <article className={`w-64 shrink-0 rounded-2xl border p-4 transition ${selected ? "border-cyan-600 bg-cyan-50 shadow-md" : "border-slate-200 bg-slate-50 hover:border-cyan-300"}`}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-200 bg-white text-cyan-800"><Icon size={17} /></span><span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-600">{item.isOwn ? "Saját" : "Megosztott"}</span></div>
        <p className="mt-3 truncate text-[10px] font-black uppercase tracking-[0.1em] text-cyan-700">{item.publicCode}</p>
        <h4 className="mt-1 line-clamp-2 min-h-10 text-sm font-black text-slate-950">{item.title}</h4>
        <div className="mt-3 grid gap-1 text-[10px] font-semibold text-slate-600"><span>{modeLabels[item.mode]} · {item.currentFileCount} fájl</span><span>{formatBytes(item.currentTotalSizeBytes)} · {visibilityLabels[item.visibility]}</span><span>Lejár: {formatDate(item.expiresAt)}</span></div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2"><DropRulesButton accepted={rulesAccepted} onClick={onRules} label="Szabályok" />{item.projectId ? <Link href={`/projektkapu/project/${encodeURIComponent(item.projectId)}/dock`} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"><FolderKanban size={13} /> Projekt</Link> : null}</div>
    </article>
  );
}

function CopyRow({ label, value, copyValue, copied, onCopy }: { label: string; value: string; copyValue?: string; copied: string; onCopy: (label: string, value: string) => Promise<void> }) {
  return <div className="rounded-xl border border-emerald-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-2 break-all font-mono text-sm font-black text-slate-800">{value}</p><button type="button" onClick={() => void onCopy(label, copyValue || value)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">{copied === label ? <Check size={14} /> : <Clipboard size={14} />} {copied === label ? "Másolva" : "Másolás"}</button></div>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.1em] text-slate-600">{label}</span>{children}</label>; }
