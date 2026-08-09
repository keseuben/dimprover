#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE_ROOT = process.env.DIMPRO_RELEASE_ROOT || "/root/dimprover_release_packages";
const FILES_ROOT = path.join(RELEASE_ROOT, "files");
const REGISTRY_PATH = path.join(RELEASE_ROOT, "release-registry.json");
const BASE_URL = (process.env.DIMPRO_RELEASE_DOWNLOAD_BASE_URL || "https://dimprover.hu").replace(/\/$/, "");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function sanitizeFileName(fileName) {
  return path
    .basename(String(fileName || "release-package.zip"))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180) || "release-package.zip";
}

function parseChanges(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function readRegistry() {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.records)) throw new Error("Invalid registry");
    return parsed;
  } catch {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
}

function safeReleasePath(relativePath) {
  const resolved = path.resolve(FILES_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(FILES_ROOT) + path.sep)) {
    throw new Error("Tiltott release fájlútvonal.");
  }
  return resolved;
}

async function main() {
  const args = parseArgs();
  const source = args.file || args.source;

  if (!source) {
    console.error("Használat: node scripts/register-release-package.mjs --file /utvonal/csomag.zip --project DIMPRO_Fajlmuhely --version v3_62 --expires-days 7 --description \"Rövid verzióleírás\" --changes \"Első változás|Második változás\"");
    process.exit(1);
  }

  const sourcePath = path.resolve(String(source));
  const buffer = await readFile(sourcePath);
  const originalName = sanitizeFileName(args.name || path.basename(sourcePath));
  const project = String(args.project || "DIMPRO_Fajlmuhely");
  const version = String(args.version || "unversioned");
  const expiresDays = args["expires-days"] === "never" ? null : Math.max(1, Math.min(Number(args["expires-days"] || 7), 90));
  const token = `rel_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(18).toString("base64url")}`;
  const projectFolder = sanitizeFileName(project);
  const storedFileName = `${token}_${originalName}`;
  const relativeFilePath = path.join(projectFolder, storedFileName);
  const targetPath = safeReleasePath(relativeFilePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = expiresDays === null ? null : new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, buffer);

  const registry = await readRegistry();
  const record = {
    id: token,
    token,
    project,
    version,
    fileName: originalName,
    storedFileName,
    relativeFilePath,
    sizeBytes: buffer.length,
    sha256,
    visibility: "private_token",
    createdAt,
    expiresAt,
    uploadedBy: String(args["uploaded-by"] || "manual-register-script"),
    downloadCount: 0,
    lastDownloadedAt: null,
    title: args.title ? String(args.title) : undefined,
    note: args.note ? String(args.note) : undefined,
    description: args.description ? String(args.description) : undefined,
    changes: parseChanges(args.changes),
  };

  registry.records.unshift(record);
  registry.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

  const result = {
    ok: true,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    expiresAt: record.expiresAt,
    privateFilePath: targetPath,
    downloadPageUrl: `${BASE_URL}/download/${encodeURIComponent(token)}`,
    apiDownloadUrl: `${BASE_URL}/api/downloads/${encodeURIComponent(token)}`,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
