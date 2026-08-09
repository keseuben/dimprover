import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";

const baseUrl = process.env.DROP_SPACES_BROWSER_BASE_URL || "http://license.dimpro.hu:3224";
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const screenshotsEnabled = process.env.DROP_SPACES_SCREENSHOTS === "true";

function parseRgb(value) {
  const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) return rgbMatch.slice(1, 4).map(Number);
  const srgbMatch = value.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if (srgbMatch) return srgbMatch.slice(1, 4).map((channel) => Math.round(Number(channel) * 255));
  throw new Error(`Nem értelmezhető szín: ${value}`);
}

function luminance([r, g, b]) {
  const values = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(foreground, background) {
  const left = luminance(parseRgb(foreground));
  const right = luminance(parseRgb(background));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1,MAP drop.dimpro.hu 127.0.0.1",
  ],
});

try {
  const page = await browser.newPage();
  await page.setJavaScriptEnabled(false);
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const cardMarkup = `
    <div class="dimpro-admin-shell admin-theme-light" data-theme="light">
      <div class="dimpro-admin-content">
        <main class="min-h-screen px-5 py-8">
          <div class="mx-auto max-w-6xl">
            <a id="drop-card" href="#" class="dimpro-drop-launcher-card group block rounded-[2rem] border p-6 transition">
              <p id="drop-eyebrow" class="dimpro-drop-launcher-card__eyebrow text-xs font-semibold uppercase tracking-[0.25em]">DIMPRO Drop</p>
              <h2 id="drop-title" class="dimpro-drop-launcher-card__title mt-3 text-3xl font-black">Drop hozzáférési tér</h2>
              <p id="drop-description" class="dimpro-drop-launcher-card__description mt-3 text-sm font-medium leading-7">Projektalapú hozzáférések, meghívott tagok és a téren belül létrehozott kép-, fájl- és dokumentumcsomagok kezelése.</p>
              <div id="drop-button" class="dimpro-drop-launcher-card__button mt-5 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm">Drop csomagkezelő megnyitása →</div>
            </a>
          </div>
        </main>
      </div>
    </div>`;

  async function measureTheme(theme) {
    await page.evaluate(({ markup, theme }) => {
      document.body.innerHTML = markup;
      document.documentElement.dataset.adminTheme = theme;
      document.documentElement.style.colorScheme = theme;
      const shell = document.querySelector(".dimpro-admin-shell");
      shell?.classList.toggle("admin-theme-light", theme === "light");
      shell?.classList.toggle("admin-theme-dark", theme === "dark");
      shell?.setAttribute("data-theme", theme);
    }, { markup: cardMarkup, theme });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const styles = await page.evaluate(() => {
      const card = getComputedStyle(document.querySelector("#drop-card"));
      const eyebrow = getComputedStyle(document.querySelector("#drop-eyebrow"));
      const title = getComputedStyle(document.querySelector("#drop-title"));
      const description = getComputedStyle(document.querySelector("#drop-description"));
      const button = getComputedStyle(document.querySelector("#drop-button"));
      return {
        cardBackground: card.backgroundColor,
        eyebrowColor: eyebrow.color,
        titleColor: title.color,
        descriptionColor: description.color,
        buttonBackground: button.backgroundColor,
        buttonColor: button.color,
      };
    });
    const result = {
      theme,
      ...styles,
      eyebrowContrast: contrast(styles.eyebrowColor, styles.cardBackground),
      titleContrast: contrast(styles.titleColor, styles.cardBackground),
      descriptionContrast: contrast(styles.descriptionColor, styles.cardBackground),
      buttonContrast: contrast(styles.buttonColor, styles.buttonBackground),
    };
    assert.ok(result.eyebrowContrast >= 4.5, `${theme}: felső címke kontraszt ${result.eyebrowContrast.toFixed(2)}`);
    assert.ok(result.titleContrast >= 7, `${theme}: főcím kontraszt ${result.titleContrast.toFixed(2)}`);
    assert.ok(result.descriptionContrast >= 4.5, `${theme}: leírás kontraszt ${result.descriptionContrast.toFixed(2)}`);
    assert.ok(result.buttonContrast >= 4.5, `${theme}: gombfelirat kontraszt ${result.buttonContrast.toFixed(2)}`);
    if (screenshotsEnabled) await page.screenshot({ path: `.work_drop_spaces_phase1_card_${theme}.png`, fullPage: true });
    return result;
  }

  const light = await measureTheme("light");
  const dark = await measureTheme("dark");

  const manager = await browser.newPage();
  await manager.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await manager.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    localStorage.setItem("dimpro-admin-theme", "light");
  }, adminKey);
  const browserErrors = [];
  manager.on("pageerror", (error) => browserErrors.push(error.message));
  await manager.goto(`${baseUrl}/drive/drop`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await manager.waitForFunction(() => document.body.innerText.includes("Hozzáférési terek a csomagok fölött"), { timeout: 30_000 });
  await manager.waitForFunction(() => document.body.innerText.includes("Térmotor aktív"), { timeout: 30_000 });
  await manager.waitForFunction(() => document.body.innerText.includes("Új hozzáférési tér"), { timeout: 30_000 });
  const managerResult = await manager.evaluate(() => ({
    hasLicenseOwner: document.body.innerText.includes("Licencgazda"),
    hasMemberships: document.body.innerText.includes("Meghívott tagság"),
    hasPackages: document.body.innerText.includes("Saját csomagok"),
    hasIntegration: document.body.innerText.includes("Door / Dock / Drive"),
    spacesEngineActive: document.body.innerText.includes("Térmotor aktív"),
    hasCreateSpaceButton: document.body.innerText.includes("Új hozzáférési tér"),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  assert.equal(managerResult.hasLicenseOwner, true);
  assert.equal(managerResult.hasMemberships, true);
  assert.equal(managerResult.hasPackages, true);
  assert.equal(managerResult.hasIntegration, true);
  assert.equal(managerResult.spacesEngineActive, true);
  assert.equal(managerResult.hasCreateSpaceButton, true);
  assert.equal(managerResult.horizontalOverflow, false);
  assert.deepEqual(browserErrors, []);
  if (screenshotsEnabled) await manager.screenshot({ path: ".work_drop_spaces_phase1_manager.png", fullPage: true });

  console.log(JSON.stringify({
    ok: true,
    cardContrast: {
      light: {
        eyebrow: Number(light.eyebrowContrast.toFixed(2)),
        title: Number(light.titleContrast.toFixed(2)),
        description: Number(light.descriptionContrast.toFixed(2)),
        button: Number(light.buttonContrast.toFixed(2)),
      },
      dark: {
        eyebrow: Number(dark.eyebrowContrast.toFixed(2)),
        title: Number(dark.titleContrast.toFixed(2)),
        description: Number(dark.descriptionContrast.toFixed(2)),
        button: Number(dark.buttonContrast.toFixed(2)),
      },
    },
    spacesPanel: managerResult,
    browserErrors: browserErrors.length,
  }, null, 2));
} finally {
  await browser.close();
}
