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
  schemaVersion: 2, mainProject: "DIMPRO", project: "BENJADMIN", module: "ChatGrid", contextModule: "External Review Room", developmentArea: "Long human readable handoff area", fileAreaKey: "OTP_auth", taskId: "task-contract", taskTitle: "Contract task", liveNextTaskId: "next-task", liveNextTaskTitle: "Next task",
  startedAt: "2026-08-22T14:10:00+02:00", finishedAt: "2026-08-22T14:33:00+02:00", status: "BLOCKED", branch: "feature/test", worktree: "/srv/dimpro-dev/worktrees/test",
  startCommit: "a".repeat(40), endCommit: "b".repeat(40), testsSummary: "144/144 PASS", buildRelease: "NONE", tags: ["chatgrid", "handoff"], summary: "Átadási contract teszt.", body: "# Átadó\n\nTeljes munkaszakasz összefoglaló.\n"
});
check("handoff duration is server-derived", saved.durationMinutes === 23, `duration=${saved.durationMinutes}`);
check("handoff PROD is always DENY", saved.productionAccess === "DENY");
check("immutable history markdown created", fs.existsSync(saved.filePath), saved.filePath);
check("worker LATEST created", fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "workers", "ARMINAI_LATEST.md")));
check("hierarchical module LATEST created", fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "modules", "dimpro__benjadmin__chatgrid__external-review-room", "LATEST.md")));
check("handoff V2 metadata persists", saved.schemaVersion === 2 && saved.developmentArea === "Long human readable handoff area" && saved.fileAreaKey === "OTP_auth" && saved.liveNextTaskId === "next-task");
check("canonical handoff filename uses short fileAreaKey", /^260822_3_ArminAI_\d{6}_\d{4}_DIMPRO_ChatGrid_OTP_auth_atado\.md$/.test(saved.fileName), saved.fileName);
const listed = await handoff.listDevelopmentHandoffs({ worker: "ARMINAI", module: "ChatGrid", chat: "260822_3" });
check("handoff structured filters work", listed.length === 1 && listed[0].id === saved.id, `count=${listed.length}`);
const filenameSearch = await handoff.listDevelopmentHandoffs({ query: saved.fileName });
check("handoff canonical filename is searchable", filenameSearch.length === 1 && filenameSearch[0].id === saved.id);
let duplicateDenied = false; try { await handoff.saveDevelopmentHandoff({ ...saved, body: "duplicate" }); } catch { duplicateDenied = true; }
check("immutable handoff overwrite denied", duplicateDenied);
const readBack = await handoff.readDevelopmentHandoff(saved.id);
check("handoff SHA integrity verified", readBack.item.sha256 === saved.sha256 && readBack.content.includes("260822_3"));
check("handoff markdown front matter contains canonical filename and V2 fields", readBack.content.includes(`fileName: ${JSON.stringify(saved.fileName)}`) && readBack.content.includes('schemaVersion: 2') && readBack.content.includes('developmentArea: "Long human readable handoff area"') && readBack.content.includes('fileAreaKey: "OTP_auth"'));

const unknownStart = await handoff.saveDevelopmentHandoff({
  id: "handoff-contract-unknown-start", chatSessionId: "260823_1", chatTitle: "260823_1 BenAI", workerCode: "BENAI",
  schemaVersion: 2, mainProject: "DIMPRO", project: "project_dimprover", module: "ChatGrid", contextModule: "Handoff V2",
  developmentArea: "Unknown start contract", fileAreaKey: "handoff_unknown_start", taskId: "chat-benai-260823_1", taskTitle: "Unknown start handoff",
  liveNextTaskId: "", liveNextTaskTitle: "", startedAt: "", finishedAt: "2026-08-23T01:40:00+02:00", status: "PARTIAL",
  branch: "", worktree: "", startCommit: "", endCommit: "", testsSummary: "PASS", buildRelease: "NINCS", tags: ["chatgrid", "handoff"],
  summary: "Ismeretlen kezdési idejű átadó.", body: "# Ismeretlen kezdés\n\nMUNKAFELVÉTEL: NINCS HITELESÍTETT ADAT\nPROD DENY\n"
});
check("Handoff V2 unknown startedAt is accepted", unknownStart.startedAt === "");
check("Handoff V2 unknown startedAt duration is zero", unknownStart.durationMinutes === 0, `duration=${unknownStart.durationMinutes}`);

const parallelWorkers = ["BENAI", "OUTMINAI", "ARMINAI", "JAZMINAI"];
await Promise.all(parallelWorkers.map((workerCode, index) => handoff.saveDevelopmentHandoff({
  id: `handoff-parallel-${index + 1}`, chatSessionId: `260822_${index + 1}`, chatTitle: `Parallel ${workerCode}`, workerCode,
  schemaVersion: 2, mainProject: "DIMPRO", project: "BENJADMIN", module: "ChatGrid", contextModule: "Parallel Handoff", developmentArea: `Parallel ${workerCode}`, fileAreaKey: `Parallel_${workerCode}`, taskId: `parallel-task-${index + 1}`, taskTitle: "Concurrent save contract", liveNextTaskId: "", liveNextTaskTitle: "",
  startedAt: "2026-08-22T15:00:00+02:00", finishedAt: `2026-08-22T15:0${index + 1}:00+02:00`, status: "COMPLETED", branch: `feature/${workerCode.toLowerCase()}`, worktree: `/tmp/${workerCode.toLowerCase()}`,
  startCommit: "c".repeat(40), endCommit: "d".repeat(40), testsSummary: "PASS", buildRelease: "NONE", tags: ["parallel", workerCode.toLowerCase()], summary: `Parallel ${workerCode} handoff.`, body: `# ${workerCode} átadó\n\nMUNKA VISSZAADVA: 2026.08.22. 15:0${index + 1}\n`
})));
const afterParallel = await handoff.listDevelopmentHandoffs({});
check("concurrent four-worker handoff writes preserve every index entry", parallelWorkers.every((_, index) => afterParallel.some((item) => item.id === `handoff-parallel-${index + 1}`)), `count=${afterParallel.length}`);
check("handoff cross-process write lock released after concurrent saves", !fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, ".handoff-write.lock")));
check("concurrent worker LATEST files all exist", parallelWorkers.every((worker) => fs.existsSync(path.join(process.env.DIMPRO_DEV_HANDOFF_ROOT, "workers", `${worker}_LATEST.md`))));


const storeSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/lib/dev-center/handoff-store.ts"), "utf8");
const chatGridDownloadRoute = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/api/dev/chatgrid/context-workspace/handoffs/[handoffId]/route.ts"), "utf8");
const consoleDownloadRoute = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../app/api/dev/console/handoffs/[handoffId]/route.ts"), "utf8");
check("handoff store canonical filename is server-generated", storeSource.includes("canonicalFileName") && storeSource.includes("workerFileLabels"));
check("ChatGrid handoff download route is device-authenticated and attachment-safe", chatGridDownloadRoute.includes("isChatGridDeviceAuthorized") && chatGridDownloadRoute.includes("content-disposition") && chatGridDownloadRoute.includes("x-benjadmin-handoff-sha256"));
check("Developer Console handoff download route uses admin auth", consoleDownloadRoute.includes("isDevCenterAuthorized") && consoleDownloadRoute.includes("content-disposition"));
const drawerSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../components/admin/developer-console/DevelopmentResourcesDrawer.tsx"), "utf8");
const drawerCss = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../components/admin/developer-console/DeveloperConsole.module.css"), "utf8");
check("Developer Console ÁTADÁSOK card displays canonical filename", drawerSource.includes("handoffFileName") && drawerSource.includes("item.fileName"));
check("Developer Console ÁTADÁSOK card exposes Letöltés .MD action", drawerSource.includes("downloadStoredHandoff") && drawerSource.includes("Letöltés .MD"));
check("Developer Console canonical filename wraps on narrow drawer", drawerCss.includes(".handoffFileName") && drawerCss.includes("overflow-wrap: anywhere"));

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
