import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PARTNER_WORKTREE_ROOT, PARTNER_REPOSITORY_ROOT } from "./partner-isolation";

export const PARTNER_RUNTIME_ROOT = "/srv/partner-dev";
export const PARTNER_RUNTIME_READY_MARKER = "/srv/partner-dev/.outmin-runtime-ready.json";
export const OUTMIN_TOKEN_HASH_FILE = "/root/.dimpro-secrets/benjadmin/outminai-mcp-token.sha256";
export const OUTMIN_STAGED_PUBLIC_KEY_FILE = "/root/.dimpro-secrets/benjadmin/outminai-dev-authorized-key.pub";

const requiredDirectories = [
  PARTNER_REPOSITORY_ROOT,
  PARTNER_WORKTREE_ROOT,
  "/srv/partner-dev/worktrees/outmin",
  "/srv/partner-dev/integration",
  "/srv/partner-dev/artifacts",
  "/srv/partner-dev/logs",
  "/srv/partner-dev/cache/outmin",
  "/srv/partner-dev/tmp/outmin",
] as const;

type ReadyMarker = {
  ready?: boolean;
  version?: string;
  user?: string;
  group?: string;
  internalRootProtected?: boolean;
  workerTokenReady?: boolean;
  sshIdentityReady?: boolean;
  completedAt?: string;
};

async function isDirectory(target: string) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function markerState(): Promise<ReadyMarker | null> {
  try {
    const value = JSON.parse(await readFile(PARTNER_RUNTIME_READY_MARKER, "utf8")) as ReadyMarker;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}


async function internalRootModeProtected() {
  try {
    const value = await stat("/srv/dimpro-dev");
    return value.isDirectory() && value.uid === 0 && value.gid === 0 && (value.mode & 0o007) === 0;
  } catch {
    return false;
  }
}

async function stagedSshPublicKeyReady() {
  try {
    const value = (await readFile(OUTMIN_STAGED_PUBLIC_KEY_FILE, "utf8")).trim();
    return value.startsWith("ssh-ed25519 ") || value.startsWith("ssh-rsa ");
  } catch {
    return false;
  }
}

async function tokenHashReady() {
  try {
    const value = (await readFile(process.env.DIMPRO_OUTMINAI_TOKEN_HASH_FILE?.trim() || OUTMIN_TOKEN_HASH_FILE, "utf8")).trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(value);
  } catch {
    return false;
  }
}

export async function getPartnerRuntimeIsolationStatus() {
  const checkedAt = new Date().toISOString();
  const directoryChecks = await Promise.all(requiredDirectories.map(async (target) => ({
    path: target,
    ready: await isDirectory(target),
  })));
  const marker = await markerState();
  const [hashReady, internalModeReady, sshPublicKeyStaged] = await Promise.all([
    tokenHashReady(),
    internalRootModeProtected(),
    stagedSshPublicKeyReady(),
  ]);
  const rootReady = await isDirectory(PARTNER_RUNTIME_ROOT);
  const markerReady = marker?.ready === true
    && marker.user === "outmin"
    && marker.internalRootProtected === true
    && marker.workerTokenReady === true;
  const directoriesReady = directoryChecks.every((item) => item.ready);
  const preflightReady = rootReady && directoriesReady && hashReady && internalModeReady && sshPublicKeyStaged;
  const ready = preflightReady && markerReady;

  return {
    ready,
    stage: ready ? "READY" as const : "PENDING" as const,
    root: path.resolve(PARTNER_RUNTIME_ROOT),
    rootReady,
    directoriesReady,
    tokenHashReady: hashReady,
    internalRootModeProtected: internalModeReady,
    sshPublicKeyStaged,
    preflightReady,
    markerReady,
    internalRootProtected: marker?.internalRootProtected === true,
    workerTokenReady: marker?.workerTokenReady === true && hashReady,
    sshIdentityReady: marker?.sshIdentityReady === true,
    user: marker?.user || null,
    group: marker?.group || null,
    version: marker?.version || null,
    completedAt: marker?.completedAt || null,
    checks: directoryChecks,
    blockers: [
      ...(!rootReady ? ["PARTNER_RUNTIME_ROOT_MISSING"] : []),
      ...(!directoriesReady ? ["PARTNER_RUNTIME_DIRECTORIES_INCOMPLETE"] : []),
      ...(!hashReady ? ["OUTMIN_WORKER_TOKEN_HASH_MISSING"] : []),
      ...(!internalModeReady ? ["INTERNAL_ROOT_MODE_OPEN"] : []),
      ...(!sshPublicKeyStaged ? ["OUTMIN_SSH_PUBLIC_KEY_NOT_STAGED"] : []),
      ...(marker?.internalRootProtected !== true ? ["OUTMIN_INTERNAL_ACCOUNT_ACCEPTANCE_PENDING"] : []),
      ...(marker?.sshIdentityReady !== true ? ["OUTMIN_SSH_IDENTITY_NOT_READY"] : []),
      ...(marker?.workerTokenReady !== true ? ["OUTMIN_WORKER_IDENTITY_NOT_ACTIVATED"] : []),
      ...(!markerReady ? ["OUTMIN_RUNTIME_READY_MARKER_MISSING"] : []),
    ],
    checkedAt,
  };
}
