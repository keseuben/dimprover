const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3028/ingatlanfelmero';
const screenshotDir = process.env.DIMPRO_TEST_SCREENSHOT_DIR || '/tmp/dimpro_energy_v0841_screenshots';
fs.rmSync(screenshotDir, { recursive: true, force: true });
fs.mkdirSync(screenshotDir, { recursive: true });

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
async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V0841 responsive munkatér teszt');
  await page.type('input[placeholder="Projektkód"]', 'V0841');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Vizuális Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V0841 responsive munkatér teszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('V0841 szakértői munkatér mintafelmérés');
  await (await dialog.$('select')).select('Energetikai felmérés');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await page.waitForSelector('[data-energy-mode="expert"]', { timeout: 30000 });
}
async function viewport(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(450);
  const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(size.body <= width + 2 && size.html <= width + 2, `Teljes oldali vízszintes overflow ${width}×${height}: ${JSON.stringify(size)}`);
  return size;
}
async function bounds(page, selector) {
  return page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom, display: style.display, visibility: style.visibility, overflowX: style.overflowX, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
  });
}
async function assertVisibleInsideViewport(page, selector, label) {
  const rect = await bounds(page, selector);
  const viewportSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert(rect.width > 20 && rect.height > 20 && rect.x >= -1 && rect.right <= viewportSize.width + 1 && rect.y >= -1 && rect.bottom <= viewportSize.height + 2, `${label} levágódik: ${JSON.stringify({ rect, viewportSize })}`);
  return rect;
}
async function screenshot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

let browser;
(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP dimpro.hu 127.0.0.1'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await viewport(page, 1920, 1080);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek');
  await createProjectAndSurvey(page);
  await page.click('[data-energy-mode="expert"]');
  await page.waitForSelector('[data-survey-step="energy"]');
  await page.click('[data-survey-step="energy"]');
  await page.waitForSelector('[data-energy-central-workspace][data-energy-central-mode="data"]');
  pass('A Szakértői energetika lépés közvetlenül a központi Adatok nézetet nyitja meg');

  const centralData = await bounds(page, '[data-energy-central-data]');
  assert(centralData.width >= 900, `A központi szakértői adatlap túl keskeny 1920 px-en: ${centralData.width}`);
  assert(await page.$('[data-energy-summary-board]'), 'A kompakt jobb oldali energetikai board hiányzik.');
  const boardContainsDetailed = await page.$eval('[data-energy-summary-board]', (board) => Boolean(board.querySelector('[data-energy-workspace-content], [data-energy-expert-tables], [data-energy-winwatt-transfer]')));
  assert(!boardContainsDetailed, 'A jobb board továbbra is részletes szakértői űrlapot vagy táblát tartalmaz.');
  await assertVisibleInsideViewport(page, '[data-energy-open-central-workspace]', 'Központi munkatér gomb');
  const boardNavigation = await page.$$eval('[data-energy-board-tab]', (elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height, text: (element.textContent || '').trim() }; }));
  assert(boardNavigation.length === 10 && boardNavigation.every((item) => item.width >= 100 && item.height >= 40 && item.text.length > 0), `A jobb board navigációja levágott vagy hiányos: ${JSON.stringify(boardNavigation)}`);
  pass('A jobb board mind a tíz energetikai navigációs gombja olvasható és megfelelő érintési méretű');
  pass('A részletes energetikai tartalom központi, széles munkafelületen jelenik meg, a jobb board csak navigál');

  const tabsToCheck = [
    ['geometry', '[data-energy-workspace-content="geometry"]'],
    ['openings', '[data-energy-workspace-content="openings"]'],
    ['demand', '[data-energy-workspace-content="demand"]'],
    ['tables', '[data-energy-expert-tables="true"]'],
    ['transfer', '[data-energy-winwatt-transfer="true"]'],
    ['status', '[data-energy-workspace-content="status"]'],
  ];
  for (const [tab, content] of tabsToCheck) {
    await page.click(`[data-energy-tab="${tab}"]`);
    await page.waitForSelector(content);
    const pane = await bounds('[data-energy-central-data]' ? page : page, '[data-energy-central-data]');
    assert(pane.width >= 900, `A ${tab} munkalap központi panelje túl keskeny: ${pane.width}`);
  }
  pass('A geometria, nyílászárók, zónaterhelés, szakértői táblák, WinWatt és állapot központi munkalapon használható');

  assert(await page.$$eval('[data-energy-quick-card]', (elements) => elements.length) >= 5, 'Az energetikai gyorskártyák hiányoznak.');
  const quickCardTitle = await page.$eval('[data-energy-quick-card="openings"]', (element) => element.getAttribute('title'));
  assert(quickCardTitle && quickCardTitle.includes('nyílászárók'), 'A gyorskártya hover-magyarázata hiányzik.');
  await page.click('[data-energy-quick-card="openings"]');
  await page.waitForSelector('[data-energy-workspace-content="openings"]');
  pass('A hoverrel magyarázott és koppintással működő gyorskártyák a megfelelő teljes munkalapot nyitják meg');

  await page.click('[data-energy-view-mode="plan"]');
  await page.waitForSelector('[data-energy-central-workspace][data-energy-central-mode="plan"] [data-survey-focus-engine="false"]');
  await page.click('[data-energy-view-mode="split"]');
  await page.waitForSelector('[data-energy-central-split]');
  const splitPlan = await bounds(page, '[data-energy-central-plan-pane]');
  const splitData = await bounds(page, '[data-energy-central-data-pane]');
  assert(splitPlan.width >= 500 && splitData.width >= 500, `Az asztali osztott nézet paneljei túl keskenyek: ${JSON.stringify({ splitPlan, splitData })}`);
  pass('A Rajz, Adatok és Osztott nézet asztali képernyőn külön és együtt is használható');
  const desktopScreenshot = await screenshot(page, '1920x1080_split');

  await viewport(page, 1366, 768);
  await page.click('[data-energy-view-mode="data"]');
  await page.waitForSelector('[data-energy-central-workspace][data-energy-central-mode="data"]');
  const laptopCentral = await bounds(page, '[data-energy-central-data]');
  assert(laptopCentral.width >= 700, `A laptop központi adatlap túl keskeny: ${laptopCentral.width}`);
  const laptopScreenshot = await screenshot(page, '1366x768_data');
  pass('A laptopnézet központi adatlapja nem szorul a korábbi keskeny jobb panelbe');

  await viewport(page, 1194, 834);
  const tabletLandscapeCentral = await bounds(page, '[data-energy-central-data]');
  assert(tabletLandscapeCentral.width >= 850, `A fekvő tablet adatlapja túl keskeny: ${tabletLandscapeCentral.width}`);
  const tabletLandscapeScreenshot = await screenshot(page, '1194x834_data');
  pass('A fekvő tablet teljes szélességű központi szakértői adatlapot használ');

  await viewport(page, 834, 1194);
  const tabletPortraitCentral = await bounds(page, '[data-energy-central-data]');
  assert(tabletPortraitCentral.width >= 730, `Az álló tablet adatlapja túl keskeny: ${tabletPortraitCentral.width}`);
  const visibleTabButtons = await page.$$eval('[data-energy-tab]', (elements) => elements.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width >= 100 && rect.height >= 40 && rect.right <= innerWidth + 1; }).length);
  assert(visibleTabButtons >= 8, `Túl kevés használható energetikai fül álló tableten: ${visibleTabButtons}`);
  const tabletPortraitScreenshot = await screenshot(page, '834x1194_data');
  pass('Az álló tablet külön, teljes szélességű adatnézetet és nagy érintési célokat kap');

  await viewport(page, 390, 844);
  const mobileCentral = await bounds(page, '[data-energy-central-data]');
  assert(mobileCentral.width >= 350, `A mobil adatlap túl keskeny: ${mobileCentral.width}`);
  await page.click('[data-energy-tab="transfer"]');
  await page.waitForSelector('[data-winwatt-field-map-scroll]');
  const mobileTable = await page.$eval('[data-winwatt-field-map-scroll]', (element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, bodyWidth: document.body.scrollWidth, viewport: innerWidth }));
  assert(mobileTable.scrollWidth > mobileTable.clientWidth && mobileTable.bodyWidth <= mobileTable.viewport + 2, `A mobil WinWatt tábla görgetése hibás: ${JSON.stringify(mobileTable)}`);
  const mobileScreenshot = await screenshot(page, '390x844_transfer');
  pass('Mobilon a széles táblázat saját paneljén belül görgethető, a teljes oldal nem lóg ki');

  await viewport(page, 1920, 1080);
  await page.click('[data-energy-tab="geometry"]');
  await page.click('[data-survey-work-timer-toggle]');
  await page.waitForSelector('[data-survey-work-timer-panel]');
  await sleep(2200);
  const runningValue = await page.$eval('[data-survey-work-timer-summary="current"]', (element) => element.textContent || '');
  assert(!runningValue.includes('00:00:00'), `A stopper nem indult el: ${runningValue}`);
  const timerSummaries = await page.$$eval('[data-survey-work-timer-summary]', (elements) => elements.map((element) => ({ key: element.getAttribute('data-survey-work-timer-summary'), text: element.textContent || '', width: element.getBoundingClientRect().width })));
  assert(timerSummaries.length === 3 && timerSummaries.every((item) => item.width >= 80 && item.text.length > 0), `A stopper összesítői hiányosak: ${JSON.stringify(timerSummaries)}`);
  pass('A stopper aktuális, mai és teljes felmérési ideje külön, olvasható kártyán jelenik meg');
  await page.click('[data-survey-work-timer-action="pause"]');
  await page.waitForSelector('[data-survey-work-timer-action="resume"]');
  const pausedValue = await page.$eval('[data-survey-work-timer-summary="current"]', (element) => element.textContent || '');
  await sleep(1300);
  const pausedValueAfter = await page.$eval('[data-survey-work-timer-summary="current"]', (element) => element.textContent || '');
  assert(pausedValue === pausedValueAfter, 'A szüneteltetett stopper tovább számolt.');
  await page.click('[data-survey-work-timer-action="resume"]');
  await page.click('[data-survey-step="plan"]');
  await page.waitForFunction(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1') || '{}');
    const survey = workspace.surveys?.find((item) => item.id === workspace.activeSurveyId);
    const timer = survey?.draft?.workTimerWorkspace;
    return timer?.status === 'running' && timer?.sessions?.[0]?.segments?.length >= 2;
  }, { timeout: 30000 });
  await sleep(350);
  const storedRunning = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.workTimerWorkspace;
  });
  assert(storedRunning.status === 'running' && storedRunning.sessions.length === 1 && storedRunning.sessions[0].segments.length >= 2, `A stopper munkalapváltása nem mentődött: ${JSON.stringify(storedRunning)}`);
  pass('A stopper kézzel indítható, szüneteltethető, folytatható és munkalaponként szakaszol');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-survey-work-timer-toggle]');
  const timerStatusAfterReload = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.workTimerWorkspace.status;
  });
  assert(timerStatusAfterReload === 'running', `Újratöltés után nem folytatódott a stopper: ${timerStatusAfterReload}`);
  await page.click('[data-survey-work-timer-toggle]');
  await page.waitForSelector('[data-survey-work-timer-action="finish"]');
  await page.click('[data-survey-work-timer-action="finish"]');
  await sleep(600);
  const storedFinished = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.workTimerWorkspace;
  });
  assert(storedFinished.status === 'idle' && !storedFinished.activeSessionId && storedFinished.sessions[0].status === 'completed', `A stopper lezárása hibás: ${JSON.stringify(storedFinished)}`);
  pass('A stopper oldalfrissítés után folytatódik, majd lezárva a felmérés munkafájljában marad');

  await page.click('[data-energy-mode="expert"]');
  await page.click('[data-survey-step="energy"]');
  await page.waitForSelector('[data-energy-central-workspace]');
  await page.click('[data-survey-focus-enter]');
  await page.waitForSelector('[data-survey-focus-mode="true"]');
  await page.waitForSelector('[data-energy-focus-data]');
  const focusViewSwitches = await page.$$eval('[data-energy-central-view-switch] [data-energy-view-mode]', (elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { mode: element.getAttribute('data-energy-view-mode'), width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 }; }));
  assert(focusViewSwitches.length >= 3 && ['plan','data','split'].every((mode) => focusViewSwitches.some((item) => item.mode === mode && item.visible && item.height >= 34)), `A fókusz nézetváltó hiányos: ${JSON.stringify(focusViewSwitches)}`);
  pass('A teljes képernyős Rajz, Adatok és Osztott kapcsolók láthatók és érintéssel használhatók');
  await page.click('[data-focus-open-right]');
  await page.waitForFunction(() => document.querySelector('[data-focus-panel="right"]')?.classList.contains('is-open'));
  const focusBoardOnly = await page.$eval('[data-focus-panel="right"]', (panel) => ({ summary: Boolean(panel.querySelector('[data-energy-summary-board]')), detailed: Boolean(panel.querySelector('[data-energy-expert-tables], [data-energy-winwatt-transfer], [data-energy-workspace-content]')) }));
  assert(focusBoardOnly.summary && !focusBoardOnly.detailed, `A fókusz jobb panel nem kompakt board: ${JSON.stringify(focusBoardOnly)}`);
  const splitClicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-energy-view-mode="split"]')].find((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    if (!button) return false;
    button.click();
    return true;
  });
  assert(splitClicked, 'A teljes képernyős Osztott nézet látható gombja nem található.');
  await page.waitForSelector('[data-energy-focus-split]');
  const focusPlan = await bounds(page, '[data-energy-focus-plan-pane]');
  const focusData = await bounds(page, '[data-energy-focus-data-pane]');
  assert(focusPlan.width > 500 && focusData.width > 450, `A teljes képernyős osztott nézet hibás: ${JSON.stringify({ focusPlan, focusData })}`);
  const focusScreenshot = await screenshot(page, '1920x1080_focus_split');
  pass('Teljes képernyőn a jobb panel csak board, a rajz és a szakértői adatlap központi osztott nézetben jelenik meg');

  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);
  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  assert(testCount >= 15, `Túl kevés v0.8.4.1 vizuális teszt futott: ${testCount}`);

  console.log(JSON.stringify({
    ok: true,
    testCount,
    tests,
    buildExpected: 'v0.8.4.1',
    centralWidths: { desktop: centralData.width, laptop: laptopCentral.width, tabletLandscape: tabletLandscapeCentral.width, tabletPortrait: tabletPortraitCentral.width, mobile: mobileCentral.width },
    splitWidths: { normalPlan: splitPlan.width, normalData: splitData.width, focusPlan: focusPlan.width, focusData: focusData.width },
    timer: { runningValue, pausedValue, segments: storedRunning.sessions[0].segments.length, finalStatus: storedFinished.status },
    screenshots: [desktopScreenshot, laptopScreenshot, tabletLandscapeScreenshot, tabletPortraitScreenshot, mobileScreenshot, focusScreenshot],
    consoleErrors: relevantConsoleErrors,
    pageErrors,
  }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => undefined); });
