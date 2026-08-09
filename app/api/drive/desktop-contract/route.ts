import { NextRequest, NextResponse } from "next/server";
import { isDriveApiAuthorized, unauthorizedDriveResponse } from "@/app/lib/drive/driveApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await isDriveApiAuthorized(request.headers);
  if (!auth.ok) {
    return NextResponse.json(unauthorizedDriveResponse(), { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    service: "DIMPRO Drive Desktop API Contract",
    version: "2026.08.02-projectgate-drive-quarantine-review-v041",
    mode: "desktop-client-contract-preview",
    clientId: auth.clientId,
    clientTargets: ["DIMPRO Drive Desktop", "DIMPRO Fájlműhely", "DIMPROVER webes admin előnézet"],
    auth: {
      currentModes: ["license-admin-header", "drive-dev-token"],
      productionDirection: "A végleges desktop kliens licenc tokennel és gépazonosítóval kér rövid életű Drive hozzáférési tokent.",
      requiredHeaders: [
        "x-dimpro-drive-client-id",
        "x-dimpro-license-admin-key vagy x-dimpro-drive-dev-token fejlesztői módban",
      ],
    },
    baseUrls: {
      adminPreview: "https://license.dimpro.hu",
      projectGate: "https://projektkapu.dimpro.hu",
      futureApp: "https://app.dimpro.hu",
    },
    projectGateDriveCore: {
      version: "0.3.0",
      state: "active",
      storageMode: "metadata-plus-private-object-storage",
      objectStorage: {
        version: "0.4.0",
        state: "storage-config-required",
        provider: "s3-compatible",
        databaseSchema: "active-0.4.0",
        objectWrites: "disabled-until-private-storage-config",
        secretLocation: "server-only",
        uploadStrategy: "short-lived-presigned-put",
        downloadStrategy: "short-lived-presigned-get",
        quarantineReview: {
          version: "0.4.1",
          state: "active-0.4.1",
          databaseSchema: "active-0.4.1",
          cleanupExecution: "storage-config-required",
          permission: "document.approve",
          reviewEndpoint: "POST /api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/review",
          cleanupEndpoint: "POST /api/projects/[projectId]/drive/storage/cleanup",
        },
      },
      projectList: "GET /api/projects",
      health: "GET /api/projects/[projectId]/drive/health",
      tree: "GET /api/projects/[projectId]/drive/tree",
      changes: "GET /api/projects/[projectId]/drive/changes?cursor=[sequence]",
      cursor: "POST /api/projects/[projectId]/drive/sync/cursor",
      objectUploadInit: "POST /api/projects/[projectId]/drive/uploads/init",
      objectUploadComplete: "POST /api/projects/[projectId]/drive/uploads/[uploadId]/complete",
      objectUploadAbort: "POST /api/projects/[projectId]/drive/uploads/[uploadId]/abort",
      objectDownloadInit: "POST /api/projects/[projectId]/drive/documents/[documentId]/download",
      note: "A Projektkapu DRIVE Core közös project_id-t, Project Core jogosultságot, rövid életű signed URL-t és monoton változáskurzort használ. A régi /api/drive fejlesztői előnézet kompatibilitási céllal megmarad.",
    },
    endpoints: {
      health: {
        method: "GET",
        path: "/api/drive/health",
        purpose: "API és auth állapot ellenőrzése.",
      },
      projects: {
        method: "GET",
        path: "/api/drive/projects",
        purpose: "Elérhető Drive projektek listázása.",
      },
      files: {
        method: "GET",
        path: "/api/drive/projects/[projectId]/files",
        purpose: "Projekt fájlmetadata listázása.",
      },
      uploadInit: {
        method: "POST",
        path: "/api/drive/projects/[projectId]/upload/init",
        body: {
          fileName: "string",
          relativePath: "string",
          fileSizeBytes: "number",
          mimeType: "string",
        },
        purpose: "Upload session létrehozása.",
      },
      uploadChunk: {
        method: "PUT",
        path: "/api/drive/uploads/[uploadId]/chunk",
        headers: {
          "x-dimpro-drive-chunk-index": "0 alapú chunk index",
        },
        body: "binary vagy fejlesztői szöveges chunk",
        purpose: "Chunk feltöltése az upload sessionhöz.",
      },
      uploadComplete: {
        method: "POST",
        path: "/api/drive/uploads/[uploadId]/complete",
        purpose: "Upload session lezárása és metadata/receipt létrehozása.",
      },
      downloadInit: {
        method: "POST",
        path: "/api/drive/files/[fileId]/download/init",
        purpose: "Letöltési session előkészítése. MVP-ben még nem ad valós signed URL-t.",
      },
      storagePlan: {
        method: "GET",
        path: "/api/drive/storage-plan",
        purpose: "Tárhely/provider terv megjelenítése.",
      },
      uploadSessions: {
        method: "GET",
        path: "/api/drive/uploads/sessions",
        purpose: "Fejlesztői upload session lista / diagnosztika.",
      },
      cleanupPlan: {
        method: "GET",
        path: "/api/drive/uploads/cleanup-plan",
        purpose: "Fejlesztői staging/cleanup előkészítés.",
      },
    },
    workflows: {
      projectGateManualSync: [
        "GET /api/projects",
        "GET /api/projects/[projectId]/drive/health",
        "GET /api/projects/[projectId]/drive/tree",
        "GET /api/projects/[projectId]/drive/changes?cursor=[lastCursor]",
        "POST /api/projects/[projectId]/drive/uploads/init",
        "PUT a signedUpload.url címre közvetlenül a privát objektumtárhelyre",
        "POST /api/projects/[projectId]/drive/uploads/[uploadId]/complete",
        "POST /api/projects/[projectId]/drive/documents/[documentId]/download",
        "GET a rövid életű download.url címről a desktop cache-be",
        "POST /api/projects/[projectId]/drive/sync/cursor",
      ],
      startup: [
        "GET /api/drive/health",
        "GET /api/drive/projects",
        "GET /api/drive/projects/[projectId]/files",
      ],
      manualUpload: [
        "Új kliens: POST /api/projects/[projectId]/drive/uploads/init",
        "Új kliens: PUT a visszakapott signedUpload.url címre",
        "Új kliens: POST /api/projects/[projectId]/drive/uploads/[uploadId]/complete",
        "Legacy preview: /api/drive/projects/[projectId]/upload/init és chunk endpointok",
      ],
      manualDownload: [
        "POST /api/projects/[projectId]/drive/documents/[documentId]/download",
        "GET a rövid életű signed URL címről a desktop cache-be",
        "SHA-256 ellenőrzés csak akkor kötelező, ha a dokumentumverzióhoz hiteles checksum tartozik",
      ],
    },
    limits: {
      maxDevChunkBytes: 10 * 1024 * 1024,
      productionChunkDirection: "Később konfigurálható chunk méret, retry, checksum és megszakított feltöltés folytatása szükséges.",
      currentStorageMode: "core-metadata-active/object-storage-pre-activation",
    },
    desktopClientRules: [
      "A desktop kliens ne tároljon admin kulcsot.",
      "A fejlesztői dev token csak átmeneti tesztre használható.",
      "Éles működésben a kliens licencellenőrzés után rövid életű Drive access tokent kérjen.",
      "Minden feltöltési művelet naplózza a projektet, relatív útvonalat, fájlméretet, MIME típust, időpontot, clientId-t és eredményt.",
      "A helyi fájlrendszerben módosított állományt először staging állapotként kell kezelni, csak complete után jelenjen meg végleges metadata rekordként.",
    ],
  });
}
