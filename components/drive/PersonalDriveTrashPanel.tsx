"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, FileText, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

type PersonalTrashItem = {
  id: string;
  name: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sourceSystem: string;
  folderId: string | null;
  deletedAt: string;
};

type Props = { onChanged?: () => Promise<void> | void };

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("hu-HU", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function PersonalDriveTrashPanel({ onChanged }: Props) {
  const [items, setItems] = useState<PersonalTrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/drive/personal/trash", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; items?: PersonalTrashItem[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A Saját Drive Lomtár nem tölthető be.");
      setItems(payload.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Saját Drive Lomtár nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(item: PersonalTrashItem) {
    if (busyId) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drive/personal/trash/restore", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refIds: [item.id] }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A visszaállítás sikertelen.");
      setNotice(`Fájl visszaállítva: ${item.name}`);
      await load();
      await onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A visszaállítás sikertelen.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className={`${styles.trashWorkspace} ${styles.personalTrashWorkspace}`} aria-label="Saját Drive Lomtár">
      <header className={styles.trashHeader}>
        <div><span><Archive size={17} /></span><div><strong>Lomtár</strong><small>A Saját Drive-ból eltávolított fájlok</small></div></div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(busyId)} title="Lomtár frissítése"><RefreshCw size={14} />{loading ? "Betöltés…" : "Frissítés"}</button>
      </header>
      <div className={`${styles.trashWarning} ${styles.personalTrashInfo}`}>
        <Archive size={15} />
        <div><strong>A Lomtárban lévő fájlok továbbra is beleszámítanak az 50 GB-os tárhelykeretbe.</strong><span>Visszaállíthatók. A végleges fizikai törlés külön biztonsági folyamat lesz, ezért itt még nem érhető el.</span></div>
      </div>
      {error ? <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div> : null}
      {!error && notice ? <div className={`${styles.notice} ${styles.noticeSuccess}`}>{notice}</div> : null}
      {loading ? (
        <div className={styles.trashEmpty}><Loader2 className={styles.spin} size={25} /><strong>Lomtár betöltése…</strong></div>
      ) : items.length === 0 ? (
        <div className={styles.trashEmpty}><Archive size={28} /><strong>A Lomtár üres</strong><span>Nincs visszaállítható személyes fájl.</span></div>
      ) : (
        <div className={styles.trashList}>
          {items.map((item) => (
            <article key={item.id} className={styles.trashItem}>
              <span className={styles.trashItemIcon}><FileText size={18} /></span>
              <div className={styles.trashItemMain}><strong>{item.name}</strong><span>{item.originalName || item.mimeType || "Saját Drive fájl"}</span><small>Lomtárba helyezve: {formatDate(item.deletedAt)}</small></div>
              <div className={styles.trashItemMeta}><span>{item.sourceSystem || "DRIVE"}</span><span>{formatBytes(item.sizeBytes)}</span></div>
              <div className={styles.trashItemActions}>
                <button type="button" disabled={Boolean(busyId)} onClick={() => void restore(item)} title="Visszaállítás a Saját Drive-ba">{busyId === item.id ? <Loader2 className={styles.spin} size={13} /> : <RotateCcw size={13} />} Visszaállítás</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
