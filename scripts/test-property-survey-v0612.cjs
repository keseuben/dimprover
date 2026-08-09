const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3016/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_v0612_downloads';
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

async function extractPdfPages(pdfFile) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfFile)), disableWorker: true });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim());
  }
  return pages;
}

async function createProjectAndSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V0612 rajzlap tesztprojekt');
  await page.type('input[placeholder="Projektkód"]', 'V0612-TEST');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány, Deák Ferenc utca 4.');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'DIMPRO Teszt Megrendelő Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V0612 rajzlap tesztprojekt');
  await clickText(page, 'Új felmérés');
  await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const dialog = await page.$('[role="dialog"][aria-label="Új felmérés"]');
  const nameInput = (await dialog.$$('input'))[0];
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('V0612 energetikai mintafelmérés');
  await (await dialog.$('select')).select('Energetikai felmérés');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await waitText(page, 'DIMPRO Felmérő');
  await page.waitForSelector('svg[data-survey-export-svg="true"]');
}

async function responsiveCheck(page, viewport) {
  await page.setViewport(viewport);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const widths = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(widths.body <= widths.viewport + 2 && widths.html <= widths.viewport + 2, `Vízszintes overflow ${viewport.width}px nézetben: ${JSON.stringify(widths)}`);
  return widths;
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
  await page.setViewport({ width: 1680, height: 1050 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek', 30000);
  await createProjectAndSurvey(page);

  const sheetState = await page.$eval('svg[data-survey-export-svg="true"]', (svg) => {
    const titleBlock = svg.querySelector('[data-survey-title-block="true"]');
    const infoBlock = svg.querySelector('[data-survey-plan-info-block="true"]');
    const fullText = svg.textContent || '';
    const topPaperLabel = [...svg.querySelectorAll('text')].some((element) => /^A[234]\s*·\s*\d+\s*×\s*\d+\s*mm/i.test((element.textContent || '').trim()));
    return {
      titleText: titleBlock?.textContent || '',
      infoText: infoBlock?.textContent || '',
      hasInfoBlock: Boolean(infoBlock),
      legendCount: infoBlock?.querySelectorAll('[data-survey-legend-item]').length || 0,
      areaSummaryCount: infoBlock?.querySelectorAll('[data-survey-area-summary]').length || 0,
      topPaperLabel,
      fullText,
    };
  });
  assert(!sheetState.topPaperLabel, 'A rajzlap bal felső sarkában továbbra is látszik a lapméret-felirat.');
  for (const required of ['MEGRENDELŐ', 'DIMPRO Teszt', 'Megrendelő', 'Kft.', 'RAJZVERZIÓ', 'v001', 'SZINT', 'Földszint', 'LÉPTÉK']) {
    assert(sheetState.titleText.includes(required), `A rajzadat-fejlécből hiányzik: ${required}`);
  }
  assert(!sheetState.titleText.includes('LAP / LÉPTÉK'), 'A fejlécben megmaradt a felesleges lapméret mező.');
  assert(sheetState.hasInfoBlock && sheetState.legendCount === 8, 'A rajzlapi jelmagyarázat hiányos.');
  assert(sheetState.areaSummaryCount === 4, 'Az alapterület-összesítő négy alapadata hiányzik.');
  for (const required of ['JELMAGYARÁZAT', 'ALAPTERÜLET-ÖSSZESÍTŐ', 'Fűtött', 'Fűtetlen', 'Összesen', 'Helyiségek']) {
    assert(sheetState.infoText.includes(required), `A rajzlapi információs blokkból hiányzik: ${required}`);
  }

  await page.screenshot({ path: '/tmp/dimpro_v0612_sheet_desktop.png', fullPage: true });
  await page.click('[data-survey-step="export"]');
  await waitText(page, 'Többoldalas vektoros PDF');
  const previous = fs.readdirSync(downloadDir);
  await clickText(page, 'Teljes épület PDF készítése');
  const pdfFile = await waitDownload('.pdf', previous);
  assert(fs.statSync(pdfFile).size > 6000, 'A PDF túl kicsi vagy üres.');
  const pdfPages = await extractPdfPages(pdfFile);
  assert(pdfPages.length >= 3, `A PDF oldalszáma túl kevés: ${pdfPages.length}`);
  const planPage = pdfPages[1] || '';
  assert(!planPage.includes('FSZ - Földszint'), 'A PDF rajzoldal tetején megmaradt az FSZ - Földszint cím.');
  assert(!planPage.includes('V0612 rajzlap tesztprojekt / V0612 energetikai mintafelmérés'), 'A PDF rajzoldal tetején megmaradt a projekt/felmérés alcím.');
  for (const required of ['MEGRENDELO', 'DIMPRO Teszt', 'Megrendelo', 'Kft.', 'RAJZVERZIO', 'v001', 'SZINT', 'Földszint', 'JELMAGYARAZAT', 'ALAPTERULET-OSSZESITO', 'Futott', 'Futetlen', 'Osszesen']) {
    assert(planPage.includes(required), `A PDF rajzoldalból hiányzik: ${required}`);
  }

  const responsive = [];
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) responsive.push(await responsiveCheck(page, viewport));

  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, pdfFile, sheetState, pdfPages: pdfPages.map((text, index) => ({ page: index + 1, text: text.slice(0, 1200) })), responsive, screenshot: '/tmp/dimpro_v0612_sheet_desktop.png', consoleErrors: relevantConsoleErrors, pageErrors }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
});
