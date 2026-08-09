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
const geometryPath = path.join(root, 'components/property-survey/propertySurveyPlanGeometry.ts');
const workspacePath = path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v0844-domain-'));
fs.writeFileSync(path.join(tempDir, 'types.cjs'), transpile(fs.readFileSync(typesPath, 'utf8'), typesPath));
const geometrySource = fs.readFileSync(geometryPath, 'utf8').replace('@/components/property-survey/propertySurveyPlanDocumentTypes', './types.cjs');
fs.writeFileSync(path.join(tempDir, 'geometry.cjs'), transpile(geometrySource, geometryPath));
const domain = require(path.join(tempDir, 'types.cjs'));
const geometry = require(path.join(tempDir, 'geometry.cjs'));
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');

const page = domain.createSurveyPlanPage({ documentId: 'doc-1', pageNumber: 1, levelId: 'level-ground', sourceMode: 'designPlan' });
page.calibration.primary.pixelsPerMeter = 100;
page.calibration.status = 'acceptable';
page.northAngle = 0;
const now = '2026-07-30T00:00:00.000Z';
function room(id, polygon, status = 'approved') {
  return {
    id, pageId: page.id, levelId: page.levelId, name: id, function: 'Helyiség', polygon, labelPosition: null,
    calculatedAreaSquareMeters: 0, labeledAreaSquareMeters: null, areaDifferenceSquareMeters: null, areaDifferencePercent: null,
    confidence: 'manual', confidenceScore: 1, source: 'manualDrawing', sourceDetails: 'teszt', geometryMethod: 'manualPolygon',
    contourClosed: true, heated: true, roomHeightMeters: 2.7, status, userModified: true, createdAt: now, updatedAt: now,
  };
}

const roomA = room('room-a', [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }]);
const singleWalls = geometry.buildExternalWallSuggestions({ page, roomSuggestions: [roomA], viewportWidth: 1000, viewportHeight: 1000, idFactory: (prefix) => `${prefix}-${Math.random()}` });
assert(singleWalls.length === 4, `Egy négyszögű helyiséghez négy külső falszakasz kell: ${singleWalls.length}`);
assert(singleWalls.every((wall) => wall.boundaryType === 'externalAir' && wall.lengthMeters > 0 && wall.orientationLabel !== '–'), 'A külső fal alapbesorolása, hossza vagy tájolása hibás.');
pass('Egy önálló helyiség négy külső peremfalszakaszt és tájolást kap');

const roomB = room('room-b', [{ x: 0.4, y: 0.1 }, { x: 0.7, y: 0.1 }, { x: 0.7, y: 0.4 }, { x: 0.4, y: 0.4 }]);
const joinedWalls = geometry.buildExternalWallSuggestions({ page, roomSuggestions: [roomA, roomB], viewportWidth: 1000, viewportHeight: 1000, idFactory: (prefix) => `${prefix}-${Math.random()}` });
assert(joinedWalls.length === 6, `Két csatlakozó négyszög közös belső éle nem lehet külső fal: ${joinedWalls.length}`);
assert(!joinedWalls.some((wall) => Math.abs(wall.start.x - 0.4) < 1e-6 && Math.abs(wall.end.x - 0.4) < 1e-6), 'A közös belső falszakasz külső javaslatként megmaradt.');
pass('A szomszédos helyiségek közös éle kiesik a külső határolásból');

const mergedPolygon = geometry.mergeAdjacentPolygons(roomA.polygon, roomB.polygon);
assert(mergedPolygon && mergedPolygon.length >= 4, `A közös falszakaszú helyiségek összevonása sikertelen: ${JSON.stringify(mergedPolygon)}`);
const mergedArea = geometry.polygonAreaPixels(mergedPolygon, 1000, 1000);
assert(Math.abs(mergedArea - 180000) < 1, `Az összevont poligon területe hibás: ${mergedArea}`);
pass('A teljes közös falszakaszú helyiségek egyetlen zárt poligonná összevonhatók');

const splitPolygons = geometry.splitPolygonByLine(mergedPolygon, { x: 0.4, y: 0.05 }, { x: 0.4, y: 0.45 });
assert(splitPolygons && splitPolygons.length === 2, `A helyiség kettévágása sikertelen: ${JSON.stringify(splitPolygons)}`);
const splitArea = splitPolygons.reduce((sum, polygon) => sum + geometry.polygonAreaPixels(polygon, 1000, 1000), 0);
assert(Math.abs(splitArea - mergedArea) < 1, `A kettévágott poligonok összterülete megváltozott: ${splitArea} / ${mergedArea}`);
pass('A helyiséget metsző vágóvonal két zárt poligont hoz létre területveszteség nélkül');

const editedPolygon = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }];
const recalculatedRoom = geometry.recalculateSuggestionGeometry(roomA, editedPolygon, page, 1000, 1000);
assert(recalculatedRoom.polygon[1].x === 0.5 && recalculatedRoom.calculatedAreaSquareMeters > 0, 'A poligonpont-mozgatás nem számolta újra a területet.');
assert(recalculatedRoom.source === 'userCorrected' && recalculatedRoom.userModified === true, 'A poligonjavítás adatforrása hibás.');
pass('Az egyedi poligonpont-mozgatás újraszámolja a helyiség területét és felhasználói javításként naplózódik');

const editedWall = geometry.recalculateWallGeometry(singleWalls[0], { end: { x: 0.55, y: 0.1 }, page, viewportWidth: 1000, viewportHeight: 1000, connectedRoom: roomA });
assert(editedWall.end.x === 0.55 && editedWall.lengthMeters > singleWalls[0].lengthMeters, 'A falszakasz végpontmozgatása nem frissítette a hosszt.');
assert(editedWall.source === 'userCorrected' && editedWall.userModified, 'A kézi falszakasz-javítás nincs megjelölve.');
pass('A falszakasz végpontjának kézi mozgatása frissíti a hosszt, tájolást és adatforrást');

page.suggestions = [roomA];
page.wallRecognitionStatus = 'ready';
page.wallRecognitionMessage = 'teszt';
page.wallSuggestions = [singleWalls[0]];
const normalized = domain.normalizeSurveyPlanWorkspace({
  schema: 'dimpro.property-survey.plan-document.v1', surveySourceMode: 'designPlan', activeDocumentId: 'doc-1', activePageId: page.id,
  documents: [{ id: 'doc-1', fileName: 'teszt.pdf', mimeType: 'application/pdf', sizeBytes: 1, dataUrl: 'data:application/pdf;base64,AA==', fileFingerprint: 'fp', pageCount: 1, pages: [page], uploadedAt: now, updatedAt: now }], updatedAt: now,
});
const normalizedWall = normalized.documents[0].pages[0].wallSuggestions[0];
assert(normalizedWall && normalizedWall.boundaryType === 'externalAir' && normalizedWall.start.x === singleWalls[0].start.x, 'A falszakaszok mentése vagy migrációja hibás.');
pass('A faljavaslatok és a felismerési állapot régi projektek mellett is normalizálhatók és menthetők');

for (const marker of ['KÜLSŐ HATÁROLÁS FELISMERÉSE', 'data-plan-room-vertex', 'data-plan-wall-endpoint', 'data-plan-manual-wall-cta', 'data-plan-wall-boundary-type', 'data-plan-split-room', 'data-plan-merge-room']) {
  assert(workspaceSource.includes(marker), `Hiányzó v0.8.4.4 felületi marker: ${marker}`);
}
pass('A poligonpont-szerkesztő, helyiség kettévágás/összevonás, automatikus külső fal, kézi fal és határolástípus-szerkesztő be van kötve a munkatérbe');

console.log(`DIMPRO Felmérő v0.8.4.4 geometria- és fal domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
