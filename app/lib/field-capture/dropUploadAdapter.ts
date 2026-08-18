import { findDropPackageById } from "@/app/lib/drop/dropRepository";
import { getDropPackageWorkflow } from "@/app/lib/drop/public/dropPublicRepository";
import {
  cancelDropUpload,
  getDropGlobalUploadReadiness,
  getDropServerUploadSnapshot,
  initializeDropServerUpload,
} from "@/app/lib/drop/storage/dropUploadService";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import {
  getFieldCaptureDropUploadBinding,
  getFieldCaptureItemUploadContext,
  getFieldCaptureProjectDimproId,
  markFieldCaptureDropUploadInitialized,
  markFieldCaptureDropUploadStored,
  type FieldCaptureServerSession,
} from "./serverRepository";

function identityError(error: unknown): never {
  if (error instanceof DimproIdentityError) throw error;
  const value = error as { message?: string; code?: string; status?: number } | null;
  throw new DimproIdentityError(
    value?.message || "A Drop feltöltési kapcsolat átmenetileg nem érhető el.",
    value?.code || "FIELD_CAPTURE_DROP_UPLOAD_FAILED",
    typeof value?.status === "number" ? value.status : 500,
  );
}

export async function getFieldCaptureDropUploadReadiness() {
  const readiness = await getDropGlobalUploadReadiness();
  return {
    ready: readiness.uploadReady,
    uploadReady: readiness.uploadReady,
    quarantineUploadReady: readiness.quarantineUploadReady,
    resumableUploadReady: readiness.resumableUploadReady,
    storageProvider: readiness.storageProvider,
    maxFileBytes: readiness.maxFileBytes,
    chunkSizeBytes: readiness.chunkSizeBytes,
    packageBindingMode: "EXISTING_ENTITLEMENT_PACKAGE" as const,
    rawTokenPersistence: false,
  };
}

async function assertPackageBinding(input: {
  packageId: string;
  entitlementId: string;
  session: FieldCaptureServerSession;
}) {
  try {
    const [packageRow, workflow] = await Promise.all([
      findDropPackageById(input.packageId),
      getDropPackageWorkflow(input.packageId),
    ]);
    if (
      !packageRow
      || packageRow.deleted_at
      || packageRow.status !== "active"
      || Date.parse(packageRow.expires_at) <= Date.now()
    ) {
      throw new DimproIdentityError(
        "A kiválasztott Drop csomag nem aktív.",
        "FIELD_CAPTURE_DROP_PACKAGE_NOT_ACTIVE",
        409,
      );
    }
    if (
      !workflow
      || workflow.workflowType !== "send"
      || workflow.dimproSendEntitlementId !== input.entitlementId
    ) {
      throw new DimproIdentityError(
        "A Drop csomag nem ehhez a DIMPRO Send jogosultsághoz tartozik.",
        "FIELD_CAPTURE_DROP_PACKAGE_ENTITLEMENT_MISMATCH",
        403,
      );
    }
    if (workflow.finalizedAt) {
      throw new DimproIdentityError(
        "A Drop csomag már véglegesítve lett.",
        "FIELD_CAPTURE_DROP_PACKAGE_FINALIZED",
        409,
      );
    }
    if (packageRow.mode !== "image" && packageRow.mode !== "mixed") {
      throw new DimproIdentityError(
        "A Drop csomag nem fogad terepi képassetet.",
        "FIELD_CAPTURE_DROP_PACKAGE_MODE_INVALID",
        409,
      );
    }
    if (input.session.projectId) {
      const dimproProjectId = await getFieldCaptureProjectDimproId(input.session.projectId);
      if (workflow.dimproProjectId !== dimproProjectId) {
        throw new DimproIdentityError(
          "A Drop csomag másik projekthez tartozik.",
          "FIELD_CAPTURE_DROP_PACKAGE_PROJECT_MISMATCH",
          403,
        );
      }
    } else if (workflow.dimproProjectId) {
      throw new DimproIdentityError(
        "A projekt nélküli terepi munkamenet nem köthető projektcsomaghoz.",
        "FIELD_CAPTURE_DROP_PACKAGE_PROJECT_CONTEXT_REQUIRED",
        409,
      );
    }
    return { packageRow, workflow };
  } catch (error) {
    identityError(error);
  }
}

export async function initializeFieldCaptureDropUpload(input: {
  session: FieldCaptureServerSession;
  itemId: string;
  entitlementId: string;
  packageId: string;
  actorName: string;
  actorEmail: string;
  rulesAccepted: boolean;
  rulesVersion: string;
  rulesAcceptedAt: string;
}) {
  try {
    const readiness = await getFieldCaptureDropUploadReadiness();
    if (!readiness.ready) {
      throw new DimproIdentityError(
        "A közös Drop feltöltőmotor jelenleg nem kész.",
        "FIELD_CAPTURE_DROP_UPLOAD_NOT_READY",
        503,
      );
    }

    await assertPackageBinding({
      packageId: input.packageId,
      entitlementId: input.entitlementId,
      session: input.session,
    });
    const context = await getFieldCaptureItemUploadContext({
      sessionId: input.session.id,
      itemId: input.itemId,
    });
    const sizeBytes = context.asset.storedSizeBytes || context.asset.originalSizeBytes || 0;
    const sourceOriginalSizeBytes = context.asset.originalSizeBytes || sizeBytes;
    if (
      !Number.isSafeInteger(sizeBytes)
      || sizeBytes <= 0
      || !Number.isSafeInteger(sourceOriginalSizeBytes)
      || sourceOriginalSizeBytes <= 0
    ) {
      throw new DimproIdentityError(
        "A terepi asset fájlmérete nem alkalmas feltöltésre.",
        "FIELD_CAPTURE_UPLOAD_ASSET_SIZE_INVALID",
        409,
      );
    }

    const upload = await initializeDropServerUpload({
      packageId: input.packageId,
      uploadedByName: input.actorName,
      uploadedByEmail: input.actorEmail,
      body: {
        originalFileName: context.asset.originalName || context.asset.displayName,
        displayFileName: context.asset.displayName,
        sizeBytes,
        sourceOriginalSizeBytes,
        mimeType: context.asset.mimeType,
        clientUploadId: `field-capture:${context.itemId}:${context.asset.variant}`,
        rulesAccepted: input.rulesAccepted,
        rulesVersion: input.rulesVersion,
        rulesAcceptedAt: input.rulesAcceptedAt,
      },
    });

    try {
      await markFieldCaptureDropUploadInitialized({
        sessionId: input.session.id,
        itemId: context.itemId,
        clientItemId: context.clientItemId,
        assetId: context.asset.id,
        variant: context.asset.variant,
        packageId: input.packageId,
        dropFileId: upload.file.id,
        dropUploadSessionId: upload.session.id,
        protocol: upload.protocol || "single",
        storageProvider: upload.storageProvider || "local-private",
      });
    } catch (bindingError) {
      await cancelDropUpload({
        uploadId: upload.session.id,
        rawToken: upload.uploadToken,
        reason: "A Field Capture szerveres binding mentése sikertelen; kompenzáló megszakítás.",
      }).catch(() => undefined);
      throw bindingError;
    }

    return {
      upload,
      binding: {
        sessionId: input.session.id,
        itemId: context.itemId,
        assetId: context.asset.id,
        packageId: input.packageId,
        dropFileId: upload.file.id,
        dropUploadSessionId: upload.session.id,
        rulesVersion: DROP_UPLOAD_RULES_VERSION,
        rawTokenPersisted: false,
        driveSynced: false,
      },
    };
  } catch (error) {
    identityError(error);
  }
}

export async function reconcileFieldCaptureDropUpload(input: {
  session: FieldCaptureServerSession;
  itemId: string;
  entitlementId: string;
}) {
  try {
    const context = await getFieldCaptureItemUploadContext({
      sessionId: input.session.id,
      itemId: input.itemId,
    });
    const binding = await getFieldCaptureDropUploadBinding({
      sessionId: input.session.id,
      itemId: context.itemId,
      clientItemId: context.clientItemId,
    });
    const packageId = String(binding.payload.dropPackageId || "");
    const uploadId = String(binding.payload.dropUploadSessionId || "");
    const dropFileId = String(binding.payload.dropFileId || "");
    if (!packageId || !uploadId || !dropFileId) {
      throw new DimproIdentityError(
        "A terepi Drop feltöltési kapcsolat hiányos.",
        "FIELD_CAPTURE_DROP_UPLOAD_BINDING_INVALID",
        409,
      );
    }

    await assertPackageBinding({
      packageId,
      entitlementId: input.entitlementId,
      session: input.session,
    });
    const snapshot = await getDropServerUploadSnapshot(uploadId);
    if (snapshot.packageId !== packageId || snapshot.file.id !== dropFileId) {
      throw new DimproIdentityError(
        "A Drop feltöltési munkamenet nem ehhez a terepi assethez tartozik.",
        "FIELD_CAPTURE_DROP_UPLOAD_CONTEXT_MISMATCH",
        403,
      );
    }

    if (snapshot.session.status !== "completed") {
      return {
        stored: false,
        state: snapshot.session.status,
        uploadId,
        fileId: dropFileId,
      };
    }

    await markFieldCaptureDropUploadStored({
      sessionId: input.session.id,
      itemId: context.itemId,
      clientItemId: context.clientItemId,
      assetId: context.asset.id,
      dropPackageId: packageId,
      dropFileId,
      dropUploadSessionId: uploadId,
      storageProvider: snapshot.file.storageProvider,
      storageBucket: snapshot.file.storageBucket,
      storageKey: snapshot.file.storageKey,
      storedSizeBytes: snapshot.file.sizeStoredBytes,
      securityStatus: snapshot.file.securityStatus,
      virusScanStatus: snapshot.file.virusScanStatus,
    });

    return {
      stored: true,
      state: "SERVER_STORED" as const,
      uploadId,
      fileId: dropFileId,
      securityStatus: snapshot.file.securityStatus,
      virusScanStatus: snapshot.file.virusScanStatus,
      driveSynced: false,
    };
  } catch (error) {
    identityError(error);
  }
}
