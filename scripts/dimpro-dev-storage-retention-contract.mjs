#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts', 'dimpro-dev-storage-retention.mjs');
let passed = 0;
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` :: ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, '0')} ${name}${detail ? ` :: ${detail}` : ''}`);
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function touchDir(dir, ageHours) {
  fs.mkdirSync(dir, { recursive: true });
  write(path.join(dir, 'marker.txt'), dir);
  const t = new Date(Date.now() - ageHours * 3600000);
  fs.utimesSync(dir, t, t);
}
function run(root, operator, extra = [], testMode = true) {
  const args = [script, `--dev-root=${root}`, `--worktrees-root=${path.join(root, 'worktrees')}`, `--operator-root=${operator}`, `--config=${path.join(operator, 'config.json')}`, ...extra];
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, DIMPRO_RETENTION_TEST_MODE: testMode ? '1' : '0' },
  });
  return result;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-retention-contract-'));
const operator = path.join(root, 'worktrees', 'benjadmin-operator-ui-v2');
fs.mkdirSync(operator, { recursive: true });
write(path.join(operator, 'config.json'), JSON.stringify({
  schemaVersion: 1,
  warningUsedPercent: 0,
  criticalUsedPercent: 0,
  emergencyUsedPercent: 0,
  targetFreeGiB: 999999,
  builds: { keepNewestPerWorktree: 2, minAgeHours: 1, criticalMinAgeHours: 1, emergencyMinAgeHours: 1, protectedNames: ['.next'] },
  dependencies: { minInactiveHours: 24, requireCleanWorktree: true, requireMergedIntoAnyRef: ['main'], autoPrune: false },
  worktrees: { reportOnly: true, minInactiveHours: 168 },
  backups: { autoDelete: false }, artifacts: { autoDelete: false }
}, null, 2));
fs.mkdirSync(path.join(operator, '.dimprover'), { recursive: true });
write(path.join(operator, '.dimprover', 'active-next-release'), '.next-active\n');

touchDir(path.join(operator, '.next-active'), 9);
touchDir(path.join(operator, '.next-new-1'), 0.2);
touchDir(path.join(operator, '.next-new-2'), 0.4);
touchDir(path.join(operator, '.next-old-1'), 10);
touchDir(path.join(operator, '.next-old-2'), 11);
touchDir(path.join(operator, '.next-old-3'), 12);
touchDir(path.join(operator, '.next'), 15);

const worker = path.join(root, 'worktrees', 'worker-armin');
fs.mkdirSync(worker, { recursive: true });
touchDir(path.join(worker, '.next-running'), 10);
touchDir(path.join(worker, '.next-worker-new-1'), 0.2);
touchDir(path.join(worker, '.next-worker-new-2'), 0.4);
fs.mkdirSync(path.join(root, 'coordination'), { recursive: true });
write(path.join(root, 'coordination', 'active-development.json'), JSON.stringify({
  schemaVersion: 1, status: 'running', operation: 'build', owner: 'ArminAI', task: 'fixture',
  target: '.next-running', command: `systemd-run build _ ${worker} deadbeef feature/armin-fixture`
}, null, 2));

let r = run(root, operator, ['--quiet', `--report-file=${path.join(root, 'dry.json')}`]);
check('Dry-run exits 0', r.status === 0, r.stderr);
const dry = JSON.parse(fs.readFileSync(path.join(root, 'dry.json'), 'utf8'));
const names = dry.buildCandidates.map((x) => x.name).sort();
check('Dry-run finds exactly three old candidates', names.join(',') === '.next-old-1,.next-old-2,.next-old-3', names.join(','));
check('Active release is protected', !names.includes('.next-active'));
check('Newest two builds are protected', !names.includes('.next-new-1') && !names.includes('.next-new-2'));
check('Protected .next name is protected', !names.includes('.next'));
check('Active cross-worktree build target is protected', !dry.buildCandidates.some((x) => x.path === path.join(worker, '.next-running')) && dry.protectedRuntimePaths.includes(path.join(worker, '.next-running')));
check('Dry-run deletes nothing', fs.existsSync(path.join(operator, '.next-old-1')) && dry.actions.deletedBuildCount === 0);

r = run(root, operator, ['--post-build', '--apply-builds', '--quiet', `--report-file=${path.join(root, 'apply.json')}`]);
check('Fixture apply exits 0', r.status === 0, r.stderr);
const applied = JSON.parse(fs.readFileSync(path.join(root, 'apply.json'), 'utf8'));
check('Apply removes all eligible old builds', applied.actions.deletedBuildCount === 3 && !fs.existsSync(path.join(operator, '.next-old-1')) && !fs.existsSync(path.join(operator, '.next-old-2')) && !fs.existsSync(path.join(operator, '.next-old-3')));
check('Apply preserves active release', fs.existsSync(path.join(operator, '.next-active')));
check('Apply preserves newest builds', fs.existsSync(path.join(operator, '.next-new-1')) && fs.existsSync(path.join(operator, '.next-new-2')));
check('Apply preserves protected .next', fs.existsSync(path.join(operator, '.next')));
check('Apply preserves active cross-worktree build target', fs.existsSync(path.join(worker, '.next-running')));

const nonDev = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-retention-nondev-'));
const nonDevOp = path.join(nonDev, 'worktrees', 'benjadmin-operator-ui-v2');
fs.mkdirSync(nonDevOp, { recursive: true });
write(path.join(nonDevOp, 'config.json'), fs.readFileSync(path.join(operator, 'config.json')));
touchDir(path.join(nonDevOp, '.next-old'), 10);
r = run(nonDev, nonDevOp, ['--apply-builds', '--quiet'], false);
check('Apply outside DEV fails closed', r.status !== 0);
check('Fail-closed non-DEV leaves build intact', fs.existsSync(path.join(nonDevOp, '.next-old')));

const source = fs.readFileSync(script, 'utf8');
const wrapper = fs.readFileSync(path.join(repoRoot, 'scripts', 'dimpro-dev-storage-retention.sh'), 'utf8');
const buildScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'dimpro-coordinated-build.sh'), 'utf8');
const worktreeHelper = fs.readFileSync(path.join(repoRoot, 'scripts', 'dimpro-create-dev-worktree.sh'), 'utf8');
const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
check('Backups are inventory-only in V1', source.includes('"backups"') && source.includes('Backup és artifact'));
check('Dependencies require explicit prune flag', source.includes('pruneDependenciesRequested') && source.includes('--prune-dependencies'));
check('Hardlinked dependencies are protected', source.includes('shared-hardlinks'));
check('Standalone apply uses maintenance lock', wrapper.includes('dimpro-coordinated-operation.sh" maintenance'));
check('Post-build retention is wired into coordinated build', buildScript.includes('dimpro-dev-storage-retention.mjs --post-build --apply-builds'));
check('Post-build retention can be disabled explicitly', buildScript.includes('DIMPRO_AUTO_STORAGE_RETENTION'));
check('Worktree helper compares package-lock hashes', worktreeHelper.includes('sha256sum') && worktreeHelper.includes('package-lock.json'));
check('Worktree helper uses Turbopack-safe node_modules hardlinks', worktreeHelper.includes('cp -al "$OPERATOR_ROOT/node_modules"'));
check('Agent policy documents retention rule', agents.includes('BEGIN:dimpro-dev-storage-rules'));

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(nonDev, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, passed, failed: 0, contract: 'DIMPRO DEV Storage Retention V1' }, null, 2));
