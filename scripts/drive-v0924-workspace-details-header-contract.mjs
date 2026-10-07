import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = {
  shell: read('components/drive/DriveShell.tsx'),
  board: read('components/drive/FloatingProjectBoard.tsx'),
  personal: read('components/drive/PersonalDriveWorkspace.tsx'),
  project: read('components/drive/DriveWorkspace.tsx'),
  details: read('components/drive/DetailsPanel.tsx'),
  css: read('components/drive/DriveWorkspace.module.css'),
  tree: read('app/api/projects/[projectId]/drive/tree/route.ts'),
  build: read('components/drive/driveBuildInfo.ts'),
};

const checks = [
  ['V0.9.24 marker', files.build.includes('DRIVE_DEVELOPMENT_VERSION = "0.9.24"')],
  ['active workspace persisted', files.shell.includes('dimpro-drive-active-workspace-v1') && files.shell.includes('localStorage.setItem(DRIVE_ACTIVE_WORKSPACE_STORAGE_KEY, selectedWorkspaceId)')],
  ['persisted workspace restored before fallback', files.shell.includes('persistedWorkspaceId') && files.shell.indexOf('persistedWorkspaceId && normalized.some') < files.shell.indexOf('return normalized[0]?.id')],
  ['personal storage removed from environment card', !files.board.includes('className={styles.projectStorageMeter} data-level={storageQuota &&')],
  ['storage card available for personal and project', files.board.includes('data-workspace-storage={projectMode ? "project" : "personal"}')],
  ['personal fullscreen single click opens inspector', files.personal.includes('if (tableFullscreen) setFullTableInspectorOpen(true)')],
  ['details top action strip exists', files.details.includes('className={styles.detailsTopActions}') && files.css.includes('.detailsTopActions {')],
  ['metadata/download/QR/trash moved to top strip', files.details.includes('title="Metaadatok mentése"') && files.details.includes('title="Letöltés"') && files.details.includes('title={activeQr ? "QR azonosító aktív" : "QR létrehozása"}') && files.details.includes('title="Lomtárba helyezés"')],
  ['review save moved to top strip', files.details.includes('title="Jogosult szakaszok mentése"')],
  ['approval and rejection tones exist', files.css.includes('.detailsActionSuccess') && files.css.includes('.detailsActionDanger')],
  ['review workline is non-button status markup', files.details.includes('className={styles.reviewProgressStep} title={step.label}') && !files.details.includes('<button type="button" className={styles.reviewProgressStep')],
  ['review workline uses bar and arrow', files.details.includes('className={styles.reviewProgressBar}') && files.details.includes('className={styles.reviewProgressArrow}') && files.css.includes('.reviewProgressBar {')],
  ['project tree exposes membership email', files.tree.includes('membershipEmail: access.access.membership.email || null')],
  ['project header renders name email role badge', files.project.includes('className={styles.userIdentityText}') && files.project.includes('headerEmail') && files.project.includes('className={styles.userRoleBadge}')],
  ['role abbreviations configured', ['BPV','PV','ELL','KM','NÉZ'].every((token) => files.project.includes(`short: "${token}"`))],
  ['personal header renders name email owner badge', files.personal.includes('userDisplayName') && files.personal.includes('data-role-tone="personal"') && files.personal.includes('>TUL</span>')],
  ['role badge tone colors exist', ['owner','manager','reviewer','contributor','viewer','personal'].every((tone) => files.css.includes(`data-role-tone="${tone}"`))],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}`);
  if (!ok) failed += 1;
}
console.log(`RESULT ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
