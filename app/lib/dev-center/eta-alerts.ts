import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listDevPushSubscriptions, sendDevPushNotification } from "./push-store";

type JsonRecord = Record<string, unknown>;
type EtaAlertKind = "due-soon" | "overdue";

type EtaTaskRow = {
  id: string;
  title: string;
  project_id: string | null;
  status: string;
  metadata: JsonRecord | null;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function databaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || url.includes("<") || key.includes("<")) throw new Error("DEV_ETA_ALERT_DATABASE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { "x-client-info": "dimpro-benjadmin-eta-alerts/1.0" } } });
}

export function classifyDevEtaAlert(expectedFinishAt: string | null | undefined, nowMs = Date.now()): { kind: EtaAlertKind | null; deltaMinutes: number | null } {
  const targetMs = new Date(expectedFinishAt || "").getTime();
  if (!Number.isFinite(targetMs)) return { kind: null, deltaMinutes: null };
  const deltaMinutes = Math.ceil((targetMs - nowMs) / 60000);
  if (deltaMinutes <= 0) return { kind: "overdue", deltaMinutes };
  if (deltaMinutes <= 15) return { kind: "due-soon", deltaMinutes };
  return { kind: null, deltaMinutes };
}

export function etaAlertMarkerKeys(kind: EtaAlertKind) {
  return kind === "due-soon"
    ? { expected: "etaAlertDueSoonFor", sentAt: "etaAlertDueSoonAt" }
    : { expected: "etaAlertOverdueFor", sentAt: "etaAlertOverdueAt" };
}

function etaLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function writeAlertAudit(client: SupabaseClient, task: EtaTaskRow, kind: EtaAlertKind, expectedFinishAt: string, sent: number) {
  const { error } = await client.from("dev_center_audit_events").insert({
    id: `dev-audit-${randomUUID().slice(0, 12)}`,
    actor_type: "system",
    actor_id: "BenAI",
    action: "TASK_ETA_ALERT_SENT",
    entity_type: "task",
    entity_id: task.id,
    task_id: task.id,
    project_id: task.project_id,
    summary: `${task.title} · ${kind === "due-soon" ? "ETA hamarosan lejár" : "ETA lejárt"}.`,
    metadata: { kind, expectedFinishAt, sent, productionAccess: "DENY" },
  });
  if (error) throw new Error(`DEV_ETA_ALERT_AUDIT_FAILED:${error.code || "UNKNOWN"}`);
}

let activeRun: Promise<Awaited<ReturnType<typeof runDevEtaAlertsOnce>>> | null = null;

async function runDevEtaAlertsOnce(options: { nowMs?: number; dryRun?: boolean } = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const dryRun = options.dryRun === true;
  const client = databaseClient();
  const { data, error } = await client.from("dev_center_tasks")
    .select("id,title,project_id,status,metadata")
    .in("status", ["claimed", "in_progress", "testing"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`DEV_ETA_ALERT_TASK_READ_FAILED:${error.code || "UNKNOWN"}`);

  const subscriptions = await listDevPushSubscriptions();
  const counters = { scanned: 0, eligible: 0, sentTasks: 0, delivered: 0, deduped: 0, skippedNoSubscribers: 0, noDelivery: 0, errors: 0 };
  const details: Array<{ taskId: string; kind: EtaAlertKind; result: string; sent?: number }> = [];

  for (const raw of data || []) {
    const task = raw as EtaTaskRow;
    counters.scanned += 1;
    const metadata = record(task.metadata);
    const expectedFinishAt = text(metadata.expectedFinishAt);
    const classification = classifyDevEtaAlert(expectedFinishAt, nowMs);
    if (!classification.kind || !expectedFinishAt) continue;
    counters.eligible += 1;
    const marker = etaAlertMarkerKeys(classification.kind);
    if (text(metadata[marker.expected]) === expectedFinishAt) {
      counters.deduped += 1;
      details.push({ taskId: task.id, kind: classification.kind, result: "DEDUPED" });
      continue;
    }
    if (dryRun) {
      details.push({ taskId: task.id, kind: classification.kind, result: "DRY_RUN" });
      continue;
    }
    if (!subscriptions.length) {
      counters.skippedNoSubscribers += 1;
      details.push({ taskId: task.id, kind: classification.kind, result: "NO_SUBSCRIBERS" });
      continue;
    }

    try {
      const overdue = classification.kind === "overdue";
      const result = await sendDevPushNotification({
        title: overdue ? "BENJADMIN · ETA lejárt" : "BENJADMIN · ETA hamarosan lejár",
        body: `${task.title} · ETA ${etaLabel(expectedFinishAt)}${overdue ? " · beavatkozás szükséges" : ` · még ${Math.max(1, classification.deltaMinutes || 1)} perc`}`,
        url: `/admin/dev-console?task=${encodeURIComponent(task.id)}`,
        tag: `benjadmin-eta-${classification.kind}-${task.id}`,
        priority: overdue ? "high" : "normal",
      });
      if (result.sent <= 0) {
        counters.noDelivery += 1;
        details.push({ taskId: task.id, kind: classification.kind, result: "NO_DELIVERY", sent: result.sent });
        continue;
      }
      const sentAt = new Date(nowMs).toISOString();
      const nextMetadata: JsonRecord = { ...metadata, [marker.expected]: expectedFinishAt, [marker.sentAt]: sentAt, etaAlertLastKind: classification.kind, etaAlertLastSentAt: sentAt };
      const update = await client.from("dev_center_tasks").update({ metadata: nextMetadata, updated_at: sentAt }).eq("id", task.id);
      if (update.error) throw new Error(`DEV_ETA_ALERT_TASK_UPDATE_FAILED:${update.error.code || "UNKNOWN"}`);
      await writeAlertAudit(client, task, classification.kind, expectedFinishAt, result.sent);
      counters.sentTasks += 1;
      counters.delivered += result.sent;
      details.push({ taskId: task.id, kind: classification.kind, result: "SENT", sent: result.sent });
    } catch {
      counters.errors += 1;
      details.push({ taskId: task.id, kind: classification.kind, result: "ERROR" });
    }
  }

  return { ok: true as const, now: new Date(nowMs).toISOString(), dryRun, subscriptionCount: subscriptions.length, ...counters, details };
}

export function runDevEtaAlerts(options: { nowMs?: number; dryRun?: boolean } = {}) {
  if (activeRun) return activeRun;
  activeRun = runDevEtaAlertsOnce(options).finally(() => { activeRun = null; });
  return activeRun;
}
