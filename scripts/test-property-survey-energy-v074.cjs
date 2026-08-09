const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3019/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_energy_v074_downloads';
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
async function setDecimalField(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.type(value);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await page.keyboard.press('Tab');
  await new Promise((resolve) => setTimeout(resolve, 140));
}
async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V074 energetikai teszt');
  await page.type('input[placeholder="Projektkód"]', 'V074');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Geometria Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V074 energetikai teszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('V074 energetikai mintafelmérés');
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
  assert(await page.$('[data-energy-tab="zones"]'), 'A Zónák fül hiányzik.');
  assert(await page.$('[data-energy-tab="openings"]'), 'A Nyílászárók fül hiányzik.');
  assert(await page.$('[data-energy-tab="assemblies"]'), 'Az U-érték fül hiányzik.');
  assert(await page.$('[data-energy-tab="audit"]'), 'A Nyomvonal fül hiányzik.');
  pass('Hétfüles energetikai munkatér zóna-, nyílászáró- és U-érték nézettel megnyílik');

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
  assert((await page.$eval('[data-energy-assembly-engine-card]', (element) => element.textContent)).includes('Rétegrend- és U-érték motor 0.7.2'), 'Az U-érték motor státuszkártyája hiányzik.');
  assert((await page.$eval('[data-energy-zone-engine-card]', (element) => element.textContent)).includes('Zónamotor 0.7.3'), 'A zónamotor státuszkártyája hiányzik.');
  assert((await page.$eval('[data-energy-opening-engine-card]', (element) => element.textContent)).includes('Nyílászáró- és hőhídmotor 0.7.4'), 'A nyílászáró- és hőhídmotor státuszkártyája hiányzik.');
  pass('Állapotlap geometria-, zóna-, U-érték- és nyílászárómotor verziót mutat');

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

  await page.click('[data-survey-step="openings"]');
  await clickExact(page, 'Ablak hozzáadása');
  const openingSummary = await page.waitForSelector('[data-opening-energy-summary]');
  const energyOpeningId = await openingSummary.evaluate((element) => element.getAttribute('data-opening-energy-summary'));
  assert(energyOpeningId, 'Az új nyílászáró energetikai azonosítója hiányzik.');
  const initialOpeningSummary = await openingSummary.evaluate((element) => element.textContent);
  assert(initialOpeningSummary.includes('0,900 W/m²K'), `A korábbi U-érték nem migrálódott deklarált Uw-vé: ${initialOpeningSummary}`);
  pass('Új falhoz kötött ablak automatikus deklarált Uw-adatot és terepi eredménykártyát kap');

  await page.click('[data-survey-step="energy"]');
  await page.click('[data-energy-tab="openings"]');
  await page.waitForSelector('[data-energy-openings-panel]');
  assert(await page.$(`[data-energy-opening-card="${energyOpeningId}"]`), 'A nyílászáró energetikai szerkesztőkártyája hiányzik.');
  await page.select(`[data-opening-calculation-mode="${energyOpeningId}"]`, 'detailed');
  await page.select(`[data-opening-requirement-type="${energyOpeningId}"]`, 'woodPvcFacadeGlazed');
  await setDecimalField(page, `[data-opening-frame-width="${energyOpeningId}"]`, '0,08');
  await setDecimalField(page, `[data-opening-ug="${energyOpeningId}"]`, '0,6');
  await setDecimalField(page, `[data-opening-uf="${energyOpeningId}"]`, '1,2');
  await setDecimalField(page, `[data-opening-edge-psi="${energyOpeningId}"]`, '0,04');
  await setNativeValue(page, `[data-opening-edge-source="${energyOpeningId}"]`, 'Spacer-001');
  await setDecimalField(page, `[data-opening-g-value="${energyOpeningId}"]`, '0,5');
  await setDecimalField(page, `[data-opening-installation-psi="${energyOpeningId}"]`, '0,03');
  await setNativeValue(page, `[data-opening-installation-source="${energyOpeningId}"]`, 'Install-001');
  await page.waitForFunction((id) => {
    const card = document.querySelector(`[data-energy-opening-card="${id}"]`);
    return card?.textContent.includes('0,841 W/m²K') && card.querySelector('[data-opening-compliance="compliant"]');
  }, {}, energyOpeningId);
  const detailedOpeningState = await page.evaluate((id) => ({
    text: document.querySelector(`[data-energy-opening-card="${id}"]`)?.textContent,
    compliance: document.querySelector(`[data-energy-opening-card="${id}"] [data-opening-compliance]`)?.getAttribute('data-opening-compliance'),
    valid: document.querySelector('[data-energy-openings-panel]')?.getAttribute('data-energy-openings-valid'),
  }), energyOpeningId);
  assert(detailedOpeningState.valid === 'true' && detailedOpeningState.compliance === 'compliant', `A részletes Uw-számítás hibás: ${JSON.stringify(detailedOpeningState)}`);
  assert(detailedOpeningState.text.includes('0,162 W/K'), 'A beépítési perem eredménye hiányzik.');
  pass('Magyar tizedesvesszős részletes Uw-, g- és beépítési peremszámítás működik');

  await page.click('[data-energy-opening-section="bridges"]');
  await page.click('[data-add-linear-bridge]');
  const firstBridge = await page.waitForSelector('[data-energy-thermal-bridge-card]');
  const linearBridgeId = await firstBridge.evaluate((element) => element.getAttribute('data-energy-thermal-bridge-card'));
  assert(linearBridgeId, 'A lineáris hőhíd azonosítója hiányzik.');
  await setNativeValue(page, `[data-bridge-name="${linearBridgeId}"]`, 'Lábazati csatlakozás');
  await page.select(`[data-bridge-category="${linearBridgeId}"]`, 'plinth');
  await setDecimalField(page, `[data-bridge-length="${linearBridgeId}"]`, '10');
  await setDecimalField(page, `[data-bridge-psi="${linearBridgeId}"]`, '0,08');
  await setNativeValue(page, `[data-bridge-source="${linearBridgeId}"]`, 'TB-001');

  await page.click('[data-add-point-bridge]');
  await page.waitForFunction(() => document.querySelectorAll('[data-energy-thermal-bridge-card]').length === 2);
  const bridgeIds = await page.$$eval('[data-energy-thermal-bridge-card]', (elements) => elements.map((element) => element.getAttribute('data-energy-thermal-bridge-card')));
  const pointBridgeId = bridgeIds.find((id) => id && id !== linearBridgeId);
  assert(pointBridgeId, 'A pontszerű hőhíd azonosítója hiányzik.');
  await setNativeValue(page, `[data-bridge-name="${pointBridgeId}"]`, 'Szerkezeti áttörések');
  await page.select(`[data-bridge-category="${pointBridgeId}"]`, 'structuralPenetration');
  await setDecimalField(page, `[data-bridge-quantity="${pointBridgeId}"]`, '4');
  await setDecimalField(page, `[data-bridge-chi="${pointBridgeId}"]`, '0,05');
  await setNativeValue(page, `[data-bridge-source="${pointBridgeId}"]`, 'TB-002');
  await page.waitForFunction(() => document.querySelector('[data-energy-openings-panel]')?.textContent.includes('2,676 W/K'));
  pass('Dokumentált lineáris Ψ·l és pontszerű χ·n hőhíd számítása működik');

  await page.select(`[data-bridge-category="${linearBridgeId}"]`, 'openingReveal');
  await page.select(`[data-bridge-opening="${linearBridgeId}"]`, energyOpeningId);
  await page.waitForSelector('[data-energy-opening-validation-code="OPENING_INSTALLATION_DOUBLE_COUNT"]');
  pass('A beépítési perem és külön kávahőhíd kettős elszámolása blokkolódik');
  await page.select(`[data-bridge-category="${linearBridgeId}"]`, 'plinth');
  await page.select(`[data-bridge-opening="${linearBridgeId}"]`, '');
  await page.waitForFunction(() => document.querySelector('[data-energy-openings-panel]')?.getAttribute('data-energy-openings-valid') === 'true');

  await page.click('[data-energy-opening-section="trace"]');
  const openingTraceState = await page.evaluate(() => ({
    count: document.querySelectorAll('[data-energy-opening-trace-rule]').length,
    rules: [...document.querySelectorAll('[data-energy-opening-trace-rule]')].map((element) => element.getAttribute('data-energy-opening-trace-rule')),
  }));
  assert(openingTraceState.count >= 7, `A nyílászáró/hőhíd nyomvonal túl rövid: ${openingTraceState.count}`);
  for (const rule of ['OPENING-UW-DETAILED-004','OPENING-INSTALLATION-BRIDGE-005','THERMAL-BRIDGE-LINEAR-007','THERMAL-BRIDGE-POINT-008']) assert(openingTraceState.rules.includes(rule), `Hiányzó nyílászáró/hőhíd szabály: ${rule}`);
  pass('Nyílászáró- és hőhíd-auditnyomvonal képletekkel működik');

  await page.click('[data-survey-step="openings"]');
  const finalOpeningSummary = await page.$eval(`[data-opening-energy-summary="${energyOpeningId}"]`, (element) => element.textContent);
  assert(finalOpeningSummary.includes('0,841 W/m²K') && finalOpeningSummary.includes('0,162 W/K') && finalOpeningSummary.includes('megfelel'), `A terepi nyílászáróeredmény nem frissült: ${finalOpeningSummary}`);
  pass('A normál Nyílászárók munkalap ugyanazt a részletes eredményt mutatja');

  await new Promise((resolve) => setTimeout(resolve, 900));
  const storedOpenings = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.energyOpeningWorkspace;
  });
  assert(storedOpenings.schemaVersion === 1 && storedOpenings.openingDetails[energyOpeningId].calculationMode === 'detailed', 'A részletes nyílászáróadat nem mentődött.');
  assert(storedOpenings.thermalBridges.length === 2, 'A két hőhíd nem mentődött.');
  pass('Nyílászáró-részletadatok és hőhidak projektállapotba mentődnek');

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

  await page.click(`[data-layer-lambda="${layerId}"]`, { clickCount: 3 });
  await page.keyboard.type('0,15');
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.keyboard.press('Tab');
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

  await page.click(`[data-layer-thickness="${layerId}"]`, { clickCount: 3 });
  await page.keyboard.type('20,0');
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.keyboard.press('Tab');
  await clickText(page, 'Réteg hozzáadása');
  const layerIds = await page.$$eval('[data-assembly-layer]', (elements) => elements.map((element) => element.getAttribute('data-assembly-layer')));
  const airLayerId = layerIds.find((id) => id && id !== layerId);
  assert(airLayerId, 'A második rétegazonosító hiányzik.');
  await page.select(`[data-layer-kind="${airLayerId}"]`, 'closedAirGap');
  await page.click(`[data-layer-thickness="${airLayerId}"]`, { clickCount: 3 });
  await page.keyboard.type('2,0');
  await new Promise((resolve) => setTimeout(resolve, 120));
  await page.keyboard.press('Tab');
  pass('Magyar tizedesvesszős szilárd réteg és interpolált zárt légréteg rögzíthető');

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
  assert(stored.layer.kind === 'solid', 'A szilárd rétegtípus nem mentődött.');
  pass('Projektanyagok, kedvencek, legutóbbi elemek és rétegpillanatkép mentődnek');

  await page.click('[data-survey-step="energy"]');
  await page.click('[data-energy-tab="assemblies"]');
  await page.waitForSelector('[data-energy-assemblies-panel="true"]');
  const uState = await page.evaluate(() => ({
    resultText: document.querySelector('[data-energy-active-assembly-result]')?.textContent,
    compliance: document.querySelector('[data-energy-active-compliance]')?.getAttribute('data-energy-active-compliance'),
    layerCount: document.querySelectorAll('[data-energy-layer-result]').length,
    traceCount: document.querySelectorAll('[data-energy-assembly-trace-rule]').length,
  }));
  assert(uState.resultText?.includes('W/m²K'), `Az U-eredmény hiányzik: ${JSON.stringify(uState)}`);
  assert(uState.layerCount === 2, `A rétegenkénti eredmény hibás: ${uState.layerCount}`);
  assert(uState.traceCount >= 5, `Az U-számítási nyomvonal túl rövid: ${uState.traceCount}`);
  pass('U-érték, Rtot, megfelelőség, rétegtábla és képletnyomvonal megjelenik');

  await page.select('[data-insulation-layer]', layerId);
  await setNativeValue(page, '[data-insulation-target]', '0,18');
  await page.click('[data-run-insulation-solver]');
  await page.waitForSelector('[data-insulation-result]');
  const solverState = await page.evaluate(() => ({ status: document.querySelector('[data-insulation-result]')?.getAttribute('data-insulation-result'), text: document.querySelector('[data-insulation-result]')?.textContent }));
  assert(solverState.status === 'valid' && solverState.text?.includes('cm'), `A vastagságkereső hibás: ${JSON.stringify(solverState)}`);
  pass('Iteratív hőszigetelés-vastagság kereső működik');

  await page.click('[data-energy-tab="zones"]');
  await page.waitForSelector('[data-energy-zones-panel]');
  const initialZoneState = await page.evaluate(() => ({
    valid: document.querySelector('[data-energy-zones-panel]')?.getAttribute('data-energy-zones-valid'),
    zones: document.querySelectorAll('[data-energy-zone-card]').length,
    heatedAssignments: document.querySelectorAll('[data-heated-room-assignment]').length,
    text: document.querySelector('[data-energy-zones-panel]')?.textContent,
  }));
  assert(initialZoneState.valid === 'true', `Az automatikus egyzónás beosztás hibás: ${JSON.stringify(initialZoneState)}`);
  assert(initialZoneState.zones === 1 && initialZoneState.heatedAssignments === 6, 'Az alap zóna- vagy helyiségbeosztás hibás.');
  assert(initialZoneState.text?.includes('77,50 m²') && initialZoneState.text.includes('208,35 m³'), 'A zóna terület- vagy térfogatösszesítő hiányzik.');
  pass('Automatikus egyzónás családiház-beosztás és összesítés működik');

  await page.click('[data-add-zone]');
  await page.waitForFunction(() => document.querySelectorAll('[data-energy-zone-card]').length === 2);
  const zoneIds = await page.$$eval('[data-energy-zone-card]', (elements) => elements.map((element) => element.getAttribute('data-energy-zone-card')));
  const secondZoneId = zoneIds[1];
  assert(secondZoneId, 'A második zóna azonosítója hiányzik.');
  const secondName = `[data-zone-name="${secondZoneId}"]`;
  await page.click(secondName, { clickCount: 3 });
  await page.type(secondName, 'Nappali és étkező zóna');
  await page.select(`[data-zone-profile="${secondZoneId}"]`, 'office');
  await page.select(`[data-zone-service="${secondZoneId}"]`, 'cooled');
  await page.select('[data-heated-room-assignment="room-living"] select', secondZoneId);
  await page.waitForFunction((id) => {
    const card = document.querySelector(`[data-energy-zone-card="${id}"]`);
    return card?.textContent.includes('1 helyiség') && card.textContent.includes('28,40 m²');
  }, {}, secondZoneId);
  pass('Második zóna létrehozása, profilja és helyiség-hozzárendelése működik');

  await page.click('[data-energy-zone-section="connections"]');
  await page.waitForSelector('[data-energy-zone-connections]');
  const connectionState = await page.evaluate(() => ({
    zoneToZone: document.querySelectorAll('[data-energy-zone-connection="zoneToZone"]').length,
    zoneToUnheated: document.querySelectorAll('[data-energy-zone-connection="zoneToUnheatedSpace"]').length,
  }));
  assert(connectionState.zoneToZone >= 1, `A zónaközi falszakasz hiányzik: ${JSON.stringify(connectionState)}`);
  assert(connectionState.zoneToUnheated >= 1, `A zóna–fűtetlen tér kapcsolat hiányzik: ${JSON.stringify(connectionState)}`);
  pass('Zónaközi és zóna–fűtetlen tér falszakaszok felismerése működik');

  await page.click('[data-energy-zone-section="unheated"]');
  await page.waitForSelector('[data-energy-unheated-card]');
  const unheatedId = await page.$eval('[data-energy-unheated-card]', (element) => element.getAttribute('data-energy-unheated-card'));
  assert(unheatedId, 'A fűtetlen tér azonosítója hiányzik.');
  await page.select(`[data-unheated-type="${unheatedId}"]`, 'garage');
  await page.select(`[data-unheated-ventilation="${unheatedId}"]`, 'natural');
  await page.select(`[data-unheated-temperature-source="${unheatedId}"]`, 'manual');
  await page.waitForSelector(`[data-unheated-temperature="${unheatedId}"]`);
  await setNativeValue(page, `[data-unheated-temperature="${unheatedId}"]`, '8');
  await page.waitForSelector('[data-energy-zone-validation-code="MANUAL_UNHEATED_TEMPERATURE_REVIEW"]');
  pass('Kapcsolódó fűtetlen tér típusa, szellőzése és kézi hőmérséklete kezelhető');

  await page.click('[data-energy-zone-section="trace"]');
  const zoneTraceState = await page.evaluate(() => ({ count: document.querySelectorAll('[data-energy-zone-trace-rule]').length, rules: [...document.querySelectorAll('[data-energy-zone-trace-rule]')].map((element) => element.getAttribute('data-energy-zone-trace-rule')) }));
  assert(zoneTraceState.count >= 8, `A többzónás auditnyomvonal túl rövid: ${zoneTraceState.count}`);
  for (const rule of ['ZONE-FLOOR-AREA-001','ZONE-VOLUME-002','ZONE-EXTERNAL-WALL-003','ZONE-UNHEATED-BOUNDARY-004']) assert(zoneTraceState.rules.includes(rule), `Hiányzó zónaszabály: ${rule}`);
  pass('Zónánkénti számítási nyomvonal képletekkel működik');

  await new Promise((resolve) => setTimeout(resolve, 900));
  const storedZones = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.energyZoneWorkspace;
  });
  assert(storedZones.zones.length === 2 && storedZones.roomAssignments['room-living'] === secondZoneId, 'A többzónás beosztás nem mentődött.');
  assert(storedZones.unheatedSpaces[0].type === 'garage' && storedZones.unheatedSpaces[0].designTemperatureC === 8, 'A fűtetlen tér beállításai nem mentődtek.');
  pass('Zónák, helyiséghozzárendelések és fűtetlen tér beállítások mentődnek');

  await page.click('[data-survey-step="export"]');
  await waitText(page, 'DIMPRO munkafájl és projektverzió');
  const previousDownloads = fs.readdirSync(downloadDir);
  await clickText(page, 'Mentés .dimpro fájlba');
  const dimproFile = await waitDownload('.dimpro', previousDownloads);
  const dimpro = JSON.parse(fs.readFileSync(dimproFile, 'utf8'));
  assert(dimpro.schema === 'dimpro.property-survey.v0.7.4', `Hibás .dimpro séma: ${dimpro.schema}`);
  assert(dimpro.calculated.energyGeometry.schema === 'dimpro.energy-geometry.v0.7.1', 'A geometriai pillanatkép hiányzik a .dimpro fájlból.');
  assert(dimpro.calculated.energyGeometry.trace.length >= 8, 'A geometriai nyomvonal hiányzik az exportból.');
  assert(dimpro.calculated.energyAssemblies.schema === 'dimpro.energy-assembly-set.v0.7.2', 'Az U-érték eredményhalmaz hiányzik a .dimpro fájlból.');
  assert(dimpro.calculated.energyAssemblies.results[0].trace.length >= 5, 'Az U-érték nyomvonal hiányzik az exportból.');
  assert(dimpro.calculated.energyZones.schema === 'dimpro.energy-zone-set.v0.7.3', 'A zónaeredmény hiányzik a .dimpro fájlból.');
  assert(dimpro.calculated.energyZones.zones.length === 2 && dimpro.calculated.energyZones.trace.length >= 8, 'A többzónás eredmény vagy nyomvonal hiányzik az exportból.');
  assert(dimpro.calculated.energyOpenings.schema === 'dimpro.energy-opening-set.v0.7.4', 'A nyílászáró- és hőhíderedmény hiányzik a .dimpro fájlból.');
  assert(dimpro.calculated.energyOpenings.openings.length === 1 && dimpro.calculated.energyOpenings.thermalBridges.length === 2 && dimpro.calculated.energyOpenings.trace.length >= 7, 'A nyílászáró- vagy hőhídnyomvonal hiányzik az exportból.');
  assert(dimpro.draft.materialWorkspace.projectMaterials.length === 1, 'A projektanyag hiányzik az exportból.');
  assert(dimpro.draft.assemblies[0].layers[0].materialSnapshot.materialVersionId.includes('material-project-'), 'A réteg anyagverzió-pillanatképe hiányzik az exportból.');
  pass('.dimpro v0.7.4 export tartalmazza a geometriát, zónákat, rétegrendeket, nyílászárókat és hőhidakat');

  const beforeWinWatt = fs.readdirSync(downloadDir);
  await clickText(page, 'WinWatt JSON');
  const winWattFile = await waitDownload('.json', beforeWinWatt);
  const winWatt = JSON.parse(fs.readFileSync(winWattFile, 'utf8'));
  assert(winWatt.schema === 'dimpro.winwatt-compatible.v0.7.4', `Hibás WinWatt séma: ${winWatt.schema}`);
  assert(winWatt.zones.length === 2 && winWatt.unheatedSpaces.length === 1 && winWatt.zoneConnections.length >= 2, 'A WinWatt zónablokk hiányos.');
  assert(winWatt.openings.length === 1 && winWatt.thermalBridges.length === 2, 'A WinWatt nyílászáró- vagy hőhídblokk hiányos.');
  assert(Math.abs(winWatt.openings[0].effectiveUwWm2K - 0.8412) < 0.0002 && Math.abs(winWatt.openingThermalTotals.totalHeatLossCoefficientWK - 2.6762) < 0.0002, 'A WinWatt nyílászáró-hőtechnikai eredmény hibás.');
  pass('WinWatt-előkészítő zónákat, részletes nyílászárót és hőhidakat tartalmaz');

  const beforePdf = fs.readdirSync(downloadDir);
  await clickText(page, 'Teljes épület PDF készítése');
  const pdfFile = await waitDownload('.pdf', beforePdf, 60000);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfFile));
  const pdf = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise;
  const pdfTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    pdfTexts.push(content.items.map((item) => item.str).join(' '));
  }
  const normalizePdfText = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ő/g, 'o').replace(/Ő/g, 'O');
  const uPdfPage = pdfTexts.find((text) => normalizePdfText(text).includes('RETEGRENDI U-ERTEK OSSZESITO'));
  const zonePdfPage = pdfTexts.find((text) => normalizePdfText(text).includes('ENERGETIKAI ZONAOSSZESITO'));
  const unheatedPdfPage = pdfTexts.find((text) => normalizePdfText(text).includes('FUTETLEN TEREK ES ZONAKAPCSOLATOK'));
  const openingPdfPage = pdfTexts.find((text) => normalizePdfText(text).includes('NYILASZARO HOTECNIKAI OSSZESITO'));
  const bridgePdfPage = pdfTexts.find((text) => normalizePdfText(text).includes('LINEARIS ES PONTSZERU HOHIDAK'));
  const normalizedUPdfPage = normalizePdfText(uPdfPage || '');
  const normalizedZonePdfPage = normalizePdfText(zonePdfPage || '');
  const normalizedUnheatedPdfPage = normalizePdfText(unheatedPdfPage || '');
  const normalizedOpeningPdfPage = normalizePdfText(openingPdfPage || '');
  const normalizedBridgePdfPage = normalizePdfText(bridgePdfPage || '');
  assert(normalizedUPdfPage.includes('Fal retegrend') && normalizedUPdfPage.includes('W/m2K') && normalizedUPdfPage.includes('MEGFELEL'), `A PDF U-érték összesítő oldala hiányos: ${normalizedUPdfPage.slice(0,500)}`);
  assert(normalizedZonePdfPage.includes('Nappali es etkezo zona') && normalizedZonePdfPage.includes('28.40 m2'), `A PDF zónaösszesítő oldala hiányos: ${normalizedZonePdfPage.slice(0,500)}`);
  assert(normalizedUnheatedPdfPage.includes('ZONAKAPCSOLATOK'), `A PDF fűtetlen tér és zónakapcsolat oldala hiányzik: ${normalizedUnheatedPdfPage.slice(0,500)}`);
  assert(normalizedOpeningPdfPage.includes('Ablak') && normalizedOpeningPdfPage.includes('0.841') && normalizedOpeningPdfPage.includes('MEGFELEL'), `A PDF nyílászáró hőtechnikai oldala hiányos: ${normalizedOpeningPdfPage.slice(0,700)}`);
  assert(normalizedBridgePdfPage.includes('Labazati csatlakozas') && normalizedBridgePdfPage.includes('Szerkezeti attores'), `A PDF hőhídoldala hiányos: ${normalizedBridgePdfPage.slice(0,700)}`);
  pass('Vektoros PDF külön zóna-, nyílászáró-, hőhíd- és U-érték összesítő oldalakat tartalmaz');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="structures"]');
  await page.click('[data-survey-step="structures"]');
  await clickExact(page, 'Rétegrendek');
  assert(await page.$('[data-layer-material-snapshot]'), 'Újratöltés után eltűnt az anyagpillanatkép.');
  pass('Újratöltés után is megmarad a projektanyag és a rétegpillanatkép');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key));
    for (const survey of workspace.surveys) { delete survey.draft.energyProjectSettings; delete survey.draft.energyZoneWorkspace; delete survey.draft.energyOpeningWorkspace; delete survey.draft.materialWorkspace; }
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="energy"]');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const migrated = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return { energySchema: survey.draft.energyProjectSettings?.schemaVersion, zoneSchema: survey.draft.energyZoneWorkspace?.schemaVersion, zoneCount: survey.draft.energyZoneWorkspace?.zones?.length, assignedRooms: Object.keys(survey.draft.energyZoneWorkspace?.roomAssignments || {}).length, openingSchema: survey.draft.energyOpeningWorkspace?.schemaVersion, openingDetailCount: Object.keys(survey.draft.energyOpeningWorkspace?.openingDetails || {}).length, migratedOpeningMode: Object.values(survey.draft.energyOpeningWorkspace?.openingDetails || {})[0]?.calculationMode, materialSchema: survey.draft.materialWorkspace?.schemaVersion, materialProjectId: survey.draft.materialWorkspace?.projectCatalog?.projectId, projectId: survey.projectId };
  });
  assert(migrated.energySchema === 1 && migrated.zoneSchema === 1 && migrated.zoneCount === 1 && migrated.assignedRooms === 6 && migrated.openingSchema === 1 && migrated.openingDetailCount === 1 && migrated.migratedOpeningMode === 'declared' && migrated.materialSchema === 1 && migrated.materialProjectId === migrated.projectId, `Régi projekt migrációja hibás: ${JSON.stringify(migrated)}`);
  pass('v0.6.x projekt energetikai, zóna-, nyílászáró- és anyagtér-migrációja működik');

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
  console.log(JSON.stringify({ ok:true, uiTestCount:uiTests.length, uiTests, geometryState, traceState, catalogResponsive, stored, dimproFile, dimproSchema:dimpro.schema, geometrySchema:dimpro.calculated.energyGeometry.schema, assemblySchema:dimpro.calculated.energyAssemblies.schema, zoneSchema:dimpro.calculated.energyZones.schema, openingSchema:dimpro.calculated.energyOpenings.schema, initialZoneState, connectionState, zoneTraceState, storedZones, energyOpeningId, detailedOpeningState, openingTraceState, storedOpenings, winWattFile, winWattSchema:winWatt.schema, openingWinWattTotals:winWatt.openingThermalTotals, uState, solverState, pdfFile, migrated, responsive, consoleErrors:relevantConsoleErrors, pageErrors }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => undefined); });
