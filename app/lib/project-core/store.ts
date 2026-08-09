import { getProjectCoreRepository } from "./repository";
import type { ProjectLifecycleStatus } from "./types";

export function getProjectCoreState() {
  return getProjectCoreRepository().getProjectCoreState();
}

export function getProjectAccess(projectId: string, userAliases: string[]) {
  return getProjectCoreRepository().getProjectAccess(projectId, userAliases);
}

export function listAccessibleProjects(userAliases: string[]) {
  return getProjectCoreRepository().listAccessibleProjects(userAliases);
}

export function createProject(input: Record<string, unknown>, actor: { userId: string; displayName: string }) {
  return getProjectCoreRepository().createProject(input, actor);
}

export function updateProject(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  return getProjectCoreRepository().updateProject(projectId, input, actorUserId);
}

export function addProjectMembership(projectId: string, input: Record<string, unknown>, actorUserId: string) {
  return getProjectCoreRepository().addProjectMembership(projectId, input, actorUserId);
}

export function listProjectMemberships(projectId: string) {
  return getProjectCoreRepository().listProjectMemberships(projectId);
}

export function changeProjectLifecycle(projectId: string, nextStatus: ProjectLifecycleStatus, actorUserId: string) {
  return getProjectCoreRepository().changeProjectLifecycle(projectId, nextStatus, actorUserId);
}

export function listProjectAuditEvents(projectId: string, limit = 20) {
  return getProjectCoreRepository().listProjectAuditEvents(projectId, limit);
}
