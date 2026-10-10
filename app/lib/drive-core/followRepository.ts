import "server-only";
import { DriveCoreRepositoryError } from "./errors";
import { getDatabaseClient } from "./databaseRepository";

export const FOLLOW_FREQUENCIES = [
  "FOUR_HOURLY", "EIGHT_HOURLY", "DAILY", "WEEKLY", "MONTHLY", "NONE",
] as const;
export type DriveFollowFrequency = (typeof FOLLOW_FREQUENCIES)[number];

export type DriveFollowPreferences = {
  notifyVersions: boolean;
  notifyRevisions: boolean;
  notifyApprovals: boolean;
  digestFrequency: DriveFollowFrequency;
};

export type DriveFollow = DriveFollowPreferences & {
  projectId: string;
  documentId: string;
  userId: string;
  updatedAt: string;
};

type FollowRow = {
  project_id: string;
  document_id: string;
  user_id: string;
  notify_versions: boolean;
  notify_revisions: boolean;
  notify_approvals: boolean;
  digest_frequency: DriveFollowFrequency;
  updated_at: string;
};

export const DEFAULT_FOLLOW_PREFERENCES: DriveFollowPreferences = {
  notifyVersions: true,
  notifyRevisions: true,
  notifyApprovals: false,
  digestFrequency: "DAILY",
};

function failFollow(error: unknown): never {
  const candidate = error as { code?: string } | null;
  const missing = candidate?.code === "PGRST205" || candidate?.code === "42P01";
  throw new DriveCoreRepositoryError(
    missing ? "A Követett dokumentumok adatbázissémája még nincs aktiválva." : "A dokumentumkövetés adatbázisművelete sikertelen.",
    missing ? "DRIVE_FOLLOW_SCHEMA_NOT_READY" : "DRIVE_FOLLOW_DATABASE_ERROR",
    missing ? 503 : 500,
  );
}

function normalize(row: FollowRow): DriveFollow {
  return {
    projectId: row.project_id,
    documentId: row.document_id,
    userId: row.user_id,
    notifyVersions: row.notify_versions,
    notifyRevisions: row.notify_revisions,
    notifyApprovals: row.notify_approvals,
    digestFrequency: row.digest_frequency,
    updatedAt: row.updated_at,
  };
}

/** ACL filtering deliberately belongs to the authenticated route, not this service-role repository. */
export async function listDriveDocumentFollows(projectId: string, userId: string): Promise<DriveFollow[]> {
  const { data, error } = await getDatabaseClient()
    .from("drive_core_document_follows")
    .select("project_id,document_id,user_id,notify_versions,notify_revisions,notify_approvals,digest_frequency,updated_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) failFollow(error);
  return ((data || []) as FollowRow[]).map(normalize);
}

export async function upsertDriveDocumentFollow(input: {
  projectId: string; documentId: string; userId: string; preferences: DriveFollowPreferences;
}): Promise<void> {
  const { error } = await getDatabaseClient()
    .from("drive_core_document_follows")
    .upsert({
      project_id: input.projectId,
      document_id: input.documentId,
      user_id: input.userId,
      notify_versions: input.preferences.notifyVersions,
      notify_revisions: input.preferences.notifyRevisions,
      notify_approvals: input.preferences.notifyApprovals,
      digest_frequency: input.preferences.digestFrequency,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,document_id,user_id" });
  if (error) failFollow(error);
}

export async function deleteDriveDocumentFollow(projectId: string, documentId: string, userId: string): Promise<void> {
  const { error } = await getDatabaseClient()
    .from("drive_core_document_follows")
    .delete()
    .eq("project_id", projectId)
    .eq("document_id", documentId)
    .eq("user_id", userId);
  if (error) failFollow(error);
}
