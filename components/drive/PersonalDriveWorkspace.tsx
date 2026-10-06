"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Download, FileText, HardDrive, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import HeaderLogoutIconButton from "@/components/auth/HeaderLogoutIconButton";
import DrivePremiumLoader from "./DrivePremiumLoader";
import DriveViewModeToggle from "./DriveViewModeToggle";
import type { DriveViewMode } from "./driveTypes";
import type { DriveWorkspaceOption } from "./driveWorkspaceTypes";
import styles from "./DriveWorkspace.module.css";

type PersonalDriveItem = {
  id: string;
  name: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceSystem: string;
  retainedIndependently: boolean;
  securityStatus: string;
  virusScanStatus: string;
  createdAt: string;
  updatedAt: string;
};

type ContentPayload = { ok?: boolean; error?: string; items?: PersonalDriveItem[] };

type Props = {
  workspaceName: string;
  userEmail?: string | null;
  workspaceOptions: DriveWorkspaceOption[];
  selectedWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(value: string) {
  if (value === "FIELD_CAPTURE") return "Terepi rögzítés";
  if (value === "DROP") return "DIMPRO Drop";
  if (value === "IMPORT") return "Import";
  if (value === "DRIVE") return "Drive";
  return value || "DIMPRO";
}

export default function PersonalDriveWorkspace({ workspaceName, userEmail, workspaceOptions, selectedWorkspaceId, onWorkspaceChange }: Props) {
  const [items, setItems] = useState<PersonalDriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadBusyId, setDownloadBusyId] = useState("");
  const [viewMode, setViewMode] = useState<DriveViewMode>("simple");
  const [bootLoaderVisible, setBootLoaderVisible] = useState(true);
  const [bootLoaderComplete, setBootLoaderComplete] = useState(false);
  const bootLoaderVisibleRef = useRef(true);
  const bootLoaderHoldTimerRef = useRef<number | null>(null);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/drive/personal/content", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as ContentPayload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "A Saját Drive tartalma nem tölthető be.");
      setItems(payload.items || []);
      if (bootLoaderVisibleRef.current) {
        setBootLoaderComplete(true);
        if (bootLoaderHoldTimerRef.current !== null) window.clearTimeout(bootLoaderHoldTimerRef.current);
        bootLoaderHoldTimerRef.current = window.setTimeout(() => {
          bootLoaderVisibleRef.current = false;
          setBootLoaderVisible(false);
          bootLoaderHoldTimerRef.current = null;
        }, 1800);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Saját Drive tartalma nem tölthető be.");
      if (bootLoaderVisibleRef.current) {
        bootLoaderVisibleRef.current = false;
        setBootLoaderVisible(false);
        setBootLoaderComplete(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dimpro-drive-personal-view");
      if (stored === "simple" || stored === "engineering") setViewMode(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("dimpro-drive-personal-view", viewMode); } catch {}
  }, [viewMode]);

  useEffect(() => {
    bootLoaderVisibleRef.current = true;
    setBootLoaderVisible(true);
    setBootLoaderComplete(false);
    void loadContent();
    return () => {
      if (bootLoaderHoldTimerRef.current !== null) {
        window.clearTimeout(bootLoaderHoldTimerRef.current);
        bootLoaderHoldTimerRef.current = null;
      }
    };
  }, [loadContent]);

  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0), [items]);

  const download = useCallback(async (item: PersonalDriveItem) => {
    setDownloadBusyId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(item.id)}/download`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; error?: string; download?: { url?: string } };
      if (!response.ok || !payload.ok || !payload.download?.url) throw new Error(payload.error || "A fájl nem tölthető le.");
      const link = document.createElement("a");
      link.href = payload.download.url;
      link.rel = "noopener";
      link.click();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A fájl nem tölthető le.");
    } finally {
      setDownloadBusyId("");
    }
  }, []);

  if (bootLoaderVisible) {
    return <DrivePremiumLoader complete={bootLoaderComplete} workspaceType="PERSONAL" />;
  }

  return (
    <div className={styles.personalWorkspace}>
      <header className={styles.projectHeader}>
        <div className={styles.projectIdentity}>
          <div className={styles.projectIcon}><HardDrive size={18} /></div>
          <div>
            <h1>{workspaceName}</h1>
            <div className={styles.projectMeta}>
              <span>Személyes DIMPRO tárhely</span>
              <span className={styles.activeBadge}>Aktív</span>
              <span>{items.length} fájl · {formatBytes(totalBytes)}</span>
            </div>
          </div>
        </div>
        {workspaceOptions.length > 0 && selectedWorkspaceId ? (
          <div className={styles.workspaceSelectorWrap}>
            <label className={styles.workspaceSelectorLabel} htmlFor="drive-personal-workspace-selector">Munkatér</label>
            <select
              id="drive-personal-workspace-selector"
              className={styles.workspaceSelector}
              value={selectedWorkspaceId}
              onChange={(event) => onWorkspaceChange(event.target.value)}
              aria-label="Drive munkatér kiválasztása"
            >
              {workspaceOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}{option.code ? " · " + option.code : ""}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerAction}><Bell size={14} /> Értesítések</button>
          <button type="button" className={styles.headerAction}><HelpCircle size={14} /> Súgó</button>
          <div className={styles.userPill}>
            <span className={styles.avatar}>{(userEmail || "D").trim().charAt(0).toUpperCase() || "D"}</span>
            <div><strong>{userEmail || "DIMPRO felhasználó"}</strong><span>Saját Drive tulajdonos</span></div>
          </div>
          <HeaderLogoutIconButton className={styles.headerLogout} iconSize={16} />
        </div>
      </header>

      <div className={styles.personalDriveBody}>
        <section className={styles.personalDriveIntro}>
          <div>
            <HardDrive size={22} />
            <div><strong>Saját Drive · USER_ROOT</strong><span>A személyes és a projekt Drive külön tulajdonosi tartomány. A projekt-hozzáférés megszűnése nem törli a saját példányokat.</span></div>
          </div>
          <DriveViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            allowedModes={["simple", "engineering"]}
            onRefresh={() => void loadContent()}
          />
        </section>

        <div className={styles.personalDriveNotice}>
          <ShieldCheck size={16} />
          <span>A személyes mappafa még nincs aktiválva. Ez a nézet a már eltárolt USER_ROOT tartalmakat mutatja; projekt ACL és projektfunkciók itt nem érvényesülnek.</span>
        </div>

        {error ? <div className={styles.personalDriveError}>{error}</div> : null}

        {loading ? (
          <div className={styles.personalDriveEmpty}><Loader2 className={styles.spin} size={24} /><strong>Saját Drive betöltése…</strong></div>
        ) : items.length === 0 ? (
          <div className={styles.personalDriveEmpty}>
            <HardDrive size={30} />
            <strong>A Saját Drive jelenleg üres</strong>
            <span>A Terepi Gyorsrögzítőből vagy későbbi személyes Drive feltöltésből ide mentett fájlok ebben a gyökérben jelennek meg.</span>
          </div>
        ) : (
          <>
            {viewMode === "engineering" ? (
              <div className={styles.personalEngineeringHint}>
                <strong>Mérnöki nézet</strong>
                <span>A saját tervfájlok műszaki metaadatai ugyanebben a nézetben jelennek meg. A még nem rögzített tervszám, revízió és lépték helyén „—” látható; a szerkeszthető személyes metaadatmotor a következő fejlesztési fázis.</span>
              </div>
            ) : null}
            <div className={styles.personalDriveTableWrap}>
              <table className={styles.personalDriveTable}>
                <thead>
                  {viewMode === "engineering" ? (
                    <tr><th>Tervszám</th><th>Megnevezés</th><th>Típus</th><th>Revízió</th><th>Lépték</th><th>Fájlnév</th><th>Forrás</th><th>Méret</th><th>Módosítva</th><th>Biztonság</th><th /></tr>
                  ) : (
                    <tr><th>Név</th><th>Típus</th><th>Forrás</th><th>Méret</th><th>Módosítva</th><th>Biztonság</th><th /></tr>
                  )}
                </thead>
                <tbody>
                  {items.map((item) => {
                    const clean = item.securityStatus === "clean" && item.virusScanStatus === "clean";
                    const fileType = item.mimeType || item.originalName?.split(".").pop()?.toUpperCase() || "fájl";
                    const fileName = item.originalName || item.name;
                    if (viewMode === "engineering") {
                      return (
                        <tr key={item.id}>
                          <td>—</td>
                          <td><div className={styles.personalDriveFileName}><FileText size={16} /><span><strong>{item.name}</strong><small>Saját Drive dokumentum</small></span></div></td>
                          <td>{fileType}</td>
                          <td>—</td>
                          <td>—</td>
                          <td>{fileName}</td>
                          <td>{sourceLabel(item.sourceSystem)}</td>
                          <td>{formatBytes(item.sizeBytes)}</td>
                          <td>{formatDate(item.updatedAt)}</td>
                          <td><span className={clean ? styles.personalDriveSecurityOk : styles.personalDriveSecurityWait}>{clean ? "Ellenőrzött" : "Ellenőrzés alatt"}</span></td>
                          <td><button type="button" className={styles.personalDriveDownload} disabled={!clean || downloadBusyId === item.id} onClick={() => void download(item)}>{downloadBusyId === item.id ? <Loader2 className={styles.spin} size={14} /> : <Download size={14} />} Letöltés</button></td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={item.id}>
                        <td><div className={styles.personalDriveFileName}><FileText size={16} /><span><strong>{item.name}</strong><small>{item.mimeType || item.originalName || "fájl"}</small></span></div></td>
                        <td>{fileType}</td>
                        <td>{sourceLabel(item.sourceSystem)}</td>
                        <td>{formatBytes(item.sizeBytes)}</td>
                        <td>{formatDate(item.updatedAt)}</td>
                        <td><span className={clean ? styles.personalDriveSecurityOk : styles.personalDriveSecurityWait}>{clean ? "Ellenőrzött" : "Ellenőrzés alatt"}</span></td>
                        <td><button type="button" className={styles.personalDriveDownload} disabled={!clean || downloadBusyId === item.id} onClick={() => void download(item)}>{downloadBusyId === item.id ? <Loader2 className={styles.spin} size={14} /> : <Download size={14} />} Letöltés</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
