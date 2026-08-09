const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3041/ingatlanfelmero';
const screenshotDir = process.env.DIMPRO_TEST_SCREENSHOT_DIR || '/tmp/dimpro_v08445_model_application_screenshots';
const fixtureDir = process.env.DIMPRO_TEST_FIXTURE_DIR || '/tmp/dimpro_v08445_model_application_fixtures';
fs.rmSync(screenshotDir, { recursive: true, force: true });
fs.rmSync(fixtureDir, { recursive: true, force: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitText(page, text, timeout = 30000) { await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text); }
async function clickText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const target = [...document.querySelectorAll(selector)].find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
    if (!target) return false;
    target.click();
    return true;
  }, { text, selector });
  assert(clicked, `Nem található kattintható elem: ${text}`);
}
async function setInput(page, selector, value) {
  const input = await page.$(selector);
  assert(input, `Nem található mező: ${selector}`);
  await input.click({ clickCount: 3 });
  await input.press('Backspace');
  await input.type(String(value));
  await input.press('Tab');
  await sleep(350);
}
async function setViewport(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: width <= 1194 });
  await sleep(500);
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, html: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(dimensions.body <= width + 2 && dimensions.html <= width + 2, `Vízszintes overflow ${width}×${height}: ${JSON.stringify(dimensions)}`);
}

async function createVersionPdf(fileName, revision, labels) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  labels.forEach((label, index) => {
    const page = pdf.addPage([900, 650]);
    page.drawRectangle({ x: 30, y: 30, width: 840, height: 590, borderWidth: 2, borderColor: rgb(0.08, 0.18, 0.3) });
    page.drawText(label, { x: 55, y: 590, size: 18, font: bold, color: rgb(0.04, 0.15, 0.28) });
    page.drawText(`REVIZIO ${revision} · OLDAL ${index + 1}`, { x: 55, y: 565, size: 10, font: normal });
    page.drawRectangle({ x: 100, y: 150, width: 300 + index * 15, height: 260, borderWidth: 3, borderColor: rgb(0.1, 0.35, 0.55) });
    page.drawText(index === 0 ? 'NAPPALI' : index === 1 ? 'HALOSZOBA' : label.toUpperCase(), { x: 135, y: 300, size: 13, font: bold });
    page.drawText(`${(28 + index * 5).toFixed(2)} m2`, { x: 135, y: 280, size: 10, font: normal });
  });
  const target = path.join(fixtureDir, fileName);
  fs.writeFileSync(target, await pdf.save());
  return target;
}

async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V08445 modellátvezetés regresszió');
  await page.type('input[placeholder="Projektkód"]', 'V08445-MODEL');
  await page.type('input[placeholder="Település / helyszín"]', '7100 Szekszárd');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V08445 modellátvezetés regresszió');
  await clickText(page, 'Új felmérés');
  await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const input = await page.$('[role="dialog"][aria-label="Új felmérés"] input');
  await input.click({ clickCount: 3 });
  await input.type('V08445 tervverzió modellátvezetés');
  await clickText(page, 'Tervdokumentáció alapú felmérés', '[role="dialog"] button');
  await clickText(page, 'PDF tervdokumentáció', '[role="dialog"] button');
  await clickText(page, 'Felmérés létrehozása', '[role="dialog"] button');
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
}

let browser;
(async () => {
  const basePdf = await createVersionPdf('alaprajz_R00.pdf', 'R00', ['FOLDSZINTI ALAPRAJZ', 'EMELETI ALAPRAJZ', 'PINCESZINTI ALAPRAJZ']);
  const targetPdf = await createVersionPdf('alaprajz_R01.pdf', 'R01', ['FOLDSZINTI ALAPRAJZ', 'EMELETI ALAPRAJZ', 'TETOTERI ALAPRAJZ']);
  assert(fs.statSync(basePdf).size > 1000 && fs.statSync(targetPdf).size > 1000, 'A két tervverzió PDF-fixture nem készült el.');
  pass('Két háromoldalas PDF tervverzió-fixture készült párosított, új és megszűnt oldallal');

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP dimpro.hu 127.0.0.1'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await setViewport(page, 1920, 1080);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek');
  await createProjectAndSurvey(page);

  let upload = await page.$('[data-plan-document-upload]');
  await upload.uploadFile(basePdf);
  await page.waitForSelector('[data-plan-document-stage]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-document-data-panel]');
  upload = await page.$('[data-plan-document-data-panel] [data-plan-document-upload]');
  await upload.uploadFile(targetPdf);
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-document-select] option').length === 2, { timeout: 30000 });
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return draft?.planDocumentWorkspace?.documents?.length === 2;
  }, { timeout: 30000 });
  await sleep(500);
  pass('A korábbi és az új háromoldalas PDF ugyanabba a tervdokumentációs munkatérbe feltölthető');

  const ids = await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    const survey = workspace.surveys?.find((item) => item.id === workspace.activeSurveyId);
    const draft = survey?.draft;
    const plan = draft?.planDocumentWorkspace;
    if (!draft || !plan || plan.documents?.length !== 2) throw new Error('A két feltöltött dokumentum nem található.');
    const [baseDocument, targetDocument] = plan.documents;
    const now = new Date().toISOString();
    const baseLevel = draft.levels?.[0] || { id: 'level-ground', name: 'Földszint', order: 0, elevationMeters: 0, heightMeters: 2.7 };
    const makeLevel = (id, name, order) => ({ ...baseLevel, id, name, order });
    const levels = [baseLevel, makeLevel('level-floor-1', '1. emelet', 1), makeLevel('level-basement', 'Pince', -1), makeLevel('level-attic', 'Tetőtér', 2)];
    draft.levels = levels;
    const room = (id, pageId, name, x, y, width, height, area, status = 'approved') => ({ id, pageId, levelId: '', name, function: name, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], labelPosition: null, calculatedAreaSquareMeters: area, labeledAreaSquareMeters: area, areaDifferenceSquareMeters: 0, areaDifferencePercent: 0, confidence: 'high', confidenceScore: 0.95, source: 'userCorrected', sourceDetails: 'V08445 E2E', geometryMethod: 'manualPolygon', contourClosed: true, heated: true, roomHeightMeters: 2.7, status, userModified: true, createdAt: now, updatedAt: now });
    const wall = (id, pageId, levelId, roomId, startX, endX, length, status = 'approved') => ({ id, pageId, levelId, start: { x: startX, y: 0.12 }, end: { x: endX, y: 0.12 }, boundaryType: 'externalAir', orientationDegrees: 0, orientationLabel: 'É', lengthMeters: length, heightMeters: 2.7, thicknessMeters: 0.38, assemblyId: 'assembly-v08445-wall', zoneId: 'zone-v08445', adjacentZoneId: '', grossAreaSquareMeters: length * 2.7, openingAreaSquareMeters: 1.8, netAreaSquareMeters: length * 2.7 - 1.8, connectedRoomSuggestionIds: [roomId], confidence: 'high', confidenceScore: 0.95, source: 'userCorrected', sourceDetails: 'V08445 E2E', status, userModified: true, createdAt: now, updatedAt: now });
    const opening = (id, pageId, levelId, wallId, name, width, status = 'approved') => ({ id, pageId, levelId, wallSuggestionId: wallId, connectedRoomSuggestionIds: [], zoneId: 'zone-v08445', name, kind: 'window', center: { x: 0.28, y: 0.12 }, offsetRatio: 0.5, widthMeters: width, heightMeters: 1.5, sillHeightMeters: 0.9, areaSquareMeters: width * 1.5, frame: 'PVC', glazing: '3 rétegű üveg', uValueWm2K: '1,10', catalogProfileId: 'pvc-triple-template', sourceReference: 'V08445 E2E adatlap', solarGValue: '0,50', shading: 'Nincs', thermalBridgeMode: 'none', installationPsiWmK: '', installationPsiSourceReference: '', confidence: 'high', confidenceScore: 0.9, source: 'userCorrected', sourceDetails: 'V08445 E2E', status, userModified: true, createdAt: now, updatedAt: now });
    const configurePage = (page, label, levelId, roomData, wallData, openingData) => {
      page.pageLabel = label;
      page.planType = 'floorPlan';
      page.planVersion = page.documentId === baseDocument.id ? 'construction' : 'modifiedConstruction';
      page.levelId = levelId;
      page.contentKind = 'vector';
      page.recognitionStatus = 'ready';
      page.suggestions = roomData.map((item) => ({ ...item, levelId }));
      page.wallSuggestions = wallData.map((item) => ({ ...item, levelId }));
      page.openingSuggestions = openingData.map((item) => ({ ...item, levelId }));
      page.updatedAt = now;
    };
    const [b1, b2, b3] = baseDocument.pages;
    const [t1, t2, t3] = targetDocument.pages;
    configurePage(b1, 'Földszinti alaprajz', baseLevel.id,
      [room('base-living', b1.id, 'Nappali', 0.1, 0.15, 0.3, 0.24, 30), room('base-pantry', b1.id, 'Kamra', 0.46, 0.15, 0.12, 0.14, 8)],
      [wall('base-wall-living', b1.id, baseLevel.id, 'base-living', 0.1, 0.4, 6), wall('base-wall-pantry', b1.id, baseLevel.id, 'base-pantry', 0.46, 0.58, 2.4)],
      [opening('base-opening-living', b1.id, baseLevel.id, 'base-wall-living', 'Nappali ablak', 1.2), opening('base-opening-pantry', b1.id, baseLevel.id, 'base-wall-pantry', 'Kamra ablak', 0.6)]);
    configurePage(t1, 'Földszinti alaprajz', baseLevel.id,
      [room('target-living', t1.id, 'Nappali', 0.1, 0.15, 0.32, 0.24, 32, 'review'), room('target-bath', t1.id, 'Fürdő', 0.62, 0.15, 0.14, 0.15, 9, 'review')],
      [wall('target-wall-living', t1.id, baseLevel.id, 'target-living', 0.1, 0.42, 6.4, 'review'), wall('target-wall-bath', t1.id, baseLevel.id, 'target-bath', 0.62, 0.76, 2.8, 'review')],
      [opening('target-opening-living', t1.id, baseLevel.id, 'target-wall-living', 'Nappali ablak', 1.5, 'review'), opening('target-opening-bath', t1.id, baseLevel.id, 'target-wall-bath', 'Fürdő ablak', 0.8, 'review')]);
    configurePage(b2, 'Emeleti alaprajz', 'level-floor-1', [room('base-bedroom', b2.id, 'Hálószoba', 0.2, 0.2, 0.25, 0.2, 20)], [], []);
    configurePage(t2, 'Emeleti alaprajz', 'level-floor-1', [room('target-bedroom', t2.id, 'Hálószoba', 0.2, 0.2, 0.25, 0.2, 20, 'review')], [], []);
    configurePage(b3, 'Pinceszinti alaprajz', 'level-basement', [room('base-cellar', b3.id, 'Pince', 0.2, 0.2, 0.3, 0.2, 24)], [], []);
    configurePage(t3, 'Tetőtéri alaprajz', 'level-attic', [room('target-attic', t3.id, 'Tetőtér', 0.18, 0.18, 0.42, 0.3, 48, 'review')], [], []);
    baseDocument.revisionCode = 'R00'; baseDocument.revisionDate = '2026-07-01'; baseDocument.versionGroupId = `group-${baseDocument.id}`; baseDocument.isCurrentVersion = true;
    targetDocument.revisionCode = 'R01'; targetDocument.revisionDate = '2026-07-31'; targetDocument.versionGroupId = `group-${targetDocument.id}`; targetDocument.isCurrentVersion = true;
    plan.activeDocumentId = targetDocument.id;
    plan.activePageId = t1.id;
    plan.versionComparison = { version: '1', comparisons: {}, activeComparisonId: null, modelApplications: {}, modelApplicationAudit: [], updatedAt: now };
    const centralRoom = (id, pageValue, suggestion) => ({ id, levelId: pageValue.levelId, name: suggestion.name, function: suggestion.function, area: suggestion.calculatedAreaSquareMeters, height: suggestion.roomHeightMeters, x: suggestion.polygon[0].x * 900, y: suggestion.polygon[0].y * 610, width: Math.max(1, (suggestion.polygon[1].x - suggestion.polygon[0].x) * 900), depth: Math.max(1, (suggestion.polygon[2].y - suggestion.polygon[1].y) * 610), polygon: suggestion.polygon.map((point) => ({ x: point.x * 900, y: point.y * 610 })), heated: suggestion.heated, externalWallType: 'V08445 külső fal', floorType: '', ceilingType: '', windowCount: 0, windowType: '', orientation: 'É', note: '', planDataSource: 'userCorrected', planRecognitionStatus: 'approved', planConfidence: 'high', planDocumentId: pageValue.documentId, planPageId: pageValue.id, planSuggestionId: suggestion.id });
    const centralRooms = [centralRoom('central-base-living', b1, b1.suggestions[0]), centralRoom('central-base-pantry', b1, b1.suggestions[1]), centralRoom('central-base-bedroom', b2, b2.suggestions[0]), centralRoom('central-base-cellar', b3, b3.suggestions[0])];
    const roomBySuggestion = new Map(centralRooms.map((item) => [item.planSuggestionId, item]));
    const centralWalls = b1.wallSuggestions.map((item) => ({ id: `central-${item.id}`, levelId: item.levelId, roomId: roomBySuggestion.get(item.connectedRoomSuggestionIds[0]).id, side: 'top', startRatio: 0, endRatio: 1, boundaryType: 'external', wallType: 'V08445 külső fal', thicknessCm: 38, assemblyId: item.assemblyId, note: 'Korábbi tervverzió központi fala', isAutoGenerated: false, measuredLengthMeters: item.lengthMeters, heightMeters: item.heightMeters, orientationDegrees: item.orientationDegrees, zoneId: item.zoneId, dataSource: 'planTransfer', planPageId: b1.id, planWallSuggestionId: item.id, planStart: item.start, planEnd: item.end, planTransferUpdatedAt: now, planTransferLocked: false, createdAt: now, updatedAt: now }));
    const wallBySuggestion = new Map(centralWalls.map((item) => [item.planWallSuggestionId, item]));
    const centralOpenings = b1.openingSuggestions.map((item) => ({ id: `central-${item.id}`, levelId: item.levelId, roomId: wallBySuggestion.get(item.wallSuggestionId).roomId, wallSegmentId: wallBySuggestion.get(item.wallSuggestionId).id, kind: item.kind, name: item.name, widthMeters: item.widthMeters, heightMeters: item.heightMeters, sillHeightMeters: item.sillHeightMeters, offsetRatio: item.offsetRatio, frame: item.frame, glazing: item.glazing, uValue: item.uValueWm2K, shading: item.shading, note: 'Korábbi tervverzió központi nyílászárója', zoneId: item.zoneId, catalogProfileId: item.catalogProfileId, dataSource: 'planTransfer', planPageId: b1.id, planOpeningSuggestionId: item.id, planTransferUpdatedAt: now, planTransferLocked: false, createdAt: now, updatedAt: now }));
    draft.rooms = centralRooms;
    draft.wallSegments = centralWalls;
    draft.wallOpenings = centralOpenings;
    draft.assemblies = [{ id: 'assembly-v08445-wall', category: 'wall', name: 'V08445 38 cm külső fal', heatFlowDirection: 'horizontal', boundaryMode: 'externalAir', calculationMode: 'declared', complexity: 'homogeneous', requirementType: 'externalWall', surfaceResistanceMode: 'ruleSetDefault', declaredUValueWm2K: '0.24', declaredUValueSource: 'V08445 E2E adatlap', corrections: { policy: 'applyAll', airVoid: { level: 'none' }, mechanicalFastener: { enabled: false, fastenerLambdaWmK: 50, fastenerCountPerSquareMeter: 0, fastenerCrossSectionSquareMeters: 0, insulationThicknessMeters: 0, penetrationLengthMeters: 0, embedded: false, passesAirLayer: false, pointFastener: true }, invertedRoofDeltaUWm2K: 0, invertedRoofSource: '' }, layers: [{ id: 'layer-v08445', kind: 'solid', material: 'Tesztfal', thicknessCm: 38, lambdaWmK: '0.16', note: '' }], note: '', createdAt: now, updatedAt: now }];
    draft.energyZoneWorkspace = { schemaVersion: 1, zones: [{ id: 'zone-v08445', name: 'Lakótér', usageProfile: 'residential', serviceLevel: 'heatedNaturalVentilation', heatingSetpointC: 20, note: '', createdAt: now, updatedAt: now }], unheatedSpaces: [], roomAssignments: Object.fromEntries(centralRooms.map((item) => [item.id, 'zone-v08445'])), unheatedRoomAssignments: {}, createdAt: now, updatedAt: now };
    draft.energyOpeningWorkspace = { ...draft.energyOpeningWorkspace, openingDetails: {}, thermalBridges: [], updatedAt: now };
    plan.transferRegistry = { version: '1', records: { [b1.id]: { pageId: b1.id, documentId: baseDocument.id, state: 'synced', lastAction: 'created', lastTransferId: 'v08445-base-transfer', lastTransferredAt: now, sourceFingerprint: 'v08445-base-source', modelFingerprint: 'v08445-base-model', sourceWallSuggestionIds: b1.wallSuggestions.map((item) => item.id), sourceOpeningSuggestionIds: b1.openingSuggestions.map((item) => item.id), centralWallIds: centralWalls.map((item) => item.id), centralOpeningIds: centralOpenings.map((item) => item.id), centralThermalBridgeIds: [], wallCount: centralWalls.length, openingCount: centralOpenings.length, thermalBridgeCount: 0, updatedAt: now } }, auditLog: [], updatedAt: now };
    draft.activeLevelId = baseLevel.id;
    draft.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(workspace));
    return { baseDocumentId: baseDocument.id, targetDocumentId: targetDocument.id, basePageIds: [b1.id, b2.id, b3.id], targetPageIds: [t1.id, t2.id, t3.id], centralLivingWallId: centralWalls[0].id, centralLivingOpeningId: centralOpenings[0].id, originalRoomCount: centralRooms.length, originalWallCount: centralWalls.length, originalOpeningCount: centralOpenings.length };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-version-comparison]');
  pass('A revíziókód, kiadási dátum, verziócsoport és előzménykapcsolat felülete megjelenik');

  await page.select('[data-plan-version-base-document]', ids.baseDocumentId);
  await page.select('[data-plan-version-target-document]', ids.targetDocumentId);
  await page.click('[data-plan-version-compare]');
  await page.waitForSelector('[data-plan-version-comparison-status="draft"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-version-page-pair]').length === 3, { timeout: 30000 });
  await page.waitForSelector('[data-plan-version-removed-page]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    return comparison?.pagePairs?.length === 4;
  }, { timeout: 30000 });
  await sleep(500);
  const comparisonState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparisonId = plan?.versionComparison?.activeComparisonId;
    const comparison = comparisonId ? plan.versionComparison.comparisons[comparisonId] : null;
    const diffs = comparison?.pagePairs?.flatMap((pair) => pair.elementDiffs || []) || [];
    const baseDocument = plan?.documents?.find((item) => item.id === comparison?.baseDocumentId);
    const targetDocument = plan?.documents?.find((item) => item.id === comparison?.targetDocumentId);
    return {
      pairCount: comparison?.pagePairs?.length || 0,
      normalPairs: comparison?.pagePairs?.filter((pair) => pair.basePageId && pair.targetPageId).length || 0,
      addedPages: comparison?.pagePairs?.filter((pair) => !pair.basePageId && pair.targetPageId).length || 0,
      removedPages: comparison?.pagePairs?.filter((pair) => pair.basePageId && !pair.targetPageId).length || 0,
      modified: diffs.filter((diff) => diff.changeType === 'modified').length,
      added: diffs.filter((diff) => diff.changeType === 'added').length,
      removed: diffs.filter((diff) => diff.changeType === 'removed').length,
      groupMatch: baseDocument?.versionGroupId === targetDocument?.versionGroupId,
      supersedes: targetDocument?.supersedesDocumentId === baseDocument?.id,
      baseCurrent: baseDocument?.isCurrentVersion,
      targetCurrent: targetDocument?.isCurrentVersion,
    };
  });
  assert(comparisonState.pairCount === 4 && comparisonState.normalPairs === 2 && comparisonState.addedPages === 1 && comparisonState.removedPages === 1, `Az oldal-párosítás hibás: ${JSON.stringify(comparisonState)}`);
  assert(comparisonState.modified >= 3 && comparisonState.added >= 3 && comparisonState.removed >= 3, `Az elemdiff hiányos: ${JSON.stringify(comparisonState)}`);
  assert(comparisonState.groupMatch && comparisonState.supersedes && comparisonState.baseCurrent === false && comparisonState.targetCurrent === true, `A revíziólánc hibás: ${JSON.stringify(comparisonState)}`);
  pass('Két oldal automatikusan párosul, az új és megszűnt oldal külön oldal-diffet kap, a revíziólánc létrejön');

  await page.click('[data-plan-document-view-mode="plan"]');
  await page.waitForSelector('[data-plan-version-diff-overlay]', { timeout: 30000 });
  const overlayState = await page.evaluate(() => ({
    baseRooms: document.querySelectorAll('[data-plan-version-diff-base-room]').length,
    targetRooms: document.querySelectorAll('[data-plan-version-diff-target-room]').length,
    legend: Boolean(document.querySelector('[data-plan-version-diff-legend]')),
  }));
  assert(overlayState.baseRooms >= 1 && overlayState.targetRooms >= 1 && overlayState.legend, `A vizuális verzió-diff hiányos: ${JSON.stringify(overlayState)}`);
  pass('A rajzi nézet vörös/narancs baseline és kék/zöld cél overlayen mutatja a változásokat');

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector(`[data-plan-version-base-page="${ids.targetPageIds[1]}"]`);
  await page.select(`[data-plan-version-base-page="${ids.targetPageIds[1]}"]`, '');
  await page.waitForFunction((targetPageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    const pair = comparison?.pagePairs?.find((item) => item.targetPageId === targetPageId);
    return pair?.method === 'manual' && !pair.basePageId && pair.elementDiffs?.every((diff) => diff.changeType === 'added');
  }, {}, ids.targetPageIds[1]);
  await page.select(`[data-plan-version-base-page="${ids.targetPageIds[1]}"]`, ids.basePageIds[1]);
  await page.waitForFunction((targetPageId, basePageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    const pair = comparison?.pagePairs?.find((item) => item.targetPageId === targetPageId);
    return pair?.method === 'manual' && pair.basePageId === basePageId;
  }, {}, ids.targetPageIds[1], ids.basePageIds[1]);
  pass('Az automatikus oldal-pár kézzel párosítatlanná, majd kézi oldal-párrá alakítható');

  const selectPairByTarget = async (targetPageId) => {
    const card = await page.$(`[data-plan-version-page-pair="${targetPageId}"]`);
    assert(card, `Nem található céloldal-pár: ${targetPageId}`);
    const button = await card.$('button');
    await button.click();
    await sleep(650);
  };
  await selectPairByTarget(ids.targetPageIds[0]);
  await page.waitForSelector('[data-plan-version-element-diffs]');
  const firstModified = await page.$('[data-plan-version-change-type="modified"] [data-plan-version-diff-accept]');
  assert(firstModified, 'Nincs elfogadható módosított elemdiff.');
  await firstModified.click();
  await page.waitForSelector('[data-plan-version-change-type="modified"][data-plan-version-decision="accepted"]');
  const firstRemoved = await page.$('[data-plan-version-change-type="removed"] [data-plan-version-diff-reject]');
  assert(firstRemoved, 'Nincs elutasítható törölt elemdiff.');
  await firstRemoved.click();
  await page.waitForSelector('[data-plan-version-change-type="removed"][data-plan-version-decision="rejected"]');
  pass('A táblázatos diffben egy módosított elem elfogadható, egy törölt elem külön elutasítható');

  await page.click('[data-plan-version-accept-all]');
  await sleep(600);
  await selectPairByTarget(ids.targetPageIds[2]);
  await page.click('[data-plan-version-accept-all]');
  await sleep(600);
  const removedPageButton = await page.$('[data-plan-version-removed-page]');
  await removedPageButton.click();
  await sleep(600);
  await page.click('[data-plan-version-reject-all]');
  await sleep(600);
  const decisions = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    const diffs = comparison?.pagePairs?.flatMap((pair) => pair.elementDiffs || []).filter((diff) => diff.changeType !== 'unchanged') || [];
    return { pending: diffs.filter((diff) => diff.decision === 'pending').length, accepted: diffs.filter((diff) => diff.decision === 'accepted').length, rejected: diffs.filter((diff) => diff.decision === 'rejected').length };
  });
  assert(decisions.pending === 0 && decisions.accepted > 0 && decisions.rejected > 0, `A teljes részleges döntési készlet hibás: ${JSON.stringify(decisions)}`);
  pass('Oldalpáronként tömeges döntés adható, miközben más oldalak eltérő döntést őriznek meg');

  await page.click('[data-plan-version-apply-decisions]');
  await page.waitForSelector('[data-plan-version-comparison-status="applied"]', { timeout: 30000 });
  await sleep(1200);
  const appliedState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    const target = plan?.documents?.find((document) => document.id === comparison?.targetDocumentId);
    const statuses = target?.pages?.flatMap((page) => [...(page.suggestions || []), ...(page.wallSuggestions || []), ...(page.openingSuggestions || [])].map((item) => ({ id: item.id, status: item.status }))) || [];
    return { status: comparison?.status, appliedAt: comparison?.appliedAt, approved: statuses.filter((item) => item.status === 'approved').length, ignored: statuses.filter((item) => item.status === 'ignored').length, targetCurrent: target?.isCurrentVersion };
  });
  assert(appliedState.status === 'applied' && appliedState.appliedAt && appliedState.approved > 0 && appliedState.targetCurrent, `A döntések alkalmazása hibás: ${JSON.stringify(appliedState)}`);
  pass('A döntések alkalmazása jóváhagyja az elfogadott cél-elemeket és alkalmazott állapotba zárja az új tervverziót');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-version-comparison-status="applied"]');
  const persisted = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparison = plan?.versionComparison?.comparisons?.[plan.versionComparison.activeComparisonId];
    return { schema: plan?.schema, version: plan?.versionComparison?.version, status: comparison?.status, pairCount: comparison?.pagePairs?.length, decisionCount: comparison?.pagePairs?.flatMap((pair) => pair.elementDiffs || []).filter((diff) => diff.changeType !== 'unchanged' && diff.decision !== 'pending').length };
  });
  assert(persisted.schema === 'dimpro.property-survey.plan-document.v1' && persisted.version === '1' && persisted.status === 'applied' && persisted.pairCount === 4 && persisted.decisionCount > 0, `Az újranyitott verzió-összehasonlítás hibás: ${JSON.stringify(persisted)}`);
  pass('Az oldal-/elempárok, döntések és alkalmazott állapot mentés és újranyitás után megmaradnak sémaváltás nélkül');

  await page.waitForSelector('[data-plan-version-model-application]');
  const modelPreview = await page.evaluate(() => ({
    status: document.querySelector('[data-plan-version-model-status]')?.getAttribute('data-plan-version-model-status'),
    applyDisabled: document.querySelector('[data-plan-version-model-apply]')?.disabled,
    confirmation: Boolean(document.querySelector('[data-plan-version-model-confirm]')),
    issues: document.querySelectorAll('[data-plan-version-model-issue]').length,
  }));
  assert(modelPreview.status === 'preview' && modelPreview.confirmation && modelPreview.applyDisabled, `A központi modellátvezetési előnézet hibás: ${JSON.stringify(modelPreview)}`);
  await page.click('[data-plan-version-model-confirm]');
  await page.waitForFunction(() => !document.querySelector('[data-plan-version-model-apply]')?.disabled, { timeout: 30000 });
  pass('Az alkalmazott tervdöntések központi modellátvezetési előnézetet, szakmai figyelmeztetéseket és törlési megerősítést kapnak');

  await page.click('[data-plan-version-model-apply]');
  await page.waitForSelector('[data-plan-version-model-status="applied"]', { timeout: 30000 });
  await page.waitForSelector('[data-plan-version-model-rollback-panel]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparisonId = plan?.versionComparison?.activeComparisonId;
    return plan?.versionComparison?.modelApplications?.[comparisonId]?.status === 'applied';
  }, { timeout: 30000 });
  await sleep(500);
  const migrated = await page.evaluate((ids) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparisonId = plan?.versionComparison?.activeComparisonId;
    return {
      roomSources: draft.rooms.map((item) => item.planSuggestionId),
      walls: draft.wallSegments.map((item) => ({ id: item.id, pageId: item.planPageId, source: item.planWallSuggestionId })),
      openings: draft.wallOpenings.map((item) => ({ id: item.id, pageId: item.planPageId, source: item.planOpeningSuggestionId })),
      targetRegistry: Boolean(plan.transferRegistry.records[ids.targetPageIds[0]]),
      baseRegistry: Boolean(plan.transferRegistry.records[ids.basePageIds[0]]),
      application: plan.versionComparison.modelApplications[comparisonId],
      snapshotCount: Object.keys(plan.versionComparison.modelSnapshotStore?.snapshots || {}).length,
      historyCount: plan.versionComparison.modelApplicationHistory?.length || 0,
      auditCount: plan.versionComparison.modelApplicationAudit.length,
    };
  }, ids);
  assert(migrated.roomSources.includes('target-living') && migrated.roomSources.includes('target-bath') && !migrated.roomSources.includes('base-pantry'), `A helyiségátvezetés hibás: ${JSON.stringify(migrated.roomSources)}`);
  assert(migrated.walls.some((item) => item.id === ids.centralLivingWallId && item.source === 'target-wall-living') && migrated.openings.some((item) => item.id === ids.centralLivingOpeningId && item.source === 'target-opening-living'), `A stabil központi ID nem maradt meg: ${JSON.stringify({ walls: migrated.walls, openings: migrated.openings })}`);
  assert(!migrated.walls.some((item) => item.source === 'base-wall-pantry') && migrated.walls.some((item) => item.source === 'target-wall-bath') && !migrated.openings.some((item) => item.source === 'base-opening-pantry') && migrated.openings.some((item) => item.source === 'target-opening-bath'), 'Az elfogadott törlés/új elem központi átvezetése hibás.');
  assert(migrated.targetRegistry && !migrated.baseRegistry && migrated.application?.rollbackSnapshotId && migrated.snapshotCount >= 1 && migrated.historyCount >= 1 && migrated.auditCount >= 1, 'A transfer registry, előzmény, audit vagy deduplikált rollback-pillanatkép hiányzik.');
  pass('A központi modell részlegesen frissül, a párosított ID-k megmaradnak, az új/törölt elemek és a transfer registry átvezetődnek');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-version-model-status="applied"]');
  assert(await page.$('[data-plan-version-model-audit-entry="apply"]'), 'Az alkalmazási audit újranyitás után hiányzik.');
  pass('A modellátvezetési rekord, audit és visszaállítási pont mentés és újranyitás után megmarad');

  await page.click('[data-plan-version-model-rollback-confirm]');
  await page.click('[data-plan-version-model-rollback]');
  await page.waitForSelector('[data-plan-version-model-status="rolledBack"]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const comparisonId = plan?.versionComparison?.activeComparisonId;
    return plan?.versionComparison?.modelApplications?.[comparisonId]?.status === 'rolledBack';
  }, { timeout: 30000 });
  await sleep(500);
  const restored = await page.evaluate((ids) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    return { wallSources: draft.wallSegments.map((item) => item.planWallSuggestionId), openingSources: draft.wallOpenings.map((item) => item.planOpeningSuggestionId), baseRegistry: Boolean(plan.transferRegistry.records[ids.basePageIds[0]]), targetRegistry: Boolean(plan.transferRegistry.records[ids.targetPageIds[0]]), rollbackAudit: plan.versionComparison.modelApplicationAudit.some((item) => item.action === 'rollback') };
  }, ids);
  assert(restored.wallSources.includes('base-wall-living') && restored.wallSources.includes('base-wall-pantry') && !restored.wallSources.includes('target-wall-living') && !restored.wallSources.includes('target-wall-bath') && restored.openingSources.includes('base-opening-living') && restored.openingSources.includes('base-opening-pantry') && !restored.openingSources.includes('target-opening-living') && !restored.openingSources.includes('target-opening-bath') && restored.baseRegistry && !restored.targetRegistry && restored.rollbackAudit, `A teljes rollback hibás: ${JSON.stringify(restored)}`);
  pass('A rollback a teljes központi modellt, a forráskapcsolatokat és az átadási nyilvántartást visszaállítja');

  await setViewport(page, 1194, 834);
  await page.screenshot({ path: path.join(screenshotDir, 'version_diff_1194x834.png'), fullPage: false });
  await setViewport(page, 834, 1194);
  await page.screenshot({ path: path.join(screenshotDir, 'version_diff_834x1194.png'), fullPage: false });
  assert(fs.statSync(path.join(screenshotDir, 'version_diff_1194x834.png')).size > 10000 && fs.statSync(path.join(screenshotDir, 'version_diff_834x1194.png')).size > 10000, 'A tablet screenshot-regresszió hiányos.');
  pass('A tervverzió- és modellátvezetési felület fekvő és álló tableten overflow nélkül megjelenik');

  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('favicon') && !message.includes('404'));
  assert(relevantConsoleErrors.length === 0 && pageErrors.length === 0, `Böngészőhibák: ${JSON.stringify({ consoleErrors: relevantConsoleErrors, pageErrors })}`);
  pass('A teljes tervverzió-modellátvezetési E2E böngészőkonzol- és oldalhiba nélkül futott');

  console.log(`DIMPRO Felmérő v0.8.4.4.5 tervverzió → energetikai modell E2E: ${testCount}/${testCount} sikeres`);
  for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
  console.log(`Screenshotok: ${screenshotDir}`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
