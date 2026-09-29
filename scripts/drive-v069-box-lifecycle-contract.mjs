import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("supabase/migrations/20260929_drive_box_lifecycle_v010.sql");
const repo = read("app/lib/drive-core/workspaceRepository.ts");
const store = read("app/lib/drive-core/store.ts");
const types = read("components/drive/driveTypes.ts");
const shelf = read("components/drive/BoxShelf.tsx");
const css = read("components/drive/DriveWorkspace.module.css");
const route = read("app/api/projects/[projectId]/drive/boxes/[boxId]/lifecycle/route.ts");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");

let pass = 0;
let fail = 0;
function check(name, ok) {
  const index = String(pass + fail + 1).padStart(2, "0");
  if (ok) { pass += 1; console.log("PASS " + index + " " + name); }
  else { fail += 1; console.error("FAIL " + index + " " + name); }
}

check("migration adds separate lifecycle status", migration.includes("add column if not exists lifecycle_status") && migration.includes("DRAFT") && migration.includes("READY") && migration.includes("SENT") && migration.includes("ARCHIVED"));
check("migration preserves technical ACTIVE status", migration.includes("where status = 'ACTIVE'") && !migration.includes("set status = 'ARCHIVED'"));
check("migration tracks lifecycle timestamps", migration.includes("ready_at") && migration.includes("sent_at") && migration.includes("archived_at"));
check("migration exposes atomic lifecycle RPC", migration.includes("drive_workspace_set_box_lifecycle_atomic"));
check("migration enforces explicit transition graph", migration.includes("DRIVE_BOX_LIFECYCLE_TRANSITION_INVALID") && migration.includes("v_previous = 'DRAFT'") && migration.includes("v_previous = 'ARCHIVED'"));
check("lifecycle changes are project-audited", migration.includes("DRIVE_BOX_LIFECYCLE_CHANGED") && migration.includes("previousStatus") && migration.includes("nextStatus"));
check("lifecycle changes emit Drive change event", migration.includes("BOX_LIFECYCLE_CHANGED") && migration.includes("'box'"));
check("lifecycle RPC is service-role only", migration.includes("revoke all on function public.drive_workspace_set_box_lifecycle_atomic") && migration.includes("to service_role"));

check("repository exposes lifecycle model", repo.includes('export type DriveBoxLifecycleStatus = "DRAFT" | "READY" | "SENT" | "ARCHIVED"'));
check("repository DriveBox exposes lifecycle timestamps", repo.includes("lifecycleStatus: DriveBoxLifecycleStatus") && repo.includes("readyAt: string | null") && repo.includes("sentAt: string | null") && repo.includes("archivedAt: string | null"));
check("repository probes optional lifecycle schema", repo.includes('select("id,lifecycle_status,ready_at,sent_at,archived_at")') && repo.includes("lifecycleFeatureReady"));
check("missing lifecycle schema falls back safely", repo.includes("isOptionalBoxLifecycleFeatureMissing") && repo.includes("PGRST204") && repo.includes('row.lifecycle_status || "DRAFT"'));
check("repository exposes lifecycle setter", repo.includes("export async function setDriveBoxLifecycle") && repo.includes('rpc("drive_workspace_set_box_lifecycle_atomic"'));
check("store exports lifecycle setter", store.includes("setDriveBoxLifecycle"));
check("frontend types expose lifecycle model", types.includes("DriveBoxLifecycleStatus") && types.includes("lifecycleFeatureReady"));

check("lifecycle route requires document.write", route.includes('requireProjectPermission(request, projectId, "document.write")'));
check("lifecycle route validates four statuses", route.includes('["DRAFT", "READY", "SENT", "ARCHIVED"]') && route.includes("allowed.has(nextStatus)"));
check("lifecycle route calls repository setter", route.includes("setDriveBoxLifecycle(projectId, boxId, nextStatus"));

check("CsomagBOX shows lifecycle filters", shelf.includes("boxLifecycleFilters") && shelf.includes('setLifecycleFilter("ALL")'));
check("filters include sent and archived history", shelf.includes("SENT") && shelf.includes("ARCHIVED") && shelf.includes("lifecycleCounts"));
check("cards show lifecycle badge", shelf.includes("boxLifecycleBadge") && shelf.includes("lifecycleConfig[box.lifecycleStatus].label"));
check("cards expose only valid transition targets", shelf.includes("lifecycleTargets(box.lifecycleStatus)") && shelf.includes("onSetLifecycle"));
check("lifecycle controls stay hidden before DB capability is ready", shelf.includes("lifecycleFeatureReady") && shelf.includes("box.lifecycleFeatureReady && canWrite"));
check("lifecycle CSS distinguishes four states", css.includes(".boxLifecycleDRAFT") && css.includes(".boxLifecycleREADY") && css.includes(".boxLifecycleSENT") && css.includes(".boxLifecycleARCHIVED"));

check("main Drive posts lifecycle and reloads boxes", drive.includes("async function setBoxLifecycle") && drive.includes("/lifecycle") && drive.includes("await loadBoxes()"));
check("Projectkapu posts lifecycle and reloads boxes", gate.includes("async function setBoxLifecycle") && gate.includes("/lifecycle") && gate.includes("await loadBoxes()"));
check("main Drive wires lifecycle in normal and fullscreen BOX", (drive.match(/onSetLifecycle=\{setBoxLifecycle\}/g) || []).length >= 2);
check("Projectkapu wires lifecycle in normal and fullscreen BOX", (gate.match(/onSetLifecycle=\{setBoxLifecycle\}/g) || []).length >= 2);
check("duplicate BoxShelf header title attribute is gone", (shelf.match(/title=\{open \? "Kattints ide a CsomagBOX polc/g) || []).length === 1);

const result = { ok: fail === 0, contract: "DIMPRO Drive V0.6.9 CsomagBOX lifecycle + history", pass, fail };
console.log(JSON.stringify(result, null, 2));
if (fail) process.exit(1);
