"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Download,
  FileSearch2,
  GitCompareArrows,
  History,
  Loader2,
  PackageCheck,
  RotateCcw,
  X,
} from "lucide-react";
import type {
  DriveBox,
  DriveCompareSeed,
  DriveDocument,
  DriveDocumentDetails,
  DriveVersion,
} from "./driveTypes";
import DriveVisualCompareViewer from "./DriveVisualCompareViewer";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projectId: string;
  documents: DriveDocument[];
  boxes: DriveBox[];
  seedItems: DriveCompareSeed[];
  onClose: () => void;
};

type CompareSide = "left" | "right";

type MetadataKey =
  | "planNo"
  | "discipline"
  | "documentType"
  | "issueStatus"
  | "approvalStatus"
  | "building"
  | "level"
  | "zone";

const metadataRows: Array<{ key: MetadataKey; label: string }> = [
  { key: "planNo", label: "Tervszám" },
  { key: "discipline", label: "Szakág" },
  { key: "documentType", label: "Dokumentumtípus" },
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

function versionLabel(version: DriveVersion) {
  const revision = version.revisionCode?.trim() || `V${version.versionNumber}`;
  const date = version.createdAt ? new Date(version.createdAt).toLocaleDateString("hu-HU") : "";
  const author = version.createdBy?.trim() || "";
  return [revision, `V${version.versionNumber}`, date, author].filter(Boolean).join(" · ");
}

function selectedRevision(version: DriveVersion | null) {
  return version?.revisionCode?.trim() || (version ? `V${version.versionNumber}` : "–");
}

function makeEffectiveDocument(document: DriveDocument | null, version: DriveVersion | null): DriveDocument | null {
  if (!document || !version) return null;
  return {
    ...document,
    mimeType: version.mimeType || document.mimeType,
    currentVersionNumber: version.versionNumber,
    currentVersion: version,
  };
}

function findVersion(details: DriveDocumentDetails | null, requestedVersionId: string, document: DriveDocument | null) {
  if (!details) {
    if (!requestedVersionId) return document?.currentVersion || null;
    return document?.currentVersion?.id === requestedVersionId ? document.currentVersion : null;
  }
  if (requestedVersionId) {
    const requested = details.versions.find((version) => version.id === requestedVersionId);
    if (requested) return requested;
  }
  const currentId = document?.currentVersion?.id;
  return details.versions.find((version) => version.id === currentId)
    || details.versions.find((version) => version.versionNumber === document?.currentVersionNumber)
    || details.versions[0]
    || document?.currentVersion
    || null;
}

function normalizeSeeds(seedItems: DriveCompareSeed[], documents: DriveDocument[]) {
  const result: DriveCompareSeed[] = [];
  for (const seed of seedItems) {
    if (!seed.documentId || !documents.some((document) => document.id === seed.documentId)) continue;
    const key = `${seed.documentId}::${seed.versionId || "current"}`;
    if (result.some((item) => `${item.documentId}::${item.versionId || "current"}` === key)) continue;
    result.push({ documentId: seed.documentId, versionId: seed.versionId || null });
    if (result.length >= 2) break;
  }
  return result;
}

export default function CompareWorkspace({
  projectId,
  documents,
  boxes,
  seedItems,
  onClose,
}: Props) {
  const compareBox = useMemo(
    () => boxes.find((box) => box.purpose === "COMPARE" && box.items.length >= 2) || null,
    [boxes],
  );

  const normalizedSeeds = useMemo(() => normalizeSeeds(seedItems, documents), [documents, seedItems]);
  const firstSeed = normalizedSeeds[0] || { documentId: documents[0]?.id || "", versionId: documents[0]?.currentVersion?.id || null };
  const secondSeed = normalizedSeeds[1]
    || {
      documentId: documents.find((document) => document.id !== firstSeed.documentId)?.id || documents[0]?.id || "",
      versionId: documents.find((document) => document.id !== firstSeed.documentId)?.currentVersion?.id || documents[0]?.currentVersion?.id || null,
    };

  const [leftId, setLeftId] = useState(firstSeed.documentId);
  const [rightId, setRightId] = useState(secondSeed.documentId);
  const [leftVersionId, setLeftVersionId] = useState(firstSeed.versionId || "");
  const [rightVersionId, setRightVersionId] = useState(secondSeed.versionId || "");
  const [leftDetails, setLeftDetails] = useState<DriveDocumentDetails | null>(null);
  const [rightDetails, setRightDetails] = useState<DriveDocumentDetails | null>(null);
  const [loadingSide, setLoadingSide] = useState<CompareSide | "both" | "">("");
  const [error, setError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<CompareSide | "">("");

  useEffect(() => {
    const nextSeeds = normalizeSeeds(seedItems, documents);
    const nextLeft = nextSeeds[0]
      || { documentId: documents[0]?.id || "", versionId: documents[0]?.currentVersion?.id || null };
    const nextRight = nextSeeds[1]
      || {
        documentId: documents.find((document) => document.id !== nextLeft.documentId)?.id || documents[0]?.id || "",
        versionId: documents.find((document) => document.id !== nextLeft.documentId)?.currentVersion?.id || documents[0]?.currentVersion?.id || null,
      };
    setLeftId(nextLeft.documentId);
    setRightId(nextRight.documentId);
    setLeftVersionId(nextLeft.versionId || "");
    setRightVersionId(nextRight.versionId || "");
  }, [documents, seedItems]);

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
  const leftVersion = useMemo(() => findVersion(leftDetails, leftVersionId, leftDocument), [leftDetails, leftDocument, leftVersionId]);
  const rightVersion = useMemo(() => findVersion(rightDetails, rightVersionId, rightDocument), [rightDetails, rightDocument, rightVersionId]);

  useEffect(() => {
    if (leftVersion && leftVersion.id !== leftVersionId) setLeftVersionId(leftVersion.id);
  }, [leftVersion, leftVersionId]);

  useEffect(() => {
    if (rightVersion && rightVersion.id !== rightVersionId) setRightVersionId(rightVersion.id);
  }, [rightVersion, rightVersionId]);

  const leftCompareDocument = useMemo(() => makeEffectiveDocument(leftDocument, leftVersion), [leftDocument, leftVersion]);
  const rightCompareDocument = useMemo(() => makeEffectiveDocument(rightDocument, rightVersion), [rightDocument, rightVersion]);

  const documentMetadataDifferences = useMemo(() => metadataRows.reduce((count, row) => {
    const left = leftDetails?.metadata?.[row.key] || "";
    const right = rightDetails?.metadata?.[row.key] || "";
    return count + (normalized(left) !== normalized(right) ? 1 : 0);
  }, 0), [leftDetails?.metadata, rightDetails?.metadata]);

  const revisionDifferent = normalized(selectedRevision(leftVersion)) !== normalized(selectedRevision(rightVersion));
  const differences = documentMetadataDifferences + (revisionDifferent ? 1 : 0);

  function changeDocument(side: CompareSide, documentId: string) {
    const document = documents.find((item) => item.id === documentId) || null;
    if (side === "left") {
      setLeftId(documentId);
      setLeftVersionId(document?.currentVersion?.id || "");
      setLeftDetails(null);
    } else {
      setRightId(documentId);
      setRightVersionId(document?.currentVersion?.id || "");
      setRightDetails(null);
    }
  }

  function swapSides() {
    const previousLeftId = leftId;
    const previousLeftVersionId = leftVersionId;
    const previousLeftDetails = leftDetails;
    setLeftId(rightId);
    setLeftVersionId(rightVersionId);
    setLeftDetails(rightDetails);
    setRightId(previousLeftId);
    setRightVersionId(previousLeftVersionId);
    setRightDetails(previousLeftDetails);
  }

  function loadCompareBox() {
    if (!compareBox) return;
    const seeds = normalizeSeeds(
      compareBox.items.map((item) => ({ documentId: item.documentId, versionId: item.versionId })),
      documents,
    );
    if (seeds[0]) {
      setLeftId(seeds[0].documentId);
      setLeftVersionId(seeds[0].versionId || "");
      setLeftDetails(null);
    }
    if (seeds[1]) {
      setRightId(seeds[1].documentId);
      setRightVersionId(seeds[1].versionId || "");
      setRightDetails(null);
    }
  }

  async function download(side: CompareSide) {
    const document = side === "left" ? leftDocument : rightDocument;
    const version = side === "left" ? leftVersion : rightVersion;
    if (!document || !version) return;
    setDownloadBusy(side);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/documents/${encodeURIComponent(document.id)}/download`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A dokumentumverzió nem nyitható meg a tárhelyről.");
      window.open(payload.download.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A dokumentumverzió megnyitása sikertelen.");
    } finally {
      setDownloadBusy("");
    }
  }

  const ready = Boolean(leftCompareDocument && rightCompareDocument);

  return (
    <section className={styles.compareWorkspace} aria-label="Drive dokumentum-összehasonlítás">
      <header className={styles.compareHeader}>
        <div className={styles.compareHeading}>
          <span className={styles.compareHeadingIcon}><GitCompareArrows size={17} /></span>
          <div>
            <strong>Dokumentum- és revízió-összehasonlítás</strong>
            <span>Külön dokumentumok vagy ugyanazon terv korábbi verziói is összevethetők.</span>
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
          <select value={leftId} onChange={(event) => changeDocument("left", event.target.value)}>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
          </select>
          <div className={styles.compareRevisionSelect}>
            <History size={12} />
            <select value={leftVersion?.id || leftVersionId} onChange={(event) => setLeftVersionId(event.target.value)} aria-label="A dokumentum revíziója">
              {(leftDetails?.versions || []).map((version) => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
              {!leftDetails?.versions.length && leftDocument?.currentVersion && <option value={leftDocument.currentVersion.id}>{versionLabel(leftDocument.currentVersion)}</option>}
            </select>
          </div>
        </label>
        <div className={styles.compareSelectorBadge}><GitCompareArrows size={14} /><strong>{ready ? `${differences} eltérés` : "Válassz 2 fájlt"}</strong></div>
        <label>
          <span>B dokumentum</span>
          <select value={rightId} onChange={(event) => changeDocument("right", event.target.value)}>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}
          </select>
          <div className={styles.compareRevisionSelect}>
            <History size={12} />
            <select value={rightVersion?.id || rightVersionId} onChange={(event) => setRightVersionId(event.target.value)} aria-label="B dokumentum revíziója">
              {(rightDetails?.versions || []).map((version) => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
              {!rightDetails?.versions.length && rightDocument?.currentVersion && <option value={rightDocument.currentVersion.id}>{versionLabel(rightDocument.currentVersion)}</option>}
            </select>
          </div>
        </label>
      </div>

      {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}

      {!ready ? (
        <div className={styles.compareEmpty}>
          <FileSearch2 size={32} />
          <strong>Legalább két összehasonlítható dokumentumverzió szükséges.</strong>
          <span>Válassz két dokumentumot, vagy ugyanazon dokumentum két külön revízióját.</span>
        </div>
      ) : (
        <>
          <DriveVisualCompareViewer projectId={projectId} leftDocument={leftCompareDocument!} rightDocument={rightCompareDocument!} />

          <div className={styles.compareDocumentGrid}>
            {([
              ["left", leftDocument, leftDetails, leftVersion],
              ["right", rightDocument, rightDetails, rightVersion],
            ] as const).map(([side, document, details, version]) => {
              const loading = loadingSide === side || loadingSide === "both";
              return (
                <article className={styles.compareDocumentCard} key={side}>
                  <div className={styles.compareDocumentTop}>
                    <span className={styles.compareFileBadge}>{document?.extension?.toUpperCase().slice(0, 4) || "FILE"}</span>
                    <div><strong>{document?.name}</strong><span>{details?.metadata?.discipline || "Szakág nélkül"} · {selectedRevision(version)}</span></div>
                    {loading && <Loader2 size={14} className={styles.spin} />}
                  </div>
                  <div className={styles.compareQuickFacts}>
                    <span><small>Kiválasztott revízió</small><strong>{selectedRevision(version)}</strong></span>
                    <span><small>Méret</small><strong>{formatBytes(version?.sizeBytes || 0)}</strong></span>
                    <span><small>Állapot</small><strong>{version?.status || "–"}</strong></span>
                    <span><small>Verzió</small><strong>{version ? `V${version.versionNumber}` : "–"}</strong></span>
                  </div>
                  <div className={styles.compareDocumentSummary}>
                    <span><small>Dokumentum</small><strong>{document?.name || "–"}</strong></span>
                    <span><small>Szakág</small><strong>{details?.metadata?.discipline || "–"}</strong></span>
                    <span><small>Tervszám</small><strong>{details?.metadata?.planNo || "–"}</strong></span>
                  </div>
                  <button type="button" className={styles.compareDownloadButton} onClick={() => void download(side)} disabled={downloadBusy === side || version?.status !== "AVAILABLE"}>
                    {downloadBusy === side ? <Loader2 size={12} className={styles.spin} /> : <Download size={12} />} Kiválasztott verzió megnyitása
                  </button>
                </article>
              );
            })}
          </div>

          <div className={styles.compareDiffPanel}>
            <div className={styles.compareDiffHeader}>
              <div>
                <strong>Kiválasztott revízió + dokumentumszintű mérnöki metaadatok</strong>
                <span>A revízió a kiválasztott fájlverzióból jön. A többi műszaki metaadat jelenleg dokumentumszintű, nem historikus verziómetaadat.</span>
              </div>
              <button type="button" className={styles.compareSecondaryButton} onClick={() => { void loadDetails("left", leftId); void loadDetails("right", rightId); }}>
                <RotateCcw size={12} /> Frissítés
              </button>
            </div>
            <div className={styles.compareDiffTable}>
              <div className={`${styles.compareDiffRow} ${styles.compareDiffTableHead}`}><strong>Mező</strong><strong>A dokumentum</strong><strong>B dokumentum</strong></div>
              <div className={`${styles.compareDiffRow} ${revisionDifferent ? styles.compareDiffDifferent : styles.compareDiffSame}`}>
                <strong>Kiválasztott revízió</strong><span>{selectedRevision(leftVersion)}</span><span>{selectedRevision(rightVersion)}</span>
              </div>
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
