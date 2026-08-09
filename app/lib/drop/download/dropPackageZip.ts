import { Readable } from "node:stream";
import path from "node:path";
import JSZip from "jszip";
import { openDropS3Object } from "../storage/dropS3Storage";

export const DROP_PACKAGE_ZIP_MAX_FILES = 500;
export const DROP_PACKAGE_ZIP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type DropPackageZipFile = {
  id: string;
  displayName: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  storageKey: string;
  storageBucket?: string | null;
  comments?: string[];
  createdAt?: string | null;
  archiveFolder?: string | null;
};

export type DropPackageZipSupplementalFile = {
  name: string;
  data: Buffer | string;
};

function safeArchiveName(value: string) {
  const base = path.basename(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return base && base !== "." ? base : "dimpro-drop-file";
}

function safeArchiveFolder(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function splitName(value: string) {
  const extension = path.extname(value).slice(0, 32);
  const stem = extension ? value.slice(0, -extension.length) : value;
  return { stem: stem || "dimpro-drop-file", extension };
}

export function createUniqueDropZipNames(files: Array<Pick<DropPackageZipFile, "id" | "displayName" | "archiveFolder">>) {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const file of files) {
    const safe = safeArchiveName(file.displayName);
    const folder = safeArchiveFolder(file.archiveFolder);
    const { stem, extension } = splitName(safe);
    let leaf = safe;
    let candidate = folder ? `${folder}/${leaf}` : leaf;
    let counter = 2;
    while (used.has(candidate.toLocaleLowerCase("hu-HU"))) {
      const suffix = ` (${counter})`;
      leaf = `${stem.slice(0, Math.max(1, 180 - extension.length - suffix.length))}${suffix}${extension}`;
      candidate = folder ? `${folder}/${leaf}` : leaf;
      counter += 1;
    }
    used.add(candidate.toLocaleLowerCase("hu-HU"));
    result.set(file.id, candidate);
  }
  return result;
}

type DropZipOpenFile = (file: DropPackageZipFile) => Promise<{ body: AsyncIterable<Uint8Array> }>;

async function defaultOpenFile(file: DropPackageZipFile) {
  const opened = await openDropS3Object({ storageKey: file.storageKey, bucket: file.storageBucket });
  return { body: opened.body as unknown as AsyncIterable<Uint8Array> };
}

function lazyS3Stream(file: DropPackageZipFile, openFile: DropZipOpenFile) {
  return Readable.from((async function* () {
    const opened = await openFile(file);
    for await (const chunk of opened.body) yield chunk;
  })());
}

function buildManifest(input: { title: string; publicCode: string; files: DropPackageZipFile[]; names: Map<string, string> }) {
  const lines = [
    "DIMPRO Drop – csomagfájlok",
    "",
    `Csomag: ${input.title}`,
    `Csomagkód: ${input.publicCode}`,
    `Létrehozva: ${new Date().toLocaleString("hu-HU")}`,
    `Fájlok száma: ${input.files.length}`,
    `Összes méret: ${input.files.reduce((sum, file) => sum + file.sizeBytes, 0)} byte`,
    "",
    "A ZIP kizárólag a teljes ClamAV-vizsgálaton átment és SHA-256 ellenőrzőösszeggel lezárt fájlokat tartalmazza.",
    "",
  ];
  input.files.forEach((file, index) => {
    lines.push(`${index + 1}. ${input.names.get(file.id) || file.displayName}`);
    lines.push(`   Rendezett név: ${file.displayName}`);
    if (file.archiveFolder) lines.push(`   Logikai csoport / ZIP mappa: ${file.archiveFolder}`);
    lines.push(`   Méret: ${file.sizeBytes} byte`);
    lines.push(`   MIME: ${file.mimeType || "application/octet-stream"}`);
    lines.push(`   SHA-256: ${file.sha256}`);
    for (const comment of file.comments || []) lines.push(`   Megjegyzés: ${comment}`);
    lines.push("");
  });
  return lines.join("\r\n");
}

export function createDropPackageZipStream(input: {
  title: string;
  publicCode: string;
  files: DropPackageZipFile[];
  supplementalFiles?: DropPackageZipSupplementalFile[];
  openFile?: DropZipOpenFile;
}) {
  if (!input.files.length) throw new Error("A ZIP-csomaghoz nincs letölthető fájl.");
  if (input.files.length > DROP_PACKAGE_ZIP_MAX_FILES) throw new Error(`A ZIP-csomag legfeljebb ${DROP_PACKAGE_ZIP_MAX_FILES} fájlt tartalmazhat.`);
  const totalBytes = input.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (totalBytes > DROP_PACKAGE_ZIP_MAX_BYTES) throw new Error("A ZIP-csomag összesített mérete meghaladja a 2 GB-os biztonsági korlátot.");

  const names = createUniqueDropZipNames(input.files);
  const openFile = input.openFile || defaultOpenFile;
  const zip = new JSZip();
  for (const file of input.files) {
    zip.file(names.get(file.id) || safeArchiveName(file.displayName), lazyS3Stream(file, openFile), {
      binary: true,
      compression: "STORE",
      date: file.createdAt ? new Date(file.createdAt) : new Date(),
      createFolders: Boolean(file.archiveFolder),
    });
  }
  for (const extra of input.supplementalFiles || []) {
    zip.file(safeArchiveName(extra.name), extra.data, {
      binary: Buffer.isBuffer(extra.data),
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      createFolders: false,
    });
  }
  zip.file("DIMPRO_DROP_fajllista.txt", buildManifest({ ...input, names }), {
    binary: false,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    stream: zip.generateNodeStream({
      streamFiles: true,
      compression: "STORE",
      platform: "UNIX",
    }),
    fileCount: input.files.length + (input.supplementalFiles?.length || 0) + 1,
    sourceFileCount: input.files.length,
    supplementalFileCount: input.supplementalFiles?.length || 0,
    totalBytes,
    names,
    persistentArchiveCreated: false as const,
    originalFilesRecompressed: false as const,
  };
}
