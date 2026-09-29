import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const access = read("components/project-gate/ProjectAccessMenu.tsx");
const accessCss = read("components/project-gate/ProjectAccessMenu.module.css");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/ProjectGateShell.tsx");
const driveCss = read("components/drive/DriveWorkspace.module.css");
const gateDriveCss = read("components/project-gate/DriveWorkspace.module.css");
const permissions = read("app/lib/project-core/permissions.ts");

let pass = 0;
let fail = 0;
function check(name, ok) {
  const index = String(pass + fail + 1).padStart(2, "0");
  if (ok) { pass += 1; console.log("PASS " + index + " " + name); }
  else { fail += 1; console.error("FAIL " + index + " " + name); }
}

check("access control uses real project memberships API", access.includes("/memberships") && access.includes('credentials: "same-origin"'));
check("access menu filters ACTIVE memberships for badge", access.includes('membership.status === "ACTIVE"') && access.includes("activeMembers.length"));
check("pending invitations stay separate from active count", access.includes('membership.status === "INVITED"') && access.includes("invitedCount"));
check("access button is a real button with Users icon", access.includes("<Users") && access.includes("Projekt-hozzáférések"));
check("badge renders active access count", access.includes("styles.badge") && access.includes("{activeCount}"));
check("popover shows member display name", access.includes("member.displayName") && access.includes("secondaryLine(member)"));
check("popover shows documented project role label", access.includes("projectRoleLabel(member.role)") && permissions.includes('OWNER: "Beruházási projektvezető"'));
check("popover derives permissions from canonical role permissions", access.includes("permissionsForRole(role)") && access.includes("permissionGroups"));
check("access menu closes on Escape and outside click", access.includes('event.key === "Escape"') && access.includes('window.addEventListener("pointerdown"'));
check("access popover is responsive", accessCss.includes("@media (max-width: 640px)") && accessCss.includes("position: fixed"));

const driveHelp = drive.indexOf("> Súgó</button>");
const driveAccess = drive.indexOf("<ProjectAccessMenu", driveHelp);
const driveUser = drive.indexOf('<div className={styles.userPill}>', driveAccess);
const driveLogout = drive.indexOf("<HeaderLogoutIconButton", driveUser);
check("standalone Drive order is Help → Access → User → Logout", driveHelp >= 0 && driveHelp < driveAccess && driveAccess < driveUser && driveUser < driveLogout);
check("standalone Drive user name comes from project membership", drive.includes('membershipDisplayName || "DIMPRO felhasználó"'));
check("standalone Drive user role uses canonical role label", drive.includes("projectRoleLabel(membershipRole)"));

const gateHelp = gate.indexOf('title="Súgó"');
const gateAccess = gate.indexOf("<ProjectAccessMenu", gateHelp);
const gateUser = gate.indexOf('<div className={styles.userPill}>', gateAccess);
const gateLogout = gate.indexOf("<HeaderLogoutIconButton", gateUser);
check("Projectkapu order is Help → Access → User → Logout", gateHelp >= 0 && gateHelp < gateAccess && gateAccess < gateUser && gateUser < gateLogout);
check("Projectkapu access badge has dashboard fallback count", gate.includes("fallbackCount={activeMemberCount}"));
check("Projectkapu user keeps real displayName/displayRole", gate.includes("{displayName}") && gate.includes("{displayRole}"));

check("standalone storage meter is wider", driveCss.includes("min-width: 235px") && driveCss.includes("width: 115px"));
check("Projectkapu storage quota bar is wider", gateDriveCss.includes("max-width:220px"));
check("storage warning and critical colors remain intact", driveCss.includes('projectStorageMeter[data-level="warning"]') && driveCss.includes('projectStorageMeter[data-level="critical"]') && gateDriveCss.includes('storageQuotaBar[data-level="warning"]') && gateDriveCss.includes('storageQuotaBar[data-level="critical"]'));
check("access control component has stable marker", access.includes('data-project-access-menu="0.1.0"'));

const result = { ok: fail === 0, contract: "DIMPRO Drive V0.6.8 header access + storage polish", pass, fail };
console.log(JSON.stringify(result, null, 2));
if (fail) process.exit(1);
