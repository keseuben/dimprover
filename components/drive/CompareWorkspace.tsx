"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Download,
  FileSearch2,
  GitCompareArrows,
  Loader2,
  PackageCheck,
  RotateCcw,
  X,
} from "lucide-react";
import type { DriveBox, DriveDocument, DriveDocumentDetails } from "./driveTypes";
import DriveDocumentViewer from "./DriveDocumentViewer";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projectId: string;
  documents: DriveDocument[];
  boxes: DriveBox[];
  seedDocumentIds: string[];
  onClose: () => void;
};

type CompareSide = "left" | "right";

type MetadataKey =
  | "planNo"
  | "discipline"
  | "documentType"
  | "revision"
  | "issueStatus"
  | "approvalStatus"
  | "building"
  | "level"
  | "zone";

const metadataRows: Array<{ key: MetadataKey; label: string }> = [
  { key: "planNo", label: "Tervszám" },
  { key: "discipline", label: "Szakág" },
  { key: "documentType", label: "Dokumentumtípus" },
  { key: "revision", label: "Revízió" },
  { key: "issueStatus", label: "Kiadási állapot" },
  { key: "approvalStatus", label: "Jóváhagyás" },
  { key: "building", label: "Épület" },
  { key: "level", label: "Szint" },
  { key: "zone", label: "Zóna" },
];

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function normalized(value: string | undefined | null) {
  return (value || "").trim().toLocaleLowerCase("hu-HU");
}

function display(value: string | undefined | null) {
  return value?.trim() || "–";
}

export default function CompareWorkspace({
  projectId,
  documents,
  boxes,
  seedDocumentIds,
  onClose,
}: Props) {
  const compareBox = useMemo(
    () => boxes.find((box) => box.purpose === "COMPARE" && box.items.length >= 2) || null,
    [boxes],
  );
  const firstId = seedDocumentIds.find((id) => documents.some((document) => document.id === id)) || documents[0]?.id || "";
  const secondId = seedDocumentIds.find((id) => id !== firstId && documents.some((document) => document.id === id))
    || documents.find((document) => document.id !== firstId)?.id
    || "";
  const [leftId, setLeftId] = useState(firstId);
  const [rightId, setRightId] = useState(secondId);
  const [leftDetails, setLeftDetails] = useState<DriveDocumentDetails | null>(null);
  const [rightDetails, setRightDetails] = useState<DriveDocumentDetails | null>(null);
  const [loadingSide, setLoadingSide] = useState<CompareSide | "both" | "">("");
  const [error, setError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<CompareSide | "">("");

  useEffect(() => {
    const nextLeft = seedDocumentIds.find((id) => documents.some((document) => document.id === id)) || documents[0]?.id || "";
    const nextRight = seedDocumentIds.find((id) => id !== nextLeft && documents.some((document) => document.id === id))
      || documents.find((document) => document.id !== nextLeft)?.id
      || "";
    setLeftId(nextLeft);
    setRightId(nextRight);
  }, [documents, seedDocumentIds]);

  const loadDetails = useCallback(async (side: CompareSide, documentId: string) => {
    if (!documentId) {
      if (side === "left") setLeftDetails(null); else setRightDetails(null);
      return;
    }
    setLoadingSide((current) => current && current !== side ? "both" : side);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(documentId)}/details`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; error?: string; details?: DriveDocumentDetails };
      if (!response.ok || !payload.ok || !payload.details) throw new Error(payload.error || "A dokumentum részletei nem tölthetők be.");
      if (side === "left") setLeftDetails(payload.details); else setRightDetails(payload.details);
    } catch (caught) {
      if (side === "left") setLeftDetails(null); else setRightDetails(null);
      setError(caught instanceof Error ? caught.message : "Az összehasonlítási adatok nem tölthetők be.");
    } finally {
      setLoadingSide("");
    }
  }, [projectId]);

  useEffect(() => { void loadDetails("left", leftId); }, [leftId, loadDetails]);
  useEffect(() => { void loadDetails("right", rightId); }, [loadDetails, rightId]);

  const leftDocument = useMemo(() => documents.find((document) => document.id === leftId) || null, [documents, leftId]);
  const rightDocument = useMemo(() => documents.find((document) => document.id === rightId) || null, [documents, rightId]);

  const differences = useMemo(() => metadataRows.reduce((count, row) => {
    const left = leftDetails?.metadata?.[row.key] || "";
    const right = rightDetails?.metadata?.[row.key] || "";
    return count + (normalized(left) !== normalized(right) ? 1 : 0);
  }, 0), [leftDetails?.metadata, rightDetails?.metadata]);

  function swapSides() {
    const previousLeft = leftId;
    setLeftId(rightId);
    setRightId(previousLeft);
  }

  function loadCompareBox() {
    if (!compareBox) return;
    const ids = compareBox.items.map((item) => item.documentId).filter((id, index, all) => all.indexOf(id) === index);
    const nextLeft = ids.find((id) => documents.some((document) => document.id === id)) || "";
    const nextRight = ids.find((id) => id !== nextLeft && documents.some((document) => document.id === id)) || "";
    if (nextLeft) setLeftId(nextLeft);
    if (nextRight) setRightId(nextRight);
  }

  async function download(side: CompareSide) {
    const document = side === "left" ? leftDocument : rightDocument;
    if (!document?.currentVersion) return;
    setDownloadBusy(side);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/download`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: document.currentVersion.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A dokumentum nem nyitható meg a tárhelyről.");
      window.open(payload.download.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A dokumentum megnyitása sikertelen.");
    } finally {
      setDownloadBusy("");
    }
  }

  const ready = Boolean(leftDocument && rightDocument);

  return (
    <section className={styles.compareWorkspace} aria-label="Drive dokumentum-összehasonlítás">
      <header className={styles.compareHeader}>
        <div className={styles.compareHeading}>
          <span className={styles.compareHeadingIcon}><GitCompareArrows size={17} /></span>
          <div>
            <strong>Dokumentum-összehasonlítás</strong>
            <span>Két fájl vagy revízió műszaki adatainak párhuzamos ellenőrzése.</span>
          </div>
        </div>
        <div className={styles.compareHeaderActions}>
          {compareBox && (
            <button type="button" className={styles.compareSecondaryButton} onClick={loadCompareBox} title={`Betöltés ebből a BOX-ból: ${compareBox.name}`}>
              <PackageCheck size={13} /> BOX betöltése
            </button>
          )}
          <button type="button" className={styles.compareSecondaryButton} onClick={swapSides} disabled={!ready}>
            <ArrowLeftRight size={13} /> Oldalak cseréje
          </button>
          <button type="button" className={styles.compareCloseButton} onClick={onClose} title="Összehasonlítás bezárása"><X size={15} /></button>
        </div>
      </header>

      <div className={styles.compareSelectors}>
        <label>
          <span>A dokumentum</span>
          <select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.name} · {document.currentVersion?.revisionCode || `V${document.currentVersionNumber}`}</option>)}
          </select>
        </label>
        <div className={styles.compareSelectorBadge}><GitCompareArrows size={14} /><strong>{ready ? `${differences} eltérés` : "Válassz 2 fájlt"}</strong></div>
        <label>
          <span>B dokumentum</span>
          <select value={rightId} onChange={(event) => setRightId(event.target.value)}>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.name} · {document.currentVersion?.revisionCode || `V${document.currentVersionNumber}`}</option>)}
          </select>
        </label>
      </div>

      {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}

      {!ready ? (
        <div className={styles.compareEmpty}>
          <FileSearch2 size={32} />
          <strong>Legalább két dokumentum szükséges az összehasonlításhoz.</strong>
          <span>Tölts fel további fájlt, vagy adj két dokumentumot egy Összehasonlítás CsomagBOX-hoz.</span>
        </div>
      ) : (
        <>
          <div className={styles.compareDocumentGrid}>
            {([
              ["left", leftDocument, leftDetails],
              ["right", rightDocument, rightDetails],
            ] as const).map(([side, document, details]) => {
              const loading = loadingSide === side || loadingSide === "both";
              return (
                <article className={styles.compareDocumentCard} key={side}>
                  <div className={styles.compareDocumentTop}>
                    <span className={styles.compareFileBadge}>{document?.extension?.toUpperCase().slice(0, 4) || "FILE"}</span>
                    <div><strong>{document?.name}</strong><span>{details?.metadata?.discipline || "Szakág nélkül"} · {document?.currentVersion?.revisionCode || `V${document?.currentVersionNumber || 0}`}</span></div>
                    {loading && <Loader2 size={14} className={styles.spin} />}
                  </div>
                  <div className={styles.compareQuickFacts}>
                    <span><small>Verzió</small><strong>{document?.currentVersion?.revisionCode || `V${document?.currentVersionNumber || 0}`}</strong></span>
                    <span><small>Méret</small><strong>{formatBytes(document?.currentVersion?.sizeBytes || 0)}</strong></span>
                    <span><small>Állapot</small><strong>{document?.currentVersion?.status || "–"}</strong></span>
                    <span><small>Verziók</small><strong>{details?.versions.length || 0}</strong></span>
                  </div>
                  {document ? (
                    <DriveDocumentViewer projectId={projectId} document={document} compact />
                  ) : (
                    <div className={styles.comparePreviewPlaceholder}>
                      <FileSearch2 size={24} />
                      <div><strong>Nincs előnézeti dokumentum</strong><span>Válassz érvényes dokumentumot az összehasonlításhoz.</span></div>
                    </div>
                  )}
                  <button type="button" className={styles.compareDownloadButton} onClick={() => void download(side)} disabled={downloadBusy === side || document?.currentVersion?.status !== "AVAILABLE"}>
                    {downloadBusy === side ? <Loader2 size={12} className={styles.spin} /> : <Download size={12} />} Megnyitás / letöltés
                  </button>
                </article>
              );
            })}
          </div>

          <div className={styles.compareDiffPanel}>
            <div className={styles.compareDiffHeader}>
              <div><strong>Mérnöki metaadat-eltérések</strong><span>Az eltérő sorok kiemelve jelennek meg.</span></div>
              <button type="button" className={styles.compareSecondaryButton} onClick={() => { void loadDetails("left", leftId); void loadDetails("right", rightId); }}>
                <RotateCcw size={12} /> Frissítés
              </button>
            </div>
            <div className={styles.compareDiffTable}>
              <div className={`${styles.compareDiffRow} ${styles.compareDiffTableHead}`}><strong>Mező</strong><strong>A dokumentum</strong><strong>B dokumentum</strong></div>
              {metadataRows.map((row) => {
                const leftValue = leftDetails?.metadata?.[row.key] || "";
                const rightValue = rightDetails?.metadata?.[row.key] || "";
                const different = normalized(leftValue) !== normalized(rightValue);
                return (
                  <div className={`${styles.compareDiffRow} ${different ? styles.compareDiffDifferent : styles.compareDiffSame}`} key={row.key}>
                    <strong>{row.label}</strong><span>{display(leftValue)}</span><span>{display(rightValue)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
