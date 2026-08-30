import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { InfrastructureOperationalContext, SafeInfrastructureOperation } from "./system-health-model";

const SAFE_OPERATION_FIELDS = ["status", "operation", "owner", "task", "target", "workerCode", "host", "pid", "startedAt", "finishedAt", "exitCode", "event"] as const;
const DEFAULT_COORDINATION_ROOT = "/srv/dimpro-dev/coordination";

function coordinationRoot() {
  const configured = process.env.DIMPRO_COORDINATION_ROOT?.trim();
  return configured || DEFAULT_COORDINATION_ROOT;
}

export function sanitizeInfrastructureOperation(value: unknown): SafeInfrastructureOperation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const safe: Record<string, string | number | null> = {};
  for (const key of SAFE_OPERATION_FIELDS) {
    const item = source[key];
    if (typeof item === "string" || typeof item === "number" || item === null) safe[key] = item;
  }
  return Object.keys(safe).length ? safe as SafeInfrastructureOperation : null;
}

function readActiveOperation(root: string) {
  const file = path.join(root, "active-development.json");
  try { return sanitizeInfrastructureOperation(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
}

function readLastOperation(root: string) {
  const file = path.join(root, "development-operations.jsonl");
  try {
    const stat = fs.statSync(file);
    const maxBytes = 128 * 1024;
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    const lines = buffer.toString("utf8").trim().split(/\r?\n/).reverse();
    for (const line of lines) {
      try {
        const safe = sanitizeInfrastructureOperation(JSON.parse(line));
        if (safe) return safe;
      } catch {}
    }
    return null;
  } catch { return null; }
}

function centralLockState(root: string): InfrastructureOperationalContext["centralLock"] {
  const lockFile = path.join(root, "locks", "exclusive-operation.lock");
  try {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    const result = spawnSync("/usr/bin/flock", ["-n", lockFile, "-c", "true"], { timeout: 1_500, stdio: "ignore" });
    if (result.status === 0) return "FREE";
    if (result.status === 1) return "HELD";
    return "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

async function probeLocalTcp(port: number, timeoutMs = 700) {
  const started = Date.now();
  return new Promise<{ online: boolean; latencyMs: number | null }>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let done = false;
    const finish = (online: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ online, latencyMs: online ? Date.now() - started : null });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function getInfrastructureOperationalContext(): Promise<InfrastructureOperationalContext> {
  const root = coordinationRoot();
  const runtimeDefinitions = [
    { id: "developer-grid-runtime", label: "Developer Grid runtime", port: Number(process.env.PORT || 3295) },
    { id: "benjadmin-operator-ui", label: "BENJADMIN operator UI", port: 3100 },
    { id: "dimpro-one-health-dev", label: "DIMPRO One Health DEV", port: 3112 },
  ];
  const probes = await Promise.all(runtimeDefinitions.map(async (runtime) => ({ runtime, probe: await probeLocalTcp(runtime.port) })));
  return {
    sampledAt: new Date().toISOString(),
    centralLock: centralLockState(root),
    activeOperation: readActiveOperation(root),
    lastOperation: readLastOperation(root),
    devRuntimes: probes.map(({ runtime, probe }) => ({ id: runtime.id, label: runtime.label, state: probe.online ? "READY" : "OFFLINE", latencyMs: probe.latencyMs })),
  };
}
