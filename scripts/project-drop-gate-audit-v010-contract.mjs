#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/projects/[projectId]/drop/submission-gates/route.ts", "utf8");
const db = readFileSync("app/lib/project-core/databaseRepository.ts", "utf8");
const file = readFileSync("app/lib/project-core/fileRepository.ts", "utf8");
const repository = readFileSync("app/lib/project-core/repository.ts", "utf8");
const types = readFileSync("app/lib/project-core/types.ts", "utf8");

let pass=0;
const check=(name,fn)=>{fn();pass+=1;console.log(`PASS ${name}`);};

check("database provider records generic project audit",()=>assert.match(db,/export async function recordProjectAuditEvent/));
check("file provider records generic project audit",()=>assert.match(file,/export async function recordProjectAuditEvent/));
check("configured Project Core repository exposes audit writer",()=>assert.match(repository,/\| "recordProjectAuditEvent"/));
check("audit writer keeps existing entity type model",()=>assert.doesNotMatch(types,/\| "drop_gate"/));
check("route uses Project Core repository audit writer",()=>assert.match(route,/getProjectCoreRepository\(\)\.recordProjectAuditEvent/));
check("create audit event is explicit",()=>assert.match(route,/PROJECT_DROP_GATE_CREATED/));
check("create audit uses existing project entity type",()=>assert.match(route,/eventType: "PROJECT_DROP_GATE_CREATED"[\s\S]*entityType: "project"[\s\S]*entityId: projectId/));
check("create audit captures gate identity without recipient PII",()=>{
  const created=route.match(/eventType: "PROJECT_DROP_GATE_CREATED"[\s\S]*?\n      \}\);/)?.[0]||"";
  assert.match(created,/gateId: gate\.id/);
  assert.match(created,/gateSlug: gate\.slug/);
  assert.doesNotMatch(created,/recipientEmail|recipient\.email/);
});
check("create audit failure revokes the new gate",()=>assert.match(route,/catch \{[\s\S]*setDropSubmissionGateStatus\(gate\.id, "revoked"\)[\s\S]*PROJECT_DROP_GATE_AUDIT_FAILED/));
check("expired gate cannot be reactivated",()=>assert.match(route,/current\.status === "expired"[\s\S]*PROJECT_DROP_GATE_EXPIRED/));
check("reactivation audit event is explicit",()=>assert.match(route,/PROJECT_DROP_GATE_REACTIVATED/));
check("revocation audit event is explicit",()=>assert.match(route,/PROJECT_DROP_GATE_REVOKED/));
check("status audit captures previous and next states",()=>assert.match(route,/previousStatus: current\.status[\s\S]*nextStatus: gate\.status/));
check("status audit failure restores previous active or revoked state",()=>assert.match(route,/setDropSubmissionGateStatus\(id, current\.status as "active" \| "revoked"\)/));
check("audit failure is fail-closed",()=>assert.match(route,/PROJECT_DROP_GATE_AUDIT_FAILED/));

console.log(JSON.stringify({total:pass,pass,fail:0},null,2));
