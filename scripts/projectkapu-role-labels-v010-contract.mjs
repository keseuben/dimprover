#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const permissions = readFileSync("app/lib/project-core/permissions.ts","utf8");
const list = readFileSync("components/project-gate/ProjectListClient.tsx","utf8");
const shell = readFileSync("components/project-gate/ProjectGateShell.tsx","utf8");

let pass=0;
const check=(name,fn)=>{fn();pass++;console.log("PASS "+name);};

check("OWNER label is Beruházási projektvezető",()=>assert.match(permissions,/OWNER: "Beruházási projektvezető"/));
check("PROJECT_MANAGER label is Projektvezető",()=>assert.match(permissions,/PROJECT_MANAGER: "Projektvezető"/));
check("REVIEWER label is Ellenőrző",()=>assert.match(permissions,/REVIEWER: "Ellenőrző"/));
check("CONTRIBUTOR label is Közreműködő",()=>assert.match(permissions,/CONTRIBUTOR: "Közreműködő"/));
check("VIEWER label is Megtekintő",()=>assert.match(permissions,/VIEWER: "Megtekintő"/));
check("unknown role fallback is Hungarian",()=>assert.match(permissions,/return PROJECT_ROLE_LABELS\[role as ProjectMembershipRole\] \|\| "Projekt résztvevő"/));
check("project list uses shared Hungarian role label",()=>assert.match(list,/projectRoleLabel\(project\.membership\.role\)/)&&assert.doesNotMatch(list,/>\{project\.membership\.role\}</));
check("project shell uses shared Hungarian role label",()=>assert.match(shell,/projectRoleLabel\(dashboard\?\.membership\.role\)/)&&assert.doesNotMatch(shell,/const displayRole = dashboard\?\.membership\.role/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
