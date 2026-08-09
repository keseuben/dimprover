"use client";

import { useEffect, useState } from "react";

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
  const [message, setMessage] = useState("");

  const tokenValue = result?.token || "";
  const maskedToken = tokenValue.length > 18
    ? `${tokenValue.slice(0, 18)}...${tokenValue.slice(-8)}`
    : tokenValue;

  const sessionList = sessionsResult?.sessions || [];
  const cleanupCandidates = cleanupPlan?.candidates || [];
  const activeSessionCount = sessionList.filter((session) => session.status !== "completed").length;
  const completedSessionCount = sessionList.filter((session) => session.status === "completed").length;
  const receivedBytes = sessionList.reduce((sum, session) => sum + Number(session.receivedBytes || 0), 0);
  const storageProviderCount = storagePlan?.providers?.length || 0;

  useEffect(() => {
    const storedAdminKey = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (storedAdminKey) setAdminKey(storedAdminKey);
  }, []);

  function adminHeaders() {
    return {
      "x-dimpro-license-admin-key": adminKey.trim(),
    };
  }

  function requireAdminKey() {
    if (!adminKey.trim()) {
      setMessage("Add meg a licencadmin kulcsot.");
      return false;
    }
    setMessage("");
    return true;
  }

  async function loadToken() {
    if (!requireAdminKey()) return;
    setLoading(true);
    setCopyState("");
    try {
      const response = await fetch("/api/drive/dev-token", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
      setResult(data);
      setMessage(response.ok ? "Drive token adatok betöltve." : data.error || "Token lekérési hiba.");
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen lekérdezési hiba.",
      });
      setMessage("Hálózati hiba a token lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSessions() {
    if (!requireAdminKey()) return;
    setLoading(true);
    setDeleteResult(null);
    try {
      const params = new URLSearchParams();
      if (projectFilter.trim()) params.set("projectId", projectFilter.trim());
      const response = await fetch(`/api/drive/uploads/sessions?${params.toString()}`, {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
      setSessionsResult(data);
      setMessage(response.ok ? "Upload session lista frissítve." : data.error || "Session lista lekérési hiba.");
    } catch (error) {
      setSessionsResult({
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen session lista hiba.",
      });
      setMessage("Hálózati hiba a session lista lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCleanupPlan() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectFilter.trim()) params.set("projectId", projectFilter.trim());
      params.set("olderThanHours", String(Math.max(1, Number(olderThanHours || 24))));
      const response = await fetch(`/api/drive/uploads/cleanup-plan?${params.toString()}`, {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
      setCleanupPlan(data);
      setMessage(response.ok ? "Cleanup terv elkészült." : data.error || "Cleanup terv hiba.");
    } catch (error) {
      setCleanupPlan({
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen cleanup hiba.",
      });
      setMessage("Hálózati hiba a cleanup terv lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStoragePlan() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage-plan", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
      setStoragePlan(data);
      setMessage(response.ok ? "Object Storage terv betöltve." : data.error || "Object Storage terv lekérési hiba.");
    } catch (error) {
      setStoragePlan({
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen storage terv hiba.",
      });
      setMessage("Hálózati hiba az Object Storage terv lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageEnv() {
    if (!requireAdminKey()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/drive/storage-env", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
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
      const response = await fetch("/api/drive/storage-config", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = await response.json();
      setStorageConfig(data);
      setMessage(response.ok ? "Storage provider konfigurációs terv betöltve." : data.error || "Storage config hiba.");
    } catch (error) {
      setStorageConfig({ ok: false, error: error instanceof Error ? error.message : "Ismeretlen config hiba." });
      setMessage("Hálózati hiba a storage config lekérésekor.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSignedUploadPlan() {
    if (!result?.token) {
      setMessage("Előbb kérd le a Drive dev tokent, mert a signed upload szerződés dev-tokennel tesztelhető.");
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
      const data = await response.json();
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
      const data = await response.json();
      setDeleteResult(data);
      setMessage(response.ok ? "Upload session törölve." : data.error || "Session törlési hiba.");
      if (response.ok) {
        setSelectedUploadId("");
        await loadSessions();
        await loadCleanupPlan();
      }
    } catch (error) {
      setDeleteResult({
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen törlési hiba.",
      });
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-cyan-400/25 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/30">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
            DIMPRO Drive Admin
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">
            Drive fejlesztői token, upload session lista és cleanup terv
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Ez az oldal a Drive API MVP fejlesztési teszteléséhez készült. A token, session lista,
            cleanup terv és kézi session törlés csak licencadmin kulccsal érhető el.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <label className="block text-sm font-semibold text-slate-200" htmlFor="adminKey">
            Licencadmin kulcs
          </label>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <input
              id="adminKey"
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="DIMPRO-LICENSE-ADMIN-..."
              className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 outline-none ring-cyan-400/30 focus:ring-4"
            />
            <button
              type="button"
              onClick={loadToken}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Folyamatban..." : "Drive token"}
            </button>
            <button
              type="button"
              onClick={loadSessions}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl border border-cyan-300/50 px-5 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Session lista
            </button>
            <button
              type="button"
              onClick={loadCleanupPlan}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl border border-amber-300/50 px-5 py-3 text-sm font-bold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cleanup terv
            </button>
            <button
              type="button"
              onClick={loadStoragePlan}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl border border-blue-300/50 px-5 py-3 text-sm font-bold text-blue-100 hover:bg-blue-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Storage terv
            </button>
            <button
              type="button"
              onClick={loadStorageEnv}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl border border-indigo-300/50 px-5 py-3 text-sm font-bold text-indigo-100 hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Env check
            </button>
            <button
              type="button"
              onClick={loadStorageConfig}
              disabled={loading || !adminKey.trim()}
              className="rounded-2xl border border-violet-300/50 px-5 py-3 text-sm font-bold text-violet-100 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Provider terv
            </button>
            <button
              type="button"
              onClick={loadSignedUploadPlan}
              disabled={loading || !result?.token}
              className="rounded-2xl border border-emerald-300/50 px-5 py-3 text-sm font-bold text-emerald-100 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Signed upload terv
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
            <Field label="Projekt szűrő">
              <input
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                placeholder="DIMPRO_DEMO vagy üres = összes"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              />
            </Field>
            <Field label="Cleanup életkor óra">
              <input
                value={olderThanHours}
                onChange={(event) => setOlderThanHours(event.target.value.replace(/[^0-9]/g, ""))}
                placeholder="24"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              />
            </Field>
          </div>
          {message && (
            <p className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">
              {message}
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatusCard label="Session összesen" value={String(sessionList.length)} tone="cyan" />
          <StatusCard label="Aktív session" value={String(activeSessionCount)} tone="amber" />
          <StatusCard label="Completed" value={String(completedSessionCount)} tone="emerald" />
          <StatusCard label="Fogadott byte" value={String(receivedBytes)} tone="cyan" />
          <StatusCard label="Cleanup jelölt" value={String(cleanupCandidates.length)} tone="red" />
          <StatusCard label="Storage provider" value={String(storageProviderCount)} tone="blue" />
        </section>

        {result && (
          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <SectionTitle title="Dev token" subtitle="Csak fejlesztési teszthez. Desktop configba nem menthető." />
            {result.ok ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Token lekérve. A teljes token csak másoláskor használandó; a felületen maszkolva jelenik meg.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Info label="API root" value={result.apiRoot || ""} />
                  <Info label="Header neve" value={result.headerName || ""} />
                  <Info label="Token fájl" value={result.tokenFile || ""} />
                  <Info label="Token" value={maskedToken} />
                </div>
                <button
                  type="button"
                  onClick={copyToken}
                  className="rounded-2xl border border-cyan-300/50 px-5 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10"
                >
                  Teljes token másolása
                </button>
                {copyState && <p className="text-sm text-cyan-200">{copyState}</p>}
                <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                  {result.warning}
                </p>
              </div>
            ) : (
              <ErrorBox text={result.error || "A token lekérése nem sikerült."} />
            )}
          </section>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <SectionTitle
              title="Upload session lista"
              subtitle="Admin debug lista az ideiglenes upload session mappákról."
            />
            {sessionsResult?.ok ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Info label="Projekt" value={sessionsResult.projectId || "all"} />
                  <Info label="Session darab" value={String(sessionsResult.count ?? 0)} />
                  <Info label="Mód" value={sessionsResult.mode || "-"} />
                </div>
                <SessionTable
                  sessions={sessionList}
                  selectedUploadId={selectedUploadId}
                  onSelect={setSelectedUploadId}
                  onDelete={deleteUploadSession}
                  loading={loading}
                />
              </div>
            ) : sessionsResult ? (
              <ErrorBox text={sessionsResult.error || "A session lista lekérése nem sikerült."} />
            ) : (
              <EmptyBox text="Még nincs lekérve session lista." />
            )}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <SectionTitle
              title="Cleanup terv"
              subtitle="Csak javaslatot készít, automatikus törlést nem végez."
            />
            {cleanupPlan?.ok ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Info label="Összes session" value={String(cleanupPlan.totalSessions ?? 0)} />
                  <Info label="Törlésre jelölt" value={String(cleanupPlan.candidateCount ?? 0)} />
                  <Info label="Életkor limit" value={`${cleanupPlan.olderThanHours ?? "-"} óra`} />
                  <Info label="Mód" value={cleanupPlan.mode || "-"} />
                </div>
                <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
                  {cleanupPlan.note || "Ez csak tisztítási terv."}
                </p>
                <div className="space-y-2">
                  {cleanupCandidates.length === 0 ? (
                    <EmptyBox text="Nincs cleanup jelölt session." />
                  ) : (
                    cleanupCandidates.map((session) => (
                      <button
                        key={session.uploadId}
                        type="button"
                        onClick={() => setSelectedUploadId(session.uploadId)}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 text-left text-sm hover:border-amber-300/60"
                      >
                        <span className="block font-semibold text-white">{session.fileName}</span>
                        <span className="mt-1 block break-all text-xs text-slate-400">
                          {session.uploadId} · {session.status} · {session.ageHours ?? "-"} óra
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : cleanupPlan ? (
              <ErrorBox text={cleanupPlan.error || "A cleanup terv lekérése nem sikerült."} />
            ) : (
              <EmptyBox text="Még nincs cleanup terv." />
            )}
          </div>
        </section>

        {storagePlan && (
          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <SectionTitle
              title="Object Storage előkészítő szerződés"
              subtitle="Hetzner Object Storage / Backblaze / Storage Box irány. Ez még plan-only, valós tárhelyírás nélkül."
            />
            {storagePlan.ok ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Info label="Verzió" value={storagePlan.version || "-"} />
                  <Info label="Mód" value={storagePlan.activeMode || "-"} />
                  <Info label="Objektum kulcs" value={storagePlan.objectKeyTemplate || "-"} />
                </div>
                <div className="grid gap-3 xl:grid-cols-3">
                  {(storagePlan.providers || []).map((provider) => (
                    <div key={provider.id} className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                      <p className="text-xs uppercase tracking-[0.25em] text-blue-300/70">{provider.role}</p>
                      <h3 className="mt-2 text-lg font-bold text-white">{provider.label}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{provider.recommendedFor}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{provider.status}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ListBox title="Szerver env előkészítés" items={storagePlan.requiredServerEnv || []} />
                  <ListBox title="Későbbi endpointok" items={storagePlan.futureEndpoints || []} />
                </div>
              </div>
            ) : (
              <ErrorBox text={storagePlan.error || "A storage terv lekérése nem sikerült."} />
            )}
          </section>
        )}

        {(storageEnv || storageConfig || signedUploadPlan) && (
          <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <SectionTitle
              title="Storage env / provider / signed upload előkészítés"
              subtitle="Admin és dev-token alapú előkészítő ellenőrzések. Valós tárhelyírás nincs."
            />
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {storageEnv && (
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <h3 className="font-bold text-white">Env check</h3>
                  {storageEnv.ok ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <p>Storage mód: {storageEnv.storageMode || "plan"}</p>
                      <p>S3 kész: {storageEnv.s3Ready ? "igen" : "nem"}</p>
                      <p>Beállított: {storageEnv.presentCount ?? 0} · Hiányzó: {storageEnv.missingCount ?? 0}</p>
                    </div>
                  ) : <ErrorBox text={storageEnv.error || "Env check hiba."} />}
                </div>
              )}
              {storageConfig && (
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <h3 className="font-bold text-white">Provider terv</h3>
                  {storageConfig.ok ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <p>Provider: {storageConfig.selectedProvider}</p>
                      <p>Mód: {storageConfig.storageMode}</p>
                      <p>Max upload: {storageConfig.maxUploadMb} MB</p>
                    </div>
                  ) : <ErrorBox text={storageConfig.error || "Provider terv hiba."} />}
                </div>
              )}
              {signedUploadPlan && (
                <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
                  <h3 className="font-bold text-white">Signed upload terv</h3>
                  {signedUploadPlan.ok ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-300">
                      <p>Upload ID: {signedUploadPlan.uploadId}</p>
                      <p>Fájl: {signedUploadPlan.fileName}</p>
                      <p className="text-amber-100">{signedUploadPlan.blockedReason}</p>
                    </div>
                  ) : <ErrorBox text={signedUploadPlan.error || "Signed upload terv hiba."} />}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <SectionTitle
            title="Manuális session törlés"
            subtitle="Csak ideiglenes upload session mappát töröl; receipt/fájllista rekordot nem töröl automatikusan."
          />
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              value={selectedUploadId}
              onChange={(event) => setSelectedUploadId(event.target.value)}
              placeholder="uploadId"
              className="min-h-12 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-red-300"
            />
            <button
              type="button"
              onClick={() => deleteUploadSession(selectedUploadId)}
              disabled={loading || !selectedUploadId.trim() || !adminKey.trim()}
              className="rounded-2xl border border-red-400/60 px-5 py-3 text-sm font-bold text-red-100 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Kézi session törlés
            </button>
          </div>
          {deleteResult && (
            <div className="mt-4">
              {deleteResult.ok ? (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  Session törölve: {deleteResult.uploadId}. {deleteResult.note}
                </div>
              ) : (
                <ErrorBox text={deleteResult.error || "A törlés nem sikerült."} />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm text-slate-100">{value || "-"}</p>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
      {text}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">
      {text}
    </div>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: string; tone: "cyan" | "amber" | "emerald" | "red" | "blue" }) {
  const toneClass = {
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    red: "border-red-400/30 bg-red-400/10 text-red-100",
    blue: "border-blue-400/30 bg-blue-400/10 text-blue-100",
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.25em] opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function ListBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">-</p>
        ) : (
          items.map((item) => (
            <p key={item} className="break-all rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
              {item}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU");
}

function SessionTable({
  sessions,
  selectedUploadId,
  onSelect,
  onDelete,
  loading,
}: {
  sessions: UploadSession[];
  selectedUploadId: string;
  onSelect: (uploadId: string) => void;
  onDelete: (uploadId: string) => void;
  loading: boolean;
}) {
  if (sessions.length === 0) {
    return <EmptyBox text="Nincs megjeleníthető upload session." />;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-700">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-[0.2em] text-slate-500">
          <tr>
            <th className="px-4 py-3">Session</th>
            <th className="px-4 py-3">Fájl</th>
            <th className="px-4 py-3">Projekt</th>
            <th className="px-4 py-3">Státusz</th>
            <th className="px-4 py-3">Chunk</th>
            <th className="px-4 py-3">Méret</th>
            <th className="px-4 py-3">Frissítve</th>
            <th className="px-4 py-3">Művelet</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.uploadId}
              className={`border-t border-slate-800 ${selectedUploadId === session.uploadId ? "bg-cyan-400/10" : ""}`}
            >
              <td className="max-w-[220px] break-all px-4 py-3 font-mono text-xs text-cyan-100">
                {session.uploadId}
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-white">{session.fileName}</div>
                <div className="mt-1 max-w-[260px] break-all text-xs text-slate-500">{session.relativePath}</div>
              </td>
              <td className="px-4 py-3 text-slate-300">{session.projectId}</td>
              <td className="px-4 py-3 text-slate-300">{session.status}</td>
              <td className="px-4 py-3 text-slate-300">{session.chunkCount}</td>
              <td className="px-4 py-3 text-slate-300">{session.receivedBytes} / {session.fileSizeBytes} B</td>
              <td className="px-4 py-3 text-slate-400">{formatDate(session.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(session.uploadId)}
                    className="rounded-xl border border-cyan-300/50 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10"
                  >
                    Kijelölés
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(session.uploadId)}
                    disabled={loading}
                    className="rounded-xl border border-red-300/50 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-400/10 disabled:opacity-40"
                  >
                    Törlés
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
