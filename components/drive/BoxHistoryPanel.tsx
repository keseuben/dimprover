"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Loader2, PackageCheck, RefreshCcw, X } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

export type DriveBoxHistoryEvent = {
  id: string;
  eventType: string;
  summary: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type Props = {
  projectId: string;
  boxId: string;
  onClose: () => void;
};

const labels: Record<string, string> = {
  DRIVE_BOX_CREATED: "BOX létrehozva",
  DRIVE_BOX_ITEM_ADDED: "Fájl hozzáadva",
  DRIVE_BOX_ITEM_REMOVED: "Fájl eltávolítva",
  DRIVE_BOX_FOLDER_CREATED: "Mappa létrehozva",
  DRIVE_BOX_ITEM_MOVED: "Fájl áthelyezve",
  DRIVE_BOX_LIFECYCLE_CHANGED: "Állapot módosítva",
  DRIVE_DOWNLOAD_PACKAGE_CREATED: "ZIP csomag elkészítve",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function detailText(event: DriveBoxHistoryEvent) {
  const metadata = event.metadata || {};
  if (event.eventType === "DRIVE_BOX_LIFECYCLE_CHANGED") {
    const previous = String(metadata.previousStatus || "");
    const next = String(metadata.nextStatus || "");
    return previous && next ? `${previous} → ${next}` : "";
  }
  if (event.eventType === "DRIVE_DOWNLOAD_PACKAGE_CREATED") {
    const name = String(metadata.packageName || metadata.packageId || "");
    const count = Number(metadata.fileCount || 0);
    return [name, count ? `${count} fájl` : ""].filter(Boolean).join(" · ");
  }
  if (event.eventType === "DRIVE_BOX_FOLDER_CREATED") {
    return String(metadata.name || "");
  }
  return "";
}

export default function BoxHistoryPanel({ projectId, boxId, onClose }: Props) {
  const [events, setEvents] = useState<DriveBoxHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const endpoint = useMemo(
    () => `/api/projects/${encodeURIComponent(projectId)}/drive/boxes/${encodeURIComponent(boxId)}/history`,
    [boxId, projectId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; events?: DriveBoxHistoryEvent[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A CsomagBOX előzményei nem tölthetők be.");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A CsomagBOX előzményei nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [endpoint]);

  return (
    <section className={styles.boxHistoryPanel} aria-label="CsomagBOX előzmények">
      <header className={styles.boxHistoryHeader}>
        <div>
          <Clock3 size={13} />
          <strong>Előzmények</strong>
          {!loading && !error && <span>{events.length} esemény</span>}
        </div>
        <div>
          <button type="button" onClick={() => void load()} disabled={loading} title="Előzmények frissítése" aria-label="Előzmények frissítése">
            <RefreshCcw size={12} />
          </button>
          <button type="button" onClick={onClose} title="Előzmények bezárása" aria-label="Előzmények bezárása">
            <X size={12} />
          </button>
        </div>
      </header>

      {loading && <div className={styles.boxHistoryLoading}><Loader2 size={14} className={styles.spin} /> Előzmények betöltése…</div>}
      {error && <div className={styles.boxHistoryError}>{error}</div>}
      {!loading && !error && !events.length && (
        <div className={styles.boxHistoryEmpty}><PackageCheck size={16} /> Ehhez a BOX-hoz még nincs auditált esemény.</div>
      )}
      {!loading && !error && events.length > 0 && (
        <div className={styles.boxHistoryList}>
          {events.map((event) => {
            const detail = detailText(event);
            return (
              <article key={event.id} className={styles.boxHistoryRow} data-event-type={event.eventType}>
                <div className={styles.boxHistoryMarker} />
                <div className={styles.boxHistoryContent}>
                  <div className={styles.boxHistoryMeta}>
                    <strong>{labels[event.eventType] || event.eventType}</strong>
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                  </div>
                  <p>{event.summary}</p>
                  <div className={styles.boxHistoryFooter}>
                    <span>{event.actorUserId || "DIMPRO rendszer"}</span>
                    {detail && <b>{detail}</b>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
