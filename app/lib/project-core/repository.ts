import * as databaseRepository from "./databaseRepository";
import * as fileRepository from "./fileRepository";

export type ProjectCoreStorageProvider = "file" | "supabase";

export type ProjectCoreRepository = Pick<typeof fileRepository,
  | "getProjectCoreState"
  | "getProjectAccess"
  | "listAccessibleProjects"
  | "createProject"
  | "updateProject"
  | "addProjectMembership"
  | "listProjectMemberships"
  | "changeProjectLifecycle"
  | "listProjectAuditEvents"
>;

export function getConfiguredProjectCoreProvider(): ProjectCoreStorageProvider {
  const configured = process.env.PROJECT_CORE_STORAGE_PROVIDER?.trim().toLowerCase();
  return configured === "supabase" ? "supabase" : "file";
}

export function getProjectCoreRepository(): ProjectCoreRepository {
  return getConfiguredProjectCoreProvider() === "supabase"
    ? databaseRepository
    : fileRepository;
}
