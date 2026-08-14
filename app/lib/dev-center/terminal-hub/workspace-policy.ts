import { realpath } from "node:fs/promises";
import path from "node:path";
import { isSensitivePath } from "../ai-worker/secret-scanner";
import { TERMINAL_HUB_WORKSPACE_ROOTS } from "./config";

export class TerminalWorkspacePolicyError extends Error {
  code: "WORKSPACE_PATH_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "TerminalWorkspacePolicyError";
    this.code = "WORKSPACE_PATH_DENIED";
  }
}

const blockedWorkspacePathPatterns = [
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.next(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.dimprover(\/|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.cache(\/|$)/i,
  /(^|\/)\.turbo(\/|$)/i,
  /(^|\/)dist(\/|$)/i,
  /(^|\/)build(\/|$)/i,
  /(^|\/)coverage(\/|$)/i,
  /(^|\/)backups?(\/|$)/i,
  /(^|\/)credentials?(\/|$)/i,
  /(^|\/)secrets?(\/|$)/i,
];

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function isWorkspacePathDenied(candidatePath: string) {
  const normalized = candidatePath.replaceAll("\\", "/");
  return isSensitivePath(normalized) || blockedWorkspacePathPatterns.some((pattern) => pattern.test(normalized));
}

function assertNoBlockedSegment(candidateReal: string) {
  if (isWorkspacePathDenied(candidateReal)) {
    throw new TerminalWorkspacePolicyError("A fájl vagy könyvtár a BENJADMIN Live Workspace deny policy alá esik.");
  }
}

export async function resolveAllowedWorkspacePath(candidatePath: string) {
  if (!candidatePath || !path.isAbsolute(candidatePath)) {
    throw new TerminalWorkspacePolicyError("A Live Workspace csak abszolút, allowlistelt útvonalat fogadhat.");
  }

  let candidateReal: string;
  try {
    candidateReal = await realpath(candidatePath);
  } catch {
    throw new TerminalWorkspacePolicyError("A Live Workspace útvonal nem érhető el vagy nem oldható fel biztonságosan.");
  }

  assertNoBlockedSegment(candidateReal);

  for (const configuredRoot of TERMINAL_HUB_WORKSPACE_ROOTS) {
    try {
      const rootReal = await realpath(configuredRoot);
      if (isInside(rootReal, candidateReal)) return { root: rootReal, path: candidateReal };
    } catch {
      continue;
    }
  }

  throw new TerminalWorkspacePolicyError("Az útvonal kívül esik a BENJADMIN Live Workspace allowlisten.");
}
