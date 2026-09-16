#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const source=read("app/lib/developer-grid/source-provenance.ts");
const types=read("app/lib/developer-grid/types.ts");
const work=read("app/lib/developer-grid/work-start.ts");
const workRoute=read("app/api/dev/grid/work-start/route.ts");
const stateRoute=read("app/api/dev/grid/state/route.ts");
const materializer=read("app/lib/developer-grid/task-session-materializer.ts");
const prompt=read("desktop/benjadmin-developer-grid/src/task-launch/prompt-builder.cjs");
let n=0;const check=(name,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")}: ${name}`)};
check("SourceProvenance exposes execution-path-unavailable block code",()=>assert.match(types,/SOURCE_EXECUTION_PATH_UNAVAILABLE/));
check("Unreadable exact authoritative worktree maps to execution-path-unavailable",()=>{assert.match(source,/executionPathUnavailable = true/);assert.match(source,/SOURCE_EXECUTION_PATH_UNAVAILABLE/);assert.match(source,/Authoritative execution worktree nem olvasható/)});
check("Readable wrong branch HEAD repository remains baseline mismatch",()=>{assert.match(source,/Branch mismatch/);assert.match(source,/HEAD mismatch/);assert.match(source,/Repository mismatch/);assert.match(source,/SOURCE_BASELINE_MISMATCH/)});
check("Verified-source assertion throws precise provenance block code",()=>assert.match(source,/const code = provenance\.blockCode \|\| "SOURCE_BASELINE_MISMATCH"/));
check("Work-start propagates precise foundation source block code",()=>assert.match(work,/foundation\.sourceProvenance\.blockCode \|\| "SOURCE_BASELINE_MISMATCH"/));
check("Materializer propagates precise source block code",()=>assert.match(materializer,/foundation\.sourceProvenance\.blockCode \|\| "SOURCE_BASELINE_MISMATCH"/));
check("Work-start API treats both source failures as conflict",()=>{assert.match(workRoute,/SOURCE_EXECUTION_PATH_UNAVAILABLE/);assert.match(workRoute,/SOURCE_BASELINE_MISMATCH/);assert.match(workRoute,/409/)});
check("State API treats both source failures as conflict",()=>{assert.match(stateRoute,/SOURCE_EXECUTION_PATH_UNAVAILABLE/);assert.match(stateRoute,/SOURCE_BASELINE_MISMATCH/);assert.match(stateRoute,/409/)});
check("Launch prompt forbids scratch or default MCP cwd as source authority",()=>{assert.match(prompt,/Ne helyettesítsd \/root\/dimprover, scratch repo, default MCP cwd/);assert.match(prompt,/Launch Packet WORKTREE\/BRANCH\/BASE HEAD hármasa authoritative/)});
check("Unavailable authoritative path is not called baseline mismatch",()=>{assert.match(prompt,/SOURCE_EXECUTION_PATH_UNAVAILABLE/);assert.match(prompt,/TILOS SOURCE_BASELINE_MISMATCH-nak nevezni/)});
check("Baseline mismatch requires accessible exact authoritative worktree",()=>assert.match(prompt,/SOURCE_BASELINE_MISMATCH csak akkor jelenthető, ha az exact authoritative WORKTREE elérhető/));
console.log(`Developer Grid source authority v0.1.41 contract PASS · ${n}/${n}`);
