import type { DriveFolder } from "./driveTypes";

export type DroppedDriveFile = {
  file: File;
  relativePath: string;
  directoryPath: string;
};

export type DroppedDrivePayload = {
  files: DroppedDriveFile[];
  directories: string[];
};

type LegacyFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: LegacyFileEntry[]) => void,
      error?: (error: DOMException) => void,
    ) => void;
  };
};

type DataTransferItemWithEntry = {
  webkitGetAsEntry?: () => LegacyFileEntry | null;
};

const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_DIRECTORIES = 250;
const DEFAULT_MAX_DEPTH = 24;

export function hasExternalDriveFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;

  const types = Array.from(dataTransfer.types ?? []);
  if (types.some((type) => type === "Files")) return true;

  const items = Array.from(dataTransfer.items ?? []);
  if (items.some((item) => item.kind === "file")) return true;

  return (dataTransfer.files?.length ?? 0) > 0;
}

function normalizeRelativePath(value: string) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function directoryOf(path: string) {
  const normalized = normalizeRelativePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function readLegacyFile(entry: LegacyFileEntry) {
  return new Promise<File>((resolve, reject) => {
    if (!entry.file) {
      reject(new Error("A behúzott fájl nem olvasható."));
      return;
    }
    entry.file(resolve, reject);
  });
}

function readLegacyDirectory(entry: LegacyFileEntry) {
  return new Promise<LegacyFileEntry[]>((resolve, reject) => {
    const reader = entry.createReader?.();
    if (!reader) {
      reject(new Error("A behúzott mappa nem olvasható."));
      return;
    }
    const all: LegacyFileEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (!entries.length) {
          resolve(all);
          return;
        }
        all.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

export async function collectDroppedDriveEntries(
  dataTransfer: DataTransfer,
  options?: { maxFiles?: number; maxDirectories?: number; maxDepth?: number },
): Promise<DroppedDrivePayload> {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDirectories = options?.maxDirectories ?? DEFAULT_MAX_DIRECTORIES;
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const files: DroppedDriveFile[] = [];
  const directorySet = new Set<string>();

  const ensureLimits = () => {
    if (files.length > maxFiles) throw new Error(`Egyszerre legfeljebb ${maxFiles} fájl húzható be.`);
    if (directorySet.size > maxDirectories) throw new Error(`Egyszerre legfeljebb ${maxDirectories} mappa hozható létre.`);
  };

  const visit = async (entry: LegacyFileEntry, parentPath = "", depth = 0): Promise<void> => {
    if (depth > maxDepth) throw new Error(`A behúzott mappastruktúra túl mély. Maximum ${maxDepth} szint támogatott.`);
    const name = normalizeRelativePath(entry.name);
    if (!name) return;
    const relativePath = normalizeRelativePath(parentPath ? `${parentPath}/${name}` : name);

    if (entry.isDirectory) {
      directorySet.add(relativePath);
      ensureLimits();
      const children = await readLegacyDirectory(entry);
      for (const child of children) await visit(child, relativePath, depth + 1);
      return;
    }

    if (entry.isFile) {
      const file = await readLegacyFile(entry);
      files.push({ file, relativePath, directoryPath: directoryOf(relativePath) });
      ensureLimits();
    }
  };

  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => (item as unknown as DataTransferItemWithEntry).webkitGetAsEntry?.() || null)
    .filter((entry): entry is LegacyFileEntry => Boolean(entry));

  if (entries.length) {
    for (const entry of entries) await visit(entry);
  } else {
    for (const file of Array.from(dataTransfer.files || [])) {
      const relativePath = normalizeRelativePath(
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      );
      files.push({ file, relativePath, directoryPath: directoryOf(relativePath) });
      const parts = directoryOf(relativePath).split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i += 1) directorySet.add(parts.slice(0, i).join("/"));
      ensureLimits();
    }
  }

  return {
    files,
    directories: [...directorySet].sort((a, b) => {
      const depthA = a.split("/").length;
      const depthB = b.split("/").length;
      return depthA - depthB || a.localeCompare(b, "hu-HU");
    }),
  };
}

function folderLookupKey(parentId: string | null, name: string) {
  return `${parentId || "<root>"}\u0000${name.trim().toLocaleLowerCase("hu-HU")}`;
}

export async function ensureDroppedDriveFolders(input: {
  directories: string[];
  baseParentId: string | null;
  existingFolders: DriveFolder[];
  createFolder: (name: string, parentId: string | null) => Promise<DriveFolder>;
}) {
  const byKey = new Map<string, DriveFolder>();
  for (const folder of input.existingFolders) {
    byKey.set(folderLookupKey(folder.parentId, folder.displayName || folder.name), folder);
  }

  const byRelativePath = new Map<string, DriveFolder>();
  let createdCount = 0;
  let reusedCount = 0;

  for (const rawPath of input.directories) {
    const relativePath = normalizeRelativePath(rawPath);
    if (!relativePath) continue;
    const parts = relativePath.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const name = parts.at(-1) || "";
    const parentId = parentPath
      ? byRelativePath.get(parentPath)?.id || null
      : input.baseParentId;

    if (parentPath && !parentId) {
      throw new Error(`A szülőmappa nem állítható elő: ${parentPath}`);
    }

    const key = folderLookupKey(parentId, name);
    let folder = byKey.get(key) || null;
    if (!folder) {
      folder = await input.createFolder(name, parentId);
      byKey.set(key, folder);
      createdCount += 1;
    } else {
      reusedCount += 1;
    }
    byRelativePath.set(relativePath, folder);
  }

  return { byRelativePath, createdCount, reusedCount };
}

export type PreparedDriveDropGroup = {
  folder: DriveFolder;
  files: File[];
  originalRelativePaths: string[];
};

export async function prepareDroppedDriveUpload(input: {
  projectId: string;
  dataTransfer: DataTransfer;
  selectedFolderId: string;
  selectedFolder: DriveFolder | null;
  existingFolders: DriveFolder[];
}) {
  const dropped = await collectDroppedDriveEntries(input.dataTransfer);
  if (!dropped.files.length && !dropped.directories.length) {
    throw new Error('A behúzott elem nem tartalmaz feltölthető fájlt vagy mappát.');
  }

  const baseParentId = input.selectedFolderId === 'all' ? null : input.selectedFolderId;
  if (!baseParentId && dropped.files.some((entry) => !entry.directoryPath)) {
    throw new Error('Közvetlen fájlok feltöltéséhez válassz célmappát. Mappát a Dokumentumtár gyökerére is ráhúzhatsz.');
  }

  const folderResult = await ensureDroppedDriveFolders({
    directories: dropped.directories,
    baseParentId,
    existingFolders: input.existingFolders,
    createFolder: async (name, parentId) => {
      const response = await fetch('/api/projects/' + encodeURIComponent(input.projectId) + '/drive/folders', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; folder?: DriveFolder };
      if (!response.ok || !payload.ok || !payload.folder) {
        throw new Error(payload.error || 'A mappa létrehozása sikertelen: ' + name);
      }
      return payload.folder;
    },
  });

  const grouped = new Map<string, PreparedDriveDropGroup>();
  for (const entry of dropped.files) {
    const folder = entry.directoryPath
      ? folderResult.byRelativePath.get(entry.directoryPath) || null
      : input.selectedFolder;
    if (!folder) throw new Error('A fájl célmappája nem található: ' + entry.relativePath);
    const current = grouped.get(folder.id) || { folder, files: [], originalRelativePaths: [] };
    current.files.push(entry.file);
    current.originalRelativePaths.push(entry.relativePath);
    grouped.set(folder.id, current);
  }

  return {
    groups: [...grouped.values()],
    fileCount: dropped.files.length,
    directoryCount: dropped.directories.length,
    createdFolderCount: folderResult.createdCount,
    reusedFolderCount: folderResult.reusedCount,
  };
}
