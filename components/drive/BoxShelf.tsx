"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  FileText,
  GitCompareArrows,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { DriveBox, DriveBoxPurpose, DriveDocument } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type NewBoxInput = {
  name: string;
  purpose: DriveBoxPurpose;
  colorToken: string;
  iconKey: string;
  note: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: DriveBox[];
  documents: DriveDocument[];
  selectedDocument: DriveDocument | null;
  canWrite: boolean;
  databaseReady: boolean;
  busy: boolean;
  onCreateBox: (input: NewBoxInput) => Promise<void>;
  onAddDocument: (boxId: string, document: DriveDocument) => Promise<void>;
  onRemoveItem: (boxId: string, itemId: string) => Promise<void>;
  onOpenCompareBox: (box: DriveBox) => void;
};

const purposeConfig: Record<DriveBoxPurpose, {
  label: string;
  description: string;
  colorToken: string;
  iconKey: string;
  icon: typeof PackageCheck;
}> = {
  GENERAL: { label: "Általános", description: "Saját dokumentumgyűjtés", colorToken: "slate", iconKey: "box", icon: PackageCheck },
  DROP: { label: "DROP küldés", description: "Külső címzettnek előkészített csomag", colorToken: "orange", iconKey: "send", icon: Send },
  COMPARE: { label: "Összehasonlítás", description: "Két vagy több revízió összevetéséhez", colorToken: "blue", iconKey: "compare", icon: GitCompareArrows },
  AI_ANALYSIS: { label: "AI vizsgálat", description: "Dokumentumvizsgálati forráscsomag", colorToken: "purple", iconKey: "brain", icon: BrainCircuit },
  ISSUE: { label: "Kiadási csomag", description: "Kiadásra összeállított dokumentumok", colorToken: "green", iconKey: "issue", icon: PackageCheck },
  MEETING: { label: "Értekezleti csomag", description: "Kooperációhoz kapcsolt dokumentumok", colorToken: "cyan", iconKey: "meeting", icon: Users },
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function colorClass(token: string) {
  switch (token) {
    case "orange": return styles.boxCardOrange;
    case "purple": return styles.boxCardPurple;
    case "green": return styles.boxCardGreen;
    case "cyan": return styles.boxCardCyan;
    case "slate": return styles.boxCardSlate;
    default: return styles.boxCardBlue;
  }
}

export default function BoxShelf({
  open,
  onOpenChange,
  boxes,
  documents,
  selectedDocument,
  canWrite,
  databaseReady,
  busy,
  onCreateBox,
  onAddDocument,
  onRemoveItem,
  onOpenCompareBox,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedBoxId, setExpandedBoxId] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<DriveBoxPurpose>("GENERAL");
  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents]);

  async function submitNewBox() {
    const normalized = name.trim();
    if (!normalized || busy) return;
    const config = purposeConfig[purpose];
    await onCreateBox({
      name: normalized,
      purpose,
      colorToken: config.colorToken,
      iconKey: config.iconKey,
      note: config.description,
    });
    setName("");
    setPurpose("GENERAL");
    setComposerOpen(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, boxId: string) {
    event.preventDefault();
    if (!canWrite || !databaseReady || busy) return;
    const raw = event.dataTransfer.getData("application/x-dimpro-drive-document");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { documentId?: string };
      const document = payload.documentId ? documentMap.get(payload.documentId) : undefined;
      if (document) await onAddDocument(boxId, document);
    } catch {
      // Idegen drag payloadot figyelmen kívül hagyunk.
    }
  }

  return (
    <section className={`${styles.boxShelf} ${open ? "" : styles.boxShelfCollapsed}`} aria-label="CsomagBOX polc">
      <header className={styles.boxShelfHeader}>
        <div className={styles.boxShelfTitle}>
          <strong>CsomagBOX polc</strong>
          <span>{databaseReady ? `${boxes.length} aktív BOX · virtuális file/version hivatkozások` : "A Workspace SQL aktiválása után használható"}</span>
        </div>
        <div className={styles.boxShelfHeaderActions}>
          {open && canWrite && databaseReady && (
            <button type="button" className={styles.boxShelfNewButton} onClick={() => setComposerOpen((current) => !current)}>
              <Plus size={13} /> Új BOX
            </button>
          )}
          <button type="button" className={styles.boxShelfToggle} onClick={() => onOpenChange(!open)} title={open ? "Polc elrejtése" : "Polc megnyitása"}>
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </header>

      {open && composerOpen && (
        <div className={styles.boxComposer}>
          <div className={styles.boxComposerHeading}>
            <div><strong>Új CsomagBOX</strong><span>A BOX nem másolja a fájlt, csak a dokumentum/verzió hivatkozását tárolja.</span></div>
            <button type="button" onClick={() => setComposerOpen(false)} aria-label="Bezárás"><X size={14} /></button>
          </div>
          <div className={styles.boxComposerBody}>
            <label>
              <span>Név</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Pl. Kivitelezőnek – 08.14." autoFocus />
            </label>
            <label>
              <span>Cél</span>
              <select value={purpose} onChange={(event) => setPurpose(event.target.value as DriveBoxPurpose)}>
                {(Object.keys(purposeConfig) as DriveBoxPurpose[]).map((key) => <option key={key} value={key}>{purposeConfig[key].label}</option>)}
              </select>
            </label>
            <button type="button" className={styles.boxComposerCreate} onClick={() => void submitNewBox()} disabled={!name.trim() || busy}>Létrehozás</button>
          </div>
        </div>
      )}

      {open && (
        <div className={styles.boxCards}>
          {boxes.map((box) => {
            const config = purposeConfig[box.purpose] || purposeConfig.GENERAL;
            const Icon = config.icon;
            const itemDocuments = box.items.map((item) => ({ item, document: documentMap.get(item.documentId) })).filter((entry) => entry.document);
            const totalBytes = itemDocuments.reduce((sum, entry) => sum + (entry.document?.currentVersion?.sizeBytes || 0), 0);
            const selectedIncluded = Boolean(selectedDocument && box.items.some((item) => item.documentId === selectedDocument.id));
            const expanded = expandedBoxId === box.id;
            return (
              <article
                key={box.id}
                className={`${styles.boxCard} ${colorClass(box.colorToken)} ${selectedIncluded ? styles.boxCardContainsSelected : ""}`}
                onDragOver={(event) => { if (canWrite && databaseReady) event.preventDefault(); }}
                onDrop={(event) => void handleDrop(event, box.id)}
              >
                <div className={styles.boxCardTop}>
                  <span className={styles.boxCardIcon}><Icon size={15} /></span>
                  <div><strong>{box.name}</strong><span>{config.label}</span></div>
                  <span className={styles.boxCardCount}>{box.items.length}</span>
                </div>
                <div className={styles.boxCardStats}>{box.items.length} fájl · {formatBytes(totalBytes)}</div>
                <div className={styles.boxCardActions}>
                  <button type="button" onClick={() => setExpandedBoxId(expanded ? "" : box.id)}>{expanded ? "Bezárás" : "Megnyitás"}</button>
                  {box.purpose === "COMPARE" && box.items.length >= 2 && (
                    <button type="button" onClick={() => onOpenCompareBox(box)}>Összevetés</button>
                  )}
                  {selectedDocument && canWrite && databaseReady && !selectedIncluded && (
                    <button type="button" onClick={() => void onAddDocument(box.id, selectedDocument)} disabled={busy}>+ Kijelölt fájl</button>
                  )}
                  {selectedIncluded && <span className={styles.boxIncludedBadge}>Kijelölt fájl benne</span>}
                </div>
                {expanded && (
                  <div className={styles.boxItemList}>
                    {!itemDocuments.length && <span className={styles.boxItemEmpty}>Húzz ide fájlt, vagy jelölj ki egyet a listában.</span>}
                    {itemDocuments.map(({ item, document }) => (
                      <div key={item.id} className={styles.boxItemRow} title={document?.name}>
                        <FileText size={11} /><span>{document?.name}</span>
                        {canWrite && <button type="button" onClick={() => void onRemoveItem(box.id, item.id)} disabled={busy} title="Eltávolítás a BOX-ból"><Trash2 size={10} /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {!boxes.length && databaseReady && (
            <button type="button" className={styles.boxEmptyCreate} onClick={() => setComposerOpen(true)}>
              <Plus size={22} /><strong>Első CsomagBOX létrehozása</strong><span>DROP, összehasonlítás, AI vizsgálat vagy kiadás előkészítéséhez.</span>
            </button>
          )}

          {!databaseReady && (
            <div className={styles.boxDisabledInfo}>
              <PackageCheck size={20} /><strong>CsomagBOX motor előkészítve</strong><span>A DRIVE Workspace bootstrap SQL alkalmazása után a létrehozás és a drag & drop automatikusan aktiválódik.</span>
            </div>
          )}

          {boxes.length > 0 && canWrite && databaseReady && (
            <button type="button" className={styles.boxAdd} onClick={() => setComposerOpen(true)}>
              <Plus size={22} /><span>Új CsomagBOX</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
