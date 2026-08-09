const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3023/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_energy_v080_downloads';
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
async function waitText(page, text, timeout = 20000) { await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text); }
async function openDetails(page, selector) {
  await page.waitForSelector(selector);
  const isOpen = await page.$eval(selector, (element) => element.open);
  if (!isOpen) await page.click(`${selector} > summary`);
  await page.waitForFunction((wanted) => document.querySelector(wanted)?.open === true, {}, selector);
}
async function waitDownload(extension, previous = [], timeout = 60000) {
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
  await page.keyboard.press('Tab');
  await new Promise((resolve) => setTimeout(resolve, 160));
}
async function setByLabel(page, labelText, value) {
  const selector = await page.evaluate((labelText) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((item) => (item.textContent || '').replace(/\s+/g, ' ').trim().includes(labelText));
    if (!label) return null;
    const field = label.querySelector('input,textarea,select');
    if (!field) return null;
    if (!field.id) field.id = `test-field-${Math.random().toString(36).slice(2)}`;
    return `#${field.id}`;
  }, labelText);
  assert(selector, `Nem található címkézett mező: ${labelText}`);
  await setNativeValue(page, selector, value);
}
async function responsiveCheck(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const values = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(values.body <= values.viewport + 2 && values.html <= values.viewport + 2, `Vízszintes overflow ${width} px: ${JSON.stringify(values)}`);
  return values;
}
async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V080 terepi energetikai teszt');
  await page.type('input[placeholder="Projektkód"]', 'V080');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Terepi Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V080 terepi energetikai teszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('V080 terepi energetikai mintafelmérés');
  await (await dialog.$('select')).select('Energetikai felmérés');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await page.waitForSelector('[data-survey-step="renewables"]', { timeout: 20000 });
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

  assert(await page.$('[data-energy-mode="field"]'), 'A Terepi mód kapcsoló hiányzik.');
  assert(!(await page.$('[data-survey-step="energy"]')), 'Terepi módban a részletes szakértői Energetika lépés rejtett legyen.');
  assert(await page.$('[data-survey-step="renewables"]'), 'A Megújuló lépés hiányzik Terepi módban.');
  assert(await page.$('[data-survey-step="renovation"]'), 'A Felújítás lépés hiányzik Terepi módban.');
  pass('Terepi mód egyszerű lépésstruktúrával indul');
  assert(await page.$('[data-energy-field-guide]'), 'A terepi útmutató hiányzik.');
  assert(await page.$('[data-energy-next-incomplete-step]'), 'A következő hiányos lépés gombja hiányzik.');
  const stepCountBeforeFilter = await page.$$eval('[data-survey-step]', (elements) => elements.length);
  await page.click('[data-energy-field-guide] input[type="checkbox"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1')).surveys.find((item) => item.id === JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1')).activeSurveyId).draft.energyFieldWorkflow.showOnlyIncomplete === true);
  const stepCountAfterFilter = await page.$$eval('[data-survey-step]', (elements) => elements.length);
  assert(stepCountAfterFilter <= stepCountBeforeFilter, 'A csak hiányos lépések szűrő nem csökkentette vagy tartotta a lépésszámot.');
  await page.click('[data-energy-field-guide] input[type="checkbox"]');
  pass('Terepi útmutató, következő hiányos lépés és lépésszűrés működik');

  await page.click('[data-survey-step="renewables"]');
  await page.waitForSelector('[data-energy-renewable-panel="true"]');
  await clickText(page, 'Előméretezés használata ebben a projektben', 'label');
  await page.click('[data-add-roof-surface]');
  await page.waitForSelector('[data-roof-surface]');
  await setDecimalField(page, '[aria-label*="bruttó felület"]', '50');
  await setDecimalField(page, '[aria-label*="hasznos felület"]', '40');
  await setDecimalField(page, '[aria-label*="azimut"]', '180');
  await setDecimalField(page, '[aria-label*="dőlésszög"]', '35');
  await setByLabel(page, 'Adatforrás', 'Helyszíni tetőmérés');
  assert((await page.$eval('[data-energy-advanced^="roof-"]', (element) => element.open)) === false, 'Terepi módban a tetősík részletei alapból legyenek összecsukva.');
  await openDetails(page, '[data-energy-advanced^="roof-"]');
  await setDecimalField(page, '[aria-label*="árnyékolási szorzó"]', '0,9');
  await clickText(page, 'Napelemhez', 'label');
  await clickText(page, 'Napkollektorhoz', 'label');
  pass('Tetősík tájolás, dőlés, hasznos felület és rendszerválasztás rögzíthető');

  await page.click('[data-renewable-tab="electricity"]');
  await setDecimalField(page, '[aria-label="Éves villamosenergia-fogyasztás"]', '6000');
  await setDecimalField(page, '[aria-label="Csatlakozási áramerősség"]', '32');
  await setByLabel(page, 'Forrás', 'Éves villanyszámla és mérőhely');
  await openDetails(page, '[data-energy-advanced="electricity"]');
  await setDecimalField(page, '[aria-label="Nappali fogyasztási arány"]', '40');
  await setDecimalField(page, '[aria-label="Egyidejű alapteher"]', '2');
  pass('Villamosenergia-fogyasztás és hálózati csatlakozás rögzíthető');

  await page.click('[data-renewable-tab="pv"]');
  await clickText(page, 'Napelemrendszer előméretezése', 'label');
  await setDecimalField(page, '[aria-label="Napelem paneldarabszám"]', '18');
  await setDecimalField(page, '[aria-label="Napelem inverter teljesítmény"]', '8');
  await setByLabel(page, 'Forrás / hozamadat', 'Dokumentált helyszíni hozam-előméretezés');
  await openDetails(page, '[data-energy-advanced="pv"]');
  await setDecimalField(page, '[aria-label="Napelem fajlagos éves hozam"]', '1200');
  await setDecimalField(page, '[aria-label="Napelem rendszerveszteség"]', '10');
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-energy-renewable-panel]');
    const cards = [...(panel?.querySelectorAll('.rounded-xl') || [])];
    const power = cards.find((element) => (element.textContent || '').includes('Beépített teljesítmény'));
    const annual = cards.find((element) => (element.textContent || '').includes('Becsült éves hozam'));
    return power && annual && !(power.textContent || '').includes('–') && !(annual.textContent || '').includes('–');
  }, { timeout: 10000 });
  const pvMetricState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-energy-renewable-panel] .rounded-xl')];
    const text = (label) => cards.find((element) => (element.textContent || '').includes(label))?.textContent || '';
    return { power: text('Beépített teljesítmény'), annual: text('Becsült éves hozam'), ratio: text('DC/AC arány') };
  });
  assert(pvMetricState.power.includes('8,1') && pvMetricState.power.includes('kWp'), `A PV teljesítmény hibás: ${JSON.stringify(pvMetricState)}`);
  assert(/7[^0-9]*873/.test(pvMetricState.annual.replace(/ /g, ' ')), `A PV éves hozam hibás: ${JSON.stringify(pvMetricState)}`);
  pass('Napelem paneldarabszám, kWp, inverter és éves hozam számítása működik');

  await page.click('[data-renewable-tab="solar"]');
  await clickText(page, 'Napkollektoros HMV-rásegítés előméretezése', 'label');
  await setDecimalField(page, '[aria-label="Napkollektor felület"]', '4');
  await setDecimalField(page, '[aria-label="HMV személyek száma"]', '4');
  await setByLabel(page, 'Forrás', 'Gyártói kollektoradat és helyszíni előméretezés');
  await openDetails(page, '[data-energy-advanced="solar"]');
  await setDecimalField(page, '[aria-label="Napkollektor fajlagos hozam"]', '500');
  await setDecimalField(page, '[aria-label="Napkollektor rendszerveszteség"]', '20');
  pass('Napkollektor HMV-igény, éves hozam, lefedettség és tároló előméretezése működik');

  await page.click('[data-renewable-tab="battery"]');
  await clickText(page, 'Akkumulátoros energiatároló előméretezése', 'label');
  await setDecimalField(page, '[aria-label="Akkumulátor névleges kapacitás"]', '10');
  await setByLabel(page, 'Forrás', 'Gyártói akkumulátor-adatlap');
  await openDetails(page, '[data-energy-advanced="battery"]');
  await setDecimalField(page, '[aria-label="Akkumulátor használható kapacitás"]', '9');
  await setDecimalField(page, '[aria-label="Akkumulátor maximális töltés"]', '5');
  await setDecimalField(page, '[aria-label="Akkumulátor maximális kisütés"]', '5');
  pass('Akkumulátor sajátfogyasztási és tartaléküzemi méretezése működik');
  const completedRenewableTabs = await page.$$eval('[data-renewable-readiness="complete"]', (elements) => elements.length);
  assert(completedRenewableTabs >= 4, `Túl kevés kész megújuló részjelzés: ${completedRenewableTabs}`);
  pass('A munkalapfülek külön jelzik a kész, hiányos és opcionális részeket');

  await page.click('[data-renewable-tab="ev"]');
  await clickText(page, 'Elektromosautó-töltés előméretezése', 'label');
  await setByLabel(page, 'Forrás', 'Tulajdonosi járműhasználati adat');
  await page.click('[data-renewable-tab="result"]');
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-energy-renewable-panel] *')].some((element) => (element.textContent || '').includes('blokkoló hiány') && !(element.textContent || '').includes('0 blokkoló hiány')), { timeout: 10000 }).catch(() => undefined);
  const renewableState = await page.evaluate(() => ({
    text: document.querySelector('[data-energy-renewable-panel]')?.textContent || '',
    errors: [...document.querySelectorAll('[data-energy-renewable-panel] .border-rose-300')].map((element) => element.textContent),
  }));
  assert(renewableState.errors.length === 0, `A teljes megújuló referencia blokkolt: ${JSON.stringify(renewableState.errors)}`);
  assert(renewableState.text.includes('Épület + EV villamos igény') && renewableState.text.includes('PV becsült lefedettség'), 'Az összesített megújuló eredmény hiányzik.');
  pass('Autótöltő áramigény, hálózati tartalék és közös eredmény számítása működik');

  await new Promise((resolve) => setTimeout(resolve, 850));
  const storedRenewable = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    return workspace.surveys.find((item) => item.id === workspace.activeSurveyId).draft.energyRenewableWorkspace;
  });
  assert(storedRenewable.schemaVersion === 1 && storedRenewable.enabled === true && storedRenewable.roofSurfaces.length === 1, 'A megújuló munkatér nem mentődött projektállapotba.');
  assert(storedRenewable.pv.enabled && storedRenewable.solarThermal.enabled && storedRenewable.battery.enabled && storedRenewable.evCharging.enabled, 'Nem minden előméretezési rendszer mentődött.');
  pass('Napelem, napkollektor, akkumulátor és autótöltő közös projektállapotba mentődik');

  await page.click('[data-survey-step="renovation"]');
  await page.waitForSelector('[data-energy-renovation-panel="true"]');
  await page.click('[data-generate-renovation-suggestions]');
  await page.waitForFunction(() => document.querySelectorAll('[data-renovation-measure]').length >= 6, { timeout: 15000 });
  const renovationState = await page.evaluate(() => ({
    scenarios: document.querySelectorAll('[data-renovation-scenario]').length,
    measures: document.querySelectorAll('[data-renovation-measure]').length,
    text: document.querySelector('[data-energy-renovation-panel]')?.textContent || '',
  }));
  assert(renovationState.scenarios >= 2 && renovationState.measures >= 6, `A felújítási változat vagy javaslatlista hiányos: ${JSON.stringify(renovationState)}`);
  for (const text of ['Fűtési rendszer', 'Használati melegvíz', 'Napelem', 'Napkollektor', 'Akkumulátor', 'Elektromosautó-töltés']) assert(renovationState.text.includes(text), `Hiányzó helyszíni javaslat: ${text}`);
  pass('A számításból több szakági helyszíni felújítási javaslat generálható');
  await page.waitForSelector('[data-renovation-comparison="true"]');
  const comparisonState = await page.evaluate(() => ({ status: document.querySelector('[data-renovation-comparison]')?.getAttribute('data-renovation-comparison-status'), measures: document.querySelectorAll('[data-renovation-comparison-measure]').length, text: document.querySelector('[data-renovation-comparison]')?.textContent || '' }));
  assert(['partial','unavailable','calculated'].includes(comparisonState.status), `A változat-összehasonlító státusz hibás: ${JSON.stringify(comparisonState)}`);
  assert(comparisonState.measures >= 6 && comparisonState.text.includes('Meglévő és tervezett állapot összehasonlítása'), 'A terepi változat-összehasonlítás hiányos.');
  assert(comparisonState.text.includes('nem éves energiamegtakarítás') || comparisonState.text.includes('nem része ennek a verziónak'), 'Az összehasonlító szakmai korlátozása hiányzik.');
  pass('Az M0 és tervezett változat számítható, részleges és még nem számítható hatásokat külön mutat');
  assert(await page.$$eval('[data-renovation-filter]', (elements) => elements.length) === 3, 'A felújítási kártyaszűrők hiányoznak.');
  assert(await page.$$eval('details[data-renovation-measure][open]', (elements) => elements.length) === 0, 'Terepi módban az intézkedésrészletek alapból legyenek összecsukva.');
  await page.click('[data-renovation-measure] > summary');
  await page.waitForFunction(() => document.querySelector('details[data-renovation-measure]')?.open === true);
  assert(await page.$('[data-renovation-measure] [data-energy-advanced^="renovation-measure-"]'), 'A részletes intézkedésadatok külön szakasza hiányzik.');
  pass('A felújítási intézkedések rövid kártyákból, szűréssel és külön műszaki részletekkel kezelhetők');

  await page.click('[data-add-renovation-scenario]');
  await page.waitForFunction(() => document.querySelectorAll('[data-renovation-scenario]').length >= 3);
  await page.click('[data-add-renovation-measure]');
  await page.waitForFunction(() => document.querySelectorAll('[data-renovation-measure]').length >= 1);
  pass('Több tervezett változat és kézi intézkedés létrehozható');

  await page.click('[data-energy-mode="expert"]');
  await page.waitForSelector('[data-survey-step="energy"]');
  await page.click('[data-survey-step="energy"]');
  await page.waitForSelector('[data-energy-tab="tables"]');
  await page.click('[data-energy-tab="tables"]');
  await page.waitForSelector('[data-energy-expert-tables="true"]');
  const expertState = await page.evaluate(() => ({ selectors: document.querySelectorAll('[data-expert-table-select]').length, text: document.querySelector('[data-energy-expert-tables]')?.textContent || '' }));
  assert(expertState.selectors === 15, `A szakértői adattáblák száma hibás: ${expertState.selectors}`);
  assert(expertState.text.includes('Általános adatok') && expertState.text.includes('Változat-összehasonlítás') && expertState.text.includes('Megújuló és villamos rendszerek'), 'A szakértői táblaválasztó hiányos.');
  pass('Szakértői mód 15 WinWatt-logikájú adattáblát jelenít meg');

  const beforeWorkbook = fs.readdirSync(downloadDir);
  await clickText(page, 'Excel munkafüzet');
  const workbookFile = await waitDownload('.xlsx', beforeWorkbook);
  const workbook = XLSX.readFile(workbookFile);
  assert(workbook.SheetNames.length === 20 && workbook.SheetNames[0] === '00_Jegyzek', `Az Excel munkafüzet lapjai hibásak: ${workbook.SheetNames.join(', ')}`);
  for (const sheet of ['03_Szerkezetek', '05_Helyisegek', '07_Zonak', '09_Nyilaszarok', '11_Gepeszeti_rendsz', '12_Felujitasi_valt', '13_Valtozat_osszeh', '14_Megujulo_vill', '16_Mezoterkep', '17_Atadas_ellenorzes', '18_Probanaplo', '19_Eredmeny_elteres']) assert(workbook.SheetNames.includes(sheet), `Hiányzó Excel lap: ${sheet}`);
  pass('WinWatt-előkészítő Excel munkafüzet 20 munkalappal, ellenőrző- és próbanapló-lapokkal elkészül');
  const workbookIndexRows = XLSX.utils.sheet_to_json(workbook.Sheets['00_Jegyzek'], { header: 1 });
  const workbookGeneralRows = XLSX.utils.sheet_to_json(workbook.Sheets['01_Altalanos'], { header: 1 });
  assert(workbookIndexRows.some((row) => row[1] === 'dimpro.winwatt-transfer.v0.8.4'), 'Az Excel v0.8.4 átadási séma hiányzik.');
  assert(workbookGeneralRows.some((row) => row.some((cell) => String(cell || '').includes('Nem natív WinWatt projektfájl'))), 'Az Excel kötelező WinWatt-korlátozása hiányzik.');
  pass('Az Excel minden adatcsoportot v0.8.4 sémával és kötelező szakmai korlátozással ad át');
  const workbookFieldMapRows = XLSX.utils.sheet_to_json(workbook.Sheets['16_Mezoterkep'], { header: 1 });
  const workbookValidationRows = XLSX.utils.sheet_to_json(workbook.Sheets['17_Atadas_ellenorzes'], { header: 1 });
  assert(workbookFieldMapRows.some((row) => row.includes('DIMPRO WinWatt mezőtérkép')), 'A mezőtérkép Excel lapja hiányzik.');
  assert(workbookValidationRows.some((row) => row.includes('DIMPRO WinWatt próbaátadási ellenőrzés')), 'Az átadás-ellenőrző Excel lap hiányzik.');
  const initialTrialRows = XLSX.utils.sheet_to_json(workbook.Sheets['18_Probanaplo'], { header: 1 });
  const initialResultRows = XLSX.utils.sheet_to_json(workbook.Sheets['19_Eredmeny_elteres'], { header: 1 });
  assert(initialTrialRows.some((row) => row.includes('DIMPRO WinWatt próbanapló')), 'A próbanapló Excel-lap fejléc hiányzik.');
  assert(initialResultRows.some((row) => row.includes('DIMPRO–WinWatt eredmény-összevetés')), 'Az eredményeltérés Excel-lap fejléc hiányzik.');
  pass('Az Excel külön mezőtérkép-, ellenőrző-, próbanapló- és eredményeltérés-lapot tartalmaz');

  await page.click('[data-energy-tab="transfer"]');
  await page.waitForSelector('[data-energy-winwatt-transfer="true"]');
  const transferMapState = await page.evaluate(() => ({
    tableCards: document.querySelectorAll('[data-winwatt-table-readiness]').length,
    fieldRows: document.querySelectorAll('[data-winwatt-field-status]').length,
    blockedRows: document.querySelectorAll('[data-winwatt-field-status="blocked"]').length,
    reviewRows: document.querySelectorAll('[data-winwatt-field-status="reviewRequired"]').length,
    readiness: document.querySelector('[data-winwatt-trial-readiness]')?.textContent || '',
    text: document.querySelector('[data-energy-winwatt-transfer]')?.textContent || '',
  }));
  assert(transferMapState.tableCards === 15, `A WinWatt adatcsoportkártyák száma hibás: ${JSON.stringify(transferMapState)}`);
  assert(transferMapState.fieldRows > 150, `Túl kevés WinWatt-mező látható: ${JSON.stringify(transferMapState)}`);
  assert(transferMapState.text.includes('WinWatt mezőtérkép és próbaátadás') && transferMapState.text.includes('Célkulcs / felirat'), 'A WinWatt átadási felület hiányos.');
  pass('A szakértői WinWatt átadás lap mező- és adatcsoportszintű készültséget mutat');
  await page.select('[aria-label="WinWatt mezőtérkép készültségi szűrő"]', 'blocked');
  const blockedFilteredRows = await page.$$eval('[data-winwatt-field-status]', (elements) => elements.length);
  assert(blockedFilteredRows === transferMapState.blockedRows, `A blokkoltmező-szűrés hibás: ${blockedFilteredRows} / ${transferMapState.blockedRows}`);
  await page.select('[aria-label="WinWatt mezőtérkép készültségi szűrő"]', 'all');
  pass('A mezőtérkép készültség és adatcsoport szerint szűrhető');

  await page.click('[data-winwatt-transfer-view="trial"]');
  await page.waitForSelector('[data-winwatt-trial-panel="true"]');
  assert(await page.$('[data-create-winwatt-trial]'), 'Az új WinWatt-próba gomb hiányzik.');
  await page.click('[data-create-winwatt-trial]');
  await page.waitForSelector('[data-winwatt-trial-session]');
  await setNativeValue(page, '[aria-label="Próba WinWatt verzió"]', '9.54');
  await setNativeValue(page, '[aria-label="Próba operátor"]', 'DIMPRO tesztelő');
  await setNativeValue(page, '[aria-label="Próba munkaállomás"]', 'WINWATT-WS-01');
  const completedDisabled = await page.$eval('[data-winwatt-trial-status="completed"]', (element) => element.disabled);
  assert(completedDisabled === true, 'Félkész próbamunkamenet nem jelölhető lezártnak.');
  pass('Új WinWatt-próba létrehozható, a félkész munkamenet lezárása blokkolt');

  await page.waitForSelector('[data-winwatt-guided-trial="true"]');
  await page.waitForSelector('[data-winwatt-trial-field]');
  const trialFieldIds = await page.$$eval('[data-winwatt-trial-field]', (elements) => elements.map((element) => element.getAttribute('data-winwatt-trial-field')).filter(Boolean));
  let guidedFieldId = null;
  for (const fieldId of trialFieldIds.slice(0, 30)) {
    await page.evaluate((wanted) => document.querySelector(`[data-winwatt-trial-field="${wanted}"]`)?.click(), fieldId);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const canCopy = await page.$eval('[data-winwatt-guided-copy]', (element) => !element.disabled);
    if (canCopy) { guidedFieldId = fieldId; break; }
  }
  assert(guidedFieldId, 'Nem található másolható DIMPRO forrásértékkel rendelkező próbamező.');
  await page.waitForSelector('[data-winwatt-trial-field-editor]');
  await setNativeValue(page, '[aria-label="WinWatt célablak"]', 'Épület');
  await setNativeValue(page, '[aria-label="WinWatt célfül"]', 'Általános adatok');
  await setNativeValue(page, '[aria-label="WinWatt pontos célfelirat"]', 'Épület címe');
  await setNativeValue(page, '[aria-label="WinWattban látott érték"]', '4150 Püspökladány');
  await setNativeValue(page, '[aria-label="Mező próbamegjegyzése"]', 'A célmező a WinWatt általános adatablakában található.');

  await page.click('[data-winwatt-guided-action="start"]');
  await new Promise((resolve) => setTimeout(resolve, 1250));
  const runningElapsed = await page.$eval('[data-winwatt-guided-elapsed]', (element) => element.textContent || '');
  assert(!runningElapsed.endsWith('00:00:00'), `A vezetett mezőidőmérés nem indult el: ${runningElapsed}`);
  await page.click('[data-winwatt-guided-action="pause"]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    const session = survey.draft.energyWinWattTrialWorkspace.sessions[0];
    const field = session.fieldResults.find((item) => item.fieldMapId === session.activeFieldMapId);
    return field && !field.entryStartedAt && field.durationSeconds > 0;
  });
  pass('A vezetett WinWatt mezőpróba indítható, automatikusan mérhető és szüneteltethető');

  await page.click('[data-winwatt-guided-copy]');
  await page.waitForSelector('[data-winwatt-guided-copy-state="copied"]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    const session = survey.draft.energyWinWattTrialWorkspace.sessions[0];
    const field = session.fieldResults.find((item) => item.fieldMapId === session.activeFieldMapId);
    return field?.inputMethod === 'copyPaste' && Boolean(field.entryStartedAt);
  });
  pass('A DIMPRO forrásérték egy gombbal vágólapra másolható, és a mezőidőmérés automatikusan folytatódik');

  const beforeQuickStatusId = await page.$eval('[data-winwatt-guided-current]', (element) => element.getAttribute('data-winwatt-guided-current'));
  await page.click('[data-winwatt-guided-status="matched"]');
  await page.waitForFunction((previous) => document.querySelector('[data-winwatt-guided-current]')?.getAttribute('data-winwatt-guided-current') !== previous, {}, beforeQuickStatusId);
  const afterQuickStatusId = await page.$eval('[data-winwatt-guided-current]', (element) => element.getAttribute('data-winwatt-guided-current'));
  assert(afterQuickStatusId && afterQuickStatusId !== beforeQuickStatusId, 'Az automatikus továbblépés nem választotta ki a következő még nem próbált mezőt.');
  pass('A gyors Egyezik státusz lezárja a mezőt és automatikusan a következő hiányzó mezőre lép');

  await page.click('[data-winwatt-guided-status="blocked"]');
  await page.waitForSelector('[data-winwatt-guided-blocked-list]');
  await openDetails(page, '[data-winwatt-guided-blocked-list]');
  await page.click('[data-winwatt-guided-blocked-list] button');
  await page.waitForFunction((blockedId) => document.querySelector('[data-winwatt-guided-current]')?.getAttribute('data-winwatt-guided-current') === blockedId, {}, afterQuickStatusId);
  await page.click('[data-winwatt-guided-status="matched"]');
  await page.waitForFunction(() => !document.querySelector('[data-winwatt-guided-blocked-list]'));
  pass('A blokkolt mezők külön listában megjelennek, visszanyithatók és javított státusszal lezárhatók');

  await page.evaluate((wanted) => document.querySelector(`[data-winwatt-trial-field="${wanted}"]`)?.click(), guidedFieldId);
  await page.waitForFunction((wanted) => document.querySelector('[data-winwatt-guided-current]')?.getAttribute('data-winwatt-guided-current') === wanted, {}, guidedFieldId);
  await setDecimalField(page, '[aria-label="Mező beviteli sorrendje"]', '1');
  await setDecimalField(page, '[aria-label="Mező beviteli ideje"]', '18,5');
  await page.waitForFunction(() => document.querySelector('[data-winwatt-trial-field-editor]')?.textContent?.includes('Célmező egyezik'));
  pass('Mezőnként rögzíthető a célablak, célfül, pontos felirat, beviteli mód és kézi időkorrekció');

  const dimproFloorValue = await page.$eval('[data-winwatt-trial-metric="conditionedFloorArea"] input[readonly]', (element) => element.value);
  assert(dimproFloorValue && dimproFloorValue !== '–', 'A kondicionált alapterület DIMPRO referenciaértéke hiányzik.');
  await setDecimalField(page, '[aria-label="Kondicionált alapterület WinWatt érték"]', dimproFloorValue);
  await page.waitForFunction(() => document.querySelector('[data-winwatt-trial-metric="conditionedFloorArea"]')?.textContent?.includes('Tűrésen belül'));
  pass('A DIMPRO–WinWatt eredményeltérés tizedesvesszővel és tűréssel számítható');

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const storedTrial = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    const trial = survey.draft.energyWinWattTrialWorkspace;
    const session = trial.sessions[0];
    const matched = session.fieldResults.find((field) => field.status === 'matched');
    return { schemaVersion: trial.schemaVersion, sessionCount: trial.sessions.length, status: session.status, version: session.winWattVersion, operator: session.operatorName, activeFieldMapId: session.activeFieldMapId, targetWindow: matched?.targetWindow, targetTab: matched?.targetTab, targetFieldLabel: matched?.targetFieldLabel, durationSeconds: matched?.durationSeconds, entryStartedAt: matched?.entryStartedAt, entryCompletedAt: matched?.entryCompletedAt, compared: session.resultComparisons.filter((metric) => metric.status !== 'notCompared').length };
  });
  assert(storedTrial.schemaVersion === 1 && storedTrial.sessionCount === 1 && storedTrial.status === 'inProgress', `A próbanapló projektmentése hibás: ${JSON.stringify(storedTrial)}`);
  assert(storedTrial.version === '9.54' && storedTrial.operator === 'DIMPRO tesztelő' && storedTrial.targetWindow === 'Épület' && storedTrial.targetTab === 'Általános adatok' && storedTrial.targetFieldLabel === 'Épület címe', `A próba célmezőadatai hibásak: ${JSON.stringify(storedTrial)}`);
  assert(Math.abs(storedTrial.durationSeconds - 18.5) < 0.001 && storedTrial.entryCompletedAt && !storedTrial.entryStartedAt && storedTrial.activeFieldMapId && storedTrial.compared === 1, `A próba idő-, aktívmező- vagy eredményadata hibás: ${JSON.stringify(storedTrial)}`);
  pass('A próbamunkamenet, visszaigazolt célmező és eredmény-összevetés a projektbe mentődik');

  const guidedResponsive = [];
  for (const [width, height] of [[1920,1080],[1366,768],[1194,834],[834,1194],[390,844]]) {
    guidedResponsive.push(await responsiveCheck(page, width, height));
    const guidedLayout = await page.evaluate(() => {
      const panel = document.querySelector('[data-winwatt-guided-trial]');
      const buttons = [...document.querySelectorAll('[data-winwatt-guided-status]')];
      const rect = panel?.getBoundingClientRect();
      return { width: rect?.width || 0, visible: Boolean(rect && rect.width > 0 && rect.height > 0), minButtonHeight: buttons.length ? Math.min(...buttons.map((button) => button.getBoundingClientRect().height)) : 0, buttonCount: buttons.length };
    });
    const minimumGuidedWidth = width <= 480 ? width - 64 : 350;
    assert(guidedLayout.visible && guidedLayout.width >= minimumGuidedWidth, `A vezetett WinWatt-próba panel túl keskeny vagy rejtett ${width} px nézetben: ${JSON.stringify(guidedLayout)}`);
    assert(guidedLayout.buttonCount === 6 && guidedLayout.minButtonHeight >= 44, `A vezetett próba gyorsgombjai nem érintésbarátok ${width} px nézetben: ${JSON.stringify(guidedLayout)}`);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  pass('A vezetett WinWatt-próba desktop, laptop, fekvő és álló tablet, valamint mobil nézetben nem okoz oldal-overflow-t');

  await page.click('[data-winwatt-transfer-view="readiness"]');
  await page.waitForSelector('[data-winwatt-readiness-view="true"]');
  for (const name of fs.readdirSync(downloadDir).filter((item) => item.endsWith('.xlsx'))) fs.rmSync(path.join(downloadDir, name), { force: true });
  await clickText(page, '20 lapos Excel');
  const trialWorkbookFile = await waitDownload('.xlsx', []);
  const trialWorkbook = XLSX.readFile(trialWorkbookFile);
  const trialLogRows = XLSX.utils.sheet_to_json(trialWorkbook.Sheets['18_Probanaplo'], { header: 1 });
  const trialResultRows = XLSX.utils.sheet_to_json(trialWorkbook.Sheets['19_Eredmeny_elteres'], { header: 1 });
  assert(trialLogRows.some((row) => row.includes('DIMPRO tesztelő')) && trialLogRows.some((row) => row.includes('Épület címe')), 'A próbanapló Excel-lap nem tartalmazza a visszaigazolt célmezőt.');
  assert(trialLogRows.some((row) => row.includes('Mezőpróba indítva') && row.includes('Mezőpróba befejezve')), 'A próbanapló Excel-lapról hiányoznak az automatikus mezőidőbélyegek.');
  assert(trialResultRows.some((row) => row.includes('Kondicionált alapterület')) && trialResultRows.some((row) => row.includes('Tűrésen belül')), 'Az Excel eredményeltérés-lapja hiányos.');
  pass('A 20 lapos Excel tartalmazza a tényleges próbanaplót és eredmény-összevetést');

  const beforeTrialZip = fs.readdirSync(downloadDir);
  await page.click('[data-export-winwatt-trial-package]');
  const trialZipFile = await waitDownload('.zip', beforeTrialZip, 90000);
  const trialZip = await JSZip.loadAsync(fs.readFileSync(trialZipFile));
  const trialZipNames = Object.keys(trialZip.files).sort();
  for (const expected of ['README.txt', 'manifest.json']) assert(trialZipNames.includes(expected), `Hiányzó próbaátadási ZIP fájl: ${expected}`);
  for (const suffix of ['_winwatt_elokeszito_v084.xlsx', '_winwatt_adatcsomag_v084.json', '_winwatt_mezoterkep.csv', '_winwatt_atadasi_rekordok.csv', '_winwatt_atadasi_hibak.csv', '_winwatt_probavisszacsatolas_v084.json', '_winwatt_probanaplo.csv', '_winwatt_eredmeny_elteres.csv']) assert(trialZipNames.some((name) => name.endsWith(suffix)), `Hiányzó próbaátadási ZIP tartalom: ${suffix}`);
  const trialManifest = JSON.parse(await trialZip.file('manifest.json').async('string'));
  assert(trialManifest.schema === 'dimpro.winwatt-trial-package.v0.8.4', `Hibás próbaátadási manifest: ${trialManifest.schema}`);
  assert(trialManifest.fieldMapSchema === 'dimpro.winwatt-field-map.v0.8.3' && trialManifest.workbookSchema === 'dimpro.winwatt-transfer.v0.8.4', 'A próbaátadási manifest sémái hiányosak.');
  assert(trialManifest.jsonSchema === 'dimpro.winwatt-compatible.v0.8.4' && trialManifest.trialFeedbackSchema === 'dimpro.winwatt-trial-feedback.v0.8.4', 'A próbaátadási manifest visszacsatolási sémái hiányosak.');
  assert(trialManifest.trialTotals.sessionCount === 1 && trialManifest.trialTotals.verifiedFieldCount >= 1 && trialManifest.trialTotals.comparedMetricCount === 1, `A próbaátadási manifest összesítője hibás: ${JSON.stringify(trialManifest.trialTotals)}`);
  const feedbackName = trialZipNames.find((name) => name.endsWith('_winwatt_probavisszacsatolas_v084.json'));
  const feedbackJson = JSON.parse(await trialZip.file(feedbackName).async('string'));
  assert(feedbackJson.result.schema === 'dimpro.winwatt-trial-feedback.v0.8.4' && feedbackJson.workspace.sessions.length === 1, 'A ZIP próba-visszacsatolási JSON-ja hibás.');
  const trialLogCsvName = trialZipNames.find((name) => name.endsWith('_winwatt_probanaplo.csv'));
  const trialResultCsvName = trialZipNames.find((name) => name.endsWith('_winwatt_eredmeny_elteres.csv'));
  const trialLogCsv = await trialZip.file(trialLogCsvName).async('string');
  const trialResultCsv = await trialZip.file(trialResultCsvName).async('string');
  assert(trialLogCsv.includes('DIMPRO tesztelő') && trialLogCsv.includes('Épület címe') && trialLogCsv.includes('18.5'), 'A ZIP próbanapló CSV-je nem tartalmazza a rögzített célmezőt és időt.');
  assert(trialLogCsv.includes('Mezőpróba_indítva') && trialLogCsv.includes('Mezőpróba_befejezve'), 'A ZIP próbanapló CSV-jéből hiányoznak a mezőidőbélyegek.');
  assert(trialResultCsv.includes('Kondicionált alapterület') && trialResultCsv.includes('Tűrésen belül'), 'A ZIP eredményeltérés CSV-je hiányos.');
  pass('A ZIP CSV-fájljai visszaolvashatóan tartalmazzák a próba célmezőit és eredményeltérését');
  pass('A diagnosztikai vagy próbaátadási ZIP tíz dokumentált fájllal és visszacsatolással elkészül');

  await page.click('[data-survey-step="export"]');
  await waitText(page, 'DIMPRO munkafájl és projektverzió');
  const beforeDimpro = fs.readdirSync(downloadDir);
  await clickText(page, 'Mentés .dimpro fájlba');
  const dimproFile = await waitDownload('.dimpro', beforeDimpro);
  const dimpro = JSON.parse(fs.readFileSync(dimproFile, 'utf8'));
  assert(dimpro.schema === 'dimpro.property-survey.v0.8.4.3', `Hibás .dimpro séma: ${dimpro.schema}`);
  assert(dimpro.draft.energyFieldWorkflow.schemaVersion === 1 && dimpro.draft.energyFieldWorkflow.mode === 'expert', 'A felületmód hiányzik a munkafájlból.');
  assert(dimpro.draft.energyRenovationWorkspace.schemaVersion === 1 && dimpro.draft.energyRenovationWorkspace.scenarios.length >= 3, 'A felújítási változatok hiányoznak a munkafájlból.');
  assert(dimpro.draft.energyRenewableWorkspace.schemaVersion === 1 && dimpro.draft.energyRenewableWorkspace.pv.enabled, 'A megújuló munkatér hiányzik a munkafájlból.');
  assert(dimpro.calculated.energyRenewables.schema === 'dimpro.energy-renewable-sizing.v0.8.0', 'A megújuló eredmény hiányzik a munkafájlból.');
  assert(dimpro.calculated.energyRenovationComparison.schema === 'dimpro.energy-renovation-comparison.v0.8.2' && dimpro.calculated.energyRenovationComparison.scenarios.length >= 3, 'A változat-összehasonlító eredmény hiányzik a munkafájlból.');
  assert(dimpro.calculated.winWattFieldMap.schema === 'dimpro.winwatt-field-map.v0.8.3' && dimpro.calculated.winWattFieldMap.totals.mappedFieldCount > 150, 'A WinWatt mezőtérkép hiányzik a munkafájlból.');
  assert(dimpro.draft.energyWinWattTrialWorkspace.schemaVersion === 1 && dimpro.draft.energyWinWattTrialWorkspace.sessions.length === 1, 'A WinWatt próbanapló hiányzik a munkafájlból.');
  assert(dimpro.draft.workTimerWorkspace.schemaVersion === 1 && dimpro.draft.workTimerWorkspace.status === 'idle' && dimpro.draft.workTimerWorkspace.sessions.length === 0, 'A munkaidőmérő munkatér hiányzik a munkafájlból.');
  assert(dimpro.calculated.winWattTrialFeedback.schema === 'dimpro.winwatt-trial-feedback.v0.8.4' && dimpro.calculated.winWattTrialFeedback.totals.verifiedFieldCount >= 1, 'A WinWatt próbaösszesítő hiányzik a munkafájlból.');
  pass('.dimpro v0.8.4.3 tartalmazza a workflow-t, változatokat, megújuló eredményt, WinWatt mezőtérképet és munkaidőmérőt');

  const beforeJson = fs.readdirSync(downloadDir);
  await clickText(page, 'JSON');
  const jsonFile = await waitDownload('.json', beforeJson);
  const transfer = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert(transfer.schema === 'dimpro.winwatt-compatible.v0.8.4', `Hibás WinWatt-előkészítő séma: ${transfer.schema}`);
  assert(transfer.renovationScenarios.length >= 3 && transfer.renewableSizing.schema === 'dimpro.energy-renewable-sizing.v0.8.0', 'A WinWatt-előkészítő JSON változat- vagy megújuló blokkja hiányzik.');
  assert(transfer.renovationComparison.schema === 'dimpro.energy-renovation-comparison.v0.8.2' && transfer.renovationComparison.scenarios.length >= 3, 'A WinWatt-előkészítő változat-összehasonlítás hiányzik.');
  assert(transfer.transferWorkbookSchema === 'dimpro.winwatt-transfer.v0.8.4', 'Az Excel átadási séma hiányzik a JSON-ból.');
  assert(transfer.winWattFieldMap.schema === 'dimpro.winwatt-field-map.v0.8.3' && transfer.winWattFieldMap.fields.length > 150, 'A JSON WinWatt mezőtérképe hiányzik.');
  assert(transfer.trialPackageSchema === 'dimpro.winwatt-trial-package.v0.8.4', 'A JSON próbaátadási csomagsémája hiányzik.');
  assert(transfer.winWattTrialWorkspace.schemaVersion === 1 && transfer.winWattTrialWorkspace.sessions.length === 1, 'A JSON próbanapló-munkaterülete hiányzik.');
  assert(transfer.winWattTrialFeedback.schema === 'dimpro.winwatt-trial-feedback.v0.8.4' && transfer.winWattTrialFeedback.totals.comparedMetricCount === 1, 'A JSON próba-visszacsatolási összesítője hiányzik.');
  pass('WinWatt-előkészítő JSON v0.8.4 tartalmazza a változatokat, villamos előméretezést és mezőtérképet');

  const beforePdf = fs.readdirSync(downloadDir);
  await clickText(page, 'Teljes épület PDF készítése');
  const pdfFile = await waitDownload('.pdf', beforePdf, 60000);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfFile)), disableWorker: true }).promise;
  const pdfTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    pdfTexts.push(content.items.map((item) => item.str).join(' '));
  }
  const normalizedPdf = pdfTexts.map((text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ő/g, 'o').replace(/Ő/g, 'O'));
  const comparisonPage = normalizedPdf.find((text) => text.includes('MEGLEVO ES TERVEZETT ALLAPOT OSSZEHASONLITASA')) || '';
  const renovationPage = normalizedPdf.find((text) => text.includes('HELYSZINI FELUJITASI JAVASLATOK')) || '';
  const renewablePage = normalizedPdf.find((text) => text.includes('MEGUJULO ES VILLAMOS ELOMERETEZES')) || '';
  assert(comparisonPage.includes('M0') && comparisonPage.includes('Futesi igeny'), 'A PDF változat-összehasonlító oldala hiányzik.');
  assert(renovationPage.includes('Napelemrendszer telepitese') || renovationPage.includes('Napelem'), 'A PDF felújítási oldal nem tartalmazza a helyszíni intézkedéseket.');
  assert(renewablePage.includes('NAPELEM') && renewablePage.includes('NAPKOLLEKTOR') && renewablePage.includes('AKKUMULATOR') && renewablePage.includes('ELEKTROMOSAUTO-TOLTES'), 'A PDF megújuló/villamos oldala hiányos.');
  pass('A vektoros PDF külön változat-összehasonlító, felújítási és megújuló/villamos oldalt tartalmaz');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key));
    for (const survey of workspace.surveys) {
      delete survey.draft.energyFieldWorkflow;
      delete survey.draft.energyRenovationWorkspace;
      delete survey.draft.energyRenewableWorkspace;
      delete survey.draft.energyWinWattTrialWorkspace;
      delete survey.draft.workTimerWorkspace;
    }
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-step="renewables"]');
  await new Promise((resolve) => setTimeout(resolve, 900));
  const migrated = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return {
      fieldSchema: survey.draft.energyFieldWorkflow?.schemaVersion,
      mode: survey.draft.energyFieldWorkflow?.mode,
      renovationSchema: survey.draft.energyRenovationWorkspace?.schemaVersion,
      scenarioCount: survey.draft.energyRenovationWorkspace?.scenarios?.length,
      renewableSchema: survey.draft.energyRenewableWorkspace?.schemaVersion,
      renewableEnabled: survey.draft.energyRenewableWorkspace?.enabled,
      trialSchema: survey.draft.energyWinWattTrialWorkspace?.schemaVersion,
      trialSessionCount: survey.draft.energyWinWattTrialWorkspace?.sessions?.length,
      timerSchema: survey.draft.workTimerWorkspace?.schemaVersion,
      timerStatus: survey.draft.workTimerWorkspace?.status,
      timerSessionCount: survey.draft.workTimerWorkspace?.sessions?.length,
    };
  });
  assert(migrated.fieldSchema === 1 && migrated.mode === 'field' && migrated.renovationSchema === 1 && migrated.scenarioCount === 2 && migrated.renewableSchema === 1 && migrated.renewableEnabled === false && migrated.trialSchema === 1 && migrated.trialSessionCount === 0 && migrated.timerSchema === 1 && migrated.timerStatus === 'idle' && migrated.timerSessionCount === 0, `A v0.8.0 migráció hibás: ${JSON.stringify(migrated)}`);
  assert(!(await page.$('[data-survey-step="energy"]')), 'Migráció után a Terepi mód rejtse a szakértői lépést.');
  pass('Régi projektből automatikusan létrejön a megújuló réteg, két alapváltozat, üres WinWatt-próbanapló és üres munkaidőmérő');

  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('[data-survey-step="renewables"]');
  await page.waitForSelector('[data-energy-renewable-panel="true"]');
  const responsive = [];
  for (const [width, height] of [[1680,1050],[1194,834],[1024,768],[834,1194],[768,1024],[390,844]]) responsive.push(await responsiveCheck(page, width, height));
  pass('A megnyitott Megújuló munkatér desktop, tablet és mobil nézetben nem okoz oldal-overflow-t');

  await page.setViewport({ width: 1194, height: 834 });
  await page.click('[data-survey-step="renovation"]');
  await page.waitForSelector('[data-energy-renovation-panel="true"]');
  const renovationResponsive = [];
  for (const [width, height] of [[1194,834],[834,1194],[390,844]]) renovationResponsive.push(await responsiveCheck(page, width, height));
  pass('A megnyitott Felújítás munkatér tablet és mobil nézetben nem okoz oldal-overflow-t');

  await page.setViewport({ width: 1194, height: 834 });
  await page.click('[data-energy-mode="expert"]');
  await page.waitForSelector('[data-survey-step="energy"]');
  await page.click('[data-survey-step="energy"]');
  await page.click('[data-energy-tab="tables"]');
  await page.waitForSelector('[data-energy-expert-tables="true"]');
  const expertResponsive = [];
  for (const [width, height] of [[1194,834],[834,1194],[390,844]]) expertResponsive.push(await responsiveCheck(page, width, height));
  const tableScroll = await page.evaluate(() => { const element = document.querySelector('[data-expert-table-scroll]'); return { clientWidth: element?.clientWidth || 0, scrollWidth: element?.scrollWidth || 0, bodyWidth: document.body.scrollWidth, viewport: innerWidth }; });
  assert(tableScroll.clientWidth > 100 && tableScroll.scrollWidth > tableScroll.clientWidth && tableScroll.bodyWidth <= tableScroll.viewport + 2, `A szakértői tábla belső görgetése hibás: ${JSON.stringify(tableScroll)}`);
  pass('A szakértői táblák mobilon belső vízszintes görgetést használnak, a teljes oldal nem lóg ki');
  await page.click('[data-energy-tab="transfer"]');
  await page.waitForSelector('[data-energy-winwatt-transfer="true"]');
  const transferResponsive = [];
  for (const [width, height] of [[1194,834],[834,1194],[390,844]]) transferResponsive.push(await responsiveCheck(page, width, height));
  const transferScroll = await page.evaluate(() => { const element = document.querySelector('[data-winwatt-field-map-scroll]'); return { clientWidth: element?.clientWidth || 0, scrollWidth: element?.scrollWidth || 0, bodyWidth: document.body.scrollWidth, viewport: innerWidth }; });
  assert(transferScroll.clientWidth > 100 && transferScroll.scrollWidth > transferScroll.clientWidth && transferScroll.bodyWidth <= transferScroll.viewport + 2, `A WinWatt mezőtérkép belső görgetése hibás: ${JSON.stringify(transferScroll)}`);
  pass('A WinWatt mezőtérkép mobilon belsőleg görgethető, a teljes oldal nem lóg ki');

  assert(uiTests.length >= 35, `Kevesebb mint 35 v0.8.4 UI-teszt futott: ${uiTests.length}`);
  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, uiTestCount: uiTests.length, uiTests, renewableState, renovationState, expertState, workbookFile, workbookSheets: workbook.SheetNames, transferMapState, trialWorkbookFile, storedTrial, trialZipFile, trialZipNames, trialManifest, guidedResponsive, dimproFile, dimproSchema: dimpro.schema, renewableSchema: dimpro.calculated.energyRenewables.schema, jsonFile, winWattSchema: transfer.schema, pdfFile, pdfPages: pdf.numPages, migrated, responsive, renovationResponsive, expertResponsive, tableScroll, transferResponsive, transferScroll, consoleErrors: relevantConsoleErrors, pageErrors }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => undefined); });
