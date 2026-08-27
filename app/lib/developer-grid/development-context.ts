import type { DevelopmentContext, GridActivityEvent, SourceProvenance } from "./types";

type ContextCandidate = Omit<DevelopmentContext, "source" | "resolvedAt">;

type ResolveDevelopmentContextInput = {
  activeSession?: ContextCandidate | null;
  explicitTask?: ContextCandidate | null;
  taskProvenance?: ContextCandidate | null;
  recentActivity?: GridActivityEvent | null;
  gitFallback?: ContextCandidate | null;
  presence?: ContextCandidate | null;
  heuristic?: ContextCandidate | null;
  sourceProvenance?: SourceProvenance | null;
  now?: string;
};

function finish(candidate: ContextCandidate, source: DevelopmentContext["source"], now: string): DevelopmentContext {
  return { ...candidate, source, resolvedAt: now };
}

export function resolveDevelopmentContext(input: ResolveDevelopmentContextInput): DevelopmentContext | null {
  const now = input.now || new Date().toISOString();
  if (input.activeSession) return finish(input.activeSession, "ACTIVE_SESSION", now);
  if (input.explicitTask) return finish(input.explicitTask, "EXPLICIT_TASK", now);
  if (input.taskProvenance && input.sourceProvenance?.sourceState === "VERIFIED") return finish(input.taskProvenance, "TASK_PROVENANCE", now);
  if (input.recentActivity?.developmentContext) return { ...input.recentActivity.developmentContext, source: "ACTIVITY", resolvedAt: now };
  if (input.gitFallback) return finish(input.gitFallback, "GIT", now);
  if (input.presence) return finish(input.presence, "PRESENCE", now);
  if (input.heuristic) return finish(input.heuristic, "HEURISTIC", now);
  return null;
}

export const DEVELOPMENT_CONTEXT_PRIORITY = [
  "ACTIVE_SESSION",
  "EXPLICIT_TASK",
  "TASK_PROVENANCE",
  "ACTIVITY",
  "GIT",
  "PRESENCE",
  "HEURISTIC",
] as const;

export const PRESENCE_IS_AUTHORITATIVE_CONTEXT = false as const;
