import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BuildNodeDefinition } from "./types";

const execFileAsync = promisify(execFile);
const READINESS_MARKER = "DIMPRO_BUILD_NODE_READY";

const DEFAULT_BUILD_NODES: readonly BuildNodeDefinition[] = [
  {
    id: "build01",
    hostname: "build01.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "SSH readiness még nincs hitelesítve.",
  },
  {
    id: "build02",
    hostname: "build02.dimpro.hu",
    state: "NOT_CONNECTED",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: null,
    reason: "SSH readiness még nincs hitelesítve.",
  },
] as const;

const SSH_TARGET: Record<BuildNodeDefinition["id"], string> = {
  build01: "build01",
  build02: "build02",
};

export type BuildNodeProbeResult = {
  ready: boolean;
  reason: string;
};

export type BuildNodeProbe = (node: BuildNodeDefinition) => Promise<BuildNodeProbeResult>;

function cloneNode(node: BuildNodeDefinition): BuildNodeDefinition {
  return { ...node, capabilities: [...node.capabilities] };
}

export function listBuildNodes(): BuildNodeDefinition[] {
  return DEFAULT_BUILD_NODES.map(cloneNode);
}

async function sshReadinessProbe(node: BuildNodeDefinition): Promise<BuildNodeProbeResult> {
  const target = SSH_TARGET[node.id];
  try {
    const result = await execFileAsync("/usr/bin/ssh", [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=3",
      "-o", "ConnectionAttempts=1",
      "-o", "StrictHostKeyChecking=yes",
      target,
      "printf", READINESS_MARKER,
    ], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 32_768,
      env: { ...process.env, LC_ALL: "C" },
    });
    if (result.stdout.trim() !== READINESS_MARKER) {
      return { ready: false, reason: "SSH elérhető, de a readiness marker nem egyezik." };
    }
    return { ready: true, reason: "Hitelesített SSH readiness marker rendben." };
  } catch {
    return { ready: false, reason: "SSH readiness kapcsolat nem érhető el vagy nincs még hitelesítve." };
  }
}

export async function probeBuildNodes(probe: BuildNodeProbe = sshReadinessProbe): Promise<BuildNodeDefinition[]> {
  const verifiedAt = new Date().toISOString();
  return Promise.all(DEFAULT_BUILD_NODES.map(async (definition) => {
    const node = cloneNode(definition);
    let result: BuildNodeProbeResult;
    try {
      result = await probe(node);
    } catch {
      result = { ready: false, reason: "Build node readiness probe hibával tért vissza." };
    }
    return {
      ...node,
      state: result.ready ? "READY" : "NOT_CONNECTED",
      lastVerifiedAt: verifiedAt,
      reason: result.reason,
    };
  }));
}

export function selectBuildNode(nodes: BuildNodeDefinition[]) {
  return nodes.find((node) => node.state === "READY") || null;
}

export function assertBuildNodeReady(node: BuildNodeDefinition | null) {
  if (!node || node.state !== "READY") {
    const error = new Error("Nincs READY állapotú hitelesített build node. Veszélyes kerülő build tilos.");
    Object.assign(error, { code: "BUILD_NODE_NOT_READY" });
    throw error;
  }
  return node;
}
