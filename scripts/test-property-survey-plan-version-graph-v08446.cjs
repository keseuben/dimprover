const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }
function transpile(source, fileName) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName }).outputText;
}
const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08446-domain-'));
function compile(sourcePath, targetName, replacements = []) {
  let source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(path.join(tempDir, targetName), transpile(source, sourcePath));
}
compile('components/property-survey/propertySurveyPlanDocumentTypes.ts', 'planTypes.cjs');
compile('components/property-survey/propertySurveyPlanVersionHistory.ts', 'history.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
]);
compile('components/property-survey/propertySurveyPlanVersionGraph.ts', 'graph.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
  ['@/components/property-survey/propertySurveyPlanVersionHistory', './history.cjs'],
]);
const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const history = require(path.join(tempDir, 'history.cjs'));
const graph = require(path.join(tempDir, 'graph.cjs'));

const now = '2026-07-31T15:30:00.000Z';
function page(documentId, id) {
  const value = planTypes.createSurveyPlanPage({ documentId, pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
  value.id = id;
  value.pageLabel = 'Földszinti alaprajz';
  value.planType = 'floorPlan';
  value.contentKind = 'vector';
  return value;
}
function document(id, revisionCode, supersedesDocumentId, isCurrentVersion = false) {
  const pageValue = page(id, `${id}-page`);
  return {
    id,
    fileName: `${revisionCode}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    dataUrl: 'data:application/pdf;base64,AA==',
    fileFingerprint: `fp-${id}`,
    versionGroupId: 'group-main',
    revisionCode,
    revisionDate: revisionCode === 'R00' ? '2026-07-01' : revisionCode === 'R01' ? '2026-07-15' : '2026-07-31',
    supersedesDocumentId,
    isCurrentVersion,
    pageCount: 1,
    pages: [pageValue],
    uploadedAt: now,
    updatedAt: now,
  };
}
function comparison(id, baseDocumentId, targetDocumentId, updatedAt = now) {
  return { id, baseDocumentId, targetDocumentId, status: 'applied', pagePairs: [], createdAt: updatedAt, updatedAt, appliedAt: updatedAt };
}
function snapshot(seed) {
  const transferRegistry = planTypes.createSurveyPlanTransferRegistry();
  transferRegistry.updatedAt = now;
  return history.createSurveyPlanVersionModelSnapshot({
    rooms: [{ id: `room-${seed}`, area: seed }],
    wallSegments: [{ id: `wall-${seed}`, length: seed }],
    wallOpenings: [{ id: `opening-${seed}`, width: seed }],
    zoneWorkspace: { seed },
    openingWorkspace: { seed, openingDetails: {}, thermalBridges: [] },
    transferRegistry,
  });
}
function counts(seed = 0) {
  return { roomCreateCount: seed, roomUpdateCount: 0, roomDeleteCount: 0, wallCreateCount: 0, wallUpdateCount: 0, wallDeleteCount: 0, openingCreateCount: 0, openingUpdateCount: 0, openingDeleteCount: 0, thermalBridgeCreateCount: 0, thermalBridgeDeleteCount: 0, preservedCentralIdCount: 0 };
}
function applicationRecord({ id, comparisonId, baseDocumentId, targetDocumentId, sequenceNumber, snapshotId, snapshotBytes, parentApplicationId = '', status = 'applied', timestamp = now }) {
  return { id, comparisonId, baseDocumentId, targetDocumentId, status, sequenceNumber, parentApplicationId, counts: counts(sequenceNumber), issues: [], appliedAt: timestamp, rolledBackAt: '', sourceComparisonUpdatedAt: timestamp, rollbackSnapshotId: snapshotId, rollbackSnapshotBytes: snapshotBytes, rollbackSnapshot: null, updatedAt: timestamp };
}
function audit(record, action = 'apply') {
  return { id: `audit-${record.id}-${action}`, comparisonId: record.comparisonId, applicationId: record.id, action, result: 'success', counts: record.counts, message: `${action} teszt`, createdAt: record.updatedAt };
}

let workspace = planTypes.createSurveyPlanWorkspace('designPlan');
workspace.documents = [document('doc-r00', 'R00', ''), document('doc-r01', 'R01', 'doc-r00'), document('doc-r02', 'R02', 'doc-r01', true)];
workspace.versionComparison.comparisons['cmp-r00-r01'] = comparison('cmp-r00-r01', 'doc-r00', 'doc-r01', '2026-07-31T15:30:01.000Z');
workspace.versionComparison.comparisons['cmp-r01-r02'] = comparison('cmp-r01-r02', 'doc-r01', 'doc-r02', '2026-07-31T15:30:02.000Z');
workspace.versionComparison.activeComparisonId = 'cmp-r01-r02';

const linearGraph = graph.buildSurveyPlanVersionGraph(workspace);
assert(linearGraph.totals.documentCount === 3 && linearGraph.totals.edgeCount === 2 && linearGraph.totals.rootCount === 1 && linearGraph.totals.branchCount === 0 && linearGraph.totals.cycleCount === 0, `A lineáris R00→R01→R02 gráf hibás: ${JSON.stringify(linearGraph.totals)}`);
assert(linearGraph.nodes.find((node) => node.documentId === 'doc-r02')?.depth === 2, 'Az R02 gráfmélysége nem 2.');
pass('A három egymást követő tervverzió lineáris, navigálható R00 → R01 → R02 gráfot alkot');

const firstSnapshot = history.upsertSurveyPlanVersionModelSnapshot({ store: workspace.versionComparison.modelSnapshotStore, payload: snapshot(1), now: '2026-07-31T15:31:00.000Z' });
const firstRecord = applicationRecord({ id: 'app-r00-r01', comparisonId: 'cmp-r00-r01', baseDocumentId: 'doc-r00', targetDocumentId: 'doc-r01', sequenceNumber: 1, snapshotId: firstSnapshot.snapshotId, snapshotBytes: firstSnapshot.estimatedBytes, timestamp: '2026-07-31T15:31:00.000Z' });
workspace = history.appendSurveyPlanVersionApplication({ workspace, record: firstRecord, auditEntry: audit(firstRecord), snapshotStore: firstSnapshot.store, now: firstRecord.updatedAt });
const secondSnapshot = history.upsertSurveyPlanVersionModelSnapshot({ store: workspace.versionComparison.modelSnapshotStore, payload: snapshot(2), now: '2026-07-31T15:32:00.000Z' });
const secondRecord = applicationRecord({ id: 'app-r01-r02', comparisonId: 'cmp-r01-r02', baseDocumentId: 'doc-r01', targetDocumentId: 'doc-r02', sequenceNumber: 2, snapshotId: secondSnapshot.snapshotId, snapshotBytes: secondSnapshot.estimatedBytes, parentApplicationId: firstRecord.id, timestamp: '2026-07-31T15:32:00.000Z' });
workspace = history.appendSurveyPlanVersionApplication({ workspace, record: secondRecord, auditEntry: audit(secondRecord), snapshotStore: secondSnapshot.store, now: secondRecord.updatedAt });
assert(workspace.versionComparison.modelApplicationHistory.length === 2 && workspace.versionComparison.modelApplicationHistory[1].parentApplicationId === firstRecord.id, 'Az alkalmazási előzménylánc vagy szülőkapcsolat hibás.');
assert(workspace.versionComparison.modelApplications['cmp-r00-r01'].id === firstRecord.id && workspace.versionComparison.modelApplications['cmp-r01-r02'].id === secondRecord.id, 'Az összehasonlításonkénti aktuális alkalmazási rekord hibás.');
pass('Két egymást követő modellátvezetés külön alkalmazási rekordot, sorrendet és szülőkapcsolatot kap');

const summary = history.getSurveyPlanVersionHistorySummary({ workspace });
assert(summary.applicationCount === 2 && summary.rollbackPointCount === 2 && summary.snapshotCount === 2 && summary.storedSnapshotBytes > 0, `A snapshot- és előzményösszesítő hibás: ${JSON.stringify(summary)}`);
pass('A központi összesítő külön számolja az alkalmazásokat, rollback-pontokat, snapshotokat és tárolt méretet');

const duplicate = history.upsertSurveyPlanVersionModelSnapshot({ store: workspace.versionComparison.modelSnapshotStore, payload: snapshot(2), now: '2026-07-31T15:33:00.000Z' });
assert(duplicate.reused && duplicate.snapshotId === secondSnapshot.snapshotId && Object.keys(duplicate.store.snapshots).length === 2, 'Az azonos modellállapot nem deduplikálódott.');
pass('Az azonos modellállapot új példány helyett a meglévő snapshotot használja');

const resolvedHistorical = history.resolveSurveyPlanVersionApplication({ workspace, comparisonId: firstRecord.comparisonId, applicationId: firstRecord.id });
const resolvedSnapshot = history.resolveSurveyPlanVersionSnapshot({ workspace, record: resolvedHistorical });
assert(resolvedHistorical?.id === firstRecord.id && resolvedSnapshot?.rooms?.[0]?.id === 'room-1', 'A történeti alkalmazás vagy snapshot nem oldható fel azonosító alapján.');
pass('Bármely megőrzött történeti alkalmazás és rollback-pillanatkép azonosító alapján kiválasztható');

const rollbackAudit = { ...audit(firstRecord, 'rollback'), createdAt: '2026-07-31T15:34:00.000Z' };
const rolledBack = history.markSurveyPlanVersionApplicationRolledBack({ workspace, record: firstRecord, auditEntry: rollbackAudit, now: rollbackAudit.createdAt });
assert(rolledBack.record.status === 'rolledBack' && rolledBack.workspace.versionComparison.modelApplications[firstRecord.comparisonId].status === 'rolledBack' && rolledBack.workspace.versionComparison.modelApplicationAudit.at(-1)?.action === 'rollback', 'A történeti rollback állapot- vagy auditfrissítése hibás.');
pass('Korábbi rollback-pont kiválasztásakor a rekord és az auditnapló következetesen frissül');

let retentionWorkspace = planTypes.createSurveyPlanWorkspace('designPlan');
retentionWorkspace.documents = workspace.documents;
retentionWorkspace.versionComparison.comparisons['cmp-r00-r01'] = workspace.versionComparison.comparisons['cmp-r00-r01'];
for (let index = 1; index <= 10; index += 1) {
  const timestamp = `2026-07-31T16:${String(index).padStart(2, '0')}:00.000Z`;
  const upsert = history.upsertSurveyPlanVersionModelSnapshot({ store: retentionWorkspace.versionComparison.modelSnapshotStore, payload: snapshot(100 + index), now: timestamp });
  const record = applicationRecord({ id: `retention-${index}`, comparisonId: 'cmp-r00-r01', baseDocumentId: 'doc-r00', targetDocumentId: 'doc-r01', sequenceNumber: index, snapshotId: upsert.snapshotId, snapshotBytes: upsert.estimatedBytes, parentApplicationId: index > 1 ? `retention-${index - 1}` : '', timestamp });
  retentionWorkspace = history.appendSurveyPlanVersionApplication({ workspace: retentionWorkspace, record, auditEntry: audit(record), snapshotStore: upsert.store, now: timestamp });
}
const retentionSummary = history.getSurveyPlanVersionHistorySummary({ workspace: retentionWorkspace });
assert(retentionSummary.snapshotCount === 8 && retentionSummary.rollbackPointCount === 8 && retentionWorkspace.versionComparison.modelApplicationHistory.length === 10, `A nyolcpontos snapshot-megőrzés hibás: ${JSON.stringify(retentionSummary)}`);
assert(retentionWorkspace.versionComparison.modelApplicationHistory.slice(0, 2).every((record) => !record.rollbackSnapshotId), 'A régi alkalmazások rollback-hivatkozása nem vált audit-only állapotúvá.');
pass('Tíz alkalmazásból a legutóbbi nyolc rollback-pont marad aktív, a korábbi rekordok auditként megmaradnak');

const branchWorkspace = structuredClone(workspace);
branchWorkspace.documents.push({ ...document('doc-r01b', 'R01-B', 'doc-r00', false), revisionDate: '2026-07-20' });
const branchGraph = graph.buildSurveyPlanVersionGraph(branchWorkspace);
assert(branchGraph.totals.branchCount === 1 && branchGraph.nodes.find((node) => node.documentId === 'doc-r00')?.childDocumentIds.length === 2, 'A tervverzió-ág felismerése hibás.');
pass('Az egy alapverzióból kiinduló két új revízió külön verzióágként jelenik meg');

const cycleWorkspace = structuredClone(workspace);
cycleWorkspace.documents.find((item) => item.id === 'doc-r00').supersedesDocumentId = 'doc-r02';
const cycleGraph = graph.buildSurveyPlanVersionGraph(cycleWorkspace);
assert(cycleGraph.totals.cycleCount === 3, `A hibás revízióciklus nem látható: ${JSON.stringify(cycleGraph.totals)}`);
pass('A hibás körkörös előzménykapcsolat blokkolható ciklushibaként felismerhető');

const legacySnapshot = snapshot(55);
const legacyRaw = {
  schema: 'dimpro.property-survey.plan-document.v1',
  surveySourceMode: 'designPlan',
  documents: workspace.documents,
  activeDocumentId: 'doc-r02',
  activePageId: 'doc-r02-page',
  transferRegistry: planTypes.createSurveyPlanTransferRegistry(),
  versionComparison: {
    version: '1',
    comparisons: { 'cmp-r00-r01': workspace.versionComparison.comparisons['cmp-r00-r01'] },
    activeComparisonId: 'cmp-r00-r01',
    modelApplications: {
      'cmp-r00-r01': {
        id: 'legacy-app', comparisonId: 'cmp-r00-r01', baseDocumentId: 'doc-r00', targetDocumentId: 'doc-r01', status: 'applied', counts: counts(), issues: [], appliedAt: now, rolledBackAt: '', sourceComparisonUpdatedAt: now, rollbackSnapshot: legacySnapshot, updatedAt: now,
      },
    },
    modelApplicationAudit: [],
    updatedAt: now,
  },
  updatedAt: now,
};
const normalizedLegacy = planTypes.normalizeSurveyPlanWorkspace(legacyRaw);
const legacyRecord = normalizedLegacy.versionComparison.modelApplications['cmp-r00-r01'];
assert(legacyRecord.rollbackSnapshot === null && legacyRecord.rollbackSnapshotId && normalizedLegacy.versionComparison.modelSnapshotStore.snapshots[legacyRecord.rollbackSnapshotId], 'A v0.8.4.4.5 beágyazott snapshot nem migrálódott a deduplikált tárba.');
assert(normalizedLegacy.versionComparison.modelApplicationHistory.some((record) => record.id === 'legacy-app'), 'A régi aktuális alkalmazás nem került be az előzménylistába.');
pass('A v0.8.4.4.5 beágyazott rollback-pillanatkép automatikusan az új snapshot-tárba és előzménylistába migrálódik');

const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
assert(workspaceSource.includes('data-plan-version-graph') && workspaceSource.includes('data-plan-version-graph-node') && workspaceSource.includes('data-plan-version-application-history') && workspaceSource.includes('data-plan-version-application-record'), 'A verziógráf vagy alkalmazási előzmény felületi markerei hiányoznak.');
assert(workspaceSource.includes('v0.8.4.4.7 · Revíziócsomag és megosztási előkészítés'), 'A munkatér verziófelirata nem frissült.');
pass('A verziógráf, méretkimutatás, alkalmazási előzmény és történeti rollback felülete be van kötve');

assert(normalizedLegacy.schema === 'dimpro.property-survey.plan-document.v1' && normalizedLegacy.versionComparison.version === '1', 'A fő tervdokumentációs séma megváltozott.');
pass('A fejlesztés a plan-document.v1 és a fő .dimpro séma megváltoztatása nélkül működik');

console.log(`DIMPRO Felmérő v0.8.4.4.6 verziógráf és rollback domain teszt: ${testCount}/${testCount} sikeres`);
tests.forEach((message, index) => console.log(`${index + 1}. ${message}`));
fs.rmSync(tempDir, { recursive: true, force: true });
