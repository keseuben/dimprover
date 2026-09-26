#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth=readFileSync("app/lib/project-gate/devAccess.ts","utf8");
const session=readFileSync("app/api/project-gate/dev-access/session/route.ts","utf8");
const driveSession=readFileSync("app/api/drive/dev-access/session/route.ts","utf8");
const login=readFileSync("app/login/ProjectGateCodeLogin.tsx","utf8");
const loginPage=readFileSync("app/login/page.tsx","utf8");
const drivePage=readFileSync("app/drive/page.tsx","utf8");
const shell=readFileSync("components/drive/DriveShell.tsx","utf8");
const board=readFileSync("components/drive/FloatingProjectBoard.tsx","utf8");
const provision=readFileSync("app/lib/drive-core/projectProvisioning.ts","utf8");
const projectRoute=readFileSync("app/api/projects/route.ts","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("Drive auth uses dedicated password hash config",()=>{
  assert.match(auth,/DRIVE_DEV_PASSWORD_AUTH_ENABLED/);
  assert.match(auth,/DRIVE_DEV_PASSWORD_SALT/);
  assert.match(auth,/DRIVE_DEV_PASSWORD_HASH/);
  assert.match(auth,/verifyDriveDevAccessPassword/);
  assert.match(auth,/scryptSync\(provided, salt, 32\)/);
});
check("Drive host is isolated from ProjectGate host",()=>{
  assert.match(auth,/drive\.dev\.dimpro\.hu/);
  assert.match(auth,/projektkapu\.dev\.dimpro\.hu/);
  assert.match(auth,/isSimpleDevAccessConfigured/);
});
check("Drive session verifies password and redirects to drive",()=>{
  assert.match(session,/verifyDriveDevAccessPassword/);
  assert.match(session,/body\?\.password/);
  assert.match(session,/DRIVE_DEV_PASSWORD_INVALID/);
  assert.match(session,/isDriveDevAccessConfigured\(host\) \? "\/drive" : "\/projektkapu\/projects"/);
});
check("Drive API reuses the same hardened session implementation",()=>{
  assert.match(driveSession,/export \{ DELETE, GET, POST \} from "@\/app\/api\/project-gate\/dev-access\/session\/route"/);
});
check("ProjectGate six digit code path remains",()=>{
  assert.match(auth,/verifyProjectGateDevAccessCode/);
  assert.match(auth,/\^\\d\{6\}\$/);
  assert.match(login,/driveMode \? code\.length < 1 : !\/\^\\d\{6\}\$\//);
});
check("Drive login renders password field",()=>{
  assert.match(loginPage,/ProjectGateCodeLogin mode="drive"/);
  assert.match(login,/type=\{driveMode \? "password" : "text"\}/);
  assert.match(login,/driveMode \? \{ password: code \} : \{ code \}/);
  assert.match(login,/DIMPRO Drive pilot jelszó/);
});
check("Drive page requires pilot session on Drive DEV host",()=>{
  assert.match(drivePage,/isDriveDevAccessConfigured/);
  assert.match(drivePage,/verifyProjectGateDevAccessToken/);
  assert.match(drivePage,/redirect\("\/login"\)/);
});
check("Drive board exposes new project action",()=>{
  assert.match(board,/onCreateProject/);
  assert.match(board,/Új projekt/);
  assert.match(shell,/onCreateProject=/);
});
check("Drive project creation uses common Project Core API",()=>{
  assert.match(shell,/fetch\("\/api\/projects"/);
  assert.match(shell,/method: "POST"/);
  assert.match(projectRoute,/createProject/);
  assert.match(projectRoute,/provisionProjectDrive/);
});
check("Drive pilot project name is configuration driven",()=>{
  assert.match(drivePage,/DRIVE_PILOT_PROJECT_NAME/);
  assert.match(shell,/pilotProjectName/);
  assert.doesNotMatch(shell,/Szekszárd Zrt és Szajki Zrt/);
});
check("Pilot folder is feature flagged and provisioned in Drive Core",()=>{
  assert.match(provision,/DRIVE_PILOT_FOLDER_NAME = "PILOT"/);
  assert.match(provision,/DRIVE_PILOT_MODE_ENABLED/);
  assert.match(provision,/pilotFolder/);
  assert.match(provision,/createDriveFolder/);
  assert.match(provision,/DRIVE_PROJECT_PROVISIONING_VERSION = "1\.2\.0"/);
});
check("Project API uses current provisioning version constant",()=>{
  assert.match(projectRoute,/DRIVE_PROJECT_PROVISIONING_VERSION/);
});
check("No pilot password literal is embedded in source contract scope",()=>{
  const joined=[auth,session,login,loginPage,drivePage,shell,board,provision,projectRoute].join("\n");
  assert.doesNotMatch(joined,/szekszárd26/i);
});

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
