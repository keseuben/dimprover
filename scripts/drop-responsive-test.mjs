#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const baseUrl = process.env.DROP_VISUAL_BASE_URL || "https://drop.dimpro.hu";
const outputDir = process.env.DROP_VISUAL_OUTPUT_DIR || ".work_drop_v020_visual";
const hostResolverRule = process.env.DROP_VISUAL_HOST_RESOLVER_RULE?.trim();

const profiles = [
  { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1 },
  { name: "tablet", width: 820, height: 1180, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
];

await fs.mkdir(outputDir, { recursive: true });
const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
if (hostResolverRule) launchArgs.push(`--host-resolver-rules=${hostResolverRule}`);

const browser = await puppeteer.launch({ headless: true, args: launchArgs });
let failed = 0;

try {
  for (const profile of profiles) {
    const page = await browser.newPage();
    await page.setViewport(profile);
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 60_000 });

    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const bodyText = document.body.innerText;
      const disabledButtons = [...document.querySelectorAll("button:disabled")].length;
      return {
        title: document.title,
        hasHeading: bodyText.includes("Építőipari fájl- és képcsomagok"),
        hasImageDrop: bodyText.includes("KépDrop"),
        hasFileDrop: bodyText.includes("FájlDrop"),
        hasDisabledUpload: bodyText.includes("Feltöltés még tiltva"),
        disabledButtons,
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    const passed =
      result.hasHeading &&
      result.hasImageDrop &&
      result.hasFileDrop &&
      result.hasDisabledUpload &&
      result.disabledButtons >= 4 &&
      !result.horizontalOverflow;

    if (!passed) failed += 1;
    await page.screenshot({ path: path.join(outputDir, `drop-${profile.name}.png`), fullPage: true });
    console.log(`${passed ? "PASS" : "FAIL"} | ${profile.name} | ${JSON.stringify(result)}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`DIMPRO Drop responsive: ${profiles.length - failed}/${profiles.length} sikeres.`);
if (failed) process.exit(1);
