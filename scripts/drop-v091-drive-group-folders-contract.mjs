import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const archive = read("app/lib/drop/archive/dropDriveArchiveService.ts");
const storage = read("app/lib/drive-core/storageRepository.ts");
const workspace = read("components/project-gate/DriveWorkspace.tsx");
const css = read("components/project-gate/DriveWorkspace.module.css");
const flags = read("app/lib/drop/dropFeatureFlags.ts");
const checks = [];
function contains(name, source, value) { assert.ok(source.includes(value), `${name}: ${value}`); checks.push(name); }
function matches(name, source, value) { assert.match(source, value, name); checks.push(name); }

contains("release-version", flags, 'version: "DROP 0.9.1"');
contains("group-folder-resolver", archive, "resolveFileArchiveFolders");
contains("group-folder-name", archive, 'group?.name || "Csoport nélkül"');
contains("group-folder-parent", archive, "parentId: packageFolderId");
contains("group-folder-target", archive, "folderId: targetFolder.id");
contains("report-package-root", archive, "folderId: packageFolder.id");
contains("group-folder-audit", archive, "groupFolderCount");
contains("group-id-audit", archive, "groupId: group?.id || null");
contains("archive-version", archive, 'archiveVersion: "DROP 0.9.1"');
contains("existing-document-folder", storage, "folder_id: input.folderId");
contains("existing-session-folder", storage, '.eq("finalized_document_id", input.documentId)');
contains("move-audit-event", storage, "DROP_ARCHIVE_DOCUMENT_MOVED");
contains("previous-folder-audit", storage, "previousFolderId");
contains("recursive-folder-scope", workspace, "const folderScope = useMemo");
contains("recursive-folder-count", workspace, "const folderDocumentCounts = useMemo");
contains("child-folder-cards", workspace, "childFolders.map");
contains("drop-source-filter", workspace, 'setSourceFilter("drop")');
contains("drop-document-metric", workspace, "dropDocumentCount");
contains("system-details", workspace, "Rendszerállapot és haladó műveletek");
contains("technical-collapsed", workspace, '<details className={styles.systemDetails}>');
contains("drop-badge", workspace, "styles.dropSourceBadge");
contains("folder-cards-css", css, ".folderCards");
contains("source-filter-css", css, ".sourceFilters");
contains("mobile-filter-css", css, "@media (max-width: 600px)");
matches("no-drive-schema-migration", archive, /drop_groups|bundle\.groups/);

console.log(JSON.stringify({ ok: true, version: "DROP 0.9.1", checks: checks.length, names: checks }, null, 2));
