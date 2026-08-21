import type { SupabaseClient } from "@supabase/supabase-js";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

type DbError = { code?: string | null; message?: string | null; details?: string | null } | null;
type DbRow = Record<string, unknown>;

export type FieldCaptureServerSession = {
  id: string;
  clientSessionId: string;
  userId: string;
  entitlementId: string;
  projectId: string | null;
  status: "ACTIVE" | "CLOSED" | "ARCHIVED";
  startedAt: string;
  closedAt: string | null;
  updatedAt: string;
};

export type FieldCaptureServerItem = {
  id: string;
  sessionId: string;
  clientItemId: string;
  sequenceNo: number;
  status: string;
  capturedAt: string;
  updatedAt: string;
};

export type FieldCaptureItemWrite = {
  sessionId: string;
  clientItemId: string;
  sequenceNo: number;
  capturedAt: string;
  note: string;
  captureOptions: Record<string, unknown>;
  edited: boolean;
  editRevision: number;
  asset?: {
    variant: "ORIGINAL" | "OPTIMIZED" | "THUMBNAIL";
    originalName: string | null;
    displayName: string;
    mimeType: string;
    originalSizeBytes: number | null;
    storedSizeBytes: number | null;
    width: number | null;
    height: number | null;
    checksumSha256: string | null;
    optimized: boolean;
  } | null;
  location?: Record<string, unknown> | null;
  orientation?: Record<string, unknown> | null;
  voice?: Record<string, unknown> | null;
  destinations: Array<{
    target: "CAPTURE" | "DEVICE" | "USER_DRIVE" | "PROJECT_DRIVE";
    folderId: string | null;
    ownership: "CAPTURE" | "USER" | "PROJECT" | "DEVICE";
    status: "PENDING" | "QUEUED" | "STORED" | "FAILED" | "REMOVED";
    retainedIndependently: boolean;
    detail: Record<string, unknown>;
  }>;
};

const DOMAIN_TABLES = [
  "field_capture_sessions",
  "field_capture_items",
  "field_capture_asset_refs",
  "field_capture_locations",
  "field_capture_orientations",
  "field_capture_voice_notes",
  "field_capture_destinations",
  "field_capture_events",
  "field_capture_sync_queue",
] as const;

function client(): SupabaseClient {
  return getDimproIdentitySupabaseClient();
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function databaseError(message: string, error: DbError): never {
  throw new DimproIdentityError(
    message,
    error?.code || "FIELD_CAPTURE_DATABASE_ERROR",
    error?.code === "42501" ? 403 : 500,
  );
}

function mapSession(row: DbRow): FieldCaptureServerSession {
  return {
    id: text(row.id),
    clientSessionId: text(row.client_session_id),
    userId: text(row.user_id),
    entitlementId: text(row.entitlement_id),
    projectId: nullableText(row.project_id),
    status: text(row.status) as FieldCaptureServerSession["status"],
    startedAt: text(row.started_at),
    closedAt: nullableText(row.closed_at),
    updatedAt: text(row.updated_at),
  };
}

function mapItem(row: DbRow): FieldCaptureServerItem {
  return {
    id: text(row.id),
    sessionId: text(row.session_id),
    clientItemId: text(row.client_item_id),
    sequenceNo: Number(row.sequence_no || 0),
    status: text(row.status),
    capturedAt: text(row.captured_at),
    updatedAt: text(row.updated_at),
  };
}

export async function getFieldCaptureServerSchemaReadiness() {
  const db = client();
  const markerResult = await db
    .from("field_capture_schema_meta")
    .select("component,schema_version,migration_count,bootstrap_id")
    .eq("component", "field-capture-core")
    .maybeSingle();

  const markerReady = !markerResult.error
    && markerResult.data?.schema_version === "0.1.0"
    && Number(markerResult.data?.migration_count) === 1
    && markerResult.data?.bootstrap_id === "field-capture-p7-v010-20260818";

  const checks = await Promise.all(DOMAIN_TABLES.map(async (table) => {
    const result = await db.from(table).select("*", { head: true, count: "exact" }).limit(0);
    return [table, !result.error] as const;
  }));

  return {
    ready: markerReady && checks.every(([, ready]) => ready),
    markerReady,
    checks: Object.fromEntries(checks),
  };
}

export async function resolveFieldCaptureProjectCoreId(dimproProjectId: string) {
  const result = await client()
    .from("project_core_projects")
    .select("id,dimpro_project_id,status")
    .eq("dimpro_project_id", dimproProjectId)
    .maybeSingle();
  if (result.error) databaseError("A projektkapcsolat feloldása sikertelen.", result.error);
  if (!result.data || ["DELETED", "DELETION_SCHEDULED"].includes(text(result.data.status))) {
    throw new DimproIdentityError(
      "A kiválasztott projekthez nem található aktív Project Core kapcsolat.",
      "FIELD_CAPTURE_PROJECT_CORE_LINK_MISSING",
      409,
    );
  }
  return text(result.data.id);
}

export async function upsertFieldCaptureServerSession(input: {
  clientSessionId: string;
  userId: string;
  entitlementId: string;
  projectCoreId: string | null;
  defaults: Record<string, unknown>;
}) {
  const result = await client()
    .from("field_capture_sessions")
    .upsert({
      client_session_id: input.clientSessionId,
      user_id: input.userId,
      entitlement_id: input.entitlementId,
      project_id: input.projectCoreId,
      context_module_code: "FIELD_CAPTURE",
      defaults: input.defaults,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,client_session_id" })
    .select("id,client_session_id,user_id,entitlement_id,project_id,status,started_at,closed_at,updated_at")
    .single();
  if (result.error) databaseError("A szerveres terepi munkamenet mentése sikertelen.", result.error);

  const session = mapSession(result.data as DbRow);
  const existingEvent = await client()
    .from("field_capture_events")
    .select("id")
    .eq("session_id", session.id)
    .eq("event_type", "SESSION_REGISTERED")
    .limit(1)
    .maybeSingle();
  if (existingEvent.error) {
    databaseError("A terepi munkamenet auditéllapotának ellenőrzése sikertelen.", existingEvent.error);
  }
  if (!existingEvent.data) {
    const eventResult = await client().from("field_capture_events").insert({
      session_id: session.id,
      event_type: "SESSION_REGISTERED",
      actor_user_id: input.userId,
      payload: { source: "field-capture-p7-api" },
    });
    if (eventResult.error) databaseError("A terepi munkamenet auditnaplózása sikertelen.", eventResult.error);
  }
  return session;
}

export async function assertFieldCaptureSessionOwner(input: {
  sessionId: string;
  userId: string;
  entitlementId: string;
}) {
  const result = await client()
    .from("field_capture_sessions")
    .select("id,client_session_id,user_id,entitlement_id,project_id,status,started_at,closed_at,updated_at")
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .eq("entitlement_id", input.entitlementId)
    .maybeSingle();
  if (result.error) databaseError("A terepi munkamenet ellenőrzése sikertelen.", result.error);
  if (!result.data) {
    throw new DimproIdentityError(
      "A terepi munkamenet nem található vagy nem ehhez a felhasználóhoz tartozik.",
      "FIELD_CAPTURE_SESSION_ACCESS_DENIED",
      404,
    );
  }
  return mapSession(result.data as DbRow);
}

export async function recordFieldCaptureEvent(input: {
  sessionId: string;
  actorUserId: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  const eventType = input.eventType.trim().slice(0, 120);
  if (!eventType) {
    throw new DimproIdentityError(
      "A terepi audit eseménytípus hiányzik.",
      "FIELD_CAPTURE_EVENT_TYPE_REQUIRED",
      400,
    );
  }
  const result = await client().from("field_capture_events").insert({
    session_id: input.sessionId,
    event_type: eventType,
    actor_user_id: input.actorUserId,
    payload: input.payload || {},
  });
  if (result.error) databaseError("A terepi audit esemény rögzítése sikertelen.", result.error);
}

export async function finalizeFieldCaptureServerSession(input: {
  sessionId: string;
  userId: string;
  entitlementId: string;
  expectedItemCount: number;
}) {
  const db = client();
  const session = await assertFieldCaptureSessionOwner({
    sessionId: input.sessionId,
    userId: input.userId,
    entitlementId: input.entitlementId,
  });

  if (!Number.isSafeInteger(input.expectedItemCount) || input.expectedItemCount <= 0 || input.expectedItemCount > 200) {
    throw new DimproIdentityError(
      "A lezárandó terepi munkamenet tételszáma érvénytelen.",
      "FIELD_CAPTURE_FINALIZE_ITEM_COUNT_INVALID",
      400,
    );
  }

  const itemsResult = await db
    .from("field_capture_items")
    .select("id,client_item_id,sequence_no,status")
    .eq("session_id", input.sessionId)
    .order("sequence_no", { ascending: true });
  if (itemsResult.error) databaseError("A terepi munkamenet lezárási állapota nem olvasható.", itemsResult.error);
  const items = (itemsResult.data || []) as DbRow[];

  if (items.length !== input.expectedItemCount) {
    throw new DimproIdentityError(
      `A szerveren ${items.length}, a helyi munkamenetben ${input.expectedItemCount} tétel van. A lezárás előtt szinkronizálni kell.`,
      "FIELD_CAPTURE_FINALIZE_ITEM_COUNT_MISMATCH",
      409,
    );
  }

  const incompleteItems = items.filter((row) => text(row.status) !== "SERVER_STORED");
  if (incompleteItems.length > 0) {
    throw new DimproIdentityError(
      `${incompleteItems.length} terepi képtétel még nincs biztonságosan a DIMPRO szerveren.`,
      "FIELD_CAPTURE_FINALIZE_ITEMS_NOT_STORED",
      409,
    );
  }

  const itemIds = items.map((row) => text(row.id)).filter(Boolean);
  const destinationsResult = await db
    .from("field_capture_destinations")
    .select("capture_item_id,target,status")
    .in("capture_item_id", itemIds);
  if (destinationsResult.error) databaseError("A terepi mentési célok lezárási állapota nem olvasható.", destinationsResult.error);
  const destinations = (destinationsResult.data || []) as DbRow[];
  const destinationRowsByItem = new Map<string, DbRow[]>();
  for (const row of destinations) {
    const itemId = text(row.capture_item_id);
    const rows = destinationRowsByItem.get(itemId) || [];
    rows.push(row);
    destinationRowsByItem.set(itemId, rows);
  }

  const pendingDestinations: string[] = [];
  for (const item of items) {
    const itemId = text(item.id);
    const sequenceNo = Number(item.sequence_no || 0);
    const rows = destinationRowsByItem.get(itemId) || [];
    const capture = rows.find((row) => text(row.target) === "CAPTURE");
    if (!capture || text(capture.status) !== "STORED") {
      pendingDestinations.push(`#${sequenceNo} DIMPRO szerver`);
    }
    for (const target of ["USER_DRIVE", "PROJECT_DRIVE"] as const) {
      const destination = rows.find((row) => text(row.target) === target);
      if (destination && text(destination.status) !== "STORED") {
        pendingDestinations.push(`#${sequenceNo} ${target === "USER_DRIVE" ? "Saját Drive" : "Projektkapu Drive"}`);
      }
    }
  }
  if (pendingDestinations.length > 0) {
    throw new DimproIdentityError(
      `A lezárás előtt még ${pendingDestinations.length} mentési cél várakozik: ${pendingDestinations.slice(0, 6).join(", ")}${pendingDestinations.length > 6 ? "…" : ""}`,
      "FIELD_CAPTURE_FINALIZE_DESTINATIONS_PENDING",
      409,
    );
  }

  const ensureClosedEvent = async () => {
    const existingEvent = await db
      .from("field_capture_events")
      .select("id")
      .eq("session_id", input.sessionId)
      .eq("event_type", "SESSION_CLOSED")
      .limit(1)
      .maybeSingle();
    if (existingEvent.error) databaseError("A terepi lezárási audit ellenőrzése sikertelen.", existingEvent.error);
    if (existingEvent.data) return;
    const eventResult = await db.from("field_capture_events").insert({
      session_id: input.sessionId,
      event_type: "SESSION_CLOSED",
      actor_user_id: input.userId,
      payload: {
        expectedItemCount: input.expectedItemCount,
        itemCount: items.length,
        source: "field-capture-f2-finalize",
      },
    });
    if (eventResult.error) databaseError("A terepi munkamenet lezárása nem naplózható.", eventResult.error);
  };

  if (session.status === "CLOSED") {
    await ensureClosedEvent();
    return { session, reused: true, itemCount: items.length };
  }
  if (session.status !== "ACTIVE") {
    throw new DimproIdentityError(
      "A terepi munkamenet már archivált, ezért nem zárható újra.",
      "FIELD_CAPTURE_FINALIZE_SESSION_NOT_ACTIVE",
      409,
    );
  }

  const now = new Date().toISOString();
  const closeResult = await db
    .from("field_capture_sessions")
    .update({ status: "CLOSED", closed_at: now, updated_at: now })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .eq("entitlement_id", input.entitlementId)
    .eq("status", "ACTIVE")
    .select("id,client_session_id,user_id,entitlement_id,project_id,status,started_at,closed_at,updated_at")
    .maybeSingle();
  if (closeResult.error) databaseError("A terepi munkamenet lezárása sikertelen.", closeResult.error);

  if (!closeResult.data) {
    const concurrent = await assertFieldCaptureSessionOwner({
      sessionId: input.sessionId,
      userId: input.userId,
      entitlementId: input.entitlementId,
    });
    if (concurrent.status === "CLOSED") return { session: concurrent, reused: true, itemCount: items.length };
    throw new DimproIdentityError(
      "A terepi munkamenet állapota közben megváltozott; a lezárást újra kell próbálni.",
      "FIELD_CAPTURE_FINALIZE_STATE_CHANGED",
      409,
    );
  }

  const closedSession = mapSession(closeResult.data as DbRow);
  await ensureClosedEvent();
  return { session: closedSession, reused: false, itemCount: items.length };
}

export async function upsertFieldCaptureServerItem(input: FieldCaptureItemWrite) {
  const db = client();
  const existingItemResult = await db
    .from("field_capture_items")
    .select("id,status,edit_revision")
    .eq("session_id", input.sessionId)
    .eq("client_item_id", input.clientItemId)
    .maybeSingle();
  if (existingItemResult.error) databaseError("A terepi képtétel korábbi állapota nem olvasható.", existingItemResult.error);
  const existingItem = existingItemResult.data as DbRow | null;

  let existingAsset: DbRow | null = null;
  if (existingItem && input.asset) {
    const existingAssetResult = await db
      .from("field_capture_asset_refs")
      .select("id,variant,original_name,display_name,mime_type,original_size_bytes,stored_size_bytes,width,height,checksum_sha256,optimized,storage_status")
      .eq("capture_item_id", text(existingItem.id))
      .eq("variant", input.asset.variant)
      .maybeSingle();
    if (existingAssetResult.error) databaseError("A terepi asset korábbi állapota nem olvasható.", existingAssetResult.error);
    existingAsset = existingAssetResult.data as DbRow | null;
  }

  const revisionChanged = Boolean(existingItem && input.editRevision > Number(existingItem.edit_revision || 0));
  const assetChanged = Boolean(input.asset && (
    !existingAsset
    || revisionChanged
    || nullableText(existingAsset.original_name) !== input.asset.originalName
    || text(existingAsset.display_name) !== input.asset.displayName
    || text(existingAsset.mime_type) !== input.asset.mimeType
    || Number(existingAsset.original_size_bytes || 0) !== Number(input.asset.originalSizeBytes || 0)
    || Number(existingAsset.width || 0) !== Number(input.asset.width || 0)
    || Number(existingAsset.height || 0) !== Number(input.asset.height || 0)
    || Boolean(existingAsset.optimized) !== input.asset.optimized
  ));
  const nextItemStatus = existingItem && !assetChanged
    ? text(existingItem.status)
    : input.asset ? "QUEUED" : "SERVER_STORED";

  const itemResult = await db
    .from("field_capture_items")
    .upsert({
      session_id: input.sessionId,
      client_item_id: input.clientItemId,
      sequence_no: input.sequenceNo,
      captured_at: input.capturedAt,
      note: input.note,
      status: nextItemStatus,
      capture_options: input.captureOptions,
      edited: input.edited,
      edit_revision: input.editRevision,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,client_item_id" })
    .select("id,session_id,client_item_id,sequence_no,status,captured_at,updated_at")
    .single();
  if (itemResult.error) databaseError("A terepi képtétel regisztrálása sikertelen.", itemResult.error);
  const item = mapItem(itemResult.data as DbRow);

  if (input.asset) {
    const assetPayload: Record<string, unknown> = {
      capture_item_id: item.id,
      variant: input.asset.variant,
      original_name: input.asset.originalName,
      display_name: input.asset.displayName,
      mime_type: input.asset.mimeType,
      original_size_bytes: input.asset.originalSizeBytes,
      stored_size_bytes: input.asset.storedSizeBytes,
      width: input.asset.width,
      height: input.asset.height,
      checksum_sha256: assetChanged ? input.asset.checksumSha256 : input.asset.checksumSha256 || nullableText(existingAsset?.checksum_sha256),
      optimized: input.asset.optimized,
      updated_at: new Date().toISOString(),
    };
    if (assetChanged) {
      Object.assign(assetPayload, {
        blob_id: null,
        storage_provider: null,
        storage_bucket: null,
        storage_key: null,
        storage_status: "PENDING",
      });
    }
    const assetResult = await db.from("field_capture_asset_refs").upsert(assetPayload, { onConflict: "capture_item_id,variant" });
    if (assetResult.error) databaseError("A terepi asset metaadat mentése sikertelen.", assetResult.error);

    const existingQueueResult = await db.from("field_capture_sync_queue")
      .select("id,status,payload_meta")
      .eq("session_id", input.sessionId)
      .eq("device_local_id", input.clientItemId)
      .eq("operation", "UPLOAD_ASSET")
      .maybeSingle();
    if (existingQueueResult.error) databaseError("A terepi szinkronsor korábbi állapota nem olvasható.", existingQueueResult.error);
    if (!existingQueueResult.data || assetChanged) {
      const queueResult = await db.from("field_capture_sync_queue").upsert({
        session_id: input.sessionId,
        capture_item_id: item.id,
        device_local_id: input.clientItemId,
        operation: "UPLOAD_ASSET",
        status: "QUEUED",
        retry_count: 0,
        next_retry_at: null,
        payload_meta: { variant: input.asset.variant, mimeType: input.asset.mimeType },
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "session_id,device_local_id,operation" });
      if (queueResult.error) databaseError("A terepi szinkronsor előkészítése sikertelen.", queueResult.error);
    }
  }

  if (input.location) {
    const result = await db.from("field_capture_locations").upsert(
      { capture_item_id: item.id, ...input.location, updated_at: new Date().toISOString() },
      { onConflict: "capture_item_id" },
    );
    if (result.error) databaseError("A GPS metaadat mentése sikertelen.", result.error);
  }

  if (input.orientation) {
    const result = await db.from("field_capture_orientations").upsert(
      { capture_item_id: item.id, ...input.orientation, updated_at: new Date().toISOString() },
      { onConflict: "capture_item_id" },
    );
    if (result.error) databaseError("A kamerairány metaadat mentése sikertelen.", result.error);
  }

  if (input.voice) {
    const result = await db.from("field_capture_voice_notes").upsert(
      { capture_item_id: item.id, ...input.voice, updated_at: new Date().toISOString() },
      { onConflict: "capture_item_id" },
    );
    if (result.error) databaseError("A diktálás metaadat mentése sikertelen.", result.error);
  }

  if (input.destinations.length > 0) {
    const existingDestinationsResult = await db.from("field_capture_destinations")
      .select("target,status")
      .eq("capture_item_id", item.id);
    if (existingDestinationsResult.error) databaseError("A terepi mentési célok korábbi állapota nem olvasható.", existingDestinationsResult.error);
    const existingStatusByTarget = new Map(
      ((existingDestinationsResult.data || []) as DbRow[]).map((row) => [text(row.target), text(row.status)]),
    );
    const rows = input.destinations.map((destination) => ({
      capture_item_id: item.id,
      target: destination.target,
      folder_id: destination.folderId,
      ownership: destination.ownership,
      status: assetChanged ? "PENDING" : existingStatusByTarget.get(destination.target) || destination.status,
      retained_independently: destination.retainedIndependently,
      detail: destination.detail,
      updated_at: new Date().toISOString(),
    }));
    const result = await db.from("field_capture_destinations").upsert(rows, { onConflict: "capture_item_id,target" });
    if (result.error) databaseError("A terepi mentési célok rögzítése sikertelen.", result.error);
  }

  const eventResult = await db.from("field_capture_events").insert({
    session_id: input.sessionId,
    capture_item_id: item.id,
    event_type: existingItem ? "ITEM_REFRESHED" : "ITEM_UPSERTED",
    payload: {
      clientItemId: input.clientItemId,
      sequenceNo: input.sequenceNo,
      storageStatePreserved: Boolean(existingItem && !assetChanged),
      assetChanged,
    },
  });
  if (eventResult.error) databaseError("A terepi képtétel auditnaplózása sikertelen.", eventResult.error);

  return item;
}

export async function getFieldCaptureProjectDimproId(projectCoreId: string) {
  const result = await client()
    .from("project_core_projects")
    .select("id,dimpro_project_id,status")
    .eq("id", projectCoreId)
    .maybeSingle();
  if (result.error) databaseError("A Project Core kapcsolat ellenőrzése sikertelen.", result.error);
  if (!result.data || ["DELETED", "DELETION_SCHEDULED"].includes(text(result.data.status))) {
    throw new DimproIdentityError(
      "A terepi munkamenet projektkapcsolata már nem aktív.",
      "FIELD_CAPTURE_PROJECT_CORE_LINK_MISSING",
      409,
    );
  }
  const dimproProjectId = nullableText(result.data.dimpro_project_id);
  if (!dimproProjectId) {
    throw new DimproIdentityError(
      "A terepi munkamenethez nincs DIMPRO projektazonosító rendelve.",
      "FIELD_CAPTURE_DIMPRO_PROJECT_LINK_MISSING",
      409,
    );
  }
  return dimproProjectId;
}

export async function getFieldCaptureItemUploadContext(input: {
  sessionId: string;
  itemId: string;
}) {
  const db = client();
  const itemResult = await db
    .from("field_capture_items")
    .select("id,session_id,client_item_id,status")
    .eq("id", input.itemId)
    .eq("session_id", input.sessionId)
    .maybeSingle();
  if (itemResult.error) databaseError("A terepi képtétel feltöltési állapota nem olvasható.", itemResult.error);
  if (!itemResult.data) {
    throw new DimproIdentityError("A terepi képtétel nem található.", "FIELD_CAPTURE_ITEM_NOT_FOUND", 404);
  }

  const assetResult = await db
    .from("field_capture_asset_refs")
    .select("id,capture_item_id,variant,original_name,display_name,mime_type,original_size_bytes,stored_size_bytes,checksum_sha256,storage_provider,storage_bucket,storage_key,storage_status")
    .eq("capture_item_id", input.itemId);
  if (assetResult.error) databaseError("A terepi asset metaadatai nem olvashatók.", assetResult.error);
  const assets = (assetResult.data || []) as DbRow[];
  const asset = assets.find((row) => text(row.variant) === "OPTIMIZED")
    || assets.find((row) => text(row.variant) === "ORIGINAL")
    || null;
  if (!asset) {
    throw new DimproIdentityError(
      "A terepi képtételhez nincs feltölthető asset.",
      "FIELD_CAPTURE_UPLOAD_ASSET_MISSING",
      409,
    );
  }

  return {
    itemId: text(itemResult.data.id),
    clientItemId: text(itemResult.data.client_item_id),
    itemStatus: text(itemResult.data.status),
    asset: {
      id: text(asset.id),
      variant: text(asset.variant) as "ORIGINAL" | "OPTIMIZED",
      originalName: nullableText(asset.original_name),
      displayName: text(asset.display_name),
      mimeType: text(asset.mime_type),
      originalSizeBytes: asset.original_size_bytes == null ? null : Number(asset.original_size_bytes),
      storedSizeBytes: asset.stored_size_bytes == null ? null : Number(asset.stored_size_bytes),
      checksumSha256: nullableText(asset.checksum_sha256),
      storageStatus: text(asset.storage_status),
    },
  };
}

export async function markFieldCaptureDropUploadInitialized(input: {
  sessionId: string;
  itemId: string;
  clientItemId: string;
  assetId: string;
  variant: string;
  packageId: string;
  dropFileId: string;
  dropUploadSessionId: string;
  protocol: string;
  storageProvider: string;
}) {
  const db = client();
  const now = new Date().toISOString();

  const assetResult = await db.from("field_capture_asset_refs")
    .update({ storage_status: "UPLOADING", updated_at: now })
    .eq("id", input.assetId)
    .eq("capture_item_id", input.itemId);
  if (assetResult.error) databaseError("A terepi asset feltöltési állapota nem frissíthető.", assetResult.error);

  const queueResult = await db.from("field_capture_sync_queue").upsert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    device_local_id: input.clientItemId,
    operation: "UPLOAD_ASSET",
    status: "RUNNING",
    payload_meta: {
      variant: input.variant,
      dropPackageId: input.packageId,
      dropFileId: input.dropFileId,
      dropUploadSessionId: input.dropUploadSessionId,
      protocol: input.protocol,
      storageProvider: input.storageProvider,
      rawTokenPersisted: false,
    },
    last_error: null,
    updated_at: now,
  }, { onConflict: "session_id,device_local_id,operation" });
  if (queueResult.error) databaseError("A terepi feltöltési sor nem frissíthető.", queueResult.error);

  const itemResult = await db.from("field_capture_items")
    .update({ status: "UPLOADING", updated_at: now })
    .eq("id", input.itemId)
    .eq("session_id", input.sessionId);
  if (itemResult.error) databaseError("A terepi képtétel feltöltési állapota nem frissíthető.", itemResult.error);

  const eventResult = await db.from("field_capture_events").insert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    event_type: "ASSET_UPLOAD_INITIALIZED",
    payload: {
      dropPackageId: input.packageId,
      dropFileId: input.dropFileId,
      dropUploadSessionId: input.dropUploadSessionId,
      rawTokenPersisted: false,
    },
  });
  if (eventResult.error) databaseError("A terepi feltöltés indítása nem naplózható.", eventResult.error);
}

export async function getFieldCaptureDropUploadBinding(input: {
  sessionId: string;
  itemId: string;
  clientItemId: string;
}) {
  const result = await client().from("field_capture_sync_queue")
    .select("id,status,payload_meta,last_error")
    .eq("session_id", input.sessionId)
    .eq("capture_item_id", input.itemId)
    .eq("device_local_id", input.clientItemId)
    .eq("operation", "UPLOAD_ASSET")
    .maybeSingle();
  if (result.error) databaseError("A terepi Drop feltöltési kapcsolat nem olvasható.", result.error);
  if (!result.data) {
    throw new DimproIdentityError(
      "A terepi Drop feltöltési kapcsolat nem található.",
      "FIELD_CAPTURE_DROP_UPLOAD_BINDING_MISSING",
      409,
    );
  }
  return {
    status: text(result.data.status),
    payload: result.data.payload_meta && typeof result.data.payload_meta === "object"
      ? result.data.payload_meta as Record<string, unknown>
      : {},
    lastError: nullableText(result.data.last_error),
  };
}

export async function markFieldCaptureDropUploadStored(input: {
  sessionId: string;
  itemId: string;
  clientItemId: string;
  assetId: string;
  dropPackageId: string;
  dropFileId: string;
  dropUploadSessionId: string;
  storageProvider: string;
  storageBucket: string;
  storageKey: string;
  storedSizeBytes: number;
  securityStatus: string | null;
  virusScanStatus: string;
}) {
  const db = client();
  const now = new Date().toISOString();

  const assetResult = await db.from("field_capture_asset_refs")
    .update({
      storage_provider: input.storageProvider,
      storage_bucket: input.storageBucket,
      storage_key: input.storageKey,
      stored_size_bytes: input.storedSizeBytes,
      storage_status: "STORED",
      updated_at: now,
    })
    .eq("id", input.assetId)
    .eq("capture_item_id", input.itemId);
  if (assetResult.error) databaseError("A terepi asset szerveres tárhelyállapota nem frissíthető.", assetResult.error);

  const queueResult = await db.from("field_capture_sync_queue")
    .update({
      status: "DONE",
      last_error: null,
      payload_meta: {
        dropPackageId: input.dropPackageId,
        dropFileId: input.dropFileId,
        dropUploadSessionId: input.dropUploadSessionId,
        storageProvider: input.storageProvider,
        securityStatus: input.securityStatus,
        virusScanStatus: input.virusScanStatus,
        rawTokenPersisted: false,
      },
      updated_at: now,
    })
    .eq("session_id", input.sessionId)
    .eq("capture_item_id", input.itemId)
    .eq("device_local_id", input.clientItemId)
    .eq("operation", "UPLOAD_ASSET");
  if (queueResult.error) databaseError("A terepi feltöltési sor lezárása sikertelen.", queueResult.error);

  const itemResult = await db.from("field_capture_items")
    .update({ status: "SERVER_STORED", updated_at: now })
    .eq("id", input.itemId)
    .eq("session_id", input.sessionId);
  if (itemResult.error) databaseError("A terepi képtétel szerveres állapota nem frissíthető.", itemResult.error);

  const captureDestination = await db.from("field_capture_destinations")
    .update({ status: "STORED", asset_ref_id: input.assetId, updated_at: now })
    .eq("capture_item_id", input.itemId)
    .eq("target", "CAPTURE");
  if (captureDestination.error) databaseError("A CAPTURE mentési cél állapota nem frissíthető.", captureDestination.error);

  const eventResult = await db.from("field_capture_events").insert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    event_type: "ASSET_SERVER_STORED",
    payload: {
      dropPackageId: input.dropPackageId,
      dropFileId: input.dropFileId,
      dropUploadSessionId: input.dropUploadSessionId,
      securityStatus: input.securityStatus,
      virusScanStatus: input.virusScanStatus,
      rawTokenPersisted: false,
      driveSynced: false,
    },
  });
  if (eventResult.error) databaseError("A terepi szerveres tárolás nem naplózható.", eventResult.error);
}

export async function getFieldCaptureUserDriveDestination(input: {
  itemId: string;
}) {
  const result = await client().from("field_capture_destinations")
    .select("id,capture_item_id,target,folder_id,ownership,status,asset_ref_id,retained_independently,detail")
    .eq("capture_item_id", input.itemId)
    .eq("target", "USER_DRIVE")
    .maybeSingle();
  if (result.error) databaseError("A Saját Drive mentési cél nem olvasható.", result.error);
  if (!result.data) {
    throw new DimproIdentityError(
      "A képtételhez nincs Saját DIMPRO Drive mentési cél kérve.",
      "FIELD_CAPTURE_USER_DRIVE_NOT_REQUESTED",
      409,
    );
  }
  if (text(result.data.ownership) !== "USER") {
    throw new DimproIdentityError(
      "A Saját Drive mentési cél ownership beállítása érvénytelen.",
      "FIELD_CAPTURE_USER_DRIVE_OWNERSHIP_INVALID",
      409,
    );
  }
  return {
    id: text(result.data.id),
    status: text(result.data.status),
    folderId: nullableText(result.data.folder_id),
    assetRefId: nullableText(result.data.asset_ref_id),
    retainedIndependently: Boolean(result.data.retained_independently),
    detail: result.data.detail && typeof result.data.detail === "object"
      ? result.data.detail as Record<string, unknown>
      : {},
  };
}

export async function markFieldCaptureUserDriveStored(input: {
  sessionId: string;
  itemId: string;
  clientItemId: string;
  assetId: string;
  contentObjectId: string;
  contentRefId: string;
  driveBucket: string;
  driveStorageKey: string;
  sha256: string;
  sizeBytes: number;
}) {
  const db = client();
  const now = new Date().toISOString();
  const existing = await getFieldCaptureUserDriveDestination({ itemId: input.itemId });
  const detail = {
    ...existing.detail,
    contentObjectId: input.contentObjectId,
    contentRefId: input.contentRefId,
    storageProvider: "S3",
    storageBucket: input.driveBucket,
    storageKey: input.driveStorageKey,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    scope: "USER_ROOT",
    driveSynced: true,
  };
  const destination = await db.from("field_capture_destinations")
    .update({
      folder_id: null,
      ownership: "USER",
      status: "STORED",
      asset_ref_id: input.assetId,
      retained_independently: true,
      detail,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("capture_item_id", input.itemId)
    .eq("target", "USER_DRIVE");
  if (destination.error) databaseError("A Saját Drive mentési cél nem frissíthető.", destination.error);

  const queue = await db.from("field_capture_sync_queue").upsert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    device_local_id: input.clientItemId,
    operation: "SYNC_USER_DRIVE",
    status: "DONE",
    payload_meta: {
      contentObjectId: input.contentObjectId,
      contentRefId: input.contentRefId,
      storageProvider: "S3",
      storageBucket: input.driveBucket,
      storageKey: input.driveStorageKey,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      scope: "USER_ROOT",
      retainedIndependently: true,
      rawTokenPersisted: false,
    },
    last_error: null,
    updated_at: now,
  }, { onConflict: "session_id,device_local_id,operation" });
  if (queue.error) databaseError("A Saját Drive szinkronállapot nem menthető.", queue.error);

  const event = await db.from("field_capture_events").insert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    event_type: "USER_DRIVE_STORED",
    payload: {
      contentObjectId: input.contentObjectId,
      contentRefId: input.contentRefId,
      scope: "USER_ROOT",
      retainedIndependently: true,
      rawTokenPersisted: false,
    },
  });
  if (event.error) databaseError("A Saját Drive mentés nem naplózható.", event.error);
}

export async function getFieldCaptureProjectDriveDestination(input: {
  itemId: string;
}) {
  const result = await client().from("field_capture_destinations")
    .select("id,capture_item_id,target,folder_id,ownership,status,asset_ref_id,retained_independently,detail")
    .eq("capture_item_id", input.itemId)
    .eq("target", "PROJECT_DRIVE")
    .maybeSingle();
  if (result.error) databaseError("A Projektkapu Drive mentési cél nem olvasható.", result.error);
  if (!result.data) {
    throw new DimproIdentityError(
      "A képtételhez nincs Projektkapu Drive mentési cél kérve.",
      "FIELD_CAPTURE_PROJECT_DRIVE_NOT_REQUESTED",
      409,
    );
  }
  if (text(result.data.ownership) !== "PROJECT") {
    throw new DimproIdentityError(
      "A Projektkapu Drive mentési cél ownership beállítása érvénytelen.",
      "FIELD_CAPTURE_PROJECT_DRIVE_OWNERSHIP_INVALID",
      409,
    );
  }
  return {
    id: text(result.data.id),
    status: text(result.data.status),
    folderId: nullableText(result.data.folder_id),
    assetRefId: nullableText(result.data.asset_ref_id),
    retainedIndependently: Boolean(result.data.retained_independently),
    detail: result.data.detail && typeof result.data.detail === "object"
      ? result.data.detail as Record<string, unknown>
      : {},
  };
}

export async function markFieldCaptureProjectDriveContentStored(input: {
  sessionId: string;
  itemId: string;
  clientItemId: string;
  assetId: string;
  projectId: string;
  contentObjectId: string;
  contentRefId: string;
  driveBucket: string;
  driveStorageKey: string;
  sha256: string;
  sizeBytes: number;
}) {
  const db = client();
  const now = new Date().toISOString();
  const existing = await getFieldCaptureProjectDriveDestination({ itemId: input.itemId });
  const detail = {
    ...existing.detail,
    projectId: input.projectId,
    contentObjectId: input.contentObjectId,
    contentRefId: input.contentRefId,
    storageProvider: "S3",
    storageBucket: input.driveBucket,
    storageKey: input.driveStorageKey,
    sha256: input.sha256,
    sizeBytes: input.sizeBytes,
    scope: "PROJECT_ROOT",
    projectContentBound: true,
    projectDriveTreeBound: false,
    p9Stage: "P9.1",
  };
  const destination = await db.from("field_capture_destinations")
    .update({
      folder_id: null,
      ownership: "PROJECT",
      status: "STORED",
      asset_ref_id: input.assetId,
      retained_independently: true,
      detail,
      updated_at: now,
    })
    .eq("id", existing.id)
    .eq("capture_item_id", input.itemId)
    .eq("target", "PROJECT_DRIVE");
  if (destination.error) databaseError("A Projektkapu Drive mentési cél nem frissíthető.", destination.error);

  const queue = await db.from("field_capture_sync_queue").upsert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    device_local_id: input.clientItemId,
    operation: "SYNC_PROJECT_DRIVE_CONTENT",
    status: "DONE",
    payload_meta: {
      projectId: input.projectId,
      contentObjectId: input.contentObjectId,
      contentRefId: input.contentRefId,
      storageProvider: "S3",
      storageBucket: input.driveBucket,
      storageKey: input.driveStorageKey,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      scope: "PROJECT_ROOT",
      retainedIndependently: true,
      projectDriveTreeBound: false,
      rawTokenPersisted: false,
    },
    last_error: null,
    updated_at: now,
  }, { onConflict: "session_id,device_local_id,operation" });
  if (queue.error) databaseError("A Projektkapu Drive content szinkronállapot nem menthető.", queue.error);

  const event = await db.from("field_capture_events").insert({
    session_id: input.sessionId,
    capture_item_id: input.itemId,
    event_type: "PROJECT_DRIVE_CONTENT_STORED",
    payload: {
      projectId: input.projectId,
      contentObjectId: input.contentObjectId,
      contentRefId: input.contentRefId,
      scope: "PROJECT_ROOT",
      retainedIndependently: true,
      projectDriveTreeBound: false,
      p9Stage: "P9.1",
      rawTokenPersisted: false,
    },
  });
  if (event.error) databaseError("A Projektkapu Drive content mentés nem naplózható.", event.error);
}
