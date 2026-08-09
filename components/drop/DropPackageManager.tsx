"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Boxes,
  Check,
  Clipboard,
  Database,
  FileArchive,
  FileStack,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  Send as SendIcon,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type {
  DropAccessPurpose,
  DropCapabilityLinks,
  DropPackageListItem,
  DropPackageMode,
} from "@/app/lib/drop/dropTypes";
import { HoldActionButton } from "@/components/ui/HoldActionButton";
import DropSpaceManager from "@/components/drop/DropSpaceManager";

type AuthState = "checking" | "authorized" | "blocked";
type FeatureResponse = {
  version?: string;
  stage?: string;
  releaseGateEnabled?: boolean;
  coreEnabled?: boolean;
  uploadEnabled?: boolean;
  flags?: Record<string, boolean>;
};
type HealthResponse = {
  coreReady?: boolean;
  readiness?: {
    databaseConfigured?: boolean;
    databaseSchema?: boolean;
    tokenSecurity?: boolean;
    packageEngine?: boolean;
    publicUpload?: boolean;
    emailNotifications?: boolean;
    spacesSchema?: boolean;
    spacesEngine?: boolean;
  };
  database?: {
    migrationMode?: string;
    schema?: {
      missingTables?: string[];
      checks?: Array<{ table: string; ready: boolean; errorCode?: string | null }>;
      schemaVersion?: {
        expected?: string;
        actual?: string | null;
        migrationCount?: number | null;
        bootstrapId?: string | null;
        ready?: boolean;
        errorCode?: string | null;
      };
    };
  };
};
type EmailNotificationSummary = {
  enabled: boolean;
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  note: string;
  recipients: Array<{
    name: string;
    email: string;
    status: "sent" | "failed";
    error?: string;
  }>;
};
type CreatedResult = {
  package: { id: string; public_code: string; title: string; mode: DropPackageMode; expires_at: string };
  pin: string;
  links: DropCapabilityLinks;
  emailNotification?: EmailNotificationSummary;
};
type IssuedLinkResult = {
  packageTitle: string;
  purpose: DropAccessPurpose;
  link: string;
  tokenHint: string;
  expiresAt: string;
  revokedTokenCount: number;
};

type PreviewResult = {
  mode: DropPackageMode;
  title: string;
  projectName: string | null;
  uploader: { name: string; email: string };
  schedule: { retentionDays: number; expiresAt: string; graceExpiresAt: string };
  counts: { recipients: number; invitationRecipients: number; finalReportRecipients: number; groups: number };
  groups: Array<{ name: string; code: string; sortOrder: number; sequenceStart: number }>;
  limits: { maxFileCount: number; maxFileSizeBytes: number; maxTotalSizeBytes: number };
  security: { pinSource: "automatic" | "supplied"; capabilityPurposes: readonly string[] };
  commit: { databaseRequired: true; filesPersisted: false; uploadEnabled: false };
};

type FormState = {
  mode: DropPackageMode;
  title: string;
  description: string;
  projectName: string;
  uploaderName: string;
  uploaderEmail: string;
  retentionDays: number;
  pin: string;
  recipientsText: string;
  groupsText: string;
};

const initialForm: FormState = {
  mode: "file",
  title: "",
  description: "",
  projectName: "",
  uploaderName: "",
  uploaderEmail: "",
  retentionDays: 7,
  pin: "",
  recipientsText: "",
  groupsText: "",
};

const packageModes: Array<{ mode: DropPackageMode; icon: typeof ImageIcon; title: string; note: string }> = [
  { mode: "image", icon: ImageIcon, title: "KépDrop", note: "Mobilos fotócsomag HexaUpload felülettel, optimalizálással, csoportokkal és PDF-riporttal." },
  { mode: "file", icon: FileStack, title: "FájlDrop", note: "Dokumentum- és műszaki fájlcsomag legfeljebb 500 MB-os fájlokkal és folytatható feltöltéssel." },
  { mode: "zip", icon: FileArchive, title: "ZIP-csomag", note: "ZIP-fájl biztonságos átadása karanténnal, vírusellenőrzéssel és naplózott letöltéssel." },
  { mode: "mixed", icon: Boxes, title: "Vegyes csomag", note: "Képek, dokumentumok és ZIP-fájlok egyetlen CsomagDrop átadásban." },
];

function parseRecipients(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", email = "", company = ""] = line.split("|").map((part) => part.trim());
      return { name, email, company, role: "invitee" as const };
    });
}

function parseGroups(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ name: line, sortOrder: index, sequenceStart: 1 }));
}

function buildPackagePayload(form: FormState) {
  return {
    mode: form.mode,
    title: form.title,
    description: form.description,
    projectName: form.projectName,
    uploaderName: form.uploaderName,
    uploaderEmail: form.uploaderEmail,
    retentionDays: form.retentionDays,
    pin: form.pin,
    recipients: parseRecipients(form.recipientsText),
    groups: parseGroups(form.groupsText),
  };
}

export default function DropPackageManager() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [adminKey, setAdminKey] = useState("");
  const [featureState, setFeatureState] = useState<FeatureResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [packages, setPackages] = useState<DropPackageListItem[]>([]);
  const [message, setMessage] = useState("Licencadmin jogosultság ellenőrzése…");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [issuedLink, setIssuedLink] = useState<IssuedLinkResult | null>(null);
  const [actionBusy, setActionBusy] = useState("");
  const [copied, setCopied] = useState("");
  const createdCardRef = useRef<HTMLDivElement | null>(null);

  const apiHeaders = useMemo(
    () => ({ "content-type": "application/json", "x-dimpro-license-admin-key": adminKey }),
    [adminKey],
  );

  const loadPackages = useCallback(async (key: string, features?: FeatureResponse | null) => {
    if (!features?.flags?.packageEngineEnabled) {
      setPackages([]);
      return;
    }
    const response = await fetch("/api/drop/admin/packages", {
      headers: { "x-dimpro-license-admin-key": key },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "A csomaglista nem tölthető be.");
    setPackages(Array.isArray(payload.packages) ? payload.packages : []);
  }, []);

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setAuthState("blocked");
      setMessage("Nincs aktív licencadmin munkamenet.");
      return;
    }
    setAdminKey(key);
    try {
      const authResponse = await fetch("/api/license/admin", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      if (!authResponse.ok) {
        setAuthState("blocked");
        setMessage("A licencadmin munkamenet lejárt vagy nem jogosult.");
        return;
      }

      const [featureResponse, healthResponse] = await Promise.all([
        fetch("/api/drop/features", { cache: "no-store" }),
        fetch("/api/drop/health", { cache: "no-store" }),
      ]);
      const features = (await featureResponse.json()) as FeatureResponse;
      const healthPayload = (await healthResponse.json()) as HealthResponse;
      setFeatureState(features);
      setHealth(healthPayload);
      setAuthState("authorized");
      await loadPackages(key, features).catch((error) => setMessage(error instanceof Error ? error.message : "A csomaglista nem tölthető be."));
      setMessage(
        healthPayload.coreReady
          ? "A DIMPRO CsomagDrop aktív. A 500 MB-os fájlok folytathatóan feltölthetők, karanténnal és vírusellenőrzéssel."
          : "A DROP 0.2.0 kód elkészült, de a Supabase-séma és/vagy a biztonsági környezeti változók aktiválása még szükséges.",
      );
    } catch (error) {
      setAuthState("blocked");
      setMessage(error instanceof Error ? error.message : "A Drop modul állapota nem tölthető be.");
    }
  }, [loadPackages]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!created) return;
    const timer = window.setTimeout(() => {
      createdCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [created]);

  async function previewPackage() {
    setSubmitting(true);
    setPreview(null);
    try {
      const response = await fetch("/api/drop/admin/packages/preview", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(buildPackagePayload(form)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A csomag-előnézet ellenőrzése sikertelen.");
      setPreview(payload.preview as PreviewResult);
      setMessage("Az ellenőrző előnézet elkészült. Nem történt adatbázismentés, PIN- vagy tokengenerálás.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csomag-előnézet ellenőrzése sikertelen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createPackage() {
    setSubmitting(true);
    setCreated(null);
    try {
      const response = await fetch("/api/drop/admin/packages", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(buildPackagePayload(form)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A Drop csomag létrehozása sikertelen.");
      const emailNotification = payload.emailNotification as EmailNotificationSummary | undefined;
      setCreated({ ...(payload.created as CreatedResult), emailNotification });
      setPreview(null);
      setIssuedLink(null);
      setFormOpen(false);
      setMessage(
        emailNotification?.sent
          ? `A Drop csomag létrejött, és ${emailNotification.sent} meghívó e-mailt elküldtünk. A PIN-t és a hozzáférési linkeket most kell biztonságosan elmenteni.`
          : emailNotification?.failed
            ? `A Drop csomag létrejött, de az e-mail küldésnél ${emailNotification.failed} hiba történt. A csomag és a hozzáférési adatok ettől még érvényesek.`
            : "A Drop csomag létrejött. A PIN-t és a hozzáférési linkeket most kell biztonságosan elmenteni.",
      );
      setForm(initialForm);
      await loadPackages(adminKey, featureState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Drop csomag létrehozása sikertelen.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  async function changePackageStatus(item: DropPackageListItem, targetStatus: "upload_closed" | "expiring") {
    const busyKey = `status:${item.id}`;
    setActionBusy(busyKey);
    try {
      const response = await fetch(`/api/drop/admin/packages/${encodeURIComponent(item.id)}/status`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ targetStatus, reason: "Licencadmin kezelőfelületi művelet" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A csomagállapot módosítása sikertelen.");
      setMessage(`A(z) ${item.public_code} csomag új állapota: ${payload.package?.status || targetStatus}. Visszavont tokenek: ${payload.revokedTokenCount || 0}.`);
      await loadPackages(adminKey, featureState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A csomagállapot módosítása sikertelen.");
      throw error;
    } finally {
      setActionBusy("");
    }
  }

  async function reissuePackageLink(item: DropPackageListItem, purpose: DropAccessPurpose) {
    const busyKey = `reissue:${item.id}:${purpose}`;
    setActionBusy(busyKey);
    setIssuedLink(null);
    try {
      const response = await fetch(`/api/drop/admin/packages/${encodeURIComponent(item.id)}/tokens/${purpose}/reissue`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Az új hozzáférési link kiadása sikertelen.");
      setIssuedLink({ packageTitle: item.title, ...payload.issued } as IssuedLinkResult);
      setMessage(`Új ${purpose} link készült. A linket most kell biztonságosan elmenteni.`);
      await loadPackages(adminKey, featureState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az új hozzáférési link kiadása sikertelen.");
      throw error;
    } finally {
      setActionBusy("");
    }
  }

  async function revokePackageToken(
    item: DropPackageListItem,
    token: DropPackageListItem["accessTokens"][number],
  ) {
    const busyKey = `revoke:${token.id}`;
    setActionBusy(busyKey);
    try {
      const response = await fetch(`/api/drop/admin/packages/${encodeURIComponent(item.id)}/tokens/by-id/${encodeURIComponent(token.id)}/revoke`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ reason: "Licencadmin kezelőfelületi visszavonás" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "A token visszavonása sikertelen.");
      setMessage(`A(z) ${token.purpose} token visszavonása megtörtént.`);
      await loadPackages(adminKey, featureState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A token visszavonása sikertelen.");
      throw error;
    } finally {
      setActionBusy("");
    }
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  if (authState !== "authorized") {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center">
          <div className="w-full rounded-[2rem] border border-cyan-300/20 bg-slate-900 p-7 shadow-[0_0_90px_rgba(34,211,238,0.08)]">
            <ShieldCheck size={34} className="text-cyan-300" aria-hidden="true" />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-cyan-300">Védett belső felület</p>
            <h1 className="mt-3 text-3xl font-black">{authState === "checking" ? "Jogosultság ellenőrzése" : "Licencadmin belépés szükséges"}</h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">{message}</p>
            <Link href="/admin" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Licencadmin megnyitása</Link>
          </div>
        </section>
      </main>
    );
  }

  const coreReady = Boolean(health?.coreReady);

  return (
    <main className="min-h-screen bg-[#eef4f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Link href="/drive" className="inline-flex items-center gap-2 text-sm font-black text-cyan-800 hover:text-cyan-950"><ArrowLeft size={17} /> Vissza a Drive-hoz</Link>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-cyan-700">DIMPRO Drive kapcsolódó modul</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">DIMPRO CsomagDrop kezelőközpont</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">A meglévő 500 MB-os meghívásos csomagátadás kezelőfelülete. KépDrop, FájlDrop, ZIP és vegyes csomag ugyanazt a biztonságos motort használja.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/drive/drop/public-workflows" className="inline-flex items-center gap-2 rounded-xl border border-teal-600 bg-teal-50 px-4 py-2.5 text-sm font-black text-teal-900"><SendIcon size={16} /> Send és Beküldőkapu</Link>
            <Link href="/drive/drop/operations" className="inline-flex items-center gap-2 rounded-xl border border-amber-500 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-950"><Activity size={16} /> Üzemeltetés</Link>
            <Link href="https://drop.dimpro.hu" target="_blank" className="rounded-xl border border-cyan-600 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-900">Nyilvános Drop</Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700"><RefreshCw size={17} /> Frissítés</button>
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
            ><Plus size={17} /> Új CsomagDrop</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <StatusCard icon={ShieldCheck} label="Release gate" value={featureState?.releaseGateEnabled ? "Bekapcsolva" : "Kikapcsolva"} ready={Boolean(featureState?.releaseGateEnabled)} />
          <StatusCard icon={Database} label="Supabase séma" value={health?.readiness?.databaseSchema ? "Kész" : "SQL szükséges"} ready={Boolean(health?.readiness?.databaseSchema)} />
          <StatusCard icon={KeyRound} label="Tokenvédelem" value={health?.readiness?.tokenSecurity ? "Kész" : "Titkok hiányoznak"} ready={Boolean(health?.readiness?.tokenSecurity)} />
          <StatusCard icon={Activity} label="Csomagmotor" value={coreReady ? "Aktív" : "Védetten tiltva"} ready={coreReady} />
          <StatusCard icon={Mail} label="E-mail értesítés" value={health?.readiness?.emailNotifications ? "Aktív" : "Nincs aktiválva"} ready={Boolean(health?.readiness?.emailNotifications)} />
          <StatusCard icon={Users} label="Térmotor" value={health?.readiness?.spacesEngine ? "Aktív" : health?.readiness?.spacesSchema ? "Séma kész" : "SQL szükséges"} ready={Boolean(health?.readiness?.spacesEngine)} />
          <StatusCard icon={LockKeyhole} label="Fájlfeltöltés" value={health?.readiness?.publicUpload ? "Aktív · 500 MB/fájl" : "Nem elérhető"} ready={Boolean(health?.readiness?.publicUpload)} />
        </div>

        <div className={`mt-6 rounded-2xl border p-4 text-sm font-semibold leading-6 ${coreReady ? "border-lime-200 bg-lime-50 text-lime-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{message}</div>

        <SchemaPreflightPanel health={health} />
        <DropSpacesPreparationPanel enabled={Boolean(featureState?.flags?.spacesEnabled)} />
        <DropSpaceManager adminKey={adminKey} enabled={Boolean(featureState?.flags?.spacesEnabled && health?.readiness?.spacesSchema)} />

        {preview ? <PackagePreviewCard preview={preview} onClose={() => setPreview(null)} /> : null}

        {issuedLink ? (
          <IssuedLinkCard
            issued={issuedLink}
            copied={copied}
            onCopy={copyValue}
            onClose={() => setIssuedLink(null)}
          />
        ) : null}

        {created ? (
          <div ref={createdCardRef} className="scroll-mt-6">
            <CreatedPackageCard created={created} copied={copied} onCopy={copyValue} onClose={() => setCreated(null)} />
          </div>
        ) : null}

        {formOpen ? (
          <PackageForm
            form={form}
            setForm={setForm}
            submitting={submitting}
            canCommit={coreReady}
            onPreview={() => void previewPackage()}
            onSubmit={createPackage}
            onClose={() => setFormOpen(false)}
          />
        ) : null}

        <section className="mt-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Csomagmódok</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">CsomagDrop típusok · közös HexaUpload motor</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {packageModes.map(({ mode, icon: Icon, title, note }) => (
              <article key={mode} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-800"><Icon size={21} /></span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-emerald-800">Aktív</span>
                </div>
                <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
                <p className="mt-2 min-h-16 text-sm leading-6 text-slate-600">{note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">Csomaglista</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">Létrehozott CsomagDrop csomagok</h2>
            </div>
            <span className="text-sm font-bold text-slate-500">{packages.length} csomag</span>
          </div>
          {packages.length ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {packages.map((item) => (
                <PackageCard
                  key={item.id}
                  item={item}
                  canManage={coreReady}
                  actionBusy={actionBusy}
                  onStatusChange={changePackageStatus}
                  onReissue={reissuePackageLink}
                  onRevoke={revokePackageToken}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <Boxes className="mx-auto text-slate-300" size={40} />
              <p className="mt-4 text-sm font-bold text-slate-500">Még nincs elérhető Drop csomag, vagy a csomagmotor nincs aktiválva.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function IssuedLinkCard({ issued, copied, onCopy, onClose }: {
  issued: IssuedLinkResult;
  copied: string;
  onCopy: (label: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <section className="mt-6 rounded-[1.75rem] border border-lime-300 bg-lime-50 p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-800">Egyszeri új hozzáférési link</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{issued.packageTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-lime-950">A korábbi aktív {issued.purpose} linkek közül {issued.revokedTokenCount} került visszavonásra.</p>
        </div>
        <button onClick={onClose} className="rounded-xl border border-lime-300 p-2 text-lime-900"><X size={19} /></button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <CopyRow label={`${issued.purpose} link`} value={issued.link} copied={copied} onCopy={onCopy} />
        <CopyRow label="Tokenhivatkozás" value={issued.tokenHint} copied={copied} onCopy={onCopy} />
      </div>
      <p className="mt-4 text-sm font-bold leading-6 text-lime-950">Lejárat: {new Date(issued.expiresAt).toLocaleString("hu-HU")}. A teljes link később nem kérhető vissza.</p>
    </section>
  );
}

function PackagePreviewCard({ preview, onClose }: { preview: PreviewResult; onClose: () => void }) {
  const formatBytes = (value: number) => new Intl.NumberFormat("hu-HU", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 0,
  }).format(value / 1_048_576);

  return (
    <section className="mt-6 rounded-[1.75rem] border border-cyan-200 bg-cyan-50 p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-800">Adatbázis nélküli ellenőrző előnézet</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{preview.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">Ez a nézet csak a normalizált csomagadatokat mutatja. PIN, token és adatbázisrekord nem készült.</p>
        </div>
        <button onClick={onClose} className="rounded-xl border border-cyan-200 bg-white p-2 text-cyan-900"><X size={19} /></button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PreviewMeta label="Mód" value={preview.mode} />
        <PreviewMeta label="Megőrzés" value={`${preview.schedule.retentionDays} nap`} />
        <PreviewMeta label="Címzettek" value={`${preview.counts.recipients} fő`} />
        <PreviewMeta label="Csoportok" value={`${preview.counts.groups} db`} />
        <PreviewMeta label="Fájllimit" value={`${preview.limits.maxFileCount} db`} />
        <PreviewMeta label="Fájlonként" value={formatBytes(preview.limits.maxFileSizeBytes)} />
        <PreviewMeta label="Teljes keret" value={formatBytes(preview.limits.maxTotalSizeBytes)} />
        <PreviewMeta label="PIN" value={preview.security.pinSource === "automatic" ? "Automatikus" : "Megadott"} />
      </div>
      <div className="mt-4 rounded-2xl border border-white/80 bg-white p-4 text-sm leading-6 text-slate-700">
        <strong>Lejárat:</strong> {new Date(preview.schedule.expiresAt).toLocaleString("hu-HU")} · <strong>Törlési türelmi idő vége:</strong> {new Date(preview.schedule.graceExpiresAt).toLocaleString("hu-HU")}
      </div>
      {preview.groups.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {preview.groups.map((group) => <span key={group.code} className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-black text-cyan-900">{group.name} · {group.code}</span>)}
        </div>
      ) : null}
      <p className="mt-4 text-xs font-bold leading-5 text-cyan-950">A mentés csak a Supabase séma aktiválása után engedélyezhető. A fájlfeltöltés azt követően is külön tiltva marad.</p>
    </section>
  );
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-cyan-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-1 block text-sm text-slate-950">{value}</strong></div>;
}

function DropSpacesPreparationPanel({ enabled }: { enabled: boolean }) {
  return (
    <section className="mt-6 rounded-[1.75rem] border border-teal-200 bg-gradient-to-br from-white via-teal-50/70 to-cyan-50 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">DROP 0.3.0 · új hozzáférési modell</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Hozzáférési terek a csomagok fölött</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-slate-700">
            A fizető licencgazda egy tartós Drop teret hoz létre. A meghívott külső partnerek külön fizetős licenc nélkül, szerepkörük szerint saját csomagokat készíthetnek, tölthetnek fel vagy csak megtekinthetnek. A csomag továbbra is megmarad, de a téren belüli átadási egységként működik.
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          {enabled ? "Térmotor aktív" : "Előkészítve · aktiválás szükséges"}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SpaceModelCard title="Licencgazda" text="A tér érvényességének és tárhelykeretének felső korlátját a vásárló szervezet licence adja." />
        <SpaceModelCard title="Meghívott tagság" text="Tulajdonos, téradmin, közreműködő, feltöltő és megtekintő szerepkör külön jogosultságokkal." />
        <SpaceModelCard title="Saját csomagok" text="A közreműködők a jogosultságuk szerint saját kép-, fájl- és dokumentumcsomagokat hozhatnak létre." />
        <SpaceModelCard title="Door / Dock / Drive" text="Projektkapcsolat esetén ugyanaz a csomag jelenik meg a Dockban, majd másolat nélkül archiválható a Drive-ba." />
      </div>
      <div className="mt-4 rounded-2xl border border-teal-200 bg-white/85 px-4 py-3 text-xs font-bold leading-6 text-teal-950">
        Biztonsági állapot: {enabled ? "a DROP 0.3.0 séma és a belső térkezelő aktív; a tulajdonosi tagság és projektkapcsolat létrehozható." : "a DROP 0.3.0 séma elkészült, de a térmotor feature flagje még zárva van."} A jelenlegi csomagmotor és minden meglévő csomag változatlanul működik; a valódi fájlfeltöltés továbbra is tiltott.
      </div>
    </section>
  );
}

function SpaceModelCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function SchemaPreflightPanel({ health }: { health: HealthResponse | null }) {
  const checks = health?.database?.schema?.checks || [];
  const missingTables = health?.database?.schema?.missingTables || [];
  const schemaVersion = health?.database?.schema?.schemaVersion;
  const schemaReady = Boolean(checks.length && missingTables.length === 0 && schemaVersion?.ready);
  return (
    <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Adatbázis preflight</p>
          <h2 className="mt-2 text-lg font-black text-slate-950">DROP 0.2.0 sémaszerződés</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">A csomagmotor csak akkor aktiválható, ha mind a hét kötelező metaadat- és biztonsági tábla elérhető, és a DROP 0.2.0 sémaverzió-jelölő érvényes.</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${schemaReady ? "border-lime-200 bg-lime-50 text-lime-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {schemaReady ? "Séma kész" : missingTables.length ? `${missingTables.length} tábla hiányzik` : "Sémaverzió hiányzik"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(checks.length ? checks : [
          "drop_packages",
          "drop_recipients",
          "drop_groups",
          "drop_access_tokens",
          "drop_access_attempts",
          "drop_events",
          "drop_schema_meta",
        ].map((table) => ({ table, ready: false }))).map((check) => (
          <div key={check.table} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <code className="min-w-0 break-all font-bold text-slate-700">{check.table}</code>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${check.ready ? "bg-lime-100 text-lime-800" : "bg-amber-100 text-amber-800"}`}>{check.ready ? "Kész" : "SQL kell"}</span>
          </div>
        ))}
      </div>
      <div className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${schemaVersion?.ready ? "border-lime-200 bg-lime-50 text-lime-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        Sémaverzió: {schemaVersion?.actual || "nincs telepítve"} / elvárt: {schemaVersion?.expected || "DROP 0.2.0"}
        {schemaVersion?.migrationCount != null ? ` · ${schemaVersion.migrationCount} migráció` : ""}
        {schemaVersion?.bootstrapId ? ` · ${schemaVersion.bootstrapId}` : ""}
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">A fájlfeltöltés a séma elkészülte után is külön kikapcsolva marad.</p>
    </section>
  );
}

function StatusCard({ icon: Icon, label, value, ready }: { icon: typeof Activity; label: string; value: string; ready: boolean }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 place-items-center rounded-xl border ${ready ? "border-lime-200 bg-lime-50 text-lime-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><Icon size={19} /></div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <strong className="mt-1 block text-base font-black text-slate-950">{value}</strong>
    </article>
  );
}

function PackageForm({ form, setForm, submitting, canCommit, onPreview, onSubmit, onClose }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  submitting: boolean;
  canCommit: boolean;
  onPreview: () => void;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}) {
  const valid = form.title.trim() && form.uploaderName.trim() && form.uploaderEmail.trim();
  return (
    <section className="mt-6 rounded-[1.75rem] border border-cyan-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">DROP 0.2.0</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Új fájl nélküli csomag</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">A csomag, címzettek, csoportok, PIN-hash és külön capability-tokenek kerülnek az adatbázisba.</p>
        </div>
        <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X size={19} /></button>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Field label="Csomag címe"><input value={form.title} onChange={(event) => setForm((old) => ({ ...old, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder="Példa: 32. heti kooperáció dokumentumai" /></Field>
        <Field label="Csomagmód"><select value={form.mode} onChange={(event) => setForm((old) => ({ ...old, mode: event.target.value as DropPackageMode }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"><option value="image">KépDrop</option><option value="file">FájlDrop</option><option value="zip">ZIP</option><option value="mixed">Vegyes</option></select></Field>
        <Field label="Projekt neve"><input value={form.projectName} onChange={(event) => setForm((old) => ({ ...old, projectName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder="Opcionális projektkapcsolat" /></Field>
        <Field label="Megőrzés"><select value={form.retentionDays} onChange={(event) => setForm((old) => ({ ...old, retentionDays: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"><option value={1}>1 nap</option><option value={3}>3 nap</option><option value={7}>7 nap</option><option value={14}>14 nap</option><option value={30}>30 nap</option></select></Field>
        <Field label="Feltöltő neve"><input value={form.uploaderName} onChange={(event) => setForm((old) => ({ ...old, uploaderName: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" /></Field>
        <Field label="Feltöltő e-mail-címe"><input type="email" value={form.uploaderEmail} onChange={(event) => setForm((old) => ({ ...old, uploaderEmail: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" /></Field>
        <Field label="Hatjegyű PIN"><input inputMode="numeric" value={form.pin} onChange={(event) => setForm((old) => ({ ...old, pin: event.target.value.replace(/\D/g, "").slice(0, 6) }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder="Üresen hagyva automatikus" /></Field>
        <Field label="Leírás"><input value={form.description} onChange={(event) => setForm((old) => ({ ...old, description: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" placeholder="Rövid csomagleírás" /></Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Field label="Címzettek – soronként: Név | email | cég"><textarea value={form.recipientsText} onChange={(event) => setForm((old) => ({ ...old, recipientsText: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 min-h-32" placeholder="Kovács Anna | anna@example.hu | Tervező Kft." /></Field>
        <Field label="Logikai csoportok – soronként egy név"><textarea value={form.groupsText} onChange={(event) => setForm((old) => ({ ...old, groupsText: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 min-h-32" placeholder="Helyszíni fotók&#10;Kiviteli tervek&#10;Jegyzőkönyvek" /></Field>
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 lg:flex-row lg:items-center lg:justify-between">
        <span>{canCommit ? "Fájl nem tölthető fel. A létrehozás kizárólag a csomag- és hozzáférési metaadatokat aktiválja." : "A Supabase séma még nincs aktiválva. Az előnézet használható, a tényleges mentés védetten tiltva marad."}</span>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button onClick={onPreview} disabled={!valid || submitting} className="rounded-xl border border-cyan-300 bg-white px-5 py-3 font-black text-cyan-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">{submitting ? "Ellenőrzés…" : "Ellenőrző előnézet"}</button>
          <HoldActionButton
            tone="warning"
            durationMs={2000}
            disabled={!valid || submitting || !canCommit}
            icon={<KeyRound size={17} />}
            label="Csomag létrehozása · 2 mp"
            holdingLabel="Létrehozáshoz"
            runningLabel="Létrehozás…"
            completedLabel="Létrehozva"
            ariaLabel="A csomag létrehozásához és az egyszer megjelenő hozzáférési adatok kiadásához tartsd nyomva 2 másodpercig"
            onComplete={onSubmit}
          />
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black text-slate-800">{label}</span>{children}</label>;
}

function CreatedPackageCard({ created, copied, onCopy, onClose }: {
  created: CreatedResult;
  copied: string;
  onCopy: (label: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const accessPortal = "https://drop.dimpro.hu/open";
  const linkLabels: Record<keyof DropCapabilityLinks, string> = {
    upload: "Feltöltési link",
    view: "Közvetlen megtekintési link",
    download: "Letöltési link",
    report: "Riportlink",
  };
  const entries = Object.entries(created.links) as Array<[keyof DropCapabilityLinks, string]>;
  return (
    <section className="mt-6 rounded-[1.75rem] border border-lime-300 bg-lime-50 p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.22em] text-lime-800">Egyszeri biztonsági átadás</p><h2 className="mt-2 text-2xl font-black text-slate-950">{created.package.title}</h2></div>
        <button onClick={onClose} className="rounded-xl border border-lime-300 p-2 text-lime-900"><X size={19} /></button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <CopyRow label="Csomagkód" value={created.package.public_code} copied={copied} onCopy={onCopy} />
        <CopyRow label="PIN" value={created.pin.replace(/(\d{3})(\d{3})/, "$1 – $2")} copyValue={created.pin} copied={copied} onCopy={onCopy} />
      </div>
      <div className="mt-4 rounded-2xl border border-lime-300 bg-white/80 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-lime-800">Ajánlott meghívotti hozzáférés</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">A címzettnek a PIN-es belépési oldalt, a csomagkódot és a PIN-t add át. A közvetlen megtekintési link külön, PIN megadása nélkül használható.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <CopyRow label="PIN-es belépési oldal" value={accessPortal} copied={copied} onCopy={onCopy} />
          <CopyRow label="Közvetlen megtekintési link" value={created.links.view} copied={copied} onCopy={onCopy} />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {entries.filter(([purpose]) => purpose !== "view").map(([purpose, link]) => (
          <CopyRow key={purpose} label={linkLabels[purpose]} value={link} copied={copied} onCopy={onCopy} />
        ))}
      </div>
      {created.emailNotification ? (
        <div className={`mt-4 rounded-2xl border p-4 ${created.emailNotification.failed ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}>
          <div className="flex items-center gap-2 text-sm font-black"><Mail size={17} /> Meghívó e-mail értesítés</div>
          <p className="mt-2 text-sm font-semibold leading-6">{created.emailNotification.note}</p>
          {created.emailNotification.recipients.length ? (
            <div className="mt-3 space-y-2">
              {created.emailNotification.recipients.map((recipient) => (
                <div key={`${recipient.email}-${recipient.status}`} className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-xs font-bold">
                  {recipient.name} · {recipient.email} · {recipient.status === "sent" ? "elküldve" : `hiba${recipient.error ? `: ${recipient.error}` : ""}`}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="mt-4 text-sm font-bold leading-6 text-lime-950">A nyers tokenek nem kérhetők vissza az adatbázisból. A PIN-t és a megosztandó linkeket ezen a képernyőn kell elmenteni.</p>
    </section>
  );
}

function CopyRow({ label, value, copyValue, copied, onCopy }: { label: string; value: string; copyValue?: string; copied: string; onCopy: (label: string, value: string) => Promise<void> }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3">
      <div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p></div>
      <button onClick={() => void onCopy(label, copyValue || value)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700">{copied === label ? <Check size={17} /> : <Clipboard size={17} />}</button>
    </div>
  );
}

function PackageCard({ item, canManage, actionBusy, onStatusChange, onReissue, onRevoke }: {
  item: DropPackageListItem;
  canManage: boolean;
  actionBusy: string;
  onStatusChange: (item: DropPackageListItem, target: "upload_closed" | "expiring") => Promise<void>;
  onReissue: (item: DropPackageListItem, purpose: DropAccessPurpose) => Promise<void>;
  onRevoke: (item: DropPackageListItem, token: DropPackageListItem["accessTokens"][number]) => Promise<void>;
}) {
  const purposes: DropAccessPurpose[] = ["upload", "view", "download", "report"];
  const canReissue = (purpose: DropAccessPurpose) => item.status === "active"
    || (item.status === "upload_closed" && purpose !== "upload")
    || (item.status === "reporting" && purpose === "report");

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">{item.public_code}</p><h3 className="mt-2 text-lg font-black text-slate-950">{item.title}</h3></div><span className="rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-xs font-black text-lime-800">{item.status}</span></div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.description || "Nincs leírás."}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Meta icon={Users} label="Címzett" value={String(item.recipientCount)} />
        <Meta icon={Boxes} label="Csoport" value={String(item.groupCount)} />
        <Meta icon={KeyRound} label="Token" value={String(item.accessTokens.length)} />
        <Meta icon={Activity} label="Lejárat" value={new Date(item.expires_at).toLocaleDateString("hu-HU")} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Csomagállapot</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === "active" ? (
            <HoldActionButton
              tone="warning"
              durationMs={2000}
              compact
              disabled={!canManage || Boolean(actionBusy)}
              icon={<LockKeyhole size={14} />}
              label="Feltöltés lezárása · 2 mp"
              holdingLabel="Lezáráshoz"
              runningLabel="Módosítás…"
              completedLabel="Lezárva"
              ariaLabel={`A(z) ${item.public_code} csomag feltöltési időszakának végleges lezárásához tartsd nyomva 2 másodpercig`}
              onComplete={() => onStatusChange(item, "upload_closed")}
            />
          ) : null}
          {item.status === "upload_closed" ? (
            <HoldActionButton
              tone="danger"
              durationMs={2000}
              compact
              disabled={!canManage || Boolean(actionBusy)}
              icon={<Activity size={14} />}
              label="Lejárat indítása · 2 mp"
              holdingLabel="Indításhoz"
              runningLabel="Módosítás…"
              completedLabel="Elindítva"
              ariaLabel={`A(z) ${item.public_code} csomag visszafordíthatatlan lejárati folyamatának indításához tartsd nyomva 2 másodpercig`}
              onComplete={() => onStatusChange(item, "expiring")}
            />
          ) : null}
          {!canManage ? <span className="text-xs font-bold text-amber-700">Adatbázis-aktiválásra vár</span> : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Hozzáférési linkek</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {purposes.map((purpose) => (
            <HoldActionButton
              key={purpose}
              tone="warning"
              durationMs={2000}
              compact
              disabled={!canManage || !canReissue(purpose) || Boolean(actionBusy)}
              icon={<KeyRound size={14} />}
              label={`Új ${purpose} link · 2 mp`}
              holdingLabel="Kiadáshoz"
              runningLabel="Kiadás…"
              completedLabel="Link kiadva"
              ariaLabel={`Új ${purpose} link kiadásához és az előző aktív ${purpose} link visszavonásához tartsd nyomva 2 másodpercig`}
              onComplete={() => onReissue(item, purpose)}
              className="w-full justify-start"
            />
          ))}
        </div>
        {item.accessTokens.length ? (
          <div className="mt-3 space-y-2">
            {item.accessTokens.map((token) => (
              <div key={token.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800">{token.purpose} · {token.token_hint}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{token.status} · {token.use_count} használat · {new Date(token.expires_at).toLocaleString("hu-HU")}</p>
                </div>
                {token.status === "active" ? (
                  <HoldActionButton
                    tone="danger"
                    durationMs={2000}
                    compact
                    disabled={!canManage || Boolean(actionBusy)}
                    icon={<X size={14} />}
                    label="Visszavonás · 2 mp"
                    holdingLabel="Visszavonáshoz"
                    runningLabel="Visszavonás…"
                    completedLabel="Visszavonva"
                    ariaLabel={`A(z) ${token.purpose} token (${token.token_hint}) végleges visszavonásához tartsd nyomva 2 másodpercig`}
                    onComplete={() => onRevoke(item, token)}
                    className="shrink-0"
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><Icon size={15} className="text-cyan-700" /><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-1 block text-sm text-slate-950">{value}</strong></div>;
}
