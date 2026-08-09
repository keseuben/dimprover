const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3019/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_energy_v070_downloads';
fs.rmSync(downloadDir, { recursive: true, force: true });
fs.mkdirSync(downloadDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const target = [...document.querySelectorAll(selector)].find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
    if (!target) return false;
    target.click();
    return true;
  }, { text, selector });
  assert(clicked, `Nem található kattintható elem: ${text}`);
}

async function waitText(page, text, timeout = 20000) {
  await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text);
}

async function waitDownload(extension, previous = [], timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const file = fs.readdirSync(downloadDir).find((name) => name.endsWith(extension) && !name.endsWith('.crdownload') && !previous.includes(name));
    if (file) return path.join(downloadDir, file);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nem készült el a letöltés: ${extension}`);
}

async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V070 energetikai munkatér teszt');
  await page.type('input[placeholder="Projektkód"]', 'V070-ENERGY');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Energetika Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V070 energetikai munkatér teszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('V070 energetikai mintafelmérés');
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
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek', 30000);
  await createProjectAndSurvey(page);

  const uiTests = [];
  function pass(name) { uiTests.push(name); }

  assert(await page.$('[data-survey-step="energy"]'), 'Az Energetika lépés nem jelent meg energetikai felmérésben.');
  pass('Energetika lépés látható');
  await page.click('[data-survey-step="energy"]');
  await page.waitForSelector('[data-energy-workspace="true"]');
  pass('Energetikai munkatér megnyílik');

  assert(await page.$('[data-energy-settings-panel="true"]'), 'A projektbeállítási panel nem jelent meg.');
  pass('Projektbeállítási panel látható');
  const defaults = await page.evaluate(() => ({
    purpose: document.querySelector('[data-energy-field="calculationPurpose"]')?.value,
    ruleSet: document.querySelector('[data-energy-field="ruleSetId"]')?.value,
    requirement: document.querySelector('[data-energy-field="requirementLevel"]')?.value,
    constructionYear: document.querySelector('[data-energy-field="constructionYear"]')?.value,
  }));
  assert(defaults.purpose === 'existingAssessment', `Hibás alap cél: ${defaults.purpose}`);
  assert(defaults.ruleSet === 'HU_EKM_2023_11_01', `Hibás szabálycsomag: ${defaults.ruleSet}`);
  assert(defaults.requirement === 'existingNoRequirement', `Hibás követelményszint: ${defaults.requirement}`);
  assert(defaults.constructionYear === '1985', `A mintaprojekt építési éve nem migrálódott: ${defaults.constructionYear}`);
  pass('Alapértékek és mintamigráció helyes');

  await page.select('[data-energy-field="calculationPurpose"]', 'significantRenovation');
  await page.select('[data-energy-field="requirementLevel"]', 'significantRenovation');
  await page.select('[data-energy-field="certificationSubject"]', 'independentUnit');
  await page.select('[data-energy-field="buildingSymbol"]', 'rowHouseEnd');
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const setValue = (selector, value) => {
      const element = document.querySelector(selector);
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('[data-energy-field="permitOrNotificationDate"]', '2024-05-16');
    setValue('[data-energy-field="constructionYear"]', '1998');
    setValue('[data-energy-field="significantRenovationYear"]', '2026');
  });
  await page.select('[data-energy-field="calculationMethod"]', 'mixed');
  const wholeBuilding = await page.$('[data-energy-field="wholeBuildingDataAvailable"]');
  if (await wholeBuilding.evaluate((element) => element.checked)) await wholeBuilding.click();
  pass('Mind a tíz energetikai mező szerkeszthető');

  await page.click('[data-energy-tab="status"]');
  await page.waitForSelector('[data-energy-compliance-panel="true"]');
  assert((await page.$eval('[data-energy-disclaimer="true"]', (element) => element.textContent)).includes('szakmai ellenőrzés szükséges'), 'A kötelező tervezői figyelmeztetés hiányzik.');
  pass('Tervezői figyelmeztetés látható');
  assert((await page.$eval('[data-energy-rule-set-card="true"]', (element) => element.textContent)).includes('HU_EKM_2023_11_01'), 'A szabálycsomag-kártya hiányos.');
  pass('Szabálycsomag és verzió megjelenik');
  assert((await page.$eval('[data-energy-material-foundation="true"]', (element) => element.textContent)).includes('25 belső fejlesztési tesztanyag'), 'Az anyagmotor állapotkártya hibás.');
  pass('Anyagmotor alapozás megjelenik');
  assert(await page.$('[data-energy-validation-code="WHOLE_BUILDING_DATA_MISSING"]'), 'Az önálló egység teljesépület-adat figyelmeztetése hiányzik.');
  pass('Kontextusfüggő validáció működik');
  assert((await page.$eval('[data-energy-readiness-percent]', (element) => element.textContent)).includes('100%'), 'A beállítási készültség nem 100%.');
  pass('Beállítási készültség számítása működik');

  await new Promise((resolve) => setTimeout(resolve, 900));
  const storedSettings = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.energyProjectSettings;
  });
  assert(storedSettings.calculationPurpose === 'significantRenovation', 'A számítás célja nem mentődött.');
  assert(storedSettings.buildingSymbol === 'rowHouseEnd', 'Az épületszimbólum nem mentődött.');
  assert(storedSettings.calculationMethod === 'mixed', 'A számítási módszer nem mentődött.');
  assert(storedSettings.wholeBuildingDataAvailable === false, 'A teljesépület-adat jelölő nem mentődött.');
  pass('LocalStorage mentés tartós');

  await page.click('[data-survey-step="export"]');
  await waitText(page, 'DIMPRO munkafájl és projektverzió');
  const previousDownloads = fs.readdirSync(downloadDir);
  await clickText(page, 'Mentés .dimpro fájlba');
  const dimproFile = await waitDownload('.dimpro', previousDownloads);
  const dimpro = JSON.parse(fs.readFileSync(dimproFile, 'utf8'));
  assert(dimpro.schema === 'dimpro.property-survey.v0.7.0', `Hibás .dimpro séma: ${dimpro.schema}`);
  assert(dimpro.draft.energyProjectSettings.ruleSetId === 'HU_EKM_2023_11_01', 'A .dimpro fájlból hiányzik az energetikai szabálycsomag.');
  assert(dimpro.draft.energyProjectSettings.significantRenovationYear === 2026, 'A .dimpro fájlból hiányzik a felújítás éve.');
  pass('.dimpro v0.7.0 export tartalmazza az energetikai beállításokat');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="energy"]');
  await page.click('[data-survey-step="energy"]');
  const persisted = await page.$eval('[data-energy-field="calculationPurpose"]', (element) => element.value);
  assert(persisted === 'significantRenovation', `Újratöltés után elveszett a beállítás: ${persisted}`);
  pass('Újratöltés után is megmaradnak a beállítások');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key));
    for (const survey of workspace.surveys) delete survey.draft.energyProjectSettings;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="energy"]');
  await page.click('[data-survey-step="energy"]');
  const migrated = await page.evaluate(() => ({
    purpose: document.querySelector('[data-energy-field="calculationPurpose"]')?.value,
    ruleSet: document.querySelector('[data-energy-field="ruleSetId"]')?.value,
    schemaVersion: JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1')).surveys[0].draft.energyProjectSettings?.schemaVersion,
  }));
  assert(migrated.purpose === 'existingAssessment' && migrated.ruleSet === 'HU_EKM_2023_11_01', `Régi projekt migrációja hibás: ${JSON.stringify(migrated)}`);
  pass('v0.6.x projekt automatikus migrációja működik');

  const modeSelector = 'select[aria-label="Felmérési munkamód"]';
  await page.select(modeSelector, 'Épület- és csarnokfelmérés');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert(!(await page.$('[data-survey-step="energy"]')), 'Ipari munkamódban nem szabad megjelennie az Energetika lépésnek.');
  pass('Feature flag és munkamód-szűrés működik');
  await page.select(modeSelector, 'Energetikai felmérés');
  await page.waitForSelector('[data-survey-step="energy"]');

  const responsive = [];
  for (const [width, height] of [[1680, 1050], [1194, 834], [1024, 768], [834, 1194], [768, 1024], [390, 844]]) {
    responsive.push(await responsiveCheck(page, width, height));
  }
  pass('Desktop, fekvő tablet, álló tablet, iPad és mobil overflow-regresszió sikeres');

  assert(uiTests.length >= 10, `Kevesebb mint 10 UI-teszt futott: ${uiTests.length}`);
  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);

  console.log(JSON.stringify({ ok: true, uiTestCount: uiTests.length, uiTests, defaults, storedSettings, dimproFile, dimproSchema: dimpro.schema, migrated, responsive, consoleErrors: relevantConsoleErrors, pageErrors }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
});
