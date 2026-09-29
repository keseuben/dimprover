import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("supabase/migrations/20260929_drive_box_folders_v020.sql");
const repo = read("app/lib/drive-core/workspaceRepository.ts");
const store = read("app/lib/drive-core/store.ts");
const schema = read("app/lib/drive-core/workspaceSchema.ts");
const types = read("components/drive/driveTypes.ts");
const shelf = read("components/drive/BoxShelf.tsx");
const css = read("components/drive/DriveWorkspace.module.css");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");
const folderRoute = read("app/api/projects/[projectId]/drive/boxes/[boxId]/folders/route.ts");
const moveRoute = read("app/api/projects/[projectId]/drive/boxes/[boxId]/items/[itemId]/move/route.ts");

let pass = 0;
let fail = 0;
function check(name, ok) {
  const index = String(pass + fail + 1).padStart(2, "0");
  if (ok) { pass += 1; console.log(`PASS ${index} ${name}`); }
  else { fail += 1; console.error(`FAIL ${index} ${name}`); }
}

check("migration creates BOX folder table", migration.includes("create table if not exists public.drive_core_box_folders"));
check("migration adds optional folder_id to BOX items", migration.includes("add column if not exists folder_id text null"));
check("migration protects folder relation with FK", migration.includes("drive_core_box_items_folder_fk") && migration.includes("on delete set null"));
check("migration enforces active sibling folder name uniqueness", migration.includes("drive_core_box_folders_active_name_unique") && migration.includes("coalesce(parent_id,'')"));
check("migration keeps service-role-only table access", migration.includes("revoke all on public.drive_core_box_folders from public, anon, authenticated") && migration.includes("to service_role"));
check("migration exposes atomic folder create RPC", migration.includes("drive_workspace_create_box_folder_atomic"));
check("migration exposes atomic item move RPC", migration.includes("drive_workspace_move_box_item_atomic"));
check("migration audits folder create and item move", migration.includes("DRIVE_BOX_FOLDER_CREATED") && migration.includes("DRIVE_BOX_ITEM_MOVED"));
check("migration extends audit entity constraints with box_folder", migration.includes("drive_core_changes_entity_type_check") && migration.includes("project_core_audit_entity_type_check") && migration.includes("box_folder"));
check("migration does not replace required Workspace schema marker", !migration.includes("drive_workspace_schema_meta"));
check("required Workspace schema remains 1.0.0", schema.includes('DRIVE_WORKSPACE_SCHEMA_VERSION = "1.0.0"') && !schema.includes("drive_core_box_folders"));

check("repository exposes DriveBoxFolder model", repo.includes("export type DriveBoxFolder"));
check("repository exposes folderFeatureReady compatibility flag", repo.includes("folderFeatureReady: boolean") && types.includes("folderFeatureReady: boolean"));
check("repository maps optional item folderId", repo.includes("folderId: row.folder_id || null") && types.includes("folderId: string | null"));
check("repository probes optional folder table", repo.includes('.from("drive_core_box_folders")') && repo.includes("isOptionalBoxFolderFeatureMissing"));
check("missing optional table falls back instead of failing Workspace", repo.includes('const folderFeatureReady = !folderResult.error') && repo.includes("folderResult.error && !isOptionalBoxFolderFeatureMissing"));
check("repository creates BOX folder through RPC", repo.includes("export async function createDriveBoxFolder") && repo.includes('rpc("drive_workspace_create_box_folder_atomic"'));
check("repository moves BOX item through RPC", repo.includes("export async function moveDriveBoxItemToFolder") && repo.includes('rpc("drive_workspace_move_box_item_atomic"'));
check("store exports BOX folder operations", store.includes("createDriveBoxFolder") && store.includes("moveDriveBoxItemToFolder"));

check("folder route requires document.write", folderRoute.includes('requireProjectPermission(request, projectId, "document.write")') && folderRoute.includes("createDriveBoxFolder"));
check("item move route requires document.write", moveRoute.includes('requireProjectPermission(request, projectId, "document.write")') && moveRoute.includes("moveDriveBoxItemToFolder"));
check("BoxShelf exposes folder creation only when feature is ready", shelf.includes("box.folderFeatureReady && canWrite && onCreateFolder"));
check("BoxShelf supports root and child folders", shelf.includes("promptNewFolder(box.id)") && shelf.includes("promptNewFolder(box.id, folder.id)"));
check("BoxShelf renders hierarchical folder ordering", shelf.includes("orderedBoxFolders") && shelf.includes("depth * 14"));
check("BoxShelf lets each item select BOX target folder", shelf.includes("boxItemFolderSelect") && shelf.includes("onMoveItem(box.id, item.id"));
check("folder UI has compact tree styling", css.includes(".boxFolderTree") && css.includes(".boxFolderRow") && css.includes(".boxItemFolderSelect"));

check("main Drive wires create and move handlers", drive.includes("async function createBoxFolder") && drive.includes("async function moveBoxItemToFolder") && drive.includes("onCreateFolder={createBoxFolder}") && drive.includes("onMoveItem={moveBoxItemToFolder}"));
check("Projectkapu wires create and move handlers", gate.includes("async function createBoxFolder") && gate.includes("async function moveBoxItemToFolder") && gate.includes("onCreateFolder={createBoxFolder}") && gate.includes("onMoveItem={moveBoxItemToFolder}"));
check("fullscreen CsomagBOX panel remains available", drive.includes("fullTableBoxPanel") && gate.includes("fullTableBoxPanel"));
check("file-icon drag remains the package intake mechanism", shelf.includes('application/x-dimpro-drive-document'));

const result = { ok: fail === 0, contract: "DIMPRO Drive V0.6.6 CsomagBOX internal folders", pass, fail };
console.log(JSON.stringify(result, null, 2));
if (fail) process.exit(1);
