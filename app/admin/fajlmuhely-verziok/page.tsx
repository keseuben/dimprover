"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminPagination, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

type AuthState = "checking" | "authorized" | "blocked";

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
  changes?: string[];
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  fileDeletedAt?: string;
  downloadPageUrl: string;
};

type ReleaseListResult = {
  ok: boolean;
  error?: string;
  project?: string;
  releases?: ReleaseItem[];
};

type ReleaseFilter = "all" | "active" | "expired" | "deleted" | "current";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null | undefined, empty = "—") {
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

function getVersionSummary(version: string) {
  if (version === "v3_62") {
    return "DIMPRO Drive Desktop MVP alapmodul, Path Guard előkészítés, projektalapú Drive nézet és védett release-letöltés.";
  }
  return "Részletes verzióleírás még nincs külön rögzítve.";
}

function getVersionBranchLabel(version: string) {
  if (version.startsWith("v3_")) return "v3.x fejlesztési ág";
  if (version.startsWith("v2_")) return "v2.x fejlesztési ág";
  if (version.startsWith("v1_")) return "v1.x fejlesztési ág";
  return "Egyéb verziók";
}

function releaseState(release: ReleaseItem) {
  if (!release.fileAvailable) return { label: "Fájl törölve", tone: "default" as const };
  if (release.isCurrent && release.isActive) return { label: "Legfrissebb · aktív", tone: "ok" as const };
  if (release.isActive) return { label: "Aktív link", tone: "ok" as const };
  return { label: "Lejárt link", tone: "warning" as const };
}

export default function AdminFajlmuhelyVersionsPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [message, setMessage] = useState("Release lista ellenőrzése…");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReleaseFilter>("all");
  const [branch, setBranch] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  async function loadReleasesFromStoredAdminKey() {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setAuthState("blocked");
      setMessage("Nincs aktív licencadmin kulcs a böngészőben. Előbb lépj be az /admin felületen.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/releases/list?project=DIMPRO_Fajlmuhely&limit=250", {
        headers: { "x-dimpro-license-admin-key": key },
        cache: "no-store",
      });
      const data = (await response.json()) as ReleaseListResult;
      if (!response.ok || !data.ok) {
        setAuthState("blocked");
        setReleases([]);
        setMessage(data.error || "A licencadmin kulcs nem érvényes a release lista betöltéséhez.");
        return;
      }
      setAuthState("authorized");
      setReleases(data.releases || []);
      setMessage("Release lista betöltve.");
    } catch (error) {
      setAuthState("blocked");
      setReleases([]);
      setMessage(error instanceof Error ? error.message : "Ismeretlen release lista hiba.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReleasesFromStoredAdminKey();
  }, []);

  const branches = useMemo(() => Array.from(new Set(releases.map((release) => getVersionBranchLabel(release.version)))), [releases]);
  const visibleReleases = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return releases.filter((release) => {
      if (branch !== "all" && getVersionBranchLabel(release.version) !== branch) return false;
      if (filter === "active" && !(release.fileAvailable && release.isActive)) return false;
      if (filter === "expired" && !(release.fileAvailable && !release.isActive)) return false;
      if (filter === "deleted" && release.fileAvailable) return false;
      if (filter === "current" && !release.isCurrent) return false;
      if (!clean) return true;
      return [release.version, release.fileName, release.project, release.description, release.note, ...(release.changes || [])].some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [branch, filter, query, releases]);

  const pageCount = Math.max(1, Math.ceil(visibleReleases.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedReleases = visibleReleases.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = selectedToken ? releases.find((release) => release.token === selectedToken) || null : null;
  const activeCount = releases.filter((release) => release.fileAvailable && release.isActive).length;
  const storedCount = releases.filter((release) => release.fileAvailable).length;
  const deletedCount = releases.filter((release) => !release.fileAvailable).length;
  const latestRelease = releases.find((release) => release.isCurrent) || releases[0];

  if (authState !== "authorized") {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>{authState === "checking" ? "Release lista ellenőrzése" : "Licencadmin belépés szükséges"}</h1>
          <p>{message}</p>
          {authState === "blocked" ? <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</Link> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · ASZTALI KIADÁSOK"
        title="DIMPRO Fájlműhely verziók"
        description="DIMPRO Fájlműhely és DIMPRO Drive Desktop védett ZIP / 7Z kiadások kereshető, szűrhető verzió- és letöltési nyilvántartása."
        actions={(
          <>
            <Link href="/admin/releases" className="benjadmin-data-secondary-action">Release feltöltő</Link>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => void loadReleasesFromStoredAdminKey()} disabled={loading}><RefreshCw size={16} className={loading ? "is-spinning" : ""} /> {loading ? "Frissítés…" : "Frissítés"}</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Összes verzió" value={releases.length} />
            <BenjadminMetric label="Szerveren lévő fájl" value={storedCount} tone="ok" />
            <BenjadminMetric label="Aktív link" value={activeCount} tone="ok" />
            <BenjadminMetric label="Törölt fájl / előzmény" value={deletedCount} />
            <BenjadminMetric label="Legutóbbi verzió" value={latestRelease?.version || "—"} />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="Fájlműhely release szűrő">
              {(["all", "active", "expired", "deleted", "current"] as ReleaseFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "active" ? "Aktív link" : value === "expired" ? "Lejárt link" : value === "deleted" ? "Törölt fájl" : "Legfrissebb"}</button>)}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés verzió, fájlnév vagy leírás alapján" /></label>
            <select className="benjadmin-data-toolbar-single-select" value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1); }} aria-label="Fejlesztési ág"><option value="all">Minden fejlesztési ág</option>{branches.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message} · A verzióelőzmény a kiadási fájl törlése után is megmarad.</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleReleases.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-fajlmuhely-version-table" data-testid="benjadmin-fajlmuhely-version-table">
            <thead><tr><th>Verzió</th><th>Fejlesztési ág</th><th>Fájl</th><th>Státusz</th><th>Méret</th><th>Kiadás</th><th>Lejárat</th><th>Letöltések</th><th>Utolsó letöltés</th><th>Művelet</th></tr></thead>
            <tbody>
              {pagedReleases.length ? pagedReleases.map((release) => {
                const state = releaseState(release);
                return <tr key={release.token}><td className="is-mono"><strong>{release.version}</strong>{release.isCurrent ? <><br /><small>legfrissebb</small></> : null}</td><td>{getVersionBranchLabel(release.version)}</td><td className="is-wide"><strong>{release.fileName}</strong><br /><small>{release.description || release.note || getVersionSummary(release.version)}</small></td><td><BenjadminStatusPill tone={state.tone}>{state.label}</BenjadminStatusPill></td><td>{formatBytes(release.sizeBytes)}</td><td className="is-nowrap">{formatDate(release.createdAt)}</td><td className="is-nowrap">{formatDate(release.expiresAt, "Nincs lejárat")}</td><td>{release.downloadCount} db</td><td className="is-nowrap">{formatDate(release.lastDownloadedAt)}</td><td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedToken(release.token)}>Részletek</button></td></tr>;
              }) : <tr><td colSpan={10} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő Fájlműhely kiadás.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {selected ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Kiadás részletek bezárása" onClick={() => setSelectedToken(null)} /> : null}
      {selected ? (
        <aside className="benjadmin-data-drawer benjadmin-fajlmuhely-release-drawer" data-testid="benjadmin-fajlmuhely-release-drawer">
          <header><div><span>FÁJLMŰHELY KIADÁS</span><strong>{selected.version}</strong></div><button type="button" onClick={() => setSelectedToken(null)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-fajlmuhely-release-detail">
            <section className="benjadmin-data-form-section"><header><strong>{selected.fileName}</strong><BenjadminStatusPill tone={releaseState(selected).tone}>{releaseState(selected).label}</BenjadminStatusPill></header><p>{selected.description || selected.note || getVersionSummary(selected.version)}</p></section>
            <div className="benjadmin-infra-detail-grid"><span>Fejlesztési ág<b>{getVersionBranchLabel(selected.version)}</b></span><span>Méret<b>{formatBytes(selected.sizeBytes)}</b></span><span>Kiadás<b>{formatDate(selected.createdAt)}</b></span><span>Lejárat<b>{formatDate(selected.expiresAt, "Nincs lejárat")}</b></span><span>Letöltések<b>{selected.downloadCount} db</b></span><span>Utolsó letöltés<b>{formatDate(selected.lastDownloadedAt)}</b></span><span>Fájl a szerveren<b>{selected.fileAvailable ? "Igen" : "Nem"}</b></span><span>Aktív link<b>{selected.isActive ? "Igen" : "Nem"}</b></span></div>
            {selected.changes?.length ? <section className="benjadmin-data-form-section"><header><strong>Változások</strong><span>{selected.changes.length} tétel</span></header><ul className="benjadmin-fajlmuhely-change-list">{selected.changes.map((change) => <li key={change}>{change}</li>)}</ul></section> : null}
            {!selected.fileAvailable ? <div className="benjadmin-data-security-note"><div><strong>Csak verzióelőzmény</strong><span>A hozzá tartozó ZIP / 7Z fájl már nincs a szerveren; a történeti rekord megmarad.</span></div></div> : null}
            <section className="benjadmin-data-form-section"><header><strong>SHA256</strong></header><code className="benjadmin-fajlmuhely-sha">{selected.sha256 || "—"}</code></section>
            {selected.fileAvailable && selected.isActive ? <Link href={selected.downloadPageUrl} className="benjadmin-data-primary-action is-full"><Download size={15} /> Letöltési oldal megnyitása</Link> : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
