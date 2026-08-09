"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileArchive,
  KeyRound,
  Link2,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";

type UploadResult = {
  ok: boolean;
  error?: string;
  release?: {
    token: string;
    project: string;
    version: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
    expiresAt: string | null;
    downloadPageUrl: string;
    apiDownloadUrl: string;
  };
};

type ReleaseItem = {
  token: string;
  project: string;
  version: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  description?: string;
  note?: string;
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  fileDeletedAt?: string;
  downloadPageUrl: string;
};

type ReleaseListResult = {
  ok: boolean;
  error?: string;
  releases?: ReleaseItem[];
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Nincs lejárat";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(new Date(value));
}

function copyToClipboard(value: string, onDone: (message: string) => void) {
  navigator.clipboard
    .writeText(value)
    .then(() => onDone("Link vágólapra másolva."))
    .catch(() => onDone("Nem sikerült a vágólapra másolni. Másold ki kézzel a linket."));
}

export default function ReleaseUploadAdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState("DIMPRO_Fajlmuhely");
  const [version, setVersion] = useState("v3_63");
  const [title, setTitle] = useState("DIMPRO Fájlműhely v3.63");
  const [description, setDescription] = useState("");
  const [changes, setChanges] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [uploadedBy, setUploadedBy] = useState("Bendzsi / DIMPRO admin");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [deleteLoadingToken, setDeleteLoadingToken] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);

  const fileInfo = useMemo(() => {
    if (!file) return "Nincs kiválasztott ZIP / 7Z fájl.";
    return `${file.name} · ${formatBytes(file.size)}`;
  }, [file]);

  const canUseAdminApi = adminKey.trim().length >= 20;
  const canUpload = canUseAdminApi && !!file && version.trim().length > 0 && project.trim().length > 0 && !loading;
  const storedSize = releases.reduce((sum, release) => sum + release.sizeBytes, 0);

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (storedAdminKey) setAdminKey(storedAdminKey);
    const requestedProject = new URLSearchParams(window.location.search).get("project")?.trim();
    if (requestedProject) {
      setProject(requestedProject);
      if (requestedProject === "HAGE_Munkater") {
        setVersion("v167 DEV");
        setTitle("HAGE-INVEST Munkatér DEV 167");
        setExpiresInDays("never");
      }
    }
  }, []);

  async function loadReleases(key = adminKey) {
    if (!key.trim()) {
      setMessage("Add meg az admin kulcsot a release lista betöltéséhez.");
      return;
    }

    setListLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/releases/list?project=${encodeURIComponent(project.trim() || "DIMPRO_Fajlmuhely")}&limit=50`, {
        headers: {
          "x-dimpro-license-admin-key": key.trim(),
        },
        cache: "no-store",
      });
      const data = (await response.json()) as ReleaseListResult;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Nem sikerült betölteni a release listát.");
        return;
      }

      setReleases(data.releases || []);
      setMessage("Release lista betöltve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen release lista hiba.");
    } finally {
      setListLoading(false);
    }
  }

  async function deleteRelease(release: ReleaseItem) {
    if (!adminKey.trim()) {
      setMessage("Add meg az admin kulcsot a törléshez.");
      return;
    }

    const confirmed = window.confirm(
      `Biztosan törlöd ezt a release csomagot a szerverről?\n\n${release.version}\n${release.fileName}\n\nCsak a fizikai ZIP / 7Z fájl törlődik a VPS privát tárhelyéről. A verzióelőzmény és leírás megmarad.`,
    );

    if (!confirmed) return;

    setDeleteLoadingToken(release.token);
    setMessage("");

    try {
      const response = await fetch("/api/releases/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": adminKey.trim(),
        },
        body: JSON.stringify({ token: release.token }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string; fileDeleted?: boolean };

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Nem sikerült törölni a release csomagot.");
        return;
      }

      setReleases((current) => current.map((item) => (item.token === release.token ? { ...item, fileAvailable: false, isActive: false, fileDeletedAt: new Date().toISOString() } : item)));
      setMessage(data.fileDeleted ? "A szerveren tárolt ZIP / 7Z fájl törölve. A verzióelőzmény megmaradt." : "A verzióelőzmény megmaradt. A szerverfájl már korábban sem volt megtalálható.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen release törlési hiba.");
    } finally {
      setDeleteLoadingToken("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setResult(null);

    if (!file) {
      setMessage("Válassz ki egy ZIP vagy 7Z release csomagot.");
      return;
    }

    if (!adminKey.trim()) {
      setMessage("Add meg a DIMPRO licencadmin kulcsot.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", project.trim());
    formData.append("version", version.trim());
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("changes", changes.trim());
    formData.append("expiresInDays", expiresInDays.trim());
    formData.append("uploadedBy", uploadedBy.trim());

    setLoading(true);

    try {
      const response = await fetch("/api/releases/upload", {
        method: "POST",
        headers: {
          "x-dimpro-license-admin-key": adminKey.trim(),
        },
        body: formData,
      });
      const data = (await response.json()) as UploadResult;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "A release feltöltése sikertelen.");
        return;
      }

      setResult(data);
      setMessage("Release csomag sikeresen feltöltve és tokenes linkként regisztrálva.");
      setFile(null);
      await loadReleases(adminKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen feltöltési hiba.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-8 text-white sm:px-6">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.16)_1px,transparent_1px)] [background-size:54px_54px]" />
      <section className="relative mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex flex-wrap gap-3">
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-white">
              <ArrowLeft size={18} /> Vissza az admin felületre
            </Link>
            <Link href="/admin/hage-verziok" className="inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-white">
              HAGE verziók →
            </Link>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">DIMPRO release admin</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white md:text-5xl">Védett ZIP feltöltő</h1>
              <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                Admin kulccsal védett felület a DIMPRO Fájlműhely, a HAGE-INVEST Munkatér, a DIMPRO Teams és más DIMPRO release csomagok feltöltéséhez és törléséhez.
                A fájl privát VPS tárhelyre kerül, majd lejáró tokenes letöltési link készül hozzá.
              </p>
            </div>
            <div className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-4 text-emerald-100">
              <div className="flex items-center gap-3">
                <ShieldCheck size={30} />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">Védelem</p>
                  <p className="text-xl font-black">Admin kulcs + token</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-8">
            <div className="grid gap-5">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                  <KeyRound size={17} /> Admin kulcs
                </span>
                <input
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  type="password"
                  placeholder="DIMPRO-LICENSE-ADMIN-..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                />
              </label>

              <label className="block rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-300/5 p-6 text-center transition hover:border-cyan-200 hover:bg-cyan-300/10">
                <UploadCloud className="mx-auto text-cyan-200" size={46} />
                <span className="mt-4 block text-lg font-black text-white">ZIP / 7Z csomag kiválasztása</span>
                <span className="mt-2 block text-sm font-semibold text-slate-300">Maximum 150 MB. A fájl nem public mappába kerül.</span>
                <input
                  type="file"
                  accept=".zip,.7z"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span className="mt-4 inline-flex rounded-xl bg-slate-950/70 px-4 py-2 text-sm font-black text-cyan-100">{fileInfo}</span>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Projekt</span>
                  <input list="release-project-options" value={project} onChange={(event) => setProject(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                  <datalist id="release-project-options">
                    <option value="DIMPRO_Fajlmuhely" />
                    <option value="HAGE_Munkater" />
                    <option value="DIMPRO_Teams" />
                    <option value="DIMPRO_Drive_Desktop" />
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Verzió</span>
                  <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v3_63" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Cím</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="DIMPRO Fájlműhely v3.63 – ..." className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Lejárat napban</span>
                  <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    <option value="1">1 nap</option>
                    <option value="7">7 nap</option>
                    <option value="14">14 nap</option>
                    <option value="30">30 nap</option>
                    <option value="90">90 nap</option>
                    <option value="never">Nincs lejárat</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Feltöltő</span>
                  <input value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Verzió leírás</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Röviden írd le, mit tartalmaz ez a kiadás."
                  className="min-h-28 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Változáslista</span>
                <textarea
                  value={changes}
                  onChange={(event) => setChanges(event.target.value)}
                  placeholder={"Egy sor = egy változás\nPélda: Drive Desktop fájlnézet javítása"}
                  className="min-h-36 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                />
              </label>

              <button
                type="submit"
                disabled={!canUpload}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <FileArchive size={20} />}
                Release feltöltése és link generálása
              </button>
            </div>
          </form>

          <aside className="grid h-fit gap-5">
            {message ? (
              <div className={`rounded-3xl border p-5 text-sm font-bold leading-6 ${result?.ok ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-amber-300/30 bg-amber-400/10 text-amber-100"}`}>
                <div className="mb-2 flex items-center gap-2">
                  {result?.ok ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                  <strong>{result?.ok ? "Sikeres művelet" : "Üzenet"}</strong>
                </div>
                {message}
              </div>
            ) : null}

            {result?.release ? (
              <div className="rounded-3xl border border-emerald-300/30 bg-white/[0.07] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Elkészült release</p>
                <h2 className="mt-2 text-2xl font-black text-white">{result.release.version}</h2>
                <div className="mt-4 grid gap-3 rounded-2xl bg-slate-950/60 p-4 text-sm text-slate-300">
                  <p><strong className="text-white">Fájl:</strong> {result.release.fileName}</p>
                  <p><strong className="text-white">Méret:</strong> {formatBytes(result.release.sizeBytes)}</p>
                  <p><strong className="text-white">Lejárat:</strong> {formatDate(result.release.expiresAt)}</p>
                  <p className="break-all"><strong className="text-white">SHA256:</strong> {result.release.sha256}</p>
                </div>
                <a href={result.release.downloadPageUrl} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-emerald-200">
                  <Link2 size={18} /> Letöltési oldal megnyitása
                </a>
                <button
                  type="button"
                  onClick={() => copyToClipboard(result.release!.downloadPageUrl, setMessage)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/10"
                >
                  <Copy size={18} /> Link másolása
                </button>
              </div>
            ) : null}

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Előzmények</p>
              <h2 className="mt-2 text-2xl font-black text-white">Release lista</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                A sikeres feltöltés automatikusan bekerül a DIMPRO Fájlműhely verziótörténet oldalára.
              </p>
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => void loadReleases()}
                  disabled={!canUseAdminApi || listLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {listLoading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
                  Feltöltött csomagok betöltése
                </button>
                <Link href="/admin/fajlmuhely-verziok" className="inline-flex w-full items-center justify-center rounded-2xl border border-cyan-300/30 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/10">
                  Verziók megnyitása
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-red-300/30 bg-red-400/10 p-5 text-sm font-semibold leading-6 text-red-100">
              <strong className="block text-white">Törlési szabály</strong>
              A törlés csak a ZIP / 7Z fájlt távolítja el a VPS privát release tárhelyéről. A verzió, leírás, dátum és SHA256 előzmény továbbra is megmarad a verziólistában.
            </div>
          </aside>
        </div>


        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Szerveren tárolt release csomagok</p>
              <h2 className="mt-2 text-3xl font-black text-white">Feltöltött fájlok kezelése</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                A régi, felesleges fejlesztési ZIP-ek innen törölhetők, hogy ne terheljék a VPS tárhelyét.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/50 px-4 py-3 text-sm font-black text-cyan-100">
              {releases.length} csomag · {formatBytes(storedSize)}
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {releases.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 text-sm font-semibold text-slate-300">
                A lista még nincs betöltve, vagy nincs rögzített release csomag. Add meg az admin kulcsot, majd kattints a „Feltöltött csomagok betöltése” gombra.
              </div>
            ) : null}

            {releases.map((release) => (
              <article key={release.token} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-black text-white">{release.version}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${release.isActive ? "bg-emerald-300/15 text-emerald-200" : "bg-slate-500/20 text-slate-300"}`}>
                        {release.fileAvailable ? (release.isActive ? "Aktív link" : "Lejárt link") : "Fájl törölve"}
                      </span>
                      {release.isCurrent ? <span className="rounded-full bg-cyan-300 px-3 py-1 text-xs font-black text-slate-950">Legfrissebb</span> : null}
                    </div>
                    <p className="mt-2 break-all text-sm font-semibold text-cyan-100">{release.fileName}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {release.description || release.note || "Ehhez a release csomaghoz nincs külön leírás rögzítve."}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                      <span>Méret: <strong className="text-white">{formatBytes(release.sizeBytes)}</strong></span>
                      <span>Kiadás: <strong className="text-white">{formatDate(release.createdAt)}</strong></span>
                      <span>Lejárat: <strong className="text-white">{formatDate(release.expiresAt)}</strong></span>
                      <span>Letöltés: <strong className="text-white">{release.downloadCount} db</strong></span>
                    </div>
                    <code className="mt-3 block break-all rounded-xl bg-black/30 p-3 text-xs text-cyan-100">{release.sha256}</code>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col">
                    <a href={release.downloadPageUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/10">
                      <Link2 size={17} /> Letöltési oldal
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(release.downloadPageUrl, setMessage)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/30 px-4 py-2 text-sm font-black text-slate-100 hover:bg-white/10"
                    >
                      <Copy size={17} /> Link másolása
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRelease(release)}
                      disabled={deleteLoadingToken === release.token}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/40 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deleteLoadingToken === release.token ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}
                      Szerverfájl törlése
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
