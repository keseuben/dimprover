import { createDropPackage, findDropPackageById, getDropSupabaseClient, writeDropEvent } from "@/app/lib/drop/dropRepository";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { getFieldCaptureProjectDimproId, type FieldCaptureServerSession } from "./serverRepository";

const ALLOWED_RETENTION_DAYS = [1, 3, 5, 7, 14, 30] as const;
const DEFAULT_RETENTION_DAYS = 7;

type SendContext = Awaited<ReturnType<typeof import("@/app/lib/identity-core/repository").getDimproSendContextByEntitlementId>>;

type StagingRow = {
  id: string;
  session_id: string;
  user_id: string;
  entitlement_id: string;
  project_id: string | null;
  drop_package_id: string;
  status: "ACTIVE" | "RELEASED" | "EXPIRED" | "ERROR";
  retention_days: number;
  expires_at: string;
  raw_capabilities_persisted: boolean;
  created_at: string;
  updated_at: string;
};

function stagingRetentionDays() {
  const parsed = Number(process.env.FIELD_CAPTURE_STAGING_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  return (ALLOWED_RETENTION_DAYS as readonly number[]).includes(parsed) ? parsed : DEFAULT_RETENTION_DAYS;
}

function databaseError(message: string, error: { code?: string | null; message?: string } | null | undefined): never {
  throw new DimproIdentityError(message, error?.code || "FIELD_CAPTURE_STAGING_DATABASE_ERROR", 500);
}

function sameNullable(a: string | null | undefined, b: string | null | undefined) {
  return (a || null) === (b || null);
}

export async function getFieldCaptureStagingReadiness() {
  const client = getDimproIdentitySupabaseClient();
  const [marker, table] = await Promise.all([
    client.from("field_capture_schema_meta")
      .select("component,schema_version,migration_count,bootstrap_id")
      .eq("component", "field-capture-staging")
      .maybeSingle(),
    client.from("field_capture_staging_packages").select("id", { head: true, count: "exact" }).limit(0),
  ]);
  const markerReady = !marker.error
    && marker.data?.schema_version === "0.1.0"
    && Number(marker.data?.migration_count) === 1
    && marker.data?.bootstrap_id === "field-capture-staging-v010-20260818";
  return {
    ready: markerReady && !table.error,
    markerReady,
    tableReady: !table.error,
    retentionDays: stagingRetentionDays(),
    rawCapabilitiesPersisted: false,
    publicDeliveryWorkflow: false,
  };
}

async function getStagingRowBySession(sessionId: string) {
  const result = await getDimproIdentitySupabaseClient()
    .from("field_capture_staging_packages")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (result.error) databaseError("A terepi staging csomagkapcsolat nem olvasható.", result.error);
  return (result.data || null) as StagingRow | null;
}

export async function assertFieldCaptureStagingPackageBinding(input: {
  session: FieldCaptureServerSession;
  packageId: string;
  entitlementId: string;
}) {
  const result = await getDimproIdentitySupabaseClient()
    .from("field_capture_staging_packages")
    .select("*")
    .eq("session_id", input.session.id)
    .eq("drop_package_id", input.packageId)
    .maybeSingle();
  if (result.error) databaseError("A terepi staging csomag ellenőrzése sikertelen.", result.error);
  const row = result.data as StagingRow | null;
  if (!row) return null;
  if (
    row.status !== "ACTIVE"
    || row.user_id !== input.session.userId
    || row.entitlement_id !== input.entitlementId
    || !sameNullable(row.project_id, input.session.projectId)
    || row.raw_capabilities_persisted !== false
  ) {
    throw new DimproIdentityError(
      "A terepi staging csomag nem ehhez a munkamenethez tartozik.",
      "FIELD_CAPTURE_STAGING_BINDING_MISMATCH",
      403,
    );
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new DimproIdentityError(
      "A terepi staging csomag lejárt. Új staging csomag szükséges.",
      "FIELD_CAPTURE_STAGING_PACKAGE_EXPIRED",
      410,
    );
  }
  const packageRow = await findDropPackageById(row.drop_package_id);
  if (!packageRow || packageRow.deleted_at || packageRow.status !== "active" || Date.parse(packageRow.expires_at) <= Date.now()) {
    throw new DimproIdentityError(
      "A terepi staging Drop csomag már nem aktív.",
      "FIELD_CAPTURE_STAGING_DROP_PACKAGE_NOT_ACTIVE",
      409,
    );
  }
  return { row, packageRow };
}

async function configurePrivateStagingPackage(packageId: string) {
  const client = getDropSupabaseClient();
  const result = await client.from("drop_packages").update({
    notify_on_first_open: false,
    notify_on_download: false,
    notify_on_comment: false,
    notify_on_upload_complete: false,
    send_final_report_to_uploader: false,
    send_final_report_to_invitees: false,
    updated_at: new Date().toISOString(),
  }).eq("id", packageId).select("id").single();
  if (result.error || !result.data?.id) {
    throw new DimproIdentityError(
      "A terepi staging csomag értesítési szabályai nem állíthatók be biztonságosan.",
      result.error?.code || "FIELD_CAPTURE_STAGING_NOTIFICATION_POLICY_FAILED",
      500,
    );
  }
}

async function deleteTechnicalPackage(packageId: string) {
  const result = await getDropSupabaseClient().from("drop_packages").delete().eq("id", packageId).select("id").maybeSingle();
  if (result.error || !result.data?.id) {
    throw new DimproIdentityError(
      "A terepi staging technikai csomag nem volt törölhető.",
      result.error?.code || "FIELD_CAPTURE_STAGING_COMPENSATION_FAILED",
      500,
    );
  }
}

async function compensatePackage(packageId: string, originalError: unknown): Promise<never> {
  try {
    await deleteTechnicalPackage(packageId);
  } catch (compensationError) {
    if (compensationError instanceof DimproIdentityError) Object.assign(compensationError, { cause: originalError, packageId });
    throw compensationError;
  }
  throw originalError;
}

async function createAndBindStagingPackage(input: {
  session: FieldCaptureServerSession;
  context: SendContext;
}) {
  const retentionDays = stagingRetentionDays();
  const dimproProjectId = input.session.projectId
    ? await getFieldCaptureProjectDimproId(input.session.projectId)
    : null;
  const project = dimproProjectId
    ? input.context.projects.find((item) => item.id === dimproProjectId) || null
    : null;
  const created = await createDropPackage({
    mode: "image",
    title: `Terepi rögzítés · ${input.session.clientSessionId}`.slice(0, 180),
    description: "DIMPRO Terepi Gyorsrögzítő privát technikai staging csomag. Nem címzettküldemény.",
    projectId: dimproProjectId || undefined,
    projectName: project?.name || undefined,
    uploaderName: input.context.user.fullName,
    uploaderEmail: input.context.user.email,
    retentionDays,
    recipients: [],
    groups: [],
    maxFileCount: 200,
    maxFileSizeBytes: Math.min(input.context.entitlement.maxPackageSizeBytes, 524_288_000),
    maxTotalSizeBytes: input.context.entitlement.maxPackageSizeBytes,
  }, {
    userId: input.context.user.id,
    name: input.context.user.fullName,
    email: input.context.user.email,
  });

  try {
    await configurePrivateStagingPackage(created.package.id);
    const now = new Date().toISOString();
    const payload = {
      session_id: input.session.id,
      user_id: input.context.user.id,
      entitlement_id: input.context.entitlement.id,
      project_id: input.session.projectId,
      drop_package_id: created.package.id,
      status: "ACTIVE",
      retention_days: retentionDays,
      expires_at: created.package.expires_at,
      raw_capabilities_persisted: false,
      updated_at: now,
    };
    const existing = await getStagingRowBySession(input.session.id);
    const mapping = existing
      ? await getDimproIdentitySupabaseClient().from("field_capture_staging_packages")
          .update(payload).eq("id", existing.id).select("*").single()
      : await getDimproIdentitySupabaseClient().from("field_capture_staging_packages")
          .insert({ ...payload, created_at: now }).select("*").single();
    if (mapping.error?.code === "23505") {
      await deleteTechnicalPackage(created.package.id);
      const winner = await getStagingRowBySession(input.session.id);
      if (winner && winner.status === "ACTIVE" && Date.parse(winner.expires_at) > Date.now()) {
        return {
          packageId: winner.drop_package_id,
          expiresAt: winner.expires_at,
          retentionDays: winner.retention_days,
          reused: true,
          publicDeliveryWorkflow: false,
          recipientCount: 0,
          rawCapabilitiesPersisted: false,
        };
      }
      databaseError("A konkurens terepi staging csomagkapcsolat nem állítható helyre.", mapping.error);
    }
    if (mapping.error || !mapping.data) databaseError("A terepi staging csomagkapcsolat nem menthető.", mapping.error);
    await writeDropEvent({
      packageId: created.package.id,
      eventType: "field_capture.staging.created",
      actorName: input.context.user.fullName,
      actorEmail: input.context.user.email,
      payload: {
        captureSessionId: input.session.id,
        entitlementId: input.context.entitlement.id,
        projectId: input.session.projectId,
        retentionDays,
        recipientCount: 0,
        notificationsEnabled: false,
        reportsEnabled: false,
        rawCapabilitiesPersisted: false,
      },
    });
    return {
      packageId: created.package.id,
      expiresAt: created.package.expires_at,
      retentionDays,
      reused: false,
      publicDeliveryWorkflow: false,
      recipientCount: 0,
      rawCapabilitiesPersisted: false,
    };
  } catch (error) {
    return compensatePackage(created.package.id, error);
  }
}

export async function ensureFieldCaptureStagingPackage(input: {
  session: FieldCaptureServerSession;
  context: SendContext;
}) {
  const readiness = await getFieldCaptureStagingReadiness();
  if (!readiness.ready) {
    throw new DimproIdentityError(
      "A terepi staging csomagkezelés jelenleg nem kész.",
      "FIELD_CAPTURE_STAGING_NOT_READY",
      503,
    );
  }
  if (input.session.userId !== input.context.user.id || input.session.entitlementId !== input.context.entitlement.id) {
    throw new DimproIdentityError(
      "A terepi staging csomag jogosultsági kontextusa eltér.",
      "FIELD_CAPTURE_STAGING_CONTEXT_MISMATCH",
      403,
    );
  }

  const existing = await getStagingRowBySession(input.session.id);
  if (existing && existing.status === "ACTIVE" && Date.parse(existing.expires_at) > Date.now()) {
    const bound = await assertFieldCaptureStagingPackageBinding({
      session: input.session,
      packageId: existing.drop_package_id,
      entitlementId: input.context.entitlement.id,
    }).catch((error) => {
      if (error instanceof DimproIdentityError && ["FIELD_CAPTURE_STAGING_DROP_PACKAGE_NOT_ACTIVE", "FIELD_CAPTURE_STAGING_PACKAGE_EXPIRED"].includes(error.code)) return null;
      throw error;
    });
    if (bound) {
      return {
        packageId: existing.drop_package_id,
        expiresAt: existing.expires_at,
        retentionDays: existing.retention_days,
        reused: true,
        publicDeliveryWorkflow: false,
        recipientCount: 0,
        rawCapabilitiesPersisted: false,
      };
    }
  }
  return createAndBindStagingPackage(input);
}
