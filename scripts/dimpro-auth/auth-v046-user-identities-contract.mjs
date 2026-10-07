import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(file)=>readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");
const migration=read("db/auth/migrations/009_auth_v046_user_identities.sql");
const security=read("app/lib/dimpro-auth/security.ts");
const service=read("app/lib/dimpro-auth/user-identities.ts");
const repository=read("app/lib/dimpro-auth/repository.ts");
const route=read("app/api/dimpro-auth/identities/route.ts");
const verify=read("app/api/dimpro-auth/identities/verify/route.ts");
const projectRoute=read("app/api/projects/route.ts");
const dbRepo=read("app/lib/project-core/databaseRepository.ts");
const fileRepo=read("app/lib/project-core/fileRepository.ts");
const drive=read("components/drive/DriveShell.tsx");
const personal=read("components/drive/PersonalDriveWorkspace.tsx");
const dialog=read("components/drive/DriveIdentityDialog.tsx");
const projectList=read("components/project-gate/ProjectListClient.tsx");

const tests=[
  ["identity table is user-bound",()=>{assert.match(migration,/CREATE TABLE IF NOT EXISTS auth_user_identities/);assert.match(migration,/user_id uuid NOT NULL REFERENCES auth_users\(id\) ON DELETE CASCADE/)}],
  ["identity email is globally unique",()=>assert.match(migration,/auth_user_identities_email_uq[\s\S]*email_normalized/)],
  ["one primary identity per user",()=>assert.match(migration,/auth_user_identities_primary_uq[\s\S]*WHERE is_primary/)],
  ["existing primary emails are backfilled",()=>{assert.match(migration,/INSERT INTO auth_user_identities/);assert.match(migration,/FROM auth_users u/);assert.match(migration,/true,[\s\n]*u\.email_verified_at/)}],
  ["runtime cannot delete identities",()=>{assert.match(migration,/GRANT SELECT,INSERT ON TABLE public\.auth_user_identities/);assert.match(migration,/GRANT UPDATE \(identity_type,display_name,organization_name,status,verified_at,challenge_id,updated_at\)/);assert.doesNotMatch(migration,/GRANT DELETE/)}],
  ["dedicated OTP purpose exists",()=>assert.match(security,/DIMPRO_AUTH_PURPOSE_USER_IDENTITY = "USER_IDENTITY_VERIFY"/)],
  ["identity add rejects another account primary email",()=>assert.match(service,/FROM auth_users WHERE email_normalized=\$1 AND id<>\$2/)],
  ["identity add rejects another user linked email",()=>assert.match(service,/existing && existing\.user_id !== input\.userId/)],
  ["identity OTP is rate-limited and challenge-bound",()=>{assert.match(service,/AUTH_OTP_COOLDOWN/);assert.match(service,/AUTH_OTP_RATE_LIMIT/);assert.match(service,/DIMPRO_AUTH_PURPOSE_USER_IDENTITY/)}],
  ["identity verify is owner-scoped",()=>assert.match(service,/FROM auth_user_identities WHERE id=\$1 AND user_id=\$2/)],
  ["identity becomes usable only after verification",()=>{assert.match(service,/status='VERIFIED',verified_at=now\(\)/);assert.match(service,/WHERE user_id=\$1 AND status='VERIFIED'/)}],
  ["primary identity display name follows self profile name",()=>{assert.match(repository,/UPDATE auth_user_identities SET display_name=\$2,updated_at=now\(\) WHERE user_id=\$1 AND is_primary=true AND status<>'DISABLED'/)}],
  ["identity API requires active DIMPRO session",()=>{assert.match(route,/resolveProjectCoreAuth/);assert.match(verify,/resolveProjectCoreAuth/)}],
  ["identity mutations are same-origin",()=>{assert.match(route,/validateSameOriginMutation/);assert.match(verify,/validateSameOriginMutation/)}],
  ["work identity requires organization",()=>assert.match(route,/identityType === "WORK" && organizationName\.length < 2/)],
  ["project creation still requires personal Drive entitlement",()=>assert.match(projectRoute,/hasPersonalDriveAccess/)],
  ["project creation resolves selected identity by current user",()=>{assert.match(projectRoute,/getVerifiedAuthUserIdentity\(authResult\.actor\.userId, actingIdentityId \|\| null\)/);assert.match(projectRoute,/PROJECT_CREATE_IDENTITY_REQUIRED/)}],
  ["project creation rejects malformed identity ids before database lookup",()=>{assert.match(projectRoute,/PROJECT_CREATE_IDENTITY_INVALID/);assert.match(projectRoute,/\^\[0-9a-f\]\{8\}/i)}],
  ["project owner principal remains auth user",()=>{assert.match(dbRepo,/user_id: actor\.userId/);assert.match(fileRepo,/userId: actor\.userId/)}],
  ["project owner stores selected email and organization",()=>{assert.match(dbRepo,/email: normalizeText\(actor\.email\) \|\| null/);assert.match(dbRepo,/organization_name: normalizeText\(actor\.organizationName\) \|\| null/);assert.match(fileRepo,/organizationName: normalizeText\(actor\.organizationName\) \|\| undefined/)}],
  ["project creation audit stores acting identity",()=>{assert.match(dbRepo,/actingIdentityId: actor\.actingIdentityId/);assert.match(fileRepo,/actingIdentityId: actor\.actingIdentityId/)}],
  ["Drive project create has identity selector",()=>{assert.match(drive,/Projektindítási identitás/);assert.match(drive,/actingIdentityId: selectedProjectIdentityId/);assert.match(drive,/driveIdentityLabel/)}],
  ["Drive offers identity management from project create",()=>assert.match(drive,/\+ E-mail \/ munkahely hozzáadása/)],
  ["Personal Drive profile opens identity management",()=>{assert.match(personal,/onManageIdentities/);assert.match(personal,/E-mail-címek és munkahelyek/)}],
  ["identity dialog supports add and OTP verify",()=>{assert.match(dialog,/\/api\/dimpro-auth\/identities/);assert.match(dialog,/\/api\/dimpro-auth\/identities\/verify/);assert.match(dialog,/Hitelesítő kód küldése/)}],
  ["identity dialog avoids parent callback reload loops",()=>{assert.match(dialog,/onChangedRef = useRef\(onChanged\)/);assert.match(dialog,/onChangedRef\.current\?\.\(next\)/);assert.match(dialog,/\}, \[open\]\);/)}],
  ["Project Gate project creation also selects acting identity",()=>{assert.match(projectList,/Projektindítási identitás/);assert.match(projectList,/actingIdentityId: selectedIdentityId/);assert.match(projectList,/E-mail \/ munkahely hozzáadása/)}],
];
let passed=0;
for(const [name,test] of tests){try{test();passed++;console.log(`PASS ${passed}/${tests.length} ${name}`)}catch(error){console.error(`FAIL ${name}`);throw error}}
console.log(`RESULT ${passed}/${tests.length} PASS`);
