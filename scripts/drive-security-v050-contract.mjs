import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const files={
 service:read("app/lib/drive-core/securityScanService.ts"),
 repo:read("app/lib/drive-core/securityScanRepository.ts"),
 review:read("app/lib/drive-core/reviewService.ts"),
 storage:read("app/lib/drive-core/storageService.ts"),
 complete:read("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts"),
 route:read("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/security-scan/route.ts"),
 health:read("app/api/projects/[projectId]/drive/health/route.ts"),
 ui:read("components/project-gate/DriveWorkspace.tsx"),
 standalone:read("components/drive/DriveWorkspace.tsx"),
 details:read("components/drive/DetailsPanel.tsx"),
 clientTypes:read("components/drive/driveTypes.ts"),
 types:read("app/lib/drive-core/types.ts"),
};
let pass=0,fail=0; const check=(n,v)=>{if(v){pass++;console.log(`PASS ${n}`)}else{fail++;console.error(`FAIL ${n}`)}};
check("Security scan státuszok",["PENDING","SCANNING","CLEAN","INFECTED","ERROR"].every(x=>files.types.includes(`\"${x}\"`)));
check("Shared DROP ClamAV engine reuse",files.service.includes('from "@/app/lib/drop/worker/clamdInstream"'));
check("DROP worker secret nincs Drive-függőségben",!files.service.includes("getDropWorkerConfig"));
check("Drive scanner külön env override",files.service.includes("DIMPRO_DRIVE_VIRUS_SCANNER_COMMAND")&&files.service.includes("DIMPRO_DRIVE_CLAMD_SOCKET"));
check("DROP scanner env fallback",files.service.includes("DIMPRO_DROP_VIRUS_SCANNER_COMMAND")&&files.service.includes("DIMPRO_DROP_CLAMD_SOCKET"));
check("Clamd INSTREAM scan",files.service.includes("scanAsyncIterableWithClamd"));
check("Scanner health PONG",files.service.includes("getClamdHealth")&&files.service.includes('health.ping === "PONG"'));
check("S3 stream közvetlen scan",files.service.includes("getDriveObjectStream"));
check("Méret integritás gate",files.service.includes("DRIVE_SECURITY_SIZE_MISMATCH"));
check("SHA-256 integritás gate",files.service.includes("DRIVE_SECURITY_HASH_MISMATCH"));
check("Fertőzött automatikus reject",files.service.includes('action: "REJECT"')&&files.service.includes("Automatikus biztonsági elutasítás"));
check("Scanner error fail-closed",files.service.includes('status: "ERROR"')&&files.service.includes("DRIVE_SECURITY_SCANNER_FAILED"));
check("Scan audit upload metadata",files.repo.includes("driveSecurityScan"));
check("Scan session FINALIZED kötés",files.repo.includes('eq("status", "FINALIZED")'));
check("Scan versionhez kötött",files.repo.includes("finalized_version_id"));
check("Csak QUARANTINED scan",files.repo.includes("DRIVE_SECURITY_VERSION_NOT_QUARANTINED"));
check("Csak S3 objektum scan",files.repo.includes("DRIVE_SECURITY_STORAGE_REFERENCE_MISSING"));
check("Scan attempt számláló",files.repo.includes("currentAttempt + 1"));
check("CLEAN approval gate",files.repo.includes("DRIVE_REVIEW_SECURITY_SCAN_REQUIRED")&&files.review.includes("requireDriveCleanSecurityScan"));
check("Approval hash gate",files.repo.includes("DRIVE_REVIEW_SECURITY_HASH_MISMATCH"));
check("REJECT scan nélkül is lehetséges",files.review.includes('if (action === "APPROVE")'));
check("WEB/DESKTOP mindig quarantine",files.storage.includes('const finalVersionStatus = "QUARANTINED" as const'));
check("AVAILABLE közvetlen active upload eltávolítva",!files.storage.includes('config.mode === "active" ? "AVAILABLE"'));
check("Upload complete automatikus scan",files.complete.includes("scanDriveQuarantinedVersion"));
check("Upload complete scan hiba nem veszíti el feltöltést",files.complete.includes("securityScan = {")&&files.complete.includes("DRIVE_SECURITY_SCAN_FAILED"));
check("Security scan GET",files.route.includes("export async function GET"));
check("Security scan POST",files.route.includes("export async function POST"));
check("Manual scan document.approve",files.route.includes('"document.approve"'));
check("Scan route maxDuration",files.route.includes("maxDuration = 300"));
check("Health security blokk",files.health.includes("security: {")&&files.health.includes('version: "0.5.0"'));
check("activationSafe scanner gate",files.health.includes("security.ready"));
check("Projectkapu ClamAV állapot",files.ui.includes("ClamAV vírusvédelem aktív"));
check("Projectkapu scan gomb",files.ui.includes("scanDocumentVersion")&&files.ui.includes("vírusellenőrzése"));
check("Jóváhagyás scanner nélkül tiltott",files.ui.includes("A jóváhagyás vírusellenőrző nélkül tiltott"));
check("Preview CLEAN release gate",files.storage.includes("requireDriveCleanSecurityScan")&&files.storage.includes("DRIVE_PREVIEW_NOT_AVAILABLE"));
check("Download CLEAN release gate",files.storage.includes("requireDriveCleanSecurityScan")&&files.storage.includes("DRIVE_DOWNLOAD_NOT_AVAILABLE"));
check("Trusted DROP archive scanner bypass",files.storage.includes("if (!trustedDropArchive)")&&files.storage.includes('record.documentSource === "DROP"'));
check("Standalone health security type",files.clientTypes.includes("security?: {")&&files.clientTypes.includes("scannerSource"));
check("Standalone canApprove",files.standalone.includes('effectivePermissions.includes("document.approve")'));
check("Standalone scanner readiness",files.standalone.includes("securityReady")&&files.standalone.includes("health?.security?.ready"));
check("Standalone upload auto-scan visszajelzés",files.standalone.includes("securityScan?.scan?.status")&&files.standalone.includes("ClamAV szerint tiszta"));
check("Standalone manuális security scan",files.standalone.includes("scanSelectedVersion")&&files.standalone.includes("/security-scan"));
check("Standalone review",files.standalone.includes("reviewSelectedVersion")&&files.standalone.includes("/review"));
check("Standalone Details security props",files.details.includes("securityReady")&&files.details.includes("onScan")&&files.details.includes("onReview"));
check("Standalone Details fail-closed szöveg",files.details.includes("A kiadás fail-closed tiltva"));
check("Standalone approve CLEAN workflow",files.details.includes("Vírusellenőrzés")&&files.details.includes("Jóváhagyás")&&files.details.includes("Elutasítás"));
check("Nincs raw secret Drive scannerben",!/(DROP_WORKER_SECRET|SUPABASE_SERVICE_ROLE_KEY\s*=|SECRET_ACCESS_KEY\s*=)/.test(files.service));
console.log(`SUMMARY ${pass}/${pass+fail} PASS`); if(fail)process.exit(1);
