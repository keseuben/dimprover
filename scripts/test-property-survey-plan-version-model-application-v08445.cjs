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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08445-domain-'));
function compile(sourcePath, targetName, replacements = []) {
  let source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(path.join(tempDir, targetName), transpile(source, sourcePath));
}
compile('components/property-survey/propertySurveyPlanDocumentTypes.ts', 'planTypes.cjs');
compile('components/energy/domain/energyOpeningTypes.ts', 'energyOpeningTypes.cjs');
compile('components/property-survey/propertySurveyPlanEnergyTransfer.ts', 'planTransfer.cjs', [
  ['@/components/energy/domain/energyOpeningTypes', './energyOpeningTypes.cjs'],
]);
compile('components/property-survey/propertySurveyPlanTransferRegistry.ts', 'transferRegistry.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
]);
compile('components/property-survey/propertySurveyPlanVersionHistory.ts', 'versionHistory.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
]);
compile('components/property-survey/propertySurveyPlanVersionModelApplication.ts', 'application.cjs', [
  ['@/components/energy/domain/energyOpeningTypes', './energyOpeningTypes.cjs'],
  ['@/components/property-survey/propertySurveyPlanEnergyTransfer', './planTransfer.cjs'],
  ['@/components/property-survey/propertySurveyPlanTransferRegistry', './transferRegistry.cjs'],
  ['@/components/property-survey/propertySurveyPlanVersionHistory', './versionHistory.cjs'],
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
]);
const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const energyTypes = require(path.join(tempDir, 'energyOpeningTypes.cjs'));
const planTransfer = require(path.join(tempDir, 'planTransfer.cjs'));
const application = require(path.join(tempDir, 'application.cjs'));

const now = '2026-07-31T10:45:00.000Z';
function roomSuggestion(id, pageId, name, x, y, width, height, area) {
  return { id, pageId, levelId: 'level-ground', name, function: name, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], labelPosition: null, calculatedAreaSquareMeters: area, labeledAreaSquareMeters: area, areaDifferenceSquareMeters: 0, areaDifferencePercent: 0, confidence: 'high', confidenceScore: 0.96, source: 'userCorrected', sourceDetails: 'v08445 teszt', geometryMethod: 'manualPolygon', contourClosed: true, heated: true, roomHeightMeters: 2.7, status: 'approved', userModified: true, createdAt: now, updatedAt: now };
}
function wallSuggestion(id, pageId, roomId, x1, x2, length) {
  return { id, pageId, levelId: 'level-ground', start: { x: x1, y: 0.1 }, end: { x: x2, y: 0.1 }, boundaryType: 'externalAir', orientationDegrees: 0, orientationLabel: 'É', lengthMeters: length, heightMeters: 2.7, thicknessMeters: 0.38, assemblyId: 'assembly-wall', zoneId: 'zone-1', adjacentZoneId: '', grossAreaSquareMeters: length * 2.7, openingAreaSquareMeters: 1.8, netAreaSquareMeters: length * 2.7 - 1.8, connectedRoomSuggestionIds: [roomId], confidence: 'high', confidenceScore: 0.95, source: 'userCorrected', sourceDetails: 'v08445 tesztfal', status: 'approved', userModified: true, createdAt: now, updatedAt: now };
}
function openingSuggestion(id, pageId, wallId, roomId, name, width) {
  return { id, pageId, levelId: 'level-ground', wallSuggestionId: wallId, connectedRoomSuggestionIds: [roomId], zoneId: 'zone-1', name, kind: 'window', center: { x: 0.25, y: 0.1 }, offsetRatio: 0.5, widthMeters: width, heightMeters: 1.5, sillHeightMeters: 0.9, areaSquareMeters: width * 1.5, frame: 'PVC', glazing: '3 rétegű üveg', uValueWm2K: '1,10', catalogProfileId: 'custom', sourceReference: 'Gyártói adatlap', solarGValue: '0,50', shading: 'Nincs', thermalBridgeMode: 'separateEdges', installationPsiWmK: '0,040', installationPsiSourceReference: 'Csomóponti katalógus', confidence: 'high', confidenceScore: 0.93, source: 'userCorrected', sourceDetails: 'v08445 tesztnyílászáró', status: 'approved', userModified: true, createdAt: now, updatedAt: now };
}
function page(documentId, id, label) {
  const result = planTypes.createSurveyPlanPage({ documentId, pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
  result.id = id; result.pageLabel = label; result.contentKind = 'vector'; result.planType = 'floorPlan'; return result;
}
function document(id, revisionCode, pageValue) {
  return { id, fileName: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 1000, dataUrl: 'data:application/pdf;base64,AA==', fileFingerprint: `fp-${id}`, versionGroupId: 'version-group-1', revisionCode, revisionDate: revisionCode === 'R00' ? '2026-07-01' : '2026-07-31', supersedesDocumentId: revisionCode === 'R01' ? 'doc-base' : '', isCurrentVersion: revisionCode === 'R01', pageCount: 1, pages: [pageValue], uploadedAt: now, updatedAt: now };
}
function centralRoom(id, pageId, suggestion) {
  return { id, levelId: 'level-ground', name: suggestion.name, function: suggestion.function, area: suggestion.calculatedAreaSquareMeters, height: 2.7, x: suggestion.polygon[0].x * 900, y: suggestion.polygon[0].y * 610, width: 180, depth: 120, heated: true, externalWallType: 'Külső fal', floorType: '', ceilingType: '', windowCount: 0, windowType: '', orientation: '', note: '', planDocumentId: pageId === 'base-page' ? 'doc-base' : 'doc-target', planPageId: pageId, planSuggestionId: suggestion.id };
}
function diff(id, kind, baseElementId, targetElementId, changeType, decision) {
  return { id, kind, baseElementId, targetElementId, changeType, changedFields: [changeType], matchScore: baseElementId && targetElementId ? 0.95 : 0, decision, updatedAt: now };
}

const basePage = page('doc-base', 'base-page', 'Földszinti alaprajz');
const targetPage = page('doc-target', 'target-page', 'Földszinti alaprajz');
const baseRooms = [
  roomSuggestion('base-room-a', basePage.id, 'Nappali', 0.08, 0.1, 0.22, 0.2, 24),
  roomSuggestion('base-room-b', basePage.id, 'Kamra', 0.36, 0.1, 0.16, 0.2, 8),
  roomSuggestion('base-room-c', basePage.id, 'Dolgozó', 0.58, 0.1, 0.2, 0.2, 15),
];
const targetRooms = [
  roomSuggestion('target-room-a', targetPage.id, 'Nappali-étkező', 0.08, 0.1, 0.25, 0.2, 27),
  roomSuggestion('target-room-d', targetPage.id, 'Új szoba', 0.36, 0.1, 0.18, 0.2, 11),
];
basePage.suggestions = baseRooms;
targetPage.suggestions = targetRooms;
basePage.wallSuggestions = [
  wallSuggestion('base-wall-a', basePage.id, 'base-room-a', 0.08, 0.30, 5),
  wallSuggestion('base-wall-b', basePage.id, 'base-room-b', 0.36, 0.52, 3.2),
  wallSuggestion('base-wall-c', basePage.id, 'base-room-c', 0.58, 0.78, 4),
];
targetPage.wallSuggestions = [
  wallSuggestion('target-wall-a', targetPage.id, 'target-room-a', 0.08, 0.33, 5.4),
  wallSuggestion('target-wall-d', targetPage.id, 'target-room-d', 0.36, 0.54, 3.6),
];
basePage.openingSuggestions = [
  openingSuggestion('base-opening-a', basePage.id, 'base-wall-a', 'base-room-a', 'Nappali ablak', 1.2),
  openingSuggestion('base-opening-b', basePage.id, 'base-wall-b', 'base-room-b', 'Kamra ablak', 0.8),
  openingSuggestion('base-opening-c', basePage.id, 'base-wall-c', 'base-room-c', 'Dolgozó ablak', 1.0),
];
targetPage.openingSuggestions = [
  openingSuggestion('target-opening-a', targetPage.id, 'target-wall-a', 'target-room-a', 'Nappali nagy ablak', 1.5),
  openingSuggestion('target-opening-d', targetPage.id, 'target-wall-d', 'target-room-d', 'Új szoba ablak', 1.0),
];
const comparisonId = 'comparison-v08445';
const pairId = 'pair-v08445';
const elementDiffs = [
  diff('diff-room-a', 'room', 'base-room-a', 'target-room-a', 'modified', 'accepted'),
  diff('diff-room-b', 'room', 'base-room-b', '', 'removed', 'accepted'),
  diff('diff-room-c', 'room', 'base-room-c', '', 'removed', 'rejected'),
  diff('diff-room-d', 'room', '', 'target-room-d', 'added', 'accepted'),
  diff('diff-wall-a', 'wall', 'base-wall-a', 'target-wall-a', 'modified', 'accepted'),
  diff('diff-wall-b', 'wall', 'base-wall-b', '', 'removed', 'accepted'),
  diff('diff-wall-c', 'wall', 'base-wall-c', '', 'removed', 'rejected'),
  diff('diff-wall-d', 'wall', '', 'target-wall-d', 'added', 'accepted'),
  diff('diff-opening-a', 'opening', 'base-opening-a', 'target-opening-a', 'modified', 'accepted'),
  diff('diff-opening-b', 'opening', 'base-opening-b', '', 'removed', 'accepted'),
  diff('diff-opening-c', 'opening', 'base-opening-c', '', 'removed', 'rejected'),
  diff('diff-opening-d', 'opening', '', 'target-opening-d', 'added', 'accepted'),
];
const workspace = planTypes.createSurveyPlanWorkspace('designPlan');
workspace.documents = [document('doc-base', 'R00', basePage), document('doc-target', 'R01', targetPage)];
workspace.activeDocumentId = 'doc-target'; workspace.activePageId = targetPage.id;
workspace.versionComparison.comparisons[comparisonId] = { id: comparisonId, baseDocumentId: 'doc-base', targetDocumentId: 'doc-target', status: 'applied', pagePairs: [{ id: pairId, basePageId: basePage.id, targetPageId: targetPage.id, method: 'automatic', confidenceScore: 1, elementDiffs, updatedAt: now }], createdAt: now, updatedAt: now, appliedAt: now };
workspace.versionComparison.activeComparisonId = comparisonId;
workspace.transferRegistry.records[basePage.id] = { pageId: basePage.id, documentId: 'doc-base', state: 'synced', lastAction: 'created', lastTransferId: 'base-transfer', lastTransferredAt: now, sourceFingerprint: 'base-source', modelFingerprint: 'base-model', sourceWallSuggestionIds: basePage.wallSuggestions.map((item) => item.id), sourceOpeningSuggestionIds: basePage.openingSuggestions.map((item) => item.id), centralWallIds: [], centralOpeningIds: [], centralThermalBridgeIds: [], wallCount: 3, openingCount: 3, thermalBridgeCount: 9, updatedAt: now };
const rooms = baseRooms.map((suggestion, index) => centralRoom(`central-room-${index + 1}`, basePage.id, suggestion));
const assembly = { id: 'assembly-wall', name: '38 cm tesztfal', category: 'wall', layers: [], createdAt: now, updatedAt: now };
const zoneWorkspace = { schemaVersion: 1, zones: [{ id: 'zone-1', name: 'Lakótér', usageProfile: 'residential', serviceLevel: 'heatedNaturalVentilation', heatingSetpointC: 20, note: '', createdAt: now, updatedAt: now }], unheatedSpaces: [], roomAssignments: Object.fromEntries(rooms.map((item) => [item.id, 'zone-1'])), unheatedRoomAssignments: {}, createdAt: now, updatedAt: now };
const initialOpeningWorkspace = energyTypes.createDefaultEnergyOpeningWorkspace([]);
const baseTransfer = planTransfer.applySurveyPlanEnergyTransfer({ page: basePage, rooms, wallSegments: [], wallOpenings: [], assemblies: [assembly], zoneWorkspace, openingWorkspace: initialOpeningWorkspace });
assert(baseTransfer.canTransfer && baseTransfer.wallSegments.length === 3 && baseTransfer.wallOpenings.length === 3 && baseTransfer.openingWorkspace.thermalBridges.length === 9, 'A teszt kiinduló központi modellje nem készült el.');
pass('A korábbi tervverzió három falból, három nyílászáróból és kilenc hőhídból álló központi modellt kap');

const input = { workspace, comparisonId, rooms: baseTransfer.rooms, wallSegments: baseTransfer.wallSegments, wallOpenings: baseTransfer.wallOpenings, assemblies: [assembly], zoneWorkspace: baseTransfer.zoneWorkspace, openingWorkspace: baseTransfer.openingWorkspace };
const preview = application.buildSurveyPlanVersionModelApplicationPreview(input);
assert(preview.canApply && preview.requiresConfirmation && preview.blockingIssueCount === 0, `Az átvezetési előnézet hibás: ${JSON.stringify(preview.issues)}`);
assert(preview.counts.roomCreateCount === 1 && preview.counts.roomUpdateCount === 1 && preview.counts.roomDeleteCount === 1, `A helyiségműveletek számlálása hibás: ${JSON.stringify(preview.counts)}`);
assert(preview.counts.wallCreateCount === 1 && preview.counts.wallUpdateCount === 1 && preview.counts.wallDeleteCount === 1 && preview.counts.openingCreateCount === 1 && preview.counts.openingUpdateCount === 1 && preview.counts.openingDeleteCount === 1, `A fal/nyílászáró műveletszám hibás: ${JSON.stringify(preview.counts)}`);
assert(preview.counts.preservedCentralIdCount === 2 && preview.counts.thermalBridgeCreateCount === 6 && preview.counts.thermalBridgeDeleteCount === 6, `Az ID- és hőhídszámlálás hibás: ${JSON.stringify(preview.counts)}`);
pass('Az előnézet külön számolja a létrehozott, frissített, törölt és stabil ID-val megőrzött központi elemeket');

const blocked = application.applySurveyPlanVersionModelApplication({ ...input, confirmed: false });
assert(!blocked.applied && blocked.workspace.versionComparison.modelApplicationAudit.at(-1)?.result === 'blocked', 'Megerősítés nélkül a törlést tartalmazó átvezetés nem blokkolódott vagy nem auditálódott.');
assert(blocked.wallSegments.length === input.wallSegments.length && blocked.wallOpenings.length === input.wallOpenings.length, 'A blokkolt kísérlet módosította a központi modellt.');
pass('Az elfogadott törléseket tartalmazó átvezetés külön megerősítés nélkül blokkolt és auditált');

const oldWallA = input.wallSegments.find((item) => item.planWallSuggestionId === 'base-wall-a');
const oldOpeningA = input.wallOpenings.find((item) => item.planOpeningSuggestionId === 'base-opening-a');
const applied = application.applySurveyPlanVersionModelApplication({ ...input, confirmed: true });
assert(applied.applied && applied.applicationRecord?.status === 'applied' && applied.applicationRecord.rollbackSnapshotId && applied.workspace.versionComparison.modelSnapshotStore.snapshots[applied.applicationRecord.rollbackSnapshotId], 'A megerősített átvezetés vagy deduplikált rollback-pillanatkép hiányzik.');
assert(applied.rooms.some((item) => item.planSuggestionId === 'target-room-a' && item.id === 'central-room-1') && applied.rooms.some((item) => item.planSuggestionId === 'target-room-d'), 'A módosított és új helyiség átvezetése hibás.');
assert(!applied.rooms.some((item) => item.planSuggestionId === 'base-room-b') && applied.rooms.some((item) => item.planSuggestionId === 'base-room-c'), 'Az elfogadott és elutasított helyiségtörlés nem különült el.');
pass('Az elfogadott helyiségmódosítás, új helyiség és törlés átvezetődik, az elutasított törlés megmarad');

const migratedWallA = applied.wallSegments.find((item) => item.planWallSuggestionId === 'target-wall-a');
const migratedOpeningA = applied.wallOpenings.find((item) => item.planOpeningSuggestionId === 'target-opening-a');
assert(migratedWallA?.id === oldWallA?.id && migratedOpeningA?.id === oldOpeningA?.id, 'A párosított fal vagy nyílászáró központi azonosítója megváltozott.');
assert(applied.wallSegments.filter((item) => item.id === oldWallA.id).length === 1 && applied.wallOpenings.filter((item) => item.id === oldOpeningA.id).length === 1, 'A stabil központi azonosító duplikálódott.');
assert(!applied.wallSegments.some((item) => item.planWallSuggestionId === 'base-wall-b') && applied.wallSegments.some((item) => item.planWallSuggestionId === 'base-wall-c') && applied.wallSegments.some((item) => item.planWallSuggestionId === 'target-wall-d'), 'A falak részleges migrációja hibás.');
assert(!applied.wallOpenings.some((item) => item.planOpeningSuggestionId === 'base-opening-b') && applied.wallOpenings.some((item) => item.planOpeningSuggestionId === 'base-opening-c') && applied.wallOpenings.some((item) => item.planOpeningSuggestionId === 'target-opening-d'), 'A nyílászárók részleges migrációja hibás.');
pass('A párosított fal és nyílászáró stabil központi ID-val frissül, az elfogadott új/törölt és elutasított elemek helyesen különülnek el');

assert(applied.openingWorkspace.openingDetails[oldOpeningA.id]?.planOpeningSuggestionId === 'target-opening-a', 'A központi energetikai nyílászáró-részlet forrásazonosítója nem migrálódott.');
assert(applied.openingWorkspace.thermalBridges.length === 9 && applied.openingWorkspace.thermalBridges.some((item) => item.planOpeningSuggestionId === 'base-opening-c') && applied.openingWorkspace.thermalBridges.some((item) => item.planOpeningSuggestionId === 'target-opening-d'), 'A hőhídcsere vagy elutasított hőhíd megőrzése hibás.');
pass('A nyílászáró-részletek és hőhidak forráskapcsolata együtt migrálódik');

assert(!applied.workspace.transferRegistry.records[basePage.id] && applied.workspace.transferRegistry.records[targetPage.id]?.state === 'synced', 'A tervlap-szintű átadási nyilvántartás nem költözött az új verzióra.');
assert(applied.workspace.versionComparison.modelApplicationAudit.at(-1)?.action === 'apply', 'Az alkalmazási auditbejegyzés hiányzik.');
pass('A transfer registry az új tervlapra kerül és az alkalmazás külön auditbejegyzést kap');

const second = application.applySurveyPlanVersionModelApplication({ ...input, workspace: applied.workspace, rooms: applied.rooms, wallSegments: applied.wallSegments, wallOpenings: applied.wallOpenings, zoneWorkspace: applied.zoneWorkspace, openingWorkspace: applied.openingWorkspace, confirmed: true });
assert(second.applied && new Set(second.rooms.map((item) => item.id)).size === second.rooms.length && new Set(second.wallSegments.map((item) => item.id)).size === second.wallSegments.length && new Set(second.wallOpenings.map((item) => item.id)).size === second.wallOpenings.length, 'Az ismételt alkalmazás duplikált elemeket hozott létre.');
assert(second.applicationRecord.rollbackSnapshotId === applied.applicationRecord.rollbackSnapshotId && second.workspace.versionComparison.modelSnapshotStore.snapshots[second.applicationRecord.rollbackSnapshotId].payload.rooms.length === input.rooms.length, 'Az ismételt alkalmazás felülírta vagy duplikálta az eredeti rollback-pillanatképet.');
pass('Az ismételt alkalmazás idempotens és megőrzi az első alkalmazás előtti rollback-pontot');

const rolledBack = application.rollbackSurveyPlanVersionModelApplication({ ...input, workspace: second.workspace, rooms: second.rooms, wallSegments: second.wallSegments, wallOpenings: second.wallOpenings, zoneWorkspace: second.zoneWorkspace, openingWorkspace: second.openingWorkspace, confirmed: true });
assert(rolledBack.rolledBack && rolledBack.applicationRecord?.status === 'rolledBack', 'A rollback nem futott le.');
assert(JSON.stringify(rolledBack.wallSegments) === JSON.stringify(input.wallSegments) && JSON.stringify(rolledBack.wallOpenings) === JSON.stringify(input.wallOpenings) && JSON.stringify(rolledBack.rooms) === JSON.stringify(input.rooms), 'A rollback nem állította vissza pontosan a kiinduló központi modellt.');
assert(rolledBack.workspace.transferRegistry.records[basePage.id] && !rolledBack.workspace.transferRegistry.records[targetPage.id], 'A rollback nem állította vissza az átadási nyilvántartást.');
pass('A teljes helyiség-, fal-, nyílászáró-, hőhíd- és transfer registry állapot visszaállítható');

const lockedWalls = input.wallSegments.map((item) => item.planWallSuggestionId === 'base-wall-a' ? { ...item, planTransferLocked: true } : item);
const lockedPreview = application.buildSurveyPlanVersionModelApplicationPreview({ ...input, wallSegments: lockedWalls });
assert(!lockedPreview.canApply && lockedPreview.issues.some((issue) => issue.code === 'VERSION_MODEL_WALL_LOCKED' && issue.blocking), 'A kézzel módosított központi fal nem blokkolta az átvezetést.');
pass('A zárolt, kézzel módosított központi fal megakadályozza a csendes tervverzió-átvezetést');

const dependencyWorkspace = structuredClone(workspace);
const dependencyComparison = dependencyWorkspace.versionComparison.comparisons[comparisonId];
dependencyComparison.pagePairs[0].elementDiffs.find((item) => item.id === 'diff-room-a').decision = 'rejected';
const dependencyPreview = application.buildSurveyPlanVersionModelApplicationPreview({ ...input, workspace: dependencyWorkspace });
assert(dependencyPreview.issues.some((issue) => issue.code === 'VERSION_MODEL_WALL_DEPENDENCY_RETAINED') && dependencyPreview.issues.some((issue) => issue.code === 'VERSION_MODEL_OPENING_DEPENDENCY_RETAINED'), 'A visszautasított célhelyiség függő fal/nyílászáró figyelmeztetése hiányzik.');
pass('A visszautasított helyiséghez tartozó fal és nyílászáró nem migrálódik önállóan');

const legacy = planTypes.normalizeSurveyPlanWorkspace({ schema: 'dimpro.property-survey.plan-document.v1', surveySourceMode: 'designPlan', documents: [], activeDocumentId: null, activePageId: null, transferRegistry: planTypes.createSurveyPlanTransferRegistry(), updatedAt: now });
assert(legacy.versionComparison.version === '1' && Object.keys(legacy.versionComparison.modelApplications).length === 0 && legacy.versionComparison.modelApplicationAudit.length === 0, 'A régi projekt migrációs nyilvántartása hibás.');
pass('A korábbi plan-document.v1 projekt sémaváltás nélkül üres modellátvezetési nyilvántartással migrálódik');

const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPage.tsx'), 'utf8');
assert(workspaceSource.includes('data-plan-version-model-application') && workspaceSource.includes('data-plan-version-model-confirm') && workspaceSource.includes('data-plan-version-model-rollback') && workspaceSource.includes('Átvezetési auditnapló'), 'A modellátvezetési felület hiányos.');
assert(pageSource.includes('applyPlanVersionToEnergyModel') && pageSource.includes('rollbackPlanVersionEnergyModel'), 'A központi draft-integráció hiányzik.');
pass('Az előnézet, megerősítés, alkalmazás, audit és rollback felülete be van kötve');

console.log(`DIMPRO Felmérő v0.8.4.4.5 tervverzió → energetikai modell domain teszt: ${testCount}/${testCount} sikeres`);
tests.forEach((message, index) => console.log(`${index + 1}. ${message}`));
fs.rmSync(tempDir, { recursive: true, force: true });
