import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || 'https://drop.dev.dimpro.hu';
const FIXTURE = process.env.TEREP_IMAGE_FIXTURE?.trim() || 'public/drop-app-icon-v099-192.png';
await access(FIXTURE);

const checks = [];
const pass = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? `: ${detail}` : ''}`); checks.push(name); };
const visibleButton = async (page, text) => {
  for (const button of await page.$$('button')) {
    const state = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { text: (el.textContent || '').replace(/\s+/g, ' ').trim(), visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' };
    });
    if (state.visible && state.text === text) return button;
  }
  return null;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          setTimeout(() => success({ coords: { latitude: 47.321234, longitude: 21.112233, accuracy: 8 }, timestamp: Date.now() }), 60);
        },
      },
    });
    class FakeOrientationEvent extends Event {
      static async requestPermission() { return 'granted'; }
      constructor(type) {
        super(type);
        this.alpha = 317;
        this.beta = 0;
        this.gamma = 0;
        this.absolute = true;
        this.webkitCompassHeading = 43;
        this.webkitCompassAccuracy = 6;
      }
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, writable: true, value: FakeOrientationEvent });
    setInterval(() => window.dispatchEvent(new FakeOrientationEvent('deviceorientationabsolute')), 120);

    class FakeSpeechRecognition {
      constructor() { this.lang=''; this.continuous=true; this.interimResults=true; this.maxAlternatives=1; this.onresult=null; this.onerror=null; this.onend=null; }
      start() {
        setTimeout(() => {
          const result = [{ transcript: 'terepi hangos teszt' }]; result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
        }, 50);
      }
      stop() { setTimeout(() => this.onend?.(), 20); }
      abort() { setTimeout(() => this.onend?.(), 0); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  });

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/api/dimpro-identity/send/verify')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          user: { fullName: 'Terep Tesztelő', email: 'terep@example.invalid', publicCode: 'USR-TEST' },
          entitlement: { id: '11111111-1111-4111-8111-111111111111', canUseStandardSend: true, canUseQuickImageSend: true },
          projects: [],
          sendSession: { token: 'dss1.test.payload', expiresAt: new Date(Date.now() + 900000).toISOString(), entitlementId: '11111111-1111-4111-8111-111111111111' },
        }),
      });
      return;
    }
    request.continue();
  });

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  const response = await page.goto(`${BASE}/terep`, { waitUntil: 'networkidle2', timeout: 60_000 });
  pass('Terep Drop route HTTP 200', response?.status() === 200, String(response?.status()));
  pass('Terep ugyanabban a Drop hostban fut', new URL(page.url()).hostname === new URL(BASE).hostname);
  pass('Mobil UI nem lóg ki belépésnél', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass('Send licenc kapu látható', await page.evaluate(() => (document.body.textContent || '').includes('DIMPRO Send-kód')));

  const code = await page.$('input[placeholder="ABCD-123-456"]');
  assert.ok(code, 'Terep Send-kód mező hiányzik');
  await code.type('TEST123456', { delay: 5 });
  const open = await visibleButton(page, 'Terep megnyitása');
  assert.ok(open, 'Terep megnyitása gomb hiányzik');
  await open.click();
  await page.waitForFunction(() => (document.body.textContent || '').includes('Terep Tesztelő'), { timeout: 10_000 });
  pass('Ugyanaz a Send entitlement nyitja a Terepet', true);
  pass('Terep shell megnyílt', await page.evaluate(() => (document.body.textContent || '').includes('Gyors terepi rögzítés')));
  pass('GPS alapból KI', await page.evaluate(() => !(document.body.textContent || '').includes('GPS ±')));

  const newPhoto = await visibleButton(page, 'Új terepi kép');
  assert.ok(newPhoto, 'Új terepi kép gomb hiányzik');
  await newPhoto.click();
  await page.waitForFunction(() => (document.body.textContent || '').includes('Mit rögzítsen ehhez a képhez?'), { timeout: 5000 });

  const labels = await page.$$('label');
  for (const label of labels) {
    const text = await label.evaluate((el) => (el.textContent || '').trim());
    if (text.includes('GPS helyadat') || text.includes('Telefon iránya / tájolás') || text.includes('Hangos megjegyzés')) {
      const checkbox = await label.$('input[type="checkbox"]');
      if (checkbox && !(await checkbox.evaluate((el) => el.checked))) await checkbox.click();
    }
  }
  await page.waitForFunction(() => (document.body.textContent || '').includes('Tájolási szenzor'), { timeout: 5000 });
  pass('Tájolási permission user gesture-ből lefut', true);

  const gallery = await visibleButton(page, 'Galéria');
  assert.ok(gallery, 'Galéria gomb hiányzik');
  const chooserPromise = page.waitForFileChooser({ timeout: 10_000 });
  await gallery.click();
  const chooser = await chooserPromise;
  await chooser.accept([FIXTURE]);
  await page.waitForFunction(() => document.querySelectorAll('[data-field-capture-item]').length === 1, { timeout: 60_000 });
  pass('Első LOCAL_ONLY kép létrejött', true);
  await page.waitForFunction(() => (document.body.textContent || '').includes('GPS ±8 m'), { timeout: 10_000 });
  pass('GPS pontosság megjelenik ±8 m-ként', true);
  await page.waitForFunction(() => (document.body.textContent || '').includes('ÉK · 43°'), { timeout: 10_000 });
  pass('Tájolás égtáj + fok formában megjelenik', true);

  const cardToggle = await page.$('[data-field-capture-item] > button');
  assert.ok(cardToggle, 'Képkártya lenyitó hiányzik');
  await cardToggle.click();
  pass('GPS újramérés gomb elérhető', Boolean(await visibleButton(page, 'GPS újramérés')));
  pass('Tájolás újramérés gomb elérhető', Boolean(await visibleButton(page, 'Tájolás újramérés')));

  const noteArea = await page.$('textarea[placeholder*="repedés"]');
  assert.ok(noteArea, 'Megjegyzés mező hiányzik');
  await noteArea.type('Automata terepi megjegyzés', { delay: 5 });
  pass('Képenkénti megjegyzés szerkeszthető', await page.evaluate(() => [...document.querySelectorAll('textarea')].some((el) => el.value.includes('Automata terepi megjegyzés'))));

  const dictate = await visibleButton(page, 'Diktálás');
  assert.ok(dictate, 'Diktálás gomb hiányzik');
  await dictate.click();
  await page.waitForFunction(() => (document.body.textContent || '').includes('Hallgatom') || (document.body.textContent || '').includes('Beszéd felismerve'), { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const stop = await visibleButton(page, 'Leállítás');
  assert.ok(stop, 'Leállítás gomb hiányzik');
  await stop.click();
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((el) => el.value.toLowerCase().includes('terepi hangos teszt')), { timeout: 5000 });
  pass('Shared DIMPRO Voice működik Terepen', true);

  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-field-capture-item]').length === 1, { timeout: 10_000 });
  pass('IndexedDB queue reload után visszaáll', true);
  pass('GPS rekord reload után megmarad', await page.evaluate(() => (document.body.textContent || '').includes('GPS ±8 m')));
  pass('Tájolási rekord reload után megmarad', await page.evaluate(() => (document.body.textContent || '').includes('ÉK · 43°')));
  pass('Visszaállított mobil UI nem lóg ki', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass('Böngésző pageerror nincs', pageErrors.length === 0, pageErrors.join(' | '));
  pass('Böngésző console error nincs', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, base: BASE }, null, 2));
} finally {
  await browser.close();
}
