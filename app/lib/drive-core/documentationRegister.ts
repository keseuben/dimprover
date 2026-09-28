import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { DriveDocument, DriveDocumentVersion, DriveFolder } from "./types";
import type { DriveEngineeringMetadata } from "./workspaceRepository";

type RegisterFile = {
  document: DriveDocument;
  version: DriveDocumentVersion;
  zipName: string;
  metadata?: DriveEngineeringMetadata | null;
};

type RegisterSkipped = {
  name: string;
  reason: string;
};

type RegisterInput = {
  projectId: string;
  projectCode?: string;
  projectName?: string;
  packageId: string;
  generatedAt: string;
  actorUserId: string;
  actorDisplayName?: string;
  rootFolder: DriveFolder;
  folders: DriveFolder[];
  files: RegisterFile[];
  skipped: RegisterSkipped[];
  totalBytes: number;
};

type StyleCell = XLSX.CellObject & { s?: Record<string, unknown> };

const TITLE_STYLE = {
  font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } },
  alignment: { horizontal: "left", vertical: "center" },
};

const SUBTITLE_STYLE = {
  font: { bold: true, sz: 11, color: { rgb: "1F4E78" } },
  fill: { patternType: "solid", fgColor: { rgb: "D9EAF7" } },
  alignment: { vertical: "center", wrapText: true },
};

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "2F75B5" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "D9E2F3" } },
    bottom: { style: "thin", color: { rgb: "D9E2F3" } },
    left: { style: "thin", color: { rgb: "D9E2F3" } },
    right: { style: "thin", color: { rgb: "D9E2F3" } },
  },
};

const FOLDER_HEADER_STYLE = {
  ...HEADER_STYLE,
  fill: { patternType: "solid", fgColor: { rgb: "548235" } },
};

const TECH_HEADER_STYLE = {
  ...HEADER_STYLE,
  fill: { patternType: "solid", fgColor: { rgb: "666666" } },
};

const INFO_LABEL_STYLE = {
  font: { bold: true, color: { rgb: "44546A" } },
  fill: { patternType: "solid", fgColor: { rgb: "EAF2F8" } },
  alignment: { vertical: "top", wrapText: true },
};

const SECTION_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "5B9BD5" } },
  alignment: { vertical: "center" },
};

const BODY_WRAP_STYLE = {
  alignment: { vertical: "top", wrapText: true },
};
const CUSTOM_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="0"/>
  <fonts count="5">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F4E78"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF44546A"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2F75B5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF548235"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF666666"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF5B9BD5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="8" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="TableStyleMedium4"/>
</styleSheet>`;

function withCellStyle(xml: string, ref: string, styleId: number) {
  const pattern = new RegExp(`<c([^>]*\\br="${ref}"[^>]*?)(\\/?)>`);
  return xml.replace(pattern, (_match, attrs: string, closing: string) => {
    const clean = attrs.replace(/\\s+s="\\d+"/g, "");
    return `<c${clean} s="${styleId}"${closing}>`;
  });
}

function styleRange(xml: string, startRow: number, endRow: number, startColumn: number, endColumn: number, styleId: number) {
  let output = xml;
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      output = withCellStyle(output, XLSX.utils.encode_cell({ r: row - 1, c: column }), styleId);
    }
  }
  return output;
}

function freezeRows(xml: string, split: number, topLeftCell: string) {
  const pane = `<pane ySplit="${split}" topLeftCell="${topLeftCell}" activePane="bottomLeft" state="frozen"/>`;
  if (/<sheetView\\b[^>]*\\/>/.test(xml)) {
    return xml.replace(/<sheetView\\b([^>]*)\\/>/, `<sheetView$1>${pane}</sheetView>`);
  }
  if (/<sheetView\\b[^>]*>/.test(xml) && !/<pane\\b/.test(xml)) {
    return xml.replace(/(<sheetView\\b[^>]*>)/, `$1${pane}`);
  }
  return xml;
}

function registerFolderDepth(input: RegisterInput) {
  const displaySegments = buildRelativeDisplaySegments(input.rootFolder, input.folders);
  return Math.max(1, ...input.files.map((item) => displaySegments.get(item.document.folderId)?.length || 1));
}

function folderStructureShape(input: RegisterInput) {
  const byId = new Map(input.folders.map((folder) => [folder.id, folder]));
  const descendants = input.folders.filter((folder) => {
    let current: DriveFolder | undefined = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === input.rootFolder.id) return true;
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return false;
  });
  const displaySegments = buildRelativeDisplaySegments(input.rootFolder, descendants);
  return {
    count: descendants.length,
    depth: Math.max(1, ...descendants.map((folder) => displaySegments.get(folder.id)?.length || 1)),
  };
}

async function applyOoxmlFormatting(buffer: Buffer, input: RegisterInput) {
  const archive = await JSZip.loadAsync(buffer);
  archive.file("xl/styles.xml", CUSTOM_STYLES_XML);

  const sheet1File = archive.file("xl/worksheets/sheet1.xml");
  const sheet2File = archive.file("xl/worksheets/sheet2.xml");
  const sheet3File = archive.file("xl/worksheets/sheet3.xml");
  if (!sheet1File || !sheet2File || !sheet3File) return buffer;

  const registerDepth = registerFolderDepth(input);
  const registerColumnCount = registerDepth + 21;
  const registerTechnicalStart = registerDepth + 13;
  let sheet1 = await sheet1File.async("string");
  sheet1 = withCellStyle(sheet1, "A1", 1);
  sheet1 = withCellStyle(sheet1, "A2", 2);
  sheet1 = styleRange(sheet1, 3, 6, 0, registerColumnCount - 1, 8);
  sheet1 = styleRange(sheet1, 8, 8, 0, registerColumnCount - 1, 3);
  sheet1 = styleRange(sheet1, 8, 8, 0, registerDepth - 1, 4);
  sheet1 = styleRange(sheet1, 8, 8, registerTechnicalStart, registerColumnCount - 1, 5);
  if (input.files.length) sheet1 = styleRange(sheet1, 9, 8 + input.files.length, 0, registerColumnCount - 1, 8);
  sheet1 = freezeRows(sheet1, 8, "A9");
  archive.file("xl/worksheets/sheet1.xml", sheet1);

  const structure = folderStructureShape(input);
  const structureColumnCount = structure.depth + 6;
  let sheet2 = await sheet2File.async("string");
  sheet2 = withCellStyle(sheet2, "A1", 1);
  sheet2 = styleRange(sheet2, 4, 4, 0, structureColumnCount - 1, 3);
  sheet2 = styleRange(sheet2, 4, 4, 0, structure.depth - 1, 4);
  sheet2 = styleRange(sheet2, 4, 4, structure.depth + 2, structureColumnCount - 1, 5);
  if (structure.count) sheet2 = styleRange(sheet2, 5, 4 + structure.count, 0, structureColumnCount - 1, 8);
  sheet2 = freezeRows(sheet2, 4, "A5");
  archive.file("xl/worksheets/sheet2.xml", sheet2);

  let sheet3 = await sheet3File.async("string");
  sheet3 = withCellStyle(sheet3, "A1", 1);
  sheet3 = styleRange(sheet3, 3, 14, 0, 0, 6);
  sheet3 = styleRange(sheet3, 3, 14, 1, 1, 8);
  sheet3 = withCellStyle(sheet3, "A16", 7);
  sheet3 = styleRange(sheet3, 17, 17, 0, 1, 3);
  sheet3 = styleRange(sheet3, 18, 17 + Math.max(1, input.skipped.length), 0, 1, 8);
  archive.file("xl/worksheets/sheet3.xml", sheet3);

  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function applyStyle(ws: XLSX.WorkSheet, ref: string, style: Record<string, unknown>) {
  const cell = ws[ref] as StyleCell | undefined;
  if (cell) cell.s = style;
}

function applyRowStyle(ws: XLSX.WorkSheet, rowIndexZeroBased: number, columnCount: number, style: Record<string, unknown>) {
  for (let column = 0; column < columnCount; column += 1) {
    applyStyle(ws, XLSX.utils.encode_cell({ r: rowIndexZeroBased, c: column }), style);
  }
}

function displayName(metadata: DriveEngineeringMetadata | null | undefined, document: DriveDocument, version: DriveDocumentVersion) {
  const extra = metadata?.extra || {};
  const candidate = [extra.displayName, extra.planTitle, extra.drawingTitle]
    .find((value) => typeof value === "string" && value.trim());
  if (typeof candidate === "string") return candidate.trim();
  return (version.originalName || document.name).replace(/\.[^.]+$/, "");
}

function scales(metadata: DriveEngineeringMetadata | null | undefined) {
  const extra = metadata?.extra || {};
  const source = Array.isArray(extra.scales)
    ? extra.scales
    : typeof extra.scale === "string"
      ? [extra.scale]
      : [];
  return source
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function topic(metadata: DriveEngineeringMetadata | null | undefined) {
  const value = metadata?.extra?.topic;
  return typeof value === "string" ? value : "";
}

function originalRelativePath(metadata: DriveEngineeringMetadata | null | undefined, version: DriveDocumentVersion) {
  const value = metadata?.extra?.originalRelativePath;
  return typeof value === "string" && value.trim() ? value.trim() : version.originalName;
}

function bytesToMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 1000) / 1000;
}

function humanDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildRelativeDisplaySegments(root: DriveFolder, folders: DriveFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result = new Map<string, string[]>();

  const resolve = (folder: DriveFolder, visiting = new Set<string>()): string[] => {
    const cached = result.get(folder.id);
    if (cached) return cached;
    if (visiting.has(folder.id)) return [folder.displayName || folder.name];
    visiting.add(folder.id);

    if (folder.id === root.id) {
      const value = [folder.displayName || folder.name];
      result.set(folder.id, value);
      visiting.delete(folder.id);
      return value;
    }

    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    const parentSegments = parent ? resolve(parent, visiting) : [];
    const rootIndex = parentSegments.findIndex((segment) => segment === (root.displayName || root.name));
    const normalizedParent = rootIndex >= 0 ? parentSegments.slice(rootIndex) : parentSegments;
    const value = [...normalizedParent, folder.displayName || folder.name];
    result.set(folder.id, value);
    visiting.delete(folder.id);
    return value;
  };

  for (const folder of folders) resolve(folder);
  return result;
}

function buildRegisterSheet(input: RegisterInput) {
  const displaySegments = buildRelativeDisplaySegments(input.rootFolder, input.folders);
  const maxFolderDepth = Math.max(
    1,
    ...input.files.map((item) => displaySegments.get(item.document.folderId)?.length || 1),
  );

  const folderHeaders = Array.from({ length: maxFolderDepth }, (_, index) => index === 0 ? "Főmappa" : `Almappa ${index}`);
  const documentHeaders = [
    "Tervszám",
    "Egyedi megjelenítési név / tervlap neve",
    "Lépték",
    "Revízió",
    "Szakág",
    "Témakör",
    "Dokumentumtípus",
    "Kiadási állapot",
    "Jóváhagyási állapot",
    "Dokumentumállapot",
    "Verzió",
    "Forrás",
    "Fájlméret [MB]",
    "DIMPRO biztonságos fájlnév",
    "Eredeti fájlnév",
    "DIMPRO biztonságos útvonal",
    "Eredeti importútvonal",
    "Dokumentumazonosító",
    "Verzióazonosító",
    "SHA-256",
    "Feltöltés időpontja",
  ];
  const headers = [...folderHeaders, ...documentHeaders];

  const rows: Array<Array<string | number>> = [
    ["DIMPRO – DIGITÁLIS MŰSZAKI DOKUMENTÁCIÓ ÁTADÁSI JEGYZÉKE"],
    [`Projekt: ${input.projectName || input.projectId}`],
    [`Projektkód: ${input.projectCode || "—"}`, `Csomagazonosító: ${input.packageId}`],
    [`Dokumentációs csomag: ${input.rootFolder.displayPath || input.rootFolder.displayName || input.rootFolder.path}`, `Összeállítás: ${humanDate(input.generatedAt)}`],
    [`Letöltést indította: ${input.actorDisplayName || input.actorUserId || "—"}`, `Dokumentumok száma: ${input.files.length} db`],
    [`Összes eredeti méret: ${bytesToMb(input.totalBytes)} MB`, `Kihagyott tételek: ${input.skipped.length} db`],
    [],
    headers,
  ];

  const sorted = [...input.files].sort((a, b) => a.zipName.localeCompare(b.zipName, "hu-HU", { sensitivity: "base" }));
  for (const item of sorted) {
    const metadata = item.metadata || null;
    const segments = displaySegments.get(item.document.folderId) || [input.rootFolder.displayName || input.rootFolder.name];
    const folderCells = Array.from({ length: maxFolderDepth }, (_, index) => segments[index] || "");
    rows.push([
      ...folderCells,
      metadata?.planNo || "",
      displayName(metadata, item.document, item.version),
      scales(metadata),
      metadata?.revision || item.version.revisionCode || "",
      metadata?.discipline || "",
      topic(metadata),
      metadata?.documentType || "",
      metadata?.issueStatus || "",
      metadata?.approvalStatus || "",
      item.document.status,
      `V${item.version.versionNumber}`,
      item.document.source,
      bytesToMb(item.version.sizeBytes),
      item.document.name,
      item.version.originalName || item.document.name,
      item.zipName,
      originalRelativePath(metadata, item.version),
      item.document.id,
      item.version.id,
      item.version.sha256 || "",
      humanDate(item.version.createdAt),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const lastColumn = XLSX.utils.encode_col(headers.length - 1);
  ws["!merges"] = [
    XLSX.utils.decode_range(`A1:${lastColumn}1`),
    XLSX.utils.decode_range(`A2:${lastColumn}2`),
  ];
  ws["!autofilter"] = { ref: `A8:${lastColumn}${Math.max(8, rows.length)}` };
  ws["!cols"] = headers.map((header, index) => {
    if (index < maxFolderDepth) return { wch: 24 };
    if (header === "Egyedi megjelenítési név / tervlap neve") return { wch: 42 };
    if (header.includes("útvonal")) return { wch: 44 };
    if (header.includes("fájlnév")) return { wch: 38 };
    if (header.includes("azonosító") || header === "SHA-256") return { wch: 28 };
    if (header === "Lépték") return { wch: 18 };
    if (header === "Feltöltés időpontja") return { wch: 20 };
    return { wch: 17 };
  });
  ws["!rows"] = [{ hpt: 27 }, { hpt: 22 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 34 }];

  applyStyle(ws, "A1", TITLE_STYLE);
  applyStyle(ws, "A2", SUBTITLE_STYLE);
  for (let row = 2; row <= 5; row += 1) applyRowStyle(ws, row, headers.length, BODY_WRAP_STYLE);
  applyRowStyle(ws, 7, headers.length, HEADER_STYLE);
  for (let column = 0; column < maxFolderDepth; column += 1) {
    applyStyle(ws, XLSX.utils.encode_cell({ r: 7, c: column }), FOLDER_HEADER_STYLE);
  }
  const technicalStart = maxFolderDepth + documentHeaders.indexOf("DIMPRO biztonságos fájlnév");
  for (let column = technicalStart; column < headers.length; column += 1) {
    applyStyle(ws, XLSX.utils.encode_cell({ r: 7, c: column }), TECH_HEADER_STYLE);
  }
  for (let row = 8; row < rows.length; row += 1) applyRowStyle(ws, row, headers.length, BODY_WRAP_STYLE);

  return ws;
}

function buildFolderStructureSheet(input: RegisterInput) {
  const byId = new Map(input.folders.map((folder) => [folder.id, folder]));
  const descendants = input.folders.filter((folder) => {
    let current: DriveFolder | undefined = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === input.rootFolder.id) return true;
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return false;
  });

  const displaySegments = buildRelativeDisplaySegments(input.rootFolder, descendants);
  const maxDepth = Math.max(1, ...descendants.map((folder) => displaySegments.get(folder.id)?.length || 1));
  const levelHeaders = Array.from({ length: maxDepth }, (_, index) => index === 0 ? "Főmappa" : `Almappa ${index}`);
  const headers = [...levelHeaders, "Megjelenítési név", "Eredeti mappanév", "DIMPRO technikai mappanév", "Megjelenítési útvonal", "Technikai útvonal", "Mappaazonosító"];

  const rows: Array<Array<string | number>> = [
    ["DIMPRO – MAPPASTRUKTÚRA"],
    [`Csomagazonosító: ${input.packageId}`],
    [],
    headers,
  ];

  for (const folder of descendants.sort((a, b) => (a.displayPath || a.path).localeCompare(b.displayPath || b.path, "hu-HU"))) {
    const segments = displaySegments.get(folder.id) || [folder.displayName || folder.name];
    const levelCells = Array.from({ length: maxDepth }, (_, index) => segments[index] || "");
    rows.push([
      ...levelCells,
      folder.displayName || folder.name,
      folder.originalName || folder.name,
      folder.safeName || folder.name,
      folder.displayPath || folder.path,
      folder.path,
      folder.id,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const lastColumn = XLSX.utils.encode_col(headers.length - 1);
  ws["!merges"] = [XLSX.utils.decode_range(`A1:${lastColumn}1`)];
  ws["!autofilter"] = { ref: `A4:${lastColumn}${Math.max(4, rows.length)}` };
  ws["!cols"] = headers.map((header, index) => {
    if (index < maxDepth) return { wch: 24 };
    if (header.includes("útvonal")) return { wch: 48 };
    if (header.includes("név")) return { wch: 34 };
    return { wch: 28 };
  });
  ws["!rows"] = [{ hpt: 27 }, { hpt: 20 }, { hpt: 8 }, { hpt: 32 }];
  applyStyle(ws, "A1", TITLE_STYLE);
  applyRowStyle(ws, 3, headers.length, HEADER_STYLE);
  for (let column = 0; column < maxDepth; column += 1) {
    applyStyle(ws, XLSX.utils.encode_cell({ r: 3, c: column }), FOLDER_HEADER_STYLE);
  }
  for (let column = maxDepth + 2; column < headers.length; column += 1) {
    applyStyle(ws, XLSX.utils.encode_cell({ r: 3, c: column }), TECH_HEADER_STYLE);
  }
  for (let row = 4; row < rows.length; row += 1) applyRowStyle(ws, row, headers.length, BODY_WRAP_STYLE);
  return ws;
}

function buildPackageInfoSheet(input: RegisterInput) {
  const rows: Array<Array<string | number>> = [
    ["DIMPRO – DIGITÁLIS MŰSZAKI DOKUMENTÁCIÓ ÁTADÁSI JEGYZÉKE"],
    [],
    ["Projekt", input.projectName || input.projectId],
    ["Projektkód", input.projectCode || "—"],
    ["Projektazonosító", input.projectId],
    ["Dokumentációs csomag", input.rootFolder.displayPath || input.rootFolder.displayName || input.rootFolder.path],
    ["Csomagazonosító", input.packageId],
    ["Összeállítás időpontja", humanDate(input.generatedAt)],
    ["Letöltést indította", input.actorDisplayName || "—"],
    ["Dokumentumok száma", input.files.length],
    ["Kihagyott tételek", input.skipped.length],
    ["Összes eredeti méret [MB]", bytesToMb(input.totalBytes)],
    ["Rendszer", "DIMPRO Drive"],
    ["Dokumentációjegyzék formátum", "V1"],
    [],
    ["Kihagyott tételek"],
    ["Fájlnév", "Kihagyás oka"],
  ];
  if (input.skipped.length) {
    for (const item of input.skipped) rows.push([item.name, item.reason]);
  } else {
    rows.push(["—", "Nincs kihagyott tétel."]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = [XLSX.utils.decode_range("A1:D1"), XLSX.utils.decode_range("A16:D16")];
  ws["!cols"] = [{ wch: 30 }, { wch: 62 }, { wch: 20 }, { wch: 20 }];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 8 }];
  applyStyle(ws, "A1", TITLE_STYLE);
  for (let row = 2; row <= 13; row += 1) {
    applyStyle(ws, `A${row + 1}`, INFO_LABEL_STYLE);
    applyStyle(ws, `B${row + 1}`, BODY_WRAP_STYLE);
  }
  applyStyle(ws, "A16", SECTION_STYLE);
  applyRowStyle(ws, 16, 2, HEADER_STYLE);
  for (let row = 17; row < rows.length; row += 1) applyRowStyle(ws, row, 2, BODY_WRAP_STYLE);
  return ws;
}

export async function buildDigitalDocumentationRegister(input: RegisterInput) {
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "DIMPRO Digitális műszaki dokumentáció átadási jegyzéke",
    Subject: input.projectName || input.projectId,
    Author: "DIMPRO Drive",
    Company: "DIMPRO",
    CreatedDate: new Date(input.generatedAt),
  };

  XLSX.utils.book_append_sheet(workbook, buildRegisterSheet(input), "Dokumentációjegyzék");
  XLSX.utils.book_append_sheet(workbook, buildFolderStructureSheet(input), "Mappastruktúra");
  XLSX.utils.book_append_sheet(workbook, buildPackageInfoSheet(input), "Csomaginformációk");

  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    cellStyles: true,
  });
  const baseBuffer = Buffer.isBuffer(output) ? output : Buffer.from(output);
  return applyOoxmlFormatting(baseBuffer, input);
}

export const DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME = "DIMPRO_Digitalis_Dokumentaciojegyzek.xlsx";
