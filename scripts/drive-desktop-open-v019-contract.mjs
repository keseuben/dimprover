import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  ticket: read("app/lib/drive/openTicketStore.ts"),
  issue: read("app/api/projects/[projectId]/drive/documents/[documentId]/open-ticket/route.ts"),
  redeem: read("app/api/drive/desktop-open/redeem/route.ts"),
  workspace: read("components/drive/DriveWorkspace.tsx"),
  toolbar: read("components/drive/DriveToolbar.tsx"),
  css: read("components/drive/DriveWorkspace.module.css"),
  handler: read("scripts/dimpro-drive-desktop-open-handler-v019.ps1"),
  manager: read("scripts/dimpro-drive-desktop-open-handler-manager-v019.ps1"),
  installer: read("scripts/DIMPRO_Drive_Desktop_Install_V019.cmd"),
  uninstaller: read("scripts/DIMPRO_Drive_Desktop_Uninstall_V019.cmd"),
};
const packagePath = "public/downloads/DIMPRO_Drive_Desktop_V019_WINDOWS_DEV.zip";

let pass = 0;
function check(name, fn) {
  try { fn(); pass += 1; console.log("PASS " + String(pass).padStart(2, "0") + " " + name); }
  catch (error) { console.error("FAIL " + name + ": " + error.message); process.exitCode = 1; }
}

check("open ticket remains opaque 256-bit random capability", () => assert.match(files.ticket, /randomBytes\(32\)\.toString\("base64url"\)/));
check("open ticket remains SHA-256 hashed at rest", () => {
  assert.match(files.ticket, /createHash\("sha256"\)\.update\(token/);
  assert.doesNotMatch(files.ticket, /ticketPath\(activeRoot\(\), token\)/);
});
check("open ticket remains short lived", () => {
  assert.match(files.ticket, /DEFAULT_TTL_MS = 90_000/);
  assert.match(files.ticket, /MAX_TTL_MS = 180_000/);
});
check("open ticket remains atomic one-time", () => assert.match(files.ticket, /await rename\(active, consumed\)/));
check("V0.1.9 ticket schema binds canonical actor aliases", () => {
  assert.match(files.ticket, /OPEN_TICKET_SCHEMA_VERSION = 2/);
  assert.match(files.ticket, /actorUserAliases: string\[\]/);
  assert.match(files.issue, /actorUserAliases: access\.actor\.userAliases/);
});
check("browser still requires document.read before ticket issue", () => assert.match(files.issue, /requireProjectPermission\(request, projectId, "document\.read"\)/));
check("redeem no longer depends on BENJADMIN desktop-access token", () => {
  assert.doesNotMatch(files.redeem, /isDriveApiAuthorized/);
  assert.doesNotMatch(files.redeem, /driveAuth\.mode/);
  assert.doesNotMatch(files.redeem, /DRIVE_DESKTOP_OPEN_AUTH_REQUIRED/);
});
check("redeem rechecks current canonical project access from ticket actor aliases", () => {
  assert.match(files.redeem, /getProjectAccess\(ticket\.projectId, ticket\.actorUserAliases\)/);
  assert.match(files.redeem, /access\.permissions\.includes\("document\.read"\)/);
  assert.match(files.redeem, /DRIVE_DESKTOP_OPEN_PERMISSION_REVOKED/);
});
check("redeem preserves server-issued actor for download audit", () => assert.match(files.redeem, /actorUserId: ticket\.actorUserId/));
check("V0.1.9 handler has no BENJADMIN Bridge token dependency", () => {
  assert.doesNotMatch(files.handler, /BenjAdminBridge|device-token\.dpapi|ProtectedData|desktop-access\/token/);
  assert.match(files.handler, /Get-DriveOpenHeaders/);
  assert.match(files.handler, /\/api\/drive\/desktop-open\/redeem/);
});
check("handler still enforces exact DEV host", () => assert.match(files.handler, /hostName -ne 'drive\.dev\.dimpro\.hu'/));
check("handler still denies URI server override", () => assert.match(files.handler, /DRIVE_DESKTOP_URI_SERVER_OVERRIDE_DENIED/));
check("handler still SHA-256 verifies downloads", () => {
  assert.match(files.handler, /DRIVE_DESKTOP_EXPECTED_SHA256_REQUIRED/);
  assert.match(files.handler, /DRIVE_DESKTOP_DOWNLOAD_SHA256_MISMATCH/);
});
check("handler still protects local modifications", () => {
  assert.match(files.handler, /stateLabel = 'LOCAL_MODIFIED'/);
  assert.match(files.handler, /nem írta felül/);
  assert.match(files.handler, /DRIVE_DESKTOP_LOCAL_FILE_CHANGED_DURING_DOWNLOAD/);
});
check("manager registers per-user HKCU protocol only", () => {
  assert.match(files.manager, /HKCU:\\Software\\Classes\\dimpro-drive/);
  assert.doesNotMatch(files.manager, /HKLM:/);
});
check("manager self-check no longer requires Bridge token", () => {
  assert.doesNotMatch(files.manager, /bridgeTokenPresent|BenjAdminBridge/);
  assert.match(files.manager, /commandTargetsHandler/);
});
check("web exposes persistent Drive Desktop download action", () => {
  assert.match(files.toolbar, /Drive Desktop letöltése/);
  assert.match(files.workspace, /DIMPRO_Drive_Desktop_V019_WINDOWS_DEV\.zip/);
});
check("first Windows open is gated by install guidance before ticket issue", () => {
  assert.match(files.workspace, /DRIVE_DESKTOP_FIRST_USE_ACK_KEY/);
  assert.match(files.workspace, /DIMPRO Drive Desktop szükséges/);
  assert.match(files.workspace, /Telepítve van – megnyitás/);
  const gate = files.workspace.indexOf("desktopOpenAcknowledged()");
  const ticket = files.workspace.indexOf('"/open-ticket"');
  assert.ok(gate >= 0 && ticket > gate);
});
check("first-use acknowledgement is local browser state only", () => {
  assert.match(files.workspace, /window\.localStorage\.getItem/);
  assert.match(files.workspace, /window\.localStorage\.setItem/);
});
check("first-use panel explains partial workfile semantics", () => {
  assert.match(files.workspace, /Drive teljes tartalma nem szinkronizálódik/);
  assert.match(files.css, /desktopOpenPromptSteps/);
});
check("installer uses Windows PowerShell and manager Install mode", () => {
  assert.match(files.installer, /powershell\.exe -NoProfile -ExecutionPolicy Bypass/);
  assert.match(files.installer, /open-handler-manager-v019\.ps1" -Mode Install/);
});
check("uninstaller preserves manager-controlled uninstall path", () => assert.match(files.uninstaller, /open-handler-manager-v019\.ps1" -Mode Uninstall/));
check("downloadable Windows package exists", () => {
  const stat = fs.statSync(packagePath);
  assert.ok(stat.isFile() && stat.size > 1000);
});
check("PROD remains denied in installer package", () => assert.match(files.installer, /PROD DENY/));

if (!process.exitCode) {
  console.log(JSON.stringify({ ok: true, contract: "DIMPRO Drive Desktop V0.1.9 Windows Open", pass, fail: 0, productionAccess: "DENY" }, null, 2));
}
