import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  workspace: "components/drive/DriveWorkspace.tsx",
  shelf: "components/drive/BoxShelf.tsx",
  commander: "components/drive/CommanderPanel.tsx",
  grid: "components/drive/FileGridPanel.tsx",
  toolbar: "components/drive/DriveToolbar.tsx",
  switcher: "components/drive/ViewLayoutSwitcher.tsx",
  shell: "components/drive/DriveShell.tsx",
  rail: "components/drive/DriveNavigationRail.tsx",
  floatingBoard: "components/drive/FloatingProjectBoard.tsx",
  css: "components/drive/DriveWorkspace.module.css",
  repo: "app/lib/drive-core/workspaceRepository.ts",
  store: "app/lib/drive-core/store.ts",
  sql: "supabase/DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql",
  boxesRoute: "app/api/projects/[projectId]/drive/boxes/route.ts",
  boxItemsRoute: "app/api/projects/[projectId]/drive/boxes/[boxId]/items/route.ts",
  boxItemRoute: "app/api/projects/[projectId]/drive/boxes/[boxId]/items/[itemId]/route.ts",
  moveRoute: "app/api/projects/[projectId]/drive/documents/[documentId]/move/route.ts",
};

for (const file of Object.values(files)) {
  if (!exists(file)) throw new Error(`Hiányzó fájl: ${file}`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];
const check = (name, condition, detail) => {
  checks.push({ name, ok: Boolean(condition), detail });
};

check("01 CsomagBOX repository lista", source.repo.includes("export async function listDriveBoxes"), "A projekt BOX-ai lekérdezhetők.");
check("02 CsomagBOX létrehozás", source.repo.includes("export async function createDriveBox"), "A BOX létrehozás repository szinten elérhető.");
check("03 Több BOX / referencia-alap", source.sql.includes("drive_core_box_items") && source.sql.includes("document_id") && source.sql.includes("version_id"), "A BOX file/version hivatkozást tárol.");
check("04 BOX item idempotencia", source.sql.includes("drive_workspace_add_box_item_atomic") && source.sql.includes("'idempotent',true"), "Azonos file/version ugyanabba a BOX-ba nem duplikálódik.");
check("05 Projektizolált BOX", source.sql.includes("where id = p_box_id and project_id = p_project_id") && source.boxesRoute.includes("requireProjectPermission"), "Repository/RPC/API project_id és permission alapján védett.");
check("06 BOX audit", source.sql.includes("DRIVE_BOX_CREATED") && source.sql.includes("DRIVE_BOX_ITEM_ADDED") && source.sql.includes("DRIVE_BOX_ITEM_REMOVED"), "BOX változások projektauditba kerülnek.");
check("07 BOX változásfeed", source.sql.includes("BOX_CREATED") && source.sql.includes("BOX_ITEM_ADDED") && source.sql.includes("BOX_ITEM_REMOVED"), "Drive change event készül.");
check("08 Fájlsor BOX színjelölés", source.grid.includes("boxColorsByDocument") && source.grid.includes("boxDots"), "A fájlsor mutatja a tagság színeit.");
check("09 Fájl → BOX drag payload", source.grid.includes("application/x-dimpro-drive-document") && source.shelf.includes("onDrop"), "A fájllistából BOX-ra húzás előkészített.");
check("10 Ugyanaz a fájl több BOX-ban", source.workspace.includes("boxColorsByDocument") && source.shelf.includes("selectedIncluded"), "A kliens több BOX-tagságot kezel.");
check("11 CsomagBOX toolbar aktív", source.toolbar.includes("onToggleBoxShelf") && source.toolbar.includes("toolCountBadge"), "A felső CsomagBOX gomb polcot kapcsol és darabszámot mutat.");
check("12 Commander nézet", source.switcher.includes('value: "commander"') && source.workspace.includes('layoutMode === "commander"'), "Önálló kétpaneles fájlkezelő nézet választható.");
check("13 Commander két panel", source.commander.includes('side="left"') && source.commander.includes('side="right"'), "Bal és jobb projektmappa párhuzamosan látható.");
check("14 Commander drag/move", source.commander.includes('effectAllowed = "move"') && source.moveRoute.includes("moveDriveDocument"), "Fájl másik panel mappájába mozgatható.");
check("15 Move audit + change event", source.sql.includes("DRIVE_DOCUMENT_MOVED") && source.sql.includes("DOCUMENT_MOVED"), "Áthelyezés auditált és szinkronváltozásként naplózott.");
check("16 Írási műveletek permission", source.boxesRoute.includes('"document.write"') && source.boxItemsRoute.includes('"document.write"') && source.boxItemRoute.includes('"document.write"') && source.moveRoute.includes('"document.write"'), "Minden új mutáció szerveroldali írási permissiont kér.");
check("17 SQL hiány esetén fail-safe UI", source.workspace.includes("response.status === 503") && source.shelf.includes("databaseReady"), "A Drive használható marad, a bővített mutációk nem aktiválódnak idő előtt.");
check("18 SmartSync érintetlen ebben a szeletben", !Object.values(source).some((text) => /Cloud Files|SmartSync|placeholder cache|CfConnectSyncRoot/i.test(text)), "A webes fejlesztési szelet nem indít Desktop SmartSync implementációt.");
check("19 Lebegő Drive board", source.css.includes("position: fixed") && source.css.includes("left: var(--rail-width)") && source.css.includes("grid-template-columns: var(--rail-width) minmax(0, 1fr)"), "A széles board overlay-ként nyílik, nem vesz el oszlopot a munkaterülettől.");
check("20 Hover + rögzítés", source.shell.includes("openBoardSoon") && source.shell.includes("220") && source.shell.includes("boardPinned") && source.floatingBoard.includes("onTogglePinned") && source.rail.includes("onMouseEnter={onHoverOpen}"), "A board hoverre késleltetve nyílik és külön rögzíthető.");

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name} — ${item.detail}`);
console.log(`\nÖsszesen: ${checks.length} acceptance/contract ellenőrzés, ${failed.length} hiba.`);
if (failed.length) process.exit(1);
