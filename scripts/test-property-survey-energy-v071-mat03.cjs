const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3019/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_energy_v071_mat03_downloads';
fs.rmSync(downloadDir, { recursive: true, force: true });
fs.mkdirSync(downloadDir, { recursive: true });

function assert(condition, message) { if (!condition) throw new Error(message); }
async function clickText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const target = [...document.querySelectorAll(selector)].find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
    if (!target) return false;
    target.click(); return true;
  }, { text, selector });
  assert(clicked, `Nem található kattintható elem: ${text}`);
}
async function clickExact(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const target = [...document.querySelectorAll(selector)].find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim() === text);
    if (!target) return false;
    target.click(); return true;
  }, { text, selector });
  assert(clicked, `Nem található pontos kattintható elem: ${text}`);
}
async function waitText(page, text, timeout = 20000) { await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text); }
async function waitDownload(extension, previous = [], timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const file = fs.readdirSync(downloadDir).find((name) => name.endsWith(extension) && !name.endsWith('.crdownload') && !previous.includes(name));
    if (file) return path.join(downloadDir, file);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nem készült el a letöltés: ${extension}`);
}
async function setNativeValue(page, selector, value) {
  await page.evaluate(({ selector, value }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Hiányzó mező: ${selector}`);
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });
}
async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V071 MAT03 energetikai teszt');
  await page.type('input[placeholder="Projektkód"]', 'V071-MAT03');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Geometria Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V071 MAT03 energetikai teszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('V071 energetikai mintafelmérés');
  await (await dialog.$('select')).select('Energetikai felmérés');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await page.waitForSelector('[data-survey-step="energy"]', { timeout: 20000 });
}
async function responsiveCheck(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: width <= 834 ? 2 : 1, isMobile: width <= 834, hasTouch: width <= 834 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const values = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(values.body <= values.viewport + 2 && values.html <= values.viewport + 2, `Vízszintes overflow ${width} px: ${JSON.stringify(values)}`);
  return values;
}

let browser;
(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP dimpro.hu 127.0.0.1'] });
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  const consoleErrors = []; const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek', 30000);
  await createProjectAndSurvey(page);

  const uiTests = []; const pass = (name) => uiTests.push(name);

  await page.click('[data-survey-step="energy"]');
  await page.waitForSelector('[data-energy-workspace="true"]');
  assert(await page.$('[data-energy-tab="geometry"]'), 'A Geometria fül hiányzik.');
  assert(await page.$('[data-energy-tab="audit"]'), 'A Nyomvonal fül hiányzik.');
  pass('Négyfüles energetikai munkatér megnyílik');

  await page.click('[data-energy-tab="geometry"]');
  await page.waitForSelector('[data-energy-geometry-panel="true"]');
  const geometryState = await page.evaluate(() => ({
    valid: document.querySelector('[data-energy-geometry-panel]')?.getAttribute('data-energy-geometry-valid'),
    envelope: document.querySelector('[data-energy-metric="thermal-envelope"]')?.textContent,
    volume: document.querySelector('[data-energy-metric="conditioned-volume"]')?.textContent,
    av: document.querySelector('[data-energy-metric="av-ratio"]')?.textContent,
    levels: document.querySelectorAll('[data-energy-level-row]').length,
    walls: document.querySelectorAll('[data-energy-wall-row]').length,
    orientations: document.querySelectorAll('[data-energy-orientation]').length,
  }));
  assert(geometryState.valid === 'true', `A mintafelmérés geometriája hibás: ${JSON.stringify(geometryState)}`);
  assert(geometryState.envelope?.includes('m²') && geometryState.volume?.includes('m³') && geometryState.av?.includes('1/m'), 'A geometriai főmutatók hiányosak.');
  assert(geometryState.levels >= 1 && geometryState.walls >= 1 && geometryState.orientations >= 1, 'A geometriai tételes listák hiányoznak.');
  pass('Lehűlő felület, térfogat, A/V, szint-, fal- és tájolási lista működik');

  await page.click('[data-energy-tab="audit"]');
  await page.waitForSelector('[data-energy-audit-panel="true"]');
  const traceState = await page.evaluate(() => ({ count: document.querySelectorAll('[data-energy-trace-rule]').length, rules: [...document.querySelectorAll('[data-energy-trace-rule]')].map((element) => element.getAttribute('data-energy-trace-rule')) }));
  assert(traceState.count >= 8, `Túl kevés auditált sor: ${traceState.count}`);
  assert(traceState.rules.includes('GEOM-AV-RATIO-008') && traceState.rules.includes('GEOM-WALL-GROSS-001'), 'A kötelező auditképletek hiányoznak.');
  pass('Számítási nyomvonal képletekkel és szabályazonosítókkal működik');

  await page.click('[data-energy-tab="status"]');
  await page.waitForSelector('[data-energy-compliance-panel="true"]');
  assert((await page.$eval('[data-energy-geometry-status]', (element) => element.textContent)).includes('Rendben'), 'A geometriai státusz nem megfelelő.');
  assert((await page.$eval('[data-energy-geometry-engine-card]', (element) => element.textContent)).includes('Geometriamotor 0.7.1'), 'A geometriamotor verziója hiányzik.');
  pass('Állapotlap geometriaverziót és eredményt mutat');

  await page.click('[data-energy-tab="settings"]');
  await page.select('[data-energy-field="calculationPurpose"]', 'significantRenovation');
  await page.select('[data-energy-field="requirementLevel"]', 'significantRenovation');
  await page.select('[data-energy-field="certificationSubject"]', 'independentUnit');
  await page.select('[data-energy-field="buildingSymbol"]', 'rowHouseEnd');
  await setNativeValue(page, '[data-energy-field="permitOrNotificationDate"]', '2024-05-16');
  await setNativeValue(page, '[data-energy-field="constructionYear"]', '1998');
  await setNativeValue(page, '[data-energy-field="significantRenovationYear"]', '2026');
  await page.select('[data-energy-field="calculationMethod"]', 'mixed');
  const wholeBuilding = await page.$('[data-energy-field="wholeBuildingDataAvailable"]');
  if (await wholeBuilding.evaluate((element) => element.checked)) await wholeBuilding.click();
  pass('Energetikai projektbeállítások továbbra is szerkeszthetők');

  await page.click('[data-survey-step="structures"]');
  await clickExact(page, 'Rétegrendek');
  await clickExact(page, 'Fal');
  const layer = await page.waitForSelector('[data-assembly-layer]');
  const layerId = await layer.evaluate((element) => element.getAttribute('data-assembly-layer'));
  assert(layerId, 'A rétegazonosító hiányzik.');
  await page.click(`[data-open-material-picker="${layerId}"]`);
  await page.waitForSelector('[data-material-catalog-dialog="true"]');
  assert(await page.$('[data-material-search]'), 'Az anyagkereső hiányzik.');
  assert(await page.$('[data-material-detail-panel]'), 'Az anyagrészlet panel hiányzik.');
  const catalogResponsive = [];
  for (const [width, height] of [[1194,834],[834,1194],[390,844]]) {
    await page.setViewport({ width, height });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[data-material-catalog-dialog]');
      const rect = dialog?.getBoundingClientRect();
      return { viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth, dialogLeft: rect?.left, dialogRight: rect?.right, dialogWidth: rect?.width };
    });
    assert(state.body <= state.viewport + 2 && state.html <= state.viewport + 2, `Anyagkatalógus overflow ${width}px: ${JSON.stringify(state)}`);
    assert(state.dialogLeft >= -1 && state.dialogRight <= state.viewport + 1, `Anyagkatalógus kilóg ${width}px nézetben: ${JSON.stringify(state)}`);
    catalogResponsive.push(state);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  pass('Hárompaneles anyagkatalógus desktop, tablet és mobil nézetben megnyílik');

  await page.type('[data-material-search]', 'pórusbeton');
  await page.waitForSelector('[data-material-result="material-demo-aerated-concrete"]');
  await page.click('[data-material-result="material-demo-aerated-concrete"]');
  await page.click('[data-toggle-material-favorite]');
  await page.click('[data-select-material]');
  await page.waitForSelector(`[data-layer-material-snapshot="material-demo-aerated-concrete-v1"]`);
  const selectedLayer = await page.evaluate((id) => ({
    lambda: document.querySelector(`[data-layer-lambda="${id}"]`)?.value,
    thickness: document.querySelector(`[data-layer-thickness="${id}"]`)?.value,
    snapshot: document.querySelector('[data-layer-material-snapshot]')?.textContent,
  }), layerId);
  assert(selectedLayer.lambda === '0.13', `Hibás katalógus λ: ${selectedLayer.lambda}`);
  assert(selectedLayer.snapshot?.includes('unverified'), 'Az ellenőrzöttségi állapot hiányzik a rétegből.');
  pass('Keresés, kedvenc és verziózott anyagkiválasztás működik');

  await setNativeValue(page, `[data-layer-lambda="${layerId}"]`, '0.15');
  await page.waitForSelector(`[data-lambda-override-reason="${layerId}"][aria-invalid="true"]`);
  await setNativeValue(page, `[data-lambda-override-reason="${layerId}"]`, 'Helyszíni nedvességi állapot miatt alkalmazott tervezői korrekció.');
  await page.waitForFunction((id) => document.querySelector(`[data-lambda-override-reason="${id}"]`)?.getAttribute('aria-invalid') === 'false', {}, layerId);
  pass('λ-felülírás indoklásköteles és javítható');

  await page.click(`[data-open-material-picker="${layerId}"]`);
  await page.waitForSelector('[data-material-catalog-dialog="true"]');
  await page.click('[data-create-custom-material]');
  await page.waitForSelector('[role="dialog"][aria-label="Saját anyag létrehozása"]');
  await page.type('[data-custom-material-name]', 'Saját projekt hőszigetelés');
  await page.select('[data-custom-material-category]', 'eps');
  await page.type('[data-custom-material-lambda]', '0,028');
  await page.click('[data-save-custom-material]');
  await page.waitForFunction(() => document.querySelector('[data-material-detail-panel]')?.textContent.includes('Saját projekt hőszigetelés'));
  await page.click('[data-select-material]');
  await page.waitForFunction(() => document.querySelector('[data-layer-material-snapshot]')?.textContent.includes('material-project-'));
  pass('Saját projektanyag létrehozása és réteghez választása működik');

  await new Promise((resolve) => setTimeout(resolve, 900));
  const stored = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    const layer = survey.draft.assemblies[0].layers[0];
    return {
      projectId: survey.projectId,
      materialProjectId: survey.draft.materialWorkspace.projectCatalog.projectId,
      projectMaterialCount: survey.draft.materialWorkspace.projectMaterials.length,
      favoriteIds: survey.draft.materialWorkspace.favoriteIds,
      recentIds: survey.draft.materialWorkspace.recentIds,
      layer,
    };
  });
  assert(stored.materialProjectId === stored.projectId, 'Az anyagkatalógus nem az aktuális projekthez kötődik.');
  assert(stored.projectMaterialCount === 1, `Hibás sajátanyag-darabszám: ${stored.projectMaterialCount}`);
  assert(stored.favoriteIds.includes('material-demo-aerated-concrete'), 'A kedvenc anyag nem mentődött.');
  assert(stored.layer.materialSnapshot?.materialVersionId?.includes('material-project-'), 'A saját anyagverzió pillanatképe nem mentődött a rétegbe.');
  assert(stored.layer.lambdaWmK === '0.028', 'A saját anyag λ-értéke nem került a rétegbe.');
  pass('Projektanyagok, kedvencek, legutóbbi elemek és rétegpillanatkép mentődnek');

  await page.click('[data-survey-step="export"]');
  await waitText(page, 'DIMPRO munkafájl és projektverzió');
  const previousDownloads = fs.readdirSync(downloadDir);
  await clickText(page, 'Mentés .dimpro fájlba');
  const dimproFile = await waitDownload('.dimpro', previousDownloads);
  const dimpro = JSON.parse(fs.readFileSync(dimproFile, 'utf8'));
  assert(dimpro.schema === 'dimpro.property-survey.v0.7.1', `Hibás .dimpro séma: ${dimpro.schema}`);
  assert(dimpro.calculated.energyGeometry.schema === 'dimpro.energy-geometry.v0.7.1', 'A geometriai pillanatkép hiányzik a .dimpro fájlból.');
  assert(dimpro.calculated.energyGeometry.trace.length >= 8, 'A geometriai nyomvonal hiányzik az exportból.');
  assert(dimpro.draft.materialWorkspace.projectMaterials.length === 1, 'A projektanyag hiányzik az exportból.');
  assert(dimpro.draft.assemblies[0].layers[0].materialSnapshot.materialVersionId.includes('material-project-'), 'A réteg anyagverzió-pillanatképe hiányzik az exportból.');
  pass('.dimpro v0.7.1 export tartalmazza a geometriát és az anyagteret');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="structures"]');
  await page.click('[data-survey-step="structures"]');
  await clickExact(page, 'Rétegrendek');
  assert(await page.$('[data-layer-material-snapshot]'), 'Újratöltés után eltűnt az anyagpillanatkép.');
  pass('Újratöltés után is megmarad a projektanyag és a rétegpillanatkép');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key));
    for (const survey of workspace.surveys) { delete survey.draft.energyProjectSettings; delete survey.draft.materialWorkspace; }
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="energy"]');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const migrated = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return { energySchema: survey.draft.energyProjectSettings?.schemaVersion, materialSchema: survey.draft.materialWorkspace?.schemaVersion, materialProjectId: survey.draft.materialWorkspace?.projectCatalog?.projectId, projectId: survey.projectId };
  });
  assert(migrated.energySchema === 1 && migrated.materialSchema === 1 && migrated.materialProjectId === migrated.projectId, `Régi projekt migrációja hibás: ${JSON.stringify(migrated)}`);
  pass('v0.6.x projekt energetikai és anyagtér-migrációja működik');

  const modeSelector = 'select[aria-label="Felmérési munkamód"]';
  await page.select(modeSelector, 'Épület- és csarnokfelmérés');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert(!(await page.$('[data-survey-step="energy"]')), 'Ipari módban nem szabad megjelennie az Energetika lépésnek.');
  await page.select(modeSelector, 'Energetikai felmérés');
  await page.waitForSelector('[data-survey-step="energy"]');
  pass('Energetikai feature flag és munkamód-szűrés működik');

  const responsive = [];
  for (const [width, height] of [[1680,1050],[1194,834],[1024,768],[834,1194],[768,1024],[390,844]]) responsive.push(await responsiveCheck(page,width,height));
  pass('Desktop, tablet, iPad és mobil overflow-regresszió sikeres');

  assert(uiTests.length >= 15, `Kevesebb mint 15 UI-teszt futott: ${uiTests.length}`);
  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);
  console.log(JSON.stringify({ ok:true, uiTestCount:uiTests.length, uiTests, geometryState, traceState, catalogResponsive, stored, dimproFile, dimproSchema:dimpro.schema, geometrySchema:dimpro.calculated.energyGeometry.schema, migrated, responsive, consoleErrors:relevantConsoleErrors, pageErrors }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => undefined); });
