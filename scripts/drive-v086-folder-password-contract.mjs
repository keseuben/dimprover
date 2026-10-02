import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const sql = read("supabase/migrations/20261002_drive_folder_password_v086.sql");
const schema = read("app/lib/drive-core/schema.ts");
const crypto = read("app/lib/drive-core/folderPasswordCrypto.ts");
const session = read("app/lib/drive-core/folderPasswordSession.ts");
const repo = read("app/lib/drive-core/folderPasswordRepository.ts");
const access = read("app/lib/drive-core/folderAccess.ts");
const passwordRoute = read("app/api/projects/[projectId]/drive/folders/[folderId]/password/route.ts");
const unlockRoute = read("app/api/projects/[projectId]/drive/folders/[folderId]/password/unlock/route.ts");
const dbRepo = read("app/lib/drive-core/databaseRepository.ts");
const workspace = read("components/drive/DriveWorkspace.tsx");
const grid = read("components/drive/FileGridPanel.tsx");
const tree = read("components/drive/FolderTreePanel.tsx");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("schema marker advances to 0.8.6 migration 7", () => {
  assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.8\.6"/);
  assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 7/);
  assert.match(schema, /drive-core-v086-folder-password-gate-20261002/);
});
check("health schema includes password tables without selecting password hash", () => {
  assert.match(schema, /"drive_core_folder_passwords"/);
  assert.match(schema, /"drive_core_folder_password_attempts"/);
  const passwordSelect = schema.match(/drive_core_folder_passwords:\s*"([^"]+)"/)?.[1] || "";
  assert.ok(passwordSelect);
  assert.doesNotMatch(passwordSelect, /password_hash/);
});
check("migration requires exact V084 predecessor", () => {
  assert.match(sql, /0\.8\.4[\s\S]*?migration_count = 6[\s\S]*?drive-core-v084-metadata-controls-20261002/);
});
check("password table stores hash and version but never plaintext password", () => {
  assert.match(sql, /password_hash text not null/);
  assert.match(sql, /password_version integer not null default 1/);
  assert.doesNotMatch(sql, /password_plain|plain_password|plaintext_password/i);
});
check("password change increments password version", () => {
  assert.match(sql, /password_version = public\.drive_core_folder_passwords\.password_version \+ 1/);
});
check("password tables have RLS and direct anon authenticated access revoked", () => {
  assert.match(sql, /alter table public\.drive_core_folder_passwords enable row level security/);
  assert.match(sql, /alter table public\.drive_core_folder_password_attempts enable row level security/);
  assert.match(sql, /revoke all on public\.drive_core_folder_passwords from anon, authenticated/);
  assert.match(sql, /revoke all on public\.drive_core_folder_password_attempts from anon, authenticated/);
});
check("default brute-force policy is five attempts and fifteen minute lockout", () => {
  assert.match(sql, /max_attempts integer not null default 5/);
  assert.match(sql, /lockout_minutes integer not null default 15/);
  assert.match(sql, /v_count >= v_password\.max_attempts/);
  assert.match(sql, /make_interval\(mins => v_password\.lockout_minutes\)/);
});
check("set clear lockout and unlock events are audited", () => {
  for (const event of [
    "DRIVE_FOLDER_PASSWORD_SET",
    "DRIVE_FOLDER_PASSWORD_CLEARED",
    "DRIVE_FOLDER_PASSWORD_LOCKOUT",
    "DRIVE_FOLDER_PASSWORD_UNLOCKED",
  ]) assert.match(sql, new RegExp(event));
});
check("password hash uses scrypt random salt and timing safe comparison", () => {
  assert.match(crypto, /randomBytes\(16\)/);
  assert.match(crypto, /scryptSync/);
  assert.match(crypto, /timingSafeEqual/);
  assert.match(crypto, /scrypt-v1/);
});
check("password length is bounded", () => {
  assert.match(crypto, /password\.length < 8 \|\| password\.length > 128/);
});
check("unlock token is HMAC signed with server secret", () => {
  assert.match(crypto, /createHmac\("sha256", serverSecret\(\)\)/);
  assert.match(crypto, /DRIVE_FOLDER_UNLOCK_SECRET/);
  assert.match(crypto, /DIMPRO_ACCESS_HASH_PEPPER/);
});
check("unlock grant binds project folder password version and expiry", () => {
  for (const field of ["projectId","folderId","passwordVersion","expiresAt"]) assert.match(crypto, new RegExp(field));
});
check("unlock cookie is HttpOnly secure-compatible same-site and API scoped", () => {
  assert.match(session, /httpOnly: true/);
  assert.match(session, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(session, /sameSite: "lax"/);
  assert.match(session, /path: "\/api\/projects"/);
});
check("repository public config whitelists safe fields and strips password hash", () => {
  assert.match(repo, /Omit<DriveFolderPasswordRecord, "passwordHash">/);
  assert.match(repo, /function safeConfig\(row: DriveFolderPasswordRecord\)/);
  for (const field of ["projectId","folderId","passwordVersion","unlockTtlMinutes","maxAttempts","lockoutMinutes","createdBy","updatedBy","createdAt","updatedAt"]) {
    assert.match(repo, new RegExp(field + ": row\." + field));
  }
  const safeBlock = repo.match(/function safeConfig[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(safeBlock, /passwordHash/);
});
check("password hash stays server-only and API returns safe config", () => {
  assert.match(repo, /getDriveFolderPasswordRecord/);
  assert.match(repo, /password_hash/);
  assert.match(repo, /import "server-only"/);
  assert.match(passwordRoute, /publicDriveFolderPasswordConfig\(record\)/);
  assert.doesNotMatch(passwordRoute, /NextResponse\.json\([\s\S]{0,160}passwordHash/);
});
check("ACL access stays separate from password access", () => {
  assert.match(access, /requireDriveFolderAclAccess/);
  assert.match(access, /requireDriveFolderAccess[\s\S]*?requireDriveFolderAclAccess/);
});
check("password gate cannot grant access denied by ACL", () => {
  assert.match(access, /const accessible = await resolveAccessibleDriveFolderIds/);
  assert.match(access, /if \(!accessible\.has\(folderId\)\) notFoundFolder\(\)/);
});
check("locked folder remains enumerable while locked descendants are hidden", () => {
  assert.match(access, /lockedGate\(folderId, false\)/);
  assert.match(access, /visibleFolderIds\.add\(folderId\)/);
  assert.match(access, /lockedGate\(folderId, true\)/);
  assert.match(access, /contentAccessibleFolderIds\.add\(folderId\)/);
});
check("tree uses separate visible-folder and content-access sets", () => {
  assert.match(dbRepo, /documentAccessibleFolderIds\?: ReadonlySet<string>/);
  assert.match(dbRepo, /const contentFolderIds = documentAccessibleFolderIds \|\| visibleFolderIds/);
  assert.match(access, /passwordVisibility\.visibleFolderIds/);
  assert.match(access, /passwordVisibility\.contentAccessibleFolderIds/);
});
check("direct document access is password gated", () => {
  assert.match(access, /requireDriveDocumentAccess[\s\S]*?getDriveFolderPasswordGateStatus/);
  assert.match(access, /if \(status\.locked\) passwordRequired/);
});
check("direct folder access is password gated with HTTP 423", () => {
  assert.match(access, /DRIVE_FOLDER_PASSWORD_REQUIRED/);
  assert.match(access, /423/);
});
check("PASSWORD visual state overrides ACL visual state", () => {
  assert.match(access, /passwordFolderIds\.has\(folder\.id\)[\s\S]*?states\.set\(folder\.id, "PASSWORD"\)/);
});
check("password config mutation requires project update", () => {
  assert.match(passwordRoute, /requireProjectPermission\(request, projectId, "project\.update"\)/);
});
check("password status and unlock require project read plus folder ACL", () => {
  assert.match(passwordRoute, /requireProjectPermission\(request, projectId, "project\.read"\)/);
  assert.match(unlockRoute, /requireProjectPermission\(request, projectId, "project\.read"\)/);
  assert.match(unlockRoute, /requireDriveFolderAclAccess/);
});
check("unlock enforces persisted lockout before password check", () => {
  assert.match(unlockRoute, /getDriveFolderPasswordAttemptState/);
  assert.match(unlockRoute, /if \(attempt\.locked\)/);
});
check("wrong password increments server-side failure counter", () => {
  assert.match(unlockRoute, /recordDriveFolderPasswordFailure/);
  assert.match(unlockRoute, /DRIVE_FOLDER_PASSWORD_INVALID/);
});
check("successful unlock records audit before signing cookie", () => {
  const auditIndex = unlockRoute.indexOf("await recordDriveFolderPasswordUnlock");
  const signIndex = unlockRoute.indexOf("const token = signDriveFolderUnlockToken");
  assert.ok(auditIndex >= 0 && signIndex >= 0 && auditIndex < signIndex);
});
check("workspace uses central password-aware folder selection", () => {
  assert.match(workspace, /function selectFolder\(folderId: string\)/);
  assert.match(workspace, /folder\.securityState === "PASSWORD" && !folder\.passwordUnlocked/);
  assert.match(workspace, /openFolderPasswordUnlockDialog/);
});
check("workspace includes password manage set clear and recovery UX", () => {
  assert.match(workspace, /Mappavédelem/);
  assert.match(workspace, /Védelem kezelése/);
  assert.match(workspace, /Védelem törlése/);
  assert.match(workspace, /saveFolderPasswordProtection/);
  assert.match(workspace, /clearFolderPasswordProtection/);
});
check("workspace password fields use password input and no client persistence", () => {
  assert.match(workspace, /type="password"/);
  assert.doesNotMatch(workspace, /localStorage[\s\S]{0,120}password/i);
  assert.doesNotMatch(workspace, /sessionStorage[\s\S]{0,120}password/i);
});
check("password visuals expose locked and unlocked session state", () => {
  assert.match(grid, /folder\.passwordUnlocked/);
  assert.match(tree, /folder\.passwordUnlocked/);
  assert.match(grid, /feloldva ebben a munkamenetben/);
  assert.match(tree, /feloldás szükséges/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.6 Folder Password Gate",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
