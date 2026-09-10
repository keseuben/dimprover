#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const engine = path.join(repoRoot, 'scripts', 'dimpro-dev-worktree-retention-v3.mjs');
let passed = 0;
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` :: ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${name}${detail ? ` :: ${detail}` : ''}`);
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
function git(cwd, args, env = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}
function run(root, operator, config, extra = [], testMode = true) {
  return spawnSync(process.execPath, [
    engine,
    `--dev-root=${root}`,
    `--worktrees-root=${path.join(root, 'worktrees')}`,
    `--operator-root=${operator}`,
    `--config=${config}`,
    ...extra,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, DIMPRO_RETENTION_TEST_MODE: testMode ? '1' : '0' },
  });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-worktree-retention-v3-'));
const worktreesRoot = path.join(root, 'worktrees');
const operator = path.join(worktreesRoot, 'operator');
fs.mkdirSync(operator, { recursive: true });
let r = git(operator, ['init', '-b', 'main']);
check('Fixture git init succeeds', r.status === 0, r.stderr);
git(operator, ['config', 'user.name', 'DIMPRO Retention Test']);
git(operator, ['config', 'user.email', 'retention-test@localhost']);
write(path.join(operator, '.gitignore'), 'config.json\n.next*\nnode_modules\n');
write(path.join(operator, 'README.md'), 'fixture\n');
r = git(operator, ['add', '.gitignore', 'README.md']);
check('Fixture git add succeeds', r.status === 0, r.stderr);
const baseDate = new Date(Date.now() - 45 * 86400000).toISOString();
r = git(operator, ['commit', '-m', 'fixture base'], { GIT_AUTHOR_DATE: baseDate, GIT_COMMITTER_DATE: baseDate });
check('Fixture base commit succeeds', r.status === 0, r.stderr);

const created = [];
for (let i = 1; i <= 5; i += 1) {
  const name = `widget-v${i}-20260${i}01`;
  const branch = `feature/armin-widget-v${i}-20260${i}01`;
  const target = path.join(worktreesRoot, name);
  r = git(operator, ['worktree', 'add', '-b', branch, target, 'main']);
  check(`Create family worktree ${i}`, r.status === 0, r.stderr);
  const daysOld = 35 - i * 5;
  const date = new Date(Date.now() - daysOld * 86400000).toISOString();
  write(path.join(target, `marker-${i}.txt`), `${i}\n`);
  git(target, ['add', `marker-${i}.txt`]);
  r = git(target, ['commit', '-m', `widget ${i}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  check(`Commit family worktree ${i}`, r.status === 0, r.stderr);
  const t = new Date(date);
  fs.utimesSync(target, t, t);
  created.push({ i, name, branch, target, head: git(target, ['rev-parse', 'HEAD']).stdout.trim() });
}

const singleton = path.join(worktreesRoot, 'singleton-old-20260101');
r = git(operator, ['worktree', 'add', '-b', 'feature/armin-singleton-old-20260101', singleton, 'main']);
check('Create old singleton worktree', r.status === 0, r.stderr);
const singletonDate = new Date(Date.now() - 40 * 86400000).toISOString();
write(path.join(singleton, 'singleton.txt'), 'old singleton\n');
git(singleton, ['add', 'singleton.txt']);
r = git(singleton, ['commit', '-m', 'old singleton'], { GIT_AUTHOR_DATE: singletonDate, GIT_COMMITTER_DATE: singletonDate });
check('Commit old singleton worktree', r.status === 0, r.stderr);
fs.utimesSync(singleton, new Date(singletonDate), new Date(singletonDate));
const singletonHead = git(singleton, ['rev-parse', 'HEAD']).stdout.trim();

const dirty = path.join(worktreesRoot, 'dirty-old-20260101');
r = git(operator, ['worktree', 'add', '-b', 'feature/armin-dirty-old-20260101', dirty, 'main']);
check('Create dirty worktree', r.status === 0, r.stderr);
write(path.join(dirty, 'UNTRACKED.txt'), 'do not delete\n');
const old = new Date(Date.now() - 40 * 86400000);
fs.utimesSync(dirty, old, old);

const backupStatus = path.join(root, 'latest-status.env');
write(backupStatus, `SNAPSHOT_ID=test1234\nFINISHED_AT=${new Date().toISOString()}\n`);
const recoveryDir = path.join(root, 'recovery');
const config = path.join(operator, 'config.json');
write(config, JSON.stringify({
  schemaVersion: 1,
  targetFreeGiB: 999999,
  worktrees: {
    autoPrune: true,
    minInactiveHours: 24,
    keepNewestPerFamily: 3,
    keepNewestMaxAgeHours: 720,
    backupStatusFile: backupStatus,
    backupMaxAgeHours: 30,
    archiveRefNamespace: 'refs/retention-archive-test',
    recoveryDir,
    protectedNameRegex: ['immutable'],
    protectedBranches: ['main'],
  },
}, null, 2));

const dryReport = path.join(root, 'dry.json');
r = run(root, operator, config, ['--quiet', `--report-file=${dryReport}`]);
check('Dry-run exits 0', r.status === 0, r.stderr);
const dryReportJson = JSON.parse(fs.readFileSync(dryReport, 'utf8'));
const candidateNames = dryReportJson.candidates.map((x) => x.name).sort();
check('Old family worktrees plus 30d-expired singleton are candidates', candidateNames.join(',') === 'singleton-old-20260101,widget-v1-20260101,widget-v2-20260201', candidateNames.join(','));
check('Old singleton expires from newest-family protection', dryReportJson.candidates.some((x) => x.name === 'singleton-old-20260101') && !dryReportJson.protectedWorktrees.some((x) => x.name === 'singleton-old-20260101'));
check('Newest three family worktrees are protected', [3,4,5].every((i) => dryReportJson.protectedWorktrees.some((x) => x.name === `widget-v${i}-20260${i}01` && x.reasons.includes('newest-family-3'))));
check('Dirty worktree is protected', dryReportJson.protectedWorktrees.some((x) => x.name === 'dirty-old-20260101' && x.reasons.includes('dirty-worktree')));
check('Operator worktree is protected', dryReportJson.protectedWorktrees.some((x) => x.name === 'operator' && x.reasons.includes('operator-root')));
check('Fresh backup is accepted', dryReportJson.backup.fresh === true && dryReportJson.backup.snapshotId === 'test1234');
check('Dry-run deletes nothing', created.every((x) => fs.existsSync(x.target)) && fs.existsSync(singleton) && dryReportJson.actions.deletedCount === 0);

const applyReport = path.join(root, 'apply.json');
r = run(root, operator, config, ['--apply', '--quiet', `--report-file=${applyReport}`]);
check('Apply exits 0', r.status === 0, r.stderr);
const applied = JSON.parse(fs.readFileSync(applyReport, 'utf8'));
check('Apply deletes exactly three old worktrees', applied.actions.deletedCount === 3, JSON.stringify(applied.actions));
check('Old singleton worktree is gone', !fs.existsSync(singleton));
check('Oldest two worktree directories are gone', !fs.existsSync(created[0].target) && !fs.existsSync(created[1].target));
check('Newest three remain', created.slice(2).every((x) => fs.existsSync(x.target)));
check('Dirty worktree remains', fs.existsSync(dirty));
for (const item of created.slice(0, 2)) {
  const archive = `refs/retention-archive-test/${new Date().toISOString().slice(0,10).replaceAll('-','')}/${item.name}`;
  const archiveHead = git(operator, ['rev-parse', archive]).stdout.trim();
  check(`Archive ref preserved for ${item.name}`, archiveHead === item.head, archiveHead);
  check(`Local branch remains for ${item.name}`, git(operator, ['rev-parse', `refs/heads/${item.branch}`]).stdout.trim() === item.head);
}
const singletonArchive = `refs/retention-archive-test/${new Date().toISOString().slice(0,10).replaceAll('-','')}/singleton-old-20260101`;
check('Archive ref preserved for old singleton', git(operator, ['rev-parse', singletonArchive]).stdout.trim() === singletonHead);
check('Recovery manifests created', fs.existsSync(recoveryDir) && fs.readdirSync(recoveryDir).filter((x) => x.endsWith('.json')).length === 3);

// Stale backup must fail closed.
write(backupStatus, `SNAPSHOT_ID=stale000\nFINISHED_AT=${new Date(Date.now() - 72 * 3600000).toISOString()}\n`);
const staleReport = path.join(root, 'stale.json');
r = run(root, operator, config, ['--quiet', `--report-file=${staleReport}`]);
check('Stale-backup dry-run exits 0', r.status === 0, r.stderr);
const stale = JSON.parse(fs.readFileSync(staleReport, 'utf8'));
check('Stale backup is rejected', stale.backup.fresh === false);
check('Stale backup produces no deletion candidates', stale.inventory.candidateCount === 0);
check('Stale backup reason is visible', stale.protectedWorktrees.some((x) => x.reasons.includes('backup-status-missing-or-stale')));

// autoPrune=false must block apply even in test mode.
const disabledConfig = path.join(operator, 'disabled-config.json');
const disabled = JSON.parse(fs.readFileSync(config, 'utf8'));
disabled.worktrees.autoPrune = false;
write(disabledConfig, JSON.stringify(disabled, null, 2));
r = run(root, operator, disabledConfig, ['--apply', '--quiet']);
check('autoPrune=false blocks apply', r.status === 76);

// Non-DEV apply must fail closed without test mode.
r = run(root, operator, config, ['--apply', '--quiet'], false);
check('Apply outside canonical DEV fails closed', r.status !== 0);

const source = fs.readFileSync(engine, 'utf8');
const wrapper = fs.readFileSync(path.join(repoRoot, 'scripts', 'dimpro-dev-worktree-retention-v3.sh'), 'utf8');
const service = fs.readFileSync(path.join(repoRoot, 'ops', 'systemd', 'dimpro-dev-worktree-retention-v3.service'), 'utf8');
const timer = fs.readFileSync(path.join(repoRoot, 'ops', 'systemd', 'dimpro-dev-worktree-retention-v3.timer'), 'utf8');
const realConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'dimpro-dev-storage-retention.json'), 'utf8'));
check('Real config enables guarded autoPrune', realConfig.worktrees.autoPrune === true && realConfig.worktrees.reportOnly === false);
check('Real config keeps newest three per family', realConfig.worktrees.keepNewestPerFamily === 3);
check('Real config requires 14 days inactivity', realConfig.worktrees.minInactiveHours === 336);
check('Newest-family protection expires after 30 days', realConfig.worktrees.keepNewestMaxAgeHours === 720);
check('Real config requires recent backup status', realConfig.worktrees.backupStatusFile === '/var/log/dimpro-backup/latest-status.env' && realConfig.worktrees.backupMaxAgeHours === 30);
check('Engine uses git worktree remove without force', source.includes("'worktree', 'remove', record.path") && !source.includes("'--force'"));
check('Engine creates archive refs', source.includes('update-ref') && source.includes('archiveRefNamespace'));
check('Engine writes recovery manifests', source.includes('writeRecoveryManifest'));
check('Engine protects process, PM2 and system references', source.includes('running-process') && source.includes('pm2-reference') && source.includes('system-or-cron-reference'));
check('Wrapper uses maintenance coordination', wrapper.includes('dimpro-coordinated-operation.sh" maintenance'));
check('Systemd service uses canonical Grid root', service.includes('benjadmin-developer-grid-v013-outminai-20260905'));
check('Timer is persistent and Budapest scheduled', timer.includes('Persistent=true') && timer.includes('Europe/Budapest') && timer.includes('04:20:00'));

fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: 'DIMPRO DEV Worktree Retention V3' }, null, 2));
