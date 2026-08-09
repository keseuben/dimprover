#!/usr/bin/env node

import puppeteer from "puppeteer";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = (process.env.DROP_TEST_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
const reportDir = path.join(process.cwd(), ".dimprover", "validation");
const reportFile = path.join(reportDir, "drop-v100-accessibility.json");
const pages = ["/", "/open", "/send", "/d/invalid-token", "/u/invalid-token"];
const viewports = [
  { id: "desktop", width: 1280, height: 900, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true },
];
const results = [];
let browser;

function normalizeConsoleError(text) {
  return text.includes("ERR_ABORTED") || text.includes("favicon.ico") ? "" : text;
}

try {
  const args = ["--no-sandbox", "--disable-setuid-sandbox"];
  if (baseUrl.includes("drop.dimpro.hu:") && baseUrl.startsWith("http://")) {
    args.push("--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1");
  }
  browser = await puppeteer.launch({ headless: true, args });

  for (const viewport of viewports) {
    for (const pagePath of pages) {
      const page = await browser.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const normalized = normalizeConsoleError(message.text());
        if (normalized) consoleErrors.push(normalized);
      });
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1,
        hasTouch: viewport.isMobile,
      });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: viewport.id === "mobile" ? "dark" : "light" }]);
      const started = Date.now();
      const response = await page.goto(`${baseUrl}${pagePath}?drop-v100-a11y=1`, { waitUntil: "networkidle2", timeout: 120_000 });
      await new Promise((resolve) => setTimeout(resolve, 900));

      const audit = await page.evaluate(() => {
        function visible(element) {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
        }
        function nameOf(element) {
          const ariaLabel = element.getAttribute("aria-label")?.trim();
          if (ariaLabel) return ariaLabel;
          const labelledBy = element.getAttribute("aria-labelledby")?.trim();
          if (labelledBy) {
            const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || "").filter(Boolean).join(" ");
            if (text) return text;
          }
          const labels = "labels" in element && element.labels ? [...element.labels].map((label) => label.textContent?.trim() || "").filter(Boolean).join(" ") : "";
          if (labels) return labels;
          return (element.textContent || element.getAttribute("title") || element.getAttribute("alt") || element.getAttribute("placeholder") || element.getAttribute("value") || "").trim();
        }
        function parseRgb(value) {
          const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/i);
          if (!match) return null;
          return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
        }
        function backgroundFor(element) {
          let current = element;
          while (current) {
            const style = getComputedStyle(current);
            if (style.backgroundImage && style.backgroundImage !== "none") return null;
            const parsed = parseRgb(style.backgroundColor);
            if (parsed && parsed.a > 0.95) return parsed;
            current = current.parentElement;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        }
        function luminance(color) {
          const channel = (value) => {
            const normalized = value / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
        }
        function ratio(a, b) {
          const first = luminance(a);
          const second = luminance(b);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        }

        const interactive = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]")].filter(visible);
        const unnamed = interactive.filter((element) => !nameOf(element)).slice(0, 20).map((element) => ({ tag: element.tagName, html: element.outerHTML.slice(0, 240) }));
        const unlabeledControls = [...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter(visible).filter((element) => !nameOf(element)).slice(0, 20).map((element) => ({ tag: element.tagName, type: element.getAttribute("type"), html: element.outerHTML.slice(0, 240) }));
        const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(visible).filter((image) => !image.hasAttribute("alt")).slice(0, 20).map((image) => image.outerHTML.slice(0, 240));
        const lowContrast = [];
        const candidates = [...document.querySelectorAll("p,span,a,button,label,h1,h2,h3,h4,h5,strong,small")]
          .filter(visible)
          .filter((element) => !(element instanceof HTMLButtonElement && element.disabled))
          .filter((element) => element.getAttribute("aria-disabled") !== "true")
          .slice(0, 500);
        for (const element of candidates) {
          const text = (element.textContent || "").trim().replace(/\s+/g, " ");
          if (!text || text === "–" || text.length > 300) continue;
          const style = getComputedStyle(element);
          const foreground = parseRgb(style.color);
          const background = backgroundFor(element);
          if (!foreground || !background || foreground.a < 0.95) continue;
          const fontSize = Number.parseFloat(style.fontSize) || 16;
          const weight = Number.parseInt(style.fontWeight, 10) || 400;
          const minimum = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700) ? 3 : 4.5;
          const actual = ratio(foreground, background);
          if (actual + 0.05 < minimum) lowContrast.push({ text: text.slice(0, 80), ratio: Number(actual.toFixed(2)), minimum, color: style.color, background: style.backgroundColor });
          if (lowContrast.length >= 20) break;
        }
        return {
          title: document.title,
          url: location.href,
          interactiveCount: interactive.length,
          unnamed,
          unlabeledControls,
          imagesWithoutAlt,
          lowContrast,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      const focusSequence = [];
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return "";
          return `${active.tagName.toLowerCase()}:${active.getAttribute("aria-label") || active.textContent?.trim() || active.getAttribute("name") || active.getAttribute("href") || active.id || "unnamed"}`.slice(0, 180);
        });
        if (focused) focusSequence.push(focused);
      }

      const hardErrors = [];
      if (!response || response.status() !== 200) hardErrors.push(`HTTP ${response?.status() ?? "nincs"}`);
      if (audit.overflow) hardErrors.push(`Vízszintes overflow: ${audit.scrollWidth}/${audit.width}`);
      if (audit.unnamed.length) hardErrors.push(`${audit.unnamed.length} névtelen interaktív elem`);
      if (audit.unlabeledControls.length) hardErrors.push(`${audit.unlabeledControls.length} címke nélküli mező`);
      if (audit.imagesWithoutAlt.length) hardErrors.push(`${audit.imagesWithoutAlt.length} alt nélküli kép`);
      if (pageErrors.length) hardErrors.push(`${pageErrors.length} pageerror`);
      if (consoleErrors.length) hardErrors.push(`${consoleErrors.length} konzolhiba`);
      if (audit.interactiveCount > 0 && new Set(focusSequence).size < Math.min(2, audit.interactiveCount)) hardErrors.push("A billentyűzetes fókuszsorrend nem járható be");

      results.push({
        id: `${viewport.id}:${pagePath}`,
        viewport,
        pagePath,
        status: hardErrors.length ? "failed" : audit.lowContrast.length ? "warning" : "passed",
        durationMs: Date.now() - started,
        hardErrors,
        pageErrors,
        consoleErrors,
        focusSequence,
        audit,
      });
      await page.close();
    }
  }

  const zoomPage = await browser.newPage();
  await zoomPage.setViewport({ width: 640, height: 900, deviceScaleFactor: 1 });
  const zoomResponse = await zoomPage.goto(`${baseUrl}/send?drop-v100-zoom=200`, { waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const zoomAudit = await zoomPage.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    title: document.title,
  }));
  results.push({
    id: "zoom200-equivalent:/send",
    viewport: { id: "zoom200-equivalent", width: 640, height: 900, isMobile: false },
    pagePath: "/send",
    status: zoomResponse?.status() === 200 && !zoomAudit.overflow ? "passed" : "failed",
    durationMs: 0,
    hardErrors: zoomResponse?.status() !== 200 ? [`HTTP ${zoomResponse?.status() ?? "nincs"}`] : zoomAudit.overflow ? [`Vízszintes overflow: ${zoomAudit.scrollWidth}/${zoomAudit.width}`] : [],
    pageErrors: [],
    consoleErrors: [],
    focusSequence: [],
    audit: zoomAudit,
  });
  await zoomPage.close();
} finally {
  if (browser) await browser.close();
}

const summary = {
  passed: results.filter((item) => item.status === "passed").length,
  warning: results.filter((item) => item.status === "warning").length,
  failed: results.filter((item) => item.status === "failed").length,
  total: results.length,
};
const report = {
  version: 1,
  targetVersion: "DROP 1.0.0",
  baseUrl,
  generatedAt: new Date().toISOString(),
  overallStatus: summary.failed > 0 ? "failed" : summary.warning > 0 ? "warning" : "passed",
  summary,
  results,
};
await mkdir(reportDir, { recursive: true, mode: 0o700 });
const temporary = `${reportFile}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await rename(temporary, reportFile);
console.log(JSON.stringify({ overallStatus: report.overallStatus, summary, failures: results.filter((item) => item.status === "failed").map((item) => ({ id: item.id, hardErrors: item.hardErrors })), warnings: results.filter((item) => item.status === "warning").map((item) => ({ id: item.id, lowContrast: item.audit.lowContrast?.slice(0, 5) || [] })) }, null, 2));
if (summary.failed > 0) process.exitCode = 1;
