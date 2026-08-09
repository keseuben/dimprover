export type DriveStorageProviderPlan = {
  id: "hetzner-object-storage" | "backblaze-b2" | "hetzner-storage-box";
  role: "primary-object-storage" | "backup-storage" | "archive-storage";
  label: string;
  recommendedFor: string;
  status: "planned" | "candidate" | "later";
  requiredSecrets: string[];
  notes: string[];
};

export type DriveObjectStorageContract = {
  ok: true;
  version: "v4.01-mvp-contract";
  generatedAt: string;
  activeMode: "plan-only";
  rules: {
    noRealObjectStorageWriteYet: true;
    noClientSecretInDesktop: true;
    serverSideSignedUploadRequired: true;
    virusScanBeforeFinalAccept: true;
    auditLogRequired: true;
  };
  recommendedArchitecture: string[];
  providers: DriveStorageProviderPlan[];
  objectKeyTemplate: string;
  requiredServerEnv: string[];
  futureEndpoints: string[];
};

export function getDriveObjectStorageContract(): DriveObjectStorageContract {
  return {
    ok: true,
    version: "v4.01-mvp-contract",
    generatedAt: new Date().toISOString(),
    activeMode: "plan-only",
    rules: {
      noRealObjectStorageWriteYet: true,
      noClientSecretInDesktop: true,
      serverSideSignedUploadRequired: true,
      virusScanBeforeFinalAccept: true,
      auditLogRequired: true,
    },
    recommendedArchitecture: [
      "A desktop kliens csak rövid életű, szerver által kiadott feltöltési engedélyt kaphat.",
      "A végleges tárhelyműveletet a DIMPROVER szerver hitelesíti, naplózza és jogosultsághoz köti.",
      "Object Storage elsődleges tárhelyként, külön backup tárhellyel.",
      "Minden objektum projekt / workspace / relatív útvonal / verzió alapján legyen címezve.",
      "Feltöltés után receipt, audit esemény és később vírusellenőrzési státusz keletkezik.",
    ],
    providers: [
      {
        id: "hetzner-object-storage",
        role: "primary-object-storage",
        label: "Hetzner Object Storage",
        recommendedFor: "Elsődleges DIMPRO Drive fájltár, indulásnak 1 TB körüli tárhelystratégiával.",
        status: "candidate",
        requiredSecrets: [
          "DIMPRO_DRIVE_S3_ENDPOINT",
          "DIMPRO_DRIVE_S3_REGION",
          "DIMPRO_DRIVE_S3_BUCKET",
          "DIMPRO_DRIVE_S3_ACCESS_KEY_ID",
          "DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY",
        ],
        notes: [
          "S3-kompatibilis klienssel beköthető.",
          "A desktop kliens nem ismerheti a titkos kulcsokat.",
          "A szerver készít signed upload/download engedélyt vagy proxyzott feltöltést.",
        ],
      },
      {
        id: "backblaze-b2",
        role: "backup-storage",
        label: "Backblaze B2",
        recommendedFor: "Másodlagos backup / disaster recovery tárhely.",
        status: "planned",
        requiredSecrets: [
          "DIMPRO_DRIVE_BACKUP_B2_KEY_ID",
          "DIMPRO_DRIVE_BACKUP_B2_APPLICATION_KEY",
          "DIMPRO_DRIVE_BACKUP_B2_BUCKET",
        ],
        notes: [
          "Első körben nem aktív, backup irányként dokumentált.",
          "Élesítés előtt visszaállítási próbát kell végezni.",
        ],
      },
      {
        id: "hetzner-storage-box",
        role: "archive-storage",
        label: "Hetzner Storage Box",
        recommendedFor: "Egyszerű szerveroldali backup / archív másolat.",
        status: "planned",
        requiredSecrets: [
          "DIMPRO_DRIVE_STORAGE_BOX_HOST",
          "DIMPRO_DRIVE_STORAGE_BOX_USER",
          "DIMPRO_DRIVE_STORAGE_BOX_PASSWORD_OR_KEY",
        ],
        notes: [
          "Indulásnál backup opcióként használható.",
          "Nem helyettesíti a jogosultságkezelt projektfájltárat.",
        ],
      },
    ],
    objectKeyTemplate:
      "workspaces/{workspaceId}/projects/{projectId}/{yyyy}/{mm}/{versionId}/{safeRelativePath}",
    requiredServerEnv: [
      "DIMPRO_DRIVE_STORAGE_MODE=plan|local-dev|s3",
      "DIMPRO_DRIVE_MAX_UPLOAD_MB",
      "DIMPRO_DRIVE_S3_ENDPOINT",
      "DIMPRO_DRIVE_S3_BUCKET",
      "DIMPRO_DRIVE_S3_ACCESS_KEY_ID",
      "DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY",
    ],
    futureEndpoints: [
      "POST /api/drive/storage/signed-upload/init",
      "PUT  /api/drive/storage/signed-upload/[uploadId]/part",
      "POST /api/drive/storage/signed-upload/[uploadId]/complete",
      "POST /api/drive/storage/signed-download/init",
      "GET  /api/drive/storage/objects/[objectId]/audit",
    ],
  };
}
