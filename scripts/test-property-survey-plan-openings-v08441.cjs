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
const typesPath = path.join(root, 'components/property-survey/propertySurveyPlanDocumentTypes.ts');
const openingsPath = path.join(root, 'components/property-survey/propertySurveyPlanOpenings.ts');
const workspacePath = path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08441-domain-'));
fs.writeFileSync(path.join(tempDir, 'types.cjs'), transpile(fs.readFileSync(typesPath, 'utf8'), typesPath));
const openingSource = fs.readFileSync(openingsPath, 'utf8').replace('@/components/property-survey/propertySurveyPlanDocumentTypes', './types.cjs');
fs.writeFileSync(path.join(tempDir, 'openings.cjs'), transpile(openingSource, openingsPath));
const domain = require(path.join(tempDir, 'types.cjs'));
const openings = require(path.join(tempDir, 'openings.cjs'));
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');

const page = domain.createSurveyPlanPage({ documentId: 'doc-1', pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
page.calibration.primary.pixelsPerMeter = 100;
page.calibration.status = 'acceptable';
const now = '2026-07-30T00:00:00.000Z';
const wall = {
  id: 'wall-1', pageId: page.id, levelId: page.levelId,
  start: { x: 0.1, y: 0.5 }, end: { x: 0.5, y: 0.5 },
  boundaryType: 'externalAir', orientationDegrees: 180, orientationLabel: 'D', lengthMeters: 4,
  heightMeters: 2.7, thicknessMeters: 0.3, assemblyId: 'assembly-wall', zoneId: 'zone-1', adjacentZoneId: '',
  grossAreaSquareMeters: 10.8, openingAreaSquareMeters: 0, netAreaSquareMeters: 10.8,
  connectedRoomSuggestionIds: ['room-1'], confidence: 'high', confidenceScore: 0.9,
  source: 'vectorPdfRecognition', sourceDetails: 'teszt', status: 'approved', userModified: false,
  createdAt: now, updatedAt: now,
};
page.wallSuggestions = [wall];

const center = openings.openingCenterOnWall(wall, 0.25);
assert(Math.abs(center.x - 0.2) < 1e-9 && Math.abs(center.y - 0.5) < 1e-9, `A fal menti nyílászáró-középpont hibás: ${JSON.stringify(center)}`);
pass('A nyílászáró fal menti pozíciója arányos eltolással számítható');

const generated = openings.buildPlanOpeningSuggestions({
  page,
  walls: [wall],
  vectorContours: [{
    points: [{ x: 0.22, y: 0.496 }, { x: 0.30, y: 0.496 }, { x: 0.30, y: 0.504 }, { x: 0.22, y: 0.504 }],
    closed: true,
    normalizedArea: 0.00064,
    bounds: { x: 0.22, y: 0.496, width: 0.08, height: 0.008 },
  }],
  textItems: [{ text: 'ABLAK', x: 0.235, y: 0.47, width: 0.04, height: 0.01 }],
  viewportWidth: 1000,
  viewportHeight: 1000,
  zoneByRoomSuggestionId: { 'room-1': 'zone-1' },
  idFactory: (prefix) => `${prefix}-1`,
});
assert(generated.length === 1, `A falhoz közeli kis vektorkontúr nem adott nyílászáró-javaslatot: ${JSON.stringify(generated)}`);
assert(generated[0].kind === 'window' && generated[0].widthMeters > 0.5 && generated[0].zoneId === 'zone-1', `Az automatikus nyílászáró típusa, mérete vagy zónája hibás: ${JSON.stringify(generated[0])}`);
pass('A fal közelében lévő kis vektorkontúr ablakjavaslattá alakítható és zónához kapcsolható');

const manual = openings.createManualPlanOpening({ page, wall, zoneId: 'zone-1', idFactory: (prefix) => `${prefix}-1` });
assert(manual.source === 'manualDrawing' && manual.wallSuggestionId === wall.id && manual.areaSquareMeters > 0, `A kézi nyílászáró alapadatai hibásak: ${JSON.stringify(manual)}`);
pass('A kijelölt falszakaszhoz kézi nyílászáró hozható létre megőrzött adatforrással');

const wallWithOpenings = openings.recalculatePlanWallAreas(wall, [generated[0], manual]);
const expectedOpeningArea = generated[0].widthMeters * generated[0].heightMeters + manual.widthMeters * manual.heightMeters;
assert(Math.abs(wallWithOpenings.grossAreaSquareMeters - 10.8) < 1e-9, `A bruttó falfelület hibás: ${wallWithOpenings.grossAreaSquareMeters}`);
assert(Math.abs(wallWithOpenings.openingAreaSquareMeters - expectedOpeningArea) < 1e-9, `A nyílászáró-felület hibás: ${wallWithOpenings.openingAreaSquareMeters}`);
assert(Math.abs(wallWithOpenings.netAreaSquareMeters - (10.8 - expectedOpeningArea)) < 1e-9, `A nettó falfelület hibás: ${wallWithOpenings.netAreaSquareMeters}`);
pass('A bruttó fal-, nyílászáró- és nettó falfelület következetesen számítható');

page.openingRecognitionStatus = 'ready';
page.openingRecognitionMessage = 'teszt';
page.openingSuggestions = [generated[0], manual];
page.wallSuggestions = [wallWithOpenings];
const normalized = domain.normalizeSurveyPlanWorkspace({
  schema: 'dimpro.property-survey.plan-document.v1', surveySourceMode: 'designPlan', activeDocumentId: 'doc-1', activePageId: page.id,
  documents: [{ id: 'doc-1', fileName: 'teszt.pdf', mimeType: 'application/pdf', sizeBytes: 1, dataUrl: 'data:application/pdf;base64,AA==', fileFingerprint: 'fp', pageCount: 1, pages: [page], uploadedAt: now, updatedAt: now }], updatedAt: now,
});
const normalizedPage = normalized.documents[0].pages[0];
assert(normalizedPage.openingSuggestions.length === 2 && normalizedPage.wallSuggestions[0].assemblyId === 'assembly-wall' && normalizedPage.wallSuggestions[0].zoneId === 'zone-1', 'A fal–szerkezet–zóna–nyílászáró adatok mentése vagy migrációja hibás.');
pass('A fal-, rétegrend-, zóna- és nyílászáró-kapcsolatok régi projektek mellett is normalizálhatók és menthetők');

for (const marker of ['NYÍLÁSZÁRÓ-JAVASLATOK FELISMERÉSE', 'data-plan-wall-assembly', 'data-plan-wall-zone', 'data-plan-opening-panel', 'data-plan-opening-width', 'data-plan-wall-net-area']) {
  assert(workspaceSource.includes(marker), `Hiányzó v0.8.4.4.1 felületi marker: ${marker}`);
}
pass('A fal-rétegrend, zóna, nyílászáró-szerkesztő és nettó felület felülete be van kötve a tervmunkatérbe');

console.log(`DIMPRO Felmérő v0.8.4.4.1 fal–nyílászáró domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
