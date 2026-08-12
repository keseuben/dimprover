"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  title?: string;
  description?: string;
  note?: string;
  changes?: string[];
  isActive: boolean;
  isCurrent: boolean;
  fileAvailable: boolean;
  downloadPageUrl: string;
};

type ReleaseListResponse = {
  ok: boolean;
  error?: string;
  releases?: ReleaseItem[];
};

type ReleasePair = {
  baseVersion: string;
  dev?: ReleaseItem;
  run?: ReleaseItem;
  other: ReleaseItem[];
  updatedAt: string;
};

type PairFilter = "all" | "complete" | "incomplete" | "active" | "missing_file";

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

function formatDate(value?: string | null, empty = "—") {
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

function releaseKind(release: ReleaseItem) {
  const value = `${release.version} ${release.fileName} ${release.title || ""}`.toUpperCase();
  if (value.includes("RUN")) return "run" as const;
  if (value.includes("DEV")) return "dev" as const;
  return "other" as const;
}

function baseVersionOf(release: ReleaseItem) {
  const value = `${release.version} ${release.fileName}`;
  const match = value.match(/(?:MVP\s*)?V?([0-9]{2,4})/i);
  return match ? `v${match[1]}` : release.version;
}

function buildPairs(releases: ReleaseItem[]): ReleasePair[] {
  const groups = new Map<string, ReleasePair>();
  for (const release of releases) {
    const baseVersion = baseVersionOf(release);
    const current = groups.get(baseVersion) ?? { baseVersion, other: [], updatedAt: release.createdAt };
    const kind = releaseKind(release);
    if (kind === "dev") current.dev = release;
    else if (kind === "run") current.run = release;
    else current.other.push(release);
    if (new Date(release.createdAt).getTime() > new Date(current.updatedAt).getTime()) current.updatedAt = release.createdAt;
    groups.set(baseVersion, current);
  }
  return Array.from(groups.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function itemStatus(item?: ReleaseItem) {
  if (!item) return { label: "Hiányzik", tone: "warning" as const };
  if (!item.fileAvailable) return { label: "Fájl hiányzik", tone: "danger" as const };
  if (item.isActive) return { label: "Aktív", tone: "ok" as const };
  return { label: "Link lejárt", tone: "warning" as const };
}

function pairStatus(pair: ReleasePair) {
  if (!pair.dev || !pair.run) return { label: "Hiányos DEV/RUN pár", tone: "warning" as const };
  if (!pair.dev.fileAvailable || !pair.run.fileAvailable) return { label: "Pár megvan · fájl hiányzik", tone: "danger" as const };
  if (pair.dev.isActive && pair.run.isActive) return { label: "Teljes · aktív", tone: "ok" as const };
  return { label: "Teljes · lejárt link", tone: "warning" as const };
}

function PairReleaseDetail({ label, release }: { label: string; release?: ReleaseItem }) {
  if (!release) {
    return <section className="benjadmin-data-form-section benjadmin-hage-missing"><header><strong>{label}</strong><BenjadminStatusPill tone="warning">Hiányzik</BenjadminStatusPill></header><p>Ehhez a verzióhoz még nincs rögzített {label.toLowerCase()} csomag.</p></section>;
  }
  const state = itemStatus(release);
  return (
    <section className="benjadmin-data-form-section benjadmin-hage-release-block">
      <header><strong>{label}</strong><BenjadminStatusPill tone={state.tone}>{state.label}</BenjadminStatusPill></header>
      <p><b>{release.title || release.fileName}</b><br />{release.description || release.note || "Nincs külön leírás."}</p>
      <div className="benjadmin-infra-detail-grid">
        <span>Fájl<b>{release.fileName}</b></span>
        <span>Méret<b>{formatBytes(release.sizeBytes)}</b></span>
        <span>Kiadás<b>{formatDate(release.createdAt)}</b></span>
        <span>Lejárat<b>{formatDate(release.expiresAt, "Nincs lejárat")}</b></span>
        <span>Letöltések<b>{release.downloadCount} db</b></span>
        <span>Utolsó letöltés<b>{formatDate(release.lastDownloadedAt)}</b></span>
        <span>Fájl a szerveren<b>{release.fileAvailable ? "Igen" : "Nem"}</b></span>
        <span>Aktív link<b>{release.isActive ? "Igen" : "Nem"}</b></span>
      </div>
      {release.changes?.length ? <ul className="benjadmin-fajlmuhely-change-list">{release.changes.map((change) => <li key={change}>{change}</li>)}</ul> : null}
      <code className="benjadmin-fajlmuhely-sha">SHA256: {release.sha256 || "—"}</code>
      {release.fileAvailable && release.isActive ? <a href={release.downloadPageUrl} className="benjadmin-data-secondary-action"><Download size={14} /> Letöltési oldal</a> : null}
    </section>
  );
}

export default function HageVersionsPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [message, setMessage] = useState("Betöltés…");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PairFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedBaseVersion, setSelectedBaseVersion] = useState<string | null>(null);

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setAuthState("blocked");
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setLoading(true);
    try {
      const authResponse = await fetch("/api/license/admin", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" });
      if (!authResponse.ok) {
        setAuthState("blocked");
        setMessage("A licencadmin munkamenet nem érvényes.");
        return;
      }
      const response = await fetch("/api/releases/list?project=HAGE_Munkater&limit=250", { headers: { "x-dimpro-license-admin-key": key }, cache: "no-store" });
      const data = await response.json() as ReleaseListResponse;
      if (!response.ok || !data.ok) {
        setAuthState("authorized");
        setMessage(data.error || "Nem sikerült betölteni a HAGE verziókat.");
        return;
      }
      setAuthState("authorized");
      setReleases(data.releases || []);
      setMessage("HAGE release lista betöltve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen hálózati hiba.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pairs = useMemo(() => buildPairs(releases), [releases]);
  const visiblePairs = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return pairs.filter((pair) => {
      const both = Boolean(pair.dev && pair.run);
      const missingFile = [pair.dev, pair.run].filter(Boolean).some((item) => !item?.fileAvailable);
      const active = Boolean(pair.dev?.isActive || pair.run?.isActive);
      if (filter === "complete" && !both) return false;
      if (filter === "incomplete" && both) return false;
      if (filter === "active" && !active) return false;
      if (filter === "missing_file" && !missingFile) return false;
      if (!clean) return true;
      const items = [pair.dev, pair.run, ...pair.other].filter(Boolean) as ReleaseItem[];
      return [pair.baseVersion, ...items.flatMap((item) => [item.version, item.fileName, item.title, item.description, item.note, ...(item.changes || [])])].some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [filter, pairs, query]);

  const pageCount = Math.max(1, Math.ceil(visiblePairs.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedPairs = visiblePairs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = selectedBaseVersion ? pairs.find((pair) => pair.baseVersion === selectedBaseVersion) || null : null;
  const devCount = releases.filter((item) => releaseKind(item) === "dev").length;
  const runCount = releases.filter((item) => releaseKind(item) === "run").length;
  const completeCount = pairs.filter((pair) => pair.dev && pair.run).length;
  const storedCount = releases.filter((item) => item.fileAvailable).length;

  if (authState !== "authorized") {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>{authState === "checking" ? "HAGE release lista ellenőrzése" : "Licencadmin belépés szükséges"}</h1>
          <p>{message}</p>
          {authState === "blocked" ? <Link href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</Link> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · HAGE KIADÁSOK"
        title="HAGE-INVEST Munkatér verziók"
        description="A HAGE-INVEST Munkatér DEV és RUN csomagjainak párosított, védett release-nyilvántartása. A páros verziólogika megmaradt, de nagy listán is kereshető és szűrhető."
        actions={(
          <>
            <Link href="/admin/releases?project=HAGE_Munkater" className="benjadmin-data-secondary-action">HAGE release feltöltő</Link>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "is-spinning" : ""} /> {loading ? "Frissítés…" : "Frissítés"}</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Verziópár" value={pairs.length} />
            <BenjadminMetric label="Teljes DEV + RUN" value={completeCount} tone={completeCount === pairs.length && pairs.length ? "ok" : "default"} />
            <BenjadminMetric label="DEV csomag" value={devCount} />
            <BenjadminMetric label="RUN csomag" value={runCount} />
            <BenjadminMetric label="VPS-en tárolt fájl" value={storedCount} tone="ok" />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="HAGE verziópár szűrő">
              {(["all", "complete", "incomplete", "active", "missing_file"] as PairFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "complete" ? "Teljes DEV + RUN" : value === "incomplete" ? "Hiányos pár" : value === "active" ? "Aktív link" : "Fájl hiányzik"}</button>)}
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés verzió, fájlnév, cím vagy leírás alapján" /></label>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message} · A DEV és RUN csomag ugyanahhoz az alapverzióhoz tartozó kiadáspárként jelenik meg.</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visiblePairs.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-hage-version-table" data-testid="benjadmin-hage-version-table">
            <thead><tr><th>Verzió</th><th>DEV csomag</th><th>DEV állapot</th><th>RUN csomag</th><th>RUN állapot</th><th>DEV + RUN méret</th><th>Letöltések</th><th>Frissítve</th><th>Pár állapota</th><th>Művelet</th></tr></thead>
            <tbody>
              {pagedPairs.length ? pagedPairs.map((pair) => {
                const devState = itemStatus(pair.dev);
                const runState = itemStatus(pair.run);
                const state = pairStatus(pair);
                const totalSize = (pair.dev?.sizeBytes || 0) + (pair.run?.sizeBytes || 0);
                const downloads = (pair.dev?.downloadCount || 0) + (pair.run?.downloadCount || 0);
                return <tr key={pair.baseVersion}><td className="is-mono"><strong>{pair.baseVersion}</strong>{pair.other.length ? <><br /><small>+{pair.other.length} egyéb</small></> : null}</td><td className="is-wide"><strong>{pair.dev?.fileName || "—"}</strong></td><td><BenjadminStatusPill tone={devState.tone}>{devState.label}</BenjadminStatusPill></td><td className="is-wide"><strong>{pair.run?.fileName || "—"}</strong></td><td><BenjadminStatusPill tone={runState.tone}>{runState.label}</BenjadminStatusPill></td><td>{formatBytes(totalSize)}</td><td>{downloads} db</td><td className="is-nowrap">{formatDate(pair.updatedAt)}</td><td><BenjadminStatusPill tone={state.tone}>{state.label}</BenjadminStatusPill></td><td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedBaseVersion(pair.baseVersion)}>Részletek</button></td></tr>;
              }) : <tr><td colSpan={10} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő HAGE verziópár.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {selected ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="HAGE verziópár bezárása" onClick={() => setSelectedBaseVersion(null)} /> : null}
      {selected ? (
        <aside className="benjadmin-data-drawer benjadmin-hage-release-drawer" data-testid="benjadmin-hage-release-drawer">
          <header><div><span>HAGE DEV / RUN KIADÁSPÁR</span><strong>{selected.baseVersion}</strong></div><button type="button" onClick={() => setSelectedBaseVersion(null)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-hage-release-detail">
            <section className="benjadmin-data-form-section"><header><strong>Kiadáspár állapota</strong><BenjadminStatusPill tone={pairStatus(selected).tone}>{pairStatus(selected).label}</BenjadminStatusPill></header><p>Utolsó frissítés: {formatDate(selected.updatedAt)}</p></section>
            <PairReleaseDetail label="DEV kiadás" release={selected.dev} />
            <PairReleaseDetail label="RUN kiadás" release={selected.run} />
            {selected.other.length ? <section className="benjadmin-data-form-section"><header><strong>További kapcsolódó kiadások</strong><span>{selected.other.length} db</span></header><div className="benjadmin-hage-other-list">{selected.other.map((item) => <span key={item.token}><b>{item.version}</b>{item.fileName}</span>)}</div></section> : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
