import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const read = (file) => readFile(`${root}/${file}`, "utf8");
const [
  packagePanel,
  uploadPanel,
  preparation,
  rulesDialog,
  commentsApi,
  commentsPanel,
  openForm,
  pinRecovery,
  spaceRecovery,
  spaceEmail,
  packageEmail,
  projectService,
  projectApi,
  sessionApi,
  packagesApi,
] = await Promise.all([
  read("components/drop/DropSpacePackagePanel.tsx"),
  read("components/drop/DropPackageQuarantineUpload.tsx"),
  read("components/drop/dropUploadPreparation.ts"),
  read("components/drop/DropUploadRulesDialog.tsx"),
  read("app/api/drop/spaces/packages/[packageId]/comments/route.ts"),
  read("components/drop/DropPackageCommentsPanel.tsx"),
  read("components/drop/DropOpenForm.tsx"),
  read("app/lib/drop/dropPinRecovery.ts"),
  read("app/lib/drop/dropSpaceRecovery.ts"),
  read("app/lib/drop/dropSpaceEmail.ts"),
  read("app/lib/drop/dropEmail.ts"),
  read("app/lib/drop/dropSpaceProjectLinkService.ts"),
  read("app/api/drop/admin/spaces/[spaceId]/projects/route.ts"),
  read("app/api/drop/spaces/session/route.ts"),
  read("app/api/drop/spaces/packages/route.ts"),
]);

let checks = 0;
function match(value, pattern) {
  assert.match(value, pattern);
  checks += 1;
}
function notMatch(value, pattern) {
  assert.doesNotMatch(value, pattern);
  checks += 1;
}

match(packagePanel, /mini csomagkártyát/i);
match(packagePanel, /MiniPackageCard/);
match(packagePanel, /overflow-x-auto/);
match(packagePanel, /DropPackageQuarantineUpload/);
match(packagePanel, /DropUploadRulesDialog/);
match(packagePanel, /emailNotification/);
match(packagePanel, /Adminisztratív tartalék adatok/);
match(uploadPanel, /onDragEnter/);
match(uploadPanel, /onDrop/);
match(uploadPanel, /Tallózás a gépen/);
match(uploadPanel, /Eredeti: \{item\.originalName\}/);
match(uploadPanel, /Mentési név: \{item\.displayName\}/);
match(uploadPanel, /Eredeti méret/);
match(uploadPanel, /Feltöltési méret/);
match(uploadPanel, /Megtakarítás/);
match(uploadPanel, /DropPackageCommentsPanel/);
match(preparation, /createImageBitmap/);
match(preparation, /EXIF- és GPS-metaadatok eltávolítva/);
match(preparation, /minimumSavingsPercent/);
match(preparation, /package_sequence/);
match(rulesDialog, /minden csomaglétrehozásnál és minden új feltöltési munkamenetnél kötelező/i);
match(commentsApi, /comment\.write/);
match(commentsApi, /comment\.created/);
match(commentsPanel, /Az egész csomaghoz/);
match(commentsPanel, /Megjegyzés mentése/);
match(openForm, /Nem emlékszem a PIN-re/);
match(openForm, /Térbelépés helyreállítása/);
match(openForm, /Új PIN küldése e-mailben/);
match(pinRecovery, /previousPinInvalidated: true/);
match(pinRecovery, /10 \* 60_000/);
match(pinRecovery, /pinRolledBack: true/);
match(spaceRecovery, /15 \* 60_000/);
match(spaceRecovery, /space_recovery:/);
match(spaceEmail, /sendDropSpaceAcceptanceEmail/);
match(spaceEmail, /sendDropSpaceRecoveryEmail/);
match(packageEmail, /PIN \$\{formattedPin\}/);
match(packageEmail, /font-size:36px/);
match(projectService, /project_core_entity_links/);
match(projectService, /DROP_SPACE_LINKED/);
match(projectService, /DROP_SPACE_UNLINKED/);
match(projectApi, /export async function POST/);
match(projectApi, /export async function DELETE/);
match(sessionApi, /getDropGlobalUploadReadiness/);
match(packagesApi, /DROP_PACKAGE_RULES_ACCEPTANCE_REQUIRED/);
match(packagesApi, /package\.rules_accepted/);
notMatch(sessionApi, /fileUploadEnabled: false/);
notMatch(packagesApi, /fileUploadEnabled: false/);

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.6.0",
  checksPassed: checks,
  miniPackageCards: true,
  fullWidthDragDrop: true,
  clientImageOptimization: true,
  comments: true,
  packagePinRecovery: true,
  spaceRecovery: true,
  projectLinking: true,
  rulesAudit: true,
}, null, 2));
