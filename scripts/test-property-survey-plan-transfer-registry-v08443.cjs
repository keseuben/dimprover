const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }
function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName,
  }).outputText;
}

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08443-domain-'));
function compile(sourcePath, targetName, replacements = []) {
  let source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(path.join(tempDir, targetName), transpile(source, sourcePath));
}

compile('components/property-survey/propertySurveyPlanDocumentTypes.ts', 'planTypes.cjs');
compile('components/energy/domain/energyOpeningTypes.ts', 'energyOpeningTypes.cjs');
compile('components/property-survey/propertySurveyPlanEnergyTransfer.ts', 'transfer.cjs', [
  ['@/components/energy/domain/energyOpeningTypes', './energyOpeningTypes.cjs'],
]);
compile('components/property-survey/propertySurveyPlanTransferRegistry.ts', 'registry.cjs');
compile('components/property-survey/propertySurveyPlanTransferOperations.ts', 'operations.cjs', [
  ['@/components/property-survey/propertySurveyPlanEnergyTransfer', './transfer.cjs'],
  ['@/components/property-survey/propertySurveyPlanTransferRegistry', './registry.cjs'],
]);

const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const energyTypes = require(path.join(tempDir, 'energyOpeningTypes.cjs'));
const registry = require(path.join(tempDir, 'registry.cjs'));
const operations = require(path.join(tempDir, 'operations.cjs'));

const now = '2026-07-31T07:30:00.000Z';
function createPage(pageId = 'page-1', documentId = 'doc-1') {
  const page = planTypes.createSurveyPlanPage({ documentId, pageNumber: pageId === 'page-1' ? 1 : 2, levelId: 'level-ground', sourceMode: 'designPlan' });
  page.id = pageId;
  page.documentId = documentId;
  page.suggestions = [{
    id: `room-suggestion-${pageId}`, pageId, levelId: page.levelId, name: `Helyiség ${pageId}`, function: 'Lakótér',
    polygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.4 }], labelPosition: null,
    calculatedAreaSquareMeters: 24, labeledAreaSquareMeters: 24, areaDifferenceSquareMeters: 0, areaDifferencePercent: 0,
    confidence: 'high', confidenceScore: 0.95, source: 'vectorPdfRecognition', sourceDetails: 'teszt', geometryMethod: 'closedVectorContour',
    contourClosed: true, heated: true, roomHeightMeters: 2.7, status: 'approved', userModified: false, createdAt: now, updatedAt: now,
  }];
  const wall = {
    id: `wall-suggestion-${pageId}`, pageId, levelId: page.levelId,
    start: { x: 0.1, y: 0.1 }, end: { x: 0.5, y: 0.1 }, boundaryType: 'externalAir',
    orientationDegrees: 0, orientationLabel: 'É', lengthMeters: 4, heightMeters: 2.7, thicknessMeters: 0.38,
    assemblyId: 'assembly-wall-1', zoneId: 'zone-1', adjacentZoneId: '', grossAreaSquareMeters: 10.8,
    openingAreaSquareMeters: 1.8, netAreaSquareMeters: 9, connectedRoomSuggestionIds: [`room-suggestion-${pageId}`],
    confidence: 'high', confidenceScore: 0.95, source: 'vectorPdfRecognition', sourceDetails: 'külső fal', status: 'approved',
    userModified: false, createdAt: now, updatedAt: now,
  };
  const opening = {
    id: `opening-suggestion-${pageId}`, pageId, levelId: page.levelId, wallSuggestionId: wall.id,
    connectedRoomSuggestionIds: [`room-suggestion-${pageId}`], zoneId: 'zone-1', name: `Ablak ${pageId}`, kind: 'window',
    center: { x: 0.3, y: 0.1 }, offsetRatio: 0.5, widthMeters: 1.2, heightMeters: 1.5, sillHeightMeters: 0.9,
    areaSquareMeters: 1.8, frame: 'PVC', glazing: '3 rétegű üveg', uValueWm2K: '1,10',
    catalogProfileId: 'pvc-triple-template', sourceReference: 'DIMPRO sablon – ellenőrzendő', solarGValue: '0,50', shading: 'Redőny',
    thermalBridgeMode: 'installationPerimeter', installationPsiWmK: '0,040', installationPsiSourceReference: 'Csomóponti katalógus',
    confidence: 'high', confidenceScore: 0.9, source: 'userCorrected', sourceDetails: 'teszt', status: 'approved', userModified: true,
    createdAt: now, updatedAt: now,
  };
  page.wallSuggestions = [wall];
  page.openingSuggestions = [opening];
  return page;
}

function createRoom(page) {
  return {
    id: `room-${page.id}`, levelId: page.levelId, name: `Helyiség ${page.id}`, function: 'Lakótér', area: 24, height: 2.7,
    x: 90, y: 61, width: 360, depth: 183, heated: true, externalWallType: 'Külső fal', floorType: '', ceilingType: '',
    windowCount: 0, windowType: '', orientation: '', note: '', lengthMeters: 6, widthMeters: 4,
    planSuggestionId: `room-suggestion-${page.id}`,
  };
}

const page = createPage();
const room = createRoom(page);
const assembly = { id: 'assembly-wall-1', name: '38 cm fal', category: 'wall', layers: [], createdAt: now, updatedAt: now };
const zoneWorkspace = {
  schemaVersion: 1,
  zones: [{ id: 'zone-1', name: 'Lakótér', usageProfile: 'residential', serviceLevel: 'heatedNaturalVentilation', heatingSetpointC: 20, note: '', createdAt: now, updatedAt: now }],
  unheatedSpaces: [], roomAssignments: { [room.id]: 'zone-1' }, unheatedRoomAssignments: {}, createdAt: now, updatedAt: now,
};
const openingWorkspace = energyTypes.createDefaultEnergyOpeningWorkspace([]);
const transferRegistry = planTypes.createSurveyPlanTransferRegistry();
const input = { page, rooms: [room], wallSegments: [], wallOpenings: [], assemblies: [assembly], zoneWorkspace, openingWorkspace, transferRegistry };

const initialStatus = registry.buildSurveyPlanTransferPageStatus({ page, registry: transferRegistry, wallSegments: [], wallOpenings: [], openingWorkspace });
assert(initialStatus.state === 'notTransferred' && !initialStatus.record && initialStatus.source.wallCount === 1, `A kezdeti átadási állapot hibás: ${JSON.stringify(initialStatus)}`);
pass('Az új és a régi projektek tervlapja átadási rekord nélkül „Még nincs átadva” állapotból indul');

const first = operations.applyManagedSurveyPlanEnergyTransfer(input);
assert(first.canTransfer && first.transferState === 'synced' && first.transferRecord?.lastAction === 'created', `Az első kezelt átadás hibás: ${JSON.stringify(first)}`);
assert(first.transferRegistry.auditLog.length === 1 && first.transferRegistry.auditLog[0].result === 'success', 'Az első átadás auditbejegyzése hiányzik.');
pass('Az első átadás forrás- és modell-lenyomatot, szinkronállapotot és sikeres auditbejegyzést hoz létre');

const sourceChangedPage = { ...page, wallSuggestions: [{ ...page.wallSuggestions[0], heightMeters: 2.85, updatedAt: '2026-07-31T07:40:00.000Z' }] };
const sourceChangedStatus = registry.buildSurveyPlanTransferPageStatus({ page: sourceChangedPage, registry: first.transferRegistry, wallSegments: first.wallSegments, wallOpenings: first.wallOpenings, openingWorkspace: first.openingWorkspace });
assert(sourceChangedStatus.state === 'sourceChanged' && sourceChangedStatus.sourceChanged && !sourceChangedStatus.modelChanged, `A tervoldali változásjelzés hibás: ${JSON.stringify(sourceChangedStatus)}`);
pass('A jóváhagyott tervgeometria vagy energetikai adat változása „A terv megváltozott” állapotot ad');

const manuallyEditedWalls = first.wallSegments.map((wall) => ({ ...wall, measuredLengthMeters: 4.25, planTransferLocked: true, updatedAt: '2026-07-31T07:41:00.000Z' }));
const modelChangedPreview = operations.buildManagedSurveyPlanTransferPreview({ ...input, wallSegments: manuallyEditedWalls, wallOpenings: first.wallOpenings, openingWorkspace: first.openingWorkspace, transferRegistry: first.transferRegistry });
assert(modelChangedPreview.transferState === 'modelChanged' && !modelChangedPreview.canTransfer && modelChangedPreview.lockedElementCount === 1, `A központi modell konfliktusvédelme hibás: ${JSON.stringify(modelChangedPreview)}`);
assert(modelChangedPreview.issues.some((issue) => issue.code === 'PLAN_TRANSFER_MODEL_CHANGED'), 'A központi modell változásának blokkoló hibája hiányzik.');
pass('A központi fal kézi módosítása zárolt „A központi modell megváltozott” állapotot és felülírási blokkot hoz létre');

const conflictStatus = registry.buildSurveyPlanTransferPageStatus({ page: sourceChangedPage, registry: first.transferRegistry, wallSegments: manuallyEditedWalls, wallOpenings: first.wallOpenings, openingWorkspace: first.openingWorkspace });
assert(conflictStatus.state === 'conflict' && conflictStatus.sourceChanged && conflictStatus.modelChanged, `A kétoldali konfliktus felismerése hibás: ${JSON.stringify(conflictStatus)}`);
pass('A terv és a központi modell egyidejű változása külön kétoldali konfliktusként jelenik meg');

const acknowledged = registry.acknowledgeSurveyPlanModelChanges({ page, registry: first.transferRegistry, wallSegments: manuallyEditedWalls, wallOpenings: first.wallOpenings, openingWorkspace: first.openingWorkspace });
const acknowledgedStatus = registry.buildSurveyPlanTransferPageStatus({ page, registry: acknowledged.registry, wallSegments: manuallyEditedWalls, wallOpenings: first.wallOpenings, openingWorkspace: first.openingWorkspace });
assert(acknowledgedStatus.state === 'synced' && acknowledged.auditEntry.action === 'modelAccepted', `A központi modell megtartása hibás: ${JSON.stringify(acknowledgedStatus)}`);
pass('A központi kézi módosítás külön művelettel elfogadható új összehasonlítási alapként, a terv felülírása nélkül');

const conflictAgainWalls = manuallyEditedWalls.map((wall) => ({ ...wall, thicknessCm: 42, planTransferLocked: true }));
const forced = operations.applyManagedSurveyPlanEnergyTransfer({ ...input, page: sourceChangedPage, wallSegments: conflictAgainWalls, wallOpenings: first.wallOpenings.map((opening) => ({ ...opening, planTransferLocked: true })), openingWorkspace: first.openingWorkspace, transferRegistry: first.transferRegistry, conflictStrategy: 'overwrite' });
assert(forced.canTransfer && forced.transferState === 'synced' && forced.transferRecord?.lastAction === 'forcedOverwrite', `A kényszerített tervfelülírás hibás: ${JSON.stringify(forced)}`);
assert(forced.wallSegments.every((wall) => wall.planPageId !== page.id || wall.planTransferLocked === false) && forced.wallOpenings.every((opening) => opening.planPageId !== page.id || opening.planTransferLocked === false), 'A felülírás után a tervátadási zárolás nem oldódott fel.');
pass('Külön megerősített felülírás a tervből újraszinkronizálja a modellt, feloldja a kézi zárolást és auditálódik');

const secondPage = createPage('page-2', 'doc-1');
const secondRoom = createRoom(secondPage);
const workspace = planTypes.createSurveyPlanWorkspace('designPlan');
workspace.documents = [{ id: 'doc-1', fileName: 'ketoldalas.pdf', mimeType: 'application/pdf', sizeBytes: 1, dataUrl: '', fileFingerprint: 'f', pageCount: 2, pages: [sourceChangedPage, secondPage], uploadedAt: now, updatedAt: now }];
workspace.activeDocumentId = 'doc-1';
workspace.activePageId = page.id;
workspace.transferRegistry = forced.transferRegistry;
const summary = registry.buildSurveyPlanTransferRegistrySummary({ workspace, wallSegments: forced.wallSegments, wallOpenings: forced.wallOpenings, openingWorkspace: forced.openingWorkspace });
assert(summary.pages.length === 2 && summary.pages.find((item) => item.pageId === page.id)?.state === 'synced' && summary.pages.find((item) => item.pageId === secondPage.id)?.state === 'notTransferred', `A több tervlapos nyilvántartás hibás: ${JSON.stringify(summary)}`);
pass('A többoldalas és többdokumentumos munkatér minden tervlapját külön állapot- és elemszámláló sor követi');

const blockedRemoval = operations.removeSurveyPlanEnergyTransfer({ ...input, page: sourceChangedPage, rooms: [room], wallSegments: forced.wallSegments, wallOpenings: forced.wallOpenings, openingWorkspace: forced.openingWorkspace, transferRegistry: forced.transferRegistry, confirmed: false });
assert(!blockedRemoval.removed && blockedRemoval.auditEntry?.action === 'removalBlocked' && blockedRemoval.transferRegistry.auditLog.length === forced.transferRegistry.auditLog.length + 1, `A megerősítés nélküli eltávolítás nem blokkolódott/auditálódott: ${JSON.stringify(blockedRemoval)}`);
pass('Az energetikai átadás megerősítés nélkül nem távolítható el, a blokkolt kísérlet is auditálódik');

const lockedForRemoval = forced.wallSegments.map((wall) => wall.planPageId === page.id ? { ...wall, planTransferLocked: true, measuredLengthMeters: 4.4 } : wall);
const forceRequired = operations.removeSurveyPlanEnergyTransfer({ ...input, page: sourceChangedPage, rooms: [room], wallSegments: lockedForRemoval, wallOpenings: forced.wallOpenings, openingWorkspace: forced.openingWorkspace, transferRegistry: forced.transferRegistry, confirmed: true, force: false });
assert(!forceRequired.removed && forceRequired.requiresForce && forceRequired.blockedReason.includes('kényszerített'), `A kézi modellmódosítás törlésvédelme hibás: ${JSON.stringify(forceRequired)}`);
const removed = operations.removeSurveyPlanEnergyTransfer({ ...input, page: sourceChangedPage, rooms: [room], wallSegments: lockedForRemoval, wallOpenings: forced.wallOpenings, openingWorkspace: forced.openingWorkspace, transferRegistry: forceRequired.transferRegistry, confirmed: true, force: true });
assert(removed.removed && !removed.wallSegments.some((wall) => wall.planPageId === page.id) && !removed.wallOpenings.some((opening) => opening.planPageId === page.id), `A megerősített eltávolítás hibás: ${JSON.stringify(removed)}`);
assert(!removed.openingWorkspace.thermalBridges.some((bridge) => bridge.planPageId === page.id) && removed.transferRecord?.state === 'removed', 'A kapcsolt hőhíd vagy eltávolított állapot megmaradt/hiányzik.');
pass('A kézzel módosított központi elemek csak második megerősítéssel törölhetők, majd a falak, nyílászárók és hőhidak együtt eltűnnek');

const normalizedLegacy = planTypes.normalizeSurveyPlanWorkspace({ schema: 'dimpro.property-survey.plan-document.v1', surveySourceMode: 'site', documents: [], activeDocumentId: null, activePageId: null, updatedAt: now });
assert(normalizedLegacy.transferRegistry?.version === '1' && Object.keys(normalizedLegacy.transferRegistry.records).length === 0, 'A régi tervworkspace nem kapott üres átadási nyilvántartást.');
pass('A korábbi plan-document.v1 projektek sémaváltás nélkül, üres v1 átadási nyilvántartással migrálódnak');

const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPage.tsx'), 'utf8');
for (const marker of ['data-plan-transfer-registry', 'data-plan-transfer-page-status', 'data-plan-transfer-conflict-panel', 'data-plan-transfer-accept-model', 'data-plan-transfer-overwrite-confirm', 'data-plan-transfer-overwrite', 'data-plan-transfer-remove-confirm', 'data-plan-transfer-remove', 'data-plan-transfer-audit-entry']) {
  assert(workspaceSource.includes(marker), `Hiányzó v0.8.4.4.3 felületi marker: ${marker}`);
}
assert(pageSource.includes('planTransferLocked') && pageSource.includes('acknowledgePlanPageModelChanges') && pageSource.includes('removePlanPageEnergyTransfer'), 'A központi konfliktusvédelem vagy eltávolítás szülőoldali bekötése hiányzik.');
pass('A több tervlapos nyilvántartás, konfliktusfeloldás, zárolás, eltávolítás és auditnapló felülete be van kötve');

console.log(`DIMPRO Felmérő v0.8.4.4.3 átadási nyilvántartás domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
