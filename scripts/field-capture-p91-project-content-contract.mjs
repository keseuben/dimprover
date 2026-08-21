import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const content=read("app/lib/content-core/repository.ts");
const service=read("app/lib/field-capture/projectDriveService.ts");
const repo=read("app/lib/field-capture/serverRepository.ts");
const route=read("app/api/field-capture/sessions/[sessionId]/items/[itemId]/project-drive/route.ts");
const health=read("app/api/field-capture/health/route.ts");
const router=read("app/lib/field-capture/destinationRouter.ts");
const sync=read("app/lib/field-capture/clientSyncService.ts");
const pre=read("components/field-capture/CaptureSaveTargets.tsx");
const serverService=read("app/lib/field-capture/serverService.ts");
const checks=[
 ["Content Core project reference uses PROJECT ownership",content.includes('owner_type: "PROJECT"')&&content.includes("owner_project_id: input.projectId")&&content.includes("owner_user_id: null")],
 ["Project content reference is idempotent by canonical project source",content.includes("findProjectContentRef")&&content.includes("CONTENT_CORE_PROJECT_REF_OBJECT_MISMATCH")],
 ["P9.1 requires canonical Supabase Project Core",service.includes('projectCoreProvider === "supabase"')&&service.includes("canonicalProjectCore")],
 ["P9.1 requires a project-bound Field Capture session",service.includes("FIELD_CAPTURE_PROJECT_DRIVE_PROJECT_REQUIRED")&&service.includes("input.session.projectId")],
 ["P9.1 resolves canonical Project Core access from user id and email",service.includes("getProjectAccess(input.session.projectId, [input.userId, input.userEmail])")],
 ["P9.1 requires document.write",service.includes('access.permissions.includes("document.write")')&&service.includes("FIELD_CAPTURE_PROJECT_DRIVE_WRITE_DENIED")],
 ["P9.1 denies non-writable lifecycle states by allow-list",service.includes('new Set(["DRAFT", "ACTIVE", "CLOSING"])')&&service.includes("FIELD_CAPTURE_PROJECT_DRIVE_PROJECT_NOT_WRITABLE")],
 ["P9.1 requires SERVER_STORED source",service.includes('context.itemStatus !== "SERVER_STORED"')&&service.includes('context.asset.storageStatus !== "STORED"')],
 ["P9.1 requires clean virus-scanned Drop object",["upload_status","processing_status","security_status","virus_scan_status"].every(x=>service.includes(`dropFile.${x}`))],
 ["P9.1 reuses verified Drop to Drive copy",service.includes("copyDropObjectToDriveVerified")&&service.includes("expectedSha256: sha256")],
 ["P9.1 shares immutable content object by SHA256 and size",service.includes("findContentObjectByHash({ sha256, sizeBytes })")&&service.includes("content/sha256/")],
 ["P9.1 is PROJECT_ROOT only and refuses tree folder",service.includes('scope: "PROJECT_ROOT"')&&service.includes("FIELD_CAPTURE_PROJECT_DRIVE_TREE_NOT_READY")],
 ["Project destination requires PROJECT ownership",repo.includes('eq("target", "PROJECT_DRIVE")')&&repo.includes("FIELD_CAPTURE_PROJECT_DRIVE_OWNERSHIP_INVALID")],
 ["Project destination audit explicitly remains outside Drive tree",repo.includes('event_type: "PROJECT_DRIVE_CONTENT_STORED"')&&repo.includes("projectDriveTreeBound: false")],
 ["Project sync queue persists no raw token",repo.includes('operation: "SYNC_PROJECT_DRIVE_CONTENT"')&&repo.includes("rawTokenPersisted: false")],
 ["Project content route uses Send bearer auth",route.includes("authorizeFieldCaptureRequest(request)")],
 ["Project content route verifies Field Capture session ownership",route.includes("assertFieldCaptureSessionOwner")],
 ["Session creation still authorizes Send project before canonical binding",serverService.includes("resolveAuthorizedProjectCoreId")&&serverService.includes("context.projects.find")&&serverService.includes("canUploadToDrop")],
 ["Health exposes P9.1 foundation separately",health.includes("projectDriveContentBinding")&&health.includes("projectDriveContent")&&health.includes('projectDriveContentScope: "PROJECT_ROOT"')],
 ["P9 UI and full Project Drive binding remain disabled",health.includes("projectDriveUiEnabled: false")&&health.includes("projectDriveTreeBinding: false")&&health.includes("projectDriveBinding: false")&&router.includes('target: "PROJECT_DRIVE", enabled: options.saveToProjectDrive, ready: false')&&pre.includes("P9")&&!sync.includes('/project-drive')],
];
let n=0;for(const [name,ok] of checks){assert.ok(ok,name);console.log(`PASS ${++n}: ${name}`)}
console.log(`FIELD_CAPTURE_P91_PROJECT_CONTENT_CONTRACT ${n}/${checks.length} PASS`);
