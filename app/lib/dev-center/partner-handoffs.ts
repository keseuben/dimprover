import { createHash, randomUUID } from "node:crypto";
import {
  getPartnerDevelopmentDatabaseClient,
  getPartnerProjectById,
  PartnerDevelopmentError,
} from "./partner-projects";
import { getPartnerRuntimeIsolationStatus } from "./partner-runtime";

export type PartnerHandoffStatus = "draft" | "prepared" | "handed_over" | "accepted" | "rejected" | "cancelled";
export type PartnerHandoffAction = "HAND_OVER" | "ACCEPT" | "REJECT" | "CANCEL";

type JsonRecord = Record<string, unknown>;

export type PartnerHandoffSummary = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  releaseId: string;
  status: PartnerHandoffStatus;
  checksum: string;
  gitCommit: string;
  buildId: string;
  handedOverAt: string | null;
  handedOverBy: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  createdAt: string;
  updatedAt: string;
  manifest: JsonRecord;
  metadata: JsonRecord;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function databaseError(message: string, error: { code?: string; message?: string; details?: string; hint?: string } | null, status = 500): never {
  throw new PartnerDevelopmentError(
    message,
    error?.code || "PARTNER_HANDOFF_DATABASE_ERROR",
    status,
    error ? { message: error.message, details: error.details, hint: error.hint } : undefined,
  );
}

function assertNoRawSecret(value: string) {
  const suspicious = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|service_role|password\s*[=:]|token\s*[=:]|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{12,})/i;
  if (suspicious.test(value)) {
    throw new PartnerDevelopmentError(
      "Az átadási jegyzék nyers titkot vagy érzékeny hitelesítési adatot nem tartalmazhat.",
      "PARTNER_HANDOFF_RAW_SECRET_DENIED",
      400,
    );
  }
}

function normalizeGitCommit(value: unknown) {
  const commit = text(value).toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(commit)) {
    throw new PartnerDevelopmentError("Érvényes Git commit azonosító szükséges.", "PARTNER_HANDOFF_GIT_COMMIT_INVALID", 400);
  }
  return commit;
}

function normalizeBuildId(value: unknown) {
  const buildId = text(value);
  if (!buildId || buildId.length > 160) {
    throw new PartnerDevelopmentError("A build azonosító kötelező.", "PARTNER_HANDOFF_BUILD_ID_INVALID", 400);
  }
  assertNoRawSecret(buildId);
  return buildId;
}

function normalizeNotes(value: unknown) {
  const notes = text(value);
  if (notes.length > 3000) throw new PartnerDevelopmentError("Az átadási megjegyzés túl hosszú.", "PARTNER_HANDOFF_NOTES_TOO_LONG", 400);
  if (notes) assertNoRawSecret(notes);
  return notes;
}

function normalizeArtifactRefs(value: unknown) {
  if (value == null) return [] as string[];
  if (!Array.isArray(value)) throw new PartnerDevelopmentError("Az artifactRefs tömb kell legyen.", "PARTNER_HANDOFF_ARTIFACT_REFS_INVALID", 400);
  if (value.length > 24) throw new PartnerDevelopmentError("Legfeljebb 24 artifact referencia adható meg.", "PARTNER_HANDOFF_ARTIFACT_REFS_INVALID", 400);
  return value.map((item) => {
    const ref = text(item);
    if (!ref || ref.length > 500) throw new PartnerDevelopmentError("Érvénytelen artifact referencia.", "PARTNER_HANDOFF_ARTIFACT_REFS_INVALID", 400);
    assertNoRawSecret(ref);
    return ref;
  });
}

function checksumManifest(manifest: JsonRecord) {
  return `sha256:${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
}

async function audit(projectId: string, action: string, entityId: string, actor: string, summary: string, metadata: JsonRecord = {}) {
  const db = getPartnerDevelopmentDatabaseClient();
  await db.from("dev_center_audit_events").insert({
    id: `audit_partner_handoff_${randomUUID()}`,
    actor_type: "admin",
    actor_id: actor,
    action,
    entity_type: "partner_handoff",
    entity_id: entityId,
    project_id: projectId,
    summary,
    metadata,
  });
}

export async function listPartnerHandoffs(projectId?: string) {
  const db = getPartnerDevelopmentDatabaseClient();
  let query = db.from("dev_center_partner_handoffs").select("*").order("created_at", { ascending: false }).limit(100);
  const normalizedProjectId = text(projectId);
  if (normalizedProjectId) query = query.eq("project_id", normalizedProjectId);
  const handoffs = await query;
  if (handoffs.error) databaseError("A partnerátadások betöltése sikertelen.", handoffs.error);
  const rows = (handoffs.data || []) as JsonRecord[];
  if (!rows.length) return { handoffs: [] as PartnerHandoffSummary[], checkedAt: new Date().toISOString() };

  const projectIds = Array.from(new Set(rows.map((row) => text(row.project_id)).filter(Boolean)));
  const releaseIds = Array.from(new Set(rows.map((row) => text(row.release_id)).filter(Boolean)));
  const [partners, projects, releases] = await Promise.all([
    db.from("dev_center_partner_projects").select("project_id,project_code").in("project_id", projectIds),
    db.from("dev_center_projects").select("id,name").in("id", projectIds),
    db.from("dev_center_releases").select("id,git_commit,build_id,status,metadata").in("id", releaseIds),
  ]);
  for (const result of [partners, projects, releases]) {
    if (result.error) databaseError("A partnerátadás összkép betöltése sikertelen.", result.error);
  }

  const partnerById = new Map((partners.data || []).map((row) => [String(row.project_id), row]));
  const projectById = new Map((projects.data || []).map((row) => [String(row.id), row]));
  const releaseById = new Map((releases.data || []).map((row) => [String(row.id), row]));

  return {
    handoffs: rows.map((row): PartnerHandoffSummary => {
      const projectIdValue = text(row.project_id);
      const releaseId = text(row.release_id);
      const partner = partnerById.get(projectIdValue);
      const project = projectById.get(projectIdValue);
      const release = releaseById.get(releaseId);
      return {
        id: text(row.id),
        projectId: projectIdValue,
        projectCode: text(partner?.project_code),
        projectName: text(project?.name),
        releaseId,
        status: text(row.status, "draft") as PartnerHandoffStatus,
        checksum: text(row.checksum),
        gitCommit: text(release?.git_commit),
        buildId: text(release?.build_id),
        handedOverAt: text(row.handed_over_at) || null,
        handedOverBy: text(row.handed_over_by) || null,
        acceptedAt: text(row.accepted_at) || null,
        acceptedBy: text(row.accepted_by) || null,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        manifest: jsonRecord(row.manifest_json),
        metadata: jsonRecord(row.metadata),
      };
    }),
    checkedAt: new Date().toISOString(),
  };
}

export async function preparePartnerHandoff(input: Record<string, unknown>) {
  const projectId = text(input.projectId);
  if (!projectId) throw new PartnerDevelopmentError("A partnerprojekt azonosító kötelező.", "PARTNER_HANDOFF_PROJECT_REQUIRED", 400);

  const runtime = await getPartnerRuntimeIsolationStatus();
  if (!runtime.ready) throw new PartnerDevelopmentError("A partnerátadás csak P2 RUNTIME READY állapotból készíthető elő.", "PARTNER_RUNTIME_NOT_READY", 503);

  const snapshot = await getPartnerProjectById(projectId);
  const project = snapshot.project;
  if (!snapshot.health.ready) throw new PartnerDevelopmentError("A Partner Development Plane séma nem READY.", "PARTNER_SCHEMA_NOT_READY", 503);
  if (!project) throw new PartnerDevelopmentError("A partnerprojekt nem található.", "PARTNER_PROJECT_NOT_FOUND", 404);
  if (project.provisionState !== "READY" || project.status !== "ready") {
    throw new PartnerDevelopmentError("Átadás csak teljesen kiépített READY partnerprojekthez készíthető.", "PARTNER_HANDOFF_PROJECT_NOT_READY", 409);
  }
  if (project.deliveryModel !== "HANDOFF") {
    throw new PartnerDevelopmentError("Ez a P4 munkafolyamat HANDOFF átadási modellhez használható.", "PARTNER_HANDOFF_MODEL_REQUIRED", 409);
  }

  const gitCommit = normalizeGitCommit(input.gitCommit);
  const buildId = normalizeBuildId(input.buildId);
  const notes = normalizeNotes(input.notes);
  const artifactRefs = normalizeArtifactRefs(input.artifactRefs);
  const actor = text(input.actor, "BenjAdmin");
  const preparedAt = new Date().toISOString();
  const releaseId = `release_partner_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const manifest: JsonRecord = {
    schema: "DIMPRO_PARTNER_HANDOFF_V1",
    projectId,
    projectCode: project.projectCode,
    projectName: project.name,
    deliveryModel: project.deliveryModel,
    dataClassification: project.dataClassification,
    releaseId,
    gitCommit,
    buildId,
    artifactRefs,
    notes,
    preparedAt,
    preparedBy: actor,
  };
  const checksum = checksumManifest(manifest);
  const db = getPartnerDevelopmentDatabaseClient();

  const releaseInsert = await db.from("dev_center_releases").insert({
    id: releaseId,
    project_id: projectId,
    status: "candidate",
    git_commit: gitCommit,
    build_id: buildId,
    metadata: {
      developmentPlane: "PARTNER",
      deliveryModel: "HANDOFF",
      partnerProjectCode: project.projectCode,
      handoffChecksum: checksum,
      buildOnceDeployMany: true,
    },
  });
  if (releaseInsert.error) databaseError("A partner kiadási jelölt létrehozása sikertelen.", releaseInsert.error);

  const handoffInsert = await db.from("dev_center_partner_handoffs").insert({
    project_id: projectId,
    release_id: releaseId,
    manifest_json: manifest,
    checksum,
    status: "prepared",
    metadata: { prepared_at: preparedAt, prepared_by: actor },
  }).select("id").single();

  if (handoffInsert.error || !handoffInsert.data?.id) {
    await db.from("dev_center_releases").delete().eq("id", releaseId);
    databaseError("A partnerátadás előkészítése sikertelen.", handoffInsert.error);
  }

  const handoffId = String(handoffInsert.data.id);
  await audit(projectId, "PARTNER_HANDOFF_PREPARED", handoffId, actor, "Partnerátadás előkészítve.", { releaseId, checksum, gitCommit, buildId });
  const result = await listPartnerHandoffs(projectId);
  return result.handoffs.find((item) => item.id === handoffId) || null;
}

export async function transitionPartnerHandoff(handoffId: string, action: PartnerHandoffAction, input: Record<string, unknown> = {}) {
  const id = text(handoffId);
  if (!id) throw new PartnerDevelopmentError("Az átadás azonosító kötelező.", "PARTNER_HANDOFF_ID_REQUIRED", 400);
  const actor = text(input.actor, "BenjAdmin");
  const note = normalizeNotes(input.note);
  const db = getPartnerDevelopmentDatabaseClient();
  const currentResult = await db.from("dev_center_partner_handoffs").select("*").eq("id", id).maybeSingle();
  if (currentResult.error) databaseError("A partnerátadás betöltése sikertelen.", currentResult.error);
  if (!currentResult.data) throw new PartnerDevelopmentError("A partnerátadás nem található.", "PARTNER_HANDOFF_NOT_FOUND", 404);

  const current = currentResult.data as JsonRecord;
  const currentStatus = text(current.status) as PartnerHandoffStatus;
  const projectId = text(current.project_id);
  const releaseId = text(current.release_id);
  const now = new Date().toISOString();
  let expected: PartnerHandoffStatus;
  let next: PartnerHandoffStatus;
  let patch: JsonRecord;
  let releasePatch: JsonRecord;
  let auditAction: string;

  if (action === "HAND_OVER") {
    expected = "prepared"; next = "handed_over";
    patch = { status: next, handed_over_at: now, handed_over_by: actor, updated_at: now, metadata: { ...jsonRecord(current.metadata), handover_note: note } };
    releasePatch = { status: "approved", approved_by: actor, approved_at: now, updated_at: now };
    auditAction = "PARTNER_HANDOFF_HANDED_OVER";
  } else if (action === "ACCEPT") {
    expected = "handed_over"; next = "accepted";
    patch = { status: next, accepted_at: now, accepted_by: actor, updated_at: now, metadata: { ...jsonRecord(current.metadata), acceptance_note: note } };
    releasePatch = { status: "released", released_at: now, updated_at: now };
    auditAction = "PARTNER_HANDOFF_ACCEPTED";
  } else if (action === "REJECT") {
    expected = "handed_over"; next = "rejected";
    patch = { status: next, updated_at: now, metadata: { ...jsonRecord(current.metadata), rejection_note: note, rejected_by: actor, rejected_at: now } };
    releasePatch = { status: "failed", updated_at: now };
    auditAction = "PARTNER_HANDOFF_REJECTED";
  } else if (action === "CANCEL") {
    if (!(["draft", "prepared"] as PartnerHandoffStatus[]).includes(currentStatus)) {
      throw new PartnerDevelopmentError("Csak vázlat vagy előkészített átadás vonható vissza.", "PARTNER_HANDOFF_TRANSITION_DENIED", 409);
    }
    expected = currentStatus; next = "cancelled";
    patch = { status: next, updated_at: now, metadata: { ...jsonRecord(current.metadata), cancellation_note: note, cancelled_by: actor, cancelled_at: now } };
    releasePatch = { status: "failed", updated_at: now };
    auditAction = "PARTNER_HANDOFF_CANCELLED";
  } else {
    throw new PartnerDevelopmentError("Ismeretlen átadási művelet.", "PARTNER_HANDOFF_ACTION_INVALID", 400);
  }

  if (currentStatus !== expected) {
    throw new PartnerDevelopmentError(`Érvénytelen átadási állapotváltás: ${currentStatus} -> ${next}.`, "PARTNER_HANDOFF_TRANSITION_DENIED", 409);
  }

  const update = await db.from("dev_center_partner_handoffs").update(patch).eq("id", id).eq("status", expected).select("id").maybeSingle();
  if (update.error) databaseError("A partnerátadás állapotváltása sikertelen.", update.error);
  if (!update.data) throw new PartnerDevelopmentError("Az átadás közben megváltozott; frissítés szükséges.", "PARTNER_HANDOFF_CONCURRENT_UPDATE", 409);

  const releaseUpdate = await db.from("dev_center_releases").update(releasePatch).eq("id", releaseId);
  if (releaseUpdate.error) databaseError("A kapcsolódó kiadási állapot frissítése sikertelen.", releaseUpdate.error);

  await audit(projectId, auditAction, id, actor, `Partnerátadás állapota: ${expected} -> ${next}.`, { releaseId, note });
  const result = await listPartnerHandoffs(projectId);
  return result.handoffs.find((item) => item.id === id) || null;
}
