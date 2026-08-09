const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3016/ingatlanfelmero';
const downloadDir = process.env.DIMPRO_TEST_DOWNLOAD_DIR || '/tmp/dimpro_v061_downloads';
fs.rmSync(downloadDir, { recursive: true, force: true });
fs.mkdirSync(downloadDir, { recursive: true });
const testPhotoPath = path.join(downloadDir, 'dimpro-test-photo.svg');
fs.writeFileSync(testPhotoPath, '<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1400" viewBox="0 0 2200 1400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#d1fae5"/></linearGradient></defs><rect width="2200" height="1400" fill="url(#g)"/><path d="M120 1180 L620 380 L1080 860 L1540 260 L2080 1180 Z" fill="#ffffff" fill-opacity="0.7"/><text x="1100" y="1260" text-anchor="middle" font-size="150" font-family="Arial" font-weight="700" fill="#0f172a">DIMPRO TEST</text></svg>');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const elements = [...document.querySelectorAll(selector)];
    const target = elements.find((element) => (element.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
    if (!target) return false;
    target.click();
    return true;
  }, { text, selector });
  assert(clicked, `Nem található kattintható elem: ${text}`);
}

async function waitText(page, text, timeout = 10000) {
  await page.waitForFunction((wanted) => document.body.innerText.includes(wanted), { timeout }, text);
}

async function waitDownload(extension, previous = [], timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const files = fs.readdirSync(downloadDir).filter((file) => file.endsWith(extension) && !file.endsWith('.crdownload') && !previous.includes(file));
    if (files.length) return path.join(downloadDir, files[0]);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Nem készült el a letöltés: ${extension}`);
}

async function createProjectAndSurvey(page, { projectName, surveyName, surveyMode }) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', projectName);
  await page.type('input[placeholder="Projektkód"]', 'V061-TEST');
  await page.type('input[placeholder="Település / helyszín"]', '4150 Püspökladány, Deák Ferenc utca 4., hrsz 799');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'V061 Teszt Megrendelő Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, projectName);
  await clickText(page, 'Új felmérés');
  await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const dialog = await page.$('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  assert(inputs.length > 0, 'A felmérésnév mező nem található.');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(surveyName);
  const select = await dialog.$('select');
  await select.select(surveyMode);
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await waitText(page, 'DIMPRO Felmérő');
  await page.waitForSelector('svg[data-survey-export-svg="true"]');
}

async function drawSection(page, constraint = 'free') {
  await page.click('[data-survey-step="section"]');
  await waitText(page, 'Közös metszeti felmérés');
  await page.click(`[data-section-constraint="${constraint}"]`);
  const constraintPressed = await page.$eval(`[data-section-constraint="${constraint}"]`, (element) => element.getAttribute('aria-pressed'));
  assert(constraintPressed === 'true', `A(z) ${constraint} metszeti iránysegéd nem aktiválódott.`);
  const beforeCount = await page.$$eval('[data-survey-section-line="true"]', (elements) => elements.length);
  await clickText(page, 'Metszetvonal rajzolása');
  const svg = await page.$('svg[data-survey-export-svg="true"]');
  await svg.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const box = await svg.boundingBox();
  assert(box, 'A rajzlap mérete nem olvasható.');
  const points = constraint === 'vertical'
    ? { startX: 0.42, startY: 0.26, endX: 0.58, endY: 0.74 }
    : constraint === 'horizontal'
      ? { startX: 0.26, startY: 0.42, endX: 0.74, endY: 0.58 }
      : { startX: 0.28, startY: 0.48, endX: 0.72, endY: 0.48 };
  await page.mouse.move(box.x + box.width * points.startX, box.y + box.height * points.startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * points.endX, box.y + box.height * points.endY, { steps: 18 });
  await page.mouse.up();
  try {
    await page.waitForFunction((count) => document.querySelectorAll('[data-survey-section-line="true"]').length > count, { timeout: 10000 }, beforeCount);
  } catch (error) {
    const missingDebug = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 6000), drawingOverlay: document.body.innerText.includes('Tartsd lenyomva a rajzlapot'), sectionStepClass: document.querySelector('[data-survey-step="section"]')?.className || '' }));
    console.error('SECTION_LINE_MISSING', JSON.stringify(missingDebug, null, 2));
    await page.screenshot({ path: '/tmp/v061_section_line_missing.png', fullPage: true });
    throw error;
  }
  const sectionDebug = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 5000),
    sectionStepClass: document.querySelector('[data-survey-step="section"]')?.className || '',
    lineCount: document.querySelectorAll('[data-survey-section-line="true"]').length,
  }));
  const sectionBodyLower = sectionDebug.body.toLocaleLowerCase('hu-HU');
  if (!sectionBodyLower.includes('gerincmagasság') || !sectionBodyLower.includes('tetőablak')) {
    console.error('SECTION_DEBUG', JSON.stringify(sectionDebug, null, 2));
    await page.screenshot({ path: '/tmp/v061_section_debug.png', fullPage: true });
    throw new Error('A metszeti adatlap mezői hiányoznak.');
  }
  const sectionState = await page.$$eval('[data-survey-section-line="true"]', (elements) => {
    const element = elements[elements.length - 1];
    const line = element.querySelector('line');
    return {
      serial: element.getAttribute('data-survey-section-serial') || '',
      x1: Number(line?.getAttribute('x1')),
      y1: Number(line?.getAttribute('y1')),
      x2: Number(line?.getAttribute('x2')),
      y2: Number(line?.getAttribute('y2')),
    };
  });
  if (constraint === 'horizontal') assert(Math.abs(sectionState.y1 - sectionState.y2) < 0.01, 'A vízszintes metszeti iránysegéd nem zárt tengelyre.');
  if (constraint === 'vertical') assert(Math.abs(sectionState.x1 - sectionState.x2) < 0.01, 'A függőleges metszeti iránysegéd nem zárt tengelyre.');
  return { constraint, ...sectionState };
}


async function testSectionDeleteHold(page) {
  const deleteButtonSelector = 'button[aria-label*="metszet törléséhez"]';
  const button = await page.$(deleteButtonSelector);
  assert(button, 'A 2 másodperces metszettörlő gomb nem található.');
  await button.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  let box = await button.boundingBox();
  assert(box, 'A metszettörlő gomb mérete nem olvasható.');

  const beforeCount = await page.$$eval('[data-survey-section-line="true"]', (elements) => elements.length);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 450));
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterShortHold = await page.$$eval('[data-survey-section-line="true"]', (elements) => elements.length);
  assert(afterShortHold === beforeCount, 'A metszet rövid nyomásra is törlődött.');

  const buttonAgain = await page.$(deleteButtonSelector);
  assert(buttonAgain, 'A metszettörlő gomb eltűnt a rövid nyomás után.');
  box = await buttonAgain.boundingBox();
  assert(box, 'A metszettörlő gomb mérete másodszor nem olvasható.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 2250));
  await page.mouse.up();
  await page.waitForFunction((previousCount) => document.querySelectorAll('[data-survey-section-line="true"]').length < previousCount, { timeout: 10000 }, beforeCount);
  const afterLongHold = await page.$$eval('[data-survey-section-line="true"]', (elements) => elements.length);
  assert(afterLongHold === beforeCount - 1, 'A metszet nem törlődött a 2 másodperces nyomva tartás után.');
  return { beforeCount, afterShortHold, afterLongHold };
}

async function testOverlapCollapse(page) {
  await new Promise((resolve) => setTimeout(resolve, 2400));
  const forced = await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: false, reason: 'Nincs workspace.' };
    const workspace = JSON.parse(raw);
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    if (!survey || survey.draft.rooms.length < 2) return { ok: false, reason: 'Nincs két helyiség.' };
    const first = survey.draft.rooms[0];
    const second = survey.draft.rooms[1];
    const original = { x: second.x, y: second.y };
    second.x = first.x + Math.min(30, first.width * 0.15);
    second.y = first.y + Math.min(30, first.depth * 0.15);
    workspace.__v061OverlapOriginal = { surveyId: survey.id, roomId: second.id, ...original };
    workspace.updatedAt = new Date().toISOString();
    survey.updatedAt = workspace.updatedAt;
    localStorage.setItem(key, JSON.stringify(workspace));
    return { ok: true, first: first.id, second: second.id, original };
  });
  if (!forced.ok) return { created: false, reason: forced.reason };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'DIMPRO Felmérő', 30000);
  await page.waitForSelector('details[data-room-overlap-item]', { timeout: 15000 });
  const detailsCount = await page.$$eval('details[data-room-overlap-item]', (elements) => elements.length);
  const allClosed = await page.$$eval('details[data-room-overlap-item]', (elements) => elements.every((element) => !element.open));
  assert(allClosed, 'A geometriai hibakártyák nem összecsukva indultak.');
  await page.$eval('details[data-room-overlap-item] summary', (summary) => summary.click());
  const opened = await page.$eval('details[data-room-overlap-item]', (element) => element.open);
  assert(opened, 'Az egyedi geometriai hibakártya nem nyitható meg.');

  await page.evaluate(() => {
    const key = 'dimpro-property-survey-workspace-v1';
    const workspace = JSON.parse(localStorage.getItem(key));
    const original = workspace.__v061OverlapOriginal;
    const survey = workspace.surveys.find((item) => item.id === original.surveyId);
    const room = survey.draft.rooms.find((item) => item.id === original.roomId);
    room.x = original.x;
    room.y = original.y;
    delete workspace.__v061OverlapOriginal;
    workspace.updatedAt = new Date().toISOString();
    survey.updatedAt = workspace.updatedAt;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'DIMPRO Felmérő', 30000);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const remaining = await page.$$eval('details[data-room-overlap-item]', (elements) => elements.length);
  assert(remaining === 0, 'A javított geometriai hibakártya nem tűnt el automatikusan.');
  return { created: true, detailsCount, remaining };
}


async function createPhotoPoint(page, category, purpose = 'documentation', includeInCertificate = false) {
  await page.click('[data-survey-step="photos"]');
  await waitText(page, 'Energetikai fotódokumentáció');
  const beforeCount = await page.$$eval('[data-survey-photo-point]', (elements) => elements.length);
  await clickText(page, 'Új dokumentációs fotópont');
  const svg = await page.$('svg[data-survey-export-svg="true"]');
  await svg.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const box = await svg.boundingBox();
  assert(box, 'A fotópont rajzlapja nem olvasható.');
  await page.mouse.click(box.x + box.width * (0.44 + beforeCount * 0.025), box.y + box.height * (0.44 + beforeCount * 0.02));
  await page.waitForFunction((count) => document.querySelectorAll('[data-survey-photo-point]').length > count, { timeout: 10000 }, beforeCount);
  await page.select('select[data-survey-photo-purpose]', purpose);
  if (purpose === 'documentation') await page.select('select[data-survey-photo-category]', category);
  const input = await page.$('input[type="file"][accept="image/*"]');
  assert(input, 'A fotófeltöltő mező nem található.');
  await input.uploadFile(testPhotoPath);
  await page.waitForFunction(() => {
    const selected = [...document.querySelectorAll('[data-survey-photo-point]')].find((element) => element.className.includes('border-cyan-400'));
    return Boolean(selected && selected.textContent.includes('KB'));
  }, { timeout: 15000 });
  if (includeInCertificate) {
    await page.waitForSelector('[data-survey-active-certificate-toggle]:not([disabled])', { timeout: 10000 });
    const checked = await page.$eval('[data-survey-active-certificate-toggle]', (element) => element.checked);
    if (!checked) await page.click('[data-survey-active-certificate-toggle]');
    await page.waitForFunction(() => document.querySelector('[data-survey-active-certificate-toggle]')?.checked === true, { timeout: 10000 });
  }
  return page.$$eval('[data-survey-photo-point]', (elements) => {
    const element = elements[elements.length - 1];
    return {
      serial: element.getAttribute('data-survey-photo-serial') || '',
      purpose: element.getAttribute('data-survey-photo-purpose') || '',
    };
  });
}

async function testPhotoPackage(page) {
  const first = await createPhotoPoint(page, 'building', 'documentation', true);
  const second = await createPhotoPoint(page, 'heatGenerator', 'documentation', true);
  const third = await createPhotoPoint(page, 'heatEmitter', 'documentation', true);
  const unselectedPhoto = await createPhotoPoint(page, 'building', 'documentation', false);
  const issuePhoto = await createPhotoPoint(page, 'other', 'issue', false);
  assert(first.serial === 'F-001' && second.serial === 'F-002' && third.serial === 'F-003' && unselectedPhoto.serial === 'F-004' && issuePhoto.serial === 'F-005', 'A fotópontok sorszámozása hibás.');
  assert(issuePhoto.purpose === 'issue', 'A másodlagos hibafotó típus nem állítható be.');
  const summaryText = await page.$eval('[data-survey-certificate-photo-summary="true"]', (element) => element.textContent || '');
  assert(summaryText.includes('3 / 12'), `A kijelölt tanúsítási fotószám nem 3/12: ${summaryText.slice(0, 500)}`);
  assert(summaryText.includes('Fénykép az épületről · 1 db'), 'A WinWatt épületfotó-kategória hiányos.');
  assert(summaryText.includes('Fénykép a hőtermelő rendszerről · 1 db'), 'A WinWatt hőtermelő-kategória hiányos.');
  assert(summaryText.includes('Fénykép a hőleadó rendszerről · 1 db'), 'A WinWatt hőleadó-kategória hiányos.');

  const unselectedState = await page.$eval('[data-survey-photo-serial="F-004"]', (element) => element.getAttribute('data-survey-photo-in-certificate'));
  assert(unselectedState === 'false', 'A felmérési többletfotó automatikusan bekerült a tanúsítási csomagba.');

  const beforeCertificateZip = fs.readdirSync(downloadDir);
  await clickText(page, 'WinWatt fotócsomag ZIP');
  const certificateZipFile = await waitDownload('.zip', beforeCertificateZip, 30000);
  const certificateZip = await JSZip.loadAsync(fs.readFileSync(certificateZipFile));
  const certificateJpgs = Object.keys(certificateZip.files).filter((name) => name.toLowerCase().endsWith('.jpg'));
  assert(certificateJpgs.length === 3, `A WinWatt ZIP nem kizárólag a 3 bepipált fotót tartalmazza: ${certificateJpgs.length}`);
  assert(Boolean(certificateZip.file('DIMPRO_fotojegyzek.csv')), 'A WinWatt ZIP fotójegyzéke hiányzik.');

  const beforeAllZip = fs.readdirSync(downloadDir);
  await clickText(page, 'Minden feltöltött kép ZIP');
  const allZipFile = await waitDownload('.zip', beforeAllZip, 30000);
  const allZip = await JSZip.loadAsync(fs.readFileSync(allZipFile));
  const allJpgs = Object.keys(allZip.files).filter((name) => name.toLowerCase().endsWith('.jpg'));
  assert(allJpgs.length === 5, `A teljes fotó ZIP nem 5 képet tartalmaz: ${allJpgs.length}`);

  const workspacePhotoState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('dimpro-property-survey-workspace-v1'));
    const survey = workspace.surveys.find((item) => item.id === workspace.activeSurveyId);
    return survey.draft.photoPoints.map((point) => ({ serial: point.serial, purpose: point.purpose, category: point.certificateCategory, include: point.includeInCertificate, size: point.optimizedSizeBytes, width: point.pixelWidth, height: point.pixelHeight, mimeType: point.mimeType }));
  });
  assert(workspacePhotoState.slice(0, 3).every((point) => point.include === true && point.mimeType === 'image/jpeg' && point.size <= 280 * 1024 && Math.max(point.width, point.height) === 1600), 'A kijelölt dokumentációs fotók optimalizálása vagy tanúsítási jelölése hibás.');
  assert(workspacePhotoState[3].purpose === 'documentation' && workspacePhotoState[3].include === false, 'A nem bepipált felmérési fotó bekerült a tanúsítási csomagba.');
  assert(workspacePhotoState[4].purpose === 'issue' && workspacePhotoState[4].include === false, 'A hibafotó bekerült a tanúsítási csomagba.');
  return { first, second, third, unselectedPhoto, issuePhoto, certificateZipFile, allZipFile, certificateJpgCount: certificateJpgs.length, allJpgCount: allJpgs.length, workspacePhotoState };
}

async function assertResponsive(page, viewport) {
  await page.setViewport(viewport);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(dimensions.body <= dimensions.viewport + 2, `Vízszintes overflow ${viewport.width}px nézetben: ${dimensions.body}/${dimensions.viewport}`);
  assert(dimensions.html <= dimensions.viewport + 2, `HTML overflow ${viewport.width}px nézetben: ${dimensions.html}/${dimensions.viewport}`);
  return dimensions;
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
  await page.waitForSelector('body');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek', 30000);

  await createProjectAndSurvey(page, { projectName: 'V061 Energetikai tesztprojekt', surveyName: 'V061 energetikai mintafelmérés', surveyMode: 'Energetikai felmérés' });
  const sheetState = await page.$eval('svg[data-survey-export-svg="true"]', (svg) => {
    const frame = svg.querySelector('[data-survey-sheet-frame="true"]');
    const titleBlock = svg.querySelector('[data-survey-title-block="true"]');
    const northOuter = svg.querySelector('[data-survey-north-mark="true"] > polygon');
    return {
      hasFrame: Boolean(frame),
      frameInsetMm: frame?.getAttribute('data-frame-inset-mm') || '',
      frameStrokeWidth: Number(frame?.getAttribute('stroke-width') || frame?.getAttribute('strokeWidth') || 0),
      northStrokeWidth: Number(northOuter?.getAttribute('stroke-width') || northOuter?.getAttribute('strokeWidth') || 0),
      hasTitleBlock: Boolean(titleBlock),
      titleRows: titleBlock?.getAttribute('data-title-block-rows') || '',
      titleWidthMm: titleBlock?.getAttribute('data-title-block-width-mm') || '',
      titleHeightMm: titleBlock?.getAttribute('data-title-block-height-mm') || '',
      text: titleBlock?.textContent || '',
      locationLineCount: titleBlock?.querySelector('[data-survey-title-cell="HELYSZÍN"]')?.querySelectorAll('tspan').length || 0,
    };
  });
  assert(sheetState.hasFrame && sheetState.frameInsetMm === '5', 'Az 5 mm-rel beljebb húzott türkízzöld rajzkeret hiányzik.');
  assert(sheetState.hasTitleBlock && sheetState.titleRows === '2', 'A két soros rajzadat-fejléc hiányzik.');
  assert(sheetState.titleWidthMm === '200' && sheetState.titleHeightMm === '34', 'Az A4 álló alapú fejléc fizikai mérete hibás.');
  assert(sheetState.text.includes('V061 Energetikai') && sheetState.text.includes('tesztprojekt') && sheetState.text.includes('V061 energetikai') && sheetState.text.includes('mintafelmérés') && sheetState.text.includes('MEGRENDELŐ') && sheetState.text.includes('V061 Teszt') && sheetState.text.includes('RAJZVERZIÓ') && sheetState.text.includes('SZINT') && sheetState.text.includes('Földszint') && sheetState.text.includes('M=1:'), 'A rajzadat-fejléc kötelező adatai hiányoznak.');
  assert(sheetState.locationLineCount === 2, 'A hosszú helyszínadat nem tört két sorba a rajzadat-fejlécben.');
  assert(sheetState.frameStrokeWidth < sheetState.northStrokeWidth, 'A rajzkeret nem vékonyabb az északjel külső hexagonjánál.');
  assert(await page.$('[data-survey-north-mark="true"]'), 'A DIMPRO északjel nem látható a rajzlapon.');
  const northMarkState = await page.$eval('[data-survey-north-mark="true"]', (element) => {
    const miniArrow = element.querySelector('[data-survey-north-mini-arrow="true"]');
    return {
      hasInternalPointer: Boolean(element.querySelector('[data-survey-north-pointer="true"]')),
      hasMiniArrow: Boolean(miniArrow),
      miniArrowParentTransform: miniArrow?.parentElement?.getAttribute('transform') || '',
      hasRedArrow: element.innerHTML.toLocaleLowerCase().includes('#ef4444'),
      text: element.textContent || '',
    };
  });
  assert(northMarkState.hasInternalPointer, 'A belső hexagon irányjelző hiányzik.');
  assert(northMarkState.hasMiniArrow, 'A belső középvonal mini északnyila hiányzik.');
  assert(northMarkState.miniArrowParentTransform.includes('rotate('), 'A mini északnyíl nem a forgó belső irányjelző része.');
  assert(!northMarkState.hasRedArrow, 'A külön piros északnyíl még megjelenik.');
  assert(northMarkState.text.includes('É'), 'A diszkrét É jelölés hiányzik.');
  const firstSection = await drawSection(page, 'free');
  assert(firstSection.serial === 'A-A', `Az első metszet betűjele hibás: ${firstSection.serial}`);
  const sectionStructureState = await page.evaluate(() => ({
    hasFloorSlab: Boolean(document.querySelector('[data-section-floor-slab="true"]')),
    hasCeilingSlab: Boolean(document.querySelector('[data-section-ceiling-slab="true"]')),
    internalWallCount: document.querySelectorAll('[data-section-internal-wall]').length,
    body: document.body.innerText,
  }));
  assert(sectionStructureState.hasFloorSlab && sectionStructureState.hasCeilingSlab, 'A metszeti padló- vagy födémjelölés hiányzik.');
  const sectionBodyText = sectionStructureState.body.toLocaleLowerCase('hu-HU');
  assert(sectionBodyText.includes('padlószerkezet vastagsága') && sectionBodyText.includes('födém vastagsága'), 'A padló- és födémvastagság adatmezői hiányoznak.');
  const secondSection = await drawSection(page, 'horizontal');
  assert(secondSection.serial === 'B-B', `A második metszet nem B-B lett: ${secondSection.serial}`);
  const sectionDeleteHold = await testSectionDeleteHold(page);
  const replacementSecondSection = await drawSection(page, 'vertical');
  assert(replacementSecondSection.serial === 'B-B', `A törölt második metszet helyére létrehozott jel hibás: ${replacementSecondSection.serial}`);
  const overlapResult = await testOverlapCollapse(page);
  const photoPackage = await testPhotoPackage(page);

  await page.click('[data-survey-step="export"]');
  await waitText(page, 'Többoldalas vektoros PDF');
  const inputValues = await page.$$eval('[data-survey-export-panel="true"] input', (inputs) => inputs.map((input) => ({ type: input.type, value: input.value })));
  assert(inputValues.length >= 5, 'A fedlap/aláírási adatmezők hiányoznak.');
  const beforePdf = fs.readdirSync(downloadDir);
  await clickText(page, 'Teljes épület PDF készítése');
  const pdfFile = await waitDownload('.pdf', beforePdf, 30000);
  assert(fs.statSync(pdfFile).size > 5000, 'A többoldalas PDF túl kicsi vagy üres.');

  const beforeJson = fs.readdirSync(downloadDir);
  await clickText(page, 'JSON');
  const jsonFile = await waitDownload('.json', beforeJson);
  const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert(json.schema === 'dimpro.winwatt-compatible.v0.8.4', 'Hibás WinWatt-előkészítő JSON v0.8.4 séma.');
  assert(json.winWattFieldMap?.schema === 'dimpro.winwatt-field-map.v0.8.3', 'A WinWatt mezőtérkép hiányzik a JSON csomagból.');
  assert(json.trialPackageSchema === 'dimpro.winwatt-trial-package.v0.8.4', 'A WinWatt próbaátadási csomagséma hiányzik a JSON-ból.');
  assert(Array.isArray(json.zones) && json.zones.length >= 1, 'A WinWatt zónablokk hiányzik.');
  assert(Array.isArray(json.envelopeWalls), 'A WinWatt faladatok hiányoznak.');

  const beforeCsv = fs.readdirSync(downloadDir);
  await clickText(page, 'Fal CSV');
  const csvFile = await waitDownload('.csv', beforeCsv);
  assert(fs.readFileSync(csvFile, 'utf8').includes('Bruttó_falfelület_m2'), 'A WinWatt CSV fejléc hiányos.');

  const beforeDimpro = fs.readdirSync(downloadDir);
  await clickText(page, 'Mentés .dimpro fájlba');
  const dimproFile = await waitDownload('.dimpro', beforeDimpro);
  const dimpro = JSON.parse(fs.readFileSync(dimproFile, 'utf8'));
  assert(dimpro.schema === 'dimpro.property-survey.v0.8.4.3', 'Hibás DIMPRO v0.8.4.3 séma.');
  assert(dimpro.calculated?.winWattFieldMap?.schema === 'dimpro.winwatt-field-map.v0.8.3', 'A WinWatt mezőtérkép hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated?.energyZones?.schema === 'dimpro.energy-zone-set.v0.7.3', 'A zónaeredmény hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated?.energyOpenings?.schema === 'dimpro.energy-opening-set.v0.7.4', 'A nyílászáróeredmény hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated?.energyDemand?.schema === 'dimpro.energy-demand-set.v0.7.5', 'A zónaterhelési eredmény hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated?.energyRenewables?.schema === 'dimpro.energy-renewable-sizing.v0.8.0' && dimpro.calculated.energyRenewables.enabled === false, 'A kikapcsolt megújuló eredmény hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated?.energyRenovationComparison?.schema === 'dimpro.energy-renovation-comparison.v0.8.2', 'A változat-összehasonlító eredmény hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.calculated.energyDemand.enabled === false, 'Az alap regressziós projekt terhelési rétege nem kikapcsolt állapotú.');
  assert(dimpro.calculated?.energyAssemblies?.schema === 'dimpro.energy-assembly-set.v0.7.2', 'Az U-érték eredményhalmaz hiányzik a DIMPRO munkafájlból.');
  assert(dimpro.draft.sectionLines.length >= 1, 'A metszet nem került a DIMPRO munkafájlba.');

  const responsive = [];
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]) responsive.push(await assertResponsive(page, viewport));

  await page.setViewport({ width: 1680, height: 1050 });
  await clickText(page, 'Projektek');
  await waitText(page, 'Felmérési projektek');
  await clickText(page, 'Új felmérés');
  const dialog = await page.$('[role="dialog"][aria-label="Új felmérés"]');
  const select = await dialog.$('select');
  await select.select('Épület- és csarnokfelmérés');
  const nameInput = (await dialog.$$('input'))[0];
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('V061 csarnok metszet teszt');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await waitText(page, 'Épület- és csarnokfelmérés');
  assert(await page.$('[data-survey-north-mark="true"]'), 'Csarnokmódban hiányzik az északjel.');
  await drawSection(page, 'free');
  await page.click('[data-survey-step="export"]');
  await waitText(page, 'Rétegezett DXF');
  const beforeDxf = fs.readdirSync(downloadDir);
  await clickText(page, 'DXF-fájl készítése');
  const dxfFile = await waitDownload('.dxf', beforeDxf);
  const dxf = fs.readFileSync(dxfFile, 'utf8');
  assert(dxf.includes('DIMPRO_SECTIONS'), 'A csarnok DXF nem tartalmaz metszetréteget.');
  assert(dxf.includes('HATCH'), 'Az ipari DXF HATCH regresszió sikertelen.');

  const driveResponse = await page.evaluate(async () => {
    const response = await fetch('/api/property-survey/drive-save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    return { status: response.status, body: await response.json() };
  });
  assert(driveResponse.status === 401, `A Drive API kijelentkezett állapotban nem 401-et adott: ${driveResponse.status}`);

  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);

  const result = {
    ok: true,
    pdfFile,
    jsonFile,
    csvFile,
    dimproFile,
    dxfFile,
    sheetState,
    northMarkState,
    firstSection,
    sectionStructureState,
    secondSection,
    sectionDeleteHold,
    replacementSecondSection,
    overlapResult,
    photoPackage,
    responsive,
    consoleErrors: relevantConsoleErrors,
    pageErrors,
  };
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
});
