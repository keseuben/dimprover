const puppeteer = require('puppeteer');

const baseUrl = process.env.DIMPRO_TEST_URL || 'http://dimpro.hu:3019/ingatlanfelmero';
const viewportWidth = Number(process.env.DIMPRO_TABLET_WIDTH || 834);
const viewportHeight = Number(process.env.DIMPRO_TABLET_HEIGHT || 1194);

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

async function createSurvey(page) {
  await clickText(page, 'Új projekt');
  await page.waitForSelector('input[placeholder="Projekt neve *"]');
  await page.type('input[placeholder="Projekt neve *"]', 'V0613 tablet érintésteszt');
  await page.type('input[placeholder="Projektkód"]', 'V0613-TAB');
  await page.type('input[placeholder="Település / helyszín"]', 'Tablet teszthelyszín');
  await page.type('input[placeholder="Megrendelő / tulajdonos"]', 'Tablet Teszt Kft.');
  await clickText(page, 'Projekt létrehozása');
  await waitText(page, 'V0613 tablet érintésteszt');
  await clickText(page, 'Új felmérés');
  const dialog = await page.waitForSelector('[role="dialog"][aria-label="Új felmérés"]');
  const inputs = await dialog.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type('Tablet pinch és mozgatás');
  await clickText(page, 'Mintafelmérés');
  await clickText(page, 'Felmérés létrehozása');
  await page.waitForSelector('[data-survey-gesture-stage="true"]');
  await page.waitForSelector('[data-room-button="true"]');
  const focusButton = await page.$('[data-survey-focus-enter]');
  assert(focusButton, 'A rajzi teljes képernyő gomb nem található tablet nézetben.');
  await page.evaluate(() => {
    try { Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined }); } catch {}
    document.querySelector('[data-survey-focus-enter]')?.click();
  });
  await page.waitForSelector('[data-survey-focus-mode="true"]', { timeout: 10000 });
  await page.waitForSelector('[data-survey-focus-mode="true"] [data-survey-gesture-stage="true"]');
  await page.evaluate(() => {
    const left = document.querySelector('[data-focus-panel="left"]');
    const right = document.querySelector('[data-focus-panel="right"]');
    if (left?.classList.contains('is-open')) document.querySelector('[data-focus-open-left]')?.click();
    if (right?.classList.contains('is-open')) document.querySelector('[data-focus-open-right]')?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-focus-panel="left"]')?.classList.contains('is-open') && !document.querySelector('[data-focus-panel="right"]')?.classList.contains('is-open'));
  await new Promise((resolve) => setTimeout(resolve, 300));
}

function touchPoint(x, y, id) {
  return { x, y, id, radiusX: 7, radiusY: 7, force: 1 };
}

async function dispatchTouch(client, type, points) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points,
    modifiers: 0,
  });
}

async function dragRoomWithTouch(page, client, selector, dx, dy, touchId = 1) {
  const room = await page.$(selector);
  assert(room, `Nem található helyiség: ${selector}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const hit = await page.$eval(selector, (element) => {
    const box = element.getBoundingClientRect();
    const stage = document.querySelector('[data-survey-gesture-stage="true"]');
    const stageBox = stage?.getBoundingClientRect();
    const factors = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
    for (const fy of factors) {
      for (const fx of factors) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        if (x < 1 || x > innerWidth - 1 || y < 1 || y > innerHeight - 1) continue;
        if (stageBox && (x < stageBox.left || x > stageBox.right || y < stageBox.top || y > stageBox.bottom)) continue;
        const target = document.elementFromPoint(x, y);
        if (target?.closest('[data-room-button="true"]') === element) {
          return { x, y, box: { left: box.left, top: box.top, width: box.width, height: box.height }, blocker: '' };
        }
      }
    }
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const blocker = document.elementFromPoint(centerX, centerY);
    return { x: NaN, y: NaN, box: { left: box.left, top: box.top, width: box.width, height: box.height }, blocker: blocker ? `${blocker.tagName}.${blocker.className || ''}` : 'nincs' };
  });
  assert(Number.isFinite(hit.x) && Number.isFinite(hit.y), `A helyiségnek nincs érinthető pontja: ${selector}; ${JSON.stringify(hit)}`);
  const before = await room.evaluate((element) => ({ x: Number(element.getAttribute('data-room-x')), y: Number(element.getAttribute('data-room-y')), scrollY: window.scrollY }));
  const startX = hit.x;
  const startY = hit.y;
  await dispatchTouch(client, 'touchStart', [touchPoint(startX, startY, touchId)]);
  for (let step = 1; step <= 10; step += 1) {
    await dispatchTouch(client, 'touchMove', [touchPoint(startX + dx * step / 10, startY + dy * step / 10, touchId)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await dispatchTouch(client, 'touchEnd', []);
  await new Promise((resolve) => setTimeout(resolve, 450));
  const after = await page.$eval(selector, (element) => ({ x: Number(element.getAttribute('data-room-x')), y: Number(element.getAttribute('data-room-y')), scrollY: window.scrollY }));
  return { before, after, delta: Math.hypot(after.x - before.x, after.y - before.y), scrollDelta: after.scrollY - before.scrollY };
}

async function getVisibleRoomSelector(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-survey-gesture-stage="true"]');
    if (!stage) return '';
    const stageBox = stage.getBoundingClientRect();
    const factors = [0.5, 0.35, 0.65, 0.25, 0.75];
    const rooms = [...document.querySelectorAll('[data-room-button="true"]')];
    const visible = rooms.find((room) => {
      const box = room.getBoundingClientRect();
      return factors.some((fy) => factors.some((fx) => {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        if (x < stageBox.left + 10 || x > stageBox.right - 10 || y < stageBox.top + 10 || y > stageBox.bottom - 10) return false;
        return document.elementFromPoint(x, y)?.closest('[data-room-button="true"]') === room;
      }));
    });
    const id = visible?.getAttribute('data-survey-room-id');
    return id ? `[data-survey-room-id="${id}"]` : '';
  });
}

async function pinch(page, client, scaleFactor, centerShift = { x: 0, y: 0 }) {
  const stage = await page.$('[data-survey-gesture-stage="true"]');
  const box = await stage.boundingBox();
  assert(box, 'A gesztusfelület mérete nem olvasható.');
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const startHalfDistance = Math.min(90, box.width * 0.14);
  const endHalfDistance = startHalfDistance * scaleFactor;
  const start = [
    touchPoint(centerX - startHalfDistance, centerY, 11),
    touchPoint(centerX + startHalfDistance, centerY, 12),
  ];
  await dispatchTouch(client, 'touchStart', start);
  for (let step = 1; step <= 12; step += 1) {
    const ratio = step / 12;
    const halfDistance = startHalfDistance + (endHalfDistance - startHalfDistance) * ratio;
    const shiftX = centerShift.x * ratio;
    const shiftY = centerShift.y * ratio;
    await dispatchTouch(client, 'touchMove', [
      touchPoint(centerX + shiftX - halfDistance, centerY + shiftY, 11),
      touchPoint(centerX + shiftX + halfDistance, centerY + shiftY, 12),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await dispatchTouch(client, 'touchEnd', []);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return page.$eval('[data-survey-gesture-stage="true"]', (element) => ({
    zoom: Number(element.getAttribute('data-survey-zoom')),
    touchAction: getComputedStyle(element).touchAction,
    overscrollBehavior: getComputedStyle(element).overscrollBehavior,
    transform: document.querySelector('[data-survey-view-transform="true"]')?.style.transform || '',
  }));
}

let browser;
(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP dimpro.hu 127.0.0.1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: viewportWidth, height: viewportHeight, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const client = await page.createCDPSession();
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitText(page, 'Felmérési projektek', 30000);
  await createSurvey(page);

  const initialStage = await page.$eval('[data-survey-gesture-stage="true"]', (element) => ({
    zoom: Number(element.getAttribute('data-survey-zoom')),
    touchAction: getComputedStyle(element).touchAction,
    bodyScrollY: window.scrollY,
  }));
  assert(initialStage.touchAction === 'none', `A tablet touch-action nem none: ${initialStage.touchAction}`);

  const firstMove = await dragRoomWithTouch(page, client, '[data-room-button="true"]', 140, 80, 1);
  assert(firstMove.delta > 45, `Az egyujjas helyiségmozgatás túl kicsi: ${firstMove.delta.toFixed(1)} modellpont.`);
  assert(firstMove.after.x > firstMove.before.x + 80 && firstMove.after.y > firstMove.before.y + 45, `Az egyujjas helyiségmozgatás iránya hibás: ${JSON.stringify(firstMove)}.`);
  assert(firstMove.delta < 420, `Az egyujjas helyiségmozgatás instabilan túl nagyot ugrott: ${firstMove.delta.toFixed(1)} modellpont.`);
  assert(Math.abs(firstMove.scrollDelta) <= 1, `A helyiséghúzás közben a teljes képernyős oldal elgördült: ${JSON.stringify(firstMove)}.`);

  const beforePinchScroll = await page.evaluate(() => window.scrollY);
  const pinchState = await pinch(page, client, 2.15, { x: 34, y: 24 });
  assert(pinchState.zoom > 1.7, `A kétujjas nagyítás nem működött: ${pinchState.zoom}.`);
  assert(pinchState.transform.includes('translate(') && !pinchState.transform.includes('translate(0px, 0px)'), `A kétujjas pásztázás nem változtatta a transzformációt: ${pinchState.transform}`);
  const afterPinchScroll = await page.evaluate(() => window.scrollY);
  assert(Math.abs(afterPinchScroll - beforePinchScroll) <= 1, `A pinch közben az oldal elgördült: ${beforePinchScroll} -> ${afterPinchScroll}`);

  const visibleRoomSelector = await getVisibleRoomSelector(page);
  assert(visibleRoomSelector, `Nagyítás után nincs megfogható, látható helyiség. Pinch: ${JSON.stringify(pinchState)}`);
  const secondMove = await dragRoomWithTouch(page, client, visibleRoomSelector, -110, 65, 21);
  assert(secondMove.delta > 20, `Nagyítás után a helyiségmozgatás túl kicsi: ${secondMove.delta.toFixed(1)} modellpont. Helyiség: ${visibleRoomSelector}`);
  assert(secondMove.after.x < secondMove.before.x - 15 && secondMove.after.y > secondMove.before.y + 8, `Nagyítás után a helyiségmozgatás iránya hibás: ${JSON.stringify(secondMove)}.`);
  assert(secondMove.delta < 240, `Nagyítás után a helyiség túl nagyot ugrott: ${secondMove.delta.toFixed(1)} modellpont.`);
  assert(Math.abs(secondMove.scrollDelta) <= 1, `Nagyítás utáni helyiséghúzás közben elgördült a munkatér: ${JSON.stringify(secondMove)}.`);

  const zoomOutState = await pinch(page, client, 0.55, { x: -18, y: -12 });
  assert(zoomOutState.zoom < pinchState.zoom - 0.35, `A kétujjas kicsinyítés nem működött: ${pinchState.zoom} -> ${zoomOutState.zoom}.`);

  const bodyWidth = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert(bodyWidth.body <= bodyWidth.viewport + 2 && bodyWidth.html <= bodyWidth.viewport + 2, `Tablet vízszintes overflow: ${JSON.stringify(bodyWidth)}`);
  assert(pageErrors.length === 0, `Oldalhibák: ${pageErrors.join(' | ')}`);
  const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes('401') && !message.includes('Failed to load resource'));
  assert(relevantConsoleErrors.length === 0, `Konzolhibák: ${relevantConsoleErrors.join(' | ')}`);

  console.log(JSON.stringify({
    ok: true,
    viewport: { width: viewportWidth, height: viewportHeight, touch: true },
    initialStage,
    firstMove,
    pinchState,
    scrollDuringPinch: { before: beforePinchScroll, after: afterPinchScroll },
    visibleRoomSelector,
    secondMove,
    zoomOutState,
    bodyWidth,
    consoleErrors: relevantConsoleErrors,
    pageErrors,
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
});
