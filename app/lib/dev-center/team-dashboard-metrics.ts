import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TIME_ZONE = "Europe/Budapest";
const BENJADMIN_TIMER_SOURCE = "benjadmin-time";
const TIMER_START = "BENJADMIN_TIME_START";
const TIMER_STOP = "BENJADMIN_TIME_STOP";

type Row = Record<string, unknown>;

type PersonTime = {
  code: "BENJADMIN" | "BENAI" | "ARMINAI" | "JAZMINAI" | "OUTMINAI" | "MFORGE" | "VGUARD" | "CHATGPT_MCP";
  name: string;
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  source: string;
  measurement: "MANUAL" | "SESSION_WALL" | "PROVIDER_ACTIVE" | "DEV_WORKLOG" | "NOT_AVAILABLE";
};

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("A DEV adatbázis-kapcsolat nincs konfigurálva.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function envHuf(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function dateKey(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function monthKey(value: Date | string | number) {
  return dateKey(value).slice(0, 7);
}

function mondayKey(now: Date) {
  const localKey = dateKey(now);
  const [y, m, d] = localKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = probe.getUTCDay() || 7;
  probe.setUTCDate(probe.getUTCDate() - (weekday - 1));
  return dateKey(probe);
}


function offsetMsAt(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

function zonedMidnightMs(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = localAsUtc - offsetMsAt(localAsUtc);
  candidate = localAsUtc - offsetMsAt(candidate);
  return candidate;
}

function nextDateKey(key: string, days = 1) {
  const [year, month, day] = key.split("-").map(Number);
  return dateKey(new Date(Date.UTC(year, month - 1, day + days, 12)));
}

function nextMonthKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1, 12));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function overlapMinutes(startMs: number, endMs: number, fromMs: number, toMs: number) {
  return Math.max(0, Math.min(endMs, toMs) - Math.max(startMs, fromMs)) / 60_000;
}

function addIntervalTime(bucket: PersonTime, start: unknown, end: unknown, now: Date, weekStart: string) {
  const startMs = Date.parse(String(start || ""));
  const endMs = end ? Date.parse(String(end)) : now.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
  const currentDay = dateKey(now);
  const currentMonthStart = `${monthKey(now)}-01`;
  bucket.todayMinutes += overlapMinutes(startMs, endMs, zonedMidnightMs(currentDay), zonedMidnightMs(nextDateKey(currentDay)));
  bucket.weekMinutes += overlapMinutes(startMs, endMs, zonedMidnightMs(weekStart), zonedMidnightMs(nextDateKey(currentDay)));
  bucket.monthMinutes += overlapMinutes(startMs, endMs, zonedMidnightMs(currentMonthStart), zonedMidnightMs(nextMonthKey(currentMonthStart)));
}

function roundTime(item: PersonTime): PersonTime {
  return {
    ...item,
    todayMinutes: Math.round(item.todayMinutes),
    weekMinutes: Math.round(item.weekMinutes),
    monthMinutes: Math.round(item.monthMinutes),
  };
}

function emptyPeople(): Record<PersonTime["code"], PersonTime> {
  return {
    BENJADMIN: { code: "BENJADMIN", name: "BenjAdmin", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "benjadmin-time", measurement: "MANUAL" },
    BENAI: { code: "BENAI", name: "Ben-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_worker_sessions", measurement: "SESSION_WALL" },
    ARMINAI: { code: "ARMINAI", name: "Ármin-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_worker_sessions", measurement: "SESSION_WALL" },
    JAZMINAI: { code: "JAZMINAI", name: "Jázmin-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_worker_sessions", measurement: "SESSION_WALL" },
    OUTMINAI: { code: "OUTMINAI", name: "Outmin-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_worker_sessions", measurement: "SESSION_WALL" },
    MFORGE: { code: "MFORGE", name: "M.Forge-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_live_worklog", measurement: "PROVIDER_ACTIVE" },
    VGUARD: { code: "VGUARD", name: "V.Guard-AI", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_live_worklog", measurement: "PROVIDER_ACTIVE" },
    CHATGPT_MCP: { code: "CHATGPT_MCP", name: "ChatGPT + VPS-MCP", todayMinutes: 0, weekMinutes: 0, monthMinutes: 0, source: "dev_center_work_sessions", measurement: "DEV_WORKLOG" },
  };
}

async function timerRows(client: SupabaseClient, sinceIso: string) {
  const result = await client
    .from("dev_center_live_worklog")
    .select("id,summary,metadata,created_at")
    .eq("source", BENJADMIN_TIMER_SOURCE)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (result.error) throw new Error(result.error.message);
  return (result.data || []) as Row[];
}

function summarizeTimer(rows: Row[], now: Date, weekStart: string, target: PersonTime) {
  const starts = new Map<string, { at: string }>();
  let latestOpen: { timerId: string; startedAt: string } | null = null;
  for (const row of rows) {
    const meta = record(row.metadata);
    const type = String(meta.recordType || "");
    const timerId = String(meta.timerId || "");
    if (!timerId) continue;
    if (type === TIMER_START) {
      const startedAt = String(meta.startedAt || row.created_at || "");
      starts.set(timerId, { at: startedAt });
      latestOpen = { timerId, startedAt };
      continue;
    }
    if (type === TIMER_STOP) {
      const start = starts.get(timerId);
      const stoppedAt = meta.stoppedAt || row.created_at;
      if (start) addIntervalTime(target, start.at, stoppedAt, now, weekStart);
      starts.delete(timerId);
      if (latestOpen?.timerId === timerId) latestOpen = null;
    }
  }
  for (const [timerId, start] of starts) {
    addIntervalTime(target, start.at, null, now, weekStart);
    latestOpen = { timerId, startedAt: start.at };
  }
  return latestOpen;
}

export async function getTeamDashboardMetrics() {
  const client = db();
  const now = new Date();
  const currentMonth = monthKey(now);
  const currentDay = dateKey(now);
  const weekStart = mondayKey(now);
  const lookback = new Date(now.getTime() - 40 * 86_400_000).toISOString();

  const [workersResult, sessionsResult, devWorkResult, usageResult, timerResult] = await Promise.all([
    client.from("dev_center_workers").select("id,code,name"),
    client.from("dev_center_worker_sessions").select("worker_id,opened_at,closed_at,status").gte("opened_at", lookback).order("opened_at", { ascending: true }).limit(4000),
    client.from("dev_center_work_sessions").select("started_at,ended_at,duration_minutes,source,note").gte("started_at", lookback).order("started_at", { ascending: true }).limit(4000),
    client.from("dev_center_live_worklog").select("worker_code,metadata,created_at").eq("source", "external-ai-worker").gte("created_at", lookback).order("created_at", { ascending: true }).limit(4000),
    timerRows(client, lookback),
  ]);
  for (const result of [workersResult, sessionsResult, devWorkResult, usageResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const people = emptyPeople();
  const workerCodeById = new Map((workersResult.data || []).map((row) => [String(row.id), String(row.code || "")]));
  const internalCodes = new Set(["BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI"]);

  for (const row of sessionsResult.data || []) {
    const code = workerCodeById.get(String(row.worker_id || ""));
    if (!code || !internalCodes.has(code) || !(code in people)) continue;
    addIntervalTime(people[code as keyof typeof people], row.opened_at, row.closed_at, now, weekStart);
  }

  for (const row of devWorkResult.data || []) {
    if (String(row.source || "").toLowerCase() !== "chatgpt") continue;
    const fallbackEnd = row.ended_at || (num(row.duration_minutes) ? new Date(Date.parse(String(row.started_at)) + num(row.duration_minutes) * 60_000).toISOString() : null);
    addIntervalTime(people.CHATGPT_MCP, row.started_at, fallbackEnd, now, weekStart);
  }

  for (const row of usageResult.data || []) {
    const meta = record(row.metadata);
    if (meta.recordType !== "EXTERNAL_AI_RUN_USAGE") continue;
    const code = String(row.worker_code || "");
    if (code !== "MFORGE" && code !== "VGUARD") continue;
    const finishedAt = String(meta.finishedAt || row.created_at || "");
    const finishedMs = Date.parse(finishedAt);
    const activeMs = num(meta.activeTimeMs);
    if (Number.isFinite(finishedMs) && activeMs > 0) addIntervalTime(people[code], new Date(finishedMs - activeMs).toISOString(), finishedAt, now, weekStart);
  }

  const openTimer = summarizeTimer(timerResult, now, weekStart, people.BENJADMIN);

  const fixedCosts = [
    ["DEV VPS", "DIMPRO_DEV_VPS_MONTHLY_HUF"],
    ["PROD VPS", "DIMPRO_PROD_VPS_MONTHLY_HUF"],
    ["DB VPS", "DIMPRO_DB_VPS_MONTHLY_HUF"],
    ["Control Plane", "DIMPRO_CONTROL_VPS_MONTHLY_HUF"],
    ["Object Storage", "DIMPRO_OBJECT_STORAGE_MONTHLY_HUF"],
    ["Egyéb infrastruktúra", "DIMPRO_OTHER_INFRA_MONTHLY_HUF"],
  ].map(([label, env]) => ({ label, env, monthlyHuf: envHuf(env) }));
  const configuredInfrastructureMonthlyHuf = fixedCosts.reduce((sum, row) => sum + (row.monthlyHuf || 0), 0);
  const configuredCostCount = fixedCosts.filter((row) => row.monthlyHuf != null).length;

  return {
    ok: true as const,
    generatedAt: now.toISOString(),
    timeZone: TIME_ZONE,
    period: { day: currentDay, month: currentMonth, weekStart },
    time: {
      people: Object.values(people).map(roundTime),
      benjadminTimer: {
        running: Boolean(openTimer),
        timerId: openTimer?.timerId || null,
        startedAt: openTimer?.startedAt || null,
      },
      notes: [
        "BenjAdmin: kézi, explicit munkaidőmérő.",
        "ChatGPT + VPS-MCP: a dev_center_work_sessions chatgpt forrású munkamenet-falióra; szüneteket is tartalmazhat, nem nettó modellidő.",
        "Ármin-AI / Jázmin-AI / Outmin-AI / Ben-AI: worker session falióra, nem token- vagy gondolkodási idő.",
        "M.Forge-AI / V.Guard-AI: külső provider aktív futási idő a run ledgerből.",
      ],
    },
    costs: {
      infrastructure: {
        monthlyHuf: configuredInfrastructureMonthlyHuf,
        configuredCount: configuredCostCount,
        totalCount: fixedCosts.length,
        complete: configuredCostCount === fixedCosts.length,
        items: fixedCosts,
        source: "BENJADMIN environment configuration",
      },
      projection: {
        infrastructureDailyHuf: configuredInfrastructureMonthlyHuf / 30.4375,
        infrastructureAnnualHuf: configuredInfrastructureMonthlyHuf * 12,
      },
    },
  };
}

async function latestTimerState(client: SupabaseClient) {
  const rows = await timerRows(client, new Date(Date.now() - 14 * 86_400_000).toISOString());
  const starts = new Map<string, string>();
  for (const row of rows) {
    const meta = record(row.metadata);
    const id = String(meta.timerId || "");
    if (!id) continue;
    if (meta.recordType === TIMER_START) starts.set(id, String(meta.startedAt || row.created_at || ""));
    if (meta.recordType === TIMER_STOP) starts.delete(id);
  }
  const last = [...starts.entries()].at(-1);
  return last ? { running: true, timerId: last[0], startedAt: last[1] } : { running: false, timerId: null, startedAt: null };
}

export async function startBenjadminTime(note?: string) {
  const client = db();
  const current = await latestTimerState(client);
  if (current.running) return { ok: true as const, alreadyRunning: true, ...current };
  const timerId = `benj-time-${randomUUID().slice(0, 12)}`;
  const startedAt = new Date().toISOString();
  const result = await client.from("dev_center_live_worklog").insert({
    worker_code: null,
    task_id: null,
    phase: "personal_time",
    level: "info",
    summary: "BenjAdmin saját fejlesztési ráfordítás indítva",
    detail: String(note || "").slice(0, 1000),
    progress_percent: null,
    source: BENJADMIN_TIMER_SOURCE,
    metadata: { recordType: TIMER_START, timerId, startedAt, note: String(note || "").slice(0, 500) },
  });
  if (result.error) throw new Error(result.error.message);
  return { ok: true as const, alreadyRunning: false, running: true, timerId, startedAt };
}

export async function stopBenjadminTime() {
  const client = db();
  const current = await latestTimerState(client);
  if (!current.running || !current.timerId || !current.startedAt) return { ok: true as const, alreadyStopped: true, running: false };
  const stoppedAt = new Date().toISOString();
  const durationMs = Math.max(0, Date.parse(stoppedAt) - Date.parse(current.startedAt));
  const result = await client.from("dev_center_live_worklog").insert({
    worker_code: null,
    task_id: null,
    phase: "personal_time",
    level: "success",
    summary: "BenjAdmin saját fejlesztési ráfordítás lezárva",
    detail: "",
    progress_percent: 100,
    source: BENJADMIN_TIMER_SOURCE,
    metadata: { recordType: TIMER_STOP, timerId: current.timerId, startedAt: current.startedAt, stoppedAt, durationMs },
  });
  if (result.error) throw new Error(result.error.message);
  return { ok: true as const, alreadyStopped: false, running: false, timerId: current.timerId, startedAt: current.startedAt, stoppedAt, durationMs };
}
