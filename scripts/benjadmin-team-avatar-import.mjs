import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import yauzl from "yauzl";
import sharp from "sharp";

const PROJECT_ROOT = process.cwd();
const ASSET_DIR = path.join(PROJECT_ROOT, "public", "benjadmin", "team");
const RESOURCE_ROOT = process.env.DIMPRO_DEV_RESOURCE_ROOT?.trim() || "/srv/dimpro-dev/data/benjadmin-dev-resources";
const RESOURCE_INDEX = path.join(RESOURCE_ROOT, "index.json");
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 500;
const OUTPUT_WIDTH = 768;
const OUTPUT_HEIGHT = 512;

const expected = [
  { key: "01benjadmin", output: "01_BenjAdmin.webp", label: "Benjadmin" },
  { key: "02benai", output: "02_BenAI.webp", label: "Ben-AI" },
  { key: "03arminai", output: "03_ArminAI.webp", label: "Ármin-AI" },
  { key: "04jazminai", output: "04_JazminAI.webp", label: "Jázmin-AI" },
  { key: "05outminai", output: "05_OutminAI.webp", label: "Outmin-AI" },
];

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  let resourceId = "";
  let zipPath = "";
  let apply = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--resource-id") resourceId = args[++i] || "";
    else if (arg === "--apply") apply = true;
    else if (!arg.startsWith("--") && !zipPath) zipPath = arg;
  }
  if (!resourceId && !zipPath) {
    throw new Error("Használat: node scripts/benjadmin-team-avatar-import.mjs <zip-path> [--apply] VAGY --resource-id <devres-id> [--apply]");
  }
  return { resourceId, zipPath, apply };
}

async function resolveResourceZip(resourceId) {
  const raw = await readFile(RESOURCE_INDEX, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error("A Fejlesztési Tár indexe sérült.");
  const item = rows.find((row) => row && row.id === resourceId);
  if (!item) throw new Error(`A Fejlesztési Tárban nincs ilyen resource ID: ${resourceId}`);
  if (String(item.extension || "").toLowerCase() !== "zip") throw new Error("A megadott Fejlesztési Tár elem nem ZIP.");
  const moduleCode = String(item.module || "").replace(/[^a-z0-9-]/gi, "");
  const storedName = path.basename(String(item.storedName || ""));
  const target = path.join(RESOURCE_ROOT, moduleCode, storedName);
  if (!target.startsWith(`${RESOURCE_ROOT}${path.sep}`)) throw new Error("Érvénytelen Fejlesztési Tár útvonal.");
  return target;
}

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zipfile) => {
      if (error || !zipfile) reject(error || new Error("A ZIP nem nyitható meg."));
      else resolve(zipfile);
    });
  });
}

async function readZipEntries(buffer) {
  const zipfile = await openZip(buffer);
  return new Promise((resolve, reject) => {
    const files = [];
    let totalUncompressed = 0;
    const fail = (error) => {
      try { zipfile.close(); } catch {}
      reject(error);
    };
    zipfile.on("error", fail);
    zipfile.on("entry", (entry) => {
      const rawName = entry.fileName;
      const normalizedPath = path.posix.normalize(rawName.replaceAll("\\", "/"));
      const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
      const fileType = unixMode & 0o170000;
      if (rawName.includes("\0") || normalizedPath.startsWith("../") || normalizedPath.startsWith("/") || path.posix.isAbsolute(normalizedPath)) {
        fail(new Error(`Tiltott ZIP útvonal: ${rawName}`));
        return;
      }
      if (fileType === 0o120000) {
        fail(new Error(`Symlink nem engedélyezett a ZIP-ben: ${rawName}`));
        return;
      }
      if (/\/$/.test(rawName)) {
        zipfile.readEntry();
        return;
      }
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        fail(new Error(`Túl nagy ZIP-bejegyzés: ${rawName}`));
        return;
      }
      totalUncompressed += entry.uncompressedSize;
      if (totalUncompressed > MAX_ZIP_BYTES) {
        fail(new Error("A ZIP kibontott összmérete meghaladja a 100 MB biztonsági korlátot."));
        return;
      }
      zipfile.openReadStream(entry, (error, stream) => {
        if (error || !stream) return fail(error || new Error(`Nem olvasható ZIP-bejegyzés: ${rawName}`));
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", fail);
        stream.on("end", () => {
          files.push({ name: rawName, buffer: Buffer.concat(chunks) });
          zipfile.readEntry();
        });
      });
    });
    zipfile.on("end", () => resolve(files));
    zipfile.readEntry();
  });
}

function matchExpected(fileName) {
  const base = path.posix.basename(fileName.replaceAll("\\", "/"));
  const ext = path.extname(base).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return null;
  const normalized = normalizeName(base);
  return expected.find((item) => normalized === item.key || normalized.startsWith(item.key)) || null;
}

async function validateAndRender(files) {
  const matched = new Map();
  for (const file of files) {
    const spec = matchExpected(file.name);
    if (!spec) continue;
    if (matched.has(spec.key)) throw new Error(`Duplikált avatar a ZIP-ben: ${spec.label}`);
    const metadata = await sharp(file.buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      throw new Error(`${spec.label}: a forráskép túl kicsi (${metadata.width || 0}×${metadata.height || 0}); minimum ${MIN_WIDTH}×${MIN_HEIGHT}.`);
    }
    const output = await sharp(file.buffer, { failOn: "error" })
      .rotate()
      .resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fit: "fill", withoutEnlargement: false })
      .webp({ quality: 94, alphaQuality: 100, smartSubsample: true })
      .toBuffer();
    matched.set(spec.key, {
      ...spec,
      sourceName: file.name,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceHasAlpha: Boolean(metadata.hasAlpha),
      sourceSha256: sha256(file.buffer),
      outputSha256: sha256(output),
      outputBytes: output.length,
      output,
    });
  }
  const missing = expected.filter((item) => !matched.has(item.key));
  if (missing.length) throw new Error(`Hiányzó avatar(ok): ${missing.map((item) => item.label).join(", ")}`);
  return expected.map((item) => matched.get(item.key));
}

async function applyAssets(items, sourceZipPath, zipHash) {
  await mkdir(ASSET_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const backupDir = path.join(PROJECT_ROOT, ".dimprover", "backups", `benjadmin-team-avatars-${timestamp}`);
  await mkdir(backupDir, { recursive: true });
  for (const item of items) {
    const current = path.join(ASSET_DIR, item.output);
    try { await copyFile(current, path.join(backupDir, item.output)); } catch {}
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    sourceZipName: path.basename(sourceZipPath),
    sourceZipSha256: zipHash,
    outputWidth: OUTPUT_WIDTH,
    outputHeight: OUTPUT_HEIGHT,
    items: items.map((item) => { const copy = { ...item }; delete copy.output; return copy; }),
  };
  await writeFile(path.join(backupDir, "import-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  for (const item of items) {
    const target = path.join(ASSET_DIR, item.output);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, item.output, { mode: 0o644 });
    await rename(temp, target);
  }
  return backupDir;
}

const { resourceId, zipPath: argZipPath, apply } = parseArgs();
const zipPath = resourceId ? await resolveResourceZip(resourceId) : path.resolve(argZipPath);
const zipStat = await stat(zipPath);
if (!zipStat.isFile()) throw new Error("A megadott ZIP nem fájl.");
if (zipStat.size <= 0 || zipStat.size > MAX_ZIP_BYTES) throw new Error("A ZIP mérete érvénytelen vagy meghaladja a 100 MB korlátot.");
const zipBuffer = await readFile(zipPath);
const zipHash = sha256(zipBuffer);
const entries = await readZipEntries(zipBuffer);
const items = await validateAndRender(entries);
const report = {
  ok: true,
  mode: apply ? "APPLY" : "DRY_RUN",
  zipName: path.basename(zipPath),
  zipSha256: zipHash,
  entries: entries.length,
  avatars: items.map((item) => { const copy = { ...item }; delete copy.output; return copy; }),
};
if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  console.log("DRY RUN kész. Csere nem történt. Alkalmazás: add hozzá a --apply kapcsolót.");
} else {
  const backupDir = await applyAssets(items, zipPath, zipHash);
  console.log(JSON.stringify({ ...report, backupDir }, null, 2));
  console.log("Avatarcsere kész. Következő lépés: tsc + lint + build + DEV restart + browser acceptance.");
}
