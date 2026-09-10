#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const argValue = (name) => {
  const item = args.find((arg) => arg.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
};

const testMode = process.env.DIMPRO_RETENTION_TEST_MODE === '1';
const applyRequested = has('--apply');
const quiet = has('--quiet');
const reportFile = argValue('--report-file');
const devRoot = path.resolve(argValue('--dev-root') || '/srv/dimpro-dev');
const worktreesRoot = path.resolve(argValue('--worktrees-root') || path.join(devRoot, 'worktrees'));
const operatorRoot = path.resolve(argValue('--operator-root') || process.cwd());
const configPath = path.resolve(argValue('--config') || path.join(operatorRoot, 'config', 'dimpro-dev-storage-retention.json'));

function fail(message, code = 1) {
  console.error(`[DIMPRO worktree retention] ${message}`);
  process.exit(code);
}
function exec(file, argv, options = {}) {
  try {
    return execFileSync(file, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options }).trim();
  } catch {
    return '';
  }
}
function execStrict(file, argv, options = {}) {
  return execFileSync(file, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function real(target) {
  try { return fs.realpathSync(target); } catch { return path.resolve(target); }
}
function within(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(`${p}${path.sep}`);
}
function directChild(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return within(c, p) && path.dirname(c) === p;
}
function safeStat(target) {
  try { return fs.statSync(target); } catch { return null; }
}
function sizeBytes(target) {
  const out = exec('du', ['-sk', target]);
  return Number(out.split(/\s+/)[0] || 0) * 1024;
}
function human(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit >= 3 ? 2 : 1)} ${units[unit]}`;
}
function diskState() {
  const out = exec('df', ['-Pk', devRoot]);
  const cols = (out.split('\n').filter(Boolean).at(-1) || '').trim().split(/\s+/);
  return {
    totalBytes: Number(cols[1] || 0) * 1024,
    usedBytes: Number(cols[2] || 0) * 1024,
    freeBytes: Number(cols[3] || 0) * 1024,
    usedPercent: Number(String(cols[4] || '0').replace('%', '')),
  };
}
function git(target, argv) { return exec('git', ['-C', target, ...argv]); }
let repositoryDir = '';
function gitDir(argv) { return exec('git', ['--git-dir', repositoryDir, ...argv]); }
function isGitClean(target) { return git(target, ['status', '--porcelain=v1', '--untracked-files=normal']) === ''; }
function headCommit(target) { return git(target, ['rev-parse', 'HEAD']); }
function branchName(target) { return git(target, ['symbolic-ref', '--short', '-q', 'HEAD']); }
function headCommitMs(target) {
  const value = Number(git(target, ['log', '-1', '--format=%ct', 'HEAD']));
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
}
function gitCommonDir(target) {
  const value = git(target, ['rev-parse', '--git-common-dir']);
  if (!value) return '';
  return real(path.isAbsolute(value) ? value : path.join(target, value));
}
function listWorktrees() {
  if (!fs.existsSync(worktreesRoot)) return [];
  return fs.readdirSync(worktreesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(worktreesRoot, entry.name));
}
function latestActivityMs(target) {
  let latest = headCommitMs(target);
  for (const candidate of [target, path.join(target, 'node_modules')]) {
    const st = safeStat(candidate);
    if (st) latest = Math.max(latest, st.mtimeMs || 0);
  }
  try {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('.next')) continue;
      const st = safeStat(path.join(target, entry.name));
      if (st) latest = Math.max(latest, st.mtimeMs || 0);
    }
  } catch {}
  return latest;
}
function parseEnvFile(file) {
  const result = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) result[match[1]] = match[2];
    }
  } catch {}
  return result;
}
function familyKey(branch, name) {
  let value = String(branch || name || '').replace(/^[^/]+\//, '');
  value = value.replace(/^(?:armin|jazmin|outmin|benai|benjaminai)-/i, '');
  value = value.replace(/[-_.]20\d{6}(?:\d{2})?(?:[-_.].*)?$/i, '');
  value = value.replace(/[-_.]v\d+(?:[._-]\d+){0,3}(?:[-_.].*)?$/i, '');
  value = value.replace(/[-_.]+$/g, '').trim();
  return value || String(name || 'unclassified');
}
function regexMatches(value, patterns) {
  for (const raw of patterns || []) {
    try { if (new RegExp(raw, 'i').test(value)) return true; } catch {}
  }
  return false;
}
function scanReferenceText(roots) {
  if (testMode) return '';
  const chunks = [];
  const visit = (target, depth = 0) => {
    if (depth > 5) return;
    let entries = [];
    try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(target, entry.name);
      try {
        if (entry.isDirectory()) visit(full, depth + 1);
        else if (entry.isFile()) {
          const st = fs.statSync(full);
          if (st.size <= 2 * 1024 * 1024) chunks.push(fs.readFileSync(full, 'utf8'));
        }
      } catch {}
    }
  };
  for (const root of roots) visit(root);
  return chunks.join('\n');
}
function runningProcessCwds() {
  if (testMode) return [];
  const output = exec('bash', ['-lc', 'for p in /proc/[0-9]*/cwd; do readlink -f "$p" 2>/dev/null || true; done']);
  return output.split('\n').filter(Boolean);
}
function pm2Cwds() {
  if (testMode) return [];
  const output = exec('pm2', ['jlist']);
  if (!output) return [];
  try {
    return JSON.parse(output).map((proc) => proc?.pm2_env?.pm_cwd).filter(Boolean).map(real);
  } catch { return []; }
}
function hasPathReference(target, values) {
  return values.some((value) => within(value, target));
}

if (!fs.existsSync(configPath)) fail(`Hiányzó konfiguráció: ${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.schemaVersion !== 1) fail(`Nem támogatott retention config schema: ${config.schemaVersion}`);
const wtConfig = config.worktrees || {};
const canonicalDev = devRoot === '/srv/dimpro-dev' || devRoot.startsWith('/srv/dimpro-dev/');
if (applyRequested && !canonicalDev && !testMode) fail(`Apply csak DEV root alatt engedélyezett: ${devRoot}`);
if (applyRequested && devRoot === '/') fail('A root filesystem közvetlen célként tiltott.');
if (applyRequested && wtConfig.autoPrune !== true) fail('A worktree autoPrune nincs engedélyezve a konfigurációban.', 76);
if (!directChild(operatorRoot, worktreesRoot)) fail(`Az operator root nem közvetlen DEV worktree: ${operatorRoot}`);

repositoryDir = gitCommonDir(operatorRoot);
if (!repositoryDir || !fs.existsSync(repositoryDir)) fail(`Nem található közös Git repository: ${repositoryDir || 'nincs'}`);

const stateFile = path.join(devRoot, 'coordination', 'active-development.json');
const activeOperation = readJson(stateFile);
if (applyRequested && activeOperation && activeOperation.operation !== 'maintenance') {
  fail(`Aktív kizárólagos művelet miatt worktree apply tiltva: ${activeOperation.operation} / ${activeOperation.owner || 'unknown'}`, 75);
}

const now = Date.now();
const initialDisk = diskState();
const minInactiveHours = Math.max(24, Number(wtConfig.minInactiveHours || 336));
const keepNewestPerFamily = Math.max(1, Number(wtConfig.keepNewestPerFamily || 3));
const keepNewestMaxAgeHours = Math.max(minInactiveHours, Number(wtConfig.keepNewestMaxAgeHours || 720));
const targetFreeBytes = Math.max(1, Number(config.targetFreeGiB || 30)) * 1024 ** 3;
const backupStatusFile = path.resolve(wtConfig.backupStatusFile || '/var/log/dimpro-backup/latest-status.env');
const backupMaxAgeHours = Math.max(1, Number(wtConfig.backupMaxAgeHours || 30));
const backupStatus = parseEnvFile(backupStatusFile);
const backupFinishedMs = Date.parse(backupStatus.FINISHED_AT || '');
const backupAgeHours = Number.isFinite(backupFinishedMs) ? (now - backupFinishedMs) / 3600000 : Infinity;
const backupFresh = Number.isFinite(backupFinishedMs) && backupAgeHours >= -1 && backupAgeHours <= backupMaxAgeHours;
const archiveRefNamespace = String(wtConfig.archiveRefNamespace || 'refs/retention-archive').replace(/\/+$/g, '');
const recoveryRoot = path.resolve(wtConfig.recoveryDir || path.join(devRoot, 'coordination', 'recovery', 'worktree-retention-v3'));
const protectedNames = new Set((wtConfig.protectedNames || []).map(String));
const protectedNameRegex = wtConfig.protectedNameRegex || ['immutable'];
const protectedBranches = new Set((wtConfig.protectedBranches || ['main', 'master']).map(String));
const protectedBranchRegex = wtConfig.protectedBranchRegex || [];
const referenceText = scanReferenceText(['/etc/systemd/system', '/etc/cron.d']);
const procCwds = runningProcessCwds();
const pm2Roots = pm2Cwds();

const records = [];
for (const wt of listWorktrees()) {
  const name = path.basename(wt);
  const branch = branchName(wt);
  const head = headCommit(wt);
  const activityMs = latestActivityMs(wt);
  records.push({
    name,
    path: wt,
    branch,
    head,
    family: familyKey(branch, name),
    activityMs,
    inactiveHours: activityMs > 0 ? (now - activityMs) / 3600000 : 0,
  });
}

const familyKeeps = new Set();
const families = new Map();
for (const record of records) {
  if (!families.has(record.family)) families.set(record.family, []);
  families.get(record.family).push(record);
}
for (const familyRecords of families.values()) {
  familyRecords.sort((a, b) => b.activityMs - a.activityMs || a.name.localeCompare(b.name));
  for (const record of familyRecords.slice(0, keepNewestPerFamily)) familyKeeps.add(record.path);
}

function reasonsFor(record, dynamic = false) {
  const reasons = [];
  const wt = record.path;
  if (!directChild(wt, worktreesRoot)) reasons.push('unsafe-path');
  if (path.resolve(wt) === path.resolve(operatorRoot)) reasons.push('operator-root');
  if (gitCommonDir(wt) !== repositoryDir) reasons.push('different-git-common-dir');
  if (!isGitClean(wt)) reasons.push('dirty-worktree');
  const branch = branchName(wt);
  const head = headCommit(wt);
  if (!branch) reasons.push('detached-head');
  if (!head) reasons.push('missing-head');
  if (branch && head && gitDir(['rev-parse', `refs/heads/${branch}`]) !== head) reasons.push('branch-ref-mismatch');
  if (protectedNames.has(record.name) || regexMatches(record.name, protectedNameRegex)) reasons.push('protected-name');
  if (protectedBranches.has(branch) || regexMatches(branch, protectedBranchRegex)) reasons.push('protected-branch');
  if (familyKeeps.has(wt) && record.inactiveHours < keepNewestMaxAgeHours) reasons.push(`newest-family-${keepNewestPerFamily}`);
  if (record.inactiveHours < minInactiveHours) reasons.push(`active-within-${minInactiveHours}h`);
  const currentProcCwds = dynamic ? runningProcessCwds() : procCwds;
  const currentPm2Roots = dynamic ? pm2Cwds() : pm2Roots;
  if (hasPathReference(wt, currentProcCwds)) reasons.push('running-process');
  if (hasPathReference(wt, currentPm2Roots)) reasons.push('pm2-reference');
  if (!testMode && referenceText.includes(wt)) reasons.push('system-or-cron-reference');
  const currentState = dynamic ? readJson(stateFile) : activeOperation;
  if (String(currentState?.command || '').includes(wt)) reasons.push('active-operation');
  if (!backupFresh) reasons.push('backup-status-missing-or-stale');
  const headMs = headCommitMs(wt);
  if (backupFresh && headMs > 0 && backupFinishedMs < headMs) reasons.push('backup-precedes-head');
  return [...new Set(reasons)];
}

const candidates = [];
const protectedWorktrees = [];
for (const record of records) {
  const reasons = reasonsFor(record, false);
  const item = {
    ...record,
    inactiveHours: Math.round(record.inactiveHours * 10) / 10,
    reasons,
  };
  if (reasons.length === 0) {
    item.bytes = sizeBytes(record.path);
    candidates.push(item);
  } else {
    protectedWorktrees.push(item);
  }
}
candidates.sort((a, b) => a.activityMs - b.activityMs || a.name.localeCompare(b.name));

function archiveRefFor(name) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, '-');
  return `${archiveRefNamespace}/${date}/${safeName}`;
}
function writeRecoveryManifest(record, archiveRef) {
  fs.mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(recoveryRoot, `${stamp}-${record.name}.json`);
  const payload = {
    schemaVersion: 1,
    engine: 'DIMPRO DEV Worktree Retention V3',
    createdAt: new Date().toISOString(),
    worktree: record.path,
    name: record.name,
    branch: record.branch,
    head: record.head,
    family: record.family,
    inactiveHours: record.inactiveHours,
    archiveRef,
    backup: { snapshotId: backupStatus.SNAPSHOT_ID || null, finishedAt: backupStatus.FINISHED_AT || null },
  };
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return target;
}
function removeWorktree(record) {
  const freshReasons = reasonsFor(record, true);
  if (freshReasons.length) fail(`Worktree újraellenőrzés meghiúsult: ${record.path} :: ${freshReasons.join(',')}`, 77);
  const archiveRef = archiveRefFor(record.name);
  execStrict('git', ['--git-dir', repositoryDir, 'update-ref', archiveRef, record.head]);
  if (gitDir(['rev-parse', archiveRef]) !== record.head) fail(`Archive ref ellenőrzés sikertelen: ${archiveRef}`, 78);
  const recoveryManifest = writeRecoveryManifest(record, archiveRef);
  execStrict('git', ['--git-dir', repositoryDir, 'worktree', 'remove', record.path]);
  if (fs.existsSync(record.path)) fail(`A worktree eltávolítás után is létezik: ${record.path}`, 79);
  return { ...record, archiveRef, recoveryManifest };
}

const deleted = [];
if (applyRequested && initialDisk.freeBytes < targetFreeBytes) {
  for (const record of candidates) {
    if (diskState().freeBytes >= targetFreeBytes) break;
    deleted.push(removeWorktree(record));
  }
  exec('git', ['--git-dir', repositoryDir, 'worktree', 'prune', '--verbose']);
}

const finalDisk = diskState();
const reclaimedBytes = deleted.length > 0 ? Math.max(0, finalDisk.freeBytes - initialDisk.freeBytes) : 0;
const report = {
  schemaVersion: 1,
  engine: 'DIMPRO DEV Worktree Retention V3',
  generatedAt: new Date().toISOString(),
  mode: { apply: applyRequested, testMode },
  roots: { devRoot, worktreesRoot, operatorRoot, repositoryDir, configPath, recoveryRoot },
  thresholds: { targetFreeGiB: Number(config.targetFreeGiB || 30), minInactiveHours, keepNewestPerFamily, keepNewestMaxAgeHours, backupMaxAgeHours },
  backup: {
    statusFile: backupStatusFile,
    snapshotId: backupStatus.SNAPSHOT_ID || null,
    finishedAt: backupStatus.FINISHED_AT || null,
    ageHours: Number.isFinite(backupAgeHours) ? Math.round(backupAgeHours * 10) / 10 : null,
    fresh: backupFresh,
  },
  diskBefore: { ...initialDisk, free: human(initialDisk.freeBytes) },
  diskAfter: { ...finalDisk, free: human(finalDisk.freeBytes) },
  inventory: {
    worktreeCount: records.length,
    familyCount: families.size,
    candidateCount: candidates.length,
    candidateBytes: candidates.reduce((sum, item) => sum + (item.bytes || 0), 0),
    protectedCount: protectedWorktrees.length,
  },
  actions: {
    targetAlreadyMet: initialDisk.freeBytes >= targetFreeBytes,
    deletedCount: deleted.length,
    reclaimedBytes,
    reclaimed: human(reclaimedBytes),
    deletedWorktrees: deleted.map(({ name, path: wtPath, branch, head, family, archiveRef, recoveryManifest }) => ({ name, path: wtPath, branch, head, family, archiveRef, recoveryManifest })),
  },
  candidates: candidates.map((item) => ({ ...item, bytesHuman: human(item.bytes || 0) })),
  protectedWorktrees,
  notes: [
    'Fail-closed: bizonytalan, dirty, detached, aktív, hivatkozott vagy nem frissen mentett worktree nem törlődik.',
    `Családonként a ${keepNewestPerFamily} legfrissebb worktree ${keepNewestMaxAgeHours} óráig védett; ezután a többi biztonsági kapu dönt.`,
    'Törlés előtt archive ref és recovery manifest készül; eltávolítás kizárólag git worktree remove művelettel történik.',
    'A motor csak akkor töröl, ha a szabad hely a targetFreeGiB cél alatt van.',
  ],
};

const output = JSON.stringify(report, null, 2);
if (!quiet) console.log(output);
else console.log(JSON.stringify({
  ok: true,
  engine: report.engine,
  freeBefore: report.diskBefore.free,
  freeAfter: report.diskAfter.free,
  backupFresh: report.backup.fresh,
  worktrees: report.inventory.worktreeCount,
  families: report.inventory.familyCount,
  candidates: report.inventory.candidateCount,
  candidateBytes: human(report.inventory.candidateBytes),
  protected: report.inventory.protectedCount,
  targetAlreadyMet: report.actions.targetAlreadyMet,
  deleted: report.actions.deletedCount,
  reclaimed: report.actions.reclaimed,
}, null, 2));
if (reportFile) {
  const target = path.resolve(reportFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${output}\n`, { mode: 0o600 });
}
