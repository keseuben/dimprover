import { realpath } from "node:fs/promises";
import path from "node:path";
import { TERMINAL_HUB_WORKSPACE_ROOTS } from "./config";

export class TerminalWorkspacePolicyError extends Error {
  code: "WORKSPACE_PATH_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "TerminalWorkspacePolicyError";
    this.code = "WORKSPACE_PATH_DENIED";
  }
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
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
