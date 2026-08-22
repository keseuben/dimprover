import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { File } from "node:buffer";
import createJiti from "jiti";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "benjadmin-handoff-context-"));
process.env.DIMPRO_DEV_HANDOFF_ROOT = path.join(temp, "handoffs");
process.env.DIMPRO_DEV_RESOURCE_ROOT = path.join(temp, "resources");
const jiti = createJiti(fileURLToPath(import.meta.url), { interopDefault: true });
const handoff = jiti("../app/lib/dev-center/handoff-store.ts");
const resources = jiti("../app/lib/dev-center/development-resources.ts");
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}: ${detail}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }

const saved = await handoff.saveDevelopmentHandoff({
  id: "handoff-contract-001", chatSessionId: "260822_3", chatTitle: "260822_3 ÁrminAI – fejlesztés", workerCode: "ARMINAI",
  mainProject: "DIMPRO", project: "BENJADMIN", module: "ChatGrid", contextModule: "External Review Room", taskId: "task-contract", taskTitle: "Contract task",
  startedAt: "2026-08-22T14:10:00+02:00", finishedAt: "2026-08-22T14:33:00+02:00", status: "BLOCKED", branch: "feature/test", worktree: "/srv/dimpro-dev/worktrees/test",
  startCommit: "a".repeat(40), endCommit: "b".repeat(40), testsSummary: "144/144 PASS", buildRelease: "NONE", tags: ["chatgrid", "handoff"], summary: "Átadási contract teszt.", body: "# Átadó\n\nTeljes munkaszakasz összefoglaló.\n"
});
check("handoff duration is server-derived", saved.durationMinutes === 23, `duration=${saved.durationMinutes}`);
check("handoff PROD is always DENY", saved.productionAccess === "DENY");
check("immutable history markdown created", fs.existsSync(saved.filePath), saved.filePath);
check("worker LATEST created", fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "workers", "ARMINAI_LATEST.md")));
check("module LATEST created", fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "modules", "external-review-room", "LATEST.md")));
const listed = await handoff.listDevelopmentHandoffs({ worker: "ARMINAI", module: "ChatGrid", chat: "260822_3" });
check("handoff structured filters work", listed.length === 1 && listed[0].id === saved.id, `count=${listed.length}`);
let duplicateDenied = false; try { await handoff.saveDevelopmentHandoff({ ...saved, body: "duplicate" }); } catch { duplicateDenied = true; }
check("immutable handoff overwrite denied", duplicateDenied);
const readBack = await handoff.readDevelopmentHandoff(saved.id);
check("handoff SHA integrity verified", readBack.item.sha256 === saved.sha256 && readBack.content.includes("260822_3"));

const parallelWorkers = ["BENAI", "OUTMINAI", "ARMINAI", "JAZMINAI"];
await Promise.all(parallelWorkers.map((workerCode, index) => handoff.saveDevelopmentHandoff({
  id: `handoff-parallel-${index + 1}`, chatSessionId: `260822_${index + 1}`, chatTitle: `Parallel ${workerCode}`, workerCode,
  mainProject: "DIMPRO", project: "BENJADMIN", module: "ChatGrid", contextModule: "Parallel Handoff", taskId: `parallel-task-${index + 1}`, taskTitle: "Concurrent save contract",
  startedAt: "2026-08-22T15:00:00+02:00", finishedAt: `2026-08-22T15:0${index + 1}:00+02:00`, status: "COMPLETED", branch: `feature/${workerCode.toLowerCase()}`, worktree: `/tmp/${workerCode.toLowerCase()}`,
  startCommit: "c".repeat(40), endCommit: "d".repeat(40), testsSummary: "PASS", buildRelease: "NONE", tags: ["parallel", workerCode.toLowerCase()], summary: `Parallel ${workerCode} handoff.`, body: `# ${workerCode} átadó\n\nMUNKA VISSZAADVA: 2026.08.22. 15:0${index + 1}\n`
})));
const afterParallel = await handoff.listDevelopmentHandoffs({});
check("concurrent four-worker handoff writes preserve every index entry", parallelWorkers.every((_, index) => afterParallel.some((item) => item.id === `handoff-parallel-${index + 1}`)), `count=${afterParallel.length}`);
check("handoff cross-process write lock released after concurrent saves", !fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, ".handoff-write.lock")));
check("concurrent worker LATEST files all exist", parallelWorkers.every((worker) => fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "workers", `${worker}_LATEST.md`))));

const sampleFile = new File(["# sample"], "sample.md", { type: "text/markdown" });
let metadataDenied = false;
try { resources.validateDevelopmentResourceMetadata({ module: "benjadmin", title: "", description: "", tags: [], version: "", documentType: "specification" }); } catch (error) { metadataDenied = String(error?.message || "").includes("kötelező adatokat"); }
check("resource upload metadata gate fails closed", metadataDenied);
const resource = await resources.saveDevelopmentResource({ module: "benjadmin", title: "Spec", description: "Részletes fejlesztési specifikáció", tags: ["chatgrid"], version: "V1", documentType: "specification", priority: "critical", requiredBeforeDevelopment: true, file: sampleFile });
check("resource document type persists", resource.documentType === "specification");
check("resource SHA stored", /^[a-f0-9]{64}$/.test(resource.sha256));
check("resource required flag persists", resource.requiredBeforeDevelopment === true);

console.log(JSON.stringify({ ok: true, passed, failed: 0, temp }, null, 2));
fs.rmSync(temp, { recursive: true, force: true });
