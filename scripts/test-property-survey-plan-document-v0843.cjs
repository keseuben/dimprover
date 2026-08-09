const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3031/ingatlanfelmero';
const screenshotDir = process.env.DIMPRO_TEST_SCREENSHOT_DIR || '/tmp/dimpro_plan_v0843_screenshots';
const fixtureDir = process.env.DIMPRO_TEST_FIXTURE_DIR || '/tmp/dimpro_plan_v0843_fixtures';
fs.rmSync(screenshotDir, { recursive: true, force: true });
fs.rmSync(fixtureDir, { recursive: true, force: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(fixtureDir, { recursive: true });

let testCount = 0;
const tests = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(message) { testCount += 1; tests.push(message); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function clickText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const target = [...document.querySelectorAll(selector)].find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
    if (!target) return false;
    target.click();
    return true;
  }, { text, selector });
  assert(clicked, `Nem található kattintható elem: ${text}`);
}
async function waitText(page, text, timeout = 30000) {
  await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text);
}
async function screenshot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}
async function viewport(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: width <= 1194 });
  await sleep(500);
  const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, html: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert(dimensions.body <= width + 2 && dimensions.html <= width + 2, `Teljes oldali vízszintes overflow ${width}×${height}: ${JSON.stringify(dimensions)}`);
}
async function dragInElement(page, selector, fromRatio, toRatio) {
  const element = await page.$(selector);
  assert(element, `Nem található drag cél: ${selector}`);
  await element.evaluate((target) => target.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(250);
  const box = await element.boundingBox();
  assert(box && box.width > 100 && box.height > 100, `Érvénytelen drag célméret: ${JSON.stringify(box)}`);
  await page.mouse.move(box.x + box.width * fromRatio.x, box.y + box.height * fromRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio.x, box.y + box.height * toRatio.y, { steps: 8 });
  await page.mouse.up();
}
async function clickPointsInElement(page, selector, ratios) {
  const element = await page.$(selector);
  assert(element, `Nem található pontfelviteli cél: ${selector}`);
  await element.evaluate((target) => target.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(250);
  const box = await element.boundingBox();
  assert(box && box.width > 100 && box.height > 100, `Érvénytelen pontfelviteli célméret: ${JSON.stringify(box)}`);
  for (const ratio of ratios) {
    await page.mouse.click(box.x + box.width * ratio.x, box.y + box.height * ratio.y);
    await sleep(100);
  }
}
async function dragElementByPixels(page, selector, deltaX, deltaY) {
  const element = await page.$(selector);
  assert(element, `Nem található mozgatható elem: ${selector}`);
  await element.evaluate((target) => {
    target.scrollIntoView({ block: 'center', inline: 'center' });
    const viewport = target.closest('[data-plan-document-viewport]');
    if (viewport) {
      const targetRect = target.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      viewport.scrollBy({
        left: targetRect.left + targetRect.width / 2 - (viewportRect.left + viewportRect.width / 2),
        top: targetRect.top + targetRect.height / 2 - (viewportRect.top + viewportRect.height / 2),
      });
    }
  });
  await sleep(250);
  const box = await element.boundingBox();
  assert(box && box.width > 2 && box.height > 2, `Érvénytelen mozgatható elemméret: ${JSON.stringify(box)}`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
  await page.mouse.up();
  await sleep(500);
}
async function setControlledInput(page, selector, value) {
  const input = await page.$(selector);
  assert(input, `Nem található mező: ${selector}`);
  await input.click({ clickCount: 3 });
  await input.press('Backspace');
  await input.type(String(value));
  await input.press('Tab');
  await sleep(200);
}
async function dispatchInputValue(page, selector, value) {
  const changed = await page.$eval(selector, (element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(element, String(nextValue));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }, value);
  assert(changed, `Nem módosítható mező: ${selector}`);
  await sleep(300);
}

const planProfiles = [
  { name: 'kuruc-utca', rooms: [['GARAZS', 35.13], ['SZOBA', 9.99], ['VENDEGSZOBA', 8.93], ['NAPPALI', 21.06], ['KONYHA', 9.88], ['FURDOSZOBA', 8.92]] },
  { name: 'esze-tamas-utca', rooms: [['GARAZS', 49.87], ['KAZANHAZ', 19.95], ['SZOBA', 12.40], ['NAPPALI', 26.10], ['KONYHA', 14.06], ['FURDOSZOBA', 8.28]] },
  { name: 'petri-pal-utca', rooms: [['GARAZS', 40.40], ['HAZTARTASI', 10.80], ['DOLGOZO', 6.50], ['SZOBA', 13.60], ['KONYHA', 17.50], ['ETKEZO NAPPALI', 40.35]] },
  { name: 'compact-lshape', rooms: [['ELOSZOBA', 6.20], ['NAPPALI', 28.40], ['SZOBA 1', 11.30], ['SZOBA 2', 12.10], ['FURDO', 5.70], ['KAMRA', 2.80]] },
  { name: 'courtyard-house', rooms: [['NAPPALI', 33.20], ['ETKEZO', 14.10], ['KONYHA', 12.70], ['HALO', 15.40], ['GYEREK', 13.20], ['GARDRÓB', 6.10]] },
  { name: 'narrow-house', rooms: [['NAPPALI', 22.80], ['KONYHA', 8.90], ['SZOBA', 10.20], ['FURDO', 4.90], ['KOZLEKEDO', 7.60], ['TAROLO', 3.20]] },
  { name: 'wide-house', rooms: [['NAPPALI', 30.10], ['KONYHA', 13.50], ['SZOBA 1', 12.60], ['SZOBA 2', 12.60], ['FURDO', 7.40], ['MOSOKONYHA', 6.20]] },
  { name: 'split-wing', rooms: [['NAPPALI', 27.80], ['ETKEZO', 12.30], ['KONYHA', 10.90], ['HALO', 14.20], ['DOLGOZO', 9.80], ['FURDO', 6.30]] },
  { name: 'garage-wing', rooms: [['GARAZS', 38.20], ['GEPESZET', 8.40], ['NAPPALI', 25.60], ['KONYHA', 11.10], ['SZOBA', 13.40], ['FURDO', 6.80]] },
];

async function createVectorFixture(profile, index, pageCount = 1) {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const landscape = (index + pageIndex) % 2 === 0;
    const width = landscape ? 1120 : 820;
    const height = landscape ? 790 : 1040;
    const page = pdf.addPage([width, height]);
    page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderWidth: 1.5, borderColor: rgb(0.15, 0.2, 0.28) });
    page.drawText(`E-1.${index + 1} FOLDSZINTI ALAPRAJZ`, { x: 42, y: height - 54, size: 16, font: bold, color: rgb(0.06, 0.12, 0.2) });
    page.drawText(`M=1:100  TERVVERZIO V-${String(index + 1).padStart(2, '0')}  OLDAL ${pageIndex + 1}`, { x: 42, y: height - 76, size: 9, font: normal });
    const marginX = 80 + pageIndex * 8;
    const marginY = 115;
    const gridWidth = width - marginX * 2;
    const gridHeight = height - marginY - 110;
    const columns = 3;
    const rows = 2;
    const cellWidth = gridWidth / columns;
    const cellHeight = gridHeight / rows;
    profile.rooms.forEach(([name, baseArea], roomIndex) => {
      const column = roomIndex % columns;
      const row = Math.floor(roomIndex / columns);
      const inset = 8 + ((roomIndex + index + pageIndex) % 4) * 3;
      const x = marginX + column * cellWidth + inset;
      const y = marginY + (rows - 1 - row) * cellHeight + inset;
      const roomWidth = cellWidth - inset * 2;
      const roomHeight = cellHeight - inset * 2;
      page.drawRectangle({ x, y, width: roomWidth, height: roomHeight, borderWidth: 2.3, borderColor: rgb(0.12, 0.22, 0.42) });
      page.drawLine({ start: { x: x + roomWidth / 2, y }, end: { x: x + roomWidth / 2, y: y + 12 }, thickness: 1.2, color: rgb(0.12, 0.22, 0.42) });
      if (roomIndex === 0 || roomIndex === 3) {
        const openingWidth = Math.min(58, roomWidth * 0.22);
        const openingX = x + roomWidth * (roomIndex === 0 ? 0.36 : 0.58);
        page.drawRectangle({ x: openingX, y: y - 4, width: openingWidth, height: 8, borderWidth: 1.4, borderColor: rgb(0.02, 0.55, 0.62) });
        page.drawText(roomIndex === 0 ? 'ABLAK' : 'AJTO', { x: openingX, y: y + 8, size: 6, font: normal, color: rgb(0.02, 0.45, 0.52) });
      }
      const area = Number(baseArea) + pageIndex * 0.1;
      page.drawText(String(name).replace(/[ŐŰőű]/g, 'O'), { x: x + 14, y: y + roomHeight / 2 + 13, size: 11, font: bold, color: rgb(0.04, 0.1, 0.18) });
      page.drawText(roomIndex % 2 === 0 ? 'keramia' : 'lam.park.', { x: x + 14, y: y + roomHeight / 2, size: 7, font: normal, color: rgb(0.35, 0.4, 0.45) });
      const localizedArea = area.toFixed(2).replace('.', ',');
      if (roomIndex === 0) {
        page.drawText(`${localizedArea} m`, { x: x + 14, y: y + roomHeight / 2 - 13, size: 9, font: normal, color: rgb(0.18, 0.25, 0.35) });
        page.drawText('2', { x: x + 55, y: y + roomHeight / 2 - 8, size: 6, font: normal, color: rgb(0.18, 0.25, 0.35) });
      } else {
        const areaText = roomIndex % 3 === 1 ? `${localizedArea}m²` : roomIndex % 3 === 2 ? `${area.toFixed(2)} m2` : `${localizedArea} m²`;
        page.drawText(areaText, { x: x + 14, y: y + roomHeight / 2 - 13, size: 9, font: normal, color: rgb(0.18, 0.25, 0.35) });
      }
    });
    page.drawLine({ start: { x: marginX, y: marginY - 26 }, end: { x: marginX + gridWidth, y: marginY - 26 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`${(gridWidth / 50).toFixed(2)} m`, { x: marginX + gridWidth / 2 - 16, y: marginY - 43, size: 8, font: normal });
    page.drawText('ESZAK', { x: width - 120, y: height - 80, size: 10, font: bold });
    page.drawLine({ start: { x: width - 92, y: height - 105 }, end: { x: width - 92, y: height - 60 }, thickness: 3, color: rgb(0.05, 0.05, 0.05) });
    ['LAPMERET: A1', 'vb. koszoru szele', 'hoszigeteles', 'keramia', 'lam.park.', '1,86 m'].forEach((label, labelIndex) => {
      page.drawText(label, { x: width - 250, y: 72 + labelIndex * 12, size: 7, font: normal, color: rgb(0.35, 0.35, 0.35) });
    });
  }
  const target = path.join(fixtureDir, `${profile.name}.pdf`);
  fs.writeFileSync(target, await pdf.save());
  return target;
}

async function createRasterFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([1000, 700]);
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlQnH0AAAAASUVORK5CYII=', 'base64');
  const image = await pdf.embedPng(pngBytes);
  page.drawImage(image, { x: 0, y: 0, width: 1000, height: 700 });
  const target = path.join(fixtureDir, 'raster-scan-reference.pdf');
  fs.writeFileSync(target, await pdf.save());
  return target;
}

async function createProjectAndPlanSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V0843 PDF tervlap regresszió');
  await page.type('input[placeholder="Projektkód"]', 'V0843-PDF');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V0843 PDF tervlap regresszió');
  await clickText(page, 'Új felmérés');
  await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const nameInput = await page.$('[role="dialog"][aria-label="Új felmérés"] input');
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('V0843 tervdokumentáció alapú energetikai felmérés');
  await clickText(page, 'Tervdokumentáció alapú felmérés', '[role="dialog"] button');
  await clickText(page, 'PDF tervdokumentáció', '[role="dialog"] button');
  await clickText(page, 'Felmérés létrehozása', '[role="dialog"] button');
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
}

let browser;
(async () => {
  const vectorFixtures = [];
  for (let index = 0; index < planProfiles.length; index += 1) vectorFixtures.push(await createVectorFixture(planProfiles[index], index, index === 0 ? 3 : 1));
  const rasterFixture = await createRasterFixture();
  assert(vectorFixtures.length + 1 === 10, 'Nem készült el a 10 referenciaalaprajz.');
  pass('Tíz eltérő referencia-PDF készült: kilenc vektoros, egy raszteres, köztük háromoldalas dokumentum');

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP dimpro.hu 127.0.0.1'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await viewport(page, 1920, 1080);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek');
  await createProjectAndPlanSurvey(page);
  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    const survey = workspace.surveys?.find((item) => item.id === workspace.activeSurveyId);
    if (!survey?.draft) throw new Error('Az aktív tesztfelmérés nem található.');
    const now = new Date().toISOString();
    survey.draft.assemblies = [{
      id: 'assembly-v08442-wall', category: 'wall', name: 'V08442 teszt külső fal',
      heatFlowDirection: 'horizontal', boundaryMode: 'externalAir', calculationMode: 'declared', complexity: 'homogeneous',
      requirementType: 'externalWall', surfaceResistanceMode: 'ruleSetDefault', declaredUValueWm2K: '0.24',
      declaredUValueSource: 'E2E teszt rétegrend', corrections: {
        policy: 'applyAll', airVoid: { level: 'none' }, mechanicalFastener: {
          enabled: false, fastenerLambdaWmK: 50, fastenerCountPerSquareMeter: 0, fastenerCrossSectionSquareMeters: 0,
          insulationThicknessMeters: 0, penetrationLengthMeters: 0, embedded: false, passesAirLayer: false, pointFastener: true,
        }, invertedRoofDeltaUWm2K: 0, invertedRoofSource: '',
      }, layers: [{ id: 'layer-v08442-wall', kind: 'solid', material: 'E2E teszt fal', thicknessCm: 38, lambdaWmK: '0.16', note: '' }],
      note: 'PDF → energetikai modell E2E teszt', createdAt: now, updatedAt: now,
    }];
    survey.draft.updatedAt = now;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-plan-document-workspace]', { timeout: 30000 });
  assert(await page.$('[data-survey-step="planDocument"]'), 'A PDF tervlap lépés nem jelent meg a tervdokumentációs projektmódban.');
  pass('Az új felmérés indításakor külön választható a tervdokumentáció alapú projektmód');

  let upload = await page.$('[data-plan-document-upload]');
  assert(upload, 'A PDF feltöltőmező hiányzik a Rajz nézetből.');
  await upload.uploadFile(vectorFixtures[0]);
  await page.waitForSelector('[data-plan-document-stage]', { timeout: 30000 });
  await waitText(page, path.basename(vectorFixtures[0]));
  pass('A többoldalas PDF feltöltése és a közös PDF.js tervlapnézőben való megjelenítése működik');

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-document-data-panel]');
  const pageOptions = await page.$$eval('[data-plan-page-select] option', (options) => options.map((option) => option.textContent || ''));
  assert(pageOptions.length === 3, `A háromoldalas PDF oldalválasztója hibás: ${JSON.stringify(pageOptions)}`);
  await page.select('[data-plan-type-select]', 'floorPlan');
  await page.select('[data-plan-version-select]', 'construction');
  pass('A többoldalas oldalválasztó, tervtípus, tervverzió és szintkapcsolat elérhető');

  await page.click('[data-plan-document-view-mode="plan"]');
  await page.waitForSelector('[data-plan-document-stage]');
  await clickText(page, 'Kivágás', '[data-plan-document-canvas] button');
  await dragInElement(page, '[data-plan-document-stage]', { x: 0.08, y: 0.1 }, { x: 0.92, y: 0.88 });
  await page.click('[data-plan-document-view-mode="data"]');
  await sleep(900);
  const cropState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    return document?.pages?.find((item) => item.id === plan.activePageId)?.crop;
  });
  assert(cropState && cropState.width > 0.65 && cropState.width < 0.96 && cropState.height > 0.65 && cropState.height <= 0.92, `A tervrész kivágása nem mentődött: ${JSON.stringify(cropState)}`);
  pass('Az egy oldalon belüli tervrész kézzel kivágható és normalizált koordinátával mentődik');
  await clickText(page, 'Teljes oldal / alaphelyzet', '[data-plan-document-data-panel] button');
  await sleep(500);

  await page.click('[data-plan-document-view-mode="plan"]');
  await clickText(page, 'Lépték', '[data-plan-document-canvas] button');
  await sleep(350);
  await dragInElement(page, '[data-plan-document-stage]', { x: 0.18, y: 0.72 }, { x: 0.70, y: 0.72 });
  await sleep(400);
  await page.click('[data-plan-document-view-mode="data"]');
  await setControlledInput(page, '[data-plan-calibration-distance="primary"]', 10);
  await sleep(900);
  await clickText(page, 'Ellenőrző pontok', '[data-plan-calibration-panel] button');
  await sleep(350);
  await page.click('[data-plan-document-view-mode="plan"]');
  await sleep(350);
  await dragInElement(page, '[data-plan-document-stage]', { x: 0.22, y: 0.80 }, { x: 0.74, y: 0.80 });
  await page.click('[data-plan-document-view-mode="data"]');
  await sleep(900);
  const verificationDistance = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const calibration = document?.pages?.find((item) => item.id === plan.activePageId)?.calibration;
    return calibration?.primary?.pixelsPerMeter > 0 ? calibration.verification.pixelDistance / calibration.primary.pixelsPerMeter : 0;
  });
  assert(verificationDistance > 1, `Az ellenőrző kalibrációs szakasz hossza hibás: ${verificationDistance}`);
  await setControlledInput(page, '[data-plan-calibration-distance="verification"]', verificationDistance.toFixed(4));
  await sleep(1200);
  const calibrationState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    return document?.pages?.find((item) => item.id === plan.activePageId)?.calibration;
  });
  assert(calibrationState?.primary?.pixelsPerMeter > 0, 'Az első kalibráció nem számított képpont/méter arányt.');
  assert(calibrationState?.status === 'acceptable' && calibrationState?.verificationErrorPercent <= 2, `Az ellenőrző kalibráció hibás: ${JSON.stringify(calibrationState)}`);
  pass('A kétpontos léptékkalibráció, második ellenőrző méret, eltérés és százalékos hiba működik');

  await page.click('[data-plan-recognize]');
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-suggestion]').length >= 4, { timeout: 30000 });
  const firstRecognition = await page.$eval('[data-plan-recognition-message]', (element) => element.textContent || '');
  assert(firstRecognition.includes('helyiségjavaslat'), `Nem készült helyiségjavaslat: ${firstRecognition}`);
  await sleep(900);
  const recognitionState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return {
      contentKind: activePage?.contentKind,
      lineSegmentCount: activePage?.lineSegmentCount,
      closedContourCount: activePage?.closedContourCount,
      stitchedContourCount: activePage?.stitchedContourCount,
      parallelWallPairCount: activePage?.parallelWallPairCount,
      closedVectorSuggestions: activePage?.suggestions?.filter((item) => item.geometryMethod === 'closedVectorContour').length || 0,
      labeledAreaSuggestions: activePage?.suggestions?.filter((item) => Number(item.labeledAreaSquareMeters) > 0).length || 0,
      suggestionNames: activePage?.suggestions?.map((item) => item.name) || [],
    };
  });
  assert(recognitionState.contentKind === 'vector' || recognitionState.contentKind === 'mixed', `A vektoros PDF típusfelismerése hibás: ${JSON.stringify(recognitionState)}`);
  assert(recognitionState.lineSegmentCount >= 20 && recognitionState.closedContourCount >= 6, `A vektorvonal- és zártkontúr-felismerés hiányos: ${JSON.stringify(recognitionState)}`);
  assert(recognitionState.parallelWallPairCount > 0, `A párhuzamos falvonalak keresése nem adott eredményt: ${JSON.stringify(recognitionState)}`);
  assert(recognitionState.closedVectorSuggestions >= 4, `A helyiségfeliratok nem párosultak zárt vektorkontúrral: ${JSON.stringify(recognitionState)}`);
  assert(recognitionState.labeledAreaSuggestions >= 5, `A magyar tizedesvesszős m² területfeliratok nem párosultak helyiségekhez: ${JSON.stringify(recognitionState)}`);
  assert(recognitionState.suggestionNames.length <= 8, `Túl sok, valószínűleg műszaki feliratból származó javaslat készült: ${JSON.stringify(recognitionState.suggestionNames)}`);
  assert(!recognitionState.suggestionNames.some((name) => /^Helyiség \d+$/i.test(name)), `A felismerhető helyiségnevek helyett általános név készült: ${JSON.stringify(recognitionState.suggestionNames)}`);
  assert(!recognitionState.suggestionNames.some((name) => /LAPMÉRET|LÉPTÉK|HŐSZIGETELÉS|KERÁMIA|ÉSZAK|ALAPRAJZ|\d+[.,]\d+\s*m$/i.test(name)), `Műszaki felirat helyiségként jelent meg: ${JSON.stringify(recognitionState.suggestionNames)}`);
  pass('A PDF vektoros/vegyes típusfelismerése, vonalszakasz-, zártkontúr- és párhuzamos falvonal-elemzése működik, a műszaki feliratok kiszűrődnek');

  await page.click('[data-plan-document-view-mode="split"]');
  await page.waitForSelector('[data-plan-document-stage]');
  const hiddenLabelCount = await page.$$eval('[data-plan-suggestion-label]', (items) => items.length);
  assert(hiddenLabelCount === 0, `Alapállapotban nem szabad minden helyiségfeliratnak megjelennie: ${hiddenLabelCount}`);

  await page.click('[data-plan-manual-room-cta]');
  await page.waitForSelector('[data-plan-manual-room-instruction]');
  await clickPointsInElement(page, '[data-plan-document-stage]', [
    { x: 0.045, y: 0.82 }, { x: 0.105, y: 0.82 }, { x: 0.105, y: 0.89 }, { x: 0.045, y: 0.89 },
  ]);
  await clickText(page, 'Poligon lezárása', '[data-plan-document-canvas] button');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.some((item) => item.source === 'manualDrawing');
  });
  const manualSuggestionId = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.find((item) => item.source === 'manualDrawing')?.id || '';
  });
  assert(manualSuggestionId, 'A hiányzó helyiség kézi poligonja nem jött létre.');
  await page.waitForSelector(`[data-plan-suggestion-callout="${manualSuggestionId}"]`);
  const beforeManualMove = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { firstPoint: suggestion?.polygon?.[0], labelPosition: suggestion?.labelPosition || null };
  }, manualSuggestionId);
  await dragElementByPixels(page, `[data-plan-suggestion-label="${manualSuggestionId}"]`, 48, -24);
  await dragElementByPixels(page, `[data-plan-suggestion-move-handle="${manualSuggestionId}"]`, 36, 18);
  // A PropertySurveyPage 550 ms-os mentési késleltetést használ; a húzás után várjuk meg a perzisztálást is.
  await sleep(900);
  const afterManualMove = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { firstPoint: suggestion?.polygon?.[0], labelPosition: suggestion?.labelPosition || null, source: suggestion?.source };
  }, manualSuggestionId);
  assert(afterManualMove.labelPosition && !beforeManualMove.labelPosition, `A felirat külön mozgatása nem mentődött: ${JSON.stringify(afterManualMove)}`);
  assert(Math.abs(afterManualMove.firstPoint.x - beforeManualMove.firstPoint.x) > 0.002 || Math.abs(afterManualMove.firstPoint.y - beforeManualMove.firstPoint.y) > 0.002, `A helyiségkontúr húzása nem mozgatta a geometriát: ${JSON.stringify({ beforeManualMove, afterManualMove })}`);
  assert(afterManualMove.source === 'userCorrected', `A kézi mozgatás adatforrása hibás: ${afterManualMove.source}`);
  pass('A nem felismert helyiség kézzel körberajzolható, a kis helyiség felirata calloutként jelenik meg, a kontúr és a felirat külön mozgatható');

  const vertexBefore = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { point: suggestion?.polygon?.[0], count: suggestion?.polygon?.length || 0, area: suggestion?.calculatedAreaSquareMeters || 0 };
  }, manualSuggestionId);
  await page.click('[data-plan-vertex-tool]');
  await page.waitForSelector(`[data-plan-room-vertex^="${manualSuggestionId}:"]`);
  await dragElementByPixels(page, `[data-plan-room-vertex="${manualSuggestionId}:0"]`, 28, -16);
  await sleep(900);
  const vertexAfterMove = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { point: suggestion?.polygon?.[0], count: suggestion?.polygon?.length || 0, area: suggestion?.calculatedAreaSquareMeters || 0, source: suggestion?.source };
  }, manualSuggestionId);
  assert(Math.abs(vertexAfterMove.point.x - vertexBefore.point.x) > 0.002 || Math.abs(vertexAfterMove.point.y - vertexBefore.point.y) > 0.002, `Az egyedi poligonpont nem mozdult: ${JSON.stringify({ vertexBefore, vertexAfterMove })}`);
  assert(vertexAfterMove.area > 0 && vertexAfterMove.source === 'userCorrected', `A poligonpont javítása után hibás a terület vagy adatforrás: ${JSON.stringify(vertexAfterMove)}`);
  await page.click(`[data-plan-room-edge-midpoint^="${manualSuggestionId}:"]`);
  await sleep(800);
  const vertexCountAfterInsert = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.find((item) => item.id === suggestionId)?.polygon?.length || 0;
  }, manualSuggestionId);
  assert(vertexCountAfterInsert === vertexBefore.count + 1, `Az új töréspont beszúrása hibás: ${vertexCountAfterInsert}`);
  await page.click('[data-plan-delete-vertex]');
  await sleep(800);
  const vertexCountAfterDelete = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.suggestions?.find((item) => item.id === suggestionId)?.polygon?.length || 0;
  }, manualSuggestionId);
  assert(vertexCountAfterDelete === vertexBefore.count, `A kijelölt töréspont törlése hibás: ${vertexCountAfterDelete}`);
  pass('A helyiség poligonpontjai egyenként mozgathatók, új pont beszúrható és a kijelölt pont törölhető; a terület újraszámolódik');

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector(`[data-plan-suggestion="${manualSuggestionId}"] > button`);
  await page.click(`[data-plan-suggestion="${manualSuggestionId}"] > button`);
  await page.waitForSelector('[data-plan-split-room]');
  const splitStateBefore = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    const xs = suggestion?.polygon?.map((point) => point.x) || [];
    const ys = suggestion?.polygon?.map((point) => point.y) || [];
    return {
      count: activePage?.suggestions?.length || 0,
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }, manualSuggestionId);
  await page.click('[data-plan-split-room]');
  await page.waitForSelector('[data-plan-split-room-instruction]');
  const splitX = (splitStateBefore.minX + splitStateBefore.maxX) / 2;
  await clickPointsInElement(page, '[data-plan-document-stage]', [
    { x: splitX, y: Math.max(0.001, splitStateBefore.minY - 0.03) },
    { x: splitX, y: Math.min(0.999, splitStateBefore.maxY + 0.03) },
  ]);
  await page.waitForFunction((expectedCount) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return (activePage?.suggestions?.length || 0) === expectedCount;
  }, { timeout: 30000 }, splitStateBefore.count + 1);
  const splitState = await page.evaluate((originalId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const first = activePage?.suggestions?.find((item) => item.id === originalId);
    const second = activePage?.suggestions?.find((item) => item.id !== originalId && item.sourceDetails?.includes('Felhasználói helyiség-kettévágás'));
    return { first, second, wallStatus: activePage?.wallRecognitionStatus };
  }, manualSuggestionId);
  assert(splitState.first?.name.endsWith(' A') && splitState.second?.name.endsWith(' B') && splitState.first.calculatedAreaSquareMeters > 0 && splitState.second.calculatedAreaSquareMeters > 0, `A helyiség kettévágása hibás: ${JSON.stringify(splitState)}`);
  assert(splitState.wallStatus === 'idle', `A kettévágás után a külső falakat újra kell felismerni: ${splitState.wallStatus}`);

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-merge-target]');
  await page.select('[data-plan-merge-target]', splitState.second.id);
  await page.click('[data-plan-merge-room]');
  await page.waitForFunction((expectedCount) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return (activePage?.suggestions?.length || 0) === expectedCount;
  }, { timeout: 30000 }, splitStateBefore.count);
  const mergedRoomState = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const suggestion = activePage?.suggestions?.find((item) => item.id === suggestionId);
    return { suggestion, message: document.querySelector?.('[data-plan-geometry-message]')?.textContent || '' };
  }, manualSuggestionId);
  assert(mergedRoomState.suggestion?.source === 'userCorrected' && mergedRoomState.suggestion?.polygon?.length >= 4 && !mergedRoomState.suggestion?.name.endsWith(' A'), `A helyiségek összevonása hibás: ${JSON.stringify(mergedRoomState)}`);
  pass('A kijelölt helyiség vágóvonallal kettéosztható, majd a közös falszakaszú részek veszteség nélkül újra összevonhatók');

  await page.waitForSelector('[data-plan-recognize-walls]');
  await page.waitForSelector('[data-plan-recognize-walls]');
  await page.click('[data-plan-recognize-walls]');
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-wall-card]').length >= 4, { timeout: 30000 });
  await sleep(900);
  const wallRecognition = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return { count: activePage?.wallSuggestions?.length || 0, status: activePage?.wallRecognitionStatus, message: activePage?.wallRecognitionMessage || '' };
  });
  assert(wallRecognition.count >= 4 && wallRecognition.status === 'ready' && wallRecognition.message.includes('külső'), `A külső határolás felismerése hibás: ${JSON.stringify(wallRecognition)}`);
  const firstWallCard = await page.$('[data-plan-wall-card]');
  const firstWallId = await firstWallCard.evaluate((element) => element.getAttribute('data-plan-wall-card') || '');
  await firstWallCard.click();
  await page.select('[data-plan-wall-boundary-type]', 'unheatedSpace');
  const primaryZoneValue = await page.$eval('[data-plan-wall-zone]', (select) => [...select.options].map((option) => option.value).find(Boolean) || '');
  const primaryAssemblyValue = await page.$eval('[data-plan-wall-assembly]', (select) => [...select.options].map((option) => option.value).find(Boolean) || '');
  assert(primaryZoneValue && primaryAssemblyValue, `A tesztfalhoz nem érhető el energetikai zóna vagy rétegrend: ${JSON.stringify({ primaryZoneValue, primaryAssemblyValue })}`);
  await page.select('[data-plan-wall-zone]', primaryZoneValue);
  await page.select('[data-plan-wall-assembly]', primaryAssemblyValue);
  await page.click('[data-plan-wall-approve]');
  await sleep(800);
  await page.click('[data-plan-wall-place-end]');
  await page.waitForSelector('[data-plan-wall-endpoint-placement-instruction]');
  await page.waitForSelector(`[data-plan-wall-endpoint="${firstWallId}:end"]`);
  const wallBeforeMove = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.id === wallId);
    return { end: wall?.end, length: wall?.lengthMeters, boundaryType: wall?.boundaryType, status: wall?.status };
  }, firstWallId);
  await clickPointsInElement(page, '[data-plan-document-stage]', [{
    x: Math.min(0.95, wallBeforeMove.end.x + 0.045),
    y: Math.min(0.95, wallBeforeMove.end.y + 0.025),
  }]);
  await sleep(900);
  const wallAfterMove = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.id === wallId);
    return { end: wall?.end, length: wall?.lengthMeters, boundaryType: wall?.boundaryType, status: wall?.status, source: wall?.source };
  }, firstWallId);
  assert(Math.abs(wallAfterMove.end.x - wallBeforeMove.end.x) > 0.002 || Math.abs(wallAfterMove.end.y - wallBeforeMove.end.y) > 0.002, `A falszakasz végpontja nem mozdult: ${JSON.stringify({ wallBeforeMove, wallAfterMove })}`);
  assert(wallAfterMove.length > 0 && wallAfterMove.boundaryType === 'unheatedSpace' && wallAfterMove.status === 'approved' && wallAfterMove.source === 'userCorrected', `A falszakasz kézi javítása vagy jóváhagyása hibás: ${JSON.stringify(wallAfterMove)}`);
  pass('A külső falszakaszok automatikusan létrejönnek, besorolhatók, jóváhagyhatók és végpontonként kézzel javíthatók');

  await page.click('[data-plan-manual-wall-tool]');
  await page.waitForSelector('[data-plan-manual-wall-instruction]');
  await clickPointsInElement(page, '[data-plan-document-stage]', [{ x: 0.72, y: 0.74 }, { x: 0.82, y: 0.74 }]);
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    return activePage?.wallSuggestions?.some((wall) => wall.source === 'manualDrawing');
  }, { timeout: 30000 });
  const manualWallState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePage = document?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePage?.wallSuggestions?.find((item) => item.source === 'manualDrawing');
    return { exists: Boolean(wall), boundaryType: wall?.boundaryType, length: wall?.lengthMeters };
  });
  assert(manualWallState.exists && manualWallState.boundaryType === 'unknown' && manualWallState.length > 0, `A kézi falszakasz felvétele hibás: ${JSON.stringify(manualWallState)}`);
  pass('A hiányzó külső falszakasz két kattintással kézzel felvehető és ellenőrzendő besorolással mentődik');

  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-recognize-openings]');
  await page.click('[data-plan-recognize-openings]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    return activePageModel?.openingRecognitionStatus === 'ready';
  }, { timeout: 30000 });
  await sleep(900);
  const openingRecognition = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    return {
      count: activePageModel?.openingSuggestions?.length || 0,
      autoCount: activePageModel?.openingSuggestions?.filter((opening) => opening.source === 'vectorPdfRecognition').length || 0,
      status: activePageModel?.openingRecognitionStatus,
      message: activePageModel?.openingRecognitionMessage || '',
    };
  });
  assert(openingRecognition.autoCount >= 1 && openingRecognition.status === 'ready', `A vektoros nyílászáró-javaslat felismerése hibás: ${JSON.stringify(openingRecognition)}`);
  await page.waitForSelector('[data-plan-opening-card]');
  await page.click('[data-plan-document-view-mode="split"]');
  await page.waitForSelector('[data-plan-opening-suggestion]');
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-opening-card]');
  pass('A falak közelében lévő vektoros nyílászáró-geometriák automatikus, jóváhagyandó javaslatként megjelennek');

  const firstOpeningCard = await page.$('[data-plan-opening-card]');
  const firstOpeningId = await firstOpeningCard.evaluate((element) => element.getAttribute('data-plan-opening-card') || '');
  assert(firstOpeningId, 'Az első nyílászáró-javaslat azonosítója hiányzik.');
  await page.click(`[data-plan-opening-card="${firstOpeningId}"] > button`);
  await page.waitForSelector('[data-plan-opening-width]');
  const openingBeforeEdit = await page.evaluate((openingId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    const opening = activePageModel?.openingSuggestions?.find((item) => item.id === openingId);
    const wall = activePageModel?.wallSuggestions?.find((item) => item.id === opening?.wallSuggestionId);
    return { opening, wall };
  }, firstOpeningId);
  await dispatchInputValue(page, '[data-plan-opening-width]', '1.50');
  await dispatchInputValue(page, '[data-plan-opening-height]', '1.20');
  await page.select('[data-plan-opening-catalog]', 'pvc-triple-template');
  await sleep(500);
  await setControlledInput(page, '[data-plan-opening-frame]', 'Műanyag tesztkeret');
  await setControlledInput(page, '[data-plan-opening-uvalue]', '1,10');
  await setControlledInput(page, '[data-plan-opening-shading]', 'Külső redőny');
  await page.click('[data-plan-opening-approve]');
  await sleep(1100);
  const openingAfterEdit = await page.evaluate((openingId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    const opening = activePageModel?.openingSuggestions?.find((item) => item.id === openingId);
    const wall = activePageModel?.wallSuggestions?.find((item) => item.id === opening?.wallSuggestionId);
    return { opening, wall };
  }, firstOpeningId);
  assert(openingAfterEdit.opening?.status === 'approved' && Math.abs(openingAfterEdit.opening.areaSquareMeters - 1.8) < 0.01, `A nyílászáró méret- vagy jóváhagyási szerkesztése hibás: ${JSON.stringify(openingAfterEdit)}`);
  assert(openingAfterEdit.opening?.frame === 'Műanyag tesztkeret' && openingAfterEdit.opening?.uValueWm2K === '1,10', `A nyílászáró energetikai adatai nem mentődtek: ${JSON.stringify(openingAfterEdit.opening)}`);
  assert(openingAfterEdit.opening?.catalogProfileId === 'pvc-triple-template' && openingAfterEdit.opening?.sourceReference && openingAfterEdit.opening?.solarGValue === '0.50' && openingAfterEdit.opening?.shading === 'Külső redőny' && openingAfterEdit.opening?.thermalBridgeMode === 'installationPerimeter', `A katalógus-, g-, árnyékolás- vagy hőhídadat nem mentődött: ${JSON.stringify(openingAfterEdit.opening)}`);
  assert(openingAfterEdit.wall?.grossAreaSquareMeters > 0 && openingAfterEdit.wall?.openingAreaSquareMeters >= 1.79 && Math.abs(openingAfterEdit.wall.netAreaSquareMeters - (openingAfterEdit.wall.grossAreaSquareMeters - openingAfterEdit.wall.openingAreaSquareMeters)) < 0.001, `A bruttó/nyílászáró/nettó falfelület hibás: ${JSON.stringify(openingAfterEdit.wall)}`);
  pass('A nyílászáró típusa, mérete, energetikai adatai és jóváhagyása szerkeszthető; a nettó falfelület automatikusan újraszámolódik');

  const relatedWallId = openingAfterEdit.opening.wallSuggestionId;
  await page.click(`[data-plan-wall-card="${relatedWallId}"] > button`);
  await page.waitForSelector('[data-plan-wall-zone]');
  const firstZoneValue = await page.$eval('[data-plan-wall-zone]', (select) => [...select.options].map((option) => option.value).find(Boolean) || '');
  if (firstZoneValue) await page.select('[data-plan-wall-zone]', firstZoneValue);
  const firstAssemblyValue = await page.$eval('[data-plan-wall-assembly]', (select) => [...select.options].map((option) => option.value).find(Boolean) || '');
  if (firstAssemblyValue) await page.select('[data-plan-wall-assembly]', firstAssemblyValue);
  const relatedWallStatus = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    return documentModel?.pages?.find((item) => item.id === plan.activePageId)?.wallSuggestions?.find((wall) => wall.id === wallId)?.status || '';
  }, relatedWallId);
  if (relatedWallStatus !== 'approved') await page.click('[data-plan-wall-approve]');
  const openingCountBeforeManual = await page.$$eval('[data-plan-opening-card]', (items) => items.length);
  await page.click('[data-plan-add-manual-opening]');
  await page.waitForFunction((expected) => document.querySelectorAll('[data-plan-opening-card]').length === expected, { timeout: 30000 }, openingCountBeforeManual + 1);
  await sleep(900);
  const relationState = await page.evaluate((wallId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    const wall = activePageModel?.wallSuggestions?.find((item) => item.id === wallId);
    const manualOpening = activePageModel?.openingSuggestions?.find((opening) => opening.wallSuggestionId === wallId && opening.source === 'manualDrawing');
    return { wall, manualOpening };
  }, relatedWallId);
  assert(relationState.manualOpening?.wallSuggestionId === relatedWallId && relationState.manualOpening?.source === 'manualDrawing', `A kézi nyílászáró falhoz kapcsolása hibás: ${JSON.stringify(relationState)}`);
  if (firstZoneValue) assert(relationState.wall?.zoneId === firstZoneValue, `A falszakasz energetikai zónakapcsolata nem mentődött: ${JSON.stringify(relationState.wall)}`);
  if (firstAssemblyValue) assert(relationState.wall?.assemblyId === firstAssemblyValue, `A falszakasz rétegrendkapcsolata nem mentődött: ${JSON.stringify(relationState.wall)}`);
  pass('A falszakasz rétegrendhez és energetikai zónához kapcsolható, és kézi nyílászáró rendelhető hozzá');

  await page.click('[data-plan-document-view-mode="split"]');
  await page.waitForSelector('[data-plan-suggestion]');
  const firstSuggestion = await page.$('[data-plan-suggestion]');
  const firstSuggestionId = await firstSuggestion.evaluate((element) => element.getAttribute('data-plan-suggestion') || '');
  assert(firstSuggestionId, 'Az első helyiségjavaslat azonosítója hiányzik.');
  const firstSuggestionButtonSelector = `[data-plan-suggestion="${firstSuggestionId}"] > button`;
  const zoomBeforeSingleClick = await page.$eval('[data-plan-document-stage]', (element) => Number(element.getAttribute('data-plan-view-zoom') || 0));
  await page.click(firstSuggestionButtonSelector);
  await sleep(400);
  const singleClickState = await page.evaluate(() => ({
    zoom: Number(document.querySelector('[data-plan-document-stage]')?.getAttribute('data-plan-view-zoom') || 0),
    labels: document.querySelectorAll('[data-plan-suggestion-label]').length,
    badge: document.querySelector('[data-plan-active-suggestion-badge]')?.textContent || '',
  }));
  assert(singleClickState.zoom === zoomBeforeSingleClick && singleClickState.labels === 1 && singleClickState.badge.includes('Kijelölt helyiség'), `Az egyszeres kattintásnak csak ki kell jelölnie a helyiséget: ${JSON.stringify(singleClickState)}`);
  await page.click(firstSuggestionButtonSelector, { clickCount: 2, delay: 70 });
  await page.waitForFunction((previous) => Number(document.querySelector('[data-plan-document-stage]')?.getAttribute('data-plan-view-zoom') || 0) > previous, {}, zoomBeforeSingleClick);
  const focusedView = await page.evaluate(() => ({
    zoom: Number(document.querySelector('[data-plan-document-stage]')?.getAttribute('data-plan-view-zoom') || 0),
    labels: document.querySelectorAll('[data-plan-suggestion-label]').length,
    labelScale: Number(document.querySelector('[data-plan-suggestion-label]')?.getAttribute('data-plan-label-scale') || 0),
    badge: document.querySelector('[data-plan-active-suggestion-badge]')?.textContent || '',
  }));
  assert(focusedView.zoom >= 125 && focusedView.labels === 1 && focusedView.labelScale > 0 && focusedView.labelScale < 1 && focusedView.badge.includes('Kijelölt helyiség'), `A dupla kattintásos rajzi fókusz hibás: ${JSON.stringify(focusedView)}`);
  const focusedOverlay = await page.$('[data-plan-overlay-suggestion][data-plan-suggestion-zoomed="true"]');
  assert(focusedOverlay, 'A fókuszált helyiség rajzi eleme nem található.');
  await focusedOverlay.click({ clickCount: 2, delay: 70 });
  await page.waitForFunction((expected) => Number(document.querySelector('[data-plan-document-stage]')?.getAttribute('data-plan-view-zoom') || 0) === expected, {}, zoomBeforeSingleClick);
  const restoredZoom = await page.$eval('[data-plan-document-stage]', (element) => Number(element.getAttribute('data-plan-view-zoom') || 0));
  assert(restoredZoom === zoomBeforeSingleClick, `A második dupla kattintás nem állította vissza a nézetet: ${restoredZoom}`);
  const beforeZoom = restoredZoom;
  await page.click('[data-plan-zoom-in]');
  await page.waitForFunction((previous) => Number(document.querySelector('[data-plan-document-stage]')?.getAttribute('data-plan-view-zoom') || 0) > previous, {}, beforeZoom);
  await page.click('[data-plan-label-toggle]');
  const allLabelCount = await page.$$eval('[data-plan-suggestion-label]', (items) => items.length);
  assert(allLabelCount >= 4, `A minden felirat kapcsoló nem működik: ${allLabelCount}`);
  await page.click('[data-plan-label-toggle]');
  pass('Az egyszeres kattintás csak kijelöl, a dupla kattintás nagyít és ugyanarra a helyiségre újra dupla kattintva visszaáll; a felirat mérete zoomfüggetlen marad');
  await page.waitForSelector('[data-plan-suggestion] [data-plan-suggestion-approve]');
  await page.click('[data-plan-suggestion] [data-plan-suggestion-approve]');
  await sleep(1200);
  const approvedWallRoomSuggestionIds = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === plan.activePageId);
    return [...new Set((activePageModel?.wallSuggestions || []).filter((wall) => wall.status === 'approved').flatMap((wall) => wall.connectedRoomSuggestionIds || []))];
  });
  for (const suggestionId of approvedWallRoomSuggestionIds) {
    const relatedStatus = await page.evaluate((id) => {
      const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
      const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
      const plan = draft?.planDocumentWorkspace;
      const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
      return documentModel?.pages?.find((item) => item.id === plan.activePageId)?.suggestions?.find((item) => item.id === id)?.status || '';
    }, suggestionId);
    if (relatedStatus !== 'approved') {
      await page.click(`[data-plan-suggestion="${suggestionId}"] > button`);
      await page.waitForSelector(`[data-plan-suggestion="${suggestionId}"] [data-plan-suggestion-approve]`);
      await page.click(`[data-plan-suggestion="${suggestionId}"] [data-plan-suggestion-approve]`);
      await sleep(900);
    }
  }
  const relatedRoomSuggestionId = approvedWallRoomSuggestionIds[0] || firstSuggestionId;
  const approvedSuggestionState = await page.evaluate((suggestionId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const suggestion = documentModel?.pages?.find((item) => item.id === plan.activePageId)?.suggestions?.find((item) => item.id === suggestionId);
    const room = draft?.rooms?.find((item) => item.planSuggestionId === suggestionId);
    return { status: suggestion?.status || '', roomId: room?.id || '' };
  }, relatedRoomSuggestionId || firstSuggestionId);
  assert(approvedSuggestionState.status === 'approved' && approvedSuggestionState.roomId, `A kapcsolt javaslat jóváhagyása vagy központi helyiségkapcsolata hiányzik: ${JSON.stringify(approvedSuggestionState)}`);
  await page.click('[data-survey-step="plan"]');
  await page.waitForSelector('[data-survey-room-id]', { timeout: 30000 });
  const polygonRoomCount = await page.$$eval('[data-survey-room-id] polygon', (elements) => elements.length);
  assert(polygonRoomCount >= 1, 'A jóváhagyott javaslat nem alakult DIMPRO poligongeometriává.');
  pass('A javaslat elfogadása után szerkeszthető, poligonalapú DIMPRO helyiségmodell készül');

  await sleep(900);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="plan"]', { timeout: 30000 });
  await page.click('[data-survey-step="plan"]');
  await page.waitForSelector('[data-survey-room-id]', { timeout: 30000 });
  const persistedRoom = await page.$eval('[data-survey-room-id]', (element) => ({ id: element.getAttribute('data-survey-room-id'), x: element.getAttribute('data-room-x'), y: element.getAttribute('data-room-y') }));
  assert(persistedRoom.id && persistedRoom.x && persistedRoom.y, `A jóváhagyott geometria újranyitás után hiányzik: ${JSON.stringify(persistedRoom)}`);
  pass('A projekt mentése és újranyitása megőrzi a PDF-ből jóváhagyott geometriát');

  await page.click('[data-survey-step="planDocument"]');
  await page.waitForSelector('[data-plan-document-workspace]');
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-energy-transfer-panel]');
  const transferReady = await page.$eval('[data-plan-transfer-energy-model]', (button) => !button.disabled);
  if (!transferReady) {
    const issues = await page.$$eval('[data-plan-transfer-issue]', (items) => items.map((item) => ({ code: item.getAttribute('data-plan-transfer-issue'), text: item.textContent || '' })));
    throw new Error(`Az energetikai átadás nem kész: ${JSON.stringify(issues)}`);
  }
  await page.click('[data-plan-transfer-energy-model]');
  await page.waitForFunction(() => (document.querySelector('[data-plan-energy-transfer-message]')?.textContent || '').includes('Energetikai modell frissítve'), { timeout: 30000 });
  await sleep(1200);
  const firstTransferState = await page.evaluate((pageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const walls = (draft?.wallSegments || []).filter((wall) => wall.planPageId === pageId && wall.dataSource === 'planTransfer');
    const openings = (draft?.wallOpenings || []).filter((opening) => opening.planPageId === pageId && opening.dataSource === 'planTransfer');
    const details = openings.map((opening) => draft?.energyOpeningWorkspace?.openingDetails?.[opening.id]);
    return { wallCount: walls.length, openingCount: openings.length, walls, openings, details };
  }, openingAfterEdit.opening.pageId);
  assert(firstTransferState.wallCount >= 1 && firstTransferState.openingCount >= 1, `A PDF elemek nem kerültek a központi modellbe: ${JSON.stringify(firstTransferState)}`);
  assert(firstTransferState.walls.some((wall) => wall.planWallSuggestionId === relatedWallId && wall.measuredLengthMeters > 0 && wall.heightMeters > 0), `A mért falgeometria nem került át: ${JSON.stringify(firstTransferState.walls)}`);
  assert(firstTransferState.openings.some((opening) => opening.planOpeningSuggestionId === firstOpeningId && opening.catalogProfileId === 'pvc-triple-template' && opening.shading === 'Külső redőny'), `A katalógusos nyílászáró nem került át: ${JSON.stringify(firstTransferState.openings)}`);
  assert(firstTransferState.details.some((detail) => detail?.declaredUwWm2K === 1.1 && detail?.solarGValue === 0.5 && detail?.installationPsiWmK === 0.04), `Az Uw/g/Ψ energetikai részlet hibás: ${JSON.stringify(firstTransferState.details)}`);
  pass('A jóváhagyott PDF fal és katalógusos nyílászáró Uw-, g-, árnyékolás- és hőhídadatai átkerülnek az energetikai modellbe');

  await page.click('[data-plan-transfer-energy-model]');
  await sleep(1200);
  const repeatedTransferState = await page.evaluate((pageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return {
      wallIds: (draft?.wallSegments || []).filter((wall) => wall.planPageId === pageId && wall.dataSource === 'planTransfer').map((wall) => wall.id),
      openingIds: (draft?.wallOpenings || []).filter((opening) => opening.planPageId === pageId && opening.dataSource === 'planTransfer').map((opening) => opening.id),
    };
  }, openingAfterEdit.opening.pageId);
  assert(repeatedTransferState.wallIds.length === new Set(repeatedTransferState.wallIds).size && repeatedTransferState.openingIds.length === new Set(repeatedTransferState.openingIds).size, `Az ismételt átadás duplikált elemet hozott létre: ${JSON.stringify(repeatedTransferState)}`);
  assert(repeatedTransferState.wallIds.length === firstTransferState.wallCount && repeatedTransferState.openingIds.length === firstTransferState.openingCount, `Az ismételt átadás elemszáma megváltozott: ${JSON.stringify({ firstTransferState, repeatedTransferState })}`);
  pass('Az ismételt PDF → energetikai modell frissítés idempotens, nem készít duplikált falat vagy nyílászárót');

  await page.waitForSelector('[data-plan-transfer-registry]');
  await page.waitForFunction((pageId) => document.querySelector(`[data-plan-transfer-page-status="${pageId}"]`)?.getAttribute('data-plan-transfer-state') === 'synced', { timeout: 30000 }, openingAfterEdit.opening.pageId);
  const registryAfterTransfer = await page.evaluate((pageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const registry = draft?.planDocumentWorkspace?.transferRegistry;
    return {
      version: registry?.version,
      record: registry?.records?.[pageId],
      auditCount: (registry?.auditLog || []).filter((entry) => entry.pageId === pageId).length,
      visiblePageCount: document.querySelectorAll('[data-plan-transfer-page-status]').length,
    };
  }, openingAfterEdit.opening.pageId);
  assert(registryAfterTransfer.version === '1' && registryAfterTransfer.record?.state === 'synced' && registryAfterTransfer.auditCount >= 2 && registryAfterTransfer.visiblePageCount >= 3, `A több tervlapos átadási nyilvántartás hibás: ${JSON.stringify(registryAfterTransfer)}`);
  pass('Az átadás tervlap-szintű forrás- és modell-lenyomattal, auditnaplóval és többoldalas nyilvántartási sorral mentődik');

  await page.evaluate((pageId) => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const wall = draft?.wallSegments?.find((item) => item.planPageId === pageId && item.dataSource === 'planTransfer');
    if (!wall) throw new Error('A kézi modellmódosításhoz nem található átadott fal.');
    wall.measuredLengthMeters = Number(wall.measuredLengthMeters || 0) + 0.25;
    wall.planTransferLocked = true;
    wall.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(workspace));
  }, openingAfterEdit.opening.pageId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="planDocument"]', { timeout: 30000 });
  await page.click('[data-survey-step="planDocument"]');
  await page.waitForSelector('[data-plan-document-workspace]');
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-active-transfer-state="modelChanged"]', { timeout: 30000 });
  const protectedModelState = await page.evaluate(() => ({
    transferDisabled: document.querySelector('[data-plan-transfer-energy-model]')?.disabled,
    conflictVisible: Boolean(document.querySelector('[data-plan-transfer-conflict-panel]')),
    issueCodes: [...document.querySelectorAll('[data-plan-transfer-issue]')].map((item) => item.getAttribute('data-plan-transfer-issue')),
  }));
  assert(protectedModelState.transferDisabled && protectedModelState.conflictVisible && protectedModelState.issueCodes.includes('PLAN_TRANSFER_MODEL_CHANGED'), `A központi kézi módosítás konfliktusvédelme hibás: ${JSON.stringify(protectedModelState)}`);
  pass('A központi modell kézi módosítása automatikusan zárolódik, változásjelzést kap és blokkolja a csendes tervfelülírást');

  await page.click('[data-plan-transfer-accept-model]');
  await page.waitForSelector('[data-plan-active-transfer-state="synced"]', { timeout: 30000 });
  await page.waitForSelector('[data-plan-transfer-audit-entry="modelAccepted"]');
  await sleep(1300);
  const acceptedModelState = await page.evaluate((pageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const record = draft?.planDocumentWorkspace?.transferRegistry?.records?.[pageId];
    const wall = draft?.wallSegments?.find((item) => item.planPageId === pageId && item.dataSource === 'planTransfer');
    return { action: record?.lastAction, locked: wall?.planTransferLocked, length: wall?.measuredLengthMeters };
  }, openingAfterEdit.opening.pageId);
  assert(acceptedModelState.action === 'modelAccepted' && acceptedModelState.locked === true && acceptedModelState.length > firstTransferState.walls[0].measuredLengthMeters, `A központi módosítás megtartása hibás: ${JSON.stringify(acceptedModelState)}`);
  pass('A központi kézi módosítás külön művelettel megtartható új összehasonlítási alapként, a módosított központi érték elvesztése nélkül');

  await page.evaluate((pageId) => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const plan = draft?.planDocumentWorkspace;
    const documentModel = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
    const activePageModel = documentModel?.pages?.find((item) => item.id === pageId);
    const sourceWall = activePageModel?.wallSuggestions?.find((item) => item.status === 'approved');
    const centralWall = draft?.wallSegments?.find((item) => item.planPageId === pageId && item.dataSource === 'planTransfer');
    if (!sourceWall || !centralWall) throw new Error('A kétoldali konfliktus tesztadatának fala hiányzik.');
    sourceWall.heightMeters = 3.15;
    sourceWall.updatedAt = new Date().toISOString();
    centralWall.thicknessCm = Number(centralWall.thicknessCm || 0) + 3;
    centralWall.planTransferLocked = true;
    centralWall.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(workspace));
  }, openingAfterEdit.opening.pageId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="planDocument"]', { timeout: 30000 });
  await page.click('[data-survey-step="planDocument"]');
  await page.waitForSelector('[data-plan-document-workspace]');
  await page.click('[data-plan-document-view-mode="data"]');
  await page.waitForSelector('[data-plan-active-transfer-state="conflict"]', { timeout: 30000 });
  await page.click('[data-plan-transfer-overwrite-confirm]');
  const overwriteEnabled = await page.$eval('[data-plan-transfer-overwrite]', (button) => !button.disabled);
  assert(overwriteEnabled, 'A külön megerősített tervfelülírás gombja nem vált aktívvá.');
  await page.click('[data-plan-transfer-overwrite]');
  await page.waitForSelector('[data-plan-active-transfer-state="synced"]', { timeout: 30000 });
  await page.waitForSelector('[data-plan-transfer-audit-entry="forcedOverwrite"]');
  await sleep(1000);
  const overwrittenState = await page.evaluate((pageId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const wall = draft?.wallSegments?.find((item) => item.planPageId === pageId && item.dataSource === 'planTransfer');
    const record = draft?.planDocumentWorkspace?.transferRegistry?.records?.[pageId];
    return { height: wall?.heightMeters, locked: wall?.planTransferLocked, action: record?.lastAction };
  }, openingAfterEdit.opening.pageId);
  assert(overwrittenState.height === 3.15 && overwrittenState.locked === false && overwrittenState.action === 'forcedOverwrite', `A kétoldali konfliktus megerősített felülírása hibás: ${JSON.stringify(overwrittenState)}`);
  pass('Kétoldali konfliktusnál a terv csak külön jelölőnégyzettel írhatja felül a központi modellt, majd az állapot és az audit újra szinkronba kerül');

  await page.click('[data-plan-transfer-remove-toggle]');
  await page.waitForSelector('[data-plan-transfer-removal-panel]');
  await page.click('[data-plan-transfer-remove-confirm]');
  const removalEnabled = await page.$eval('[data-plan-transfer-remove]', (button) => !button.disabled);
  assert(removalEnabled, 'A megerősített eltávolítás gombja nem vált aktívvá.');
  await page.click('[data-plan-transfer-remove]');
  await page.waitForSelector('[data-plan-active-transfer-state="removed"]', { timeout: 30000 });
  await page.waitForSelector('[data-plan-transfer-audit-entry="removed"]');
  await sleep(1200);
  const removedTransferState = await page.evaluate((pageId, approvedRoomId) => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const record = draft?.planDocumentWorkspace?.transferRegistry?.records?.[pageId];
    return {
      centralWalls: (draft?.wallSegments || []).filter((wall) => wall.planPageId === pageId && wall.dataSource === 'planTransfer').length,
      centralOpenings: (draft?.wallOpenings || []).filter((opening) => opening.planPageId === pageId && opening.dataSource === 'planTransfer').length,
      centralBridges: (draft?.energyOpeningWorkspace?.thermalBridges || []).filter((bridge) => bridge.planPageId === pageId).length,
      automaticWalls: (draft?.wallSegments || []).filter((wall) => wall.roomId === approvedRoomId && wall.isAutoGenerated !== false).length,
      state: record?.state,
      action: record?.lastAction,
    };
  }, openingAfterEdit.opening.pageId, approvedSuggestionState.roomId);
  assert(removedTransferState.centralWalls === 0 && removedTransferState.centralOpenings === 0 && removedTransferState.centralBridges === 0 && removedTransferState.automaticWalls > 0 && removedTransferState.state === 'removed' && removedTransferState.action === 'removed', `A tervlap átadásának biztonságos eltávolítása hibás: ${JSON.stringify(removedTransferState)}`);
  pass('A tervlap átadása csak külön megerősítéssel távolítható el; a kapcsolt elemek együtt törlődnek, az automatikus falmodell helyreáll és az esemény auditálódik');

  await page.waitForSelector('[data-plan-document-workspace]');
  await page.click('[data-plan-document-view-mode="data"]');
  for (let index = 1; index < vectorFixtures.length; index += 1) {
    upload = await page.$('[data-plan-document-data-panel] [data-plan-document-upload]');
    await upload.uploadFile(vectorFixtures[index]);
    await page.waitForFunction((expected) => document.querySelector('[data-plan-document-select]')?.options.length >= expected, {}, index + 1);
    await page.click('[data-plan-recognize]');
    await page.waitForFunction(() => document.querySelectorAll('[data-plan-suggestion]').length >= 4, { timeout: 30000 });
    const kind = await page.evaluate(() => {
      const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
      const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
      const plan = draft?.planDocumentWorkspace;
      const document = plan?.documents?.find((item) => item.id === plan.activeDocumentId);
      return document?.pages?.find((item) => item.id === plan.activePageId)?.contentKind;
    });
    assert(kind === 'vector' || kind === 'mixed', `A(z) ${path.basename(vectorFixtures[index])} nem vektoros/vegyes besorolást kapott: ${kind}`);
  }
  upload = await page.$('[data-plan-document-data-panel] [data-plan-document-upload]');
  await upload.uploadFile(rasterFixture);
  await page.waitForFunction(() => document.querySelector('[data-plan-document-select]')?.options.length >= 10, { timeout: 30000 });
  await page.click('[data-plan-recognize]');
  await page.waitForFunction(() => (document.querySelector('[data-plan-recognition-message]')?.textContent || '').includes('Raszteres PDF felismerve'), { timeout: 30000 });
  await sleep(900);
  const referenceSummary = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    const documents = draft?.planDocumentWorkspace?.documents || [];
    return { count: documents.length, kinds: documents.map((document) => document.pages[0]?.contentKind) };
  });
  assert(referenceSummary.count === 10, `Nem mind a tíz referenciaalaprajz került be: ${JSON.stringify(referenceSummary)}`);
  assert(referenceSummary.kinds.filter((kind) => kind === 'vector' || kind === 'mixed').length >= 9 && referenceSummary.kinds.includes('raster'), `A 10 referencia típuseloszlása hibás: ${JSON.stringify(referenceSummary)}`);
  pass('A tíz referenciaalaprajz felismerési regressziója sikeres, a raszteres PDF-et a rendszer külön kezeli OCR nélkül');

  const screenshots = [];
  await viewport(page, 1920, 1080);
  await page.click('[data-plan-document-view-mode="split"]');
  await page.waitForSelector('[data-plan-document-split]');
  screenshots.push(await screenshot(page, 'candidate_1920x1080_split'));
  const desktopTargets = await page.$$eval('button, input, select', (elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight;
  }).map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, text: (element.textContent || element.getAttribute('aria-label') || '').trim() })).filter((item) => item.text.includes('Rajz') || item.text.includes('Adatok') || item.text.includes('Osztott')));
  assert(desktopTargets.length >= 3 && desktopTargets.every((item) => item.height >= 36), `A nézetváltók levágottak: ${JSON.stringify(desktopTargets)}`);

  await viewport(page, 1366, 768);
  screenshots.push(await screenshot(page, 'candidate_1366x768_split'));
  await viewport(page, 1194, 834);
  screenshots.push(await screenshot(page, 'candidate_1194x834_split'));
  await viewport(page, 834, 1194);
  await waitText(page, 'Tablet álló nézetben');
  assert(await page.$('[data-plan-document-canvas]'), 'Álló tableten az osztott mód nem váltott Rajz nézetre.');
  screenshots.push(await screenshot(page, 'candidate_834x1194_portrait'));
  assert(screenshots.every((file) => fs.existsSync(file) && fs.statSync(file).size > 10000), `Hiányos candidate screenshotok: ${JSON.stringify(screenshots)}`);
  pass('A 1920×1080, 1366×768, 1194×834 és 834×1194 candidate screenshot-regresszió elkészült, teljes oldali overflow nélkül');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key) || '{}');
    for (const survey of workspace.surveys || []) delete survey.draft.planDocumentWorkspace;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-room-id]', { timeout: 30000 });
  await sleep(900);
  const migratedWorkspace = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const draft = workspace.surveys?.find((survey) => survey.id === workspace.activeSurveyId)?.draft;
    return draft?.planDocumentWorkspace?.schema;
  });
  assert(migratedWorkspace === 'dimpro.property-survey.plan-document.v1', `A régi projekt migrációja hibás: ${migratedWorkspace}`);
  pass('A tervdokumentációs mező nélküli régi projekt automatikusan, adatvesztés nélkül migrálódik');

  assert(pageErrors.length === 0, `Böngészőoldali hibák: ${JSON.stringify(pageErrors)}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('favicon') && !message.includes('404'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${JSON.stringify(relevantConsoleErrors)}`);
  pass('A teljes PDF tervlap E2E folyamat böngészőkonzol- és oldalhiba nélkül futott');

  console.log(`DIMPRO Felmérő v0.8.4.4.3 PDF tervlap E2E: ${testCount}/${testCount} sikeres`);
  for (const [index, test] of tests.entries()) console.log(`${index + 1}. ${test}`);
  console.log(`Screenshotok: ${screenshots.join(', ')}`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
