"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive, Pencil, Plus, X } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

export type PersonalDriveFolder = {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  folders: PersonalDriveFolder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreate: (parentId: string | null, name: string) => Promise<boolean>;
  onRename: (folderId: string, name: string) => Promise<boolean>;
};

export default function PersonalDriveFolderTree({ folders, selectedFolderId, onSelect, onCreate, onRename }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const children = useMemo(() => {
    const map = new Map<string, PersonalDriveFolder[]>();
    for (const folder of folders) {
      const key = folder.parentId || "__root__";
      const list = map.get(key) || [];
      list.push(folder);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "hu"));
    return map;
  }, [folders]);

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submitCreate = async () => {
    const name = createName.trim();
    if (!name || busy) return;
    setBusy(true);
    const parentId = selectedFolderId;
    try {
      const ok = await onCreate(parentId, name);
      if (ok) {
        if (parentId) setExpanded((current) => new Set(current).add(parentId));
        setCreateName("");
        setCreating(false);
      }
    } finally { setBusy(false); }
  };

  const submitRename = async (folderId: string) => {
    const name = editName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const ok = await onRename(folderId, name);
      if (ok) { setEditingId(""); setEditName(""); }
    } finally { setBusy(false); }
  };

  const renderFolder = (folder: PersonalDriveFolder, depth: number): React.ReactNode => {
    const nested = children.get(folder.id) || [];
    const open = expanded.has(folder.id);
    const selected = selectedFolderId === folder.id;
    return (
      <div key={folder.id}>
        <div className={`${styles.personalFolderRow} ${selected ? styles.personalFolderRowSelected : ""}`} style={{ paddingLeft: 8 + depth * 15 }}>
          <button type="button" className={styles.personalFolderChevron} onClick={() => nested.length && toggle(folder.id)} aria-label={open ? "Mappa összecsukása" : "Mappa lenyitása"} disabled={!nested.length}>
            {nested.length ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className={styles.personalFolderChevronSpacer} />}
          </button>
          <button type="button" className={styles.personalFolderMain} onClick={() => onSelect(folder.id)}>
            {open ? <FolderOpen size={15} /> : <Folder size={15} />}
            {editingId === folder.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void submitRename(folder.id); }
                  if (event.key === "Escape") { event.preventDefault(); setEditingId(""); setEditName(""); }
                }}
                className={styles.personalFolderInlineInput}
                aria-label="Mappanév szerkesztése"
              />
            ) : <span>{folder.name}</span>}
          </button>
          {editingId === folder.id ? (
            <div className={styles.personalFolderInlineActions}>
              <button type="button" onClick={() => void submitRename(folder.id)} disabled={busy || !editName.trim()} title="Mentés"><Check size={13} /></button>
              <button type="button" onClick={() => { setEditingId(""); setEditName(""); }} disabled={busy} title="Mégse"><X size={13} /></button>
            </div>
          ) : (
            <button type="button" className={styles.personalFolderEdit} onClick={() => { setEditingId(folder.id); setEditName(folder.name); }} title="Mappa átnevezése"><Pencil size={12} /></button>
          )}
        </div>
        {open ? nested.map((child) => renderFolder(child, depth + 1)) : null}
      </div>
    );
  };

  const rootFolders = children.get("__root__") || [];
  return (
    <aside className={styles.personalFolderTree}>
      <div className={styles.personalFolderTreeHeader}>
        <strong>Mappák</strong>
        <button type="button" onClick={() => { setCreating(true); setCreateName(""); }} title="Új mappa"><Plus size={14} /> Új mappa</button>
      </div>
      <button type="button" className={`${styles.personalFolderRoot} ${selectedFolderId === null ? styles.personalFolderRowSelected : ""}`} onClick={() => onSelect(null)}>
        <HardDrive size={15} /><span>Saját Drive</span>
      </button>
      {creating ? (
        <div className={styles.personalFolderCreateRow}>
          <Folder size={14} />
          <input
            autoFocus
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void submitCreate(); }
              if (event.key === "Escape") { event.preventDefault(); setCreating(false); setCreateName(""); }
            }}
            placeholder={selectedFolderId ? "Új almappa neve" : "Új mappa neve"}
            aria-label="Új mappa neve"
          />
          <button type="button" onClick={() => void submitCreate()} disabled={busy || !createName.trim()} title="Mentés"><Check size={13} /></button>
          <button type="button" onClick={() => { setCreating(false); setCreateName(""); }} disabled={busy} title="Mégse"><X size={13} /></button>
        </div>
      ) : null}
      <div className={styles.personalFolderTreeRows}>
        {rootFolders.map((folder) => renderFolder(folder, 0))}
        {rootFolders.length === 0 ? <span className={styles.personalFolderTreeEmpty}>Még nincs saját mappa.</span> : null}
      </div>
    </aside>
  );
}
