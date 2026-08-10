import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BenjadminStartMode = "START" | "DEV_START" | "PROD_START";

type DbRow = Record<string, unknown>;

type OptionalTableProbe = {
  table: string;
  ready: boolean;
  errorCode: string | null;
};

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error("A BENJADMIN Control Plane adatbázis-kapcsolata nincs beállítva.");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "dimpro-benjadmin-control-plane/0.3.1" } },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function rows(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter((item): item is DbRow => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

async function probeTable(client: SupabaseClient, table: string): Promise<OptionalTableProbe> {
  const { error } = await client.from(table).select("*").limit(0);
  return { table, ready: !error, errorCode: error?.code || null };
}

export async function getBenjadminControlPlaneSnapshot() {
  const client = getClient();
  const [audit, workSessions, builds, releases, backups, environments, controlMeta, startContexts, commandQueue, approvals, decisions, monitoring, storageTelemetry, storagePolicies] = await Promise.all([
    client.from("dev_center_audit_events").select("*").order("created_at", { ascending: false }).limit(120),
    client.from("dev_center_work_sessions").select("*").order("started_at", { ascending: false }).limit(60),
    client.from("dev_center_build_runs").select("*").order("created_at", { ascending: false }).limit(50),
    client.from("dev_center_releases").select("*").order("created_at", { ascending: false }).limit(50),
    client.from("dev_center_backup_runs").select("*").order("started_at", { ascending: false }).limit(50),
    client.from("dev_center_environments").select("*").order("code"),
    probeTable(client, "dev_center_control_schema_meta"),
    probeTable(client, "dev_center_start_contexts"),
    probeTable(client, "dev_center_command_queue"),
    probeTable(client, "dev_center_approvals"),
    probeTable(client, "dev_center_decision_memory"),
    probeTable(client, "dev_center_monitor_samples"),
    probeTable(client, "dimpro_storage_telemetry"),
    probeTable(client, "dimpro_storage_quota_policies"),
  ]);

  for (const result of [audit, workSessions, builds, releases, backups, environments]) {
    if (result.error) throw new Error(result.error.message || "A BENJADMIN Control Plane állapota nem tölthető be.");
  }

  const environmentRows = rows(environments.data);
  const devEnvironment = environmentRows.find((item) => text(item.code) === "DEV");
  const prodEnvironment = environmentRows.find((item) => text(item.code) === "PRODUCTION");
  const optional = [controlMeta, startContexts, commandQueue, approvals, decisions, monitoring, storageTelemetry, storagePolicies];

  return {
    generatedAt: new Date().toISOString(),
    architecture: {
      currentMode: process.env.BENJADMIN_CONTROL_PLANE_MODE?.trim() || "DEV_EMBEDDED_FALLBACK",
      targetMode: "CONTROL_VPS",
      currentHostRole: "DEV runtime + ideiglenes control-plane read model",
      targetHostRole: "BENJADMIN UI, task/worker vezérlés, munkanapló, event/SSE, health, command queue és release státuszok",
      productionDefault: "READ_ONLY",
    },
    startModes: [
      {
        mode: "START" as BenjadminStartMode,
        target: "AUTO/READ_FIRST",
        writeAllowed: false,
        approvalRequired: false,
        description: "Állapotfelmérés és irányítási kontextus; környezetválasztás előtt nem indít írást.",
      },
      {
        mode: "DEV_START" as BenjadminStartMode,
        target: "DEV",
        writeAllowed: Boolean(devEnvironment && devEnvironment.read_only === false),
        approvalRequired: false,
        description: "DEV fejlesztés; write/build/test csak READY session, scope és worktree védelem mellett.",
      },
      {
        mode: "PROD_START" as BenjadminStartMode,
        target: "PRODUCTION",
        writeAllowed: false,
        approvalRequired: true,
        description: "PROD állapotfelmérés read-only. Éles írás/restart/deploy csak külön, explicit jóváhagyott műveletként indulhat.",
      },
    ],
    environments: {
      dev: devEnvironment || null,
      production: prodEnvironment || null,
      all: environmentRows,
    },
    schema: {
      controlPlaneReady: [controlMeta, startContexts, commandQueue, approvals, decisions, monitoring].every((item) => item.ready),
      storageTelemetryReady: storageTelemetry.ready && storagePolicies.ready,
      probes: optional,
    },
    liveWorklog: rows(audit.data).slice(0, 80),
    workSessions: rows(workSessions.data),
    builds: rows(builds.data),
    releases: rows(releases.data),
    backups: rows(backups.data),
  };
}
