import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const repo = read("app/lib/drive-core/securityBackfillRepository.ts");
const service = read("app/lib/drive-core/securityBackfillService.ts");
const route = read("app/api/projects/admin/drive-security-backfill/route.ts");
let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}`); }
}

check("V0.5.1 verziójel", repo.includes('"0.5.1"') && service.includes('"0.5.1"'));
check("Legacy AVAILABLE állapot", repo.includes('"LEGACY_AVAILABLE"'));
check("Backfill pending állapot", repo.includes('"BACKFILL_PENDING"'));
check("CLEAN approval pending állapot", repo.includes('"CLEAN_AWAITING_APPROVAL"'));
check("Csak S3 verziók", repo.includes('.eq("storage_provider", "S3")'));
check("AVAILABLE/QUARANTINED scope", repo.includes('.in("status", ["AVAILABLE", "QUARANTINED"])'));
check("Csak WEB/DESKTOP dokumentum", repo.includes('.in("source", ["WEB", "DESKTOP"])'));
check("FINALIZED upload session szükséges", repo.includes('.eq("status", "FINALIZED")'));
check("CLEAN csak egyező SHA-val compliant", repo.includes('validCleanAudit = status === "CLEAN" && securityHashMatch'));
check("CLEAN hash mismatch legacy jelölt", repo.includes('version.status === "AVAILABLE" && !validCleanAudit') && repo.includes("nem egyezik a hitelesített SHA-256"));
check("Hiányzó session unscannable", repo.includes("canScan") && repo.includes("FINALIZED upload session"));
check("Backfill marker", repo.includes("driveSecurityBackfill"));
check("Marker verzióstátusz váltás előtt", repo.indexOf("driveSecurityBackfill: marker") < repo.indexOf('.update({ status: "QUARANTINED" })'));
check("Compare-and-set AVAILABLE", repo.includes('.eq("status", "AVAILABLE")'));
check("Nem töröl legacy objektumot", !repo.includes("deleteDriveObject"));
check("Projekt audit", repo.includes("DRIVE_SECURITY_LEGACY_REQUARANTINED"));
check("Drive change event", repo.includes("SECURITY_LEGACY_REQUARANTINED"));
check("Audit idempotens", repo.includes("ignoreDuplicates: true"));
check("Service ugyanazt a ClamAV scan service-t hívja", service.includes("scanDriveQuarantinedVersion"));
check("Nincs automatikus APPROVE", !service.includes('action: "APPROVE"'));
check("CLEAN emberi jóváhagyásra vár", service.includes("cleanRequiresHumanApproval: true"));
check("Fertőzött auto reject megmarad", service.includes("infectedAutoReject: true"));
check("Fail closed jelölés", service.includes("failClosed: true"));
check("Batch limit max 10", service.includes("Math.min(10"));
check("Explicit scope kötelező", service.includes("DRIVE_SECURITY_BACKFILL_SCOPE_REQUIRED"));
check("Admin-only route", route.includes("isLicenseAdminAuthorized"));
check("GET dry-run terv", route.includes("export async function GET") && route.includes("execute: false"));
check("POST explicit execute", route.includes("body.execute === true"));
check("Kétlépcsős confirmation", route.includes("REQUARANTINE_LEGACY_DRIVE"));
check("Route execute scope kötelező", route.includes("!projectId && !versionIds.length"));
check("Route max batch 10", route.includes("Math.min(limit, 10)"));
check("Route maxDuration 300", route.includes("export const maxDuration = 300"));
check("Admin actor audit", route.includes("license-admin-drive-security-backfill"));
check("Nincs raw secret", !/(SUPABASE_SERVICE_ROLE_KEY\s*=|DIMPRO_LICENSE_ADMIN_KEY\s*=|password\s*[:=]\s*["'][^"']+)/i.test(`${repo}\n${service}\n${route}`));

console.log(`SUMMARY ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
