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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dimpro-v08444-domain-'));
function compile(sourcePath, targetName, replacements = []) {
  let source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(path.join(tempDir, targetName), transpile(source, sourcePath));
}
compile('components/property-survey/propertySurveyPlanDocumentTypes.ts', 'planTypes.cjs');
compile('components/property-survey/propertySurveyPlanVersionComparison.ts', 'comparison.cjs', [
  ['@/components/property-survey/propertySurveyPlanDocumentTypes', './planTypes.cjs'],
]);
const planTypes = require(path.join(tempDir, 'planTypes.cjs'));
const comparison = require(path.join(tempDir, 'comparison.cjs'));

const now = '2026-07-31T09:30:00.000Z';
function room(id, pageId, name, x, y, width, height, area, status = 'approved') {
  return {
    id, pageId, levelId: 'level-ground', name, function: name,
    polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
    labelPosition: null, calculatedAreaSquareMeters: area, labeledAreaSquareMeters: area,
    areaDifferenceSquareMeters: 0, areaDifferencePercent: 0, confidence: 'high', confidenceScore: 0.95,
    source: 'vectorPdfRecognition', sourceDetails: 'teszt', geometryMethod: 'closedVectorContour', contourClosed: true,
    heated: true, roomHeightMeters: 2.7, status, userModified: false, createdAt: now, updatedAt: now,
  };
}
function wall(id, pageId, start, end, length, roomId, status = 'approved') {
  return {
    id, pageId, levelId: 'level-ground', start, end, boundaryType: 'externalAir', orientationDegrees: 0,
    orientationLabel: 'É', lengthMeters: length, heightMeters: 2.7, thicknessMeters: 0.38,
    assemblyId: 'assembly-wall', zoneId: 'zone-1', adjacentZoneId: '', grossAreaSquareMeters: length * 2.7,
    openingAreaSquareMeters: 1.8, netAreaSquareMeters: length * 2.7 - 1.8, connectedRoomSuggestionIds: [roomId],
    confidence: 'high', confidenceScore: 0.95, source: 'vectorPdfRecognition', sourceDetails: 'teszt', status,
    userModified: false, createdAt: now, updatedAt: now,
  };
}
function opening(id, pageId, wallId, name, offset, width, status = 'approved') {
  return {
    id, pageId, levelId: 'level-ground', wallSuggestionId: wallId, connectedRoomSuggestionIds: [], zoneId: 'zone-1',
    name, kind: 'window', center: { x: 0.25 + offset * 0.2, y: 0.1 }, offsetRatio: offset,
    widthMeters: width, heightMeters: 1.5, sillHeightMeters: 0.9, areaSquareMeters: width * 1.5,
    frame: 'PVC', glazing: '3 rétegű üveg', uValueWm2K: '1,10', catalogProfileId: 'pvc-triple-template',
    sourceReference: 'Gyártói adatlap', solarGValue: '0,50', shading: 'Nincs', thermalBridgeMode: 'installationPerimeter',
    installationPsiWmK: '0,040', installationPsiSourceReference: 'Csomóponti katalógus', confidence: 'high', confidenceScore: 0.9,
    source: 'userCorrected', sourceDetails: 'teszt', status, userModified: true, createdAt: now, updatedAt: now,
  };
}
function page(documentId, id, pageNumber, label, levelId = 'level-ground') {
  const result = planTypes.createSurveyPlanPage({ documentId, pageNumber, levelId, sourceMode: 'designPlan' });
  result.id = id;
  result.pageLabel = label;
  result.planType = 'floorPlan';
  result.planVersion = documentId === 'doc-base' ? 'construction' : 'modifiedConstruction';
  result.contentKind = 'vector';
  return result;
}
function document(id, fileName, revisionCode, pages) {
  return {
    id, fileName, mimeType: 'application/pdf', sizeBytes: 1000, dataUrl: 'data:application/pdf;base64,AA==',
    fileFingerprint: `fingerprint-${id}`, versionGroupId: `plan-version-group-${id}`, revisionCode,
    revisionDate: revisionCode === 'R00' ? '2026-07-01' : '2026-07-31', supersedesDocumentId: '', isCurrentVersion: true,
    pageCount: pages.length, pages, uploadedAt: now, updatedAt: now,
  };
}

const basePage1 = page('doc-base', 'base-page-1', 1, 'Földszinti alaprajz');
basePage1.suggestions = [
  room('base-room-living', basePage1.id, 'Nappali', 0.1, 0.1, 0.3, 0.25, 30),
  room('base-room-pantry', basePage1.id, 'Kamra', 0.45, 0.1, 0.12, 0.15, 8),
];
basePage1.wallSuggestions = [
  wall('base-wall-north', basePage1.id, { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, 6, 'base-room-living'),
  wall('base-wall-pantry', basePage1.id, { x: 0.45, y: 0.1 }, { x: 0.57, y: 0.1 }, 2.4, 'base-room-pantry'),
];
basePage1.openingSuggestions = [
  opening('base-opening-living', basePage1.id, 'base-wall-north', 'Nappali ablak', 0.5, 1.2),
  opening('base-opening-pantry', basePage1.id, 'base-wall-pantry', 'Kamra ablak', 0.5, 0.6),
];
const basePage2 = page('doc-base', 'base-page-2', 2, 'Emeleti alaprajz', 'level-floor-1');
basePage2.suggestions = [room('base-room-bedroom', basePage2.id, 'Hálószoba', 0.2, 0.2, 0.25, 0.2, 20)];

const targetPage1 = page('doc-target', 'target-page-1', 1, 'Földszinti alaprajz');
targetPage1.suggestions = [
  room('target-room-living', targetPage1.id, 'Nappali', 0.1, 0.1, 0.32, 0.25, 32, 'review'),
  room('target-room-bath', targetPage1.id, 'Fürdő', 0.62, 0.1, 0.14, 0.16, 9, 'review'),
];
targetPage1.wallSuggestions = [
  wall('target-wall-north', targetPage1.id, { x: 0.1, y: 0.1 }, { x: 0.42, y: 0.1 }, 6.4, 'target-room-living', 'review'),
  wall('target-wall-bath', targetPage1.id, { x: 0.62, y: 0.1 }, { x: 0.76, y: 0.1 }, 2.8, 'target-room-bath', 'review'),
];
targetPage1.openingSuggestions = [
  opening('target-opening-living', targetPage1.id, 'target-wall-north', 'Nappali ablak', 0.55, 1.5, 'review'),
  opening('target-opening-bath', targetPage1.id, 'target-wall-bath', 'Fürdő ablak', 0.5, 0.8, 'review'),
];
const targetPage2 = page('doc-target', 'target-page-2', 2, 'Emeleti alaprajz', 'level-floor-1');
targetPage2.suggestions = [room('target-room-bedroom', targetPage2.id, 'Hálószoba', 0.2, 0.2, 0.25, 0.2, 20, 'review')];
const targetPage3 = page('doc-target', 'target-page-3', 3, 'Tetőtéri alaprajz', 'level-attic');
targetPage3.suggestions = [room('target-room-attic', targetPage3.id, 'Tetőtér', 0.2, 0.2, 0.4, 0.3, 48, 'review')];

const baseDocument = document('doc-base', 'Alaprajz_R00.pdf', 'R00', [basePage1, basePage2]);
const targetDocument = document('doc-target', 'Alaprajz_R01.pdf', 'R01', [targetPage1, targetPage2, targetPage3]);
let workspace = planTypes.createSurveyPlanWorkspace('designPlan');
workspace.documents = [baseDocument, targetDocument];
workspace.activeDocumentId = baseDocument.id;
workspace.activePageId = basePage1.id;

workspace = comparison.createSurveyPlanVersionComparison({ workspace, baseDocumentId: baseDocument.id, targetDocumentId: targetDocument.id, now });
let summary = comparison.buildSurveyPlanVersionComparisonSummary({ workspace });
assert(summary && summary.comparison.pagePairs.length === 3 && summary.totals.unpairedTargetPageCount === 0 && summary.comparison.pagePairs.some((pair) => !pair.basePageId && pair.targetPageId === targetPage3.id), `Az automatikus oldal-párosítás és az új oldal nyilvántartása hibás: ${JSON.stringify(summary?.totals)}`);
assert(summary.comparison.pagePairs.filter((pair) => pair.basePageId && pair.targetPageId).every((pair) => pair.method === 'automatic' && pair.confidenceScore >= 0.8), 'Az azonos című/szintű oldalak nem magas biztonságú automatikus párt kaptak.');
pass('Az azonos tervtípusú, című, szintű és oldalszámú tervlapok automatikusan párosíthatók');

const linkedBase = workspace.documents.find((item) => item.id === baseDocument.id);
const linkedTarget = workspace.documents.find((item) => item.id === targetDocument.id);
assert(linkedBase.versionGroupId === linkedTarget.versionGroupId && linkedBase.isCurrentVersion === false && linkedTarget.isCurrentVersion === true && linkedTarget.supersedesDocumentId === linkedBase.id, 'A dokumentum-revíziólánc nem jött létre.');
pass('Az összehasonlítás közös verziócsoportot, előzménykapcsolatot és aktuális verziójelölést hoz létre');

const groundPair = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage1.id);
assert(groundPair, 'A földszinti oldalpár hiányzik.');
const groundDiffs = groundPair.elementDiffs;
assert(groundDiffs.some((diff) => diff.kind === 'room' && diff.changeType === 'modified' && diff.changedFields.includes('area')), 'A módosított nappali helyiség diffje hiányzik.');
assert(groundDiffs.some((diff) => diff.kind === 'room' && diff.changeType === 'removed' && diff.baseElementId === 'base-room-pantry'), 'A törölt kamra nem jelent meg.');
assert(groundDiffs.some((diff) => diff.kind === 'room' && diff.changeType === 'added' && diff.targetElementId === 'target-room-bath'), 'Az új fürdő nem jelent meg.');
pass('A helyiségdiff elkülöníti a módosított, új és törölt helyiségeket');

assert(groundDiffs.some((diff) => diff.kind === 'wall' && diff.changeType === 'modified' && diff.changedFields.includes('length')), 'A hosszában módosított északi fal nem jelent meg.');
assert(groundDiffs.some((diff) => diff.kind === 'opening' && diff.changeType === 'modified' && diff.changedFields.includes('width')), 'A szélesebb nappali ablak nem jelent meg.');
assert(groundDiffs.some((diff) => diff.kind === 'opening' && diff.changeType === 'added' && diff.targetElementId === 'target-opening-bath'), 'Az új fürdőablak nem jelent meg.');
pass('A fal- és nyílászáródiff felismeri a geometriai, méret- és kapcsolati változásokat');

const floorPair = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage2.id);
assert(floorPair && floorPair.elementDiffs.some((diff) => diff.changeType === 'unchanged' && diff.decision === 'accepted'), 'A változatlan hálószoba nem lett automatikusan elfogadva.');
pass('A tartalmilag változatlan elempár automatikusan elfogadott állapotot kap');

workspace = comparison.setSurveyPlanPagePair({ workspace, comparisonId: summary.comparison.id, targetPageId: targetPage2.id, basePageId: basePage2.id, now: '2026-07-31T09:31:00.000Z' });
summary = comparison.buildSurveyPlanVersionComparisonSummary({ workspace });
const manualPair = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage2.id);
assert(manualPair?.method === 'manual', 'A kézi oldal-párosítás nem írta felül az automatikus módszert.');
pass('Az automatikus oldal-párosítás kézzel felülírható és kézi módszerként naplózódik');

const modifiedRoomDiff = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage1.id).elementDiffs.find((diff) => diff.kind === 'room' && diff.changeType === 'modified');
workspace = comparison.setSurveyPlanElementDiffDecision({ workspace, comparisonId: summary.comparison.id, pairId: groundPair.id, diffId: modifiedRoomDiff.id, decision: 'accepted', now: '2026-07-31T09:32:00.000Z' });
workspace = comparison.rebuildSurveyPlanVersionComparison({ workspace, comparisonId: summary.comparison.id, now: '2026-07-31T09:33:00.000Z' });
summary = comparison.buildSurveyPlanVersionComparisonSummary({ workspace });
const rebuiltDecision = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage1.id).elementDiffs.find((diff) => diff.id === modifiedRoomDiff.id)?.decision;
assert(rebuiltDecision === 'accepted', `Az azonos elempár döntése nem maradt meg újraszámításkor: ${rebuiltDecision}`);
pass('Az elemenkénti döntés újraszámításkor megmarad, ha az elempár stabil azonosítója változatlan');

const latestGroundPair = summary.comparison.pagePairs.find((pair) => pair.targetPageId === targetPage1.id);
workspace = comparison.setSurveyPlanDiffDecisions({ workspace, comparisonId: summary.comparison.id, pairId: latestGroundPair.id, decision: 'accepted', onlyChangeTypes: ['added', 'modified'], now: '2026-07-31T09:34:00.000Z' });
workspace = comparison.setSurveyPlanDiffDecisions({ workspace, comparisonId: summary.comparison.id, pairId: latestGroundPair.id, decision: 'rejected', onlyChangeTypes: ['removed'], now: '2026-07-31T09:35:00.000Z' });
summary = comparison.buildSurveyPlanVersionComparisonSummary({ workspace });
assert(summary.totals.acceptedCount > 0 && summary.totals.rejectedCount > 0, 'A tömeges elfogadás és elutasítás nem frissítette az összesítést.');
pass('Az aktív oldalpár hozzáadott/módosított és törölt elemei külön tömeges döntést kaphatnak');

const applyResult = comparison.applySurveyPlanVersionComparisonDecisions({ workspace, comparisonId: summary.comparison.id, now: '2026-07-31T09:36:00.000Z' });
const appliedTarget = applyResult.workspace.documents.find((item) => item.id === targetDocument.id);
const appliedGround = appliedTarget.pages.find((item) => item.id === targetPage1.id);
assert(appliedGround.suggestions.find((item) => item.id === 'target-room-living').status === 'approved', 'Az elfogadott módosított helyiség nem lett jóváhagyva.');
assert(appliedGround.suggestions.find((item) => item.id === 'target-room-bath').status === 'approved', 'Az elfogadott új helyiség nem lett jóváhagyva.');
assert(appliedGround.wallSuggestions.find((item) => item.id === 'target-wall-north').status === 'approved', 'Az elfogadott módosított fal nem lett jóváhagyva.');
assert(appliedGround.openingSuggestions.find((item) => item.id === 'target-opening-bath').status === 'approved', 'Az elfogadott új nyílászáró nem lett jóváhagyva.');
pass('A részleges döntések alkalmazása az új tervverzió elfogadott cél-elemeit jóváhagyja');

assert(applyResult.pendingCount > 0 && applyResult.comparison.status === 'review' && !applyResult.comparison.appliedAt, 'A függőben maradó elemek mellett a verziót tévesen lezárta a rendszer.');
pass('Függőben maradó változás esetén az összehasonlítás review állapotban marad');

let completedWorkspace = comparison.setSurveyPlanDiffDecisions({ workspace: applyResult.workspace, comparisonId: summary.comparison.id, decision: 'rejected', onlyChangeTypes: ['added', 'removed', 'modified'], now: '2026-07-31T09:37:00.000Z' });
const completedResult = comparison.applySurveyPlanVersionComparisonDecisions({ workspace: completedWorkspace, comparisonId: summary.comparison.id, now: '2026-07-31T09:38:00.000Z' });
assert(completedResult.pendingCount === 0 && completedResult.comparison.status === 'applied' && completedResult.comparison.appliedAt, 'A minden elemről döntött összehasonlítás nem zárult alkalmazott állapotba.');
pass('Minden változás eldöntése után az összehasonlítás alkalmazott állapotba kerül');

const migrated = planTypes.normalizeSurveyPlanWorkspace({ schema: 'dimpro.property-survey.plan-document.v1', surveySourceMode: 'designPlan', documents: [baseDocument], activeDocumentId: baseDocument.id, activePageId: basePage1.id, transferRegistry: planTypes.createSurveyPlanTransferRegistry(), updatedAt: now });
assert(migrated.schema === 'dimpro.property-survey.plan-document.v1' && migrated.versionComparison.version === '1' && Object.keys(migrated.versionComparison.comparisons).length === 0, 'A régi plan-document.v1 projekt nem kapott üres összehasonlítási workspace-t.');
pass('A régi plan-document.v1 projektek sémaváltás nélkül üres verzió-összehasonlítási nyilvántartással migrálódnak');

const malformed = planTypes.normalizeSurveyPlanWorkspace({ ...completedResult.workspace, versionComparison: { version: '1', activeComparisonId: 'missing', updatedAt: now, comparisons: { invalid: { id: 'invalid', baseDocumentId: 'same', targetDocumentId: 'same', pagePairs: [], status: 'applied' } } } });
assert(Object.keys(malformed.versionComparison.comparisons).length === 0 && malformed.versionComparison.activeComparisonId === null, 'A hibás vagy önmagára mutató összehasonlítás nem lett kiszűrve.');
pass('A normalizáló kiszűri a hibás, hiányos vagy önmagára mutató tervverzió-kapcsolatokat');

const workspaceSource = fs.readFileSync(path.join(root, 'components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx'), 'utf8');
for (const marker of ['data-plan-version-comparison', 'data-plan-document-revision-code', 'data-plan-version-page-pairs', 'data-plan-version-element-diffs', 'data-plan-version-diff-overlay', 'data-plan-version-apply-decisions']) {
  assert(workspaceSource.includes(marker), `Hiányzó v0.8.4.4.4 felületi marker: ${marker}`);
}
assert(workspaceSource.includes('v0.8.4.4.7 · Revíziócsomag és megosztási előkészítés'), 'A munkatér verziófelirata nem frissült.');
pass('A revízióadatok, oldal-/elempárosítás, vizuális diff és részleges döntési felület be van kötve');

console.log(`DIMPRO Felmérő v0.8.4.4.4 tervverzió-összehasonlítás domain teszt: ${testCount}/${testCount} sikeres`);
for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
