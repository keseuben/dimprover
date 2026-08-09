const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3043/ingatlanfelmero';
const screenshotDir = process.env.DIMPRO_TEST_SCREENSHOT_DIR || '/tmp/dimpro_v08446_version_graph_screenshots';
const fixtureDir = process.env.DIMPRO_TEST_FIXTURE_DIR || '/tmp/dimpro_v08446_version_graph_fixtures';
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
async function setViewport(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: width <= 1194 });
  await sleep(450);
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, html: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(dimensions.body <= width + 2 && dimensions.html <= width + 2, `Vízszintes overflow ${width}×${height}: ${JSON.stringify(dimensions)}`);
}

async function createPdf(fileName, revision) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([900, 650]);
  page.drawText(`DIMPRO TERVVERZIO ${revision}`, { x: 70, y: 570, size: 24, font });
  page.drawRectangle({ x: 100, y: 170, width: 500, height: 280, borderWidth: 3 });
  page.drawText(`FOLDSZINT ${revision}`, { x: 150, y: 310, size: 18, font });
  const target = path.join(fixtureDir, fileName);
  fs.writeFileSync(target, await pdf.save());
  return target;
}

async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V08446 verziógráf regresszió');
  await page.type('input[placeholder="Projektkód"]', 'V08446-GRAPH');
  await page.type('input[placeholder="Település / helyszín"]', '7100 Szekszárd');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V08446 verziógráf regresszió');
  await clickText(page, 'Új felmérés');
  await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const nameInput = await page.$('[role="dialog"][aria-label="Új felmérés"] input');
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('V08446 több tervverzió és rollback');
  await clickText(page, 'Tervdokumentáció alapú felmérés', '[role="dialog"] button');
  await clickText(page, 'PDF tervdokumentáció', '[role="dialog"] button');
  await clickText(page, 'Felmérés létrehozása', '[role="dialog"] button');
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
}

let browser;
(async () => {
  const pdfR00 = await createPdf('alaprajz_R00.pdf', 'R00');
  const pdfR01 = await createPdf('alaprajz_R01.pdf', 'R01');
  const pdfR02 = await createPdf('alaprajz_R02.pdf', 'R02');
  assert([pdfR00, pdfR01, pdfR02].every((file) => fs.statSync(file).size > 700), 'A három PDF-fixture nem készült el.');
  pass('Három egymást követő PDF tervverzió-fixture készült');

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
  await upload.uploadFile(pdfR00);
  await page.waitForSelector('[data-plan-document-stage]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-document-data-panel]');
  upload = await page.$('[data-plan-document-data-panel] [data-plan-document-upload]');
  await upload.uploadFile(pdfR01);
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-document-select] option').length === 2, { timeout: 30000 });
  upload = await page.$('[data-plan-document-data-panel] [data-plan-document-upload]');
  await upload.uploadFile(pdfR02);
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-document-select] option').length === 3, { timeout: 30000 });
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return draft?.planDocumentWorkspace?.documents?.length === 3;
  }, { timeout: 30000 });
  await sleep(500);
  pass('Az R00, R01 és R02 PDF ugyanabba a tervdokumentációs munkatérbe feltölthető');

  const seeded = await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    const survey = workspace.surveys?.find((item) => item.id === workspace.activeSurveyId);
    const draft = survey?.draft;
    const plan = draft?.planDocumentWorkspace;
    if (!draft || !plan || plan.documents?.length !== 3) throw new Error('A három dokumentum nem található.');
    const [r00, r01, r02] = plan.documents;
    const now = '2026-07-31T15:40:00.000Z';
    const revisions = [
      { document: r00, code: 'R00', date: '2026-07-01', parent: '', current: false },
      { document: r01, code: 'R01', date: '2026-07-15', parent: r00.id, current: false },
      { document: r02, code: 'R02', date: '2026-07-31', parent: r01.id, current: true },
    ];
    for (const item of revisions) {
      item.document.revisionCode = item.code;
      item.document.revisionDate = item.date;
      item.document.versionGroupId = 'v08446-main-group';
      item.document.supersedesDocumentId = item.parent;
      item.document.isCurrentVersion = item.current;
      item.document.updatedAt = now;
      item.document.pages[0].pageLabel = `Földszinti alaprajz ${item.code}`;
      item.document.pages[0].levelId = draft.levels[0].id;
      item.document.pages[0].planType = 'floorPlan';
      item.document.pages[0].contentKind = 'vector';
    }
    const counts = { roomCreateCount: 0, roomUpdateCount: 1, roomDeleteCount: 0, wallCreateCount: 0, wallUpdateCount: 0, wallDeleteCount: 0, openingCreateCount: 0, openingUpdateCount: 0, openingDeleteCount: 0, thermalBridgeCreateCount: 0, thermalBridgeDeleteCount: 0, preservedCentralIdCount: 0 };
    const room = (id, source, name, area) => ({ id, levelId: draft.levels[0].id, name, function: name, area, height: 2.7, x: 90, y: 61, width: 320, depth: 200, heated: true, externalWallType: 'Tesztfal', floorType: '', ceilingType: '', windowCount: 0, windowType: '', orientation: 'É', note: '', planDataSource: 'userCorrected', planRecognitionStatus: 'approved', planConfidence: 'high', planDocumentId: source.document.id, planPageId: source.document.pages[0].id, planSuggestionId: `${source.code.toLowerCase()}-room` });
    const registry = structuredClone(plan.transferRegistry);
    registry.updatedAt = now;
    const snapshotPayload = (roomValue) => ({ rooms: [roomValue], wallSegments: [], wallOpenings: [], zoneWorkspace: structuredClone(draft.energyZoneWorkspace), openingWorkspace: structuredClone(draft.energyOpeningWorkspace), transferRegistry: structuredClone(registry) });
    const snapshot1 = snapshotPayload(room('central-r00-room', revisions[0], 'Nappali R00', 24));
    const snapshot2 = snapshotPayload(room('central-r01-room', revisions[1], 'Nappali R01', 26));
    const text1 = JSON.stringify(snapshot1);
    const text2 = JSON.stringify(snapshot2);
    const snapshotId1 = 'snapshot-r00-before-r01';
    const snapshotId2 = 'snapshot-r01-before-r02';
    const comparison1 = { id: 'comparison-r00-r01', baseDocumentId: r00.id, targetDocumentId: r01.id, status: 'applied', pagePairs: [], createdAt: '2026-07-31T15:41:00.000Z', updatedAt: '2026-07-31T15:41:00.000Z', appliedAt: '2026-07-31T15:41:00.000Z' };
    const comparison2 = { id: 'comparison-r01-r02', baseDocumentId: r01.id, targetDocumentId: r02.id, status: 'applied', pagePairs: [], createdAt: '2026-07-31T15:42:00.000Z', updatedAt: '2026-07-31T15:42:00.000Z', appliedAt: '2026-07-31T15:42:00.000Z' };
    const application1 = { id: 'application-r00-r01', comparisonId: comparison1.id, baseDocumentId: r00.id, targetDocumentId: r01.id, status: 'superseded', sequenceNumber: 1, parentApplicationId: '', counts, issues: [], appliedAt: '2026-07-31T15:41:00.000Z', rolledBackAt: '', sourceComparisonUpdatedAt: comparison1.updatedAt, rollbackSnapshotId: snapshotId1, rollbackSnapshotBytes: text1.length, rollbackSnapshot: null, updatedAt: '2026-07-31T15:42:00.000Z' };
    const application2 = { id: 'application-r01-r02', comparisonId: comparison2.id, baseDocumentId: r01.id, targetDocumentId: r02.id, status: 'applied', sequenceNumber: 2, parentApplicationId: application1.id, counts, issues: [], appliedAt: '2026-07-31T15:42:00.000Z', rolledBackAt: '', sourceComparisonUpdatedAt: comparison2.updatedAt, rollbackSnapshotId: snapshotId2, rollbackSnapshotBytes: text2.length, rollbackSnapshot: null, updatedAt: '2026-07-31T15:42:00.000Z' };
    plan.versionComparison = {
      version: '1',
      comparisons: { [comparison1.id]: comparison1, [comparison2.id]: comparison2 },
      activeComparisonId: comparison2.id,
      modelApplications: { [comparison1.id]: application1, [comparison2.id]: application2 },
      modelApplicationHistory: [application1, application2],
      modelSnapshotStore: {
        version: '1',
        snapshots: {
          [snapshotId1]: { id: snapshotId1, fingerprint: 'fp-r00', payload: snapshot1, estimatedBytes: text1.length, createdAt: application1.appliedAt, lastUsedAt: application1.updatedAt },
          [snapshotId2]: { id: snapshotId2, fingerprint: 'fp-r01', payload: snapshot2, estimatedBytes: text2.length, createdAt: application2.appliedAt, lastUsedAt: application2.updatedAt },
        },
        order: [snapshotId1, snapshotId2],
        maxSnapshots: 8,
        updatedAt: now,
      },
      modelApplicationAudit: [
        { id: 'audit-r00-r01', comparisonId: comparison1.id, applicationId: application1.id, action: 'apply', result: 'success', counts, message: 'R00 → R01 alkalmazva.', createdAt: application1.appliedAt },
        { id: 'audit-r01-r02', comparisonId: comparison2.id, applicationId: application2.id, action: 'apply', result: 'success', counts, message: 'R01 → R02 alkalmazva.', createdAt: application2.appliedAt },
      ],
      updatedAt: now,
    };
    draft.rooms = [room('central-r02-room', revisions[2], 'Nappali R02', 28)];
    draft.wallSegments = [];
    draft.wallOpenings = [];
    plan.activeDocumentId = r02.id;
    plan.activePageId = r02.pages[0].id;
    plan.updatedAt = now;
    draft.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(workspace));
    return { r00Id: r00.id, r01Id: r01.id, r02Id: r02.id, comparison1Id: comparison1.id, comparison2Id: comparison2.id, application1Id: application1.id, application2Id: application2.id, snapshotBytes: text1.length + text2.length };
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-version-graph]');
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-version-graph-node]').length === 3 && document.querySelectorAll('[data-plan-version-application-record]').length === 2, { timeout: 30000 });
  const graphState = await page.evaluate(() => ({
    nodes: document.querySelectorAll('[data-plan-version-graph-node]').length,
    applications: document.querySelectorAll('[data-plan-version-application-record]').length,
    text: document.querySelector('[data-plan-version-graph]')?.textContent || '',
  }));
  assert(graphState.nodes === 3 && graphState.applications === 2 && graphState.text.includes('2 rollback-pont') && graphState.text.includes('2 egyedi állapot'), `A verziógráf-felület hibás: ${JSON.stringify(graphState)}`);
  pass('A felület három dokumentumverziót, két alkalmazást és két rollback-pontot jelenít meg');

  await page.click(`[data-plan-version-graph-node="${seeded.r00Id}"]`);
  await page.waitForFunction((documentId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return draft?.planDocumentWorkspace?.activeDocumentId === documentId;
  }, { timeout: 30000 }, seeded.r00Id);
  pass('A verziógráf dokumentumcsomópontja közvetlenül megnyitja a kiválasztott R00 revíziót');

  await page.click(`[data-plan-version-application-record="${seeded.application1Id}"]`);
  await page.waitForFunction((comparisonId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return draft?.planDocumentWorkspace?.versionComparison?.activeComparisonId === comparisonId;
  }, { timeout: 30000 }, seeded.comparison1Id);
  await page.waitForSelector('[data-plan-version-model-rollback-panel]');
  const selected = await page.evaluate((applicationId) => Boolean(document.querySelector(`[data-plan-version-application-record="${applicationId}"]`)), seeded.application1Id);
  assert(selected, 'A történeti R00→R01 alkalmazási rekord nem választható ki.');
  pass('A korábbi R00 → R01 alkalmazás kiválasztása aktiválja a hozzá tartozó összehasonlítást és rollback-pontot');

  await page.click('[data-plan-version-model-rollback-confirm]');
  await page.waitForFunction(() => !document.querySelector('[data-plan-version-model-rollback]')?.disabled, { timeout: 30000 });
  await page.click('[data-plan-version-model-rollback]');
  await page.waitForSelector('[data-plan-version-model-status="rolledBack"]', { timeout: 30000 });
  await page.waitForFunction(({ app1, app2 }) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const history = plan?.versionComparison?.modelApplicationHistory || [];
    return draft?.rooms?.[0]?.planSuggestionId === 'r00-room'
      && history.find((record) => record.id === app1)?.status === 'rolledBack'
      && history.find((record) => record.id === app2)?.status === 'superseded';
  }, { timeout: 30000 }, { app1: seeded.application1Id, app2: seeded.application2Id });
  const rollbackState = await page.evaluate((seededIds) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    return {
      roomSource: draft.rooms?.[0]?.planSuggestionId,
      app1: plan.versionComparison.modelApplicationHistory.find((record) => record.id === seededIds.application1Id)?.status,
      app2: plan.versionComparison.modelApplicationHistory.find((record) => record.id === seededIds.application2Id)?.status,
      current2: plan.versionComparison.modelApplications[seededIds.comparison2Id]?.status,
      audit: plan.versionComparison.modelApplicationAudit.at(-1)?.action,
      snapshots: Object.keys(plan.versionComparison.modelSnapshotStore.snapshots).length,
    };
  }, seeded);
  assert(rollbackState.roomSource === 'r00-room' && rollbackState.app1 === 'rolledBack' && rollbackState.app2 === 'superseded' && rollbackState.current2 === 'superseded' && rollbackState.audit === 'rollback' && rollbackState.snapshots === 2, `A történeti lánc-rollback hibás: ${JSON.stringify(rollbackState)}`);
  pass('A történeti rollback az R00 állapotot visszaállítja, és az utána következő R01→R02 alkalmazást is lezárja');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector(`[data-plan-version-application-record="${seeded.application1Id}"][data-plan-version-application-status="rolledBack"]`);
  await page.waitForSelector(`[data-plan-version-application-record="${seeded.application2Id}"][data-plan-version-application-status="superseded"]`);
  const persisted = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    return { schema: plan?.schema, version: plan?.versionComparison?.version, history: plan?.versionComparison?.modelApplicationHistory?.length, snapshots: Object.keys(plan?.versionComparison?.modelSnapshotStore?.snapshots || {}).length, roomSource: draft?.rooms?.[0]?.planSuggestionId };
  });
  assert(persisted.schema === 'dimpro.property-survey.plan-document.v1' && persisted.version === '1' && persisted.history === 2 && persisted.snapshots === 2 && persisted.roomSource === 'r00-room', `Az újranyitott verziógráf-adatok hibásak: ${JSON.stringify(persisted)}`);
  pass('A verziógráf, előzmények, snapshot-tár és történeti rollback újranyitás után megmarad sémaváltás nélkül');

  await setViewport(page, 1194, 834);
  await page.screenshot({ path: path.join(screenshotDir, 'version_graph_1194x834.png'), fullPage: false });
  await setViewport(page, 834, 1194);
  await page.screenshot({ path: path.join(screenshotDir, 'version_graph_834x1194.png'), fullPage: false });
  assert(fs.statSync(path.join(screenshotDir, 'version_graph_1194x834.png')).size > 10000 && fs.statSync(path.join(screenshotDir, 'version_graph_834x1194.png')).size > 10000, 'A verziógráf tablet screenshot-regresszió hiányos.');
  pass('A verziógráf és alkalmazási előzmény fekvő és álló tableten overflow nélkül megjelenik');

  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('favicon') && !message.includes('404'));
  assert(relevantConsoleErrors.length === 0 && pageErrors.length === 0, `Böngészőhibák: ${JSON.stringify({ consoleErrors: relevantConsoleErrors, pageErrors })}`);
  pass('A teljes háromverziós gráf- és történeti rollback E2E konzol- és oldalhiba nélkül futott');

  console.log(`DIMPRO Felmérő v0.8.4.4.6 verziógráf E2E: ${testCount}/${testCount} sikeres`);
  tests.forEach((message, index) => console.log(`${index + 1}. ${message}`));
  console.log(`Screenshotok: ${screenshotDir}`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
