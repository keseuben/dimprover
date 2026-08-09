import { DriveCoreRepositoryError } from "./errors";
import { deleteDriveObject } from "./s3ObjectStorage";
import { getDriveObjectStorageSafeStatus } from "./storageConfig";
import {
  completeDriveCleanupTaskRecord,
  getDriveQuarantineReviewDatabaseHealth,
  listDriveCleanupTasks,
  reviewDriveQuarantinedVersionRecord,
} from "./reviewRepository";
import type { DriveReviewAction } from "./types";

function normalizeAction(value: unknown): DriveReviewAction {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "APPROVE" || normalized === "REJECT") return normalized;
  throw new DriveCoreRepositoryError("A döntés APPROVE vagy REJECT lehet.", "DRIVE_REVIEW_ACTION_INVALID", 400);
}

function normalizeNote(value: unknown, action: DriveReviewAction) {
  const note = typeof value === "string" ? value.trim().slice(0, 2000) : "";
  if (action === "REJECT" && note.length < 3) {
    throw new DriveCoreRepositoryError("Elutasításkor legalább rövid indoklás szükséges.", "DRIVE_REVIEW_NOTE_REQUIRED", 400);
  }
  return note;
}

async function executeCleanupTask(task: Awaited<ReturnType<typeof listDriveCleanupTasks>>[number], actorUserId: string) {
  try {
    await deleteDriveObject({ storageKey: task.storageKey, bucket: task.storageBucket });
    const completed = await completeDriveCleanupTaskRecord({
      projectId: task.projectId,
      taskId: task.id,
      success: true,
      actorUserId,
    });
    return { task: completed, deleted: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Ismeretlen objektumtörlési hiba.";
    const failed = await completeDriveCleanupTaskRecord({
      projectId: task.projectId,
      taskId: task.id,
      success: false,
      errorMessage: message,
      actorUserId,
    });
    return { task: failed, deleted: false, error: message };
  }
}

export async function getDriveQuarantineReviewHealth(projectId?: string) {
  const database = await getDriveQuarantineReviewDatabaseHealth(projectId);
  const storage = getDriveObjectStorageSafeStatus();
  return {
    component: "drive-quarantine-review",
    version: "0.4.1",
    database,
    ready: database.ready,
    cleanupExecutable: database.ready && storage.storageConfigured,
    pendingCleanupCount: database.pendingCleanupCount,
  };
}

export async function reviewDriveQuarantinedVersion(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  body: Record<string, unknown>;
  actorUserId: string;
}) {
  const action = normalizeAction(input.body.action);
  const note = normalizeNote(input.body.note, action);
  const result = await reviewDriveQuarantinedVersionRecord({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: input.versionId,
    action,
    note,
    actorUserId: input.actorUserId,
  });
  let cleanup = null;
  if (action === "REJECT" && result.cleanupTask && !result.idempotent) {
    const storage = getDriveObjectStorageSafeStatus();
    cleanup = storage.storageConfigured
      ? await executeCleanupTask(result.cleanupTask, input.actorUserId)
      : { task: result.cleanupTask, deleted: false, error: "A tárhelykapcsolat nincs konfigurálva; a törlési feladat függőben maradt." };
  }
  return { ok: true as const, ...result, cleanup };
}

export async function processDriveObjectCleanup(input: {
  projectId: string;
  actorUserId: string;
  limit?: number;
}) {
  const database = await getDriveQuarantineReviewDatabaseHealth(input.projectId);
  if (!database.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE karanténellenőrzés 0.4.1 adatbázissémája nem áll készen.",
      "DRIVE_REVIEW_SCHEMA_NOT_READY",
      503,
      database,
    );
  }
  const storage = getDriveObjectStorageSafeStatus();
  if (!storage.storageConfigured) {
    throw new DriveCoreRepositoryError(
      "A DRIVE tárhelykapcsolat nélkül az objektumtakarítás nem futtatható.",
      "DRIVE_CLEANUP_STORAGE_NOT_CONFIGURED",
      503,
    );
  }
  const tasks = await listDriveCleanupTasks(input.projectId, input.limit || 20);
  const results = [];
  for (const task of tasks) results.push(await executeCleanupTask(task, input.actorUserId));
  return {
    ok: true as const,
    projectId: input.projectId,
    attempted: tasks.length,
    completed: results.filter((result) => result.deleted).length,
    failed: results.filter((result) => !result.deleted).length,
    results,
  };
}
