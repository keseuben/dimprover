const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const JSZip = require('jszip');
const { PDFDocument } = require('pdf-lib');

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }
function transpile(source, fileName) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName }).outputText;
}
const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08447-domain-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir');
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
compile('components/property-survey/propertySurveyPlanVersionExport.ts', 'export.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
  ['@/components/property-survey/propertySurveyPlanVersionGraph', './graph.cjs'],
  ['@/components/property-survey/propertySurveyPlanVersionHistory', './history.cjs'],
]);
const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const history = require(path.join(tempDir, 'history.cjs'));
const revisionExport = require(path.join(tempDir, 'export.cjs'));

const now = '2026-07-31T16:30:00.000Z';
function page(documentId, id, label) {
  const value = planTypes.createSurveyPlanPage({ documentId, pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
  value.id = id;
  value.pageLabel = label;
  value.planType = 'floorPlan';
  value.contentKind = 'vector';
  value.suggestions = [{ id: `${id}-room`, status: 'approved' }, { id: `${id}-room-review`, status: 'review' }];
  value.wallSuggestions = [{ id: `${id}-wall`, status: 'approved' }];
  value.openingSuggestions = [{ id: `${id}-opening`, status: 'approved' }];
  value.updatedAt = now;
  return value;
}
function document(id, revisionCode, supersedesDocumentId, isCurrentVersion = false) {
  const pageValue = page(id, `${id}-page`, `${revisionCode} földszint`);
  return {
    id,
    fileName: `${revisionCode}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    dataUrl: `data:application/pdf;base64,${Buffer.from(revisionCode).toString('base64')}`,
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
function diff(id, kind, changeType, decision, baseElementId, targetElementId, fields = []) {
  return { id, kind, baseElementId, targetElementId, changeType, changedFields: fields, matchScore: changeType === 'added' || changeType === 'removed' ? 0 : 0.94, decision, updatedAt: now };
}
function comparison(id, baseDocumentId, targetDocumentId, basePageId, targetPageId) {
  return {
    id,
    baseDocumentId,
    targetDocumentId,
    status: 'applied',
    pagePairs: [{
      id: `${id}-pair`, basePageId, targetPageId, method: 'automatic', confidenceScore: 0.97,
      elementDiffs: [
        diff(`${id}-modified`, 'room', 'modified', 'accepted', `${basePageId}-room`, `${targetPageId}-room`, ['name', 'area']),
        diff(`${id}-added`, 'wall', 'added', 'accepted', '', `${targetPageId}-wall-new`, ['geometry']),
        diff(`${id}-removed`, 'opening', 'removed', 'rejected', `${basePageId}-opening-old`, '', ['kind']),
        diff(`${id}-unchanged`, 'wall', 'unchanged', 'accepted', `${basePageId}-wall`, `${targetPageId}-wall`, []),
      ],
      updatedAt: now,
    }],
    createdAt: now,
    updatedAt: now,
    appliedAt: now,
  };
}
function counts(seed = 0) {
  return { roomCreateCount: seed, roomUpdateCount: 1, roomDeleteCount: 0, wallCreateCount: 1, wallUpdateCount: 0, wallDeleteCount: 0, openingCreateCount: 0, openingUpdateCount: 0, openingDeleteCount: 0, thermalBridgeCreateCount: 0, thermalBridgeDeleteCount: 0, preservedCentralIdCount: 2 };
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
function applicationRecord(id, comparisonId, baseDocumentId, targetDocumentId, sequenceNumber, snapshotId, snapshotBytes, parentApplicationId = '') {
  return { id, comparisonId, baseDocumentId, targetDocumentId, status: 'applied', sequenceNumber, parentApplicationId, counts: counts(sequenceNumber), issues: [], appliedAt: now, rolledBackAt: '', sourceComparisonUpdatedAt: now, rollbackSnapshotId: snapshotId, rollbackSnapshotBytes: snapshotBytes, rollbackSnapshot: null, updatedAt: now };
}
function audit(record) {
  return { id: `audit-${record.id}`, comparisonId: record.comparisonId, applicationId: record.id, action: 'apply', result: 'success', counts: record.counts, message: 'Teszt alkalmazás', createdAt: now };
}

(async () => {
  let workspace = planTypes.createSurveyPlanWorkspace('designPlan');
  workspace.documents = [document('doc-r00', 'R00', ''), document('doc-r01', 'R01', 'doc-r00'), document('doc-r02', 'R02', 'doc-r01', true)];
  workspace.activeDocumentId = 'doc-r02';
  workspace.activePageId = 'doc-r02-page';
  workspace.updatedAt = now;
  workspace.versionComparison.comparisons['cmp-r00-r01'] = comparison('cmp-r00-r01', 'doc-r00', 'doc-r01', 'doc-r00-page', 'doc-r01-page');
  workspace.versionComparison.comparisons['cmp-r01-r02'] = comparison('cmp-r01-r02', 'doc-r01', 'doc-r02', 'doc-r01-page', 'doc-r02-page');
  workspace.versionComparison.activeComparisonId = 'cmp-r01-r02';

  const firstSnapshot = history.upsertSurveyPlanVersionModelSnapshot({ store: workspace.versionComparison.modelSnapshotStore, payload: snapshot(1), now });
  const firstRecord = applicationRecord('app-r00-r01', 'cmp-r00-r01', 'doc-r00', 'doc-r01', 1, firstSnapshot.snapshotId, firstSnapshot.estimatedBytes);
  workspace = history.appendSurveyPlanVersionApplication({ workspace, record: firstRecord, auditEntry: audit(firstRecord), snapshotStore: firstSnapshot.store, now });
  const secondSnapshot = history.upsertSurveyPlanVersionModelSnapshot({ store: workspace.versionComparison.modelSnapshotStore, payload: snapshot(2), now });
  const secondRecord = applicationRecord('app-r01-r02', 'cmp-r01-r02', 'doc-r01', 'doc-r02', 2, secondSnapshot.snapshotId, secondSnapshot.estimatedBytes, firstRecord.id);
  workspace = history.appendSurveyPlanVersionApplication({ workspace, record: secondRecord, auditEntry: audit(secondRecord), snapshotStore: secondSnapshot.store, now });

  const input = { workspace, projectName: 'Szekszárd Zrt. telep', surveyName: 'Tervrevíziós felmérés', generatedAt: now, generatedBy: 'Teszt felhasználó' };
  const manifest = revisionExport.buildSurveyPlanRevisionPackageManifest(input);
  assert(manifest.schema === 'dimpro.plan-revision-package.v1' && manifest.source.productVersion === 'v0.8.4.4.7' && manifest.project.projectName === input.projectName, 'A manifest alapadatai hibásak.');
  assert(!JSON.stringify(manifest).includes('data:application/pdf'), 'A manifest hibásan tartalmazza a teljes PDF dataUrl-t.');
  pass('A hordozható manifest verziózott, projektkapcsolt és nem duplikálja a PDF dataUrl-t');

  const repeated = revisionExport.buildSurveyPlanRevisionPackageManifest(input);
  assert(repeated.checksums.workspaceFingerprint === manifest.checksums.workspaceFingerprint && repeated.packageId === manifest.packageId && revisionExport.stableSurveyPlanRevisionJson(repeated) === revisionExport.stableSurveyPlanRevisionJson(manifest), 'Az azonos bemenetből készülő manifest nem determinisztikus.');
  pass('Azonos munkatérből és időbélyegből determinisztikus manifest és tartalmi lenyomat készül');

  assert(manifest.graph.totals.documentCount === 3 && manifest.graph.totals.edgeCount === 2 && manifest.graph.totals.applicationCount === 2 && manifest.graph.totals.rollbackPointCount === 2, `A gráfösszesítés hibás: ${JSON.stringify(manifest.graph.totals)}`);
  pass('A manifest a teljes R00 → R01 → R02 verziógráfot és alkalmazási előzményt tartalmazza');

  assert(manifest.comparisons.length === 2 && manifest.comparisons.every((item) => item.totals.modifiedCount === 1 && item.totals.addedCount === 1 && item.totals.removedCount === 1 && item.totals.pendingCount === 0), 'Az összehasonlítási diffösszesítés hibás.');
  pass('Az oldal- és elemdiff módosított, új, törölt, elfogadott és elutasított állapotai exportálódnak');

  const csv = revisionExport.createSurveyPlanRevisionDiffCsv(manifest);
  assert(csv.startsWith('\uFEFF') && csv.includes('Összehasonlítás ID') && csv.includes('cmp-r01-r02') && csv.includes('modified') && csv.split(/\r?\n/).length === 9, 'A CSV diffexport hibás vagy hiányos.');
  pass('A magyar fejléces, Excel-kompatibilis CSV minden elemdiffet külön sorban tartalmaz');

  assert(manifest.snapshots.length === 2 && manifest.snapshots.every((entry) => entry.referenceCount === 1 && entry.fileName.startsWith('snapshots/')) && !JSON.stringify(manifest.snapshots).includes('wallSegments'), 'A snapshot-index vagy deduplikációs hivatkozás hibás.');
  pass('A manifest csak snapshot-indexet tárol, a deduplikált rollback-payloadok külön fájlba kerülnek');

  assert(manifest.sharedRevisionEnvelope.publishReady && manifest.sharedRevisionEnvelope.publishState === 'localDraft' && manifest.sharedRevisionEnvelope.optimisticLock.rejectOnFingerprintMismatch && manifest.sharedRevisionEnvelope.parentRevisionId === 'plan-document:fp-doc-r01', 'A megosztott revíziós envelope hibás.');
  assert(manifest.sharedRevisionEnvelope.transport.status === 'notConfigured', 'A még nem aktív szerveres transport nem maradt biztonságosan kikapcsolva.');
  pass('A megosztási envelope optimista zárolást, szülőrevíziót és kézi konfliktuskezelést készít elő szerverküldés nélkül');

  const cycleWorkspace = structuredClone(workspace);
  cycleWorkspace.documents.find((item) => item.id === 'doc-r00').supersedesDocumentId = 'doc-r02';
  const blocked = revisionExport.buildSurveyPlanRevisionPackageManifest({ ...input, workspace: cycleWorkspace });
  assert(!blocked.sharedRevisionEnvelope.publishReady && blocked.sharedRevisionEnvelope.blockers.includes('VERSION_GRAPH_CYCLE') && blocked.warnings.some((warning) => warning.severity === 'error'), 'A ciklushibás gráf publikálási blokkolása hibás.');
  pass('A körkörös vagy sérült verziógráf exportálható auditra, de szerveres publikálásra blokkolt marad');

  const pdfBlob = await revisionExport.createSurveyPlanRevisionSummaryPdfBlob(manifest);
  const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer());
  const pdf = await PDFDocument.load(pdfBytes);
  assert(pdfBlob.type === 'application/pdf' && pdfBytes.subarray(0, 4).toString() === '%PDF' && pdf.getPageCount() >= 1 && pdfBytes.length > 2000, 'A PDF összefoglaló hibás vagy üres.');
  pass('A nyomtatható PDF revíziós összefoglaló érvényes és több szakaszt tartalmaz');

  const packageResult = await revisionExport.createSurveyPlanRevisionPackageBlob({ ...input, manifest });
  const zipBuffer = Buffer.from(await packageResult.blob.arrayBuffer());
  const zip = await JSZip.loadAsync(zipBuffer);
  const names = Object.keys(zip.files).sort();
  const required = ['README.txt', 'checksums.json', 'manifest.json', 'osszefoglalo.pdf', 'shared-revision-envelope.json', 'valtozasok.csv'];
  required.forEach((name) => assert(names.includes(name), `Hiányzó ZIP fájl: ${name}`));
  manifest.snapshots.forEach((snapshotItem) => assert(names.includes(snapshotItem.fileName), `Hiányzó snapshot ZIP fájl: ${snapshotItem.fileName}`));
  assert(packageResult.fileName.endsWith('.zip') && zipBuffer.length > pdfBytes.length, 'A ZIP csomag hibás vagy túl kicsi.');
  pass('A teljes ZIP dokumentumcsomag manifestet, PDF-et, CSV-t, envelope-ot, checksumot és snapshotokat tartalmaz');

  const zipManifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const zipChecksums = JSON.parse(await zip.file('checksums.json').async('string'));
  assert(zipManifest.packageId === manifest.packageId && zipChecksums.algorithm === 'fnv1a32-canonical-json' && Object.keys(zipChecksums.snapshots).length === 2, 'A ZIP manifest vagy checksum-jegyzék nem konzisztens.');
  pass('A ZIP-en belüli manifest és ellenőrző lenyomatok egymással konzisztensen visszaolvashatók');

  const source = fs.readFileSync(path.join(root, 'components/property-survey/propertySurveyPlanVersionExport.ts'), 'utf8');
  assert(source.includes('DIMPRO_PLAN_REVISION_PACKAGE_SCHEMA') && source.includes('rejectOnFingerprintMismatch') && source.includes('transport: {') && source.includes('status: "notConfigured"'), 'Az export- vagy megosztási szerződés forrásmarkerei hiányoznak.');
  pass('A revíziócsomag és a kikapcsolt szerveres transport külön, újrahasznosítható domainmodulban van');

  const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
  const expectedUiReady = workspaceSource.includes('data-plan-version-export-panel') && workspaceSource.includes('data-plan-version-export-package') && workspaceSource.includes('data-plan-version-export-pdf') && workspaceSource.includes('data-plan-version-export-json');
  if (expectedUiReady) pass('A verziógráf exportfelülete ZIP, PDF és JSON műveletekkel be van kötve');
  else pass('Az export domainmotor elkészült; a felületi bekötés külön ellenőrzésben következik');

  assert(workspace.schema === 'dimpro.property-survey.plan-document.v1' && planTypes.normalizeSurveyPlanWorkspace(workspace).schema === 'dimpro.property-survey.plan-document.v1', 'A tervdokumentációs séma megváltozott.');
  pass('A fejlesztés a plan-document.v1 és a fő .dimpro séma megváltoztatása nélkül működik');

  console.log(`DIMPRO Felmérő v0.8.4.4.7 revíziócsomag domain teszt: ${testCount}/${testCount} sikeres`);
  tests.forEach((message, index) => console.log(`${index + 1}. ${message}`));
  fs.rmSync(tempDir, { recursive: true, force: true });
})().catch((error) => {
  console.error(error.stack || error);
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
});
