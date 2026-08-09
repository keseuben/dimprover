import { randomUUID } from "node:crypto";

export type DriveStorageEnvEntry = {
  key: string;
  requiredFor: "s3-primary" | "backup-b2" | "storage-box" | "general";
  present: boolean;
  safePreview: string;
};

const envCatalog: DriveStorageEnvEntry[] = [
  { key: "DIMPRO_DRIVE_STORAGE_MODE", requiredFor: "general", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_MAX_UPLOAD_MB", requiredFor: "general", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_S3_ENDPOINT", requiredFor: "s3-primary", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_S3_REGION", requiredFor: "s3-primary", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_S3_BUCKET", requiredFor: "s3-primary", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_S3_ACCESS_KEY_ID", requiredFor: "s3-primary", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY", requiredFor: "s3-primary", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_BACKUP_B2_KEY_ID", requiredFor: "backup-b2", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_BACKUP_B2_APPLICATION_KEY", requiredFor: "backup-b2", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_BACKUP_B2_BUCKET", requiredFor: "backup-b2", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_STORAGE_BOX_HOST", requiredFor: "storage-box", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_STORAGE_BOX_USER", requiredFor: "storage-box", present: false, safePreview: "" },
  { key: "DIMPRO_DRIVE_STORAGE_BOX_PASSWORD_OR_KEY", requiredFor: "storage-box", present: false, safePreview: "" },
];

function safePreview(value: string | undefined) {
  if (!value) return "missing";
  if (value.length <= 8) return "set";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function getDriveStorageEnvStatus() {
  const entries = envCatalog.map((entry) => {
    const value = process.env[entry.key];
    return {
      ...entry,
      present: Boolean(value),
      safePreview: safePreview(value),
    };
  });

  const requiredS3 = entries.filter((entry) => entry.requiredFor === "s3-primary");
  const s3Ready = requiredS3.every((entry) => entry.present);
  const generalReady = entries
    .filter((entry) => entry.requiredFor === "general")
    .every((entry) => entry.present);

  return {
    ok: true,
    mode: "env-check-only",
    generatedAt: new Date().toISOString(),
    storageMode: process.env.DIMPRO_DRIVE_STORAGE_MODE || "plan",
    s3Ready,
    generalReady,
    presentCount: entries.filter((entry) => entry.present).length,
    missingCount: entries.filter((entry) => !entry.present).length,
    entries,
    warning:
      "Ez csak környezeti változó ellenőrzés. Titkos értéket nem ad vissza, valós tárhelyírást nem indít.",
  };
}

export function getDriveStorageConfigPlan() {
  const selectedProvider = process.env.DIMPRO_DRIVE_STORAGE_PROVIDER || "hetzner-object-storage";
  const storageMode = process.env.DIMPRO_DRIVE_STORAGE_MODE || "plan";
  const maxUploadMb = Number(process.env.DIMPRO_DRIVE_MAX_UPLOAD_MB || 100);

  return {
    ok: true,
    mode: "plan-only-provider-config",
    generatedAt: new Date().toISOString(),
    selectedProvider,
    storageMode,
    maxUploadMb: Number.isFinite(maxUploadMb) ? maxUploadMb : 100,
    allowedProviders: ["hetzner-object-storage", "backblaze-b2", "hetzner-storage-box"],
    rules: {
      realStorageWriteEnabled: false,
      desktopCanStoreStorageSecret: false,
      serverSideSignedUploadRequired: true,
      providerSelectionPersisted: false,
    },
    note:
      "MVP állapot: a provider választó csak tervet ad vissza. Éles provider váltás később külön admin mentéssel történhet.",
  };
}

export function createSignedUploadContractPlan(input: {
  projectId?: string;
  fileName?: string;
  relativePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  clientId?: string;
}) {
  const uploadId = `signed_plan_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const fileSizeBytes = Number(input.fileSizeBytes || 0);
  const maxUploadMb = Number(process.env.DIMPRO_DRIVE_MAX_UPLOAD_MB || 100);

  return {
    ok: true,
    mode: "signed-upload-contract-plan-only",
    uploadId,
    projectId: input.projectId || "DIMPRO_DEMO",
    fileName: input.fileName || "feltoltes.bin",
    relativePath: input.relativePath || input.fileName || "feltoltes.bin",
    fileSizeBytes,
    mimeType: input.mimeType || "application/octet-stream",
    clientId: input.clientId || "desktop-dev-client",
    maxUploadMb: Number.isFinite(maxUploadMb) ? maxUploadMb : 100,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    signedUpload: {
      enabled: false,
      method: "PUT",
      url: null,
      headers: [],
      parts: [],
    },
    nextServerSteps: [
      "projektjogosultság ellenőrzése",
      "fájlméret és fájltípus validálása",
      "Object Storage signed URL generálás szerveroldalon",
      "feltöltés utáni audit esemény",
      "vírusellenőrzési státusz",
      "végleges fájlrekord létrehozása",
    ],
    blockedReason:
      "Valós signed upload még nincs engedélyezve. Ez csak API szerződés és kliens-flow előkészítés.",
  };
}
