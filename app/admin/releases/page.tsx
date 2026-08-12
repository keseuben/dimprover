"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

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

type ReleaseFilter = "all" | "active" | "expired" | "deleted" | "current";

const projectOptions = [
  { value: "DIMPRO_Fajlmuhely", label: "DIMPRO Fájlműhely" },
  { value: "HAGE_Munkater", label: "HAGE-INVEST Munkatér" },
  { value: "DIMPRO_Teams", label: "DIMPRO Teams" },
  { value: "DIMPRO_Drive_Desktop", label: "DIMPRO Drive Desktop" },
];

function projectLabel(value: string) {
  return projectOptions.find((item) => item.value === value)?.label || value;
}

function formatBytes(bytes?: number | null) {
  if (!Number.isFinite(bytes) || Number(bytes) <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null | undefined, empty = "Nincs lejárat") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(date);
}

function releaseState(release: ReleaseItem) {
  if (!release.fileAvailable) return { label: "Fájl törölve", tone: "default" as const };
  if (release.isCurrent && release.isActive) return { label: "Legfrissebb · aktív", tone: "ok" as const };
  if (release.isActive) return { label: "Aktív link", tone: "ok" as const };
  return { label: "Lejárt link", tone: "warning" as const };
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReleaseFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  const fileInfo = useMemo(() => {
    if (!file) return "Nincs kiválasztott ZIP / 7Z fájl.";
    return `${file.name} · ${formatBytes(file.size)}`;
  }, [file]);

  const canUseAdminApi = adminKey.trim().length >= 20;
  const canUpload = canUseAdminApi && !!file && version.trim().length > 0 && project.trim().length > 0 && !loading;

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
    const requestedProject = new URLSearchParams(window.location.search).get("project")?.trim() || "DIMPRO_Fajlmuhely";
    if (storedAdminKey) setAdminKey(storedAdminKey);
    setProject(requestedProject);
    if (requestedProject === "HAGE_Munkater") {
      setVersion("v167 DEV");
      setTitle("HAGE-INVEST Munkatér DEV 167");
      setExpiresInDays("never");
    }
    if (storedAdminKey) void loadReleases(storedAdminKey, requestedProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReleases(keyOverride = adminKey, projectOverride = project) {
    const key = keyOverride.trim();
    const targetProject = projectOverride.trim() || "DIMPRO_Fajlmuhely";
    if (!key) {
      setMessage("Licencadmin belépés szükséges a release lista betöltéséhez.");
      return;
    }
    setListLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/releases/list?project=${encodeURIComponent(targetProject)}&limit=250`, {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const data = (await response.json()) as ReleaseListResult;
      if (!response.ok || !data.ok) {
        setReleases([]);
        setMessage(data.error || "Nem sikerült betölteni a release listát.");
        return;
      }
      setReleases(data.releases || []);
      setMessage(`${projectLabel(targetProject)} release lista betöltve.`);
      setPage(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen release lista hiba.");
    } finally {
      setListLoading(false);
    }
  }

  function changeProject(nextProject: string) {
    setProject(nextProject);
    setQuery("");
    setFilter("all");
    setPage(1);
    setSelectedToken(null);
    if (nextProject === "HAGE_Munkater") {
      setVersion("v167 DEV");
      setTitle("HAGE-INVEST Munkatér DEV 167");
      setExpiresInDays("never");
    }
    void loadReleases(adminKey, nextProject);
  }

  async function deleteRelease(release: ReleaseItem) {
    if (!adminKey.trim()) {
      setMessage("Licencadmin belépés szükséges a törléshez.");
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
        headers: { "content-type": "application/json", "x-dimpro-license-admin-key": adminKey.trim() },
        body: JSON.stringify({ token: release.token }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string; fileDeleted?: boolean };
      if (!response.ok || !data.ok) {
        setMessage(data.error || "Nem sikerült törölni a release csomagot.");
        return;
      }
      setReleases((current) => current.map((item) => item.token === release.token ? { ...item, fileAvailable: false, isActive: false, fileDeletedAt: new Date().toISOString() } : item));
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
      setMessage("Licencadmin belépés szükséges.");
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
        headers: { "x-dimpro-license-admin-key": adminKey.trim() },
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
      await loadReleases(adminKey, project);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen feltöltési hiba.");
    } finally {
      setLoading(false);
    }
  }

  const visibleReleases = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return releases.filter((release) => {
      if (filter === "active" && !(release.fileAvailable && release.isActive)) return false;
      if (filter === "expired" && !(release.fileAvailable && !release.isActive)) return false;
      if (filter === "deleted" && release.fileAvailable) return false;
      if (filter === "current" && !release.isCurrent) return false;
      if (!clean) return true;
      return [release.version, release.fileName, release.description, release.note, release.sha256].some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [filter, query, releases]);

  const pageCount = Math.max(1, Math.ceil(visibleReleases.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedReleases = visibleReleases.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = selectedToken ? releases.find((release) => release.token === selectedToken) || null : null;
  const storedCount = releases.filter((release) => release.fileAvailable).length;
  const activeCount = releases.filter((release) => release.fileAvailable && release.isActive).length;
  const deletedCount = releases.filter((release) => !release.fileAvailable).length;
  const storedSize = releases.filter((release) => release.fileAvailable).reduce((sum, release) => sum + release.sizeBytes, 0);

  if (!adminKey && !listLoading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>A védett release feltöltő és kiadási lista csak aktív BENJADMIN admin munkamenettel érhető el.</p>
          <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</Link>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · RELEASE TÁR"
        title="Védett release feltöltő és kiadási lista"
        description={`${projectLabel(project)} · privát VPS release tárhely, lejáró tokenes letöltési linkek és történeti kiadási nyilvántartás.`}
        actions={(
          <>
            {project === "DIMPRO_Fajlmuhely" ? <Link href="/admin/fajlmuhely-verziok" className="benjadmin-data-secondary-action">Fájlműhely verziók</Link> : null}
            {project === "HAGE_Munkater" ? <Link href="/admin/hage-verziok" className="benjadmin-data-secondary-action">HAGE verziók</Link> : null}
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadReleases()} disabled={listLoading}>{listLoading ? <Loader2 className="is-spinning" size={16} /> : <RefreshCw size={16} />} Frissítés</button>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => { setResult(null); setUploadDrawerOpen(true); }}><Plus size={16} /> Új release feltöltés</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Összes release" value={releases.length} />
            <BenjadminMetric label="Szerveren tárolt" value={storedCount} tone="ok" />
            <BenjadminMetric label="Aktív link" value={activeCount} tone="ok" />
            <BenjadminMetric label="Törölt fájl / előzmény" value={deletedCount} />
            <BenjadminMetric label="Tárolt méret" value={formatBytes(storedSize)} />
          </>
        )}
        toolbar={(
          <>
            <select className="benjadmin-data-toolbar-single-select" value={project} onChange={(event) => changeProject(event.target.value)} aria-label="Release projekt">{projectOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <div className="benjadmin-data-filter-group" aria-label="Release státusz szűrő">
              {(["all", "active", "expired", "deleted", "current"] as ReleaseFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "active" ? "Aktív link" : value === "expired" ? "Lejárt link" : value === "deleted" ? "Törölt fájl" : "Legfrissebb"}</button>)}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés verzió, fájlnév, leírás vagy SHA256 alapján" /></label>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message || "A fizikai fájl törlése nem törli a történeti release rekordot."}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleReleases.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-release-upload-table" data-testid="benjadmin-release-upload-table">
            <thead><tr><th>Verzió</th><th>Fájl</th><th>Státusz</th><th>Méret</th><th>Kiadás</th><th>Lejárat</th><th>Letöltések</th><th>Utolsó letöltés</th><th>SHA256</th><th>Művelet</th></tr></thead>
            <tbody>
              {pagedReleases.length ? pagedReleases.map((release) => {
                const state = releaseState(release);
                return <tr key={release.token}><td className="is-mono"><strong>{release.version}</strong>{release.isCurrent ? <><br /><small>legfrissebb</small></> : null}</td><td className="is-wide"><strong>{release.fileName}</strong><br /><small>{release.description || release.note || "Nincs külön leírás."}</small></td><td><BenjadminStatusPill tone={state.tone}>{state.label}</BenjadminStatusPill></td><td>{formatBytes(release.sizeBytes)}</td><td className="is-nowrap">{formatDate(release.createdAt, "—")}</td><td className="is-nowrap">{formatDate(release.expiresAt)}</td><td>{release.downloadCount} db</td><td className="is-nowrap">{formatDate(release.lastDownloadedAt, "—")}</td><td className="is-mono"><span className="benjadmin-release-sha-short">{release.sha256 ? `${release.sha256.slice(0, 12)}…` : "—"}</span></td><td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedToken(release.token)}>Részletek</button></td></tr>;
              }) : <tr><td colSpan={10} className="benjadmin-data-empty">Nincs betöltött vagy a szűrésnek megfelelő release rekord.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {uploadDrawerOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Release feltöltő bezárása" onClick={() => setUploadDrawerOpen(false)} /> : null}
      {uploadDrawerOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-release-upload-drawer" data-testid="benjadmin-release-upload-drawer">
          <header><div><span>VÉDETT RELEASE FELTÖLTÉS</span><strong>{projectLabel(project)}</strong></div><button type="button" onClick={() => setUploadDrawerOpen(false)} aria-label="Bezárás"><X size={18} /></button></header>
          <form onSubmit={handleSubmit} className="benjadmin-data-drawer__body benjadmin-release-upload-form">
            <div className="benjadmin-data-security-note"><ShieldCheck size={17} /><div><strong>Privát release tárhely</strong><span>ZIP / 7Z fájl kerül a privát VPS tárhelyre, majd lejáró tokenes letöltési link készül. Maximum 150 MB.</span></div></div>

            <label className="benjadmin-release-dropzone">
              <UploadCloud size={32} />
              <strong>ZIP / 7Z csomag kiválasztása</strong>
              <span>{fileInfo}</span>
              <input type="file" accept=".zip,.7z" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>

            <div className="benjadmin-data-form-grid">
              <label className="benjadmin-data-field"><span>Projekt</span><select value={project} onChange={(event) => changeProject(event.target.value)}>{projectOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="benjadmin-data-field"><span>Verzió</span><input value={version} onChange={(event) => setVersion(event.target.value)} /></label>
              <label className="benjadmin-data-field"><span>Cím</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="benjadmin-data-field"><span>Lejárat</span><select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}><option value="1">1 nap</option><option value="7">7 nap</option><option value="14">14 nap</option><option value="30">30 nap</option><option value="90">90 nap</option><option value="never">Nincs lejárat</option></select></label>
              <label className="benjadmin-data-field"><span>Feltöltő</span><input value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} /></label>
            </div>
            <label className="benjadmin-data-field"><span>Verzió leírás</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Röviden írd le, mit tartalmaz ez a kiadás." /></label>
            <label className="benjadmin-data-field"><span>Változáslista</span><textarea value={changes} onChange={(event) => setChanges(event.target.value)} placeholder={"Egy sor = egy változás\nPélda: Drive Desktop fájlnézet javítása"} /></label>

            {message ? <div className={`benjadmin-release-upload-message ${result?.ok ? "is-ok" : ""}`}>{result?.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<span>{message}</span></div> : null}
            {result?.release ? <section className="benjadmin-data-form-section"><header><strong>Elkészült release</strong><BenjadminStatusPill tone="ok">Sikeres</BenjadminStatusPill></header><div className="benjadmin-infra-detail-grid"><span>Verzió<b>{result.release.version}</b></span><span>Fájl<b>{result.release.fileName}</b></span><span>Méret<b>{formatBytes(result.release.sizeBytes)}</b></span><span>Lejárat<b>{formatDate(result.release.expiresAt)}</b></span></div><code className="benjadmin-fajlmuhely-sha">SHA256: {result.release.sha256}</code><div className="benjadmin-release-upload-result-actions"><a href={result.release.downloadPageUrl} className="benjadmin-data-secondary-action"><Link2 size={14} /> Letöltési oldal</a><button type="button" className="benjadmin-data-secondary-action" onClick={() => copyToClipboard(result.release!.downloadPageUrl, setMessage)}><Copy size={14} /> Link másolása</button></div></section> : null}

            <button type="submit" className="benjadmin-data-primary-action is-full" disabled={!canUpload}>{loading ? <Loader2 className="is-spinning" size={16} /> : <FileArchive size={16} />} Release feltöltése és link generálása</button>
          </form>
        </aside>
      ) : null}

      {selected ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Release részletek bezárása" onClick={() => setSelectedToken(null)} /> : null}
      {selected ? (
        <aside className="benjadmin-data-drawer benjadmin-release-detail-drawer" data-testid="benjadmin-release-detail-drawer">
          <header><div><span>RELEASE RÉSZLETEK</span><strong>{selected.version}</strong></div><button type="button" onClick={() => setSelectedToken(null)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-release-detail">
            <section className="benjadmin-data-form-section"><header><strong>{selected.fileName}</strong><BenjadminStatusPill tone={releaseState(selected).tone}>{releaseState(selected).label}</BenjadminStatusPill></header><p>{selected.description || selected.note || "Nincs külön leírás."}</p></section>
            <div className="benjadmin-infra-detail-grid"><span>Projekt<b>{projectLabel(selected.project || project)}</b></span><span>Méret<b>{formatBytes(selected.sizeBytes)}</b></span><span>Kiadás<b>{formatDate(selected.createdAt, "—")}</b></span><span>Lejárat<b>{formatDate(selected.expiresAt)}</b></span><span>Letöltések<b>{selected.downloadCount} db</b></span><span>Utolsó letöltés<b>{formatDate(selected.lastDownloadedAt, "—")}</b></span><span>Fájl a szerveren<b>{selected.fileAvailable ? "Igen" : "Nem"}</b></span><span>Aktív link<b>{selected.isActive ? "Igen" : "Nem"}</b></span></div>
            <section className="benjadmin-data-form-section"><header><strong>SHA256</strong></header><code className="benjadmin-fajlmuhely-sha">{selected.sha256 || "—"}</code></section>
            <div className="benjadmin-release-detail-actions"><a href={selected.downloadPageUrl} className="benjadmin-data-secondary-action"><Download size={14} /> Letöltési oldal</a><button type="button" className="benjadmin-data-secondary-action" onClick={() => copyToClipboard(selected.downloadPageUrl, setMessage)}><Copy size={14} /> Link másolása</button>{selected.fileAvailable ? <button type="button" className="benjadmin-data-danger-action" disabled={deleteLoadingToken === selected.token} onClick={() => void deleteRelease(selected)}>{deleteLoadingToken === selected.token ? <Loader2 className="is-spinning" size={14} /> : <Trash2 size={14} />} Szerverfájl törlése</button> : null}</div>
            <div className="benjadmin-data-security-note"><AlertTriangle size={17} /><div><strong>Törlési szabály</strong><span>Csak a fizikai ZIP / 7Z fájl törlődik. A verzió, leírás, dátum és SHA256 történeti rekord megmarad.</span></div></div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
