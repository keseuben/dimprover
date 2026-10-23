import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION,
  PERSONAL_UPLOAD_MAX_BYTES, isPersonalUploadSelectionAllowed,
} from "../../app/lib/content-core/personalUploadPolicy.ts";
import {
  visibleTransferRows, summarizeTransfers, TRANSFER_CORE_VERSION,
} from "../../app/lib/transfer-core/transferModel.ts";

const read = path => readFileSync(path, "utf8");
const workspace = read("components/drive/PersonalDriveWorkspace.tsx");
const panel = read("components/drive/DriveTransferCenter.tsx");
const repo = read("app/lib/content-core/repository.ts");
const route = read("app/api/drive/personal/content/route.ts");
const version = read("components/drive/driveBuildInfo.ts");
const previous = read("scripts/tests/dimpro-drive-v0954-personal-upload-contract.mjs");

// Source version monotonically tracks the bulk-upload UI / paging change.
assert.ok(["0.9.55", "0.9.56", "0.9.57"].includes(TRANSFER_CORE_VERSION));
assert.match(version, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.(55|56|57)"/);
assert.equal(PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION, 500);
assert.equal(PERSONAL_UPLOAD_MAX_BYTES, 100 * 1024 * 1024);
for (const count of [1, 25, 50, 100, 250, 499, 500]) {
  assert.equal(isPersonalUploadSelectionAllowed(count), true, `expected ${count} photos accepted`);
}
for (const count of [-1, 0, 501, 1000, 3.5, NaN]) {
  assert.equal(isPersonalUploadSelectionAllowed(count), false, `expected ${count} invalid`);
}
assert.ok(!workspace.includes("files.length > 25"));
assert.match(workspace, /isPersonalUploadSelectionAllowed\(files.length\)/);
assert.match(workspace, /succeeded % 50 === 0/);
assert.match(workspace, /setPersonalTransferTasks\(current => \[\.\.\.current,\.\.\.pendingTasks\]\)/);
assert.match(workspace, /for \(const \{id,file\} of tasks\)/);
assert.match(workspace, /targetFolderId = selectedFolderId === "all"/);
assert.match(workspace, /folderId:targetFolderId/);
assert.match(workspace, /now - lastProgressRenderAt >= 160/);
assert.match(workspace, /personalTransferCancelledRef\.current\.has\(id\)/);
assert.match(workspace, /onCancel=\{id =>/);
assert.match(workspace, /personalTransferWorkspaceAliveRef\.current/);
assert.match(workspace, /fetchPersonalContentPages\(\)/);

// 500 queued files, one active, and completed/failed files remain visible
// in the default 60-row preview without forcing a 500-row render.
const tasks = Array.from({length: 500}, (_,i) => ({id:String(i),phase:"QUEUED",sizeBytes:100,uploadedBytes:0}));
tasks[0] = {...tasks[0],phase:"UPLOADING"};
assert.equal(visibleTransferRows(tasks).length, 60);
assert.equal(visibleTransferRows(tasks)[0].id, "0");
assert.equal(visibleTransferRows(tasks, true).length, 500);
tasks[0] = {...tasks[0],phase:"AVAILABLE",uploadedBytes:100};
tasks[1] = {...tasks[1],phase:"UPLOADING"};
const preview = visibleTransferRows(tasks);
assert.equal(preview.length, 60);
assert.equal(preview[0].id, "1");
assert.ok(preview.some(t=>t.id==="0"));
assert.equal(summarizeTransfers(tasks).count,500);
const allDone = tasks.map(t=>({...t,phase:"AVAILABLE",uploadedBytes:100}));
assert.equal(visibleTransferRows(allDone).length,60);
assert.equal(visibleTransferRows(allDone)[59].id,"499");
assert.equal(visibleTransferRows([],false).length,0);

// Pagination iterates reference rows, not join rows: a 500-item selection
// cannot silently hide pre-existing documents behind the old 250-row limit.
assert.match(repo, /listUserContentItems\(input: \{ userId: string; limit\?: number; offset\?: number \}\)/);
assert.match(repo, /\.order\("id", \{ ascending: false \}\)/);
assert.match(repo, /\.range\(offset, offset \+ limit\)/);
assert.match(repo, /nextOffset: hasMore \? offset \+ refs.length : null/);
assert.match(route, /limit: 200, offset/);
assert.match(route, /nextOffset,/);
assert.match(workspace, /items.push\(\.\.\.\(payload.items \|\| \[\]\)\)/);
assert.match(workspace, /items.length >= 10_000/);
assert.match(panel, /visibleTransferRows\(filteredTasks, showAll, 60\)/);
assert.match(previous, /"0\.9\.55"/);
console.log("DIMPRO Drive V0.9.55 bulk selection 500 / paging / UI queue contract PASS");
