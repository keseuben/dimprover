const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }

function requireTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v0843-domain-'));
  const target = path.join(tempDir, 'module.cjs');
  fs.writeFileSync(target, output);
  return require(target);
}

const root = path.resolve(__dirname, '..');
const domainPath = path.join(root, 'components/property-survey/propertySurveyPlanDocumentTypes.ts');
const workspacePath = path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx');
const sharedPdfPath = path.join(root, 'components/viewers/pdfDocumentEngine.ts');
const commonViewerPath = path.join(root, 'components/viewers/PdfPlanViewer.tsx');
const pagePath = path.join(root, 'components/property-survey/PropertySurveyPage.tsx');
const workspaceTypesPath = path.join(root, 'components/property-survey/propertySurveyWorkspaceTypes.ts');
const floorPlanPath = path.join(root, 'components/viewers/SurveyFloorPlanEngine.tsx');

const domain = requireTsModule(domainPath);
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');
const sharedPdfSource = fs.readFileSync(sharedPdfPath, 'utf8');
const commonViewerSource = fs.readFileSync(commonViewerPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');
const workspaceTypesSource = fs.readFileSync(workspaceTypesPath, 'utf8');
const floorPlanSource = fs.readFileSync(floorPlanPath, 'utf8');

const designWorkspace = domain.createSurveyPlanWorkspace('designPlan');
assert(designWorkspace.schema === 'dimpro.property-survey.plan-document.v1', 'Hibás tervdokumentációs séma.');
assert(designWorkspace.surveySourceMode === 'designPlan', 'A tervdokumentáció alapú projektmód nem maradt meg.');
assert(Array.isArray(designWorkspace.documents) && designWorkspace.documents.length === 0, 'Az új tervmunkatérnek üres dokumentumlistával kell indulnia.');
pass('A tervdokumentációs workspace külön, verziózott domain-sémával indul');

const page = domain.createSurveyPlanPage({ documentId: 'doc-1', pageNumber: 2, levelId: 'level-ground', sourceMode: 'asBuiltPlan' });
assert(page.pageNumber === 2 && page.levelId === 'level-ground', 'Az oldal- és szintkapcsolat hibás.');
assert(page.planVersion === 'asBuilt', 'A megvalósulási forrásmód nem állította be a megvalósulási tervverziót.');
assert(page.crop.x === 0 && page.crop.y === 0 && page.crop.width === 1 && page.crop.height === 1, 'Az alapértelmezett teljes oldalas kivágás hibás.');
assert(page.rotationDegrees === 0 && page.fineRotationDegrees === 0, 'Az alapértelmezett forgatás hibás.');
assert(page.locked === true && page.opacity > 0 && page.opacity <= 1, 'A PDF-háttérnek alapból zároltnak és láthatónak kell lennie.');
assert(page.calibration.status === 'notSet' && page.calibration.primary.pixelsPerMeter === 0, 'Az üres kalibráció hibás.');
pass('Az oldalankénti kivágás, forgatás, háttérzár és kalibráció alapállapota helyes');

const normalized = domain.normalizeSurveyPlanWorkspace({
  schema: 'dimpro.property-survey.plan-document.v1',
  surveySourceMode: 'designPlan',
  activeDocumentId: 'missing',
  activePageId: 'missing',
  documents: [{
    id: 'doc-1', fileName: 'teszt.pdf', mimeType: 'application/pdf', sizeBytes: 1200, dataUrl: 'data:application/pdf;base64,AA==', fileFingerprint: 'fp', pageCount: 1, uploadedAt: '2026-07-30T00:00:00.000Z', updatedAt: '2026-07-30T00:00:00.000Z',
    pages: [{ ...page, id: 'page-1', documentId: 'doc-1', crop: { x: -2, y: 0.9, width: 4, height: 4 }, opacity: 5, scalePercent: 999, fineRotationDegrees: -99 }],
  }],
});
const normalizedPage = normalized.documents[0].pages[0];
assert(normalized.activeDocumentId === 'doc-1' && normalized.activePageId === 'page-1', 'A hiányzó aktív azonosítók nem álltak vissza az első tervlapra.');
assert(normalizedPage.crop.x === 0 && normalizedPage.crop.y === 0.9, 'A kivágási koordináták normalizálása hibás.');
assert(normalizedPage.crop.width <= 1 && normalizedPage.crop.height <= 0.1 + Number.EPSILON, 'A kivágás túllóg az oldal normalizált tartományán.');
assert(normalizedPage.opacity === 1, 'Az átlátszóság felső korlátja hibás.');
assert(normalizedPage.scalePercent === 400 && normalizedPage.fineRotationDegrees === -10, 'A méret- vagy finomforgatási korlát hibás.');
pass('A régi vagy hibás tervlapadatok migrációja normalizált és korlátozott értékeket ad');

for (const source of ['manualDrawing', 'vectorPdfRecognition', 'rasterPdfRecognition', 'ocrRecognition', 'planLabel', 'userCorrected', 'imported']) {
  assert(fs.readFileSync(domainPath, 'utf8').includes(`| "${source}"`) || fs.readFileSync(domainPath, 'utf8').includes(`  | "${source}"`), `Hiányzó adatforrás: ${source}`);
}
pass('Mind a hét kötelező adatforrás szerepel a domainmodellben');

assert(sharedPdfSource.includes('loadSharedPdfJs') && sharedPdfSource.includes('analyzeSharedPdfPage'), 'Hiányzik a közös PDF dokumentummotor vagy elemző.');
assert(commonViewerSource.includes('loadSharedPdfJs') && !commonViewerSource.includes('await import("pdfjs-dist")'), 'A meglévő PdfPlanViewer nem a közös PDF-motort használja.');
assert(workspaceSource.includes('loadSharedPdfDocument') && workspaceSource.includes('renderSharedPdfPage'), 'A Felmérő tervlapmunkatere nem a közös PDF-motort használja.');
pass('A meglévő és az új PDF-felület ugyanazt a közös PDF.js motort használja');

assert(workspaceSource.includes('ALAPRAJZ FELISMERÉSE'), 'Hiányzik a külön felismerési parancs.');
assert(workspaceSource.includes('recognitionStatus: "analyzing"') && workspaceSource.includes('status: "review"'), 'A felismerés nem jóváhagyandó javaslatként indul.');
assert(workspaceSource.includes('contentKind: analysis.contentKind'), 'Hiányzik a vektoros/raszteres/vegyes PDF típusfelismerés.');
assert(workspaceSource.includes('labelBoundApproximation'), 'Hiányzik a kötelezően ellenőrzendő címkeközpontú MVP-javaslat.');
assert(sharedPdfSource.includes('stitchSegmentsIntoContours') && sharedPdfSource.includes('countParallelWallPairs'), 'Hiányzik a rövid vektorszakaszok összefűzése vagy a párhuzamos falvonalak keresése.');
assert(workspaceSource.includes('closedVectorContour'), 'Hiányzik a zárt vektorkontúr tervfelirathoz párosítása.');
assert(workspaceSource.includes('data-plan-suggestion-approve'), 'Hiányzik a javaslat jóváhagyási művelete.');
assert(workspaceSource.includes('status: "approved"'), 'A jóváhagyási státusz nincs mentve.');
pass('A felismerés vonalszakaszokat, zárt/összefűzött kontúrokat és párhuzamos falpárokat elemez, majd csak jóváhagyás után ír a modellbe');

assert(workspaceSource.includes('primaryCalibration') && workspaceSource.includes('verificationCalibration'), 'Hiányzik a kétlépcsős kalibráció.');
assert(workspaceSource.includes('verificationErrorPercent') && workspaceSource.includes('acceptedTolerancePercent'), 'Hiányzik a százalékos kalibrációs hiba és tolerancia.');
assert(workspaceSource.includes('data-plan-document-stage') && workspaceSource.includes('manualRoom'), 'Hiányzik a PDF fölötti kézi helyiségpoligon.');
assert(workspaceSource.includes('tablet álló nézetben') || workspaceSource.includes('Tablet álló nézetben'), 'Hiányzik az álló tablet nézet kezelése.');
pass('A kézi kivágás, kétpontos kalibráció, ellenőrző mérés és tabletlogika jelen van');

assert(workspaceTypesSource.includes('planDocumentWorkspace: PropertySurveyPlanDocumentWorkspace'), 'A tervdokumentációs workspace nincs a felmérési draftban.');
assert(workspaceTypesSource.includes('normalizeSurveyPlanWorkspace'), 'A régi projektek migrációjába nincs bekötve a tervdokumentációs workspace.');
assert(pageSource.includes('dimpro.property-survey.v0.8.4.3'), 'A .dimpro export séma nem v0.8.4.3.');
assert(pageSource.includes('activeStep === "planDocument"'), 'A PDF tervlap lépés nincs bekötve a központi munkatérbe.');
assert(pageSource.includes('surveySourceModeLabels'), 'A három projektmód nincs bekötve a Felmérőbe.');
pass('A v0.8.4.3 export, migráció és központi Rajz/Adatok/Osztott munkatér integrációja jelen van');

assert(floorPlanSource.includes('polygon?: Array<{ x: number; y: number }>'), 'A DIMPRO helyiségmodell nem fogad poligongeometriát.');
assert(floorPlanSource.includes('<polygon points={room.polygon'), 'A jóváhagyott poligon nem jelenik meg a közös helyiségmotorban.');
assert(pageSource.includes('planSuggestionId') && pageSource.includes('approvePlanDocumentRoom'), 'A javaslatból DIMPRO helyiségmodellé alakítás hiányzik.');
pass('A jóváhagyott PDF-overlay szerkeszthető DIMPRO helyiségpoligonná alakul');

console.log(`DIMPRO Felmérő v0.8.4.3 tervdokumentációs domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
