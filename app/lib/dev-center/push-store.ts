import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import webPush, { type PushSubscription } from "web-push";

export type StoredDevPushSubscription = PushSubscription & {
  id: string;
  createdAt: string;
  updatedAt: string;
  userAgent?: string;
  deviceLabel?: string;
};

type PushStore = {
  subscriptions: StoredDevPushSubscription[];
  updatedAt: string;
};

function getRuntimeProjectRoot() {
  const configuredRoot = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configuredRoot) return path.resolve(configuredRoot);
  const cwd = process.cwd();
  if (cwd.endsWith(path.join(".next", "standalone"))) return path.resolve(cwd, "..", "..");
  return cwd;
}

const dataRoot = path.join(getRuntimeProjectRoot(), ".data", "dimpro-dev-center");
const storePath = path.join(dataRoot, "push-subscriptions.json");

function nowIso() {
  return new Date().toISOString();
}

async function readStore(): Promise<PushStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as PushStore;
    if (!Array.isArray(parsed.subscriptions)) throw new Error("invalid push store");
    return parsed;
  } catch {
    return { subscriptions: [], updatedAt: nowIso() };
  }
}

async function writeStore(store: PushStore) {
  await mkdir(dataRoot, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryPath, storePath);
}

export function getDevVapidPublicKey() {
  return process.env.DIMPRO_DEV_VAPID_PUBLIC_KEY?.trim() || "";
}

function configureWebPush() {
  const publicKey = getDevVapidPublicKey();
  const privateKey = process.env.DIMPRO_DEV_VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.DIMPRO_DEV_VAPID_SUBJECT?.trim() || "mailto:system@dimpro.hu";
  if (!publicKey || !privateKey) throw new Error("A DIMPRO Dev VAPID kulcsok nincsenek beállítva.");
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

function normalizeSubscription(value: unknown): PushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PushSubscription>;
  if (!candidate.endpoint || typeof candidate.endpoint !== "string") return null;
  const keys = candidate.keys as { p256dh?: string; auth?: string } | undefined;
  if (!keys?.p256dh || !keys.auth) return null;
  return {
    endpoint: candidate.endpoint,
    expirationTime: candidate.expirationTime ?? null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export async function saveDevPushSubscription(input: {
  subscription: unknown;
  userAgent?: string;
  deviceLabel?: string;
}) {
  const subscription = normalizeSubscription(input.subscription);
  if (!subscription) return { ok: false as const, error: "Érvénytelen push feliratkozás." };

  const store = await readStore();
  const now = nowIso();
  const existing = store.subscriptions.find((item) => item.endpoint === subscription.endpoint);
  if (existing) {
    existing.expirationTime = subscription.expirationTime;
    existing.keys = subscription.keys;
    existing.updatedAt = now;
    existing.userAgent = input.userAgent || existing.userAgent;
    existing.deviceLabel = input.deviceLabel || existing.deviceLabel;
  } else {
    store.subscriptions.push({
      ...subscription,
      id: `push_${randomUUID().slice(0, 12)}`,
      createdAt: now,
      updatedAt: now,
      userAgent: input.userAgent,
      deviceLabel: input.deviceLabel,
    });
  }
  store.updatedAt = now;
  await writeStore(store);
  return { ok: true as const, subscriptionCount: store.subscriptions.length };
}

export async function removeDevPushSubscription(endpoint: string) {
  const store = await readStore();
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((item) => item.endpoint !== endpoint);
  store.updatedAt = nowIso();
  await writeStore(store);
  return { ok: true as const, removed: before !== store.subscriptions.length, subscriptionCount: store.subscriptions.length };
}

export async function listDevPushSubscriptions() {
  const store = await readStore();
  return store.subscriptions;
}

export async function sendDevPushNotification(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  priority?: "normal" | "high";
}) {
  configureWebPush();
  const store = await readStore();
  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/admin/dev#ertesitesek",
    tag: payload.tag || `dimpro-dev-${Date.now()}`,
    priority: payload.priority || "normal",
    icon: "/pwa/dimpro-dev-192.png",
    badge: "/pwa/dimpro-dev-192.png",
  });

  const invalidEndpoints = new Set<string>();
  let sent = 0;
  let failed = 0;

  await Promise.all(store.subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(subscription, serializedPayload, { TTL: 60 * 60, urgency: payload.priority === "high" ? "high" : "normal" });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) invalidEndpoints.add(subscription.endpoint);
    }
  }));

  if (invalidEndpoints.size) {
    store.subscriptions = store.subscriptions.filter((item) => !invalidEndpoints.has(item.endpoint));
    store.updatedAt = nowIso();
    await writeStore(store);
  }

  return { ok: true as const, sent, failed, removedInvalid: invalidEndpoints.size, subscriptionCount: store.subscriptions.length };
}
