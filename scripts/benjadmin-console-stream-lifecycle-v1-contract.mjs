#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";
const stream=fs.readFileSync("app/api/dev/console/stream/route.ts","utf8");
let passed=0;
function check(name,fn){fn();passed+=1;console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`);}
check("SSE stream remains admin-only",()=>assert.ok(stream.includes("isDevCenterAuthorized")&&stream.includes("status: 401")));
check("SSE stream has one shared stop lifecycle",()=>assert.ok(stream.includes("const stop = () =>")&&stream.includes("timer = null")));
check("SSE enqueue is fail-closed",()=>assert.ok(stream.includes("const safeEnqueue")&&stream.includes("if (closed) return false")&&stream.includes("catch {\n          stop();")));
check("Async snapshot rechecks closed state after DB wait",()=>assert.ok(stream.includes("await Promise.all")&&stream.includes("if (closed) return;")));
check("Stream error event never enqueues after close",()=>assert.ok(stream.includes("if (!closed) safeEnqueue(`event: stream-error")));
check("Abort and cancel both use shared stop",()=>assert.ok(stream.includes('request.signal.addEventListener("abort"')&&stream.includes("stop();\n        try { controller.close()")&&stream.includes("cancel() {\n      stop();")));
check("SSE response headers remain unchanged",()=>assert.ok(stream.includes('"text/event-stream; charset=utf-8"')&&stream.includes('"x-accel-buffering": "no"')));
console.log(JSON.stringify({ok:true,passed,failed:0,contract:"BENJADMIN Console Stream Lifecycle V1"},null,2));
