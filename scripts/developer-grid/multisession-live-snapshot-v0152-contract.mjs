#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const live=fs.readFileSync("desktop/benjadmin-developer-grid/src/live/benjadmin-live-client.cjs","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};
check("session task projector exists",()=>assert.match(live,/function synthesizeSessionTask/));
check("all active sessions are projected",()=>assert.match(live,/for \(const session of activeSessions\)/));
check("session task id drives projection",()=>assert.match(live,/const sessionTaskId = String\(session\?\.taskId \|\| ""\)/));
check("primary task detail remains authoritative",()=>assert.match(live,/primaryTaskId === sessionTaskId \? task : null/));
check("non-primary session stays active",()=>assert.match(live,/status: isPrimary \? gridTaskStatus\(primaryTask\?\.status\) : "in_progress"/));
check("legacy chat id promoted",()=>assert.match(live,/surfaceConversationId: context\.surfaceConversationId \|\| context\.chatConversationId \|\| null/));
check("legacy chat url promoted",()=>assert.match(live,/surfaceConversationUrl: context\.surfaceConversationUrl \|\| context\.chatConversationUrl \|\| null/));
check("session id preserved",()=>assert.match(live,/sessionId: session\?\.id \|\| null/));
check("session source provenance preserved",()=>{assert.match(live,/branchName: session\?\.sourceProvenance\?\.branch/);assert.match(live,/worktreePath: session\?\.sourceProvenance\?\.worktree/);assert.match(live,/sourceHead: session\?\.sourceProvenance\?\.head/)});
check("primary task retained without session",()=>assert.match(live,/if \(task\?\.id && !tasksById\.has\(primaryTaskId\)\)/));
check("primary task ordered first",()=>assert.match(live,/tasksById\.has\(primaryTaskId\).*tasksById\.get\(primaryTaskId\)/s));
check("worker presence still covers all sessions",()=>assert.match(live,/const workerPresence = activeSessions\.map/));
console.log("Developer Grid multisession live snapshot v0.1.52 contract PASS · "+n+"/"+n);
