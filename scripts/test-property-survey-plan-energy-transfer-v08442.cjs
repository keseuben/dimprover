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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08442-domain-'));
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
compile('components/property-survey/propertySurveyRoomDimensions.ts', 'roomDimensions.cjs');
compile('components/property-survey/propertySurveyBuildingModel.ts', 'buildingModel.cjs', [
  ['@/components/property-survey/propertySurveyRoomDimensions', './roomDimensions.cjs'],
]);

const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const energyTypes = require(path.join(tempDir, 'energyOpeningTypes.cjs'));
const transfer = require(path.join(tempDir, 'transfer.cjs'));
const building = require(path.join(tempDir, 'buildingModel.cjs'));
const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPage.tsx'), 'utf8');

const now = '2026-07-31T00:00:00.000Z';
const page = planTypes.createSurveyPlanPage({ documentId: 'doc-1', pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
page.id = 'page-1';
page.suggestions = [{
  id: 'room-suggestion-1', pageId: page.id, levelId: page.levelId, name: 'Nappali', function: 'Nappali',
  polygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.4 }], labelPosition: null,
  calculatedAreaSquareMeters: 24, labeledAreaSquareMeters: 24, areaDifferenceSquareMeters: 0, areaDifferencePercent: 0,
  confidence: 'high', confidenceScore: 0.95, source: 'vectorPdfRecognition', sourceDetails: 'teszt', geometryMethod: 'closedVectorContour',
  contourClosed: true, heated: true, roomHeightMeters: 2.7, status: 'approved', userModified: false, createdAt: now, updatedAt: now,
}];
const wall = {
  id: 'wall-suggestion-1', pageId: page.id, levelId: page.levelId,
  start: { x: 0.1, y: 0.1 }, end: { x: 0.5, y: 0.1 }, boundaryType: 'externalAir',
  orientationDegrees: 0, orientationLabel: 'É', lengthMeters: 4, heightMeters: 2.7, thicknessMeters: 0.38,
  assemblyId: 'assembly-wall-1', zoneId: 'zone-1', adjacentZoneId: '', grossAreaSquareMeters: 10.8,
  openingAreaSquareMeters: 1.8, netAreaSquareMeters: 9, connectedRoomSuggestionIds: ['room-suggestion-1'],
  confidence: 'high', confidenceScore: 0.95, source: 'vectorPdfRecognition', sourceDetails: 'külső fal', status: 'approved',
  userModified: false, createdAt: now, updatedAt: now,
};
const opening = {
  id: 'opening-suggestion-1', pageId: page.id, levelId: page.levelId, wallSuggestionId: wall.id,
  connectedRoomSuggestionIds: ['room-suggestion-1'], zoneId: 'zone-1', name: 'Nappali ablak', kind: 'window',
  center: { x: 0.3, y: 0.1 }, offsetRatio: 0.5, widthMeters: 1.2, heightMeters: 1.5, sillHeightMeters: 0.9,
  areaSquareMeters: 1.8, frame: 'PVC / műanyag', glazing: '3 rétegű hőszigetelő üveg', uValueWm2K: '1,10',
  catalogProfileId: 'pvc-triple-template', sourceReference: 'DIMPRO katalógussablon – gyártói adatlappal ellenőrizendő',
  solarGValue: '0,50', shading: 'Külső redőny', thermalBridgeMode: 'installationPerimeter', installationPsiWmK: '0,040',
  installationPsiSourceReference: 'Csomóponti katalógus – ellenőrizendő', confidence: 'high', confidenceScore: 0.9,
  source: 'userCorrected', sourceDetails: 'teszt', status: 'approved', userModified: true, createdAt: now, updatedAt: now,
};
page.wallSuggestions = [wall];
page.openingSuggestions = [opening];
const room = {
  id: 'room-1', levelId: page.levelId, name: 'Nappali', function: 'Nappali', area: 24, height: 2.7,
  x: 90, y: 61, width: 360, depth: 183, heated: true, externalWallType: 'Külső fal', floorType: '', ceilingType: '',
  windowCount: 0, windowType: '', orientation: '', note: '', lengthMeters: 6, widthMeters: 4, planSuggestionId: 'room-suggestion-1',
};
const assembly = { id: 'assembly-wall-1', name: '38 cm fal', category: 'wall', layers: [], createdAt: now, updatedAt: now };
const zoneWorkspace = {
  schemaVersion: 1, zones: [{ id: 'zone-1', name: 'Lakótér', usageProfile: 'residential', serviceLevel: 'heatedNaturalVentilation', heatingSetpointC: 20, note: '', createdAt: now, updatedAt: now }],
  unheatedSpaces: [], roomAssignments: { 'room-1': 'zone-1' }, unheatedRoomAssignments: {}, createdAt: now, updatedAt: now,
};
const openingWorkspace = energyTypes.createDefaultEnergyOpeningWorkspace([]);
const input = { page, rooms: [room], wallSegments: [], wallOpenings: [], assemblies: [assembly], zoneWorkspace, openingWorkspace };

const preview = transfer.buildSurveyPlanEnergyTransferPreview(input);
assert(preview.canTransfer && preview.approvedWallCount === 1 && preview.approvedOpeningCount === 1, `Az átadási előnézet hibás: ${JSON.stringify(preview)}`);
assert(preview.wallCreateCount === 1 && preview.openingCreateCount === 1 && preview.warningCount === 1, 'Az új elemek és katalógus-figyelmeztetés számlálása hibás.');
pass('A jóváhagyott PDF fal és nyílászáró átadásra kész előnézetet kap blokkolás nélkül');

const first = transfer.applySurveyPlanEnergyTransfer(input);
assert(first.wallSegments.length === 1 && first.wallOpenings.length === 1, 'A központi fal- vagy nyílászárómodell nem jött létre.');
const transferredWall = first.wallSegments[0];
const transferredOpening = first.wallOpenings[0];
assert(transferredWall.planWallSuggestionId === wall.id && transferredWall.measuredLengthMeters === 4 && transferredWall.heightMeters === 2.7 && transferredWall.dataSource === 'planTransfer', `A PDF fal forrásadatai elvesztek: ${JSON.stringify(transferredWall)}`);
assert(building.getWallSegmentLengthMeters(room, transferredWall) === 4, 'A központi geometria nem a PDF-ből mért falhosszt használja.');
assert(transferredOpening.planOpeningSuggestionId === opening.id && transferredOpening.shading === 'Külső redőny' && transferredOpening.catalogProfileId === 'pvc-triple-template', 'A nyílászáró katalógus- vagy árnyékolási adata elveszett.');
pass('A PDF fal saját hosszal, magassággal, tájolással és forrásazonosítóval kerül a központi modellbe');

const detail = first.openingWorkspace.openingDetails[transferredOpening.id];
assert(detail.calculationMode === 'declared' && detail.declaredUwWm2K === 1.1 && detail.solarGValue === 0.5, `Az Uw/g energetikai részlet hibás: ${JSON.stringify(detail)}`);
assert(detail.installationPsiWmK === 0.04 && detail.installationPsiSourceReference.includes('Csomóponti'), 'A teljes beépítési kerület hőhídadata nem került át.');
pass('Az Uw-, g-, árnyékolás- és beépítési Ψ-adatok a központi energetikai nyílászárómodellbe kerülnek');

const second = transfer.applySurveyPlanEnergyTransfer({ ...input, rooms: first.rooms, wallSegments: first.wallSegments, wallOpenings: first.wallOpenings, zoneWorkspace: first.zoneWorkspace, openingWorkspace: first.openingWorkspace });
assert(second.wallSegments.length === 1 && second.wallOpenings.length === 1, 'Az ismételt átadás duplikált központi elemet hozott létre.');
assert(second.wallCreateCount === 0 && second.wallUpdateCount === 1 && second.openingCreateCount === 0 && second.openingUpdateCount === 1, 'Az idempotens frissítés létrehozásként jelent meg.');
assert(second.wallSegments[0].id === first.wallSegments[0].id && second.wallOpenings[0].id === first.wallOpenings[0].id, 'Az ismételt átadás megváltoztatta a központi stabil azonosítókat.');
pass('Az ismételt PDF → energetikai átadás idempotens és stabil azonosítókkal frissít');

const separatePage = { ...page, openingSuggestions: [{ ...opening, thermalBridgeMode: 'separateEdges' }] };
const separate = transfer.applySurveyPlanEnergyTransfer({ ...input, page: separatePage });
assert(separate.openingWorkspace.thermalBridges.length === 3, `A külön káva/parapet/szemöldök hőhidak nem jöttek létre: ${JSON.stringify(separate.openingWorkspace.thermalBridges)}`);
assert(new Set(separate.openingWorkspace.thermalBridges.map((bridge) => bridge.category)).size === 3, 'A három külön nyílászáró élhőhíd kategóriája nem egyedi.');
pass('A külön élhőhíd mód káva-, parapet- és szemöldökhőhidat hoz létre');

const invalidPage = { ...page, wallSuggestions: [{ ...wall, zoneId: '', assemblyId: '' }], openingSuggestions: [{ ...opening, sourceReference: '', uValueWm2K: '' }] };
const invalid = transfer.buildSurveyPlanEnergyTransferPreview({ ...input, page: invalidPage });
assert(!invalid.canTransfer && invalid.blockingIssueCount >= 4, `A hiányos rétegrend/zóna/U-forrás nem blokkolta az átadást: ${JSON.stringify(invalid)}`);
pass('A hiányzó rétegrend, zóna, Uw és adatforrás blokkoló átadási hibát ad');

for (const marker of ['data-plan-opening-catalog', 'data-plan-opening-source-reference', 'data-plan-opening-shading', 'data-plan-opening-thermal-bridge-mode', 'data-plan-energy-transfer-panel', 'data-plan-transfer-energy-model']) {
  assert(workspaceSource.includes(marker), `Hiányzó v0.8.4.4.2 felületi marker: ${marker}`);
}
assert(pageSource.includes('transferPlanPageToEnergyModel') && pageSource.includes('applyManagedSurveyPlanEnergyTransfer'), 'A központi PropertySurveyPage kezelt átadási bekötése hiányzik.');
pass('A katalógus, U-forrás, árnyékolás, hőhíd és energetikai átadási panel be van kötve');

console.log(`DIMPRO Felmérő v0.8.4.4.2 PDF → energetikai modell domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
