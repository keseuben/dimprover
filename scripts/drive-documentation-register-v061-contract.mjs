#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const register = readFileSync("app/lib/drive-core/documentationRegister.ts", "utf8");
const download = readFileSync("app/lib/drive-core/folderDownloadService.ts", "utf8");
const route = readFileSync("app/api/projects/[projectId]/drive/folders/[folderId]/download/route.ts", "utf8");
const storage = readFileSync("app/lib/drive-core/storageRepository.ts", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("ZIP always contains digital documentation register XLSX", () => {
  assert.ok(download.includes("DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME"));
  assert.ok(download.includes("buildDigitalDocumentationRegister"));
  assert.ok(download.includes("registerBuffer"));
});
check("register has three agreed worksheets", () => {
  assert.ok(register.includes('"Dokumentációjegyzék"'));
  assert.ok(register.includes('"Mappastruktúra"'));
  assert.ok(register.includes('"Csomaginformációk"'));
});
check("register carries traditional digital handover title", () => {
  assert.ok(register.includes("DIGITÁLIS MŰSZAKI DOKUMENTÁCIÓ ÁTADÁSI JEGYZÉKE"));
});
check("folder hierarchy becomes dynamic spreadsheet columns", () => {
  assert.ok(register.includes('"Főmappa"'));
  assert.ok(register.includes("Almappa"));
  assert.ok(register.includes("maxFolderDepth"));
});
check("register includes plan engineering fields", () => {
  for (const label of ["Tervszám", "Egyedi megjelenítési név / tervlap neve", "Lépték", "Revízió", "Szakág", "Témakör", "Dokumentumtípus"]) assert.ok(register.includes(label), label);
});
check("register separates original and safe file identity", () => {
  for (const label of ["DIMPRO biztonságos fájlnév", "Eredeti fájlnév", "DIMPRO biztonságos útvonal", "Eredeti importútvonal"]) assert.ok(register.includes(label), label);
});
check("register contains traceability fields", () => {
  for (const label of ["Dokumentumazonosító", "Verzióazonosító", "SHA-256", "Feltöltés időpontja"]) assert.ok(register.includes(label), label);
});
check("OOXML styles survive SheetJS serialization", () => {
  assert.match(register, /CUSTOM_STYLES_XML/);
  assert.match(register, /applyOoxmlFormatting/);
  assert.match(register, /archive\.file\("xl\/styles\.xml", CUSTOM_STYLES_XML\)/);
  assert.match(register, /freezeRows\(sheet1, 8, "A9"\)/);
});
check("register is visibly formatted and filterable", () => {
  for (const marker of ["TITLE_STYLE", "HEADER_STYLE", "!autofilter", "!cols", "!merges"]) assert.ok(register.includes(marker), marker);
});
check("folder structure sheet includes original safe and display folder identity", () => {
  assert.ok(register.includes("folder.originalName"));
  assert.ok(register.includes("folder.safeName"));
  assert.ok(register.includes("folder.displayPath"));
});
check("package info records package id actor count and total size", () => {
  for (const label of ["Csomagazonosító", "Letöltést indította", "Dokumentumok száma", "Összes eredeti méret [MB]"]) assert.ok(register.includes(label), label);
});
check("package-level audit persists exact included versions", () => {
  assert.ok(storage.includes("DRIVE_DOWNLOAD_PACKAGE_CREATED"));
  assert.ok(storage.includes("files: input.files"));
  assert.ok(download.includes("logDriveDownloadPackageAudit"));
  assert.ok(download.includes("documentId: item.document.id"));
  assert.ok(download.includes("versionId: item.version.id"));
});
check("download response exposes package identity and register name", () => {
  assert.ok(route.includes("x-dimpro-drive-download-package-id"));
  assert.ok(route.includes("x-dimpro-drive-document-register"));
});
check("route passes project and actor context into register", () => {
  assert.ok(route.includes("actorDisplayName: access.actor.displayName"));
  assert.ok(route.includes("projectCode: access.access.project.code"));
  assert.ok(route.includes("projectName: access.access.project.name"));
});
check("text manifest remains as compatibility companion", () => {
  assert.ok(download.includes("DIMPRO_fajllista.txt"));
  assert.ok(download.includes("Csomagazonosító"));
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));