import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const ui = read("components/project-gate/ProjectAccessMenu.tsx");
const css = read("components/project-gate/ProjectAccessMenu.module.css");
const profile = read("app/api/dimpro-auth/profile/route.ts");
const authRepo = read("app/lib/dimpro-auth/repository.ts");
const coreStore = read("app/lib/project-core/store.ts");
const dbRepo = read("app/lib/project-core/databaseRepository.ts");
const fileRepo = read("app/lib/project-core/fileRepository.ts");

const tests = [
  ["project access UI version", () => assert.match(ui, /data-project-access-menu="0\.3\.0"/)],
  ["invite UI requires and sends name", () => {
    assert.match(ui, /<span>Név \*<\/span>/);
    assert.match(ui, /displayName: inviteName\.trim\(\)/);
    assert.match(ui, /inviteName\.trim\(\)\.length < 2/);
  }],
  ["self membership remains explicitly identified", () => {
    assert.match(ui, /data-self=\{isSelf \? "true" : undefined\}/);
    assert.match(ui, /styles\.selfMember/);
    assert.match(ui, />Te<\/span>/);
  }],
  ["self name editor calls profile PATCH", () => {
    assert.match(ui, /SELF_PROFILE_PATH/);
    assert.match(ui, /method: "PATCH"/);
    assert.match(ui, /Saját név módosítása/);
  }],
  ["light self card highlight", () => {
    assert.match(css, /\.selfMember \{/);
    assert.match(css, /background: #d9f2ec/);
    assert.match(css, /\.selfMember:hover \{ background: #cfebe4; \}/);
  }],
  ["dark self card highlight", () => {
    assert.match(css, /data-drive-theme="dark"\]\) \.selfMember/);
    assert.match(css, /background: #133c37/);
  }],
  ["profile mutation is same-origin and session-bound", () => {
    assert.match(profile, /validateSameOriginMutation/);
    assert.match(profile, /DIMPRO_APP_SESSION_COOKIE/);
    assert.match(profile, /getAppSessionByToken/);
    assert.doesNotMatch(profile, /targetUserId/);
  }],
  ["profile update synchronizes accessible memberships with compensation", () => {
    assert.match(profile, /listAccessibleProjects/);
    assert.match(profile, /updateProjectMembershipDisplayName/);
    assert.match(profile, /rollbackMemberships/);
    assert.match(profile, /updateAuthUserDisplayName/);
  }],
  ["AUTH profile update is audited", () => {
    assert.match(authRepo, /export async function updateAuthUserDisplayName/);
    assert.match(authRepo, /UPDATE auth_users SET display_name/);
    assert.match(authRepo, /PROFILE_DISPLAY_NAME_CHANGED/);
  }],
  ["Project Core store exposes display-name update", () => assert.match(coreStore, /export function updateProjectMembershipDisplayName/)],
  ["database Project Core update is active-only and audited", () => {
    assert.match(dbRepo, /export async function updateProjectMembershipDisplayName/);
    assert.match(dbRepo, /row\.status !== "ACTIVE"/);
    assert.match(dbRepo, /PROJECT_MEMBER_DISPLAY_NAME_CHANGED/);
  }],
  ["file Project Core update is active-only and audited", () => {
    assert.match(fileRepo, /export async function updateProjectMembershipDisplayName/);
    assert.match(fileRepo, /membership\.status !== "ACTIVE"/);
    assert.match(fileRepo, /PROJECT_MEMBER_DISPLAY_NAME_CHANGED/);
  }],
];

let passed = 0;
for (const [name, test] of tests) {
  try {
    test();
    passed += 1;
    console.log(`PASS ${passed}/${tests.length} ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`RESULT ${passed}/${tests.length} PASS`);
