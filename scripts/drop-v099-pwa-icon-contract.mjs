import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const manifest = JSON.parse(await readFile("public/drop.webmanifest", "utf8"));
const layout = await readFile("app/drop/layout.tsx", "utf8");
const shell = await readFile("components/drop/DropPwaShell.tsx", "utf8");
const worker = await readFile("public/drop-sw.js", "utf8");
const proxy = await readFile("proxy.ts", "utf8");
const master = await readFile("public/drop-favicon-master.png");
const files = {
  favicon32: "public/drop-favicon-v099-32.png",
  faviconIco: "public/drop-favicon-v099.ico",
  apple: "public/drop-apple-touch-v099-180.png",
  any192: "public/drop-app-icon-v099-192.png",
  any512: "public/drop-app-icon-v099-512.png",
  maskable512: "public/drop-app-icon-maskable-v099-512.png",
};
let passed = 0;
function check(name, value) { assert.ok(value, name); passed += 1; }
function equal(name, actual, expected) { assert.equal(actual, expected, name); passed += 1; }

const expectedSizes = {
  favicon32: [32, 32], apple: [180, 180], any192: [192, 192], any512: [512, 512], maskable512: [512, 512],
};
for (const [key, path] of Object.entries(files)) {
  const input = await readFile(path);
  check(`${key}-non-empty`, input.length > 500);
  if (key !== "faviconIco") {
    const meta = await sharp(input).metadata();
    equal(`${key}-width`, meta.width, expectedSizes[key][0]);
    equal(`${key}-height`, meta.height, expectedSizes[key][1]);
    equal(`${key}-format`, meta.format, "png");
  }
}
const icoBuffer = await readFile(files.faviconIco);
check("favicon-ico-header", icoBuffer.length > 6 && icoBuffer[0] === 0 && icoBuffer[1] === 0 && icoBuffer[2] === 1 && icoBuffer[3] === 0);
check("favicon-ico-size", icoBuffer.length > 10_000);

for (const [key, size] of [["favicon32",32],["apple",180],["any192",192],["any512",512]]) {
  const expected = await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  const actualRaw = await sharp(await readFile(files[key])).raw().toBuffer();
  const expectedRaw = await sharp(expected).raw().toBuffer();
  equal(`${key}-same-master-pixels`, createHash("sha256").update(actualRaw).digest("hex"), createHash("sha256").update(expectedRaw).digest("hex"));
}
const anyIcons = manifest.icons.filter((item) => item.purpose === "any");
const maskableIcons = manifest.icons.filter((item) => item.purpose === "maskable");
equal("manifest-any-count", anyIcons.length, 2);
equal("manifest-maskable-count", maskableIcons.length, 1);
check("manifest-any-192", anyIcons.some((item) => item.src === "/drop-app-icon-v099-192.png" && item.sizes === "192x192"));
check("manifest-any-512", anyIcons.some((item) => item.src === "/drop-app-icon-v099-512.png" && item.sizes === "512x512"));
check("manifest-maskable-512", maskableIcons.some((item) => item.src === "/drop-app-icon-maskable-v099-512.png" && item.sizes === "512x512"));
check("shortcuts-new-icon", manifest.shortcuts.every((item) => item.icons?.[0]?.src === "/drop-app-icon-v099-192.png"));
check("layout-browser-favicon", layout.includes('/drop-favicon-v099-32.png'));
check("layout-shortcut-ico", layout.includes('/drop-favicon-v099.ico'));
check("layout-apple-touch", layout.includes('/drop-apple-touch-v099-180.png'));
check("layout-pwa-192", layout.includes('/drop-app-icon-v099-192.png'));
check("layout-pwa-512", layout.includes('/drop-app-icon-v099-512.png'));
check("notification-icon", shell.includes('icon: "/drop-app-icon-v099-192.png"'));
check("notification-badge", shell.includes('badge: "/drop-app-icon-v099-192.png"'));
check("worker-new-cache", worker.includes('dimpro-drop-static-v1210'));
for (const file of Object.values(files)) check(`worker-caches-${file}`, worker.includes(`/${file.replace(/^public\//, "")}`));
check("proxy-allows-ico-static", /webmanifest\|ico/.test(proxy));
check("no-old-layout-icons", !/drop-icon-(192|512)\.png/.test(layout));
check("no-old-manifest-icons", !/drop-icon-(192|512)\.png/.test(JSON.stringify(manifest)));
check("no-old-worker-icons", !/drop-icon-(192|512)\.png/.test(worker));
console.log(JSON.stringify({ ok: true, version: "DROP 0.9.9", passed, total: passed, source: "drop-favicon-master.png" }, null, 2));
