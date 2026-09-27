#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("app/lib/drive-core/storageService.ts", "utf8");
const store = readFileSync("app/lib/drive-core/store.ts", "utf8");
const route = readFileSync("app/api/projects/[projectId]/drive/uploads/[uploadId]/object/route.ts", "utf8");
const drive = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const gate = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("init keeps direct signed upload for non-browser clients", () => assert.match(service, /signedUpload:\s*\{/));
check("init exposes same-origin browser upload target", () => assert.match(service, /browserUpload:\s*\{[\s\S]*?\/object/));
check("browser proxy service is exported", () => assert.match(store, /uploadDriveObjectThroughServer/));
check("proxy service validates session actor", () => assert.match(service, /DRIVE_UPLOAD_ACTOR_MISMATCH/));
check("proxy service validates exact content length", () => assert.match(service, /input\.contentLength !== session\.sizeBytes/));
check("proxy writes through the configured private S3 adapter", () => assert.match(service, /putDriveObjectStream\(\{/));
check("proxy route requires document write permission", () => assert.match(route, /requireProjectPermission\(request, projectId, "document\.write"\)/));
check("proxy route requires Content-Length", () => assert.match(route, /status: 411/));
check("proxy route streams request body", () => assert.match(route, /requestBodyChunks\(request\.body\)/));
check("Drive browser prefers same-origin browserUpload", () => assert.match(drive, /initPayload\.browserUpload \|\| initPayload\.signedUpload/));
check("Drive browser sends same-origin credentials for proxy", () => assert.match(drive, /credentials: initPayload\.browserUpload \? "same-origin" : "omit"/));
check("Projectkapu browser prefers same-origin browserUpload", () => assert.match(gate, /initPayload\.browserUpload \|\| initPayload\.signedUpload/));
check("Projectkapu upload helper accepts generic upload target", () => assert.match(gate, /function putUploadFile/));

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
