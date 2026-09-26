export type DriveFolderClassification = {
  discipline: string;
  topic: string;
};

export type DriveFolderClassificationNode = {
  id: string;
  parentId: string | null;
  discipline?: string | null;
  topic?: string | null;
};

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveDriveFolderClassification(folderId: string, folders: DriveFolderClassificationNode[]): DriveFolderClassification {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let discipline = "";
  let topic = "";
  let current = byId.get(folderId);
  while (current && !visited.has(current.id) && (!discipline || !topic)) {
    visited.add(current.id);
    discipline ||= clean(current.discipline);
    topic ||= clean(current.topic);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return { discipline, topic };
}

export function resolveDriveDocumentClassification(folderId: string, folders: DriveFolderClassificationNode[], override?: Partial<DriveFolderClassification> | null): DriveFolderClassification {
  const inherited = resolveDriveFolderClassification(folderId, folders);
  return {
    discipline: clean(override?.discipline) || inherited.discipline,
    topic: clean(override?.topic) || inherited.topic,
  };
}
