"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDrive, RefreshCw, Search, Server, X } from "lucide-react";
import { BenjadminDataWorkspace, BenjadminMetric, BenjadminStatusPill } from "@/components/admin/BenjadminDataWorkspace";

type ServerStatus = {
  ok: boolean;
  collectedAt?: string;
  server?: {
    hostname?: string;
    platform?: string;
    arch?: string;
    uptimeSeconds?: number;
    loadAverage?: number[];
    nodeVersion?: string;
    npmVersion?: string | null;
    pm2Version?: string | null;
  };
  memory?: {
    totalBytes?: number;
    usedBytes?: number;
    availableBytes?: number;
    usagePercent?: number;
    swapTotalBytes?: number;
    swapUsedBytes?: number;
    swapFreeBytes?: number;
    swapUsagePercent?: number;
  };
  disk?: {
    sizeKb?: number;
    usedKb?: number;
    availableKb?: number;
    usePercent?: number;
  } | null;
  services?: {
    nginx?: { ok?: boolean; message?: string };
    pm2?: { ok?: boolean; processes?: Array<{ name?: string; status?: string; cpuPercent?: number; memoryBytes?: number; restarts?: number }> };
  };
};

type InfrastructureServer = {
  code: "PRODUCTION" | "DATABASE" | string;
  label: string;
  host: string;
  online: boolean;
  latencyMs?: number | null;
  statusCode?: number | null;
  port?: number | null;
  memory?: { usagePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  swap?: { usagePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  disk?: { usePercent?: number; totalBytes?: number; usedBytes?: number; availableBytes?: number } | null;
  load1m?: number | null;
  sampledAt?: string | null;
  telemetry?: string;
  note?: string;
};

type InfrastructureStorage = {
  code: "DRIVE" | "DROP" | string;
  label: string;
  endpoint?: string | null;
  bucket?: string | null;
  online: boolean;
  usedBytes?: number | null;
  objectCount?: number | null;
  capacityBytes?: number | null;
  freeBytes?: number | null;
  usagePercent?: number | null;
  truncated?: boolean;
  provider?: string | null;
  includedStorageBytes?: number | null;
  bucketHardLimitBytes?: number | null;
  includedScope?: string | null;
  billingModel?: string | null;
  note?: string;
};

type InfrastructureSummary = {
  ok: boolean;
  collectedAt?: string;
  servers?: InfrastructureServer[];
  storages?: InfrastructureStorage[];
  storageBilling?: {
    provider?: string | null;
    scope?: string | null;
    includedStorageBytes?: number | null;
    bucketHardLimitBytes?: number | null;
    observedUsedBytes?: number | null;
    observedIncludedRemainingBytes?: number | null;
    note?: string | null;
    sourceCheckedAt?: string | null;
  } | null;
};

type MonitorRow = {
  target_code?: string;
  target_kind?: string;
  sampled_at?: string;
  status?: string;
  cpu_percent?: number | null;
  memory_percent?: number | null;
  disk_percent?: number | null;
  load_1m?: number | null;
  response_ms?: number | null;
  metadata?: Record<string, unknown>;
};

type ControlPayload = {
  controlPlane?: {
    monitoring?: MonitorRow[];
    summary?: { monitorSamples?: number };
  };
};

type ViewFilter = "all" | "servers" | "storage" | "warning";
type TargetKind = "server" | "storage";

type OverviewRow = {
  id: string;
  kind: TargetKind;
  label: string;
  sublabel: string;
  online: boolean;
  statusText: string;
  statusTone: "ok" | "warning" | "danger" | "default";
  cpu: number | null;
  memory: number | null;
  swap: number | null;
  disk: number | null;
  usedBytes: number | null;
  capacityBytes: number | null;
  load1m: number | null;
  latencyMs: number | null;
  sampledAt: string | null;
  stale: boolean;
  note: string;
};

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index >= 3 ? 1 : index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatPercent(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "—";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("hu-HU");
}

function formatUptime(seconds?: number | null) {
  const safe = Number(seconds || 0);
  if (!safe) return "—";
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  return `${days} nap ${hours} óra`;
}

function isStale(value?: string | null, maxAgeMs = 10 * 60_000) {
  if (!value) return true;
  const stamp = new Date(value).getTime();
  return !Number.isFinite(stamp) || Date.now() - stamp > maxAgeMs;
}

function metadataNumber(row: MonitorRow | undefined, key: string) {
  const value = row?.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findLatest(rows: MonitorRow[], kind: string) {
  return rows
    .filter((row) => row.target_kind === kind && row.sampled_at)
    .sort((left, right) => new Date(right.sampled_at || 0).getTime() - new Date(left.sampled_at || 0).getTime())[0];
}

export default function ServerMonitorPage() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [infrastructure, setInfrastructure] = useState<InfrastructureSummary | null>(null);
  const [monitoring, setMonitoring] = useState<MonitorRow[]>([]);
  const [monitorCount, setMonitorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Infrastruktúra betöltése…");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const key = localStorage.getItem("dimproLicenseAdminKey")?.trim();
    if (!key) {
      setMessage("Nincs aktív BENJADMIN admin munkamenet.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = { "x-dimpro-license-admin-key": key };
      const [serverResponse, infrastructureResponse, controlResponse] = await Promise.all([
        fetch("/api/license/server-status", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/infrastructure-summary", { headers, cache: "no-store" }),
        fetch("/api/dev/engine/control-plane", { headers, cache: "no-store" }),
      ]);
      const [serverPayload, infrastructurePayload, controlPayload] = await Promise.all([
        serverResponse.json(),
        infrastructureResponse.json(),
        controlResponse.json(),
      ]);
      if (!serverResponse.ok || !serverPayload?.ok) throw new Error(serverPayload?.error || "A DEV szerverállapot nem tölthető be.");
      if (!infrastructureResponse.ok || !infrastructurePayload?.ok) throw new Error(infrastructurePayload?.error || "Az infrastruktúra-összesítő nem tölthető be.");
      setServerStatus(serverPayload as ServerStatus);
      setInfrastructure(infrastructurePayload as InfrastructureSummary);
      if (controlResponse.ok) {
        const control = (controlPayload as ControlPayload).controlPlane;
        setMonitoring(control?.monitoring || []);
        setMonitorCount(Number(control?.summary?.monitorSamples || 0));
      }
      setRefreshedAt(new Date().toISOString());
      setMessage("Infrastruktúra állapot frissítve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az infrastruktúra nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const overviewRows = useMemo<OverviewRow[]>(() => {
    const monitorDev = findLatest(monitoring, "DEV");
    const prod = infrastructure?.servers?.find((item) => item.code === "PRODUCTION");
    const database = infrastructure?.servers?.find((item) => item.code === "DATABASE");
    const rows: OverviewRow[] = [];

    const devSampleAt = monitorDev?.sampled_at || serverStatus?.collectedAt || null;
    const devStale = isStale(devSampleAt);
    rows.push({
      id: "DEV",
      kind: "server",
      label: "BENJADMIN DEV VPS",
      sublabel: serverStatus?.server?.hostname || "dimpro-dev",
      online: Boolean(serverStatus?.ok),
      statusText: !serverStatus?.ok ? "Nincs kapcsolat" : devStale ? "Élő · régi minta" : "Élő",
      statusTone: !serverStatus?.ok ? "danger" : devStale ? "warning" : "ok",
      cpu: typeof monitorDev?.cpu_percent === "number" ? monitorDev.cpu_percent : null,
      memory: typeof serverStatus?.memory?.usagePercent === "number" ? serverStatus.memory.usagePercent : null,
      swap: typeof serverStatus?.memory?.swapUsagePercent === "number" ? serverStatus.memory.swapUsagePercent : null,
      disk: typeof serverStatus?.disk?.usePercent === "number" ? serverStatus.disk.usePercent : null,
      usedBytes: serverStatus?.disk?.usedKb ? serverStatus.disk.usedKb * 1024 : null,
      capacityBytes: serverStatus?.disk?.sizeKb ? serverStatus.disk.sizeKb * 1024 : null,
      load1m: serverStatus?.server?.loadAverage?.[0] ?? null,
      latencyMs: null,
      sampledAt: devSampleAt,
      stale: devStale,
      note: "Helyi DEV telemetria és B3.1 monitorozási minta.",
    });

    for (const target of [prod, database]) {
      if (!target) continue;
      const stale = isStale(target.sampledAt);
      rows.push({
        id: target.code,
        kind: "server",
        label: target.label,
        sublabel: target.host,
        online: target.online,
        statusText: !target.online ? "Nincs kapcsolat" : stale ? "Élő · régi erőforrásminta" : "Élő",
        statusTone: !target.online ? "danger" : stale ? "warning" : "ok",
        cpu: null,
        memory: target.memory?.usagePercent ?? null,
        swap: target.swap?.usagePercent ?? null,
        disk: target.disk?.usePercent ?? null,
        usedBytes: target.disk?.usedBytes ?? null,
        capacityBytes: target.disk?.totalBytes ?? null,
        load1m: target.load1m ?? null,
        latencyMs: target.latencyMs ?? null,
        sampledAt: target.sampledAt ?? null,
        stale,
        note: target.note || "Read-only infrastruktúra-minta.",
      });
    }

    for (const storage of infrastructure?.storages || []) {
      rows.push({
        id: `STORAGE_${storage.code}`,
        kind: "storage",
        label: storage.label,
        sublabel: storage.bucket || storage.endpoint || "Hetzner Object Storage",
        online: storage.online,
        statusText: storage.online ? "Élő" : "Ellenőrizendő",
        statusTone: storage.online ? "ok" : "warning",
        cpu: null,
        memory: null,
        swap: null,
        disk: storage.usagePercent ?? null,
        usedBytes: storage.usedBytes ?? null,
        capacityBytes: storage.capacityBytes ?? null,
        load1m: null,
        latencyMs: null,
        sampledAt: infrastructure?.collectedAt || null,
        stale: false,
        note: storage.note || "S3 objektumtárhely.",
      });
    }

    return rows;
  }, [infrastructure, monitoring, serverStatus]);

  const visibleRows = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return overviewRows.filter((row) => {
      if (filter === "servers" && row.kind !== "server") return false;
      if (filter === "storage" && row.kind !== "storage") return false;
      if (filter === "warning" && row.statusTone === "ok") return false;
      if (!clean) return true;
      return [row.label, row.sublabel, row.statusText, row.note].join(" ").toLowerCase().includes(clean);
    });
  }, [filter, overviewRows, query]);

  const selected = overviewRows.find((row) => row.id === selectedId) || null;
  const warningCount = overviewRows.filter((row) => row.statusTone === "warning" || row.statusTone === "danger").length;
  const onlineCount = overviewRows.filter((row) => row.online).length;
  const maxSwap = Math.max(0, ...overviewRows.filter((row) => row.kind === "server").map((row) => row.swap ?? 0));
  const maxDisk = Math.max(0, ...overviewRows.map((row) => row.disk ?? 0));

  const selectedMonitorRows = useMemo(() => {
    if (!selected || selected.kind !== "server") return [];
    const kind = selected.id === "DEV" ? "DEV" : selected.id === "PRODUCTION" ? "PRODUCTION" : "DATABASE";
    return monitoring
      .filter((row) => row.target_kind === kind)
      .sort((left, right) => new Date(right.sampled_at || 0).getTime() - new Date(left.sampled_at || 0).getTime())
      .slice(0, 12);
  }, [monitoring, selected]);

  return (
    <>
      <BenjadminDataWorkspace
        eyebrow="BENJADMIN · INFRASTRUKTÚRA"
        title="Szerver- és tárhelyállapot"
        description="DEV, ÉLES, DB és külső objektumtárhelyek egységes read-only állapotképe. CPU, RAM, swap, lemez, tárhely és válaszidő egy táblában."
        actions={(
          <>
            <Link href="/admin/szerver/reszletes" className="benjadmin-data-secondary-action"><Server size={16} /> Részletes DEV diagnosztika</Link>
            <button type="button" className="benjadmin-data-primary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "is-spinning" : ""} /> {loading ? "Frissítés…" : "Frissítés"}</button>
          </>
        )}
        metrics={(
          <>
            <BenjadminMetric label="Felügyelt cél" value={overviewRows.length} />
            <BenjadminMetric label="Online" value={`${onlineCount}/${overviewRows.length}`} tone={onlineCount === overviewRows.length ? "ok" : "warning"} />
            <BenjadminMetric label="Figyelmeztetés" value={warningCount} tone={warningCount ? "warning" : "ok"} />
            <BenjadminMetric label="Legnagyobb swap" value={`${Math.round(maxSwap)}%`} tone={maxSwap >= 75 ? "warning" : "default"} />
            <BenjadminMetric label="Legnagyobb tárhelyfoglaltság" value={`${Math.round(maxDisk)}%`} tone={maxDisk >= 75 ? "warning" : "default"} />
          </>
        )}
        toolbar={(
          <>
            <div className="benjadmin-data-filter-group" aria-label="Infrastruktúra szűrő">
              <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Mind</button>
              <button type="button" className={filter === "servers" ? "is-active" : ""} onClick={() => setFilter("servers")}>Szerverek</button>
              <button type="button" className={filter === "storage" ? "is-active" : ""} onClick={() => setFilter("storage")}>Tárhelyek</button>
              <button type="button" className={filter === "warning" ? "is-active" : ""} onClick={() => setFilter("warning")}>Figyelmeztetések</button>
            </div>
            <label className="benjadmin-data-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés szerver, tárhely, host vagy státusz alapján" /></label>
            <div className="benjadmin-data-stage-strip"><span className="is-online">B3.1 minták: <b>{monitorCount}</b></span><span>Frissítve: <b>{refreshedAt ? new Date(refreshedAt).toLocaleTimeString("hu-HU") : "—"}</b></span></div>
          </>
        )}
        footer={<span className="benjadmin-data-message">{message} · PRODUCTION művelet nincs engedélyezve ezen a nézeten.</span>}
      >
        <div className="benjadmin-data-table-scroll">
          <table className="benjadmin-data-table benjadmin-infra-table" data-testid="benjadmin-infrastructure-table">
            <thead>
              <tr>
                <th>Rendszer</th>
                <th>Típus</th>
                <th>Állapot</th>
                <th>CPU</th>
                <th>Memória</th>
                <th>Swap</th>
                <th>Lemez / tárhely</th>
                <th>Foglalt / kapacitás</th>
                <th>Load / válaszidő</th>
                <th>Adatminta</th>
                <th>Művelet</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row) => (
                <tr key={row.id} className={row.statusTone === "warning" ? "is-warning-row" : row.statusTone === "danger" ? "is-danger-row" : ""}>
                  <td><strong>{row.label}</strong><br /><small>{row.sublabel}</small></td>
                  <td>{row.kind === "server" ? <><Server size={13} /> VPS</> : <><HardDrive size={13} /> S3 tárhely</>}</td>
                  <td><BenjadminStatusPill tone={row.statusTone}>{row.statusText}</BenjadminStatusPill></td>
                  <td>{formatPercent(row.cpu)}</td>
                  <td>{formatPercent(row.memory)}</td>
                  <td><span className={typeof row.swap === "number" && row.swap >= 75 ? "benjadmin-infra-warning-value" : ""}>{formatPercent(row.swap)}</span></td>
                  <td><span className={typeof row.disk === "number" && row.disk >= 75 ? "benjadmin-infra-warning-value" : ""}>{formatPercent(row.disk)}</span></td>
                  <td className="is-nowrap">{row.capacityBytes ? `${formatBytes(row.usedBytes)} / ${formatBytes(row.capacityBytes)}` : row.usedBytes != null ? `${formatBytes(row.usedBytes)} / keret nincs beállítva` : "—"}</td>
                  <td>{row.latencyMs != null ? `${row.latencyMs} ms` : row.load1m != null ? `load ${row.load1m.toFixed(2)}` : "—"}</td>
                  <td className="is-nowrap"><span className={row.stale ? "benjadmin-infra-stale" : ""}>{formatDateTime(row.sampledAt)}</span></td>
                  <td><button type="button" className="benjadmin-data-row-action" onClick={() => setSelectedId(row.id)}>Részletek</button></td>
                </tr>
              )) : <tr><td colSpan={11} className="benjadmin-data-empty">Nincs a szűrésnek megfelelő infrastruktúra-cél.</td></tr>}
            </tbody>
          </table>
        </div>
      </BenjadminDataWorkspace>

      {selected ? <button type="button" className="benjadmin-data-drawer-backdrop" aria-label="Infrastruktúra részletek bezárása" onClick={() => setSelectedId(null)} /> : null}
      {selected ? (
        <aside className="benjadmin-data-drawer benjadmin-infra-drawer" data-testid="benjadmin-infrastructure-drawer">
          <header><div><span>{selected.kind === "server" ? "SZERVER RÉSZLETEK" : "TÁRHELY RÉSZLETEK"}</span><strong>{selected.label}</strong></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Bezárás"><X size={18} /></button></header>
          <div className="benjadmin-data-drawer__body benjadmin-infra-detail">
            <section className="benjadmin-data-form-section">
              <header><strong>Aktuális állapot</strong><BenjadminStatusPill tone={selected.statusTone}>{selected.statusText}</BenjadminStatusPill></header>
              <p>{selected.note}</p>
            </section>
            <div className="benjadmin-infra-detail-grid">
              <span>CPU<b>{formatPercent(selected.cpu)}</b></span>
              <span>Memória<b>{formatPercent(selected.memory)}</b></span>
              <span>Swap<b>{formatPercent(selected.swap)}</b></span>
              <span>Lemez / tárhely<b>{formatPercent(selected.disk)}</b></span>
              <span>Foglalt<b>{selected.usedBytes != null ? formatBytes(selected.usedBytes) : "—"}</b></span>
              <span>Kapacitás<b>{selected.capacityBytes ? formatBytes(selected.capacityBytes) : "Nincs beállítva"}</b></span>
              <span>1 perces terhelés<b>{selected.load1m != null ? selected.load1m.toFixed(2) : "—"}</b></span>
              <span>Válaszidő<b>{selected.latencyMs != null ? `${selected.latencyMs} ms` : "—"}</b></span>
              <span>Adatminta<b>{formatDateTime(selected.sampledAt)}</b></span>
              <span>Mintafrissesség<b>{selected.stale ? "Régi / ellenőrizendő" : "Friss"}</b></span>
            </div>

            {selected.id === "DEV" ? (
              <>
                <section className="benjadmin-data-form-section">
                  <header><strong>DEV szolgáltatások</strong><span>{formatUptime(serverStatus?.server?.uptimeSeconds)} üzemidő</span></header>
                  <div className="benjadmin-infra-service-lines">
                    <span>Nginx <b>{serverStatus?.services?.nginx?.ok ? "Rendben" : "Ellenőrizendő"}</b></span>
                    <span>PM2 <b>{serverStatus?.services?.pm2?.processes?.filter((item) => item.status === "online").length || 0}/{serverStatus?.services?.pm2?.processes?.length || 0} online</b></span>
                    <span>Node.js <b>{serverStatus?.server?.nodeVersion || "—"}</b></span>
                    <span>Swap foglalt <b>{formatBytes(serverStatus?.memory?.swapUsedBytes)} / {formatBytes(serverStatus?.memory?.swapTotalBytes)}</b></span>
                  </div>
                </section>
                <Link href="/admin/szerver/reszletes" className="benjadmin-data-primary-action is-full">Részletes DEV diagnosztika megnyitása</Link>
              </>
            ) : null}

            {selected.kind === "server" ? (
              <section className="benjadmin-data-form-section">
                <header><strong>Utolsó B3.1 monitorozási minták</strong><span>{selectedMonitorRows.length} minta</span></header>
                <div className="benjadmin-data-mini-table-scroll"><table className="benjadmin-data-mini-table"><thead><tr><th>Időpont</th><th>Státusz</th><th>CPU</th><th>RAM</th><th>Lemez</th><th>Swap</th><th>Válasz</th></tr></thead><tbody>{selectedMonitorRows.length ? selectedMonitorRows.map((row, index) => <tr key={`${row.sampled_at}-${index}`}><td>{formatDateTime(row.sampled_at)}</td><td>{row.status || "—"}</td><td>{formatPercent(row.cpu_percent)}</td><td>{formatPercent(row.memory_percent)}</td><td>{formatPercent(row.disk_percent)}</td><td>{formatPercent(metadataNumber(row, "swap_percent"))}</td><td>{row.response_ms != null ? `${row.response_ms} ms` : "—"}</td></tr>) : <tr><td colSpan={7}>Nincs monitorozási minta.</td></tr>}</tbody></table></div>
              </section>
            ) : null}

            {selected.kind === "storage" ? (() => {
              const storage = infrastructure?.storages?.find((item) => `STORAGE_${item.code}` === selected.id);
              const hetzner = storage?.provider === "HETZNER_OBJECT_STORAGE";
              return <section className="benjadmin-data-form-section"><header><strong>Objektumtárhely</strong><span>{storage?.online ? "S3 kapcsolat rendben" : "Ellenőrizendő"}</span></header><div className="benjadmin-infra-service-lines"><span>Bucket <b>{storage?.bucket || "—"}</b></span><span>Endpoint <b>{storage?.endpoint || "—"}</b></span><span>Objektumok <b>{storage?.objectCount != null ? `${storage.objectCount}${storage.truncated ? "+" : ""} db` : "—"}</b></span><span>Foglalt <b>{storage?.usedBytes != null ? formatBytes(storage.usedBytes) : "—"}</b></span><span>DIMPRO hard keret <b>{storage?.capacityBytes ? formatBytes(storage.capacityBytes) : "Nincs beállítva"}</b></span>{hetzner && storage?.includedStorageBytes ? <span>Hetzner báziskeret <b>{formatBytes(storage.includedStorageBytes)} · account-szinten közös</b></span> : null}{hetzner && storage?.bucketHardLimitBytes ? <span>Bucket technikai limit <b>{formatBytes(storage.bucketHardLimitBytes)}</b></span> : null}</div>{hetzner ? <p className="benjadmin-data-inline-note">Az 1 TB báziskeret nem hard bucket-kapacitás: a Hetzner a tárolást account-szinten, TB-óra alapon számolja; a többlet pay-as-you-go.</p> : null}</section>;
            })() : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
