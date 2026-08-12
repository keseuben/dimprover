export type InternalRepositoryBindingMetadata = Record<string, unknown>;
export type InternalRepositoryBindingCandidate = {
  project_id: string;
  metadata?: InternalRepositoryBindingMetadata | null;
};

export const INTERNAL_MONOREPO_PROJECT_IDS = [
  "project_dimprover",
  "project_dimpro",
  "project_drive_drop",
  "project_fajlmuhely",
  "project_infrastructure",
] as const;

export function internalRepositoryProjectAllowed(repository: InternalRepositoryBindingCandidate, projectId: string) {
  if (repository.project_id === projectId) return true;
  const metadata = repository.metadata && typeof repository.metadata === "object" ? repository.metadata : {};
  if (metadata.sharedInternalMonorepo !== true) return false;
  const projectIds = Array.isArray(metadata.internalProjectIds) ? metadata.internalProjectIds.map((value) => String(value)) : [];
  return projectIds.includes(projectId);
}
