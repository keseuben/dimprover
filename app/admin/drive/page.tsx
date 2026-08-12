"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, HardDrive, Loader2, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import {
  BenjadminDataWorkspace,
  BenjadminMetric,
  BenjadminPagination,
  BenjadminStatusPill,
} from "@/components/admin/BenjadminDataWorkspace";

type TokenResult = {
  ok?: boolean;
  token?: string;
  tokenFile?: string;
  headerName?: string;
  apiRoot?: string;
  warning?: string;
  error?: string;
};

type UploadSession = {
  uploadId: string;
  projectId: string;
  fileName: string;
  relativePath: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  chunkCount: number;
  receivedBytes: number;
  fileSizeBytes: number;
  uploadPath: string;
  ageHours: number | null;
};

type SessionsResult = {
  ok?: boolean;
  mode?: string;
  projectId?: string;
  count?: number;
  sessions?: UploadSession[];
  error?: string;
};

type CleanupPlan = {
  ok?: boolean;
  mode?: string;
  olderThanHours?: number;
  generatedAt?: string;
  totalSessions?: number;
  candidateCount?: number;
  candidates?: UploadSession[];
  note?: string;
  error?: string;
};

type DeleteResult = {
  ok?: boolean;
  uploadId?: string;
  deletedAt?: string;
  note?: string;
  error?: string;
};

type StorageProvider = {
  id: string;
  role: string;
  label: string;
  recommendedFor: string;
  status: string;
  requiredSecrets: string[];
  notes: string[];
};

type StoragePlan = {
  ok?: boolean;
  version?: string;
  activeMode?: string;
  generatedAt?: string;
  objectKeyTemplate?: string;
  recommendedArchitecture?: string[];
  requiredServerEnv?: string[];
  futureEndpoints?: string[];
  providers?: StorageProvider[];
  error?: string;
};

type StorageEnvResult = {
  ok?: boolean;
  mode?: string;
  storageMode?: string;
  s3Ready?: boolean;
  generalReady?: boolean;
  presentCount?: number;
  missingCount?: number;
  entries?: Array<{ key: string; requiredFor: string; present: boolean; safePreview: string }>;
  warning?: string;
  error?: string;
};

type StorageConfigResult = {
  ok?: boolean;
  mode?: string;
  selectedProvider?: string;
  storageMode?: string;
  maxUploadMb?: number;
  allowedProviders?: string[];
  note?: string;
  error?: string;
};

type SignedUploadPlanResult = {
  ok?: boolean;
  mode?: string;
  uploadId?: string;
  fileName?: string;
  projectId?: string;
  expiresAt?: string;
  blockedReason?: string;
  nextServerSteps?: string[];
  error?: string;
};

type SessionFilter = "all" | "active" | "completed" | "cleanup";

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

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function percent(received: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)));
}

function sessionTone(status: string): "default" | "ok" | "warning" | "danger" | "info" {
  const value = status.toLowerCase();
  if (value === "completed") return "ok";
  if (value.includes("fail") || value.includes("error") || value.includes("abort")) return "danger";
  if (value.includes("pending") || value.includes("created") || value.includes("open")) return "warning";
  return "info";
}

function InfoGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="benjadmin-infra-detail-grid">
      {items.map((item) => <span key={item.label}>{item.label}<b>{item.value || "—"}</b></span>)}
    </div>
  );
}

export default function DriveAdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokenResult | null>(null);
  const [copyState, setCopyState] = useState("");
  const [projectFilter, setProjectFilter] = useState("DIMPRO_DEMO");
  const [olderThanHours, setOlderThanHours] = useState("24");
  const [sessionsResult, setSessionsResult] = useState<SessionsResult | null>(null);
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | null>(null);
  const [deleteResult, setDeleteResult] = useState<DeleteResult | null>(null);
  const [storagePlan, setStoragePlan] = useState<StoragePlan | null>(null);
  const [storageEnv, setStorageEnv] = useState<StorageEnvResult | null>(null);
  const [storageConfig, setStorageConfig] = useState<StorageConfigResult | null>(null);
  const [signedUploadPlan, setSignedUploadPlan] = useState<SignedUploadPlanResult | null>(null);
  const [selectedUploadId, setSelectedUploadId] = useState("");
  const [message, setMessage] = useState("Drive admin adatforrás ellenőrzése…");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tokenValue = result?.token || "";
  const maskedToken = tokenValue.length > 18 ? `${tokenValue.slice(0, 18)}…${tokenValue.slice(-8)}` : tokenValue;
  const sessionList = useMemo(() => sessionsResult?.sessions || [], [sessionsResult?.sessions]);
  const cleanupCandidates = useMemo(() => cleanupPlan?.candidates || [], [cleanupPlan?.candidates]);
  const cleanupIds = useMemo(() => new Set(cleanupCandidates.map((session) => session.uploadId)), [cleanupCandidates]);
  const activeSessionCount = sessionList.filter((session) => session.status !== "completed").length;
  const completedSessionCount = sessionList.filter((session) => session.status === "completed").length;
  const receivedBytes = sessionList.reduce((sum, session) => sum + Number(session.receivedBytes || 0), 0);
  const storageProviderCount = storagePlan?.providers?.length || 0;
  const selectedSession = selectedUploadId ? sessionList.find((session) => session.uploadId === selectedUploadId) || cleanupCandidates.find((session) => session.uploadId === selectedUploadId) || null : null;

  const visibleSessions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return sessionList.filter((session) => {
      if (filter === "active" && session.status === "completed") return false;
      if (filter === "completed" && session.status !== "completed") return false;
      if (filter === "cleanup" && !cleanupIds.has(session.uploadId)) return false;
      if (!clean) return true;
      return [session.uploadId, session.projectId, session.fileName, session.relativePath, session.status, session.uploadPath]
        .some((value) => String(value || "").toLowerCase().includes(clean));
    });
  }, [cleanupIds, filter, query, sessionList]);

  const pageCount = Math.max(1, Math.ceil(visibleSessions.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedSessions = visibleSessions.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
    if (storedAdminKey) {
      setAdminKey(storedAdminKey);
      void refreshMain(storedAdminKey);
    } else {
      setMessage("Licencadmin belépés szükséges.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adminHeaders(keyOverride = adminKey) {
    return { "x-dimpro-license-admin-key": keyOverride.trim() };
  }

  function requireAdminKey() {
    if (!adminKey.trim()) {
      setMessage("Licencadmin belépés szükséges.");
      return false;
    }
    setMessage("");
    return true;
  }

  async function loadSessions(keyOverride = adminKey) {
    const key = keyOverride.trim();
    if (!key) return;
    const params = new URLSearchParams();
    if (projectFilter.trim()) params.set("projectId", projectFilter.trim());
    const response = await fetch(`/api/drive/uploads/sessions?${params.toString()}`, {
      headers: adminHeaders(key),
      cache: "no-store",
    });
    const data = await response.json() as SessionsResult;
    setSessionsResult(data);
    if (!response.ok || !data.ok) throw new Error(data.error || "Session lista lekérési hiba.");
  }

  async function loadCleanupPlan(keyOverride = adminKey) {
    const key = keyOverride.trim();
    if (!key) return;
    const params = new URLSearchParams();
    if (projectFilter.trim()) params.set("projectId", projectFilter.trim());
    params.set("olderThanHours", String(Math.max(1, Number(olderThanHours || 24))));
    const response = await fetch(`/api/drive/uploads/cleanup-plan?${params.toString()}`, {
      headers: adminHeaders(key),
      cache: "no-store",
    });
    const data = await response.json() as CleanupPlan;
    setCleanupPlan(data);
    if (!response.ok || !data.ok) throw new Error(data.error || "Cleanup terv lekérési hiba.");
  }

  async function refreshMain(keyOverride = adminKey) {
    const key = keyOverride.trim();
    if (!key) {
      setMessage("Licencadmin belépés szükséges.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await Promise.all([loadSessions(key), loadCleanupPlan(key)]);
      setMessage("Drive upload sessionök és cleanup terv frissítve.");
      setPage(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen Drive admin lekérési hiba.");
    } finally {
      setLoading(false);
    }
  }

  async function loadToken() {
    if (!requireAdminKey()) return;
    setLoading(true);
    setCopyState("");
    try {
      const response = await fetch("/api/drive/dev-token", { headers: adminHeaders(), cache: "no-store" });
      const data = await response.json() as TokenResult;
      setResult(data);
      setMessage(response.ok ? "Drive dev token adatok betöltve." : data.error || "Token lekérési hiba.");
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen token hiba." });
      setMessage("Hálózati hiba a token lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoragePlan() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage-plan", { headers: adminHeaders(), cache: "no-store" });
      const data = await response.json() as StoragePlan;
      setStoragePlan(data);
      setMessage(response.ok ? "Object Storage terv betöltve." : data.error || "Storage terv hiba.");
    } catch (error) {
      setStoragePlan({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen storage terv hiba." });
      setMessage("Hálózati hiba az Object Storage terv lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageEnv() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage-env", { headers: adminHeaders(), cache: "no-store" });
      const data = await response.json() as StorageEnvResult;
      setStorageEnv(data);
      setMessage(response.ok ? "Storage env ellenőrzés betöltve." : data.error || "Storage env hiba.");
    } catch (error) {
      setStorageEnv({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen env hiba." });
      setMessage("Hálózati hiba a storage env lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageConfig() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage-config", { headers: adminHeaders(), cache: "no-store" });
      const data = await response.json() as StorageConfigResult;
      setStorageConfig(data);
      setMessage(response.ok ? "Storage provider konfiguráció betöltve." : data.error || "Storage config hiba.");
    } catch (error) {
      setStorageConfig({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen config hiba." });
      setMessage("Hálózati hiba a storage config lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSignedUploadPlan() {
    if (!result?.token) {
      setMessage("Előbb kérd le a Drive dev tokent; a signed upload terv dev-tokennel ellenőrizhető.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage/signed-upload/init", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-drive-dev-token": result.token,
          "x-dimpro-drive-client-id": "admin-drive-page",
        },
        body: JSON.stringify({
          projectId: projectFilter || "DIMPRO_DEMO",
          fileName: "signed-upload-plan.txt",
          relativePath: "00_DIMPRO_UPLOAD_QUEUE/signed-upload-plan.txt",
          fileSizeBytes: 0,
          mimeType: "text/plain",
        }),
        cache: "no-store",
      });
      const data = await response.json() as SignedUploadPlanResult;
      setSignedUploadPlan(data);
      setMessage(response.ok ? "Signed upload előkészítő szerződés betöltve." : data.error || "Signed upload terv hiba.");
    } catch (error) {
      setSignedUploadPlan({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen signed upload hiba." });
      setMessage("Hálózati hiba a signed upload terv lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteUploadSession(uploadId: string) {
    if (!requireAdminKey()) return;
    const cleanUploadId = uploadId.trim();
    if (!cleanUploadId) {
      setMessage("Nincs kiválasztott upload session.");
      return;
    }
    const confirmed = window.confirm(
      `Biztosan törlöd az ideiglenes upload session mappát?\n\n${cleanUploadId}\n\nA projekt receipt / fájllista rekord nem törlődik automatikusan.`,
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/drive/uploads/${encodeURIComponent(cleanUploadId)}`, {
        method: "DELETE",
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json() as DeleteResult;
      setDeleteResult(data);
      setMessage(response.ok ? "Upload session törölve." : data.error || "Session törlési hiba.");
      if (response.ok) {
        setSelectedUploadId("");
        setSessionDrawerOpen(false);
        await refreshMain(adminKey);
      }
    } catch (error) {
      setDeleteResult({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen törlési hiba." });
      setMessage("Hálózati hiba a session törlésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!result?.token) return;
    await navigator.clipboard.writeText(result.token);
    setCopyState("Token másolva.");
  }

  function openSession(session: UploadSession) {
    setSelectedUploadId(session.uploadId);
    setSessionDrawerOpen(true);
  }

  if (!adminKey && !loading) {
    return (
      <main className="benjadmin-data-page">
        <section className="benjadmin-data-auth-card">
          <ShieldCheck size={22} />
          <h1>Licencadmin belépés szükséges</h1>
          <p>A DIMPRO Drive admin diagnosztika csak aktív BENJADMIN admin munkamenettel érhető el.</p>
          <a href="/admin" className="benjadmin-data-primary-action">Licencadmin megnyitása</a>
        </section>
      </main>
    );
  }

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · DRIVE ADMIN"
        title="DIMPRO Drive upload sessionök"
        description="Fejlesztői upload sessionök, cleanup jelöltek és Object Storage előkészítő diagnosztika egy táblázat-első admin munkatérben."
        actions={(
          <>
            <button type="button" className="benjadmin-data-secondary-action" onClick={() => setDiagnosticsOpen(true)}><HardDrive size={16} /> Drive diagnosztika</button>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => void refreshMain()} disabled={loading}>{loading ? <Loader2 className="is-spinning" size={16} /> : <RefreshCw size={16} />} Frissítés</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Session összesen" value={sessionList.length} />
            <BenjadminMetric label="Aktív session" value={activeSessionCount} tone={activeSessionCount ? "warning" : "default"} />
            <BenjadminMetric label="Completed" value={completedSessionCount} tone="ok" />
            <BenjadminMetric label="Cleanup jelölt" value={cleanupCandidates.length} tone={cleanupCandidates.length ? "danger" : "default"} />
            <BenjadminMetric label="Fogadott adat" value={formatBytes(receivedBytes)} />
          </>
        )}
        toolbar={(
          <>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Keresés session, projekt, fájl vagy útvonal alapján" /></label>
            <div className="benjadmin-data-filter-group" aria-label="Drive session státusz szűrő">
              {(["all", "active", "completed", "cleanup"] as SessionFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setPage(1); }}>{value === "all" ? "Mind" : value === "active" ? "Aktív" : value === "completed" ? "Completed" : "Cleanup jelölt"}</button>)}
            </div>
            <label className="benjadmin-drive-toolbar-field">Projekt<input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="DIMPRO_DEMO vagy üres" /></label>
            <label className="benjadmin-drive-toolbar-field is-small">Cleanup életkor<input value={olderThanHours} onChange={(event) => setOlderThanHours(event.target.value.replace(/[^0-9]/g, ""))} placeholder="24" /><span>óra</span></label>
          </>
        )}
        footer={(
          <>
            <span className="benjadmin-data-message">{message}</span>
            <BenjadminPagination page={safePage} pageSize={pageSize} total={visibleSessions.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-drive-session-table" data-testid="benjadmin-drive-session-table">
            <thead><tr><th>Session</th><th>Fájl / útvonal</th><th>Projekt</th><th>Státusz</th><th>Chunk</th><th>Fogadott / méret</th><th>Készültség</th><th>Életkor</th><th>Frissítve</th><th>Művelet</th></tr></thead>
            <tbody>
              {pagedSessions.length ? pagedSessions.map((session) => {
                const progress = percent(session.receivedBytes, session.fileSizeBytes);
                return <tr key={session.uploadId}><td className="is-mono"><strong>{session.uploadId}</strong>{cleanupIds.has(session.uploadId) ? <><br /><small>cleanup jelölt</small></> : null}</td><td className="is-wide"><strong>{session.fileName}</strong><br /><small>{session.relativePath || session.uploadPath || "—"}</small></td><td>{session.projectId}</td><td><BenjadminStatusPill tone={sessionTone(session.status)}>{session.status}</BenjadminStatusPill></td><td>{session.chunkCount}</td><td className="is-nowrap">{formatBytes(session.receivedBytes)} / {formatBytes(session.fileSizeBytes)}</td><td><div className="benjadmin-drive-progress"><span style={{ width: `${progress}%` }} /><b>{progress}%</b></div></td><td>{session.ageHours == null ? "—" : `${session.ageHours.toFixed(1)} óra`}</td><td className="is-nowrap">{formatDateTime(session.updatedAt)}</td><td><button type="button" className="benjadmin-data-row-action" onClick={() => openSession(session)}>Részletek</button></td></tr>;
              }) : <tr><td colSpan={10} className="benjadmin-data-empty">Nincs betöltött vagy a szűrésnek megfelelő Drive upload session.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {sessionDrawerOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Drive session bezárása" onClick={() => setSessionDrawerOpen(false)} /> : null}
      {sessionDrawerOpen && selectedSession ? (
        <aside className="benjadmin-data-drawer benjadmin-drive-session-drawer" data-testid="benjadmin-drive-session-drawer">
          <header><div><span>DRIVE UPLOAD SESSION</span><strong>{selectedSession.fileName}</strong></div><button type="button" onClick={() => setSessionDrawerOpen(false)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-drive-session-detail">
            <section className="benjadmin-data-form-section"><header><strong>{selectedSession.uploadId}</strong><BenjadminStatusPill tone={sessionTone(selectedSession.status)}>{selectedSession.status}</BenjadminStatusPill></header><p>{selectedSession.relativePath || selectedSession.uploadPath || "Nincs relatív útvonal."}</p></section>
            <InfoGrid items={[
              { label: "Projekt", value: selectedSession.projectId },
              { label: "Chunk", value: String(selectedSession.chunkCount) },
              { label: "Fogadott", value: formatBytes(selectedSession.receivedBytes) },
              { label: "Fájlméret", value: formatBytes(selectedSession.fileSizeBytes) },
              { label: "Készültség", value: `${percent(selectedSession.receivedBytes, selectedSession.fileSizeBytes)}%` },
              { label: "Életkor", value: selectedSession.ageHours == null ? "—" : `${selectedSession.ageHours.toFixed(1)} óra` },
              { label: "Létrehozva", value: formatDateTime(selectedSession.createdAt) },
              { label: "Frissítve", value: formatDateTime(selectedSession.updatedAt) },
            ]} />
            <section className="benjadmin-data-form-section"><header><strong>Ideiglenes upload útvonal</strong></header><code className="benjadmin-fajlmuhely-sha">{selectedSession.uploadPath || "—"}</code></section>
            {cleanupIds.has(selectedSession.uploadId) ? <div className="benjadmin-data-security-note"><Trash2 size={17} /><div><strong>Cleanup jelölt</strong><span>A jelenlegi cleanup terv ezt a sessiont törlésre jelöli. Automatikus törlés nincs.</span></div></div> : null}
            <button type="button" className="benjadmin-data-danger-action is-full" disabled={loading} onClick={() => void deleteUploadSession(selectedSession.uploadId)}>{loading ? <Loader2 className="is-spinning" size={15} /> : <Trash2 size={15} />} Ideiglenes session törlése</button>
          </div>
        </aside>
      ) : null}

      {diagnosticsOpen ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Drive diagnosztika bezárása" onClick={() => setDiagnosticsOpen(false)} /> : null}
      {diagnosticsOpen ? (
        <aside className="benjadmin-data-drawer benjadmin-drive-diagnostics-drawer" data-testid="benjadmin-drive-diagnostics-drawer">
          <header><div><span>DRIVE ADMIN DIAGNOSZTIKA</span><strong>Token · cleanup · storage</strong></div><button type="button" onClick={() => setDiagnosticsOpen(false)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-drive-diagnostics">
            <div className="benjadmin-drive-diagnostic-actions">
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadToken()} disabled={loading}>Dev token</button>
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadStoragePlan()} disabled={loading}>Storage terv</button>
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadStorageEnv()} disabled={loading}>Env check</button>
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadStorageConfig()} disabled={loading}>Provider config</button>
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void loadSignedUploadPlan()} disabled={loading || !result?.token}>Signed upload terv</button>
              <button type="button" className="benjadmin-data-secondary-action" onClick={() => void refreshMain()} disabled={loading}>Session + cleanup</button>
            </div>

            <section className="benjadmin-data-form-section">
              <header><strong>Fejlesztői token</strong><span>{result?.ok ? "betöltve" : "nincs betöltve"}</span></header>
              {result?.ok ? <><InfoGrid items={[
                { label: "API root", value: result.apiRoot || "—" },
                { label: "Header", value: result.headerName || "—" },
                { label: "Token fájl", value: result.tokenFile || "—" },
                { label: "Token", value: maskedToken || "—" },
              ]} /><button type="button" className="benjadmin-data-secondary-action" onClick={() => void copyToken()}><Copy size={14} /> Teljes token másolása</button>{copyState ? <p className="benjadmin-drive-note">{copyState}</p> : null}{result.warning ? <div className="benjadmin-data-security-note"><ShieldCheck size={17} /><div><strong>Fejlesztői figyelmeztetés</strong><span>{result.warning}</span></div></div> : null}</> : <p>Token csak külön admin műveletre töltődik be és maszkolva jelenik meg.</p>}
            </section>

            <section className="benjadmin-data-form-section">
              <header><strong>Cleanup terv</strong><span>{cleanupCandidates.length} jelölt</span></header>
              <InfoGrid items={[
                { label: "Összes session", value: String(cleanupPlan?.totalSessions ?? sessionList.length) },
                { label: "Jelölt", value: String(cleanupPlan?.candidateCount ?? cleanupCandidates.length) },
                { label: "Életkor limit", value: `${cleanupPlan?.olderThanHours ?? olderThanHours} óra` },
                { label: "Generálva", value: formatDateTime(cleanupPlan?.generatedAt) },
              ]} />
              <p>{cleanupPlan?.note || "A cleanup terv csak javaslat; automatikus törlést nem végez."}</p>
              <div className="benjadmin-drive-cleanup-list">
                {cleanupCandidates.length ? cleanupCandidates.map((session) => <button key={session.uploadId} type="button" onClick={() => { setSelectedUploadId(session.uploadId); setDiagnosticsOpen(false); setSessionDrawerOpen(true); }}><strong>{session.fileName}</strong><span>{session.uploadId} · {session.ageHours ?? "—"} óra</span></button>) : <span>Nincs cleanup jelölt.</span>}
              </div>
            </section>

            <section className="benjadmin-data-form-section">
              <header><strong>Object Storage</strong><span>{storageProviderCount} provider</span></header>
              {storagePlan?.ok ? <><InfoGrid items={[
                { label: "Verzió", value: storagePlan.version || "—" },
                { label: "Aktív mód", value: storagePlan.activeMode || "—" },
                { label: "Objektum kulcs", value: storagePlan.objectKeyTemplate || "—" },
                { label: "Generálva", value: formatDateTime(storagePlan.generatedAt) },
              ]} /><div className="benjadmin-drive-provider-list">{(storagePlan.providers || []).map((provider) => <span key={provider.id}><b>{provider.label}</b>{provider.role} · {provider.status}<small>{provider.recommendedFor}</small></span>)}</div></> : <p>A storage terv külön gombbal tölthető be.</p>}
            </section>

            <section className="benjadmin-data-form-section">
              <header><strong>Storage env / provider</strong><span>{storageEnv?.s3Ready ? "S3 kész" : "ellenőrzés"}</span></header>
              <InfoGrid items={[
                { label: "Storage mód", value: storageEnv?.storageMode || storageConfig?.storageMode || "—" },
                { label: "S3 kész", value: storageEnv ? (storageEnv.s3Ready ? "Igen" : "Nem") : "—" },
                { label: "Beállított env", value: storageEnv ? String(storageEnv.presentCount ?? 0) : "—" },
                { label: "Hiányzó env", value: storageEnv ? String(storageEnv.missingCount ?? 0) : "—" },
                { label: "Provider", value: storageConfig?.selectedProvider || "—" },
                { label: "Max upload", value: storageConfig?.maxUploadMb ? `${storageConfig.maxUploadMb} MB` : "—" },
              ]} />
              {storageEnv?.entries?.length ? <div className="benjadmin-drive-env-list">{storageEnv.entries.map((entry) => <span key={entry.key}><b>{entry.key}</b><BenjadminStatusPill tone={entry.present ? "ok" : "warning"}>{entry.present ? "Beállítva" : "Hiányzik"}</BenjadminStatusPill><small>{entry.requiredFor}{entry.safePreview ? ` · ${entry.safePreview}` : ""}</small></span>)}</div> : null}
            </section>

            <section className="benjadmin-data-form-section">
              <header><strong>Signed upload előkészítés</strong><span>{signedUploadPlan?.mode || "plan"}</span></header>
              {signedUploadPlan ? <InfoGrid items={[
                { label: "Upload ID", value: signedUploadPlan.uploadId || "—" },
                { label: "Projekt", value: signedUploadPlan.projectId || "—" },
                { label: "Fájl", value: signedUploadPlan.fileName || "—" },
                { label: "Lejárat", value: formatDateTime(signedUploadPlan.expiresAt) },
              ]} /> : <p>A signed upload szerződés csak külön admin műveletre fut.</p>}
              {signedUploadPlan?.blockedReason ? <div className="benjadmin-data-security-note"><ShieldCheck size={17} /><div><strong>Blokkolási ok</strong><span>{signedUploadPlan.blockedReason}</span></div></div> : null}
            </section>

            <section className="benjadmin-data-form-section">
              <header><strong>Kézi session törlés</strong><span>veszélyes művelet</span></header>
              <label className="benjadmin-data-field"><span>Upload ID</span><input value={selectedUploadId} onChange={(event) => setSelectedUploadId(event.target.value)} placeholder="uploadId" /></label>
              <button type="button" className="benjadmin-data-danger-action is-full" disabled={loading || !selectedUploadId.trim()} onClick={() => void deleteUploadSession(selectedUploadId)}><Trash2 size={15} /> Kézi session törlés</button>
              {deleteResult?.ok ? <p className="benjadmin-drive-note">Session törölve: {deleteResult.uploadId}. {deleteResult.note}</p> : deleteResult?.error ? <p className="benjadmin-drive-note is-error">{deleteResult.error}</p> : null}
            </section>
          </div>
        </aside>
      ) : null}
    </>
  );
}
