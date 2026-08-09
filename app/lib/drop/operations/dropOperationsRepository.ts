import { createHash } from "node:crypto";
import { getDropSupabaseClient } from "../dropRepository";
import { getDropPublicStoreStatus } from "../public/dropPublicRepository";
import { getDropStorageConfig } from "../storage/dropStorageConfig";
import { headDropS3Object, listDropS3Objects } from "../storage/dropS3Storage";
import type {
  DropOperationsCheck,
  DropOperationsSnapshot,
  DropOperationsStatus,
  DropOperationsStorageAudit,
} from "./dropOperationsTypes";

type DbRow = Record<string, unknown>;
type QueryResult<T> = { data: T[] | null; error: { message?: string; code?: string } | null; count?: number | null };

function rows<T extends DbRow>(result: QueryResult<T>, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message || result.error.code || "adatbázishiba"}`);
  return result.data || [];
}
function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function dateMs(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function maskObjectKey(value: string) {
  return `obj_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}
function rank(status: DropOperationsStatus) {
  return status === "error" ? 2 : status === "warning" ? 1 : 0;
}
function aggregateStatus(checks: DropOperationsCheck[]): DropOperationsStatus {
  return checks.reduce<DropOperationsStatus>((current, check) => rank(check.status) > rank(current) ? check.status : current, "ok");
}
function check(input: DropOperationsCheck) { return input; }
function staleBefore(minutes: number) { return Date.now() - minutes * 60_000; }

async function collectStorageAudit(deep: boolean): Promise<DropOperationsStorageAudit> {
  const config = getDropStorageConfig();
  const base: DropOperationsStorageAudit = {
    requested: deep,
    provider: config.provider,
    bucket: config.bucket,
    databaseObjectCount: 0,
    scannedObjectCount: 0,
    orphanObjectCount: 0,
    missingObjectCount: 0,
    sizeMismatchCount: 0,
    truncated: false,
    orphanSamples: [],
    missingSamples: [],
    error: null,
  };
  if (!deep || config.provider !== "s3-compatible") return base;

  try {
    const client = getDropSupabaseClient();
    const [fileResult, reportResult, cleanupResult] = await Promise.all([
      client.from("drop_files")
        .select("id,storage_bucket,storage_key,size_stored_bytes,deleted_at,upload_status,created_at")
        .eq("storage_provider", "s3-compatible")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000) as unknown as Promise<QueryResult<DbRow>>,
      client.from("drop_reports")
        .select("storage_key,status,created_at")
        .not("storage_key", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000) as unknown as Promise<QueryResult<DbRow>>,
      client.from("drop_object_cleanup_tasks")
        .select("storage_bucket,storage_key,status")
        .in("status", ["pending", "failed"])
        .limit(2000) as unknown as Promise<QueryResult<DbRow>>,
    ]);
    const files = rows(fileResult, "Drop fájlobjektumok");
    const reports = rows(reportResult, "Drop riportobjektumok");
    const cleanup = rows(cleanupResult, "Drop takarítási objektumok");
    const known = new Set<string>();
    for (const file of files) if (String(file.storage_bucket || config.bucket) === config.bucket) known.add(String(file.storage_key || ""));
    for (const report of reports) known.add(String(report.storage_key || ""));
    for (const task of cleanup) if (String(task.storage_bucket || config.bucket) === config.bucket) known.add(String(task.storage_key || ""));
    known.delete("");
    base.databaseObjectCount = known.size;

    const listed = await listDropS3Objects({ maxKeys: 1000, bucket: config.bucket });
    base.scannedObjectCount = listed.objects.length;
    base.truncated = listed.truncated;
    const orphan = listed.objects.filter((object) => !known.has(object.key));
    base.orphanObjectCount = orphan.length;
    base.orphanSamples = orphan.slice(0, 8).map((object) => maskObjectKey(object.key));

    const sampleFiles = files
      .filter((file) => String(file.storage_bucket || config.bucket) === config.bucket && String(file.storage_key || ""))
      .slice(0, 25);
    for (const file of sampleFiles) {
      const key = String(file.storage_key || "");
      try {
        const head = await headDropS3Object({ storageKey: key, bucket: config.bucket });
        if (head.sizeBytes !== numberValue(file.size_stored_bytes)) base.sizeMismatchCount += 1;
      } catch (error) {
        const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
        if (candidate?.name === "NotFound" || candidate?.name === "NoSuchKey" || candidate?.$metadata?.httpStatusCode === 404) {
          base.missingObjectCount += 1;
          if (base.missingSamples.length < 8) base.missingSamples.push(maskObjectKey(key));
        } else {
          throw error;
        }
      }
    }
    return base;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen S3 audit hiba." };
  }
}

export async function collectDropOperationsSnapshot(input: {
  source?: DropOperationsSnapshot["source"];
  deepStorageAudit?: boolean;
} = {}): Promise<Omit<DropOperationsSnapshot, "alert">> {
  const startedAt = Date.now();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60_000).toISOString();
  const client = getDropSupabaseClient();

  const [packagesResult, filesResult, sessionsResult, accessResult, eventsResult, emailsResult, downloadsResult, jobsResult, cleanupResult, workflowsResult, publicStore, storageAudit] = await Promise.all([
    client.from("drop_packages").select("id,status,current_total_size_bytes,created_at,grace_expires_at,delete_status").order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_files").select("id,package_id,size_stored_bytes,upload_status,virus_scan_status,security_status,scan_error,created_at,updated_at,deleted_at,download_count").is("deleted_at", null).order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_upload_sessions").select("id,status,total_bytes,uploaded_bytes,expires_at,created_at,updated_at,completed_at").order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_access_attempts").select("success,failure_code,ip_hash,created_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_events").select("event_type,severity,created_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_email_log").select("status,created_at,sent_at,last_error").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_downloads").select("package_id,status,started_at,issued_at,completed_at").gte("started_at", since7d).order("started_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_jobs").select("status,job_type,run_after,lease_expires_at,created_at,updated_at,last_error").order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_object_cleanup_tasks").select("status,attempts,requested_at,updated_at,last_error").order("requested_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    client.from("drop_public_package_workflows").select("workflow_type,notification_status,created_at,updated_at").gte("created_at", since7d).order("created_at", { ascending: false }).limit(5000) as unknown as Promise<QueryResult<DbRow>>,
    getDropPublicStoreStatus({ refresh: true }),
    collectStorageAudit(Boolean(input.deepStorageAudit)),
  ]);

  const packages = rows(packagesResult, "Drop csomagok");
  const files = rows(filesResult, "Drop fájlok");
  const sessions = rows(sessionsResult, "Drop feltöltési munkamenetek");
  const access = rows(accessResult, "Drop hozzáférési próbák");
  const events = rows(eventsResult, "Drop események");
  const emails = rows(emailsResult, "Drop e-mail napló");
  const downloads = rows(downloadsResult, "Drop letöltések");
  const jobs = rows(jobsResult, "Drop worker jobok");
  const cleanup = rows(cleanupResult, "Drop tárhelytakarítás");
  const workflows = rows(workflowsResult, "Drop publikus workflow-k");

  const packages24h = packages.filter((row) => dateMs(row.created_at) >= Date.parse(since24h));
  const packages7d = packages.filter((row) => dateMs(row.created_at) >= Date.parse(since7d));
  const activePackageStatuses = new Set(["draft", "preparing", "active", "upload_closed", "expiring", "reporting", "deleting"]);
  const activePackages = packages.filter((row) => activePackageStatuses.has(String(row.status || "")));
  const pastGraceNotDeleted = packages.filter((row) => dateMs(row.grace_expires_at) > 0 && dateMs(row.grace_expires_at) < now && !["deleted", "expired"].includes(String(row.status || ""))).length;

  const sessions24h = sessions.filter((row) => dateMs(row.created_at) >= Date.parse(since24h));
  const activeSessions = sessions.filter((row) => ["initialized", "uploading", "parts_received"].includes(String(row.status || "")));
  const staleSessions = activeSessions.filter((row) => dateMs(row.expires_at) < now).length;
  const failedSessions24h = sessions24h.filter((row) => String(row.status || "") === "failed").length;
  const completedSessions24h = sessions24h.filter((row) => ["completed", "ready"].includes(String(row.status || ""))).length;

  const access24h = access.filter((row) => dateMs(row.created_at) >= Date.parse(since24h));
  const failedAccess24hRows = access24h.filter((row) => row.success === false);
  const failedAccess7d = access.filter((row) => row.success === false).length;
  const ipFailures = countBy(failedAccess24hRows.map((row) => String(row.ip_hash || "unknown")));
  const topIpFailureCount24h = Math.max(0, ...Object.values(ipFailures));
  const failedSendCode24h = failedAccess24hRows.filter((row) => String(row.failure_code || "").startsWith("DROP_SEND_CODE_")).length;
  const botBlocks24h = events.filter((row) => dateMs(row.created_at) >= Date.parse(since24h) && String(row.event_type || "").startsWith("security.bot_")).length;
  const infectedFiles = files.filter((row) => String(row.virus_scan_status || "") === "infected" || String(row.security_status || "") === "infected").length;
  const scanErrors = files.filter((row) => String(row.virus_scan_status || "") === "error" || Boolean(row.scan_error)).length;
  const staleScanQueue = files.filter((row) => ["scanner_required", "queued", "scanning"].includes(String(row.virus_scan_status || "")) && dateMs(row.updated_at) < staleBefore(20)).length;

  const emails24h = emails.filter((row) => dateMs(row.created_at) >= Date.parse(since24h));
  const emailsSent24h = emails24h.filter((row) => ["sent", "delivered", "completed"].includes(String(row.status || ""))).length;
  const emailsFailed24h = emails24h.filter((row) => ["failed", "error", "rejected"].includes(String(row.status || ""))).length;
  const emailAttempted24h = emailsSent24h + emailsFailed24h;
  const emailFailureRate24h = emailAttempted24h ? Math.round((emailsFailed24h / emailAttempted24h) * 1000) / 10 : 0;
  const downloads24hRows = downloads.filter((row) => dateMs(row.started_at) >= Date.parse(since24h));
  const downloadedPackages24h = new Set(downloads24hRows.map((row) => String(row.package_id || "")).filter(Boolean)).size;
  const finalizationFailed = workflows.filter((row) => ["failed", "partial"].includes(String(row.notification_status || ""))).length;
  const workflow24h = countBy(workflows.filter((row) => dateMs(row.created_at) >= Date.parse(since24h)).map((row) => String(row.workflow_type || "unknown")));

  const workerQueued = jobs.filter((row) => String(row.status || "") === "queued").length;
  const workerRetry = jobs.filter((row) => String(row.status || "") === "retry").length;
  const workerFailed = jobs.filter((row) => String(row.status || "") === "failed").length;
  const staleRunning = jobs.filter((row) => String(row.status || "") === "running" && dateMs(row.lease_expires_at) > 0 && dateMs(row.lease_expires_at) < now).length;
  const cleanupPending = cleanup.filter((row) => String(row.status || "") === "pending").length;
  const cleanupFailed = cleanup.filter((row) => String(row.status || "") === "failed").length;
  const cleanupStale = cleanup.filter((row) => ["pending", "failed"].includes(String(row.status || "")) && dateMs(row.requested_at) < staleBefore(30)).length;

  const metrics: DropOperationsSnapshot["metrics"] = {
    packages: {
      total: packages.length,
      active: activePackages.length,
      created24h: packages24h.length,
      created7d: packages7d.length,
      bytesStored: files.reduce((sum, row) => sum + numberValue(row.size_stored_bytes), 0),
      pastGraceNotDeleted,
      statusCounts: countBy(packages.map((row) => String(row.status || "unknown"))),
      workflow24h,
    },
    uploads: {
      active: activeSessions.length,
      stale: staleSessions,
      failed24h: failedSessions24h,
      completed24h: completedSessions24h,
      uploadedBytes24h: sessions24h.reduce((sum, row) => sum + numberValue(row.uploaded_bytes), 0),
    },
    security: {
      failedAccess24h: failedAccess24hRows.length,
      failedAccess7d,
      failedSendCode24h,
      topIpFailureCount24h,
      botBlocks24h,
      infectedFiles,
      scanErrors,
      staleScanQueue,
    },
    delivery: {
      emailsSent24h,
      emailsFailed24h,
      emailFailureRate24h,
      downloads24h: downloads24hRows.length,
      downloadedPackages24h,
      finalizationFailed,
    },
    worker: { queued: workerQueued, retry: workerRetry, failed: workerFailed, staleRunning },
    cleanup: { pending: cleanupPending, failed: cleanupFailed, stale: cleanupStale },
    publicWorkflows: {
      sendCodes: numberValue(publicStore.postgresCounts?.sendCodes),
      gates: numberValue(publicStore.postgresCounts?.gates),
      sessions: numberValue(publicStore.postgresCounts?.sessions),
      workflows: numberValue(publicStore.postgresCounts?.workflows),
      usage: numberValue(publicStore.postgresCounts?.usage),
    },
  };

  const checks: DropOperationsCheck[] = [
    check({ id: "postgres-store", label: "Központi workflow-tár", status: publicStore.activeStore === "postgresql" && publicStore.schemaReady ? "ok" : "error", value: publicStore.activeStore, detail: publicStore.reason, action: "PostgreSQL readiness és aktiválási marker ellenőrzése." }),
    check({ id: "failed-access", label: "Sikertelen hozzáférések", status: failedAccess24hRows.length >= 100 || topIpFailureCount24h >= 30 ? "error" : failedAccess24hRows.length >= 20 || topIpFailureCount24h >= 10 ? "warning" : "ok", value: `${failedAccess24hRows.length} / 24 óra`, detail: `Legaktívabb anonimizált forrás: ${topIpFailureCount24h} sikertelen próba.`, action: "Rate limit és hozzáférési kódok felülvizsgálata." }),
    check({ id: "bot-protection", label: "Robotvédelmi tiltások", status: botBlocks24h >= 100 ? "error" : botBlocks24h >= 20 ? "warning" : "ok", value: `${botBlocks24h} / 24 óra`, detail: "Human Timing Gate és honeypot események.", action: "Tartós támadásnál Turnstile vagy IP-blokkolás mérlegelése." }),
    check({ id: "malware", label: "Vírus- és karanténállapot", status: infectedFiles > 0 ? "error" : scanErrors > 0 || staleScanQueue > 0 ? "warning" : "ok", value: `${infectedFiles} fertőzött · ${scanErrors} hiba`, detail: `${staleScanQueue} fájl vár 20 percnél régebben vizsgálatra.`, action: "ClamAV és worker napló ellenőrzése." }),
    check({ id: "email", label: "E-mail kézbesítés", status: emailsFailed24h >= 5 || (emailAttempted24h >= 5 && emailFailureRate24h >= 30) ? "error" : emailsFailed24h > 0 ? "warning" : "ok", value: `${emailsSent24h} sikeres · ${emailsFailed24h} hibás`, detail: `Hibaarány: ${emailFailureRate24h}%.`, action: "SMTP és címzettelutasítások ellenőrzése." }),
    check({ id: "public-finalization", label: "Send/Beküldőkapu kézbesítés", status: finalizationFailed >= 5 ? "error" : finalizationFailed > 0 ? "warning" : "ok", value: `${finalizationFailed} hibás/részleges`, detail: "A failed vagy partial kézbesítési workflow-k száma.", action: "A worker automatikus kézbesítési eredményének és az SMTP naplónak az ellenőrzése." }),
    check({ id: "worker", label: "Worker jobok", status: workerFailed > 0 || staleRunning > 0 ? "error" : workerRetry > 0 ? "warning" : "ok", value: `${workerQueued} sorban · ${workerRetry} újrapróba`, detail: `${workerFailed} végleg hibás, ${staleRunning} lejárt futási zárral.`, action: "Worker job és PM2/systemd napló ellenőrzése." }),
    check({ id: "cleanup", label: "Tárhelytakarítás", status: cleanupFailed > 0 || cleanupStale >= 5 ? "error" : cleanupStale > 0 ? "warning" : "ok", value: `${cleanupPending} függő · ${cleanupFailed} hibás`, detail: `${cleanupStale} feladat 30 percnél régebbi.`, action: "Object Storage jogosultság és cleanup worker ellenőrzése." }),
    check({ id: "retention", label: "Lejárati életciklus", status: pastGraceNotDeleted > 0 ? "error" : "ok", value: `${pastGraceNotDeleted} elakadt csomag`, detail: "A grace időn túl nem törölt csomagok száma.", action: "Final report, Drive archiválás és törlési gate ellenőrzése." }),
    check({ id: "uploads", label: "Feltöltési munkamenetek", status: staleSessions > 0 ? "warning" : failedSessions24h >= 10 ? "warning" : "ok", value: `${activeSessions.length} aktív · ${staleSessions} lejárt`, detail: `${failedSessions24h} sikertelen és ${completedSessions24h} befejezett munkamenet 24 órán belül.`, action: "Lejárt multipart feltöltések takarítása." }),
    check({ id: "storage-audit", label: "Object Storage mély audit", status: storageAudit.error || storageAudit.missingObjectCount > 0 || storageAudit.sizeMismatchCount > 0 ? "error" : storageAudit.orphanObjectCount > 0 ? "warning" : "ok", value: storageAudit.requested ? `${storageAudit.scannedObjectCount} vizsgált objektum` : "Nincs futtatva", detail: storageAudit.error || `${storageAudit.orphanObjectCount} árva, ${storageAudit.missingObjectCount} hiányzó, ${storageAudit.sizeMismatchCount} méreteltérés.${storageAudit.truncated ? " Az audit első 1000 objektumra korlátozott." : ""}`, action: "Mély audit futtatása és azonosított objektumok kézi ellenőrzése." }),
  ];
  const status = aggregateStatus(checks);
  return {
    version: "DROP 1.2.11",
    source: input.source || "api",
    collectedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    status,
    label: status === "ok" ? "A Drop működése rendben" : status === "warning" ? "A Drop figyelmeztetést igényel" : "A Drop beavatkozást igényel",
    deepStorageAudit: Boolean(input.deepStorageAudit),
    metrics,
    storageAudit,
    checks: checks.sort((a, b) => rank(b.status) - rank(a.status)),
  };
}
