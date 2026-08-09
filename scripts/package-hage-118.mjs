#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const DIST = path.join(ROOT, "dist", "hage-118");
const DEV_DIR = path.join(DIST, "HAGE_DEV_118");
const RUN_DIR = path.join(DIST, "HAGE_RUN_118");
const DEV_ZIP = path.join(DIST, "HAGE_DEV_118.zip");
const RUN_ZIP = path.join(DIST, "HAGE_RUN_118.zip");

const skipBuild = process.argv.includes("--skip-build");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} sikertelen.`);
  }
}

function ensureCleanDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  cpSync(from, to, { recursive: true, force: true });
  return true;
}

function shouldExcludeFromDev(relativePath) {
  const parts = relativePath.split(path.sep);
  const name = parts[0];

  if (["node_modules", ".next", ".git", "dist", "launcher_build"].includes(name)) return true;
  if ([".env", ".env.local", ".env.production", ".env.development"].includes(relativePath)) return true;
  if (relativePath.endsWith(".zip")) return true;
  if (relativePath.endsWith(".tsbuildinfo")) return true;
  if (relativePath.includes(`${path.sep}.next-`)) return true;
  return false;
}

function copyDevTree(sourceDir, targetDir, baseDir = sourceDir) {
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry);
    const relativePath = path.relative(baseDir, sourcePath);
    if (shouldExcludeFromDev(relativePath)) continue;

    const targetPath = path.join(targetDir, relativePath);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyDevTree(sourcePath, targetDir, baseDir);
    } else if (stat.isFile()) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      cpSync(sourcePath, targetPath, { force: true });
    }
  }
}

function writeRunReadme() {
  writeFileSync(
    path.join(RUN_DIR, "README_RUN.txt"),
    [
      "HAGE_RUN_118 – DIMPRO HAGE Munkafelület futtatási csomag",
      "",
      "Ez a csomag a kiadható, OneDrive / SharePoint mappába tehető változat.",
      "A teljes fejlesztői forráskód nem része ennek a csomagnak.",
      "",
      "Indítás:",
      "1. A DIMPRO_HAGE_Indito.exe fájlt kell futtatni / tálcára rögzíteni.",
      "2. Első indításkor a program DIMPRO licenckulcsot kér.",
      "3. A licencellenőrzés alapértelmezett szervere: https://license.dimpro.hu",
      "4. A licenc géphez kötött machineIdHash alapján.",
      "",
      "Fontos:",
      "- A licenckulcs nincs beégetve az indítóba.",
      "- Lejárt, tiltott vagy gépszám-limitet elért licencnél a munkafelület nem indulhat el.",
      "- A RUN csomag nem fejlesztői továbbadásra készült.",
      "",
      "© 2026 DIMPRO.hu – Minden jog fenntartva.",
    ].join("\n"),
    "utf8",
  );
}

function writeLicenseNotice() {
  const text = [
    "© 2026 DIMPRO.hu – Minden jog fenntartva.",
    "A szoftver használata érvényes DIMPRO licenchez kötött.",
    "A felület, a kód és a működési logika engedély nélküli másolása vagy továbbadása tilos.",
    "",
    "Licencszerver: https://license.dimpro.hu",
    "App központ: https://app.dimpro.hu",
    "DIMPROVER enterprise platform: https://dimprover.hu",
  ].join("\n");

  writeFileSync(path.join(RUN_DIR, "LICENSE_NOTICE.txt"), text, "utf8");
  writeFileSync(path.join(DEV_DIR, "LICENSE_NOTICE.txt"), text, "utf8");
}

function prepareDevPackage() {
  ensureCleanDir(DEV_DIR);
  copyDevTree(ROOT, DEV_DIR);
  writeFileSync(
    path.join(DEV_DIR, "HAGE_DEV_118_README.txt"),
    [
      "HAGE_DEV_118 – fejlesztői forráscsomag",
      "",
      "Ez a csomag teljes továbbfejlesztési alap a tulajdonos / ChatGPT fejlesztési munkához.",
      "Nem kiadható felhasználóknak, mert tartalmazza a forráskódot és a launcher_source mappát.",
      "",
      "A .env.local, node_modules, .next, .git és dist mappák szándékosan nincsenek becsomagolva.",
      "Függőségek telepítése: npm install",
      "Build: npm run build",
      "RUN csomag készítése: npm run package:hage:118",
    ].join("\n"),
    "utf8",
  );
}

function prepareRunPackage() {
  ensureCleanDir(RUN_DIR);

  const standaloneDir = path.join(ROOT, ".next", "standalone");
  const staticDir = path.join(ROOT, ".next", "static");
  const publicDir = path.join(ROOT, "public");
  const runtimeDir = path.join(RUN_DIR, "runtime");

  if (!existsSync(standaloneDir)) {
    throw new Error("Hiányzik a .next/standalone mappa. Futtasd előtte: npm run build");
  }

  copyIfExists(standaloneDir, runtimeDir);
  copyIfExists(staticDir, path.join(runtimeDir, ".next", "static"));
  copyIfExists(publicDir, path.join(runtimeDir, "public"));

  const bundledNodeCandidates = [
    path.join(ROOT, "vendor", "node-win-x64"),
    path.join(ROOT, "runtime_vendor", "node-win-x64"),
  ];
  const bundledNodeDir = bundledNodeCandidates.find((candidate) => existsSync(path.join(candidate, "node.exe")));

  if (bundledNodeDir) {
    copyIfExists(bundledNodeDir, path.join(runtimeDir, "node"));
  } else {
    mkdirSync(path.join(runtimeDir, "node"), { recursive: true });
    writeFileSync(
      path.join(runtimeDir, "node", "NODE_RUNTIME_REQUIRED.txt"),
      [
        "Ide kerül a hordozható Windows Node futtató: node.exe",
        "A launcher alapértelmezés szerint ezt indítja: runtime/node/node.exe",
        "A végleges RUN csomaghoz tedd be a vendor/node-win-x64/node.exe futtatót, majd csomagolj újra.",
      ].join("\n"),
      "utf8",
    );
  }

  copyIfExists(
    path.join(ROOT, "launcher_source", "dimpro_hage_license_config.example.json"),
    path.join(RUN_DIR, "dimpro_hage_license_config.json"),
  );

  const exeCandidates = [
    path.join(ROOT, "launcher_build", "DIMPRO_HAGE_Indito.exe"),
    path.join(ROOT, "dist", "win", "DIMPRO_HAGE_Indito.exe"),
    path.join(ROOT, "DIMPRO_HAGE_Indito.exe"),
  ];
  const exeSource = exeCandidates.find((candidate) => existsSync(candidate));

  if (exeSource) {
    copyIfExists(exeSource, path.join(RUN_DIR, "DIMPRO_HAGE_Indito.exe"));
  } else {
    writeFileSync(
      path.join(RUN_DIR, "EXE_BUILD_REQUIRED.txt"),
      [
        "A Windows DIMPRO_HAGE_Indito.exe még nincs a projektben.",
        "A RUN csomag szerkezete elkészült, de a végleges kiadható csomaghoz a Windows EXE-t külön le kell fordítani,",
        "majd a launcher_build/DIMPRO_HAGE_Indito.exe útvonalra kell betenni és újra futtatni a csomagolást.",
        "",
        "Fontos: a launcher_source mappa nem kerülhet a RUN csomagba.",
      ].join("\n"),
      "utf8",
    );
  }

  writeRunReadme();
}

function zipPackage(sourceDir, zipPath) {
  rmSync(zipPath, { force: true });
  run("zip", ["-qr", zipPath, path.basename(sourceDir)], { cwd: path.dirname(sourceDir) });
}

function main() {
  ensureCleanDir(DIST);

  if (!skipBuild) {
    run("npm", ["run", "build"]);
  }

  prepareDevPackage();
  prepareRunPackage();
  writeLicenseNotice();

  zipPackage(DEV_DIR, DEV_ZIP);
  zipPackage(RUN_DIR, RUN_ZIP);

  console.log("\nElkészült csomagok:");
  console.log(DEV_ZIP);
  console.log(RUN_ZIP);
}

main();
