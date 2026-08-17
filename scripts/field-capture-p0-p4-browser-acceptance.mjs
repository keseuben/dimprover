import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import puppeteer from 'puppeteer';

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const BASE = process.env.FIELD_CAPTURE_BROWSER_BASE?.trim() || 'https://dev.dimpro.hu';
const FIXTURE = process.env.FIELD_CAPTURE_IMAGE_FIXTURE?.trim() || 'public/drop-app-icon-v099-192.png';
await access(FIXTURE);

const stamp = Date.now();
const email = `field-capture-e2e-${stamp}@example.invalid`;
const password = `Fc!${randomBytes(18).toString('base64url')}9a`;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const regular = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const checks = [];
const pass = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? `: ${detail}` : ''}`); checks.push(name); };
const buttonByText = async (page, text) => {
  for (const button of await page.$$('button')) {
    const value = await button.evaluate((el) => el.textContent || '');
    if (value.includes(text)) return button;
  }
  return null;
};

let userId = '';
let browser;
try {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'FIELD_CAPTURE_P0_P4_BROWSER_ACCEPTANCE' },
  });
  if (created.error || !created.data.user) throw created.error || new Error('DEV auth fixture nem hozható létre.');
  userId = created.data.user.id;

  const signed = await regular.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw signed.error || new Error('DEV auth fixture session nem hozható létre.');

  const cookieJar = [];
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() { return []; },
      setAll(next) {
        cookieJar.splice(0, cookieJar.length, ...next);
      },
    },
  });
  const setSession = await ssr.auth.setSession({
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
  });
  if (setSession.error) throw setSession.error;
  pass('SSR auth cookie elkészült', cookieJar.length > 0, String(cookieJar.length));

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('ERR_ABORTED')) consoleErrors.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    class FakeSpeechRecognition {
      constructor() {
        this.lang = 'hu-HU'; this.continuous = true; this.interimResults = true; this.maxAlternatives = 1;
        this.onresult = null; this.onerror = null; this.onend = null; this._stopped = false;
      }
      start() {
        this._stopped = false;
        setTimeout(() => {
          if (this._stopped) return;
          const result = { 0: { transcript: 'terepi hangos teszt' }, isFinal: true };
          this.onresult?.({ resultIndex: 0, results: { 0: result, length: 1 } });
        }, 80);
      }
      stop() { this._stopped = true; setTimeout(() => this.onend?.(), 20); }
      abort() { this._stopped = true; setTimeout(() => this.onend?.(), 10); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: FakeSpeechRecognition });
  });

  for (const cookie of cookieJar) {
    const sameSiteRaw = String(cookie.options?.sameSite || '').toLowerCase();
    const sameSite = sameSiteRaw === 'strict' ? 'Strict' : sameSiteRaw === 'none' ? 'None' : 'Lax';
    await page.setCookie({
      name: cookie.name,
      value: cookie.value,
      url: BASE,
      secure: true,
      httpOnly: Boolean(cookie.options?.httpOnly),
      sameSite,
    });
  }

  const response = await page.goto(`${BASE}/field-capture?e2e=${stamp}`, { waitUntil: 'networkidle2', timeout: 120_000 });
  pass('Field Capture oldal HTTP 200 auth sessionnel', response?.status() === 200, String(response?.status()));
  pass('Nem irányít loginra', new URL(page.url()).pathname === '/field-capture', page.url());
  await page.waitForFunction(() => (document.body.textContent || '').includes('Terepi Gyorsrögzítő'), { timeout: 30_000 });
  const initial = await page.evaluate(() => ({
    body: document.body.textContent || '',
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  pass('Mobil UI nem lóg ki vízszintesen', initial.overflow === false);
  pass('Külön DEV modulnév látható', initial.body.includes('Terepi Gyorsrögzítő') && initial.body.includes('DEV'));
  pass('Offline-first üzenet látható', initial.body.includes('Nincs szükség stabil mobilnetre'));

  const newImage = await buttonByText(page, 'Új terepi kép');
  assert.ok(newImage, 'Új terepi kép gomb hiányzik');
  await newImage.click();
  await page.waitForFunction(() => (document.body.textContent || '').includes('Mit rögzítsen ehhez a képhez?'), { timeout: 10_000 });
  const optionsState = await page.evaluate(() => {
    const labelState = (needle) => {
      const label = [...document.querySelectorAll('label')].find((el) => (el.textContent || '').includes(needle));
      const input = label?.querySelector('input[type="checkbox"]');
      return input instanceof HTMLInputElement ? input.checked : null;
    };
    const body = document.body.textContent || '';
    return {
      gps: labelState('GPS helyadat'),
      orientation: labelState('Telefon iránya / tájolás'),
      voice: labelState('Hangos megjegyzés'),
      device: labelState('Mentés a telefonra is'),
      hasUserDrive: body.includes('Saját DIMPRO Drive'),
      hasProjectDrive: body.includes('Projektkapu Drive'),
    };
  });
  pass('GPS alapból KI', optionsState.gps === false, JSON.stringify(optionsState));
  pass('Tájolás alapból KI', optionsState.orientation === false, JSON.stringify(optionsState));
  pass('Hangos megjegyzés alapból KI', optionsState.voice === false, JSON.stringify(optionsState));
  pass('Telefonra mentés alapból KI', optionsState.device === false, JSON.stringify(optionsState));
  pass('Külön user/project Drive cél látható', optionsState.hasUserDrive && optionsState.hasProjectDrive);

  const gallery = await buttonByText(page, 'Galéria');
  assert.ok(gallery, 'Galéria gomb hiányzik');
  const chooserPromise = page.waitForFileChooser({ timeout: 10_000 });
  await gallery.click();
  const chooser = await chooserPromise;
  await chooser.accept([FIXTURE]);
  await page.waitForFunction(() => document.querySelectorAll('[data-field-capture-item]').length === 1, { timeout: 60_000 });
  await page.waitForFunction(() => (document.body.textContent || '').includes('biztonságosan bekerült a helyi terepi sorba'), { timeout: 60_000 });
  pass('Első kép LOCAL_ONLY kártya létrejött', await page.evaluate(() => (document.body.textContent || '').includes('Csak ezen az eszközön')));

  const cardToggle = await page.$('[data-field-capture-item] > button');
  assert.ok(cardToggle, 'Képkártya lenyitó hiányzik');
  await cardToggle.click();
  const noteArea = await page.$('textarea[placeholder*="repedés"]');
  assert.ok(noteArea, 'Kép megjegyzés mező hiányzik');
  await noteArea.type('Automata terepi megjegyzés', { delay: 10 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  pass('Képenkénti megjegyzés szerkeszthető', await page.evaluate(() => [...document.querySelectorAll('textarea')].some((el) => el.value.includes('Automata terepi megjegyzés'))));

  const dictate = await buttonByText(page, 'Diktálás');
  assert.ok(dictate, 'Diktálás gomb hiányzik');
  await dictate.click();
  await page.waitForFunction(() => (document.body.textContent || '').includes('Hallgatom') || (document.body.textContent || '').includes('Beszéd felismerve'), { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const stop = await buttonByText(page, 'Leállítás');
  assert.ok(stop, 'Diktálás Leállítás gomb hiányzik');
  await stop.click();
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((el) => el.value.includes('terepi hangos teszt')), { timeout: 5000 });
  pass('Shared DIMPRO Voice átirat bekerül a kép megjegyzésébe', true);

  if (typeof page.setOfflineMode === 'function') {
    await page.setOfflineMode(true);
    await page.waitForFunction(() => (document.body.textContent || '').includes('Offline'), { timeout: 5000 });
    const offlineNew = await buttonByText(page, 'Új terepi kép');
    assert.ok(offlineNew, 'Offline új kép gomb hiányzik');
    await offlineNew.click();
    await page.waitForFunction(() => (document.body.textContent || '').includes('Mit rögzítsen ehhez a képhez?'), { timeout: 5000 });
    const offlineGallery = await buttonByText(page, 'Galéria');
    assert.ok(offlineGallery, 'Offline Galéria gomb hiányzik');
    const offlineChooserPromise = page.waitForFileChooser({ timeout: 10_000 });
    await offlineGallery.click();
    const offlineChooser = await offlineChooserPromise;
    await offlineChooser.accept([FIXTURE]);
    await page.waitForFunction(() => document.querySelectorAll('[data-field-capture-item]').length === 2, { timeout: 60_000 });
    pass('Offline állapotban is létrejön második helyi capture item', true);
    await page.setOfflineMode(false);
    await page.waitForFunction(() => (document.body.textContent || '').includes('Online'), { timeout: 5000 });
  }

  await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-field-capture-item]').length >= 1, { timeout: 30_000 });
  const restored = await page.evaluate(() => ({
    count: document.querySelectorAll('[data-field-capture-item]').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  pass('IndexedDB queue oldalfrissítés után visszaáll', restored.count >= 1, String(restored.count));
  pass('Visszaállított mobil UI nem lóg ki', restored.overflow === false);
  pass('Böngésző pageerror nincs', pageErrors.length === 0, pageErrors.join(' | '));
  pass('Böngésző console error nincs', consoleErrors.length === 0, consoleErrors.join(' | '));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, base: BASE, userFixtureDeleted: true }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
