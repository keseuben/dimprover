import fs from "node:fs";
import assert from "node:assert/strict";

const files = {
  ticket: fs.readFileSync(new URL("../app/lib/drive/openTicketStore.ts", import.meta.url), "utf8"),
  issue: fs.readFileSync(new URL("../app/api/projects/[projectId]/drive/documents/[documentId]/open-ticket/route.ts", import.meta.url), "utf8"),
  redeem: fs.readFileSync(new URL("../app/api/drive/desktop-open/redeem/route.ts", import.meta.url), "utf8"),
  storageRepo: fs.readFileSync(new URL("../app/lib/drive-core/storageRepository.ts", import.meta.url), "utf8"),
  storageService: fs.readFileSync(new URL("../app/lib/drive-core/storageService.ts", import.meta.url), "utf8"),
  proxy: fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8"),
  workspace: fs.readFileSync(new URL("../components/drive/DriveWorkspace.tsx", import.meta.url), "utf8"),
  toolbar: fs.readFileSync(new URL("../components/drive/DriveToolbar.tsx", import.meta.url), "utf8"),
  handler: fs.readFileSync(new URL("./dimpro-drive-desktop-open-handler-v018.ps1", import.meta.url), "utf8"),
  manager: fs.readFileSync(new URL("./dimpro-drive-desktop-open-handler-manager-v018.ps1", import.meta.url), "utf8"),
};

let pass = 0;
function check(name, fn) {
  try { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

check("opaque 256-bit open ticket", () => assert.match(files.ticket, /randomBytes\(32\)\.toString\("base64url"\)/));
check("ticket stored by SHA-256 hash, not raw token", () => {
  assert.match(files.ticket, /createHash\("sha256"\)\.update\(token/);
  assert.match(files.ticket, /ticketPath\(activeRoot\(\), hash\)/);
  assert.doesNotMatch(files.ticket, /ticketPath\(activeRoot\(\), token\)/);
});
check("open ticket default TTL is 90 seconds and hard bounded", () => {
  assert.match(files.ticket, /DEFAULT_TTL_MS = 90_000/);
  assert.match(files.ticket, /MAX_TTL_MS = 180_000/);
});
check("ticket consumption is atomic one-time rename", () => assert.match(files.ticket, /await rename\(active, consumed\)/));
check("ticket replay returns unavailable", () => assert.match(files.ticket, /DRIVE_OPEN_TICKET_UNAVAILABLE/));
check("browser issue requires document.read", () => assert.match(files.issue, /requireProjectPermission\(request, projectId, "document\.read"\)/));
check("browser issue only supports WORKFILE mode", () => assert.match(files.issue, /body\.mode !== "WORKFILE"/));
check("browser issue requires version SHA-256", () => assert.match(files.issue, /DRIVE_OPEN_VERSION_SHA256_REQUIRED/));
check("protocol URL contains opaque ticket only", () => {
  assert.match(files.issue, /dimpro-drive:\/\/open-file\?ticket=/);
  assert.doesNotMatch(files.issue, /protocolUrl:[^\n]*server=/);
});
check("desktop redeem requires desktop-access before consuming ticket", () => {
  const auth = files.redeem.indexOf('driveAuth.mode !== "desktop-access"');
  const consume = files.redeem.indexOf("await consumeDriveOpenTicket");
  assert.ok(auth >= 0 && consume > auth);
});
check("redeem rechecks project document.read", () => assert.match(files.redeem, /requireProjectPermission\(request, ticket\.projectId, "document\.read"\)/));
check("redeem preserves server-issued web actor for download audit", () => assert.match(files.redeem, /actorUserId: ticket\.actorUserId/));
check("DEV does not pretend dpat1 has canonical user binding", () => {
  assert.doesNotMatch(files.redeem, /userAliases\.includes\(ticket\.actorUserId\)/);
  assert.match(files.redeem, /device ↔ canonical DIMPRO user binding/);
});
check("redeem uses normal security-gated download initializer", () => assert.match(files.redeem, /initDriveObjectDownload/));
check("download record exposes SHA-256", () => {
  assert.match(files.storageRepo, /size_bytes,sha256,storage_provider/);
  assert.match(files.storageRepo, /sha256: version\.sha256/);
  assert.match(files.storageService, /sha256: record\.version\.sha256/);
});
check("proxy allows only exact desktop open redeem own-auth route", () => assert.match(files.proxy, /pathname === "\/api\/drive\/desktop-open\/redeem"/));
check("web Windows action creates open ticket", () => assert.match(files.workspace, /\/open-ticket/));
check("web explicitly states partial workfile semantics", () => assert.match(files.workspace, /nem teljes Drive-szinkronizálás/));
check("toolbar has explicit Windows open action", () => {
  assert.match(files.toolbar, /onOpenWindowsSelected/);
  assert.match(files.toolbar, /Megnyitás Windowsban/);
});
check("handler uses existing Bridge DPAPI token", () => {
  assert.match(files.handler, /DIMPRO\\BenjAdminBridge\\device-token\.dpapi/);
  assert.match(files.handler, /ProtectedData\]::Unprotect/);
});
check("handler exchanges Bridge token for short-lived Desktop access", () => assert.match(files.handler, /\/api\/drive\/desktop-access\/token/));
check("handler redeems one-time open ticket", () => assert.match(files.handler, /\/api\/drive\/desktop-open\/redeem/));
check("URI cannot override configured server", () => assert.match(files.handler, /DRIVE_DESKTOP_URI_SERVER_OVERRIDE_DENIED/));
check("DEV handler only trusts exact Drive DEV host", () => {
  assert.match(files.handler, /hostName -ne 'drive\.dev\.dimpro\.hu'/);
  assert.match(files.manager, /hostName -ne 'drive\.dev\.dimpro\.hu'/);
});
check("user-selected workfiles root is explicit", () => {
  assert.match(files.handler, /Select-WorkFilesRoot/);
  assert.match(files.handler, /workFilesRoot/);
  assert.match(files.handler, /PARTIAL_WORKFILES_NOT_SYNC/);
});
check("no Drive tree mirror; only shallow project workfile bucket", () => {
  assert.match(files.handler, /DIMPRO MUNKAFÁJLOK/);
  assert.doesNotMatch(files.handler, /DriveFolderPath|remoteRelativePath|mirrorDriveTree/);
});
check("path traversal is denied", () => assert.match(files.handler, /DRIVE_DESKTOP_WORKFILE_PATH_ESCAPE_DENIED/));
check("download requires exact SHA-256", () => {
  assert.match(files.handler, /DRIVE_DESKTOP_EXPECTED_SHA256_REQUIRED/);
  assert.match(files.handler, /DRIVE_DESKTOP_DOWNLOAD_SHA256_MISMATCH/);
});
check("download size is verified", () => assert.match(files.handler, /DRIVE_DESKTOP_DOWNLOAD_SIZE_MISMATCH/));
check("local modification is never overwritten", () => {
  assert.match(files.handler, /stateLabel = 'LOCAL_MODIFIED'/);
  assert.match(files.handler, /nem írta felül/);
  assert.match(files.handler, /DRIVE_DESKTOP_LOCAL_FILE_CHANGED_DURING_DOWNLOAD/);
});
check("clean prior local copy may receive newer server version", () => assert.match(files.handler, /localSha -eq \$baseServerSha/));

check("local edit preserves baseline separately from latest remote hash", () => {
  assert.match(files.handler, /remoteSha256 = \$expectedSha/);
  assert.match(files.handler, /baseServerSha256 = if \(\$stateLabel -eq 'LOCAL_MODIFIED'/);
});
check("workfiles are never auto-deleted", () => {
  assert.match(files.handler, /autoDelete = \$false/);
  assert.match(files.handler, /fullDriveSync = \$false/);
});
check("Windows default file association launches workfile", () => assert.match(files.handler, /Start-Process -FilePath \$targetPath/));
check("protocol registration is per-user HKCU", () => {
  assert.match(files.manager, /HKCU:\\Software\\Classes\\dimpro-drive/);
  assert.doesNotMatch(files.manager, /HKLM:/);
});
check("manager preserves user workfiles on uninstall", () => assert.match(files.manager, /munkafájljai érintetlenek maradtak/));

if (!process.exitCode) {
  console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive Desktop V0.1.8 Windows Open Handler", pass, fail: 0, productionAccess: "DENY" }, null, 2));
}
